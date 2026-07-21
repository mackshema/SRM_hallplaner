import mongoose from 'mongoose';
import dotenv from 'dotenv';
import AnnaExamData from './src/models/AnnaExamData.js';

dotenv.config();

async function inspectCode() {
    await mongoose.connect(process.env.MONGO_URI);
    
    const records = await AnnaExamData.find({ subjectCode: /CSE101/i });
    console.log(`Found ${records.length} records for CSE101 (case-insensitive)`);
    
    records.forEach(r => {
        console.log(`- Code: "${r.subjectCode}", Roll: "${r.rollNumber}", Date: "${r.examDate}", Session: "${r.session}"`);
    });

    await mongoose.disconnect();
}

inspectCode();
