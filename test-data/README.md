# Test Dataset

Excel files for testing every upload and seating-generation feature by hand.
The script [backend/scripts/generate_test_data.js](../backend/scripts/generate_test_data.js) builds all of them. It uses a fixed random seed, so re-running it gives the same files:

```
cd backend
node scripts/generate_test_data.js
```

> **Use a separate test database.** Uploading a timetable deletes the existing seating plans and faculty duties.
> To test, point `MONGO_URI` in `backend/.env` at a throwaway database such as `.../exam_hall_test`.

## Files and upload order

| # | File | Where to upload | Contents |
|---|------|-----------------|----------|
| 1 | `01_Halls.xlsx` | Admin › Halls › Upload Excel | 14 halls: 12 classrooms at 2 per bench, plus DH1 and DH2 at 1 per bench. 690 seats in total |
| 2 | `02_Students.xlsx` | Admin › Students › Global Upload | 600 students. Engineering has 7 departments × Years 1–4 × 20 students; MBA has Years 1–2 × 20. Default password: `student123` |
| 3 | `03_Faculty.xlsx` | `node scripts/seed_test_faculty.js` (run from `backend/`, with the server running) | 54 faculty, 6 per department. The first in each department is HOD. Password: `faculty123` |
| 4 | `04_Internal_Timetable.xlsx` | Admin › Seating Plans › Upload Timetable | IAT exams, 5–9 Oct 2026. FN: Year 2 + Year 4. AN: Year 3 + MBA Year 2 |
| 5 | `05_Anna_Students.xlsx` | Anna University Planner › Upload Students | 28 arrear registrations: Year 4 students re-taking a Semester 5 paper |
| 6 | `06_Anna_Timetable.xlsx` | Anna University Planner › Upload Timetable | End-semester exams, 16–27 Nov 2026, in 12 sessions |
| 7 | `07_Manual_Map_Rolls.xlsx` | Manual Map › upload a roll-number list | 5 CSE Year 2 roll numbers |
| – | `Test_Dataset_Master.xlsx` | Reference only; do not upload | README, a **Test Scenarios** checklist (T01–T36 with Pass/Fail columns) and every dataset in one workbook |

Faculty accounts can't be uploaded from Excel in the UI, so the seed script creates them through `POST /api/users`. That endpoint applies the same checks as the Faculty page. The script logs in with `SEED_ADMIN_USERNAME` and `SEED_ADMIN_PASSWORD` from `backend/.env`.

## How the data connects

- A student is seated only when **student Department = timetable Department** and **student Year = timetable Year**. Both are exact text matches, e.g. `CSE` + `Year 2`. If you edit the files, keep these values the same in both.
- Roll numbers follow the Anna University format: `9127` + batch + department code + serial, e.g. `912725104001` for CSE, 2025 batch, student 1.
- Each subject code belongs to one department only (see E08 below for why).
- The Email columns are blank on purpose. When `EMAIL_USER` is set, the bulk upload sends a real email to every student. To test email, add your own address to one row.

## Edge cases (`edge-cases/`)

| File | What it tests |
|------|---------------|
| E01_Students_Duplicates | Rolls that already exist and rolls repeated inside the file should be skipped (2 new students) |
| E02_Students_Missing_Fields | Rows with no name or roll are dropped; a blank department falls back to the defaults |
| E03_Students_Alt_Headers | Lowercase / camelCase headers (`name`, `rollNumber`, `degree`) |
| E04_Students_Lowercase_Rolls | Roll numbers are trimmed and converted to UPPERCASE |
| E05_Halls_Invalid | Duplicate hall, zero rows, DH hall forced to 1 per bench, blank floor, blank name |
| E05b_Halls_Alt_Headers | `Hall Number`, `Seats Per Bench`, `Faculty Required` headers |
| E06_Timetable_Excel_Dates | Real Excel date cells, which should be converted to `YYYY-MM-DD` |
| E07_Timetable_Bad_Rows | Missing date / session / subject, plus an invalid session `Morning` |
| E08_Timetable_Shared_Subject_Code | One subject code (MA3354) used by both CSE and IT |
| E09_Timetable_Empty | Headers only; should return 400 |
| E10_Capacity_Students + E10_Capacity_Timetable | 780 students in one session with only 690 seats (upload students first, then the timetable) |
| E11_Faculty_Invalid | Name without an initial, duplicate faculty, invalid designation. Run `node scripts/seed_test_faculty.js ../test-data/edge-cases/E11_Faculty_Invalid.xlsx` |
| E12_Manual_Map_Unknown_Rolls | Manual mapping with 2 roll numbers that don't exist; should show a partial warning |

## Bugs found with this dataset (fixed)

| Test | Before the fix | After the fix |
|------|----------------|---------------|
| E08: shared subject code | The timetable was updated by subject code only, so the IT row overwrote CSE. Only 15 of 40 students were seated | Rows are keyed by subject + department + year. All 40 are seated |
| E07: invalid session | "Morning" crashed generation *after* every existing plan had been deleted, leaving 0 sessions | The whole file is checked first and rejected with row-by-row errors. Existing plans are untouched. `Forenoon`/`F.N.` are accepted as `FN` |
| Internal seating | About 15% of students (e.g. 239 of 280) got no seat, with no warning, even with free halls | Every student is seated. Any student who truly can't be seated triggers a warning |
| Anna arrears | If any student had an arrear in a paper, the whole regular class for that paper was left out of the plan (167 of 307 seated) | The class mapping is always created. Arrear rows keep the student's own department |

The shared logic lives in [backend/src/utils/timetableImport.js](../backend/src/utils/timetableImport.js).
