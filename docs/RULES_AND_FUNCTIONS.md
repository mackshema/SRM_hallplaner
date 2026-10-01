# Hall Harmony Planner: Rules and Functions

This is a reference for every rule the system enforces, where each rule lives in the code, and whether it passed testing.
The rule IDs match the checks in [backend/tests/api.test.js](../backend/tests/api.test.js).

**Status key:** ✅ tested and passing · 📄 read from the code, not tested automatically

**Last test run:** 21 Sep 2026. All 104 checks passed, on three separate runs.
[Fixed issues](#fixed-issues) lists the 12 bugs this test suite found and how each was fixed.

```
cd backend
npm run test:data   # rebuild the Excel test dataset in ../test-data
npm run test:api    # start the server on a throwaway DB and run all checks (takes a few minutes)
```

The test run never touches your real database. It uses `exam_hall_api_test`, which is dropped before and after the run. It does not read your `.env`, and email goes to a closed port, so nothing is sent.

---

## 1. Users, roles and access

The system has three roles: **admin** (exam cell), **faculty** (invigilators) and **student**.

| ID | Rule | Status |
|----|------|--------|
| AUTH-01/02 | `POST /api/auth/seed` creates the first admin from `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD`. It only works if no users exist, and is disabled when `NODE_ENV=production`. | ✅ |
| AUTH-03 | Login ignores username case and returns a JWT that is valid for **10 hours**. | ✅ |
| AUTH-04 | A wrong password gives 401 with a generic "Invalid username or password". The message doesn't reveal whether the user exists. | ✅ |
| AUTH-05/06 | Admin routes return 401 with no token and 403 for faculty or student tokens. | ✅ |
| 📄 | The frontend adds the token to every `fetch` call ([src/main.tsx](../src/main.tsx)). File downloads go through `fetch` too ([src/lib/download.ts](../src/lib/download.ts)), because `window.open` can't send the token. | |
| MIG-01 | On startup the server applies small schema fixes ([config/migrations.js](../backend/src/config/migrations.js)). | ✅ |

**Who can call what**

| Area | Public | Student | Faculty | Admin |
|------|:-:|:-:|:-:|:-:|
| Login, seed, student seat lookup `GET /api/student/:roll` | ✓ | ✓ | ✓ | ✓ |
| Change own student password | | ✓ | | ✓ |
| Faculty duties, delegation requests, mark absent | | | ✓ | ✓ |
| Delegation email buttons (signed link, no login needed) | ✓ | | | |
| Halls, students, faculty, timetables, generation, sessions, exports, settings | | | | ✓ |

## 2. Faculty accounts

Faculty are created through `POST /api/users`. There is no Excel upload for faculty; `backend/scripts/seed_test_faculty.js` uploads a sheet through the API.

| ID | Rule | Status |
|----|------|--------|
| FAC-01 | Creating valid faculty succeeds. | ✅ |
| FAC-02 | The name must be `<initial>. <name>`, e.g. `R. Kumar`. | ✅ |
| FAC-03/04 | Duplicate usernames (any case) and duplicate faculty names are rejected. | ✅ |
| FAC-05 | Designation must be Assistant Professor, Associate Professor, Professor, HOD or blank. Anything else gets a 400 error. | ✅ |
| FAC-06 | Usernames are stored in UPPERCASE. The built-in seed accounts keep their original case, which is harmless because login ignores case. | ✅ |
| 📄 | A faculty member with designation **HOD** is the approver for delegation requests from their department. | |

## 3. Halls

| ID | Rule | Status |
|----|------|--------|
| HALL-01 | Excel upload columns: `Name`, `Rows`, `Columns`, `SeatsPerBench`, `Floor`, `FacultyRequired`. Alternates accepted: `Hall Number`, `Seats Per Bench`, `Faculty Required`. | ✅ |
| HALL-02/08 | Hall names must be unique. Duplicates are skipped in bulk upload and rejected on single create. | ✅ |
| HALL-03 | Bulk upload requires name, rows, columns and floor. Rows with 0 rows or columns are dropped by the page before upload. | ✅ |
| HALL-04/05 | **Drawing halls:** any hall whose name contains `DH` is forced to 1 seat per bench, on create and on edit. | ✅ |
| HALL-06/07 | Single create needs rows, columns and seats per bench as positive numbers; text like `"5"` is rejected. | ✅ |
| HALL-09 | Halls can be deleted. | ✅ |
| 📄 | Capacity = rows × columns × seats per bench, plus extra benches × seats per bench. | |
| 📄 | Only halls with `isSelected = true` are used by automatic generation. | |
| 📄 | `Faculty Required` (default 1) is the number of invigilators the hall gets. | |

## 4. Students

| ID | Rule | Status |
|----|------|--------|
| STU-01 | Excel upload columns: `Name`, `Roll Number`, `Email`, `Program`, `Year`, `Department`. Alternates accepted: `rollNumber`, `degree`, lowercase headers. | ✅ |
| 📄 | Missing Program / Year / Department fall back to the filters selected on the page, otherwise `General` / `Year 1` / `General`. Rows without a name or roll number are dropped. | |
| 📄 | Every uploaded student gets the default password **student123**. | |
| STU-02/06 | Roll numbers are unique. Existing ones are skipped in bulk upload and rejected on single create. | ✅ |
| STU-03 | Roll numbers are trimmed and stored in UPPERCASE. | ✅ |
| STU-04 | The student list never returns password hashes. | ✅ |
| STU-05 | Single create needs name, roll number and password. | ✅ |
| STU-07 | Students log in with their roll number. | ✅ |
| STU-08 | A logged-in student can change their own password. | ✅ |
| STU-09 | A student can't change another student's password; admins can change any. | ✅ |
| 📄 | If email is configured (`EMAIL_USER`), every created student is emailed their username and password. | |

## 5. Timetable upload (Internal and Anna University)

Both planners use the same import logic in [backend/src/utils/timetableImport.js](../backend/src/utils/timetableImport.js).

**Columns:** `Subject Code`, `Date`, `Session`, `Department`, `Year`. Headers in camelCase or lowercase also work, and `Degree` is accepted for `Year`. Only the first sheet is read.

| ID | Rule | Status |
|----|------|--------|
| TT-01 | The whole file is validated **before anything is changed**. Every row needs a subject code, a date and a session, and the session must be FN or AN. `Forenoon`, `F.N.` and `Afternoon` are also accepted. If any row is bad, the upload is rejected with a row-by-row list and existing plans stay untouched. | ✅ |
| 📄 | Blank rows are ignored. Two rows with the same subject + department + year but different dates are rejected as a conflict. | |
| 📄 | Real Excel date cells are converted to `YYYY-MM-DD`. | |
| 📄 | Each row applies to one **subject + department + year**, so a subject code shared by departments (e.g. MA3354 for CSE and IT) schedules both. | |
| TT-02 | A successful upload deletes that planner's seating plans **and only their duties**, then generates every session automatically. | ✅ |
| XMOD-01 | Uploading one planner's timetable never touches the other planner's finalized duties. | ✅ |
| ANNA-02 | Anna uploads first return a warning that lists what will be deleted. Nothing happens until the upload is confirmed. | ✅ |
| 📄 | Before a confirmed Anna upload, a `mongodump` backup is taken into `backups/`. Only the last 5 are kept. | |
| TT-03 | Session times. Internal: FN 09:30 AM, AN 01:30 PM. Anna: FN 09:30 AM, AN 02:00 PM. | ✅ |

**How a student is matched to an exam.** The same rule applies in both planners, in automatic and manual generation:
1. A row mapped to the student's roll number (manual map or Anna arrear), otherwise
2. a class row where **student Department = timetable Department** and **student Year = timetable Year**. Both must match exactly as text.

Students with no match in a session aren't seated in it.

### Manual mapping

| ID | Rule | Status |
|----|------|--------|
| MAP-01 | Map a subject to a list of roll numbers, typed or uploaded as a roll-number sheet. Any number of students from the same department can be mapped. | ✅ |
| MAP-02 | Unknown roll numbers are reported as a warning; the known ones are still mapped. | ✅ |
| MAP-03 | Mapping a whole class needs both department and year. | ✅ |

### Anna arrear registrations

📄 Upload columns: `Roll Number`, `Subject Code`, `Department`, and optionally `Student Name`. A row is added or updated per roll number + subject. If the timetable already has that subject, the date and session are copied, preferring the student's own department. ANNA-01 ✅

## 6. Seating rules

### Internal exams: automatic generation (after timetable upload)

| ID | Rule | Status |
|----|------|--------|
| TT-04 | Every student with an exam in the session gets a seat, as long as there are enough usable seats. | ✅ |
| SEAT-01 | Students sharing a bench are from different departments. | ✅ |
| SEAT-02 | Side-by-side seats, including across neighbouring benches, are from different departments. | ✅ |
| SEAT-03 | Seats directly in front and behind are from different departments. | ✅ |
| SEAT-04 | Drawing halls use only seat 1 of each bench. | ✅ |
| SEAT-05 | No student is seated twice, and every seat is inside the hall grid. | ✅ |
| 📄 | Each hall aims for a mix of **3 departments**. Departments are shuffled and the starting hall is random, so each generation is different. | |
| 📄 | If a hall ends up with only one department, only seat 1 of each bench is used. | |
| 📄 | A student who can't be placed in one hall goes on to the next hall. Anyone still unplaced after the last hall shows up as a warning: "N student(s) could not be seated". | |

### Internal exams: manual "Generate" on one session (Seating Plans page)

Uses the same rules as above, plus:

| ID | Rule | Status |
|----|------|--------|
| GEN-04 | Only students with an exam in that session are seated. | ✅ |
| GEN-05 | A session created by hand, with no timetable rows, seats every selected student. | ✅ |
| GEN-02 | Every student is either seated or returned in the `unallocated` list; none are silently dropped. | ✅ |
| GEN-03/06 | The department adjacency rules hold, even when halls are nearly full. | ✅ |
| GEN-01 | Roll numbers in the skip list must exist. | ✅ |
| 📄 | Roll numbers in the priority list are seated first; roll numbers in the skip list are left out. | |
| 📄 | **Blocked department pairs** (set per session) are never seated next to each other. | |
| 📄 | Neighbours can't write the same subject code, where subject codes are known. | |
| 📄 | Students without a department are left out, with a warning. Only students with `isSelected = true` are included. | |

### Anna University exams

| ID | Rule | Status |
|----|------|--------|
| ANNA-03 | Every scheduled student gets a seat. | ✅ |
| ANNA-SEAT-01 | Neighbours (left, right, front, back) are from different departments. | ✅ |
| ANNA-SEAT-02 | Neighbours are writing different subject codes. | ✅ |
| ANNA-SEAT-03 | At most **25 students per hall**. | ✅ |
| ANNA-SEAT-04 | Up to 2 students per bench, never more than the hall's own bench size, so drawing halls use only seat 1. | ✅ |
| ANNA-SEAT-05 | No student is seated twice. | ✅ |
| 📄 | Seats are filled column by column: each column is filled completely before the next one. | |

## 7. Invigilator (faculty duty) allocation

These rules apply in automatic generation (both planners) and in manual Generate. Duties already handed out in the same run, and in other draft sessions, count as well as finalized duties ([utils/facultyDuties.js](../backend/src/utils/facultyDuties.js)).

| ID | Rule | Status |
|----|------|--------|
| FDUTY-01 / ANNA-FAC-01 | Every hall with students gets its `Faculty Required` number of invigilators. Halls with no students get none. | ✅ |
| FDUTY-02 | An invigilator is never in two halls in the same session. | ✅ |
| FDUTY-03 | **Department quota:** in one plan, a department supplies at most `ceil(total invigilators required / 2)` invigilators (rounding set in `QUOTA_ROUNDING`, [utils/facultyAllocation.js](../backend/src/utils/facultyAllocation.js)). Faculty with fewer total duties are picked first, and halls prefer a department they don't have yet. Unit tests: `npm run test:unit`. | ✅ |
| 📄 | Reserve faculty of the session and faculty already on duty in it are never auto-assigned. | |
| VAC-01/02/03 | Halls the quota leaves short are reported as vacancies ("X halls still need faculty"). The admin adds faculty by hand (same-session conflicts are blocked; exceeding the quota only warns) or re-runs auto-assignment for the remaining vacancies only. Existing assignments are never changed. | ✅ |
| FDUTY-04 / ANNA-FAC-02 | **No continuous duty:** nobody invigilates the session right after one they already have (FN then AN on the same day, or the last session of one day then the next session). | ✅ |
| FDUTY-05 / ANNA-FAC-03 | At most **4 duties in any 7 days**. | ✅ |
| 📄 | Sessions are generated in date order, FN before AN, so each session sees the duties handed out before it. | |
| 📄 | Faculty chosen by the admin ("demand") are exempt from the department quota, continuous-duty and weekly limits; they are used only when regular faculty run out. | |
| 📄 | Automatic generation picks from all faculty. Manual "Generate" picks from the faculty selected for that session, or from those flagged "selected for generation". | |
| FDASH-01 | Faculty see their own duties on their dashboard. | ✅ |
| FDASH-02 | A faculty member can't read another faculty member's duties. | ✅ |

## 8. Session lifecycle

```
DRAFT ──finalize──▶ FINAL ──publish now──────────────▶ PUBLISHED
  ▲                   │  └──schedule──▶ SCHEDULED ──publish_at passes──┘
  │                   │                    │ cancel (before it goes live) ▶ FINAL
  └────unlock─────────┘  (from any locked state: unpublishes and deletes duties)
```

FINAL, SCHEDULED and PUBLISHED are all *locked* (no regeneration or seat edits). Visibility is computed when data is read: students and faculty see a plan only when it is published **and** `publish_at <= now` ([utils/planStatus.js](../backend/src/utils/planStatus.js)). A one-minute scheduler also flips due SCHEDULED plans to PUBLISHED so statuses, duty records and schedule completion stay current.

| ID | Rule | Status |
|----|------|--------|
| SES-01 | Only one session per date + FN/AN. | ✅ |
| SES-02/03 | Finalizing sets FINAL, creates one duty record per invigilator and saves a snapshot of the plan. | ✅ |
| SES-04 | A session can't be finalized twice. | ✅ |
| SES-05/06 | A FINAL session can't be regenerated or edited. | ✅ |
| SES-07 | Unfinalize returns the session to DRAFT, unpublishes it and deletes its duties. | ✅ |
| 📄 | Deleting a session deletes its seats and duties. | |
| ANNA-04 | Finalizing an Anna plan creates its duties. | ✅ |
| ANNA-05 | Finalizing an already-final Anna plan is harmless; no duplicate duties are created. | ✅ |
| ANNA-07 | Moving an Anna plan back to DRAFT deletes its duties; finalizing again recreates them once. | ✅ |
| ANNA-06 | Deleting an Anna plan deletes its duties. | ✅ |
| PUB-01/02 | Publish time can't be in the past; exam end must be after start; publishing must happen before the exam starts. | ✅ |
| PUB-03/06/07 | Schedule for later (SCHEDULED), cancel back to FINAL, or publish now (PUBLISHED). | ✅ |
| PUB-04/05 | Before the publish time the faculty and student APIs return no hall/seat details - only when they go live. | ✅ |
| PUB-08/09 | A live plan can't be rescheduled (unpublish first) and stays locked. | ✅ |
| 📄 | Plans published before scheduling existed (FINAL + isPublished) are migrated to PUBLISHED with their original time. | |

### Student seat lookup (public)

| ID | Rule | Status |
|----|------|--------|
| LOOK-01/02 | Seats appear only once the session is **FINAL and published**. Otherwise the lookup returns 404. | ✅ |
| LOOK-03 | Lookup ignores roll-number case and shows hall, floor, date, session, time and seat. | ✅ |
| LOOK-04 | Anna seats show the correct start time: FN 09:30 AM, AN 02:00 PM. | ✅ |

### Absent marking

| ID | Rule | Status |
|----|------|--------|
| ABS-01 | Absentees can only be marked on FINAL, published sessions. | ✅ |
| ABS-02 | The hall's invigilator or an admin can mark or clear an absence. Who marked it and when is recorded. | ✅ |
| ABS-03 | Faculty can't mark absentees in a hall they don't invigilate. | ✅ |

### Exam timing and absentee upload window

| ID | Rule | Status |
|----|------|--------|
| LIVE-01/02 | With exam start/end set (publish dialog or plan timing), duties show Upcoming / Live / Completed, computed at read time. Plans without timing show no live status. | ✅ |
| LIVE-03/04 | An invigilator can open only their own hall's student list. | ✅ |
| LIVE-05/06 | Absentees can be submitted and edited while the window is open (default: Settings, 120 min after start; per-plan override). Each save is kept with who and when. | ✅ |
| LIVE-07 | After the window closes, the API refuses uploads. | ✅ |
| LIVE-08/09/10 | Admin can re-open a window for a hall or one invigilator; a reason is required and every extension is logged. | ✅ |
| LIVE-11 | Absentee report per hall: submitted or not, count, list, extensions, and a flag when the window closed with no submission. | ✅ |

### Reserve faculty

| ID | Rule | Status |
|----|------|--------|
| RES-01/03 | A faculty member can't be a reserve and an invigilator in the same session (either direction). | ✅ |
| RES-02 | Reserves are per plan and stored as a link to the faculty record. | ✅ |
| RES-04 | Reserve names appear at the bottom of the bench layout, opposite the signature, and in exports. | ✅ |
| RES-05 | Reserves see a Reserve card on their dashboard once the plan is published. | ✅ |
| RES-06 | "Use as replacement" moves the hall duty from the absent invigilator to the reserve and marks the reserve as converted. | ✅ |

### Exam schedules, duty summary and duty history

| ID | Rule | Status |
|----|------|--------|
| SUM-01/02 | Plans are grouped under an exam schedule (IAT 1, IAT 2, Model, Anna...). It is Complete when every plan is PUBLISHED (not just scheduled). | ✅ |
| SUM-03/04 | The duty summary is generated and saved automatically when the schedule becomes Complete, not before. | ✅ |
| SUM-05 | A converted reserve counts as one duty and is listed under reserves with the hall they moved to. | ✅ |
| SUM-06 | Any later change to a plan (unpublish, reassignment...) regenerates the saved summary. | ✅ |
| HIST-01/02/03 | Faculty duty history by category (categories come from Settings), from the same duty table as the summary, only published plans; faculty see only their own. | ✅ |

## 9. Duty delegation

The request moves through these states:

```
Pending HOD Approval ──HOD approves──▶ Pending Faculty Response ──replacement accepts──▶ Accepted (duty moves)
          └──HOD rejects──▶ Rejected by HOD          └──replacement declines──▶ Declined
```

| ID | Rule | Status |
|----|------|--------|
| DEL-01 | A faculty member requests a replacement for one of their duties. | ✅ |
| 📄 | The approval email goes to the HOD of the requester's department, or to the HOD email entered on the requester's profile. | |
| DEL-02 | The request succeeds even if the email can't be sent. The response includes `emailSent: false`. | ✅ |
| DEL-03 | The buttons in the emails work without logging in. Each link carries a signed token for **one request and one action**, valid for 7 days. | ✅ |
| DEL-07 | The same URL without a valid link token still needs a login. | ✅ |
| DEL-08 | A link token only works for its own action; a reject link can't be turned into an approve. | ✅ |
| DEL-04 | HOD approval notifies the replacement. | ✅ |
| DEL-09 | Each step happens only once, in order: an approved request can't then be rejected, and a decline only works while waiting for the replacement. | ✅ |
| DEL-05 | When the replacement accepts, the duty record moves to them. | ✅ |
| DEL-06 | An accepted request can't be accepted again. | ✅ |

## 10. Exports and settings

| ID | Rule | Status |
|----|------|--------|
| EXP-01 | The full internal package can only be downloaded for FINAL sessions. | ✅ |
| EXP-02 | The internal package is a ZIP: hall bench layouts (Word), consolidated plan, faculty duty chart, summary (PDF). | ✅ |
| EXP-04/05/06 | Anna consolidated PDF, hall layouts (Word) and full ZIP package. | ✅ |
| EXP-03 | Exports are admin-only; a request without a token is refused. | ✅ |
| EXP-07 | Every download button fetches with the login token; none use `window.open`. | ✅ |
| EXP-08 | The server exposes `Content-Disposition`, so downloads keep the server's file name. | ✅ |
| EXP-09/10/11 | Hall bench layouts (Word) download one hall at a time or all together as a ZIP, before or after finalizing; a hall with no students in the session gives 404. | ✅ |
| SET-01/02 | One settings record (institution name, logos, exam name, academic year) appears on all exported documents. Admin only. | ✅ |
| XLS-01 / PDF-01 | Every document type (hall allotment, seating plan, student list, faculty duty, reserve faculty, absentee report, department summary, duty summary) exports as Excel and PDF from one data layer ([backend/src/exports](../backend/src/exports)). | ✅ |
| EXP-12/13 | "Both" returns a ZIP with Excel/ and PDF/ folders; the duty summary exports too. | ✅ |
| EXP-14/15 | "Download all" for a plan or a whole schedule runs as a background job with progress, then downloads one ZIP. | ✅ |
| 📄 | The Settings logo is in every export: a real page header in Word, repeated on every PDF page, embedded in Excel. Aspect ratio kept; no logo = no placeholder. The Word exports stay available behind Settings → "Use legacy Word exports". | |

---

## Fixed issues

All 12 bugs were found by this test suite, fixed, and are now covered by the checks listed.

| # | Was | Now | Checks |
|---|-----|-----|--------|
| 1 | Automatic generation didn't enforce no continuous duty or the 4-per-week limit, because it only looked at finalized duties. Up to 23 invigilators got FN and AN on the same day. Manual Generate also picked the wrong "previous session", because it sorted FN after AN. | Duties handed out in the run and in draft sessions count too, and sessions are processed in date order. | FDUTY-04/05, ANNA-FAC-02/03 |
| 2 | Anna seating always used 2 seats per bench, putting students on seat 2 of drawing-hall benches (272 in a test run). It also made the DH layout exports overlap. | Uses up to 2, never more than the hall's own bench size. | ANNA-SEAT-04 |
| 3 | Manual Generate seated every student in the database and silently dropped students it couldn't place (474 of 600, 0 reported). | Follows the timetable. Unplaced students move on to the next hall, and any left over are returned as unallocated. | GEN-02/04/05/06 |
| 4 | Manual mapping failed for 2+ students from the same department (unique index). | Index is no longer unique; the old one is dropped on startup. | MAP-01, MIG-01 |
| 5 | Export buttons that used `window.open` got 401. | Downloads go through `fetch` with the token (`src/lib/download.ts`). | EXP-07/08 |
| 6 | Email Approve / Reject / Accept / Decline links needed a login token. | Signed per-request, per-action link tokens; each step happens only once. | DEL-03/07/08/09 |
| 7 | Students couldn't change their password (admin-only route). | Any logged-in user; students only for themselves. | STU-08/09 |
| 8 | Finalizing an Anna plan twice gave a 500 error. | Duties are created only on DRAFT → FINAL and removed when leaving FINAL. | ANNA-05/07 |
| 9 | Student lookup showed 09:30 AM for Anna AN exams. | 02:00 PM for AN. | LOOK-04 |
| 10 | A failed HOD email turned a saved request into an error. | Saved request returns 201 with `emailSent: false`. | DEL-02 |
| 11 | Uploading either timetable deleted **all** faculty duties, including the other planner's. | Each upload deletes only its own sessions' duties. | XMOD-01 |
| 12 | An invalid designation returned 500. | Returns 400 with the reason. | FAC-05 |
| 13 | Anna hall layouts (Word) returned 500 (`reserveFaculty` was undefined). | Reserves are passed in and printed opposite the signature. | EXP-05 |
| 14 | SCHEDULED/PUBLISHED plans were treated as unlocked (could be regenerated/edited, hall views lost their duties, absent marking failed, full package refused). | All checks use the locked-status rule. | PUB-09, ABS-02, EXP-02 |
| 15 | Any faculty member could read any other faculty member's duties and mark absentees in any hall. | Own duties / own hall only. | FDASH-02, ABS-03 |
| 16 | Moving an Anna plan from PUBLISHED back to FINAL recreated its duties (duplicates); PUBLISHED to DRAFT left them behind. | Explicit transitions: duties are created on DRAFT → FINAL and removed on unlock. | ANNA-05/07 |

Earlier fixes, also covered by tests: shared subject codes, invalid sessions wiping plans, automatic internal generation dropping students, and arrear registrations hiding whole classes. See [test-data/README.md](../test-data/README.md).

### Behaviour changes to be aware of

- **Manual "Generate"** now seats only the students scheduled for that session. Sessions created by hand, with no timetable rows, still seat everyone.
- **Delegation email links** from before this change have no link token, so they now ask the person to log in. New emails work without a login.
- **Anna plans** moved from FINAL back to DRAFT now lose their duties until they are finalized again.
