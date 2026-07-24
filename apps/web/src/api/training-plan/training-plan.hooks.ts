import { cycleKeys } from '@/api/cycle/cycle.keys';
import { eventKeys } from '@/api/event/event.keys';
import {
  MutationOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

import { ImportTrainingProgramDto } from '@openathlete/shared';

import {
  TrainingPlanAPI,
  TrainingProgramImportSummary,
} from './training-plan.api';
import { trainingPlanKeys } from './training-plan.keys';

export function useImportTrainingProgramMutation(
  options?: MutationOptions<
    TrainingProgramImportSummary,
    Error,
    { data: ImportTrainingProgramDto; dryRun?: boolean },
    unknown
  >,
) {
  const queryClient = useQueryClient();

  return useMutation({
    ...options,
    mutationKey: [trainingPlanKeys.import],
    mutationFn: TrainingPlanAPI.importTrainingProgram,
    onSuccess: (data, variables, onMutateResult, context) => {
      if (!variables.dryRun) {
        queryClient.invalidateQueries({ queryKey: [cycleKeys.getMyCycles] });
        queryClient.invalidateQueries({ queryKey: [eventKeys.getMyEvents] });
      }
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
  });
}
