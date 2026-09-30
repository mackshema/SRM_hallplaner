import mongoose from "mongoose";
import { runMigrations } from "./migrations.js";

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);

    console.log(`🟢 MongoDB Connected: ${conn.connection.host}`);
    await runMigrations();
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

export default connectDB;
