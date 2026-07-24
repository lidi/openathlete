export type TrainingMatchActivity = {
  sport: string;
  distance: number;
  movingTime: number;
  startDate: Date;
};

export type TrainingMatchCandidate = {
  eventTrainingId: number;
  sport: string;
  goalDistance: number | null;
  goalDuration: number | null;
  startDate: Date;
  timezone: string;
};

export type RankedTrainingCandidate = {
  candidate: TrainingMatchCandidate;
  score: number;
};

export const MATCH_AMBIGUITY_THRESHOLD = 0.1;

const COMPATIBLE_SPORT_GROUPS = [
  ['STRENGTH', 'WEIGHT_TRAINING'],
  ['HIKING', 'WALK'],
];

export function getCompatibleSports(sport: string): string[] {
  return (
    COMPATIBLE_SPORT_GROUPS.find((group) => group.includes(sport)) ?? [sport]
  );
}

export function localDateKey(date: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const values = Object.fromEntries(
      parts
        .filter(({ type }) => type !== 'literal')
        .map(({ type, value }) => [type, value]),
    );
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return localDateKey(date, 'UTC');
  }
}

export function isSameLocalDate(
  activity: TrainingMatchActivity,
  candidate: TrainingMatchCandidate,
): boolean {
  return (
    localDateKey(activity.startDate, candidate.timezone) ===
    localDateKey(candidate.startDate, candidate.timezone)
  );
}

function closeness(actual: number, planned: number | null): number | null {
  if (!planned || planned <= 0 || !actual || actual <= 0) return null;
  return Math.max(
    0,
    1 - Math.abs(actual - planned) / Math.max(actual, planned),
  );
}

function timeCloseness(activity: Date, planned: Date): number | null {
  const plannedMinutes = planned.getUTCHours() * 60 + planned.getUTCMinutes();
  if (plannedMinutes === 0) return null;
  const actualMinutes = activity.getUTCHours() * 60 + activity.getUTCMinutes();
  return Math.max(
    0,
    1 - Math.min(Math.abs(actualMinutes - plannedMinutes), 720) / 720,
  );
}

export function scoreCandidate(
  activity: TrainingMatchActivity,
  candidate: TrainingMatchCandidate,
): number {
  const values: Array<{ value: number; weight: number }> = [];
  const duration = closeness(activity.movingTime, candidate.goalDuration);
  const distance = closeness(activity.distance, candidate.goalDistance);
  const startTime = timeCloseness(activity.startDate, candidate.startDate);

  if (duration !== null) values.push({ value: duration, weight: 60 });
  if (distance !== null) values.push({ value: distance, weight: 30 });
  if (startTime !== null) values.push({ value: startTime, weight: 10 });

  if (values.length === 0) return 0;
  const totalWeight = values.reduce((total, item) => total + item.weight, 0);
  return (
    values.reduce((total, item) => total + item.value * item.weight, 0) /
    totalWeight
  );
}

export function chooseTrainingCandidate(
  activity: TrainingMatchActivity,
  candidates: TrainingMatchCandidate[],
): RankedTrainingCandidate | null {
  const compatibleCandidates = candidates.filter((candidate) =>
    getCompatibleSports(activity.sport).includes(candidate.sport),
  );
  if (compatibleCandidates.length === 0) return null;
  if (compatibleCandidates.length === 1) {
    return {
      candidate: compatibleCandidates[0],
      score: scoreCandidate(activity, compatibleCandidates[0]),
    };
  }

  const ranked = compatibleCandidates
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(activity, candidate),
    }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  const second = ranked[1];

  if (!best || !second) return best ?? null;
  return best.score - second.score >= MATCH_AMBIGUITY_THRESHOLD ? best : null;
}
