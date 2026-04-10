import mongoose from "mongoose";

const AnnaExamDataSchema = new mongoose.Schema({
  rollNumber: {
    type: String,
    required: false,
  },
  subjectCode: {
    type: String,
    required: true,
  },
  department: {
    type: String,
    required: true,
  },
  studentName: {
    type: String,
    required: false,
    default: "",
  },
  year: {
    type: String,
    default: "",
  },
  // Timetable feeds update these
  examDate: {
    type: String,
    default: "",
  },
  session: {
    type: String, 
    enum: ["", "FN", "AN"],
    default: "",
  }
}, { timestamps: true });

export default mongoose.models.AnnaExamData || mongoose.model("AnnaExamData", AnnaExamDataSchema);
