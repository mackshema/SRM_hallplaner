import mongoose from "mongoose";

/**
 * Saved duty summary for one exam schedule. Generated automatically when the
 * schedule becomes Complete, and regenerated whenever a plan in it changes
 * afterwards - so page loads read it instead of recomputing.
 */
const dutyItemSchema = new mongoose.Schema({
    date: String,
    session: String,
    examTime: String,
    hallName: String,
    examName: String,
    subjects: [String],
    role: String, // 'invigilator' | 'reserve'
    planType: String,
    convertedFromReserve: Boolean
}, { _id: false });

const facultySummarySchema = new mongoose.Schema({
    facultyId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, default: "" },
    department: { type: String, default: "" },
    designation: { type: String, default: "" },
    dutyCount: { type: Number, default: 0 },
    invigilatorCount: { type: Number, default: 0 },
    reserveCount: { type: Number, default: 0 },
    duties: [dutyItemSchema]
}, { _id: false });

const reserveSummarySchema = new mongoose.Schema({
    facultyId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, default: "" },
    department: { type: String, default: "" },
    designation: { type: String, default: "" },
    reserveCount: { type: Number, default: 0 },
    convertedCount: { type: Number, default: 0 },
    records: [{
        _id: false,
        date: String,
        session: String,
        status: String, // 'reserve' | 'converted'
        convertedHallName: String
    }]
}, { _id: false });

const dutySummarySchema = new mongoose.Schema({
    examScheduleId: { type: mongoose.Schema.Types.ObjectId, ref: "ExamSchedule", required: true, unique: true },
    examScheduleName: { type: String, default: "" },
    category: { type: String, default: "" },
    academicYear: { type: String, default: "" },
    isComplete: { type: Boolean, default: false },
    totalPlans: { type: Number, default: 0 },
    publishedPlans: { type: Number, default: 0 },
    totalFacultyWithDuty: { type: Number, default: 0 },
    totalDuties: { type: Number, default: 0 },
    faculty: [facultySummarySchema],
    reserves: [reserveSummarySchema],
    generatedAt: { type: Date, default: Date.now },
    generatedReason: { type: String, default: "" }
}, { timestamps: true });

export default mongoose.models.DutySummary || mongoose.model("DutySummary", dutySummarySchema);
