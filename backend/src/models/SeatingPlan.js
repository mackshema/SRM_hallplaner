import mongoose from "mongoose";

const SeatingPlanSchema = new mongoose.Schema({
    examDate: { type: String, required: true },
    examSession: { type: String, required: true },
    examTime: { type: String, required: true },
    halls: [
        {
            hallId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hall' },
            assignments: [], // Array of seat assignments
            facultyAssigned: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Faculty' }]
        }
    ],
    isFinalized: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model("SeatingPlan", SeatingPlanSchema);
