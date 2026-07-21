import mongoose from "mongoose";
import User from "./src/models/User.js";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/exam_hall_allotment";

async function run() {
  try {
    console.log("Connecting to:", MONGO_URI);
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB.");

    // Update Admin User
    const adminSalt = await bcrypt.genSalt(10);
    const adminHashed = await bcrypt.hash("Admin@12345678", adminSalt);
    const adminResult = await User.updateOne(
      { username: "SRM@Admin" },
      { $set: { password: adminHashed } }
    );
    console.log("Admin update result:", adminResult);

    // Update Faculty User
    const facultySalt = await bcrypt.genSalt(10);
    const facultyHashed = await bcrypt.hash("srm@123456789", facultySalt);
    const facultyResult = await User.updateOne(
      { username: "faculty@1234" },
      { $set: { password: facultyHashed } }
    );
    console.log("Faculty update result:", facultyResult);

    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
    process.exit(0);
  } catch (error) {
    console.error("Error during password reset:", error);
    process.exit(1);
  }
}

run();
