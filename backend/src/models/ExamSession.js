import mongoose from "mongoose";

const examSessionSchema = new mongoose.Schema(
    {
        examDate: { type: String, required: true },
        examSession: { type: String, enum: ["FN", "AN"], required: true },
        examTime: { type: String, required: true },
        status: { type: String, enum: ["DRAFT", "FINAL"], default: "DRAFT" },
        finalizedAt: Date,
        isPublished: { type: Boolean, default: false },
        // Configuration specific to this session
        activeHalls: [{ type: mongoose.Schema.Types.ObjectId, ref: "Hall" }],
        activeDepartments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Department" }],
        selectedFaculty: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    },
    { timestamps: true }
);

// Prevent duplicate sessions for same date/session
examSessionSchema.index({ examDate: 1, examSession: 1 }, { unique: true });

export default mongoose.model("ExamSession", examSessionSchema);
