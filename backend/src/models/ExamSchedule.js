import mongoose from "mongoose";

/**
 * An exam schedule / cycle (e.g. "IAT 1 - 2025-2026 ODD"). Seating plans join
 * it through their own `examScheduleId` field (ExamSession and AnnaSeating).
 *
 * A schedule is Complete when every plan under it is Published (not just
 * Scheduled). The duty summary is generated automatically at that point and
 * saved (see services/dutySummaryService.js).
 */
const examScheduleSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    // Key from Settings.examCategories (IAT1, IAT2, MODEL, ANNA, ...)
    category: {
        type: String,
        default: "IAT1",
        trim: true
    },
    academicYear: {
        type: String,
        default: ""
    },
    semester: {
        type: String,
        default: ""
    },
    isComplete: {
        type: Boolean,
        default: false
    },
    completedAt: {
        type: Date,
        default: null
    },
    notes: {
        type: String,
        default: ""
    }
}, { timestamps: true });

examScheduleSchema.index({ name: 1, academicYear: 1 }, { unique: true });

export default mongoose.models.ExamSchedule || mongoose.model("ExamSchedule", examScheduleSchema);
