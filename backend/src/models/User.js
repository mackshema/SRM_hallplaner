import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // Hashed password
    email: { type: String }, // For student accounts
    role: {
      type: String,
      enum: ["admin", "faculty", "student"], // Lowercase to match frontend
      default: "faculty"
    },
    department: {
      type: String,
      required: function() { return this.role === 'student'; }
    }, // Optional for faculty
    designation: { 
      type: String, 
      enum: ["Assistant Professor", "Associate Professor", "Professor", "HOD", ""]
    },
    facultyEmail: { type: String },
    hodEmail: { type: String },
    // New Generation Fields for Faculty
    isSelectedForGeneration: { type: Boolean, default: true },
    weeklyDutyCount: { type: Number, default: 0 },
    lastDutyDate: { type: Date },

    isSelected: { type: Boolean, default: true },
    program: {
      type: String,
      required: function() { return this.role === 'student'; }
    }, // 'Engineering', 'MBA', etc.
    degree: {
      type: String,
      required: function() { return this.role === 'student'; }
    }, // For grouping students by Year/Degree
    regulation: { type: String }, // e.g. '2021', '2025'
    branch: { type: String } // e.g. '104 - B.E. Computer Science and Engineering'
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
