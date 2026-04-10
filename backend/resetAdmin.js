import mongoose from "mongoose";
import User from "./src/models/User.js";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/exam-seating");
  
  await User.deleteMany({}); // Clear existing users to prevent conflicts
  
  const salt = await bcrypt.genSalt(10);
  const hashedStudentPassword = await bcrypt.hash("student123", salt);

  const users = [
      { name: "Admin User", username: "SRM@Admin", password: "Admin@12345678", role: "admin" },
      { name: "Faculty User", username: "faculty@1234", password: "srm@123456789", role: "faculty" },
      { name: "Demo Student", username: "911123149001", password: hashedStudentPassword, role: "student", email: "student@example.com" }
  ];

  await User.insertMany(users);
  
  console.log("Users successfully restored to original credentials");
  process.exit(0);
}
run();
