import archiver from 'archiver';
import ExamSession from '../models/ExamSession.js';
import Hall from '../models/Hall.js';
import SeatAssignment from '../models/SeatAssignment.js';
import FacultyDuty from '../models/FacultyDuty.js';
import User from '../models/User.js';
import Settings from '../models/Settings.js';
import AnnaSeating from '../models/AnnaSeating.js';
import { generateBenchLayoutDocx, generateConsolidatedPdf, generateFacultyDutyPdf, generateSummaryReportPdf, generateAllBenchLayoutsDocx } from '../utils/documentGenerators.js';

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
        const uniqueDepts = [...new Set(assignments.map(a => a.departmentId).filter(Boolean))];
        const allDepts = uniqueDepts.map((d, i) => ({ _id: d, name: d, id: d }));
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

export const downloadAnnaExamPackage = async (req, res) => {
    try {
        const { examDate, session } = req.params;

        // 1. Fetch Plan
        const plan = await AnnaSeating.findOne({ examDate, session }).lean();
        if (!plan) {
            return res.status(404).json({ error: "Exam session not found" });
        }

        const dateStr = examDate.replace(/\//g, "-");
        const folderPrefix = `AnnaUniversity_${dateStr}_${session}`;

        // Fetch settings for headers - strip logos for Anna University!
        let settings = await Settings.findOne() || {};
        const cleanSettings = {
            institutionName: settings.institutionName || "SRM MADURAI",
            institutionSubtitle: settings.institutionSubtitle || "COLLEGE FOR ENGINEERING AND TECHNOLOGY",
            institutionAffiliation: settings.institutionAffiliation || "Approved by AICTE | Affiliated to Anna University",
            examCellName: settings.examCellName || "EXAMINATION CELL",
            academicYear: settings.academicYear || "ACADEMIC YEAR 2025-2026",
            examName: "END SEMESTER EXAMINATIONS",
            leftLogo: null, // STRICTLY NO LOGOS
            rightLogo: null
        };

        // 3. Fetch data
        const assignments = plan.assignments.map(a => ({
            ...a,
            studentRollNumber: a.rollNumber,
            column: a.column, // Anna logic passes generic layout, DOCX calculates grid
            row: a.row,
            benchPosition: a.benchPosition
        }));
        
        // Departments lookups for docx generators need ID mappings, Anna uses generic string 'department'
        // For standard docx compatibility we create synthetic department objects representing unique strings
        const uniqueDepts = [...new Set(assignments.map(a => a.department))];
        const syntheticDepts = uniqueDepts.map((d, i) => ({ _id: `D${i}`, name: d, id: `D${i}` }));
        
        // Emulate seat assignments mapping for docx
        const compatAssignments = assignments.map(a => {
            const deptObj = syntheticDepts.find(d => d.name === a.department);
            return {
                ...a,
                departmentId: deptObj ? deptObj._id : "UNKNOWN"
            };
        });

        // Halls lookup using local assignments attached halls
        const usedHallsList = [...new Set(assignments.map(a => JSON.stringify({ _id: a.hallId, name: a.hallName, seatsPerBench: 2, rows: Math.max(...assignments.filter(as => as.hallId===a.hallId).map(as => as.row)), columns: Math.max(...assignments.filter(as => as.hallId===a.hallId).map(as => as.column)) })))].map(s => JSON.parse(s));
        const duties = await FacultyDuty.find({ examDate: examDate, examSession: session }).populate('facultyId hallId').lean();

        // Setup archiver
        res.attachment(`AnnaUniversity_Package_${dateStr}_${session}.zip`);
        const archive = archiver('zip', { zlib: { level: 9 } });

        archive.on('error', (err) => {
            console.error("Archive error:", err);
            res.status(500).end();
        });

        archive.pipe(res);

        // -- Generate Hall Bench Layouts (.docx) --
        for (const hall of usedHallsList) {
            const hallAssignments = compatAssignments.filter(a => a.hallId.toString() === hall._id.toString());
            const docBuffer = await generateBenchLayoutDocx({
                hall,
                seatAssignments: hallAssignments,
                departments: syntheticDepts,
                examDate,
                examSession: session,
                examTime: "09:30 AM", // default
                headerSettings: cleanSettings
            });
            archive.append(docBuffer, { name: `${folderPrefix}/Hall_Plans/${hall.name}_Bench_Layout.docx` });
        }

        // -- Generate Consolidated Plan (.pdf) --
        if (compatAssignments.length > 0) {
            const consolidatedPdf = await generateConsolidatedPdf({
                assignments: compatAssignments,
                halls: usedHallsList,
                departments: syntheticDepts,
                examDate,
                examSession: session,
                examTime: "09:30 AM",
                headerSettings: cleanSettings
            });
            archive.append(consolidatedPdf, { name: `${folderPrefix}/Consolidated_Plan/Consolidated_All_Halls.pdf` });
        }

        // -- Generate Faculty Duty Chart (.pdf) --
        if (duties.length > 0) {
            const facultyDutyPdf = await generateFacultyDutyPdf({
                duties,
                examDate,
                examSession: session,
                examTime: "09:30 AM",
                headerSettings: cleanSettings
            });
            archive.append(facultyDutyPdf, { name: `${folderPrefix}/Faculty_Duty/Faculty_Duty_Chart.pdf` });
        }

        // -- Generate Summary Report (.pdf) --
        const summaryPdf = await generateSummaryReportPdf({
            assignments: compatAssignments,
            departments: syntheticDepts,
            examDate,
            examSession: session,
            examTime: "09:30 AM",
            headerSettings: cleanSettings
        });
        archive.append(summaryPdf, { name: `${folderPrefix}/Summary_Report.pdf` });

        await archive.finalize();

    } catch (error) {
        console.error("Error generating Anna exam package:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: "Failed to generate package" });
        }
    }
};

export const downloadAnnaConsolidated = async (req, res) => {
    try {
        const { examDate, session } = req.params;
        const plan = await AnnaSeating.findOne({ examDate, session }).lean();
        if (!plan || !plan.assignments || plan.assignments.length === 0) return res.status(404).json({ error: "No seating plan assignments." });

        let settings = await Settings.findOne() || {};
        const cleanSettings = {
            institutionName: settings.institutionName || "SRM MADURAI",
            institutionSubtitle: settings.institutionSubtitle || "COLLEGE FOR ENGINEERING AND TECHNOLOGY",
            institutionAffiliation: settings.institutionAffiliation || "Approved by AICTE | Affiliated to Anna University",
            examCellName: settings.examCellName || "EXAMINATION CELL",
            academicYear: settings.academicYear || "ACADEMIC YEAR 2025-2026",
            leftLogo: null,
            rightLogo: null
        };

        const assignments = plan.assignments.map(a => ({ ...a, studentRollNumber: a.rollNumber }));
        const uniqueDepts = [...new Set(assignments.map(a => a.department))];
        const syntheticDepts = uniqueDepts.map((d, i) => ({ _id: `D${i}`, name: d, id: `D${i}` }));
        const compatAssignments = assignments.map(a => ({ ...a, departmentId: syntheticDepts.find(d => d.name === a.department)?._id || "UNKNOWN" }));
        const usedHallsList = [...new Set(assignments.map(a => JSON.stringify({ _id: a.hallId, name: a.hallName, seatsPerBench: 2, rows: Math.max(...assignments.filter(as => as.hallId===a.hallId).map(as => as.row)), columns: Math.max(...assignments.filter(as => as.hallId===a.hallId).map(as => as.column)) })))].map(s => JSON.parse(s));

        const consolidatedPdf = await generateConsolidatedPdf({
            assignments: compatAssignments,
            halls: usedHallsList,
            departments: syntheticDepts,
            examDate,
            examSession: session,
            examTime: "09:30 AM",
            headerSettings: cleanSettings
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Anna_Consolidated_${examDate.replace(/\//g, "-")}_${session}.pdf"`);
        res.send(consolidatedPdf);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to export PDF" });
    }
};

export const downloadAnnaLayouts = async (req, res) => {
    try {
        const { examDate, session } = req.params;
        const plan = await AnnaSeating.findOne({ examDate, session }).lean();
        if (!plan || !plan.assignments || plan.assignments.length === 0) return res.status(404).json({ error: "No seating plan assignments." });

        let settings = await Settings.findOne() || {};
        const cleanSettings = {
            institutionName: settings.institutionName || "SRM MADURAI",
            institutionSubtitle: settings.institutionSubtitle || "COLLEGE FOR ENGINEERING AND TECHNOLOGY",
            institutionAffiliation: settings.institutionAffiliation || "Approved by AICTE | Affiliated to Anna University",
            examCellName: settings.examCellName || "EXAMINATION CELL",
            academicYear: settings.academicYear || "ACADEMIC YEAR 2025-2026",
            leftLogo: null,
            rightLogo: null
        };

        const assignments = plan.assignments.map(a => ({ ...a, studentRollNumber: a.rollNumber }));
        const uniqueDepts = [...new Set(assignments.map(a => a.department))];
        const syntheticDepts = uniqueDepts.map((d, i) => ({ _id: `D${i}`, name: d, id: `D${i}` }));
        const compatAssignments = assignments.map(a => ({ ...a, departmentId: syntheticDepts.find(d => d.name === a.department)?._id || "UNKNOWN" }));
        const usedHallsList = [...new Set(assignments.map(a => JSON.stringify({ _id: a.hallId, name: a.hallName, seatsPerBench: 2, rows: Math.max(...assignments.filter(as => as.hallId===a.hallId).map(as => as.row)), columns: Math.max(...assignments.filter(as => as.hallId===a.hallId).map(as => as.column)) })))].map(s => JSON.parse(s));

        const buffer = await generateAllBenchLayoutsDocx({
            halls: usedHallsList,
            seatAssignments: compatAssignments,
            departments: syntheticDepts,
            examDate,
            examSession: session,
            examTime: "09:30 AM",
            headerSettings: cleanSettings
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="Anna_Layouts_${examDate.replace(/\//g, "-")}_${session}.docx"`);
        res.send(buffer);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to export docs" });
    }
};
