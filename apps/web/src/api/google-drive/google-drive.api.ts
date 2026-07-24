import client, { routes } from '@/utils/axios';

export interface GoogleDriveStatus {
  connected: boolean;
  folderName: string;
  lastSyncAt?: string | null;
  importedFiles: number;
}

export interface GoogleDriveImportResult {
  imported: number;
  skipped: number;
  totalCandidates: number;
  errors: Array<{ fileId: string; name: string; message: string }>;
}

export class GoogleDriveAPI {
  static async getOAuthUri(): Promise<{ uri: string }> {
    const res = await client.get(routes.googleDrive.getOAuthUri);
    return res.data;
  }

  static async setOAuthToken(code: string): Promise<{ success: boolean }> {
    const res = await client.post(routes.googleDrive.setOAuthToken, { code });
    return res.data;
  }

  static async getStatus(): Promise<GoogleDriveStatus> {
    const res = await client.get(routes.googleDrive.getStatus);
    return res.data;
  }

  static async importNow(): Promise<GoogleDriveImportResult> {
    const res = await client.post(routes.googleDrive.importNow);
    return res.data;
  }

  static async disconnect(): Promise<{ success: boolean }> {
    const res = await client.post(routes.googleDrive.disconnect);
    return res.data;
  }
}
