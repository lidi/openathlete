import { ActivityStream } from '@openathlete/shared';

import {
  ActivityParseResult,
  ActivityParser,
  FitFileSegment,
} from '../activity-parser.interface';

type WodEntry = {
  name: string;
  durationSeconds: number;
  heartrate?: number;
};

export class WodbangerTxtParserStrategy implements ActivityParser {
  private readonly supportedMimeTypes = ['text/plain'];

  canHandle(mimetype: string): boolean {
    const normalizedMimeType = mimetype.toLowerCase().trim();
    return this.supportedMimeTypes.some((type) =>
      normalizedMimeType.includes(type),
    );
  }

  async parse(fileBuffer: ArrayBuffer): Promise<ActivityParseResult> {
    const text = Buffer.from(fileBuffer).toString('utf-8');
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const name = lines[0] ?? 'WODBanger workout';
    const mode = lines[1];
    const startDate = this.parseDate(this.findValue(lines, 'Time'));
    const durationSeconds =
      this.parseDuration(this.findValue(lines, 'Duration')) ?? 0;
    const averageHeartrate = this.parseBpm(
      this.findValue(lines, 'Average heart rate'),
    );
    const maxHeartrate = this.parseBpm(this.findValue(lines, 'Max heart rate'));
    const energyKcal = this.parseNumber(this.findValue(lines, 'Energy'));
    const roundsCompleted = this.findValue(lines, 'Rounds completed');
    const entries = this.parseRoundDetails(lines);
    const stream = this.buildStream(entries, durationSeconds, averageHeartrate);
    const segments = this.buildSegments(entries);

    return {
      stream,
      segments,
      startDate,
      endDate:
        startDate && durationSeconds > 0
          ? new Date(startDate.getTime() + durationSeconds * 1000)
          : undefined,
      name,
      description: [
        'Imported from WODBanger',
        mode,
        roundsCompleted ? `Rounds completed: ${roundsCompleted}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      averageHeartrate,
      maxHeartrate,
      kilojoules:
        energyKcal !== undefined
          ? Math.round(energyKcal * 4.184 * 10) / 10
          : undefined,
    };
  }

  private findValue(lines: string[], label: string): string | undefined {
    const prefix = `${label}:`;
    const line = lines.find((item) => item.startsWith(prefix));
    return line?.slice(prefix.length).trim();
  }

  private parseDate(value?: string): Date | undefined {
    if (!value) {
      return undefined;
    }

    const match = value.match(
      /^(\d{1,2})\.(\d{1,2})\.(\d{2,4}),\s*(\d{1,2}):(\d{2})$/,
    );
    if (!match) {
      return undefined;
    }

    const [, day, month, year, hour, minute] = match;
    const numericYear = Number(year);
    const fullYear = numericYear < 100 ? 2000 + numericYear : numericYear;
    return new Date(
      fullYear,
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    );
  }

  private parseDuration(value?: string): number | undefined {
    if (!value) {
      return undefined;
    }

    const parts = value.split(':').map((part) => Number(part));
    if (parts.some((part) => !Number.isFinite(part))) {
      return undefined;
    }

    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }

    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }

    return undefined;
  }

  private parseBpm(value?: string): number | undefined {
    if (!value) {
      return undefined;
    }

    return this.parseNumber(value);
  }

  private parseNumber(value?: string): number | undefined {
    if (!value) {
      return undefined;
    }

    const match = value.match(/-?\d+(?:\.\d+)?/);
    if (!match) {
      return undefined;
    }

    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private parseRoundDetails(lines: string[]): WodEntry[] {
    const startIndex = lines.findIndex((line) => line === 'Round details:');
    if (startIndex === -1) {
      return [];
    }

    const entries: WodEntry[] = [];
    const entryPattern = /^(.+):\s*(\d{1,2}:\d{2}(?::\d{2})?),\s*(\d+)\s*bpm$/i;

    for (const line of lines.slice(startIndex + 1)) {
      if (/^Round\s+\d+:/i.test(line)) {
        continue;
      }

      const match = line.match(entryPattern);
      if (!match) {
        continue;
      }

      const [, name, duration, heartrate] = match;
      const durationSeconds = this.parseDuration(duration);
      if (!durationSeconds) {
        continue;
      }

      entries.push({
        name,
        durationSeconds,
        heartrate: Number(heartrate),
      });
    }

    return entries;
  }

  private buildStream(
    entries: WodEntry[],
    durationSeconds: number,
    averageHeartrate?: number,
  ): ActivityStream {
    if (!entries.length) {
      return durationSeconds > 0
        ? {
            time: [0, durationSeconds],
            heartrate:
              averageHeartrate !== undefined
                ? [averageHeartrate, averageHeartrate]
                : undefined,
          }
        : {};
    }

    const time = [0];
    const heartrate: number[] = [];
    let elapsedSeconds = 0;

    if (entries[0].heartrate !== undefined) {
      heartrate.push(entries[0].heartrate);
    }

    for (const entry of entries) {
      elapsedSeconds += entry.durationSeconds;
      time.push(elapsedSeconds);
      if (entry.heartrate !== undefined) {
        heartrate.push(entry.heartrate);
      }
    }

    return {
      time,
      ...(heartrate.length === time.length ? { heartrate } : {}),
    };
  }

  private buildSegments(entries: WodEntry[]): FitFileSegment[] {
    let elapsedSeconds = 0;

    return entries.map((entry, index) => {
      const startTimeSeconds = elapsedSeconds;
      elapsedSeconds += entry.durationSeconds;

      return {
        startTimeSeconds,
        endTimeSeconds: elapsedSeconds,
        orderIndex: index,
        name: entry.name,
        averageHeartrate: entry.heartrate,
        maxHeartrate: entry.heartrate,
      };
    });
  }
}
