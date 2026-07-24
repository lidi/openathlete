# Training Plan Import JSON v1

This fork supports uploading versioned planned-training JSON files through `POST /training-plan/import` and the Settings → Import plan tab.

## Version

Current schema version: `1.0`.

The canonical JSON Schema is `doc/training-plan-import-v1.schema.json`.

## Supported Durations

The importer accepts any positive number of contiguous weeks. A file can describe one week, one month, half a year, a full year, or another contiguous block.

## Import Semantics

- Every session imports as a planned `EventTraining`.
- Every cycle imports with OpenAthlete `CyclePhase.BASE`.
- Human phase labels from JSON are preserved in cycle names and week themes.
- Blank days stay blank. The importer does not create rest-day notes.
- The importer does not expand templates, strength exercises, mobility routines, or Peloton details.
- The importer does not set planned RPE or estimated training load.
- Session timestamps use `07:00` UTC because the database requires timestamps. These are planning records, not fixed appointments.
- Duplicate imports fail by `program.sourceKey` when present. If no `sourceKey` exists, duplicate detection falls back to `program.name + program.startDate`.

## Required Shape

```json
{
  "schemaVersion": "1.0",
  "program": {
    "sourceKey": "base-year-1-2026-07-20",
    "name": "Base Building Year 1",
    "description": "A planned training block.",
    "startDate": "2026-07-20",
    "endDate": "2026-08-16",
    "timezone": "Europe/Berlin",
    "globalRules": [],
    "onDemandTemplates": [],
    "weeks": [
      {
        "weekNumber": 1,
        "phase": "FOUNDATION",
        "startDate": "2026-07-20",
        "endDate": "2026-07-26",
        "cutbackWeek": false,
        "benchmarkWeek": false,
        "sessions": [
          {
            "day": "MONDAY",
            "type": "EASY_RUN",
            "title": "Easy Run — 45 min",
            "description": "Conversational effort.",
            "sport": "RUNNING",
            "durationMinutes": 45,
            "intensity": "EASY"
          }
        ]
      }
    ]
  }
}
```
