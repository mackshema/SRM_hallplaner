import mongoose from 'mongoose';
import dotenv from 'dotenv';
import AnnaExamData from './src/models/AnnaExamData.js';

dotenv.config();

async function inspectCSE301() {
    await mongoose.connect(process.env.MONGO_URI);
    
    const records = await AnnaExamData.find({ subjectCode: /CSE301/i });
    console.log(`Found ${records.length} records for CSE301`);
    
    records.forEach(r => {
        console.log(`- Code: "${r.subjectCode}", Roll: "${r.rollNumber}", Date: "${r.examDate}"`);
    });

    await mongoose.disconnect();
}

inspectCSE301();
