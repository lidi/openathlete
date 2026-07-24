import {
  useGetAvailableActivitiesQuery,
  useSetRelatedActivityMutation,
  useUnsetRelatedActivityMutation,
} from '@/api/event';
import { m } from '@/paraglide/messages';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

import {
  ActivityEvent,
  CompetitionEvent,
  EVENT_TYPE,
  TrainingEvent,
  formatDistance,
  formatDuration,
} from '@openathlete/shared';

import { useCalendarContext } from '../calendar/hooks/use-calendar-context';
import {
  DistanceStat,
  DurationStat,
  ElevationStat,
  EstimatedLoadStat,
} from '../numeric-stats';
import { SelectEvent } from '../select-event';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { WorkoutGraph, WorkoutSummary } from '../workout';

interface P {
  event: CompetitionEvent | TrainingEvent;
}

export function TrainingCompetitionDetails({ event }: P) {
  const setRelatedActivityMutation = useSetRelatedActivityMutation();
  const unsetRelatedActivityMutation = useUnsetRelatedActivityMutation();
  const { data: availableActivities } = useGetAvailableActivitiesQuery(
    event.eventId,
  );
  const { openEventDetails } = useCalendarContext();
  const [changing, setChanging] = useState(false);

  const linkedActivityId = event.relatedActivity?.eventId;
  const linkedActivity = availableActivities?.find(
    (activity): activity is ActivityEvent =>
      activity.eventId === linkedActivityId &&
      activity.type === EVENT_TYPE.ACTIVITY,
  );
  const isFulfilled = !!linkedActivityId;
  const isMutating =
    setRelatedActivityMutation.isPending ||
    unsetRelatedActivityMutation.isPending;

  const isTraining = event.type === EVENT_TYPE.TRAINING;
  return (
    <>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{m.details()}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {event.goalDuration && (
                  <DurationStat
                    label={m.goal_duration()}
                    duration={event.goalDuration}
                  />
                )}
                {event.goalDistance && (
                  <DistanceStat
                    label={m.goal_distance()}
                    distance={event.goalDistance}
                  />
                )}
                {event.goalElevationGain && (
                  <ElevationStat
                    label={m.goal_elevation_gain()}
                    elevation={event.goalElevationGain}
                  />
                )}
                {isTraining &&
                  (event as TrainingEvent).estimatedLoad !== null &&
                  (event as TrainingEvent).estimatedLoad !== undefined && (
                    <EstimatedLoadStat
                      label={m.estimated_training_load()}
                      estimatedLoad={(event as TrainingEvent).estimatedLoad}
                    />
                  )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{m.fulfilled_by()}</CardTitle>
            </CardHeader>
            <CardContent>
              {isFulfilled && !changing ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {linkedActivity?.name ?? ''}
                      </div>
                      {linkedActivity && (
                        <div className="text-sm text-muted-foreground">
                          {formatDuration(linkedActivity.movingTime)}
                          {linkedActivity.distance > 0
                            ? ` · ${formatDistance(linkedActivity.distance)} km`
                            : ''}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      onClick={() => {
                        openEventDetails(linkedActivityId!);
                      }}
                      variant="outline"
                      className="flex-1"
                    >
                      {m.view_workout()}
                    </Button>
                    <Button
                      onClick={() => setChanging(true)}
                      variant="outline"
                      className="flex-1"
                    >
                      {m.change()}
                    </Button>
                    <Button
                      onClick={() => {
                        unsetRelatedActivityMutation.mutate(event.eventId);
                      }}
                      isLoading={isMutating}
                      className="flex-1"
                    >
                      {m.unlink()}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <SelectEvent
                    data={availableActivities}
                    value={linkedActivityId}
                    onChange={(activityId) => {
                      setRelatedActivityMutation.mutate(
                        { eventId: event.eventId, activityId },
                        { onSuccess: () => setChanging(false) },
                      );
                    }}
                    className="w-full min-w-0"
                    placeholder={m.select_completed_workout()}
                    displayRow={(e) => (
                      <div className="truncate">
                        {e.name}
                        {e.type === EVENT_TYPE.ACTIVITY && e.distance > 0
                          ? ` (${formatDistance(e.distance)} km)`
                          : ''}
                      </div>
                    )}
                  />
                  {isFulfilled && changing && (
                    <Button
                      onClick={() => setChanging(false)}
                      variant="outline"
                      className="w-full"
                    >
                      {m.cancel()}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        {event.description && (
          <Card>
            <CardHeader>
              <CardTitle>{m.description()}</CardTitle>
            </CardHeader>
            <CardContent>
              {event.description.split('\n').map((part) => (
                <>
                  {part}
                  <br />
                </>
              ))}
            </CardContent>
          </Card>
        )}
        {isTraining && event.workout && event.workout.steps.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{m.workout()}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <WorkoutGraph
                workout={event.workout}
                sport={(event as TrainingEvent).sport}
                maxHeight={80}
                athleteId={event.athleteId ?? undefined}
              />
              <WorkoutSummary workout={event.workout} />
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
