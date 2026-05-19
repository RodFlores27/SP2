# CSV Seed Setup Guide (Rooms and Equipment)

This guide explains how to prepare the two CSV files used by the main seed script:

- `C:\BSCS\SP\SP2\PTCF rooms list.csv`
- `C:\BSCS\SP\SP2\PTCF equipment list.csv`

The seeder reads these files and inserts `Rooms` and `Equipment` dummy data.

## 1) File Location

Place both files at the workspace root:

- `C:\BSCS\SP\SP2\PTCF rooms list.csv`
- `C:\BSCS\SP\SP2\PTCF equipment list.csv`

## 2) Rooms CSV Format

Expected header row:

```csv
Room Code,Room Name,Zone,PPE,Capacity,Description
```

Required columns:

- `Room Code`
- `Room Name`
- `Zone`
- `PPE`
- `Capacity`
- `Description`

Mapping to DB:

- `Room Code` -> `resourceCode`
- `Room Name` -> `name`
- `Zone` -> `zone`
- `PPE` -> `ppe`
- `Capacity` -> `capacity` (must be numeric)
- `Description` -> `description`

Seeder defaults:

- `location` is set to `Plant Tissue Culture Facility` (fixed default)
- `status` is set to `available`

## 3) Equipment CSV Format

Expected logical header row:

```csv
Name,Category,Category Code,Equipment Code,Description
```

Required columns:

- `Name`
- `Category`
- `Category Code`
- `Equipment Code`
- `Description`

Mapping to DB:

- `Name` -> `name`
- `Category` -> `category`
- `Category Code` -> `codeGroup`
- `Equipment Code` -> `resourceCode`
- `Description` -> `description`

Seeder defaults:

- `status` is set to `available`
- `imageUrl` is set to `null`

Important code rule:

- If `Equipment Code` already starts with `Category Code-`, the seeder removes that prefix before storing.
  - Example: `Category Code=MIC`, `Equipment Code=MIC-SHK-001`
  - Stored values become:
    - `codeGroup=MIC`
    - `resourceCode=SHK-001`

This prevents duplicate display like `MIC-MIC-SHK-001`.

## 4) CSV Content Rules

- Keep one valid header row.
- Empty lines are allowed; they are ignored.
- Quoted text is supported (including commas inside quotes).
- Use UTF-8 encoding.
- Keep column names exactly as specified (case-insensitive matching is used, but names must still be recognizable).

## 5) Common Issues

- Missing required column name -> seeder throws an error.
- Non-numeric `Capacity` -> fallback capacity may be applied; avoid this by keeping capacities numeric.
- Wrong file path -> seeder cannot find CSV and exits with an error.

## 6) Run Migration and Seed

From `C:\BSCS\SP\SP2\PTCF Project\server`:

```bash
npx sequelize-cli db:migrate
npx sequelize-cli db:seed:undo:all
npx sequelize-cli db:seed:all
```

Foundation script options:

```bash
# Idempotent insert/update behavior (keeps existing rows)
npm run seed:foundation

# Replace mode (clears Bookings + Equipment + Rooms, then re-seeds from CSV)
npm run seed:foundation:replace
```

## 7) Quick Validation Checklist

- Rooms appear with `zone` and `ppe` in Room List/Detail.
- Equipment appears with correct category and code.
- No duplicate prefix formatting on equipment codes.
- No legacy sample bookings are inserted by the main seed.

## 8) UAT Account + Contention Seeding

For UAT participants, use:

- `C:\BSCS\SP\SP2\PTCF Project\server\docs\uat-respondents.csv`

Expected header:

```csv
email,role,user_category,seed_defender,seed_global_target
```

Role values:

- `regular_user`
- `ptcf_staff`
- `system_admin`

Flag values:

- `yes` / `no`

Run from `C:\BSCS\SP\SP2\PTCF Project\server`:

```bash
# 1) Create/update users + role assignment + temporary passwords
npm run seed:uat:accounts

# 2) Seed student@uplb.edu.ph global challenge targets + defender/challenger pairs
npm run seed:uat:contention

# 3) Refresh all UAT seed layers during live UAT
#    - student/staff/admin contention + My Bookings + dashboard datasets
#    - shared admin analytics/audit showcase dataset
npm run seed:uat:refresh

# 4) Seed one shared Admin showcase dataset (analytics + audit trail)
npm run seed:uat:admin-showcase
```

Default outputs:

- Account credentials: `server/docs/uat-account-passwords.csv`
- Contention manifest: `server/docs/uat-contention-manifest.csv`

Notes:

- `seed:uat:refresh` is idempotent for seeded contention/dashboard data.
- Admin showcase audit/analytics rows are also idempotent using fixed `eventId` values.
- Global challenge targets are identified with an internal marker and are refreshed without touching non-UAT user-created bookings.
