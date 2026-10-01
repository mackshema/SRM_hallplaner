import mongoose from "mongoose";

const reserveFacultySchema = new mongoose.Schema({
    facultyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    examType: {
        type: String,
        enum: ["Internal", "Anna"],
        default: "Internal"
    },
    examSessionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ExamSession",
        default: null
    },
    // The plan this reserve belongs to: ExamSession._id (Internal) or AnnaSeating._id (Anna).
    // Only a link - faculty details always come from the User record.
    planId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null
    },
    examDate: {
        type: String,
        required: true
    },
    examSession: {
        type: String,
        enum: ["FN", "AN"],
        required: true
    },
    role: {
        type: String,
        default: "reserve"
    },
    status: {
        type: String,
        enum: ["reserve", "converted", "cancelled"],
        default: "reserve"
    },
    convertedToHallId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Hall",
        default: null
    },
    replacedFacultyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },
    convertedAt: {
        type: Date,
        default: null
    }
}, { timestamps: true });

reserveFacultySchema.index(
    { facultyId: 1, examDate: 1, examSession: 1, status: 1 }
);

export default mongoose.models.ReserveFaculty || mongoose.model("ReserveFaculty", reserveFacultySchema);
