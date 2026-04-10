import mongoose from "mongoose";
import User from "./src/models/User.js";
import dotenv from "dotenv";

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/exam-seating");
  const users = await User.find({ role: "admin" });
  console.log("Admins:", users.map(u => ({ username: u.username, password: u.password })));
  process.exit(0);
}
run();
