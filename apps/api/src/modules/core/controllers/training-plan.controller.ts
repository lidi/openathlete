import { ZodValidationPipe } from 'nestjs-zod';

import { Body, Controller, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import {
  ImportTrainingProgramDto,
  importTrainingProgramDtoSchema,
} from '@openathlete/shared';

import { JwtUser, UserTypeGuard } from 'src/modules/auth';
import { AuthUser } from 'src/modules/auth/decorators/user.decorator';

import { TrainingPlanService } from '../services/training-plan.service';

@ApiTags('Training Plan')
@Controller('training-plan')
@UseGuards(AuthGuard('jwt'), UserTypeGuard)
@ApiBearerAuth()
export class TrainingPlanController {
  constructor(private readonly trainingPlanService: TrainingPlanService) {}

  @Post('import')
  @ApiOperation({
    summary: 'Import a planned training program',
    description:
      'Imports a versioned training-plan JSON file as planned training events. The importer creates TrainingPlan, BASE cycles, TrainingWeeks, and EventTraining records only.',
  })
  @ApiQuery({
    name: 'dryRun',
    required: false,
    type: Boolean,
    description: 'Validate and summarize without writing records.',
  })
  importTrainingProgram(
    @JwtUser() user: AuthUser,
    @Body(new ZodValidationPipe(importTrainingProgramDtoSchema))
    body: ImportTrainingProgramDto,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.trainingPlanService.importTrainingProgram(user, body, {
      dryRun: dryRun === 'true',
    });
  }
}
