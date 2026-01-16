import mongoose from "mongoose";

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },

    rollNumberStart: { type: String, required: true },

    rollNumberEnd: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model("Department", departmentSchema);
