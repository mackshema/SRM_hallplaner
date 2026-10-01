import mongoose from "mongoose";

/**
 * Admin re-opening / extending the absentee upload window for one hall (or one
 * faculty member in that hall). Records are only ever added, so the collection
 * doubles as the audit log of who extended what, when and why.
 */
const absenteeWindowExtensionSchema = new mongoose.Schema({
    planType: { type: String, enum: ["internal", "anna"], required: true },
    planId: { type: mongoose.Schema.Types.ObjectId, required: true },
    hallId: { type: mongoose.Schema.Types.ObjectId, ref: "Hall", required: true },
    facultyId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // null = whole hall
    extendedUntil: { type: Date, required: true },
    reason: { type: String, required: true, trim: true },
    grantedBy: { type: String, default: "" }, // admin username
}, { timestamps: true });

absenteeWindowExtensionSchema.index({ planType: 1, planId: 1, hallId: 1 });

export default mongoose.models.AbsenteeWindowExtension || mongoose.model("AbsenteeWindowExtension", absenteeWindowExtensionSchema);
