import archiver from 'archiver';
import ExamSession from '../models/ExamSession.js';
import Hall from '../models/Hall.js';
import Department from '../models/Department.js';
import SeatAssignment from '../models/SeatAssignment.js';
import FacultyDuty from '../models/FacultyDuty.js';
import User from '../models/User.js';
import Settings from '../models/Settings.js';
import { generateBenchLayoutDocx, generateConsolidatedPdf, generateFacultyDutyPdf, generateSummaryReportPdf } from '../utils/documentGenerators.js';

export const downloadFullExamPackage = async (req, res) => {
    try {
        const { examPlanId } = req.params;

        // 1. Validate exam exists
        const session = await ExamSession.findById(examPlanId);
        if (!session) {
            return res.status(404).json({ error: "Exam session not found" });
        }

        // 2. Validate status = FINALIZED
        if (session.status !== "FINAL") {
            return res.status(400).json({ error: "Exam plan is not finalized. Please finalize before downloading." });
        }

        const dateStr = session.examDate.replace(/\//g, "-");
        const folderPrefix = `ExamName/${dateStr}_${session.examSession}`;

        // Fetch settings for headers
        let settings = await Settings.findOne();
        if (!settings) {
            settings = {
                institutionName: "SRM MADURAI",
                institutionSubtitle: "COLLEGE FOR ENGINEERING AND TECHNOLOGY",
                institutionAffiliation: "Approved by AICTE | Affiliated to Anna University",
                examCellName: "EXAMINATION CELL",
                academicYear: "ACADEMIC YEAR 2025-2026",
                examName: "INTERNAL ASSESSMENT TEST"
            };
        }

        // 3. Fetch data
        const assignments = await SeatAssignment.find({ examSessionId: examPlanId });
        const usedHallIds = [...new Set(assignments.map(a => a.hallId.toString()))];
        const halls = await Hall.find({ _id: { $in: usedHallIds } });
        const allDepts = await Department.find();
        const duties = await FacultyDuty.find({ examDate: session.examDate, examSession: session.examSession }).populate('facultyId hallId');

        // Setup archiver
        res.attachment(`Full_Exam_Package_${dateStr}_${session.examSession}.zip`);
        const archive = archiver('zip', { zlib: { level: 9 } });

        archive.on('error', (err) => {
            console.error("Archive error:", err);
            res.status(500).end();
        });

        archive.pipe(res);

        // -- Generate Hall Bench Layouts (.docx) --
        for (const hall of halls) {
            const hallAssignments = assignments.filter(a => a.hallId.toString() === hall._id.toString());
            const docBuffer = await generateBenchLayoutDocx({
                hall,
                seatAssignments: hallAssignments,
                departments: allDepts,
                examDate: session.examDate,
                examSession: session.examSession,
                examTime: session.examTime,
                headerSettings: settings
            });
            archive.append(docBuffer, { name: `${folderPrefix}/Hall_Plans/${hall.name}_Bench_Layout.docx` });
        }

        // -- Generate Consolidated Plan (.pdf) --
        if (assignments.length > 0) {
            const consolidatedPdf = await generateConsolidatedPdf({
                assignments,
                halls,
                departments: allDepts,
                examDate: session.examDate,
                examSession: session.examSession,
                examTime: session.examTime,
                headerSettings: settings
            });
            archive.append(consolidatedPdf, { name: `${folderPrefix}/Consolidated_Plan/Consolidated_All_Halls.pdf` });
        }

        // -- Generate Faculty Duty Chart (.pdf) --
        if (duties.length > 0) {
            const facultyDutyPdf = await generateFacultyDutyPdf({
                duties,
                examDate: session.examDate,
                examSession: session.examSession,
                examTime: session.examTime,
                headerSettings: settings
            });
            archive.append(facultyDutyPdf, { name: `${folderPrefix}/Faculty_Duty/Faculty_Duty_Chart.pdf` });
        }

        // -- Generate Summary Report (.pdf) --
        const summaryPdf = await generateSummaryReportPdf({
            assignments,
            departments: allDepts,
            examDate: session.examDate,
            examSession: session.examSession,
            examTime: session.examTime,
            headerSettings: settings
        });
        archive.append(summaryPdf, { name: `${folderPrefix}/Summary_Report.pdf` });

        await archive.finalize();

    } catch (error) {
        console.error("Error generating full exam package:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: "Failed to generate package" });
        }
    }
};
