import mongoose from "mongoose";

const HallDutySchema = new mongoose.Schema({
  facultyId: mongoose.Schema.Types.ObjectId,

  hallId: Number,
  hallName: String,
  floor: String,

  examDate: String,
  examSession: String,
  examTime: String
});

export default mongoose.model("HallDuty", HallDutySchema);
