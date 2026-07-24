import client, { routes } from '@/utils/axios';

import { ImportTrainingProgramDto } from '@openathlete/shared';

export interface TrainingProgramImportSummary {
  dryRun: boolean;
  sourceKey: string | null;
  schemaVersion?: string;
  programName: string;
  startDate: string;
  endDate: string;
  timezone?: string;
  trainingPlanId?: number;
  cycleCount: number;
  weekCount: number;
  sessionCount: number;
  cycles?: Array<{
    name: string;
    sourcePhase: string;
    phase: 'BASE';
    startWeek: number;
    endWeek: number;
    startDate: string;
    endDate: string;
  }>;
}

export class TrainingPlanAPI {
  static async importTrainingProgram({
    data,
    dryRun = false,
  }: {
    data: ImportTrainingProgramDto;
    dryRun?: boolean;
  }): Promise<TrainingProgramImportSummary> {
    const res = await client.post<TrainingProgramImportSummary>(
      routes.trainingPlan.import,
      data,
      {
        params: { dryRun },
      },
    );
    return res.data;
  }
}
