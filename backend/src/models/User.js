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
    isSelectedForGeneration: { type: Boolean, default: false },
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
    } // For grouping students by Year/Degree
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
