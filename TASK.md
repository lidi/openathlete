# OpenAthlete Personal Fork

Repository:
https://github.com/lidi/openathlete

Goal:
Turn OpenAthlete into my personal training log.

Requirements:
- Work ONLY against this fork.
- Keep changes minimal.
- No overengineering.
- Every commit must build.

Import roadmap

1. Google Drive integration
2. Pull FIT/TXT files from myworkouts
3. "Import now" button
4. Optional scheduled sync

Data sources

- WorkOutDoors exports FIT files.
- WODBanger exports TXT workout files.

Google Drive is only a transport layer.

No manual file upload/import flow.

Google Drive folder:
- Name: myworkouts
- Files must be direct children of the folder.
- Supported files: .fit, .txt

Do not implement:
- Strava
- Apple Health
- Generic connector framework

Implementation style

- Reuse existing activity creation pipeline.
- One logical commit at a time.
- Ask before making architectural changes.
