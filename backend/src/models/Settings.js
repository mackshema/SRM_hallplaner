import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
    institutionName: {
        type: String,
        default: 'SRM MADURAI'
    },
    institutionSubtitle: {
        type: String,
        default: 'COLLEGE FOR ENGINEERING AND TECHNOLOGY'
    },
    institutionAffiliation: {
        type: String,
        default: 'Approved by AICTE, New Delhi | Affiliated to Anna University, Chennai'
    },
    examCellName: {
        type: String,
        default: 'EXAMINATION CELL'
    },
    academicYear: {
        type: String,
        default: 'ACADEMIC YEAR 2025-2026 (ODD SEMESTER)'
    },
    examName: {
        type: String,
        default: 'INTERNAL ASSESSMENT TEST – II (Except I Year)'
    }
}, { timestamps: true });

// Ensure only one document exists
settingsSchema.statics.getSettings = async function () {
    const settings = await this.findOne();
    if (settings) return settings;
    return await this.create({});
};

const Settings = mongoose.model('Settings', settingsSchema);
export default Settings;
