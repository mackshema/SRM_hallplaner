import mongoose from "mongoose";

const FacultySchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // hashed
  role: { type: String, default: "FACULTY" },

  assignedHalls: [
    {
      hallId: Number,
      hallName: String,
      floor: String
    }
  ],

  active: { type: Boolean, default: true }
});

export default mongoose.model("Faculty", FacultySchema);
