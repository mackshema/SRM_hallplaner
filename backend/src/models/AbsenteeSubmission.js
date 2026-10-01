import mongoose from "mongoose";

/**
 * Absentees reported by an invigilator for one hall of one plan. Editable while
 * the upload window is open; each save is kept in `history`.
 */
const absenteeSubmissionSchema = new mongoose.Schema({
    planType: { type: String, enum: ["internal", "anna"], required: true },
    planId: { type: mongoose.Schema.Types.ObjectId, required: true },
    hallId: { type: mongoose.Schema.Types.ObjectId, ref: "Hall", required: true },
    examDate: { type: String, required: true },
    session: { type: String, required: true },
    absentees: [{ type: String }], // register (roll) numbers
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    submittedByName: { type: String, default: "" },
    submittedAt: { type: Date, required: true },
    history: [{
        _id: false,
        absentees: [String],
        submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        submittedByName: String,
        submittedAt: Date
    }]
}, { timestamps: true });

absenteeSubmissionSchema.index({ planType: 1, planId: 1, hallId: 1 }, { unique: true });

export default mongoose.models.AbsenteeSubmission || mongoose.model("AbsenteeSubmission", absenteeSubmissionSchema);
