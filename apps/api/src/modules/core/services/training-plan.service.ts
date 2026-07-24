import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

import { CyclePhase, EventType, PlanStatus } from '@openathlete/database';
import {
  EVENT_TYPE,
  ImportTrainingProgramDto,
  SEOPlanData,
  TrainingProgramSessionDay,
  WorkoutStepDto,
  createWorkoutSchema,
  mapWorkoutDtoToPrisma,
} from '@openathlete/shared';

import { AuthUser } from '../../auth/decorators/user.decorator';
import { PrismaService } from '../../prisma/services/prisma.service';

@Injectable()
export class TrainingPlanService {
  constructor(private readonly prisma: PrismaService) {}

  async importTrainingProgram(
    user: AuthUser,
    data: ImportTrainingProgramDto,
    options: { dryRun?: boolean } = {},
  ) {
    const athleteId = user?.athlete?.athleteId;

    if (!athleteId) {
      throw new BadRequestException('Athlete ID is required');
    }

    const analysis = this.analyzeTrainingProgram(data);

    const duplicate = await this.findDuplicateTrainingProgram(
      athleteId,
      data.program.sourceKey,
      data.program.name,
      analysis.programStartDate,
    );

    if (duplicate) {
      throw new ConflictException({
        message: data.program.sourceKey
          ? 'Training program already exists for this athlete and sourceKey'
          : 'Training program already exists for this athlete, name, and start date',
        duplicate: {
          trainingPlanId: duplicate.trainingPlanId,
          name: duplicate.name,
          sourceKey: duplicate.sourceKey,
          startDate: duplicate.startDate,
        },
      });
    }

    if (options.dryRun) {
      return {
        dryRun: true,
        sourceKey: data.program.sourceKey ?? null,
        programName: data.program.name,
        startDate: data.program.startDate,
        endDate: data.program.endDate,
        timezone: data.program.timezone,
        cycleCount: analysis.cycles.length,
        weekCount: data.program.weeks.length,
        sessionCount: analysis.sessionCount,
        cycles: analysis.cycles.map((cycle) => ({
          name: this.humanizePhaseName(cycle.phaseName),
          sourcePhase: cycle.phaseName,
          phase: CyclePhase.BASE,
          startWeek: cycle.startWeek,
          endWeek: cycle.endWeek,
          startDate: cycle.startDate,
          endDate: cycle.endDate,
        })),
      };
    }

    const createdPlan = await this.prisma.$transaction(
      async (transaction) => {
        const trainingPlan = await transaction.trainingPlan.create({
          data: {
            athleteId,
            name: data.program.name,
            description: data.program.description,
            goal: data.program.name,
            sourceKey: data.program.sourceKey ?? null,
            sourceSchemaVersion: data.schemaVersion,
            startDate: analysis.programStartDate,
            endDate: analysis.programEndDate,
            status: PlanStatus.DRAFT,
          },
        });

        for (const cycleData of analysis.cycles) {
          const cycle = await transaction.cycle.create({
            data: {
              athleteId,
              trainingPlanId: trainingPlan.trainingPlanId,
              name: this.humanizePhaseName(cycleData.phaseName),
              description: `Imported phase: ${cycleData.phaseName}`,
              startDate: this.parseProgramDate(cycleData.startDate, '00:00'),
              endDate: this.parseProgramDate(cycleData.endDate, '23:59'),
              phase: CyclePhase.BASE,
              color: null,
            },
          });

          for (const weekData of data.program.weeks.slice(
            cycleData.startIndex,
            cycleData.endIndex + 1,
          )) {
            const trainingWeek = await transaction.trainingWeek.create({
              data: {
                cycleId: cycle.cycleId,
                weekNumber: weekData.weekNumber,
                startDate: this.parseProgramDate(weekData.startDate, '00:00'),
                endDate: this.parseProgramDate(weekData.endDate, '23:59'),
                theme: this.buildWeekTheme(weekData),
                targetVolume: this.calculateWeekTargetVolume(weekData),
                targetLoad: null,
              },
            });

            for (const session of weekData.sessions) {
              const sessionDate = this.getSessionDate(
                weekData.startDate,
                session.day,
              );
              const startDate = this.parseProgramDate(sessionDate, '07:00');
              const goalDuration = Math.round(session.durationMinutes * 60);
              const endDate = new Date(
                startDate.getTime() + goalDuration * 1000,
              );

              await transaction.event.create({
                data: {
                  athleteId,
                  startDate,
                  endDate,
                  name: session.title,
                  type: EventType.TRAINING,
                  trainingWeekId: trainingWeek.trainingWeekId,
                  training: {
                    create: {
                      sport: session.sport,
                      description: session.description,
                      goalDistance: session.distanceMeters ?? null,
                      goalDuration,
                      goalElevationGain: null,
                      goalRpe: null,
                      estimatedLoad: null,
                    },
                  },
                },
              });
            }
          }
        }

        return trainingPlan;
      },
      { timeout: 60_000 },
    );

    return {
      dryRun: false,
      trainingPlanId: createdPlan.trainingPlanId,
      sourceKey: data.program.sourceKey ?? null,
      schemaVersion: data.schemaVersion,
      programName: createdPlan.name,
      startDate: createdPlan.startDate,
      endDate: createdPlan.endDate,
      cycleCount: analysis.cycles.length,
      weekCount: data.program.weeks.length,
      sessionCount: analysis.sessionCount,
    };
  }

  async importSeoPlan(
    user: AuthUser,
    planData: SEOPlanData,
    startDate: Date | string,
  ) {
    const athleteId = user?.athlete?.athleteId;

    if (!athleteId) {
      throw new Error('Athlete ID is required');
    }

    // Convert startDate to Date if it's a string (from JSON)
    const startDateObj =
      startDate instanceof Date ? startDate : new Date(startDate);

    // Validate startDate
    if (!startDateObj || isNaN(startDateObj.getTime())) {
      throw new Error('Invalid start date provided');
    }

    // Calculate end date based on plan duration (in weeks)
    const endDate = new Date(startDateObj);
    endDate.setDate(endDate.getDate() + planData.plan.duration * 7);

    // Create TrainingPlan
    const trainingPlan = await this.prisma.trainingPlan.create({
      data: {
        athleteId,
        name: planData.plan.name,
        description: planData.plan.description,
        goal: planData.plan.goal,
        startDate: startDateObj,
        endDate,
        status: PlanStatus.DRAFT,
      },
    });

    // Calculate dates for each week
    let currentWeekStart = new Date(startDateObj);
    const weekDates: Array<{ start: Date; end: Date }> = [];

    for (let i = 0; i < planData.plan.duration; i++) {
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      weekDates.push({
        start: new Date(currentWeekStart),
        end: weekEnd,
      });

      currentWeekStart = new Date(weekEnd);
      currentWeekStart.setDate(currentWeekStart.getDate() + 1);
      currentWeekStart.setHours(0, 0, 0, 0);
    }

    // Create cycles and weeks
    let weekIndex = 0;
    for (const cycleData of planData.cycles) {
      // Calculate cycle dates based on its weeks
      const cycleStartWeek = weekIndex;
      const cycleEndWeek = weekIndex + cycleData.weeks.length - 1;

      if (cycleEndWeek >= weekDates.length) {
        throw new Error('Cycle weeks exceed plan duration');
      }

      const cycleStartDate = weekDates[cycleStartWeek].start;
      const cycleEndDate = weekDates[cycleEndWeek].end;

      // Create Cycle
      const cycle = await this.prisma.cycle.create({
        data: {
          athleteId,
          trainingPlanId: trainingPlan.trainingPlanId,
          name: cycleData.name,
          description: cycleData.description,
          phase: cycleData.phase,
          color: cycleData.color || null,
          startDate: cycleStartDate,
          endDate: cycleEndDate,
        },
      });

      // Create TrainingWeeks and Events
      for (const weekData of cycleData.weeks) {
        if (weekIndex >= weekDates.length) {
          break;
        }

        const weekDatesData = weekDates[weekIndex];

        // Create TrainingWeek
        const trainingWeek = await this.prisma.trainingWeek.create({
          data: {
            cycleId: cycle.cycleId,
            weekNumber: weekData.weekNumber,
            startDate: weekDatesData.start,
            endDate: weekDatesData.end,
            theme: weekData.theme || null,
          },
        });

        // Create Events for each session
        for (const session of weekData.sessions) {
          // Calculate session date based on dayOfWeek
          const sessionDate = new Date(weekDatesData.start);
          const dayOffset = session.dayOfWeek - sessionDate.getDay();
          sessionDate.setDate(sessionDate.getDate() + dayOffset);
          sessionDate.setHours(9, 0, 0, 0); // Default to 9 AM

          // Calculate end date (default to 1 hour duration if not specified)
          const sessionEndDate = new Date(sessionDate);
          if (session.goalDuration) {
            sessionEndDate.setTime(
              sessionDate.getTime() + session.goalDuration * 1000,
            );
          } else {
            sessionEndDate.setHours(sessionDate.getHours() + 1);
          }

          // Create event directly with Prisma to link it to training week
          const createdEvent = await this.prisma.event.create({
            data: {
              athleteId,
              startDate: sessionDate,
              endDate: sessionEndDate,
              name: session.name,
              type: EVENT_TYPE.TRAINING,
              trainingWeekId: trainingWeek.trainingWeekId,
              training: {
                create: {
                  sport: session.sport,
                  description: session.description,
                  goalDistance: session.goalDistance || null,
                  goalDuration: session.goalDuration || null,
                  goalElevationGain: session.goalElevationGain || null,
                  goalRpe:
                    session.goalRpe !== null && session.goalRpe !== undefined
                      ? session.goalRpe / 10
                      : null,
                },
              },
            },
            include: {
              training: true,
            },
          });

          // Create workout if provided
          if (session.workout && createdEvent.training) {
            const parsed = createWorkoutSchema.safeParse({
              steps: session.workout.steps || [],
            });
            if (parsed.success) {
              const stepsForCreate = parsed.data.steps;
              const workoutData = mapWorkoutDtoToPrisma({
                steps: stepsForCreate,
              });

              // Ensure all steps have orderIndex (safety check)
              if (workoutData.steps?.create) {
                workoutData.steps.create = workoutData.steps.create.map(
                  (step, idx) => {
                    const updatedStep = {
                      ...step,
                      orderIndex: step.orderIndex ?? idx,
                    };
                    // Also ensure childSteps in repeatBlock have orderIndex
                    if (updatedStep.repeatBlock?.create?.childSteps?.create) {
                      updatedStep.repeatBlock.create.childSteps.create =
                        updatedStep.repeatBlock.create.childSteps.create.map(
                          (child: WorkoutStepDto, childIdx: number) => ({
                            ...child,
                            orderIndex: child.orderIndex ?? childIdx,
                          }),
                        );
                    }
                    return updatedStep;
                  },
                );
              }

              await this.prisma.workout.create({
                data: {
                  eventTrainingId: createdEvent.training.eventTrainingId,
                  ...workoutData,
                },
              });
            }
          }
        }

        weekIndex++;
      }
    }

    // Return the created training plan with all relations
    return this.prisma.trainingPlan.findUnique({
      where: { trainingPlanId: trainingPlan.trainingPlanId },
      include: {
        cycles: {
          include: {
            weeks: {
              include: {
                sessions: true,
              },
            },
          },
        },
      },
    });
  }

  private analyzeTrainingProgram(data: ImportTrainingProgramDto) {
    const { program } = data;

    if (!program.weeks.length) {
      throw new BadRequestException('Training program must contain weeks');
    }

    const programStartDate = this.parseProgramDate(program.startDate, '00:00');
    const programEndDate = this.parseProgramDate(program.endDate, '23:59');

    if (programEndDate <= programStartDate) {
      throw new BadRequestException(
        'Training program endDate must be after startDate',
      );
    }

    let sessionCount = 0;
    const cycles: Array<{
      phaseName: string;
      startIndex: number;
      endIndex: number;
      startWeek: number;
      endWeek: number;
      startDate: string;
      endDate: string;
    }> = [];

    for (let index = 0; index < program.weeks.length; index++) {
      const week = program.weeks[index];
      const expectedWeekNumber = index + 1;

      if (week.weekNumber !== expectedWeekNumber) {
        throw new BadRequestException(
          `Week ${index + 1} has weekNumber ${week.weekNumber}`,
        );
      }

      const expectedStartDate = this.addDays(program.startDate, index * 7);
      const expectedEndDate = this.addDays(program.startDate, index * 7 + 6);

      if (
        week.startDate !== expectedStartDate ||
        week.endDate !== expectedEndDate
      ) {
        throw new BadRequestException(
          `Week ${week.weekNumber} dates must be ${expectedStartDate} to ${expectedEndDate}`,
        );
      }

      sessionCount += week.sessions.length;

      const currentCycle = cycles.at(-1);
      if (!currentCycle || currentCycle.phaseName !== week.phase) {
        cycles.push({
          phaseName: week.phase,
          startIndex: index,
          endIndex: index,
          startWeek: week.weekNumber,
          endWeek: week.weekNumber,
          startDate: week.startDate,
          endDate: week.endDate,
        });
      } else {
        currentCycle.endIndex = index;
        currentCycle.endWeek = week.weekNumber;
        currentCycle.endDate = week.endDate;
      }
    }

    if (program.weeks[0].startDate !== program.startDate) {
      throw new BadRequestException(
        'First week must start on program startDate',
      );
    }

    if (program.weeks.at(-1)?.endDate !== program.endDate) {
      throw new BadRequestException('Last week must end on program endDate');
    }

    return {
      programStartDate,
      programEndDate,
      cycles,
      sessionCount,
    };
  }

  private async findDuplicateTrainingProgram(
    athleteId: number,
    sourceKey: string | undefined,
    name: string,
    startDate: Date,
  ) {
    return this.prisma.trainingPlan.findFirst({
      where: {
        athleteId,
        ...(sourceKey
          ? { sourceKey }
          : {
              name,
              startDate,
            }),
      },
      select: {
        trainingPlanId: true,
        name: true,
        sourceKey: true,
        startDate: true,
      },
    });
  }

  private buildWeekTheme(
    week: ImportTrainingProgramDto['program']['weeks'][number],
  ) {
    const labels = [this.humanizePhaseName(week.phase)];
    if (week.cutbackWeek) {
      labels.push('Cutback week');
    }
    if (week.benchmarkWeek) {
      labels.push('Benchmark week');
    }
    return labels.join(' · ');
  }

  private calculateWeekTargetVolume(
    week: ImportTrainingProgramDto['program']['weeks'][number],
  ) {
    return week.sessions.reduce(
      (total, session) => total + Math.round(session.durationMinutes * 60),
      0,
    );
  }

  private getSessionDate(
    weekStartDate: string,
    day: TrainingProgramSessionDay,
  ) {
    const dayOffsets: Record<TrainingProgramSessionDay, number> = {
      MONDAY: 0,
      TUESDAY: 1,
      WEDNESDAY: 2,
      THURSDAY: 3,
      FRIDAY: 4,
      SATURDAY: 5,
      SUNDAY: 6,
    };

    return this.addDays(weekStartDate, dayOffsets[day]);
  }

  private parseProgramDate(date: string, time: string) {
    return new Date(`${date}T${time}:00.000Z`);
  }

  private addDays(date: string, days: number) {
    const parsedDate = this.parseProgramDate(date, '00:00');
    parsedDate.setUTCDate(parsedDate.getUTCDate() + days);
    return parsedDate.toISOString().slice(0, 10);
  }

  private humanizePhaseName(phase: string) {
    return phase
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
