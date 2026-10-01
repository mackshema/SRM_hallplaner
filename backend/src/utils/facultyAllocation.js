/**
 * Invigilator allocation with a per-department quota.
 *
 * quota = (total faculty required in the run) / 2, rounded by QUOTA_ROUNDING.
 * No department may supply more than `quota` invigilators in one run, so the
 * halls can't all be filled from one department. When the pool runs out, halls
 * are reported as vacancies instead of silently breaking the quota; the admin
 * then fills them by hand (manual picks may exceed the quota) or re-runs the
 * auto-fill for the remaining vacancies only.
 *
 * Kept free of database access so the rules can be unit-tested
 * (tests/facultyAllocation.test.js).
 */

/** Switch to "floor" or "round" here. "ceil" never gives a quota of 0 when a hall needs faculty. */
export const QUOTA_ROUNDING = "ceil";

const ROUNDERS = { ceil: Math.ceil, floor: Math.floor, round: Math.round };

export const NO_DEPARTMENT = "(No Department)";

/**
 * Maximum invigilators one department may supply in a run.
 * @param {number} totalRequired total invigilators needed across all halls
 */
export const computeDepartmentQuota = (totalRequired, rounding = QUOTA_ROUNDING) => {
  if (!totalRequired || totalRequired <= 0) return 0;
  const round = ROUNDERS[rounding] || Math.ceil;
  return Math.max(1, round(totalRequired / 2));
};

const shuffled = (items, random) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/**
 * @param {object} opts
 * @param {{hallId: any, hallName?: string, required: number, assigned?: string[]}[]} opts.halls
 *   halls to staff, in fill order; `assigned` = invigilators already there (kept, and counted
 *   toward the quota - used when re-running for the remaining vacancies only)
 * @param {{_id: any, name?: string, department?: string}[]} opts.faculty candidate pool
 * @param {(faculty) => boolean} [opts.isEligible] hard rules for this session (same-session
 *   duty, reserve, weekly limit, continuous duty...). Evaluated once per faculty.
 * @param {Record<string, number>} [opts.dutyCounts] duties each faculty already has; fewer = preferred
 * @param {string[]} [opts.demandIds] admin "demand" overrides; these may exceed the quota
 * @param {number} [opts.quota] override the computed quota
 * @param {() => number} [opts.random] tie-break randomness (injectable for tests)
 */
export function allocateFaculty({
  halls,
  faculty,
  isEligible = () => true,
  dutyCounts = {},
  demandIds = [],
  quota,
  random = Math.random,
}) {
  const totalRequired = halls.reduce((n, h) => n + Math.max(0, h.required || 0), 0);
  const deptQuota = quota ?? computeDepartmentQuota(totalRequired);

  const deptOf = new Map(faculty.map((f) => [String(f._id), f.department || NO_DEPARTMENT]));
  const demand = new Set(demandIds.map(String));
  const used = new Set();
  const deptUsage = {};
  const bump = (id) => {
    const dept = deptOf.get(id) ?? NO_DEPARTMENT;
    deptUsage[dept] = (deptUsage[dept] || 0) + 1;
  };

  const result = halls.map((h) => ({ hallId: h.hallId, facultyIds: (h.assigned || []).map(String) }));
  for (const r of result) r.facultyIds.forEach((id) => { used.add(id); bump(id); });

  // Fairness: fewer existing duties first; the shuffle breaks ties randomly
  const pool = shuffled(faculty, random)
    .map((f, order) => ({ f, id: String(f._id), order }))
    .filter(({ f }) => isEligible(f))
    .sort((a, b) => (dutyCounts[a.id] || 0) - (dutyCounts[b.id] || 0) || a.order - b.order);

  halls.forEach((hall, i) => {
    const slot = result[i];
    while (slot.facultyIds.length < (hall.required || 0)) {
      const hallDepts = new Set(slot.facultyIds.map((id) => deptOf.get(id)));
      let best = null;
      let bestKey = null;
      for (const cand of pool) {
        if (used.has(cand.id)) continue;
        const dept = deptOf.get(cand.id);
        const usage = deptUsage[dept] || 0;
        if (usage >= deptQuota && !demand.has(cand.id)) continue;
        // Prefer: regular faculty over demand overrides (the override pool is used only
        // once the quota blocks everyone else), a department not yet in this hall, the
        // least-used department, fewer duties, then shuffle order.
        const key = [
          demand.has(cand.id) ? 1 : 0,
          hallDepts.has(dept) ? 1 : 0,
          usage,
          dutyCounts[cand.id] || 0,
          cand.order,
        ];
        if (!bestKey || lexLess(key, bestKey)) {
          best = cand;
          bestKey = key;
        }
      }
      if (!best) break;
      slot.facultyIds.push(best.id);
      used.add(best.id);
      bump(best.id);
    }
  });

  const vacancies = halls
    .map((h, i) => ({
      hallId: h.hallId,
      hallName: h.hallName || String(h.hallId),
      required: h.required || 0,
      assigned: result[i].facultyIds.length,
      missing: Math.max(0, (h.required || 0) - result[i].facultyIds.length),
    }))
    .filter((v) => v.missing > 0);

  return { facultyAssignments: result, vacancies, quota: deptQuota, deptUsage, totalRequired };
}

const lexLess = (a, b) => {
  for (let k = 0; k < a.length; k++) {
    if (a[k] !== b[k]) return a[k] < b[k];
  }
  return false;
};

/** Admin-facing prompt text: "X halls still need faculty". */
export const vacancyMessage = (vacancies) => {
  if (!vacancies?.length) return null;
  const halls = vacancies.length;
  const seats = vacancies.reduce((n, v) => n + v.missing, 0);
  return `${halls} hall${halls === 1 ? "" : "s"} still need${halls === 1 ? "s" : ""} faculty (${seats} invigilator${seats === 1 ? "" : "s"} missing)`;
};
