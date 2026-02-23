import mongoose from "mongoose";

const FacultyDutySchema = new mongoose.Schema({
    facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    hallId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hall', required: true },
    examDate: { type: String, required: true },
    examSession: { type: String, required: true },
    examTime: { type: String, required: true }
}, { timestamps: true });

export default mongoose.model("FacultyDuty", FacultyDutySchema);
