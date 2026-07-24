import {
  TrainingMatchActivity,
  TrainingMatchCandidate,
  chooseTrainingCandidate,
  isSameLocalDate,
} from './training-match.helpers';

const activity = (
  overrides: Partial<TrainingMatchActivity> = {},
): TrainingMatchActivity => ({
  sport: 'RUNNING',
  distance: 10_000,
  movingTime: 3_600,
  startDate: new Date('2026-07-20T06:30:00.000Z'),
  ...overrides,
});

const candidate = (
  overrides: Partial<TrainingMatchCandidate> = {},
): TrainingMatchCandidate => ({
  eventTrainingId: 1,
  sport: 'RUNNING',
  goalDistance: 10_000,
  goalDuration: 3_600,
  startDate: new Date('2026-07-20T07:00:00.000Z'),
  timezone: 'UTC',
  ...overrides,
});

describe('training matching', () => {
  it('matches one running plan and workout on the same day', () => {
    expect(
      chooseTrainingCandidate(activity(), [candidate()])?.candidate
        .eventTrainingId,
    ).toBe(1);
  });

  it('matches strength despite different titles because sport is the compatibility key', () => {
    expect(
      chooseTrainingCandidate(
        activity({ sport: 'WEIGHT_TRAINING', distance: 0, movingTime: 1_800 }),
        [
          candidate({
            sport: 'STRENGTH',
            goalDistance: null,
            goalDuration: 1_800,
          }),
        ],
      )?.candidate.eventTrainingId,
    ).toBe(1);
  });

  it('does not match different sports', () => {
    expect(
      chooseTrainingCandidate(activity(), [candidate({ sport: 'HIKING' })]),
    ).toBeNull();
  });

  it('excludes already-completed sessions before choosing a candidate', () => {
    const candidates = [candidate({ eventTrainingId: 2 })];
    expect(
      chooseTrainingCandidate(activity(), candidates)?.candidate
        .eventTrainingId,
    ).toBe(2);
  });

  it('selects a clearly closer duration', () => {
    expect(
      chooseTrainingCandidate(activity(), [
        candidate({ eventTrainingId: 2, goalDuration: 7_200 }),
        candidate({ eventTrainingId: 3, goalDuration: 3_600 }),
      ])?.candidate.eventTrainingId,
    ).toBe(3);
  });

  it('leaves close candidates ambiguous', () => {
    expect(
      chooseTrainingCandidate(activity(), [
        candidate({ eventTrainingId: 2, goalDuration: 3_500 }),
        candidate({ eventTrainingId: 3, goalDuration: 3_700 }),
      ]),
    ).toBeNull();
  });

  it('compares dates in the plan timezone', () => {
    const planned = candidate({
      timezone: 'Europe/Berlin',
      startDate: new Date('2026-07-20T07:00:00.000Z'),
    });
    expect(
      isSameLocalDate(
        activity({ startDate: new Date('2026-07-19T22:30:00.000Z') }),
        planned,
      ),
    ).toBe(true);
    expect(
      isSameLocalDate(
        activity({ startDate: new Date('2026-07-19T20:30:00.000Z') }),
        planned,
      ),
    ).toBe(false);
  });
});
