import mongoose from "mongoose";
import Settings from "./src/models/Settings.js";
import dotenv from "dotenv";
dotenv.config();

mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/exam_seating").then(async () => {
    const s = await Settings.findOne();
    if(s) {
        console.log("LeftLogo length:", s.leftLogo ? s.leftLogo.length : 0);
        console.log("RightLogo length:", s.rightLogo ? s.rightLogo.length : 0);
    } else {
        console.log("No settings found");
    }
    process.exit(0);
});
