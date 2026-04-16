import { Document, Packer, Paragraph, ImageRun } from "docx";
import fs from "fs";
import mongoose from "mongoose";
import Settings from "./src/models/Settings.js";
import dotenv from "dotenv";
dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/exam_seating");
    const settings = await Settings.findOne();

    if (!settings || !settings.leftLogo) {
        console.log("No logo found");
        process.exit();
    }

    const type = settings.leftLogo.substring(settings.leftLogo.indexOf('/') + 1, settings.leftLogo.indexOf(';'));

    const doc = new Document({
        sections: [{
            children: [
                new Paragraph({
                    children: [
                        new ImageRun({
                            data: Buffer.from(settings.leftLogo.split(",")[1], "base64"),
                            transformation: { width: 80, height: 80 },
                            type: type
                        })
                    ]
                })
            ]
        }]
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync("test.docx", buffer);
    console.log("Written test.docx");
    process.exit();
}
run();
