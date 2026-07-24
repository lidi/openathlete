import { Controller, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { JwtUser } from '../../auth/decorators';
import { AuthUser } from '../../auth/decorators/user.decorator';
import { UserTypeGuard } from '../../auth/guards/user-type.guard';
import { TrainingMatchProcessor } from '../services/pipeline/processors/training-match.processor';

@Controller('training-matching')
@UseGuards(AuthGuard('jwt'), UserTypeGuard)
export class TrainingMatchingController {
  constructor(private readonly matcher: TrainingMatchProcessor) {}

  @Post('backfill')
  async backfill(@JwtUser() user: AuthUser, @Query('dryRun') dryRun?: string) {
    const athleteId = user.athlete?.athleteId;
    if (!athleteId) {
      return { matched: 0, ambiguous: 0, no_candidate: 0, already_linked: 0 };
    }

    return this.matcher.backfill(athleteId, { dryRun: dryRun === 'true' });
  }
}
