import Hall from "../models/Hall.js";
import User from "../models/User.js";
import ExamSchedule from "../models/ExamSchedule.js";
import ReserveFaculty from "../models/ReserveFaculty.js";
import DutySummary from "../models/DutySummary.js";
import { loadPlan, planHallsWithStudents, planHallStudents, planInvigilators, reserveQueryForPlan } from "../services/planService.js";
import { buildAbsenteeReport } from "../services/absenteeService.js";
import { generateDutySummary } from "../services/dutySummaryService.js";
import { loadBranding } from "../utils/logo.js";
import { formatIST } from "../utils/planStatus.js";

/**
 * The single data layer behind every export. Each document is described once
 * as plain data - { title, fileStem, orientation, sections[] } - and both the
 * Excel and the PDF renderer draw that same description, so the two formats
 * can't disagree.
 *
 * A section is { name, heading?, columns: [{ header, key, width }], rows: [{...}],
 *   rowStyles?: { [rowIndex]: { highlight: true } }, footer?: { left, right } }
 */

const byRoll = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
const byName = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
const safe = (s) => String(s || "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");

/** Plan-level document types (all available as .xlsx and .pdf). */
export const PLAN_DOCUMENTS = [
  { key: "hall-allotment", title: "Hall Allotment" },
  { key: "seating-plan", title: "Seating Plan (Bench Layout)" },
  { key: "student-list", title: "Hall-wise Student List" },
  { key: "faculty-duty", title: "Faculty Duty List" },
  { key: "reserve-faculty", title: "Reserve Faculty" },
  { key: "absentee-report", title: "Absentee Report" },
  { key: "summary", title: "Department Summary" },
];

export const SCHEDULE_DOCUMENTS = [{ key: "duty-summary", title: "Duty Summary" }];

/**
 * Loads everything a plan's documents need, once.
 * @param {{ hallId?: string }} [opts] limit halls (single-hall bench layout)
 */
export const loadPlanExportData = async (planType, planId, opts = {}) => {
  const plan = await loadPlan(planType, planId);
  if (!plan) return null;
  const [branding, schedule, hallsWithStudents, invigilators, reserves] = await Promise.all([
    loadBranding(),
    plan.examScheduleId ? ExamSchedule.findById(plan.examScheduleId).lean() : null,
    planHallsWithStudents(plan),
    planInvigilators(plan),
    ReserveFaculty.find(reserveQueryForPlan(plan)).populate("facultyId", "name department designation")
      .populate("convertedToHallId", "name").populate("replacedFacultyId", "name").lean(),
  ]);

  const selected = opts.hallId ? hallsWithStudents.filter((h) => h.hallId === String(opts.hallId)) : hallsWithStudents;
  const hallDocs = await Hall.find({ _id: { $in: selected.map((h) => h.hallId) } }).lean();
  const hallById = new Map(hallDocs.map((h) => [String(h._id), h]));
  const facultyIds = [...new Set([...invigilators.values()].flat())];
  const faculty = await User.find({ _id: { $in: facultyIds } }).select("name department designation").lean();
  const facultyById = new Map(faculty.map((f) => [String(f._id), f]));

  const halls = [];
  for (const h of selected) {
    const doc = hallById.get(h.hallId);
    if (!doc) continue;
    halls.push({
      hallId: h.hallId,
      name: doc.name,
      floor: doc.floor || "",
      rows: doc.rows,
      columns: doc.columns,
      seatsPerBench: doc.seatsPerBench,
      students: await planHallStudents(plan, h.hallId),
      invigilators: (invigilators.get(h.hallId) || []).map((id) => facultyById.get(id) || { name: "Unknown", department: "", designation: "" }),
    });
  }
  halls.sort((a, b) => byName(a.name, b.name));

  const examName = schedule?.name || (planType === "anna" ? "END SEMESTER EXAMINATIONS" : branding.examName);
  return {
    plan,
    branding,
    halls,
    reserves: reserves.filter((r) => r.facultyId),
    meta: {
      examName,
      examDate: plan.examDate,
      session: plan.session,
      examTime: plan.examTime,
      subtitle: `${examName ? `${examName} | ` : ""}Date: ${plan.examDate} | Session: ${plan.session}${plan.examTime ? ` | ${plan.examTime}` : ""}`,
      fileStem: safe(`${schedule?.name || (planType === "anna" ? "Anna_University" : "Internal")}_${plan.examDate}_${plan.session}`),
    },
  };
};

const reserveNames = (data) =>
  data.reserves.filter((r) => r.status === "reserve").map((r) => `${r.facultyId.name}${r.facultyId.department ? ` (${r.facultyId.department})` : ""}`);

const SIGNATURE = "Name & Signature of the Hall Superintendent";

/** Consecutive-roll ranges per hall + department. */
const allotmentRows = (data) => {
  const rows = [];
  for (const hall of data.halls) {
    const byDept = new Map();
    hall.students.forEach((s) => {
      const d = s.department || "Unknown";
      if (!byDept.has(d)) byDept.set(d, []);
      byDept.get(d).push(s.rollNumber);
    });
    for (const [dept, rolls] of [...byDept.entries()].sort((a, b) => byName(a[0], b[0]))) {
      rolls.sort(byRoll);
      rows.push({ hall: hall.name, floor: hall.floor, department: dept, from: rolls[0], to: rolls[rolls.length - 1], count: rolls.length });
    }
  }
  return rows;
};

const benchLayoutSection = (hall, data) => {
  const seatsPerRow = hall.columns * hall.seatsPerBench;
  const columns = [{ header: "Row", key: "row", width: 6 }];
  for (let c = 0; c < seatsPerRow; c++) {
    const bench = Math.floor(c / hall.seatsPerBench) + 1;
    const seat = (c % hall.seatsPerBench) + 1;
    columns.push({ header: hall.seatsPerBench > 1 ? `B${bench}-S${seat}` : `B${bench}`, key: `c${c}`, width: 15 });
  }
  const grid = new Map();
  const extras = [];
  hall.students.forEach((s) => {
    if (s.isExtraBench) { extras.push(s); return; }
    grid.set(`${s.row}:${(s.column - 1) * hall.seatsPerBench + (s.benchPosition - 1)}`, s);
  });
  const absentCells = [];
  const rows = [];
  for (let r = 1; r <= hall.rows; r++) {
    const row = { row: r };
    for (let c = 0; c < seatsPerRow; c++) {
      const s = grid.get(`${r}:${c}`);
      row[`c${c}`] = s ? (s.isAbsent ? `${s.rollNumber} (ABS)` : s.rollNumber) : "";
      if (s?.isAbsent) absentCells.push({ row: r - 1, key: `c${c}` });
    }
    rows.push(row);
  }
  if (extras.length) {
    const row = { row: "Extra" };
    extras.slice(0, seatsPerRow).forEach((s, i) => { row[`c${i}`] = s.isAbsent ? `${s.rollNumber} (ABS)` : s.rollNumber; });
    rows.push(row);
  }
  const reserves = reserveNames(data);
  return {
    name: hall.name,
    heading: `Hall ${hall.name}${hall.floor ? ` (${hall.floor})` : ""} - ${hall.students.length} candidates - BLACK BOARD at the front`,
    subheading: hall.invigilators.length ? `Invigilator(s): ${hall.invigilators.map((f) => f.name).join(", ")}` : "",
    columns,
    rows,
    absentCells,
    footer: {
      // Reserve faculty sit opposite the signature line
      left: `Reserve Faculty: ${reserves.length ? reserves.join(", ") : "None assigned"}`,
      right: SIGNATURE,
    },
  };
};

/** Builds one plan document definition from loaded data. */
export const buildPlanDocument = (key, data) => {
  const title = PLAN_DOCUMENTS.find((d) => d.key === key)?.title;
  if (!title) return null;
  const base = { key, title, fileStem: `${data.meta.fileStem}_${safe(title)}`, orientation: "portrait", sections: [] };

  switch (key) {
    case "hall-allotment":
      base.sections.push({
        name: "Hall Allotment",
        columns: [
          { header: "Hall", key: "hall", width: 14 }, { header: "Floor", key: "floor", width: 16 },
          { header: "Department", key: "department", width: 16 }, { header: "Reg. No. From", key: "from", width: 18 },
          { header: "Reg. No. To", key: "to", width: 18 }, { header: "No. of Candidates", key: "count", width: 12 },
        ],
        rows: allotmentRows(data),
        footer: { left: "Examcell Coordinator", right: "Chief Superintendent" },
      });
      break;
    case "seating-plan":
      base.orientation = "landscape";
      base.sections = data.halls.map((h) => benchLayoutSection(h, data));
      break;
    case "student-list":
      base.sections.push({
        name: "Students",
        columns: [
          { header: "Hall", key: "hall", width: 12 }, { header: "Seat", key: "seat", width: 14 },
          { header: "Register No.", key: "rollNumber", width: 18 }, { header: "Name", key: "name", width: 28 },
          { header: "Department", key: "department", width: 14 }, { header: "Subject", key: "subject", width: 14 },
          { header: "Absent", key: "absent", width: 8 },
        ],
        rows: data.halls.flatMap((h) => h.students.map((s) => ({
          hall: h.name,
          seat: s.isExtraBench ? `Extra B${s.column}-S${s.benchPosition}` : `R${s.row}-B${s.column}-S${s.benchPosition}`,
          rollNumber: s.rollNumber, name: s.name, department: s.department, subject: s.subjectCode, absent: s.isAbsent ? "ABS" : "",
        }))),
      });
      break;
    case "faculty-duty":
      base.sections.push({
        name: "Faculty Duty",
        columns: [
          { header: "Hall", key: "hall", width: 12 }, { header: "Floor", key: "floor", width: 16 },
          { header: "Faculty Name", key: "name", width: 28 }, { header: "Department", key: "department", width: 16 },
          { header: "Designation", key: "designation", width: 22 }, { header: "Role", key: "role", width: 14 },
          { header: "Signature", key: "signature", width: 18 },
        ],
        rows: [
          ...data.halls.flatMap((h) => h.invigilators.map((f) => ({
            hall: h.name, floor: h.floor, name: f.name, department: f.department || "", designation: f.designation || "", role: "Invigilator", signature: "",
          }))),
          ...data.reserves.filter((r) => r.status === "reserve").map((r) => ({
            hall: "-", floor: "Exam Control Cell", name: r.facultyId.name, department: r.facultyId.department || "",
            designation: r.facultyId.designation || "", role: "Reserve", signature: "",
          })),
        ],
      });
      break;
    case "reserve-faculty":
      base.sections.push({
        name: "Reserve Faculty",
        columns: [
          { header: "Faculty Name", key: "name", width: 28 }, { header: "Department", key: "department", width: 16 },
          { header: "Designation", key: "designation", width: 22 }, { header: "Status", key: "status", width: 14 },
          { header: "Converted To Hall", key: "hall", width: 16 }, { header: "Replaced", key: "replaced", width: 24 },
        ],
        rows: data.reserves.map((r) => ({
          name: r.facultyId.name, department: r.facultyId.department || "", designation: r.facultyId.designation || "",
          status: r.status === "converted" ? "Converted" : "Standby", hall: r.convertedToHallId?.name || "", replaced: r.replacedFacultyId?.name || "",
        })),
      });
      break;
    case "absentee-report":
      base.sections.push({
        name: "Absentees",
        columns: [
          { header: "Hall", key: "hall", width: 12 }, { header: "Invigilator(s)", key: "invigilators", width: 28 },
          { header: "Students", key: "students", width: 10 }, { header: "Submitted", key: "submitted", width: 12 },
          { header: "Submitted At", key: "submittedAt", width: 22 }, { header: "Absent", key: "count", width: 10 },
          { header: "Absentees", key: "absentees", width: 40 },
        ],
        rows: (data.absentees?.halls || []).map((h) => ({
          hall: h.hallName, invigilators: h.invigilators.map((f) => f.name).join(", "), students: h.studentCount,
          submitted: h.submitted ? "Yes" : h.closedWithoutSubmission ? "No (window closed)" : "No",
          submittedAt: h.submittedAt ? formatIST(h.submittedAt) : "", count: h.absenteeCount, absentees: h.absentees.join(", "),
        })),
      });
      break;
    case "summary": {
      const depts = new Map();
      data.halls.forEach((h) => h.students.forEach((s) => {
        const d = s.department || "Unknown";
        if (!depts.has(d)) depts.set(d, { students: 0, halls: new Set(), absent: 0 });
        const e = depts.get(d);
        e.students++; e.halls.add(h.name); if (s.isAbsent) e.absent++;
      }));
      base.sections.push({
        name: "Summary",
        columns: [
          { header: "Department", key: "department", width: 18 }, { header: "Candidates", key: "students", width: 12 },
          { header: "Absent", key: "absent", width: 10 }, { header: "Halls", key: "halls", width: 40 },
        ],
        rows: [...depts.entries()].sort((a, b) => byName(a[0], b[0])).map(([department, e]) => ({
          department, students: e.students, absent: e.absent, halls: [...e.halls].sort(byName).join(", "),
        })),
      });
      break;
    }
  }
  return base;
};

/** Adds the data that only some documents need (kept out of the base load). */
export const ensureDocumentData = async (key, data) => {
  if (key === "absentee-report" && !data.absentees) data.absentees = await buildAbsenteeReport(data.plan);
  return data;
};

/** Schedule-level duty summary document (uses the saved summary; generates it if missing). */
export const buildDutySummaryDocument = async (scheduleId) => {
  const schedule = await ExamSchedule.findById(scheduleId).lean();
  if (!schedule) return null;
  const summary = (await DutySummary.findOne({ examScheduleId: scheduleId }).lean()) || (await generateDutySummary(scheduleId, "export"));
  const branding = await loadBranding();
  const fileStem = safe(`${schedule.name}_Duty_Summary`);
  return {
    branding,
    meta: {
      examName: schedule.name,
      subtitle: `${schedule.name}${schedule.academicYear ? ` | ${schedule.academicYear}` : ""} | ${summary.isComplete ? "Complete" : `${summary.publishedPlans} of ${summary.totalPlans} plans published`}`,
      fileStem,
    },
    doc: {
      key: "duty-summary",
      title: "Duty Summary",
      fileStem,
      orientation: "landscape",
      sections: [
        {
          name: "Faculty Duties",
          heading: `${summary.totalFacultyWithDuty} faculty with duty - ${summary.totalDuties} duties`,
          columns: [
            { header: "Faculty Name", key: "name", width: 26 }, { header: "Department", key: "department", width: 14 },
            { header: "Designation", key: "designation", width: 20 }, { header: "Invigilator", key: "inv", width: 11 },
            { header: "Reserve", key: "res", width: 9 }, { header: "Total Duties", key: "total", width: 11 },
            { header: "Duties (Date / Session / Hall)", key: "details", width: 60 },
          ],
          rows: summary.faculty.map((f) => ({
            name: f.name, department: f.department, designation: f.designation, inv: f.invigilatorCount, res: f.reserveCount, total: f.dutyCount,
            details: f.duties.map((d) => `${d.date} ${d.session} ${d.role === "reserve" ? "Reserve" : d.hallName}`).join("; "),
          })),
        },
        {
          name: "Reserve Faculty",
          columns: [
            { header: "Faculty Name", key: "name", width: 26 }, { header: "Department", key: "department", width: 14 },
            { header: "Designation", key: "designation", width: 20 }, { header: "Reserve Count", key: "count", width: 12 },
            { header: "Converted", key: "converted", width: 11 }, { header: "Details", key: "details", width: 60 },
          ],
          rows: summary.reserves.map((r) => ({
            name: r.name, department: r.department, designation: r.designation, count: r.reserveCount, converted: r.convertedCount,
            details: r.records.map((x) => `${x.date} ${x.session}${x.status === "converted" ? ` -> Hall ${x.convertedHallName}` : ""}`).join("; "),
          })),
        },
      ],
    },
  };
};

/** One faculty member's duty history (Change 7 export). */
export const buildFacultyHistoryDocument = async (history) => {
  const branding = await loadBranding();
  const fileStem = safe(`${history.faculty.name}_Duty_History`);
  const label = new Map(history.categories.map((c) => [c.key, c.label]));
  return {
    branding,
    meta: { examName: "Exam Duty History", subtitle: `${history.faculty.name} | ${history.faculty.department || ""} | ${history.total} duties`, fileStem },
    doc: {
      key: "faculty-history",
      title: "Exam Duty History",
      fileStem,
      orientation: "portrait",
      sections: [{
        name: "Duties",
        heading: history.categories.map((c) => `${c.label}: ${history.countsByCategory[c.key] || 0}`).join("   "),
        columns: [
          { header: "Category", key: "category", width: 18 }, { header: "Exam", key: "exam", width: 22 },
          { header: "Date", key: "date", width: 12 }, { header: "Session", key: "session", width: 9 },
          { header: "Hall", key: "hall", width: 12 }, { header: "Subject(s)", key: "subjects", width: 22 },
          { header: "Role", key: "role", width: 12 },
        ],
        rows: history.duties.map((d) => ({
          category: label.get(d.category) || d.category, exam: d.examScheduleName, date: d.examDate, session: d.session,
          hall: d.hallName, subjects: d.subjects.join(", "), role: d.role,
        })),
      }],
    },
  };
};
