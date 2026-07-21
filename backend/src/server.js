import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";

// ROUTES
import hallRoutes from "./routes/hallRoutes.js";
import seatingRoutes from "./routes/seatingRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import examSessionRoutes from "./routes/examSessionRoutes.js";
import internalTimetableRoutes from "./routes/internalTimetableRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";
import exportRoutes from "./routes/exportRoutes.js";
import delegationRoutes from "./routes/delegationRoutes.js";
import annaUniversityRoutes from "./routes/annaUniversityRoutes.js";

dotenv.config();
connectDB();

// CREATE APP FIRST
const app = express();

// MIDDLEWARES
app.use(cors({
  origin: [
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'http://localhost:3000',
  ],
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

//  ROUTES (AFTER app is created)
app.use("/api/auth", authRoutes); // Auth & Seeding
app.use("/api/users", userRoutes); // User management (Faculty)
app.use("/api/halls", hallRoutes); // Halls
app.use("/api/seating", seatingRoutes); // Seating Logic
app.use("/api/internal-timetable", internalTimetableRoutes); // Internal Feed
app.use("/api/settings", settingsRoutes); // Global Settings
app.use("/api/exam-sessions", examSessionRoutes); // Exam Sessions
app.use("/api/student", studentRoutes); // Public Student Lookup
app.use("/api/export", exportRoutes); // Zipped Document exports
app.use("/api/delegation", delegationRoutes); // Delegation requests
app.use("/api/anna", annaUniversityRoutes); // Anna University Module


//  TEST ROUTE
app.get("/", (req, res) => {
  res.send(" Exam Seating Backend Running");
});

//  START SERVER
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🟢 Server running at http://localhost:${PORT}`)
);
