import FacultyDuty from '../models/FacultyDuty.js';

// FN comes before AN on the same day. (Plain string sorting gets this wrong: "AN" < "FN".)
const SESSION_RANK = { FN: 0, AN: 1 };
const slotKey = (examDate, session) => `${examDate}#${SESSION_RANK[session] ?? 9}`;

/** Sort comparator: chronological by date, FN before AN. Items use `session` or `examSession`. */
export const compareSessions = (a, b) =>
  slotKey(a.examDate, a.session ?? a.examSession).localeCompare(slotKey(b.examDate, b.session ?? b.examSession));

/**
 * The session immediately before (examDate, session) among `slots`
 * ({examDate, session|examSession}[]), as { examDate, examSession }, or null.
 * Used for the "no continuous duty" rule.
 */
export const previousSession = (examDate, session, slots) => {
  const current = slotKey(examDate, session);
  let best = null;
  for (const s of slots) {
    const ses = s.session ?? s.examSession;
    const key = slotKey(s.examDate, ses);
    if (key < current && (!best || key > best.key)) best = { key, examDate: s.examDate, examSession: ses };
  }
  return best && { examDate: best.examDate, examSession: best.examSession };
};

/**
 * Duties implied by a generated-but-not-finalized plan. Generation runs create
 * many sessions before anything is finalized, so the duty rules (no continuous
 * duty, weekly limit) must count these as well as saved FacultyDuty records.
 */
export const dutiesFromAssignments = (examDate, examSession, facultyAssignments = []) =>
  facultyAssignments.flatMap((fa) =>
    (fa.facultyIds || []).map((facultyId) => ({ facultyId: String(facultyId), examDate, examSession }))
  );

/**
 * Deletes the faculty duties of the given sessions only.
 * Internal and Anna University plans share the FacultyDuty collection, so a
 * module must never wipe it wholesale - that would erase the other module's
 * finalized duties.
 * @param {{ examDate: string, examSession: string }[]} sessions
 */
export const deleteSessionDuties = async (sessions) => {
  if (!sessions.length) return;
  await FacultyDuty.deleteMany({
    $or: sessions.map(({ examDate, examSession }) => ({ examDate, examSession })),
  });
};
