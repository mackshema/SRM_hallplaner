
import mongoose from 'mongoose';
import FacultyDuty from './src/models/FacultyDuty.js';

const MONGO_URI = "mongodb://localhost:27017/hall_alleartment";

const cleanup = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected.");
        const res = await FacultyDuty.deleteMany({});
        console.log(`Deleted ${res.deletedCount} FacultyDuty records.`);
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
};

cleanup();
