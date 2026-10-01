import mongoose from "mongoose";

/**
 * One exam duty of one faculty member: the table behind the Duty Summary page
 * and the per-faculty duty history (IAT 1 / IAT 2 / Model / Anna breakdown).
 *
 * Rows are rebuilt per plan from the operational records (FacultyDuty for
 * invigilators, ReserveFaculty for reserves) whenever a plan's status,
 * invigilators or reserves change - see services/dutyRecordService.js. They are
 * never edited by hand, so they can't disagree with the plans.
 *
 * Visibility follows the plan's publish rule: planStatus + publish_at are
 * copied here, and readers use visibleDutyFilter() so Draft, Finalized and
 * not-yet-live Scheduled plans never show up.
 */
const dutyRecordSchema = new mongoose.Schema({
    facultyId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    examScheduleId: { type: mongoose.Schema.Types.ObjectId, ref: "ExamSchedule", default: null },
    examScheduleName: { type: String, default: "" },
    category: { type: String, default: "" }, // ExamSchedule.category (IAT1, IAT2, MODEL, ANNA...)
    academicYear: { type: String, default: "" },
    semester: { type: String, default: "" },

    planType: { type: String, enum: ["internal", "anna"], required: true },
    planId: { type: mongoose.Schema.Types.ObjectId, required: true },
    planStatus: { type: String, default: "FINAL" },
    publish_at: { type: Date, default: null },
    isPublished: { type: Boolean, default: false },

    examDate: { type: String, required: true },
    session: { type: String, enum: ["FN", "AN"], required: true },
    examTime: { type: String, default: "" },

    hallId: { type: mongoose.Schema.Types.ObjectId, ref: "Hall", default: null },
    hallName: { type: String, default: "" },
    subjects: [{ type: String }], // subject codes written in this hall

    role: { type: String, enum: ["invigilator", "reserve"], required: true },
    // invigilator rows: true when a reserve was converted into this hall duty
    convertedFromReserve: { type: Boolean, default: false },
    // reserve rows: 'reserve' (standby) or 'converted' (became a hall duty)
    reserveStatus: { type: String, default: null },
    convertedHallName: { type: String, default: "" }
}, { timestamps: true });

dutyRecordSchema.index({ facultyId: 1, examDate: -1 });
dutyRecordSchema.index({ examScheduleId: 1, facultyId: 1 });
dutyRecordSchema.index({ planType: 1, planId: 1 });

/** Only duties from plans that are published and past their publish time. */
export const visibleDutyFilter = (now = new Date()) => ({
    $or: [
        { planStatus: { $in: ["PUBLISHED", "SCHEDULED"] }, publish_at: { $ne: null, $lte: now } },
        { planStatus: "PUBLISHED", publish_at: null },
        { planStatus: "FINAL", isPublished: true, $or: [{ publish_at: null }, { publish_at: { $lte: now } }] },
    ],
});

/**
 * A converted reserve appears twice (the reserve row and the hall duty it became);
 * only the hall duty is counted as a duty.
 */
export const countsAsDuty = (record) => !(record.role === "reserve" && record.reserveStatus === "converted");

export default mongoose.models.DutyRecord || mongoose.model("DutyRecord", dutyRecordSchema);
