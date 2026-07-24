import axios, { isAxiosError } from 'axios';

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ApiEnvSchemaType } from '@openathlete/shared';

import { AuthUser } from 'src/modules/auth/decorators/user.decorator';

import { PrismaService } from '../../prisma/services/prisma.service';
import { ActivityFileImportService } from './activity-file-import.service';

type GoogleTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type: 'Bearer';
};

type GoogleDriveFile = {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
  md5Checksum?: string;
};

type GoogleDriveListResponse = {
  files?: GoogleDriveFile[];
  nextPageToken?: string;
};

@Injectable()
export class GoogleDriveService {
  private readonly driveReadonlyScope =
    'https://www.googleapis.com/auth/drive.readonly';
  private readonly workoutsFolderName = 'myworkouts';

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<ApiEnvSchemaType, true>,
    private readonly activityFileImportService: ActivityFileImportService,
  ) {}

  async getOAuthUri(user: AuthUser) {
    this.getAthleteId(user);
    const config = this.getConfig();
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: this.driveReadonlyScope,
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent',
    });

    return {
      uri: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    };
  }

  async connect(user: AuthUser, code: string) {
    const athleteId = this.getAthleteId(user);
    if (!code) {
      throw new BadRequestException(
        'Google Drive authorization code is required',
      );
    }

    const tokenResponse = await this.exchangeCode(code);
    const existing = await this.prisma.googleDriveConnection.findUnique({
      where: { athleteId },
    });
    const refreshToken = tokenResponse.refresh_token ?? existing?.refreshToken;

    if (!refreshToken) {
      throw new BadRequestException(
        'Google did not return a refresh token. Reconnect Google Drive and approve offline access.',
      );
    }

    await this.prisma.googleDriveConnection.upsert({
      where: { athleteId },
      create: {
        athleteId,
        accessToken: tokenResponse.access_token,
        refreshToken,
        expiresAt: this.getExpiresAt(tokenResponse.expires_in),
        scope: tokenResponse.scope,
      },
      update: {
        accessToken: tokenResponse.access_token,
        refreshToken,
        expiresAt: this.getExpiresAt(tokenResponse.expires_in),
        scope: tokenResponse.scope,
      },
    });

    return { success: true };
  }

  async getStatus(user: AuthUser) {
    const athleteId = this.getAthleteId(user);
    const connection = await this.prisma.googleDriveConnection.findUnique({
      where: { athleteId },
      include: {
        _count: {
          select: { importedFiles: true },
        },
      },
    });

    return {
      connected: !!connection,
      folderName: this.workoutsFolderName,
      lastSyncAt: connection?.lastSyncAt ?? null,
      importedFiles: connection?._count.importedFiles ?? 0,
    };
  }

  async disconnect(user: AuthUser) {
    const athleteId = this.getAthleteId(user);
    await this.prisma.googleDriveConnection.deleteMany({
      where: { athleteId },
    });
    return { success: true };
  }

  async importNow(user: AuthUser) {
    const athleteId = this.getAthleteId(user);
    const connection = await this.prisma.googleDriveConnection.findUnique({
      where: { athleteId },
      include: { importedFiles: { select: { driveFileId: true } } },
    });

    if (!connection) {
      throw new NotFoundException('Google Drive is not connected');
    }

    const accessToken = await this.getValidAccessToken(connection);
    const alreadyImported = new Set(
      connection.importedFiles.map((file) => file.driveFileId),
    );
    const files = await this.listCandidateFiles(accessToken);

    let imported = 0;
    let skipped = 0;
    const errors: Array<{ fileId: string; name: string; message: string }> = [];

    for (const file of files) {
      if (alreadyImported.has(file.id)) {
        skipped++;
        continue;
      }

      try {
        const buffer = await this.downloadFile(accessToken, file.id);
        const event = await this.activityFileImportService.importForAthlete(
          athleteId,
          {
            buffer,
            mimetype: file.mimeType,
            originalname: file.name,
          },
        );

        await this.prisma.googleDriveImportedFile.create({
          data: {
            googleDriveConnectionId: connection.googleDriveConnectionId,
            driveFileId: file.id,
            name: file.name,
            mimeType: file.mimeType,
            modifiedTime: file.modifiedTime
              ? new Date(file.modifiedTime)
              : undefined,
            md5Checksum: file.md5Checksum,
            eventId:
              event && 'eventId' in event && typeof event.eventId === 'number'
                ? event.eventId
                : undefined,
          },
        });

        imported++;
      } catch (error) {
        errors.push({
          fileId: file.id,
          name: file.name,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await this.prisma.googleDriveConnection.update({
      where: {
        googleDriveConnectionId: connection.googleDriveConnectionId,
      },
      data: {
        lastSyncAt: new Date(),
      },
    });

    return {
      imported,
      skipped,
      totalCandidates: files.length,
      errors,
    };
  }

  private getAthleteId(user: AuthUser): number {
    const athleteId = user.athlete?.athleteId;
    if (!athleteId) {
      throw new BadRequestException('Athlete ID is required');
    }
    return athleteId;
  }

  private getConfig() {
    const clientId = this.configService.get('GOOGLE_DRIVE_CLIENT_ID');
    const clientSecret = this.configService.get('GOOGLE_DRIVE_CLIENT_SECRET');
    const redirectUri = this.configService.get('GOOGLE_DRIVE_REDIRECT_URI');

    if (!clientId || !clientSecret || !redirectUri) {
      throw new BadRequestException(
        'Google Drive OAuth is not configured. Set GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, and GOOGLE_DRIVE_REDIRECT_URI.',
      );
    }

    return { clientId, clientSecret, redirectUri };
  }

  private getExpiresAt(expiresIn?: number): Date | undefined {
    return expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined;
  }

  private async exchangeCode(code: string): Promise<GoogleTokenResponse> {
    const config = this.getConfig();
    const params = new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    });

    const { data } = await axios.post<GoogleTokenResponse>(
      'https://oauth2.googleapis.com/token',
      params,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
      },
    );

    return data;
  }

  private async refreshAccessToken(refreshToken: string) {
    const config = this.getConfig();
    const params = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    const { data } = await axios.post<GoogleTokenResponse>(
      'https://oauth2.googleapis.com/token',
      params,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
      },
    );

    return data;
  }

  private async getValidAccessToken(connection: {
    googleDriveConnectionId: number;
    accessToken: string | null;
    refreshToken: string;
    expiresAt: Date | null;
  }) {
    if (
      connection.accessToken &&
      connection.expiresAt &&
      connection.expiresAt.getTime() > Date.now() + 60_000
    ) {
      return connection.accessToken;
    }

    const tokenResponse = await this.refreshAccessToken(
      connection.refreshToken,
    );
    await this.prisma.googleDriveConnection.update({
      where: {
        googleDriveConnectionId: connection.googleDriveConnectionId,
      },
      data: {
        accessToken: tokenResponse.access_token,
        expiresAt: this.getExpiresAt(tokenResponse.expires_in),
        scope: tokenResponse.scope,
      },
    });

    return tokenResponse.access_token;
  }

  private async listCandidateFiles(accessToken: string) {
    const folderIds = await this.findWorkoutsFolderIds(accessToken);
    if (!folderIds.length) {
      throw new NotFoundException(
        `Google Drive folder "${this.workoutsFolderName}" was not found`,
      );
    }

    const files: GoogleDriveFile[] = [];
    let pageToken: string | undefined;

    do {
      const response = await axios.get<GoogleDriveListResponse>(
        'https://www.googleapis.com/drive/v3/files',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            q: this.buildFileQuery(folderIds),
            fields:
              'nextPageToken,files(id,name,mimeType,modifiedTime,md5Checksum)',
            orderBy: 'modifiedTime desc',
            pageSize: 100,
            pageToken,
          },
          timeout: 15000,
        },
      );

      files.push(...(response.data.files ?? []));
      pageToken = response.data.nextPageToken;
    } while (pageToken);

    const uniqueFiles = new Map(files.map((file) => [file.id, file]));
    return [...uniqueFiles.values()].filter((file) =>
      this.isSupportedFileName(file.name),
    );
  }

  private async findWorkoutsFolderIds(accessToken: string) {
    const folders: GoogleDriveFile[] = [];
    let pageToken: string | undefined;

    do {
      const response = await axios.get<GoogleDriveListResponse>(
        'https://www.googleapis.com/drive/v3/files',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            q: `mimeType = 'application/vnd.google-apps.folder' and name = '${this.escapeDriveQueryValue(this.workoutsFolderName)}' and trashed = false`,
            fields: 'nextPageToken,files(id,name)',
            pageSize: 100,
            pageToken,
          },
          timeout: 15000,
        },
      );

      folders.push(...(response.data.files ?? []));
      pageToken = response.data.nextPageToken;
    } while (pageToken);

    return folders.map((folder) => folder.id);
  }

  private buildFileQuery(folderIds: string[]) {
    const fileQuery =
      "(name contains '.fit' or name contains '.FIT' or name contains '.txt' or name contains '.TXT')";
    const folderQuery = folderIds
      .map((folderId) => `'${this.escapeDriveQueryValue(folderId)}' in parents`)
      .join(' or ');

    return `(${folderQuery}) and trashed = false and ${fileQuery}`;
  }

  private escapeDriveQueryValue(value: string) {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  private isSupportedFileName(name: string) {
    const lowerName = name.toLowerCase();
    return lowerName.endsWith('.fit') || lowerName.endsWith('.txt');
  }

  private async downloadFile(accessToken: string, fileId: string) {
    try {
      const response = await axios.get<ArrayBuffer>(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { alt: 'media' },
          responseType: 'arraybuffer',
          timeout: 30000,
        },
      );

      return Buffer.from(response.data);
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 403) {
        throw new Error('Google Drive refused file download');
      }
      throw error;
    }
  }
}
