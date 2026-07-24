import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtUser, UserTypeGuard } from 'src/modules/auth';
import { AuthUser } from 'src/modules/auth/decorators/user.decorator';

import { GoogleDriveService } from '../services/google-drive.service';

@ApiTags('Google Drive')
@Controller('google-drive')
@UseGuards(AuthGuard('jwt'), UserTypeGuard)
@ApiBearerAuth()
export class GoogleDriveController {
  constructor(private readonly googleDriveService: GoogleDriveService) {}

  @Get('uri')
  @ApiOperation({ summary: 'Get Google Drive OAuth URL' })
  getOAuthUri(@JwtUser() user: AuthUser) {
    return this.googleDriveService.getOAuthUri(user);
  }

  @Post('token')
  @ApiOperation({ summary: 'Connect Google Drive using an OAuth code' })
  connect(@JwtUser() user: AuthUser, @Body() body: { code?: string }) {
    return this.googleDriveService.connect(user, body.code ?? '');
  }

  @Get('status')
  @ApiOperation({ summary: 'Get Google Drive connection status' })
  getStatus(@JwtUser() user: AuthUser) {
    return this.googleDriveService.getStatus(user);
  }

  @Post('import-now')
  @ApiOperation({
    summary: 'Import supported activity files from Google Drive',
  })
  importNow(@JwtUser() user: AuthUser) {
    return this.googleDriveService.importNow(user);
  }

  @Post('disconnect')
  @ApiOperation({ summary: 'Disconnect Google Drive transport' })
  disconnect(@JwtUser() user: AuthUser) {
    return this.googleDriveService.disconnect(user);
  }
}
