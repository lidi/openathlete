import { createHash } from 'node:crypto';
import { basename, extname } from 'node:path';

import { BadRequestException, Injectable } from '@nestjs/common';

import {
  ActivitySegmentType,
  EventType,
  Prisma,
  SportType,
} from '@openathlete/database';
import { ActivityStream } from '@openathlete/shared';

import { PrismaService } from '../../prisma/services/prisma.service';
import { QueueService } from '../../queue';
import { ActivityFileParserService } from '../helpers/activity-file-parser.service';
import { FitFileSegment } from '../helpers/activity-parser.interface';
import { calculateSegmentMetrics } from '../helpers/activity-segment';
import { compressActivityStream } from '../helpers/activity-stream';
import { computeRecords } from '../helpers/record';
import {
  roundCadence,
  roundDistance,
  roundElevation,
  roundEnergy,
  roundHeartrate,
  roundPower,
  roundSpeed,
} from '../helpers/round-activity-values';
import { EVENT_INCLUDES } from './event-includes';

export type ActivityFileImportInput = {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
};

@Injectable()
export class ActivityFileImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: ActivityFileParserService,
    private readonly queueService: QueueService,
  ) {}

  async importForAthlete(athleteId: number, file?: ActivityFileImportInput) {
    if (!file?.buffer) {
      throw new BadRequestException('Activity file is required');
    }

    if (!athleteId) {
      throw new BadRequestException('Athlete ID is required');
    }

    const athlete = await this.prisma.athlete.findUnique({
      where: { athleteId },
      select: { athleteId: true },
    });
    if (!athlete) {
      throw new BadRequestException('Athlete not found');
    }

    const filename = file.originalname ?? 'activity';
    const mimetype = this.resolveMimeType(file.mimetype, filename);
    const parsed = await this.parser.parse(
      this.toArrayBuffer(file.buffer),
      mimetype,
    );
    const externalId = this.buildExternalId(file.buffer);
    const existing = await this.prisma.eventActivity.findUnique({
      where: { externalId },
      select: { eventId: true },
    });

    if (existing) {
      return this.getEvent(existing.eventId);
    }

    const metrics = this.calculateActivityMetrics(parsed.stream);
    const movingTime =
      metrics.movingTime ??
      this.getDurationSeconds(parsed.stream) ??
      (parsed.startDate && parsed.endDate
        ? Math.max(
            0,
            Math.round(
              (parsed.endDate.getTime() - parsed.startDate.getTime()) / 1000,
            ),
          )
        : 0);
    const startDate = parsed.startDate ?? new Date();
    const endDate =
      parsed.endDate ?? new Date(startDate.getTime() + movingTime * 1000);
    const sport = this.inferSport(filename, mimetype);
    const isWodbanger = mimetype === 'text/plain';

    const created = await this.prisma.$transaction(async (transaction) => {
      const event = await transaction.event.create({
        data: {
          athleteId,
          name: parsed.name ?? this.getFilenameWithoutExtension(filename),
          type: EventType.ACTIVITY,
          startDate,
          endDate,
          activity: {
            create: {
              distance: metrics.distance,
              elevationGain: metrics.elevationGain,
              movingTime,
              averageSpeed:
                metrics.averageSpeed ??
                (movingTime > 0 ? metrics.distance / movingTime : 0),
              maxSpeed: metrics.maxSpeed ?? 0,
              averageCadence: metrics.averageCadence,
              averageWatts: metrics.averageWatts,
              maxWatts: metrics.maxWatts,
              weightedAverageWatts: metrics.averageWatts,
              averageHeartrate:
                parsed.averageHeartrate ?? metrics.averageHeartrate,
              maxHeartrate: parsed.maxHeartrate ?? metrics.maxHeartrate,
              kilojoules: parsed.kilojoules ?? metrics.kilojoules,
              externalId,
              sport,
              stream: compressActivityStream(parsed.stream) as object,
              description: parsed.description ?? '',
            },
          },
        },
        include: { activity: true },
      });

      if (event.activity && parsed.segments?.length) {
        const segmentData = this.buildSegmentData(
          event.activity.eventActivityId,
          parsed.segments,
          parsed.stream,
          isWodbanger ? ActivitySegmentType.MANUAL : ActivitySegmentType.LAP,
        );

        if (segmentData.length) {
          await transaction.activitySegment.createMany({ data: segmentData });
        }
      }

      return event;
    });

    if (created.activity) {
      await this.createRecords(
        created.activity.eventActivityId,
        athleteId,
        parsed.stream,
      );
      await this.queueService.addActivityProcessingJob(
        created.activity.eventActivityId,
        created.eventId,
        false,
      );
    }

    return this.getEvent(created.eventId);
  }

  private resolveMimeType(mimetype: string | undefined, filename: string) {
    const normalizedMimeType = mimetype?.toLowerCase().trim();
    const extension = extname(filename).toLowerCase();

    if (extension === '.fit') {
      return 'application/vnd.garmin.fit';
    }

    if (extension === '.gpx') {
      return 'application/gpx+xml';
    }

    if (extension === '.txt') {
      return 'text/plain';
    }

    return normalizedMimeType || 'application/octet-stream';
  }

  private toArrayBuffer(buffer: Buffer): ArrayBuffer {
    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;
  }

  private buildExternalId(buffer: Buffer) {
    return `file:${createHash('sha256').update(buffer).digest('hex')}`;
  }

  private getFilenameWithoutExtension(filename: string) {
    return basename(filename, extname(filename));
  }

  private inferSport(filename: string, mimetype: string): SportType {
    if (mimetype === 'text/plain') {
      return SportType.WEIGHT_TRAINING;
    }

    const lowerFilename = filename.toLowerCase();
    if (lowerFilename.includes('run')) {
      return SportType.RUNNING;
    }
    if (lowerFilename.includes('ruck') || lowerFilename.includes('walk')) {
      return SportType.WALK;
    }
    if (lowerFilename.includes('hike')) {
      return SportType.HIKING;
    }
    if (lowerFilename.includes('ride') || lowerFilename.includes('bike')) {
      return SportType.CYCLING;
    }

    return SportType.OTHER;
  }

  private getDurationSeconds(stream: ActivityStream): number | undefined {
    const lastTime = stream.time?.at(-1);
    return lastTime !== undefined ? Math.round(lastTime) : undefined;
  }

  private calculateActivityMetrics(stream: ActivityStream) {
    const distance = roundDistance(stream.distance?.at(-1) ?? 0);
    const movingTime = this.getDurationSeconds(stream);
    const elevationGain = roundElevation(
      this.sumPositiveDeltas(stream.altitude),
    );
    const speeds = this.calculateSpeeds(stream);

    return {
      distance,
      elevationGain,
      movingTime,
      averageSpeed:
        movingTime && movingTime > 0
          ? (roundSpeed(distance / movingTime) ?? 0)
          : undefined,
      maxSpeed: speeds.length
        ? (roundSpeed(Math.max(...speeds)) ?? 0)
        : undefined,
      averageCadence: this.average(stream.cadence, roundCadence),
      averageWatts: this.average(stream.watts, roundPower),
      maxWatts: stream.watts?.length
        ? (roundPower(Math.max(...stream.watts)) ?? undefined)
        : undefined,
      averageHeartrate: this.average(stream.heartrate, roundHeartrate),
      maxHeartrate: stream.heartrate?.length
        ? (roundHeartrate(Math.max(...stream.heartrate)) ?? undefined)
        : undefined,
      kilojoules: stream.watts?.length
        ? roundEnergy(this.calculateKilojoules(stream))
        : undefined,
    };
  }

  private sumPositiveDeltas(values?: number[]): number {
    if (!values?.length) {
      return 0;
    }

    let sum = 0;
    for (let index = 1; index < values.length; index++) {
      const delta = values[index] - values[index - 1];
      if (delta > 0) {
        sum += delta;
      }
    }
    return sum;
  }

  private calculateSpeeds(stream: ActivityStream): number[] {
    const { distance, time } = stream;
    if (!distance?.length || !time?.length) {
      return [];
    }

    const speeds: number[] = [];
    const length = Math.min(distance.length, time.length);
    for (let index = 1; index < length; index++) {
      const deltaTime = time[index] - time[index - 1];
      const deltaDistance = distance[index] - distance[index - 1];
      if (deltaTime > 0 && deltaDistance >= 0) {
        speeds.push(deltaDistance / deltaTime);
      }
    }
    return speeds;
  }

  private average(
    values: number[] | undefined,
    roundValue: (value: number | null | undefined) => number | null | undefined,
  ) {
    if (!values?.length) {
      return undefined;
    }

    const sum = values.reduce((total, value) => total + value, 0);
    return roundValue(sum / values.length) ?? undefined;
  }

  private calculateKilojoules(stream: ActivityStream): number {
    const { time, watts } = stream;
    if (!time?.length || !watts?.length) {
      return 0;
    }

    let joules = 0;
    const length = Math.min(time.length, watts.length);
    for (let index = 1; index < length; index++) {
      const deltaTime = time[index] - time[index - 1];
      if (deltaTime > 0) {
        joules += watts[index - 1] * deltaTime;
      }
    }
    return joules / 1000;
  }

  private buildSegmentData(
    eventActivityId: number,
    segments: FitFileSegment[],
    stream: ActivityStream,
    segmentType: ActivitySegmentType,
  ): Prisma.ActivitySegmentCreateManyInput[] {
    return segments
      .filter((segment) => segment.endTimeSeconds > segment.startTimeSeconds)
      .map((segment, index) => {
        const metrics = calculateSegmentMetrics(
          stream,
          segment.startTimeSeconds,
          segment.endTimeSeconds,
        );

        return {
          eventActivityId,
          segmentType,
          name: segment.name ?? `Segment ${index + 1}`,
          orderIndex: segment.orderIndex ?? index,
          startTimeSeconds: Math.round(segment.startTimeSeconds),
          endTimeSeconds: Math.round(segment.endTimeSeconds),
          distance: metrics.distance,
          elevationGain: metrics.elevation_gain,
          movingTime:
            metrics.moving_time ??
            Math.round(segment.endTimeSeconds - segment.startTimeSeconds),
          averageSpeed: metrics.average_speed,
          maxSpeed: metrics.max_speed,
          averageCadence: metrics.average_cadence,
          averageWatts: metrics.average_watts,
          maxWatts: metrics.max_watts,
          weightedAverageWatts: metrics.weighted_average_watts,
          averageHeartrate:
            segment.averageHeartrate ?? metrics.average_heartrate,
          maxHeartrate: segment.maxHeartrate ?? metrics.max_heartrate,
          kilojoules: metrics.kilojoules,
          averageGapSpeed: metrics.average_gap_speed,
          averageNormalizedSpeed: metrics.average_normalized_speed,
        };
      });
  }

  private async createRecords(
    eventActivityId: number,
    athleteId: number,
    stream: ActivityStream,
  ) {
    const records = computeRecords(stream);
    if (!records.length) {
      return;
    }

    await this.prisma.record.createMany({
      data: records.map((record) => ({
        ...record,
        eventActivityId,
        athleteId,
        date: new Date(),
      })),
      skipDuplicates: true,
    });
  }

  private async getEvent(eventId: number) {
    return this.prisma.event.findUnique({
      where: { eventId },
      include: EVENT_INCLUDES,
    });
  }
}
