/**
 * Unit tests for the department-quota invigilator allocation.
 *
 *   cd backend && npm run test:unit
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeDepartmentQuota,
  allocateFaculty,
  vacancyMessage,
} from "../src/utils/facultyAllocation.js";

const fixedRandom = () => 0.42;

const makeFaculty = (spec) => {
  // spec: { CSE: 3, ECE: 2 } -> [{_id:'CSE-1', department:'CSE'}, ...]
  const out = [];
  for (const [dept, n] of Object.entries(spec)) {
    for (let i = 1; i <= n; i++) out.push({ _id: `${dept}-${i}`, name: `${dept} ${i}`, department: dept });
  }
  return out;
};

const makeHalls = (n, required = 1) =>
  Array.from({ length: n }, (_, i) => ({ hallId: `H${i + 1}`, hallName: `Hall ${i + 1}`, required }));

const usageOf = (result, faculty) => {
  const dept = new Map(faculty.map((f) => [String(f._id), f.department]));
  const usage = {};
  result.facultyAssignments.flatMap((a) => a.facultyIds).forEach((id) => {
    usage[dept.get(id)] = (usage[dept.get(id)] || 0) + 1;
  });
  return usage;
};

test("quota: 1 hall needing 1 invigilator gives quota 1 (never 0)", () => {
  assert.equal(computeDepartmentQuota(1), 1);
});

test("quota: even total is halved exactly", () => {
  assert.equal(computeDepartmentQuota(10), 5);
});

test("quota: odd total rounds up with ceil", () => {
  assert.equal(computeDepartmentQuota(7), 4);
});

test("quota: rounding is switchable and still never 0", () => {
  assert.equal(computeDepartmentQuota(7, "floor"), 3);
  assert.equal(computeDepartmentQuota(1, "floor"), 1);
  assert.equal(computeDepartmentQuota(0), 0);
});

test("1 hall: filled from a single department without a vacancy", () => {
  const faculty = makeFaculty({ CSE: 3 });
  const r = allocateFaculty({ halls: makeHalls(1), faculty, random: fixedRandom });
  assert.equal(r.quota, 1);
  assert.equal(r.vacancies.length, 0);
  assert.equal(r.facultyAssignments[0].facultyIds.length, 1);
});

test("even total: no department exceeds the quota", () => {
  const faculty = makeFaculty({ CSE: 10, ECE: 10, MECH: 10 });
  const r = allocateFaculty({ halls: makeHalls(4, 2), faculty, random: fixedRandom });
  assert.equal(r.quota, 4);
  assert.equal(r.vacancies.length, 0);
  for (const n of Object.values(usageOf(r, faculty))) assert.ok(n <= 4);
});

test("odd total: quota is respected and all halls are staffed", () => {
  const faculty = makeFaculty({ CSE: 10, ECE: 10 });
  const r = allocateFaculty({ halls: makeHalls(5), faculty, random: fixedRandom });
  assert.equal(r.quota, 3);
  assert.equal(r.vacancies.length, 0);
  const usage = usageOf(r, faculty);
  assert.ok(usage.CSE <= 3 && usage.ECE <= 3);
});

test("one department with a single faculty: used once, the rest come from others", () => {
  const faculty = makeFaculty({ CIVIL: 1, CSE: 5, ECE: 5 });
  const r = allocateFaculty({ halls: makeHalls(6), faculty, random: fixedRandom });
  const usage = usageOf(r, faculty);
  assert.equal(usage.CIVIL, 1);
  assert.equal(r.vacancies.length, 0);
});

test("all departments exhausted: reports vacancies and never exceeds the quota", () => {
  // 6 halls -> quota 3; only 2 departments with 2 faculty each = 4 invigilators max
  const faculty = makeFaculty({ CSE: 2, ECE: 2 });
  const r = allocateFaculty({ halls: makeHalls(6), faculty, random: fixedRandom });
  const usage = usageOf(r, faculty);
  assert.ok(usage.CSE <= 3 && usage.ECE <= 3);
  const missing = r.vacancies.reduce((n, v) => n + v.missing, 0);
  assert.equal(missing, 2);
});

test("quota exhausted before the pool: vacancies instead of breaking the quota", () => {
  // 4 halls -> quota 2, but only CSE faculty exist -> 2 staffed, 2 vacant
  const faculty = makeFaculty({ CSE: 10 });
  const r = allocateFaculty({ halls: makeHalls(4), faculty, random: fixedRandom });
  assert.equal(usageOf(r, faculty).CSE, 2);
  assert.equal(r.vacancies.length, 2);
});

test("vacancy prompt: message lists halls still needing faculty", () => {
  const faculty = makeFaculty({ CSE: 1 });
  const r = allocateFaculty({ halls: makeHalls(3), faculty, random: fixedRandom });
  assert.equal(r.vacancies.length, 2);
  assert.deepEqual(r.vacancies.map((v) => v.hallName), ["Hall 2", "Hall 3"]);
  assert.equal(vacancyMessage(r.vacancies), "2 halls still need faculty (2 invigilators missing)");
  assert.equal(vacancyMessage([]), null);
});

test("ineligible faculty (same-session duty, reserve, excluded) are skipped", () => {
  const faculty = makeFaculty({ CSE: 2, ECE: 2 });
  const blocked = new Set(["CSE-1", "ECE-1"]);
  const r = allocateFaculty({ halls: makeHalls(2), faculty, isEligible: (f) => !blocked.has(f._id), random: fixedRandom });
  const ids = r.facultyAssignments.flatMap((a) => a.facultyIds);
  assert.ok(!ids.includes("CSE-1") && !ids.includes("ECE-1"));
});

test("fairness: faculty with fewer duties are picked first", () => {
  const faculty = makeFaculty({ CSE: 3, ECE: 3 });
  const dutyCounts = { "CSE-1": 5, "CSE-2": 0, "CSE-3": 5, "ECE-1": 5, "ECE-2": 5, "ECE-3": 0 };
  const r = allocateFaculty({ halls: makeHalls(2), faculty, dutyCounts, random: fixedRandom });
  assert.deepEqual(r.facultyAssignments.flatMap((a) => a.facultyIds).sort(), ["CSE-2", "ECE-3"]);
});

test("re-run for vacancies only keeps existing invigilators and counts them toward the quota", () => {
  const faculty = makeFaculty({ CSE: 5, ECE: 5 });
  const halls = [
    { hallId: "H1", required: 1, assigned: ["CSE-1"] },
    { hallId: "H2", required: 1, assigned: ["CSE-2"] },
    { hallId: "H3", required: 1 },
    { hallId: "H4", required: 1 },
  ];
  const r = allocateFaculty({ halls, faculty, random: fixedRandom });
  assert.deepEqual(r.facultyAssignments[0].facultyIds, ["CSE-1"]);
  assert.deepEqual(r.facultyAssignments[1].facultyIds, ["CSE-2"]);
  // quota 2 already used by CSE -> the two new invigilators must be ECE
  const added = [...r.facultyAssignments[2].facultyIds, ...r.facultyAssignments[3].facultyIds];
  assert.ok(added.every((id) => id.startsWith("ECE")));
});

test("demand overrides may exceed the quota", () => {
  const faculty = makeFaculty({ CSE: 4 });
  const r = allocateFaculty({ halls: makeHalls(4), faculty, demandIds: ["CSE-3", "CSE-4"], random: fixedRandom });
  assert.equal(r.vacancies.length, 0);
});
