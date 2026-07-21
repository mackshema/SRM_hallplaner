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
  isAbsent: { type: Boolean, default: false },
  markedAbsentAt: { type: Date, default: null },
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
  isPublished: { type: Boolean, default: false },
  facultyAssignments: [{
    hallId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hall' },
    facultyIds: [String]
  }]
}, { timestamps: true });

AnnaSeatingSchema.index(
  { examDate: 1, session: 1 },
  { unique: true }
);

export default mongoose.models.AnnaSeating || mongoose.model("AnnaSeating", AnnaSeatingSchema);
