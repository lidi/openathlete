import { z } from 'zod';

import { SPORT_TYPE } from '../../misc';

export const trainingProgramSessionDaySchema = z.enum([
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
]);

export const trainingProgramSessionSchema = z
  .object({
    day: trainingProgramSessionDaySchema,
    type: z.string().min(1),
    title: z.string().min(1),
    description: z.string(),
    sport: z.nativeEnum(SPORT_TYPE),
    durationMinutes: z.number().positive(),
    distanceMeters: z.number().positive().optional(),
    intensity: z.string().min(1),
    template: z.string().min(1).optional(),
  })
  .strict();

export const trainingProgramWeekSchema = z
  .object({
    weekNumber: z.number().int().min(1),
    phase: z.string().min(1),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    cutbackWeek: z.boolean(),
    benchmarkWeek: z.boolean(),
    rules: z.record(z.string()).optional(),
    sessions: z.array(trainingProgramSessionSchema),
  })
  .strict();

export const trainingProgramOnDemandTemplateSchema = z
  .object({
    type: z.string().min(1),
    sport: z.nativeEnum(SPORT_TYPE),
    durationMinutes: z.number().positive(),
    description: z.string(),
  })
  .strict();

export const trainingProgramSchema = z
  .object({
    sourceKey: z.string().min(1).optional(),
    name: z.string().min(1),
    description: z.string(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timezone: z.string().min(1),
    summary: z.record(z.unknown()).optional(),
    globalRules: z.array(z.string()).default([]),
    onDemandTemplates: z
      .array(trainingProgramOnDemandTemplateSchema)
      .default([]),
    weeks: z.array(trainingProgramWeekSchema).min(1),
  })
  .strict();

export const importTrainingProgramDtoSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    program: trainingProgramSchema,
  })
  .strict();

export type TrainingProgramSessionDay = z.infer<
  typeof trainingProgramSessionDaySchema
>;
export type TrainingProgramSession = z.infer<
  typeof trainingProgramSessionSchema
>;
export type TrainingProgramWeek = z.infer<typeof trainingProgramWeekSchema>;
export type ImportTrainingProgramDto = z.infer<
  typeof importTrainingProgramDtoSchema
>;
