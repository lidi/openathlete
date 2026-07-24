import {
  MutationOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { GoogleDriveAPI } from './google-drive.api';
import { googleDriveKeys } from './google-drive.keys';

export const useGetGoogleDriveStatusQuery = () => {
  return useQuery({
    queryKey: [googleDriveKeys.status],
    queryFn: GoogleDriveAPI.getStatus,
  });
};

export const useGetGoogleDriveOAuthUriMutation = (
  opt?: MutationOptions<
    Awaited<ReturnType<typeof GoogleDriveAPI.getOAuthUri>>,
    Error,
    void
  >,
) => {
  return useMutation({
    ...opt,
    mutationFn: GoogleDriveAPI.getOAuthUri,
  });
};

export const useSetGoogleDriveOAuthTokenMutation = (
  opt?: MutationOptions<
    Awaited<ReturnType<typeof GoogleDriveAPI.setOAuthToken>>,
    Error,
    string
  >,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    ...opt,
    mutationFn: GoogleDriveAPI.setOAuthToken,
    onSuccess: (data, variables, onMutateResult, context) => {
      opt?.onSuccess?.(data, variables, onMutateResult, context);
      queryClient.invalidateQueries({ queryKey: [googleDriveKeys.status] });
    },
  });
};

export const useGoogleDriveImportNowMutation = (
  opt?: MutationOptions<
    Awaited<ReturnType<typeof GoogleDriveAPI.importNow>>,
    Error,
    void
  >,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    ...opt,
    mutationFn: GoogleDriveAPI.importNow,
    onSuccess: (data, variables, onMutateResult, context) => {
      opt?.onSuccess?.(data, variables, onMutateResult, context);
      queryClient.invalidateQueries({ queryKey: [googleDriveKeys.status] });
    },
  });
};

export const useDisconnectGoogleDriveMutation = (
  opt?: MutationOptions<
    Awaited<ReturnType<typeof GoogleDriveAPI.disconnect>>,
    Error,
    void
  >,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    ...opt,
    mutationFn: GoogleDriveAPI.disconnect,
    onSuccess: (data, variables, onMutateResult, context) => {
      opt?.onSuccess?.(data, variables, onMutateResult, context);
      queryClient.invalidateQueries({ queryKey: [googleDriveKeys.status] });
    },
  });
};
