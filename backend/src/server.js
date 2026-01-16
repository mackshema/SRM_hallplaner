import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";

// ROUTES
import hallRoutes from "./routes/hallRoutes.js";
import seatingRoutes from "./routes/seatingRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import departmentRoutes from "./routes/departmentRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";

dotenv.config();
connectDB();

// CREATE APP FIRST
const app = express();

// MIDDLEWARES
app.use(cors());
app.use(express.json());

//  ROUTES (AFTER app is created)
app.use("/api/auth", authRoutes); // Auth & Seeding
app.use("/api/users", userRoutes); // User management (Faculty)
app.use("/api/departments", departmentRoutes); // Departments
app.use("/api/halls", hallRoutes); // Halls
app.use("/api/seating", seatingRoutes); // Seating Logic
app.use("/api/settings", settingsRoutes); // Global Settings

//  TEST ROUTE
app.get("/", (req, res) => {
  res.send(" Exam Seating Backend Running");
});

//  START SERVER
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🟢 Server running at http://localhost:${PORT}`)
);
