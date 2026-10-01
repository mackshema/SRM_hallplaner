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
  status: { type: String, enum: ["DRAFT", "FINAL", "SCHEDULED", "PUBLISHED"], default: "DRAFT" },
  isPublished: { type: Boolean, default: false },
  publish_at: { type: Date, default: null }, // IST scheduled publish timestamp
  finalizedAt: { type: Date, default: null },
  // Exam timing (set from the publish dialog). Null = no live status / absentee upload yet.
  start_at: { type: Date, default: null },
  end_at: { type: Date, default: null },
  absentee_window_minutes: { type: Number, default: null }, // null = Settings default
  // Exam schedule / cycle this plan belongs to
  examScheduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamSchedule', default: null },
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
