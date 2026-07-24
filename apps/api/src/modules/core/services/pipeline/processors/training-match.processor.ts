import { Injectable, Logger } from '@nestjs/common';

import { SportType } from '@openathlete/database';

import { PrismaService } from 'src/modules/prisma/services/prisma.service';

import {
  TrainingMatchActivity,
  TrainingMatchCandidate,
  chooseTrainingCandidate,
  getCompatibleSports,
  isSameLocalDate,
} from '../training-match.helpers';
import { ActivityPipelineContext, ActivityProcessor } from '../types';

@Injectable()
export class TrainingMatchProcessor implements ActivityProcessor {
  name = 'training-match';
  private readonly logger = new Logger(TrainingMatchProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  async run(ctx: ActivityPipelineContext) {
    await this.matchActivity(ctx.eventActivityId);
  }

  async matchActivity(
    eventActivityId: number,
    options: { dryRun?: boolean } = {},
  ): Promise<'matched' | 'ambiguous' | 'no_candidate' | 'already_linked'> {
    const activity = await this.prisma.eventActivity.findUnique({
      where: { eventActivityId },
      include: {
        event: {
          select: {
            eventId: true,
            startDate: true,
            athleteId: true,
          },
        },
        relatedTraining: {
          select: { eventTrainingId: true },
        },
      },
    });

    if (!activity?.event?.athleteId) return 'no_candidate';
    if (activity.relatedTraining) return 'already_linked';

    const activityInput: TrainingMatchActivity = {
      sport: activity.sport,
      distance: activity.distance,
      movingTime: activity.movingTime,
      startDate: activity.event.startDate,
    };
    const rangeStart = new Date(activity.event.startDate);
    rangeStart.setUTCDate(rangeStart.getUTCDate() - 2);
    const rangeEnd = new Date(activity.event.startDate);
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 2);

    const trainingSessions = await this.prisma.eventTraining.findMany({
      where: {
        sport: { in: getCompatibleSports(activity.sport) as SportType[] },
        relatedActivityId: null,
        event: {
          athleteId: activity.event.athleteId,
          startDate: { gte: rangeStart, lte: rangeEnd },
        },
      },
      include: {
        event: {
          select: {
            eventId: true,
            startDate: true,
            name: true,
            trainingWeek: {
              select: {
                cycle: {
                  select: {
                    trainingPlan: { select: { timezone: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    const candidates: TrainingMatchCandidate[] = trainingSessions
      .map((training) => ({
        eventTrainingId: training.eventTrainingId,
        sport: training.sport,
        goalDistance: training.goalDistance,
        goalDuration: training.goalDuration,
        startDate: training.event.startDate,
        timezone:
          training.event.trainingWeek?.cycle.trainingPlan?.timezone ?? 'UTC',
      }))
      .filter((candidate) => isSameLocalDate(activityInput, candidate));

    const match = chooseTrainingCandidate(activityInput, candidates);
    if (!match) {
      return candidates.length > 1 ? 'ambiguous' : 'no_candidate';
    }

    if (options.dryRun) return 'matched';

    const updated = await this.prisma.eventTraining.updateMany({
      where: {
        eventTrainingId: match.candidate.eventTrainingId,
        relatedActivityId: null,
      },
      data: { relatedActivityId: eventActivityId },
    });

    if (updated.count === 1) {
      this.logger.log(
        `Activity ${eventActivityId} linked to training ${match.candidate.eventTrainingId}`,
      );
      return 'matched';
    }

    return 'already_linked';
  }

  async backfill(
    athleteId: number,
    options: { dryRun?: boolean } = {},
  ): Promise<
    Record<'matched' | 'ambiguous' | 'no_candidate' | 'already_linked', number>
  > {
    const activities = await this.prisma.eventActivity.findMany({
      where: { event: { athleteId } },
      select: { eventActivityId: true },
      orderBy: { eventActivityId: 'asc' },
    });
    const result = {
      matched: 0,
      ambiguous: 0,
      no_candidate: 0,
      already_linked: 0,
    } as Record<
      'matched' | 'ambiguous' | 'no_candidate' | 'already_linked',
      number
    >;

    for (const activity of activities) {
      const outcome = await this.matchActivity(
        activity.eventActivityId,
        options,
      );
      result[outcome] += 1;
    }

    return result;
  }
}
