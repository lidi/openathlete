import {
  useDisconnectGoogleDriveMutation,
  useGetGoogleDriveOAuthUriMutation,
  useGetGoogleDriveStatusQuery,
  useGoogleDriveImportNowMutation,
} from '@/api/google-drive';
import { GoogleIcon } from '@/components/icons/google';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { openOAuthUrl } from '@/utils/oauth';
import { CheckCircle2, Download, Link2, Link2Off } from 'lucide-react';
import { toast } from 'sonner';

import { SettingsSection } from './settings-section';

export function ConnectorsTab() {
  const { data: googleDriveStatus } = useGetGoogleDriveStatusQuery();

  const getGoogleDriveOAuthUriMutation = useGetGoogleDriveOAuthUriMutation({
    onSuccess: async (response) => {
      await openOAuthUrl(response.uri);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to connect Google Drive');
    },
  });

  const googleDriveImportNowMutation = useGoogleDriveImportNowMutation({
    onSuccess: (result) => {
      toast.success(
        `Google Drive import complete: ${result.imported} imported, ${result.skipped} skipped`,
      );
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to import from Google Drive');
    },
  });

  const disconnectGoogleDriveMutation = useDisconnectGoogleDriveMutation({
    onSuccess: () => {
      toast.success('Google Drive disconnected');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to disconnect Google Drive');
    },
  });

  return (
    <div className="space-y-6">
      <SettingsSection
        title="Google Drive transport"
        description="Pull WorkOutDoors FIT and WODBanger TXT files from Google Drive."
      >
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center">
                  <GoogleIcon className="h-7 w-7" />
                </div>
                <div>
                  <CardTitle className="text-base">Google Drive</CardTitle>
                  <CardDescription>
                    {googleDriveStatus?.connected
                      ? 'Connected as file transport'
                      : 'Not connected'}
                  </CardDescription>
                </div>
              </div>
              {googleDriveStatus?.connected && (
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="text-sm font-medium">Connected</span>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>
                  Google Drive is only used to download `.fit` and `.txt` files
                  from the `myworkouts` folder.
                </p>
                <p>Folder: {googleDriveStatus?.folderName ?? 'myworkouts'}</p>
                {googleDriveStatus?.lastSyncAt && (
                  <p>
                    Last import:{' '}
                    {new Date(googleDriveStatus.lastSyncAt).toLocaleString()}
                  </p>
                )}
                {googleDriveStatus?.connected && (
                  <p>Imported files: {googleDriveStatus.importedFiles}</p>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                {googleDriveStatus?.connected ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      isLoading={googleDriveImportNowMutation.isPending}
                      onClick={() => googleDriveImportNowMutation.mutate()}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Import now
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      isLoading={disconnectGoogleDriveMutation.isPending}
                      onClick={() => disconnectGoogleDriveMutation.mutate()}
                    >
                      <Link2Off className="mr-2 h-4 w-4" />
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    isLoading={getGoogleDriveOAuthUriMutation.isPending}
                    onClick={() => getGoogleDriveOAuthUriMutation.mutate()}
                  >
                    <Link2 className="mr-2 h-4 w-4" />
                    Connect Google Drive
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </SettingsSection>
    </div>
  );
}
