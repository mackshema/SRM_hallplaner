import mongoose from 'mongoose';
import dotenv from 'dotenv';
import AnnaExamData from './src/models/AnnaExamData.js';

dotenv.config();

async function checkData() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    const data = await AnnaExamData.find({});
    console.log(`Total records: ${data.length}`);
    
    const missing = data.filter(d => !d.examDate || !d.session);
    console.log(`Records missing date/session: ${missing.length}`);

    if (missing.length > 0) {
        console.log("Sample missing records (Subject Codes):");
        const uniqueMissingCodes = [...new Set(missing.map(m => m.subjectCode))];
        console.log(uniqueMissingCodes.slice(0, 10));
    }

    const withDate = data.filter(d => d.examDate && d.session);
    console.log(`Records WITH date/session: ${withDate.length}`);
    if (withDate.length > 0) {
        console.log("Sample records with date (Subject Codes):");
        const uniqueCodes = [...new Set(withDate.map(m => m.subjectCode))];
        console.log(uniqueCodes.slice(0, 10));
    }

    await mongoose.disconnect();
}

checkData();
