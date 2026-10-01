import mongoose from "mongoose";
import ExamSession from "../models/ExamSession.js";
import AnnaSeating from "../models/AnnaSeating.js";
import ReserveFaculty from "../models/ReserveFaculty.js";
import DutyRecord from "../models/DutyRecord.js";
import DutySummary from "../models/DutySummary.js";
import { syncDutyRecordsForPlan } from "../services/dutyRecordService.js";

/**
 * Small, idempotent schema fixes applied on every startup.
 */
export const runMigrations = async () => {
  // InternalExamData used to have a UNIQUE index on
  // {subjectCode, department, examDate, session}. It blocked mapping more than
  // one student from the same department to a subject (manual map by roll number).
  try {
    const collection = mongoose.connection.collection("internalexamdatas");
    const indexes = await collection.indexes();
    const legacy = indexes.find(
      (i) => i.name === "subjectCode_1_department_1_examDate_1_session_1" && i.unique
    );
    if (legacy) {
      await collection.dropIndex(legacy.name);
      console.log("[MIGRATION] Dropped legacy unique index on InternalExamData");
    }
  } catch (err) {
    // Collection doesn't exist yet on a fresh database - nothing to migrate
    if (err.codeName !== "NamespaceNotFound") {
      console.warn("[MIGRATION] InternalExamData index check failed:", err.message);
    }
  }

  await once("publish-status-v1", migratePublishedPlans);
  await once("reserve-plan-link-v1", linkReservesToPlans);
  await once("duty-records-v2", rebuildDutyRecords);
};

/** Runs a one-time migration, remembered in the app_migrations collection. */
const once = async (id, fn) => {
  const markers = mongoose.connection.collection("app_migrations");
  try {
    if (await markers.findOne({ _id: id })) return;
    await fn();
    await markers.insertOne({ _id: id, appliedAt: new Date() });
    console.log(`[MIGRATION] Applied ${id}`);
  } catch (err) {
    console.warn(`[MIGRATION] ${id} failed (will retry next start):`, err.message);
  }
};

/**
 * Plans published before scheduled publishing existed were FINAL + isPublished.
 * They become PUBLISHED with publish_at = when they went live (best known time),
 * so they keep showing on dashboards and count as published for schedules.
 */
const migratePublishedPlans = async () => {
  for (const Model of [ExamSession, AnnaSeating]) {
    const legacy = await Model.find({ status: "FINAL", isPublished: true }).select("publish_at finalizedAt updatedAt").lean();
    for (const p of legacy) {
      await Model.updateOne({ _id: p._id }, {
        $set: { status: "PUBLISHED", publish_at: p.publish_at || p.finalizedAt || p.updatedAt || new Date() },
      });
    }
  }
};

/** Reserves saved before per-plan linking get the planId of their plan. */
const linkReservesToPlans = async () => {
  const unlinked = await ReserveFaculty.find({ planId: null }).lean();
  for (const r of unlinked) {
    let planId = r.examType === "Internal" ? r.examSessionId : null;
    if (!planId) {
      const plan = r.examType === "Anna"
        ? await AnnaSeating.findOne({ examDate: r.examDate, session: r.examSession }).select("_id").lean()
        : await ExamSession.findOne({ examDate: r.examDate, examSession: r.examSession }).select("_id").lean();
      planId = plan?._id || null;
    }
    if (planId) await ReserveFaculty.updateOne({ _id: r._id }, { $set: { planId } });
  }
};

/**
 * The duty table changed shape (plan type/id, schedule, visibility fields).
 * It holds derived data only, so it is rebuilt from the plans; summaries from
 * the old format (no schedule id) are dropped and regenerate on the next change.
 */
const rebuildDutyRecords = async () => {
  await DutyRecord.deleteMany({});
  await DutySummary.deleteMany({ examScheduleId: { $exists: false } });
  await DutySummary.collection.dropIndex("examScheduleName_1").catch(() => {});
  const locked = { status: { $in: ["FINAL", "SCHEDULED", "PUBLISHED"] } };
  for (const p of await ExamSession.find(locked).select("_id").lean()) await syncDutyRecordsForPlan("internal", p._id);
  for (const p of await AnnaSeating.find(locked).select("_id").lean()) await syncDutyRecordsForPlan("anna", p._id);
};
