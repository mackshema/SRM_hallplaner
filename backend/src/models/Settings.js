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
    },
    leftLogo: {
        type: String,
        default: ''
    },
    rightLogo: {
        type: String,
        default: ''
    },
    // Minutes after exam start during which invigilators can upload absentees.
    // Plans can override it (absentee_window_minutes).
    absenteeWindowMinutes: {
        type: Number,
        default: 120,
        min: 1
    },
    // Exam categories for schedules and the faculty duty history tabs.
    // Add a category here and it appears in the UI without code changes.
    examCategories: {
        type: [{ _id: false, key: { type: String, trim: true }, label: { type: String, trim: true } }],
        default: () => [
            { key: 'IAT1', label: 'IAT 1' },
            { key: 'IAT2', label: 'IAT 2' },
            { key: 'MODEL', label: 'Model' },
            { key: 'ANNA', label: 'Anna University Exams' }
        ]
    },
    // Flag to switch exports back to the old Word (.docx) documents.
    useLegacyWordExport: {
        type: Boolean,
        default: false
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
