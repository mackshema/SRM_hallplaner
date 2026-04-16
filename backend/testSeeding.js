import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import xlsx from 'xlsx';
import User from './src/models/User.js';
import fs from 'fs';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/hallmanager";

const seed = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to MongoDB.");

        const depts = ["CSE", "MECH", "IT"];
        const years = ["Year 1", "Year 2", "Year 3"];
        
        let students = [];
        let rollCounter = 910000;

        for (const dept of depts) {
            for (const year of years) {
                for(let i = 0; i < 40; i++) { 
                    rollCounter++;
                    const roll = String(rollCounter);
                    students.push({
                        name: `Student ${dept} ${year} #${i+1}`,
                        email: `student${roll}@srm.edu`,
                        password: "password123",
                        role: 'student',
                        department: dept,
                        degree: year, // student year
                        username: roll // student roll number
                    });
                }
            }
        }

        const hashedStudents = await Promise.all(students.map(async s => {
            const salt = await bcrypt.genSalt(10);
            s.password = await bcrypt.hash(s.password, salt);
            return s;
        }));

        await User.deleteMany({ role: 'student', username: { $gte: "910001", $lte: "999999" } });
        
        await User.insertMany(hashedStudents);
        console.log(`Inserted ${hashedStudents.length} sample students into the database spanning CSE, MECH, IT across Years 1-3.`);

        // Now create the Excel file
        const timetableData = [
            // Date 1: 2026-04-20 FN -> CSE y1, MECH y1, IT y1 are writing different subjects simultaneously
            { "Subject Code": "CSE101", "Year": "Year 1", "Department": "CSE", "Date": "2026-04-20", "Session": "FN" },
            { "Subject Code": "MEC101", "Year": "Year 1", "Department": "MECH", "Date": "2026-04-20", "Session": "FN" },
            { "Subject Code": "ITT101", "Year": "Year 1", "Department": "IT", "Date": "2026-04-20", "Session": "FN" },
            
            // Date 1: 2026-04-20 AN -> Year 2 exams
            { "Subject Code": "CSE201", "Year": "Year 2", "Department": "CSE", "Date": "2026-04-20", "Session": "AN" },
            { "Subject Code": "MEC201", "Year": "Year 2", "Department": "MECH", "Date": "2026-04-20", "Session": "AN" },
            
            // Date 2: 2026-04-21 FN -> All Year 3s
            { "Subject Code": "CSE301", "Year": "Year 3", "Department": "CSE", "Date": "2026-04-21", "Session": "FN" },
            { "Subject Code": "ITT301", "Year": "Year 3", "Department": "IT", "Date": "2026-04-21", "Session": "FN" }
        ];

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(timetableData);
        xlsx.utils.book_append_sheet(wb, ws, "Timetable");

        const excelPath = "Anna_Timetable_Test.xlsx";
        xlsx.writeFile(wb, excelPath);

        console.log(`Successfully created sample Excel file at: backend/${excelPath}`);
        
        console.log("Seeding process completed!");
        process.exit(0);

    } catch (error) {
        console.error("Error generating seed data:", error);
        process.exit(1);
    }
};

seed();
