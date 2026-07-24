import { useImportTrainingProgramMutation } from '@/api/training-plan';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, CheckCircle2, FileJson, Upload } from 'lucide-react';
import { ChangeEvent, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  ImportTrainingProgramDto,
  importTrainingProgramDtoSchema,
} from '@openathlete/shared';

import { SettingsSection } from './settings-section';

const schemaExample = `{
  "schemaVersion": "1.0",
  "program": {
    "sourceKey": "base-year-1-2026-07-20",
    "name": "Base Building Year 1",
    "description": "A planned training program.",
    "startDate": "2026-07-20",
    "endDate": "2027-07-18",
    "timezone": "Europe/Berlin",
    "globalRules": [],
    "onDemandTemplates": [],
    "weeks": []
  }
}`;

export function ImportPlanTab() {
  const [jsonText, setJsonText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [validatedPlan, setValidatedPlan] =
    useState<ImportTrainingProgramDto | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const dryRunMutation = useImportTrainingProgramMutation({
    onSuccess: (result) => {
      toast.success(
        `Plan validated: ${result.weekCount} weeks, ${result.sessionCount} sessions`,
      );
    },
    onError: (error) => {
      toast.error(error.message || 'Plan validation failed');
    },
  });

  const importMutation = useImportTrainingProgramMutation({
    onSuccess: (result) => {
      toast.success(
        `Imported ${result.programName}: ${result.weekCount} weeks, ${result.sessionCount} sessions`,
      );
      setValidatedPlan(null);
    },
    onError: (error) => {
      toast.error(error.message || 'Plan import failed');
    },
  });

  const parsedSummary = useMemo(() => {
    if (!validatedPlan) return null;
    const sessions = validatedPlan.program.weeks.reduce(
      (total, week) => total + week.sessions.length,
      0,
    );
    return {
      sourceKey: validatedPlan.program.sourceKey ?? 'none',
      schemaVersion: validatedPlan.schemaVersion,
      name: validatedPlan.program.name,
      dates: `${validatedPlan.program.startDate} → ${validatedPlan.program.endDate}`,
      weeks: validatedPlan.program.weeks.length,
      sessions,
    };
  }, [validatedPlan]);

  const parseAndValidate = (text: string) => {
    try {
      const parsed = JSON.parse(text) as unknown;
      const result = importTrainingProgramDtoSchema.safeParse(parsed);
      if (!result.success) {
        setValidatedPlan(null);
        setValidationError(
          result.error.issues[0]?.message ?? 'Invalid plan JSON',
        );
        return null;
      }

      setValidatedPlan(result.data);
      setValidationError(null);
      return result.data;
    } catch (error) {
      setValidatedPlan(null);
      setValidationError(
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setFileName(file.name);
    setJsonText(text);
    parseAndValidate(text);
  };

  const handleDryRun = () => {
    const plan = parseAndValidate(jsonText);
    if (!plan) return;
    dryRunMutation.mutate({ data: plan, dryRun: true });
  };

  const handleImport = () => {
    const plan = parseAndValidate(jsonText);
    if (!plan) return;
    importMutation.mutate({ data: plan, dryRun: false });
  };

  return (
    <div className="space-y-6">
      <SettingsSection
        title="Import plan"
        description="Upload a versioned training-plan JSON file. Plans can be weekly, monthly, half-year, full-year, or any contiguous number of weeks."
      >
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileJson className="h-5 w-5" />
                Training plan JSON
              </CardTitle>
              <CardDescription>
                Current supported schema version: <code>1.0</code>. Duplicate
                imports fail by <code>sourceKey</code> when present, otherwise
                by plan name and start date.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="plan-json-file">JSON file</Label>
                <Input
                  id="plan-json-file"
                  type="file"
                  accept="application/json,.json"
                  onChange={handleFileChange}
                />
                {fileName ? (
                  <p className="text-sm text-muted-foreground">
                    Selected: {fileName}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="plan-json-text">Plan JSON</Label>
                <Textarea
                  id="plan-json-text"
                  className="min-h-72 font-mono text-xs"
                  placeholder={schemaExample}
                  value={jsonText}
                  onChange={(event) => {
                    setJsonText(event.target.value);
                    setValidatedPlan(null);
                    setValidationError(null);
                  }}
                />
              </div>

              {validationError ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Invalid JSON</AlertTitle>
                  <AlertDescription>{validationError}</AlertDescription>
                </Alert>
              ) : null}

              {parsedSummary ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Plan JSON is valid</AlertTitle>
                  <AlertDescription>
                    {parsedSummary.name} · schema {parsedSummary.schemaVersion}{' '}
                    · {parsedSummary.dates} · {parsedSummary.weeks} weeks ·{' '}
                    {parsedSummary.sessions} sessions · sourceKey{' '}
                    {parsedSummary.sourceKey}
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  isLoading={dryRunMutation.isPending}
                  disabled={!jsonText || importMutation.isPending}
                  onClick={handleDryRun}
                >
                  Validate only
                </Button>
                <Button
                  type="button"
                  isLoading={importMutation.isPending}
                  disabled={!jsonText || dryRunMutation.isPending}
                  onClick={handleImport}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Import planned workouts
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </SettingsSection>
    </div>
  );
}
