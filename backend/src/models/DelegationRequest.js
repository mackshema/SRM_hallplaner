import mongoose from "mongoose";

const delegationSchema = new mongoose.Schema(
  {
    requestingFacultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    replacementFacultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    department: { type: String },
    designation: { type: String },
    examDate: { type: String, required: true },
    examSession: { type: String, required: true },
    hallNumber: { type: String, required: true },
    reason: { type: String },
    status: { 
      type: String, 
      enum: ["Pending HOD Approval", "Rejected by HOD", "Pending Faculty Response", "Accepted", "Declined"], 
      default: "Pending HOD Approval" 
    },
    hodApprovalStatus: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
    facultyResponseStatus: { type: String, enum: ["Pending", "Accepted", "Declined"], default: "Pending" }
  },
  { timestamps: true }
);

export default mongoose.model("DelegationRequest", delegationSchema);
