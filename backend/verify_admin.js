
import mongoose from 'mongoose';
import User from './src/models/User.js';
import dotenv from 'dotenv';
dotenv.config();

const checkAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const users = await User.find({});
        console.log('Total users:', users.length);
        users.forEach(u => console.log(`- ${u.username} (Role: ${u.role})`));

        if (users.length === 0) {
            console.log('No users found. You should run the seed.');
        } else {
            const admin = users.find(u => u.username === 'SRM@Admin');
            if (admin) {
                console.log('Admin found. Password check (raw):', admin.password);
            } else {
                console.log('Admin user "SRM@Admin" NOT found.');
            }
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
};

checkAdmin();
