import mongoose from "mongoose";

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    rollNumberStart: { type: String, required: true },
    rollNumberEnd: { type: String, required: true },
    examSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamSession' },
    isSelected: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Department", departmentSchema);
