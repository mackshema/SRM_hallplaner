import mongoose from "mongoose";

const examSessionSchema = new mongoose.Schema(
    {
        examDate: { type: String, required: true },
        examSession: { type: String, enum: ["FN", "AN"], required: true },
        examTime: { type: String, required: true },
        status: { type: String, enum: ["DRAFT", "FINAL", "SCHEDULED", "PUBLISHED"], default: "DRAFT" },
        finalizedAt: Date,
        isPublished: { type: Boolean, default: false },
        publish_at: { type: Date, default: null }, // IST scheduled publish timestamp
        // Exam timing (set from the publish dialog). Null = no live status / absentee upload yet.
        start_at: { type: Date, default: null },
        end_at: { type: Date, default: null },
        absentee_window_minutes: { type: Number, default: null }, // null = Settings default
        // Exam schedule / cycle this plan belongs to (IAT1, IAT2, Model, Anna...)
        examScheduleId: { type: mongoose.Schema.Types.ObjectId, ref: "ExamSchedule", default: null },
        // Configuration specific to this session
        activeHalls: [{ type: mongoose.Schema.Types.ObjectId, ref: "Hall" }],
        activeDepartments: [{ type: String }],
        selectedFaculty: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
        blockedCombinations: [[{ type: String }]], // Array of department strings

        // AL-07: Per-session faculty assignments (replaces global Hall.facultyAssigned)
        // Keyed by hallId so two concurrent generation runs never overwrite each other.
        facultyAssignments: [{
            hallId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Hall"
            },
            facultyIds: [{ type: String }]
        }],
    },
    { timestamps: true }
);

// Prevent duplicate sessions for same date/session
examSessionSchema.index({ examDate: 1, examSession: 1 }, { unique: true });

export default mongoose.model("ExamSession", examSessionSchema);
