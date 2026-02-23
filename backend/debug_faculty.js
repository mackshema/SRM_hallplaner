
import mongoose from 'mongoose';
import User from './src/models/User.js';
import Hall from './src/models/Hall.js';
import FacultyDuty from './src/models/FacultyDuty.js';

const MONGO_URI = "mongodb://localhost:27017/hall_alleartment";

const checkData = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to DB");

        const facultyCount = await User.countDocuments({ role: 'faculty' });
        console.log(`Total Faculty Members: ${facultyCount}`);

        const faculty = await User.find({ role: 'faculty' });
        console.log("Faculty Members:", faculty.map(f => `${f.name} (${f._id})`));

        const halls = await Hall.find({});
        console.log(`Total Halls: ${halls.length}`);

        const duties = await FacultyDuty.find({});
        console.log(`Total Faculty Duties: ${duties.length}`);

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await mongoose.disconnect();
    }
};

checkData();
