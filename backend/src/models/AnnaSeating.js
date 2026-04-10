import mongoose from "mongoose";

const assignmentSchema = new mongoose.Schema({
  hallId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hall' },
  hallName: String,
  row: Number,
  column: Number,
  benchPosition: Number,
  rollNumber: String,
  subjectCode: String,
  department: String,
});

const AnnaSeatingSchema = new mongoose.Schema({
  examDate: {
    type: String,
    required: true,
  },
  session: {
    type: String,
    required: true,
  },
  assignments: [assignmentSchema],
  status: { type: String, default: "DRAFT" },
  isPublished: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.models.AnnaSeating || mongoose.model("AnnaSeating", AnnaSeatingSchema);
