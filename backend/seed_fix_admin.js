
import mongoose from 'mongoose';
import User from './src/models/User.js';

const MONGO_URI = "mongodb://localhost:27017/hall_alleartment";

const run = async () => {
    try {
        console.log("Connecting to:", MONGO_URI);
        await mongoose.connect(MONGO_URI);
        console.log("Connected.");

        const existingAdmin = await User.findOne({ username: "SRM@Admin" });
        if (existingAdmin) {
            console.log("Admin user exists!");
            console.log("Username:", existingAdmin.username);
            console.log("Password:", existingAdmin.password);
        } else {
            console.log("Admin user NOT found. Creating...");
            const newAdmin = new User({
                name: "Admin User",
                username: "SRM@Admin",
                password: "Admin@12345678",
                role: "admin"
            });
            await newAdmin.save();
            console.log("Admin user created successfully.");
        }

        const allUsers = await User.find({});
        console.log("Total users in DB:", allUsers.length);

        await mongoose.disconnect();
        console.log("Done.");
    } catch (error) {
        console.error("Script Error:", error);
    }
};

run();
