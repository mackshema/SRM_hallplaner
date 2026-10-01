import SeatAssignment from "../models/SeatAssignment.js";
import ExamSession from "../models/ExamSession.js";
import AnnaSeating from "../models/AnnaSeating.js";
import Hall from "../models/Hall.js";
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { isPlanVisible, formatIST } from "../utils/planStatus.js";

// Visibility (published + publish time passed) is the shared rule in utils/planStatus.js
const formatISTDateTime = formatIST;

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 465,
    secure: process.env.EMAIL_PORT === '465',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * GET /api/student/:rollNumber
 * Fetch exam details for a student if the plan is finalized.
 */
export const getStudentExamDetails = async (req, res) => {
    try {
        const { rollNumber } = req.params;

        if (!rollNumber) {
            return res.status(400).json({ message: "Roll number is required" });
        }

        const normalizeRoll = (roll) => {
            if (!roll || typeof roll !== 'string') return null;
            return roll.trim().toUpperCase();
        };

        const normalizedRoll = normalizeRoll(rollNumber);
        if (!normalizedRoll) {
            return res.status(400).json({ message: 'Invalid roll number.' });
        }
        const results = [];

        // 1. FETCH INTERNAL EXAM ASSIGNMENTS
        const internalSeats = await SeatAssignment.find({ 
            studentRollNumber: normalizedRoll 
        })
            .populate('examSessionId')
            .populate('hallId');

        if (internalSeats && internalSeats.length > 0) {
            const finalizedInternal = internalSeats.filter(seat => {
                const s = seat.examSessionId;
                if (!s) return false;
                return s.isPublished === true || s.status === "SCHEDULED" || s.status === "PUBLISHED";
            });

            // Separate visible vs scheduled
            finalizedInternal.forEach(seat => {
                const session = seat.examSessionId;
                if (isPlanVisible(session)) {
                    const rowLabel = seat.isExtraBench ? "Extra Bench" : `Row ${seat.row}`;
                    results.push({
                        hall: seat.hallId ? seat.hallId.name : "N/A",
                        floor: seat.hallId ? seat.hallId.floor : "N/A",
                        date: session.examDate,
                        session: session.examSession,
                        time: session.examTime,
                        rollNumber: seat.studentRollNumber,
                        seatPosition: `${rowLabel} - Column ${seat.column} - Seat ${seat.benchPosition}`,
                        type: "Internal"
                    });
                } else if (session.publish_at) {
                    // Scheduled but not yet visible
                    results.push({
                        type: "Internal",
                        date: session.examDate,
                        session: session.examSession,
                        scheduled: true,
                        publish_at: session.publish_at,
                        publish_at_formatted: formatISTDateTime(session.publish_at)
                    });
                }
            });
        }

        // 2. FETCH ANNA UNIVERSITY ASSIGNMENTS
        // Fetch all published OR scheduled Anna plans for this roll number
        const annaPlans = await AnnaSeating.find({
            $or: [
                { isPublished: true, status: { $in: ["FINAL", "PUBLISHED"] } },
                { status: "SCHEDULED" }
            ],
            "assignments.rollNumber": normalizedRoll
        });

        if (annaPlans && annaPlans.length > 0) {
            annaPlans.forEach(plan => {
                const myAssignment = plan.assignments.find(a =>
                    a.rollNumber.toUpperCase() === normalizedRoll
                );

                if (!myAssignment) return;

                if (isPlanVisible(plan)) {
                    results.push({
                        hall: myAssignment.hallName || "N/A",
                        floor: "N/A",
                        date: plan.examDate,
                        session: plan.session,
                        time: plan.session === 'FN' ? '09:30 AM' : '02:00 PM',
                        rollNumber: myAssignment.rollNumber,
                        seatPosition: `Row ${myAssignment.row} - Column ${myAssignment.column} - Seat ${myAssignment.benchPosition}`,
                        type: "Anna University"
                    });
                } else if (plan.publish_at) {
                    results.push({
                        type: "Anna University",
                        date: plan.examDate,
                        session: plan.session,
                        scheduled: true,
                        publish_at: plan.publish_at,
                        publish_at_formatted: formatISTDateTime(plan.publish_at)
                    });
                }
            });
        }

        if (results.length === 0) {
            return res.status(404).json({ message: "No published exam assignment found for this roll number. Please contact Examination Cell." });
        }

        res.json(results);

    } catch (err) {
        console.error("Error in getStudentExamDetails:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * POST /api/student/create-account
 * Admin creating a student account.
 */
export const createStudentAccount = async (req, res) => {
    try {
        const { name, rollNumber, email, password, program, degree, department, regulation, branch } = req.body;

        if (!name || !rollNumber || !password) {
            return res.status(400).json({ message: "Name, roll number, and password are required" });
        }

        const normalizedRoll = rollNumber.trim().toUpperCase();

        // Check if student already exists
        const existingStudent = await User.findOne({ username: normalizedRoll });
        if (existingStudent) {
            existingStudent.name = name;
            if (email !== undefined) existingStudent.email = email;
            if (program) existingStudent.program = program;
            if (degree) existingStudent.degree = degree;
            if (department) existingStudent.department = department;
            if (regulation) existingStudent.regulation = regulation;
            if (branch) existingStudent.branch = branch;

            await existingStudent.save();

            return res.status(200).json({
                message: `Register Number ${normalizedRoll} already existed. The record has been updated with the new details.`,
                student: { name: existingStudent.name, username: existingStudent.username, email: existingStudent.email },
                isUpdated: true
            });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const student = await User.create({
            name,
            username: normalizedRoll,
            password: hashedPassword,
            email: email || "",
            role: "student",
            program,
            degree,
            department,
            regulation,
            branch
        });

        // Send Email with Credentials
        if (email && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            try {
                const mailOptions = {
                    from: `"Exam Cell" <${process.env.EMAIL_USER}>`,
                    to: email,
                    subject: 'Your Exam Hall Planner Account Details',
                    text: `Hello ${name},\n\nYour exam portal account has been created!\n\nUsername: ${rollNumber}\nPassword: ${password}\n\nThis is your auto-generated unique password. Once you log in, you can create or change your own password in the settings.\nRecommendation: If you put your date of birth as your password, it would be fine enough to remember.\n\nPlease login to check your seating plan.\n\nThanks,\nExamination Cell\nSRM MCET`
                };
                await transporter.sendMail(mailOptions);
                console.log(`Email sent successfully to ${email}`);
            } catch (mailError) {
                console.error("Failed to send email:", mailError);
            }
        }

        res.status(201).json({
            message: "Student account created successfully! Credentials have been sent via email if provided.",
            student: { name: student.name, username: student.username, email: student.email }
        });
    } catch (err) {
        console.error("Error creating student:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * POST /api/student/change-password
 * Change password for a logged-in student.
 */
export const changeStudentPassword = async (req, res) => {
    try {
        const { username, currentPassword, newPassword } = req.body;

        if (!username || !currentPassword || !newPassword) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const normalizedUsername = String(username).trim().toUpperCase();
        if (req.user?.role !== 'admin' && req.user?.username?.toUpperCase() !== normalizedUsername) {
            return res.status(403).json({ message: "You can only change your own password." });
        }

        const student = await User.findOne({ username: normalizedUsername, role: "student" });
        if (!student) {
            return res.status(404).json({ message: "Student account not found." });
        }

        // Verify current password
        const isMatch = await bcrypt.compare(currentPassword, student.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Incorrect current password." });
        }

        // Hash and update new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        student.password = hashedPassword;
        await student.save();

        res.json({ message: "Password updated successfully." });
    } catch (err) {
        console.error("Error changing password:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * GET /api/student
 * Get all students.
 */
export const getAllStudents = async (req, res) => {
    try {
        const students = await User.find({ role: "student" }).select('-password -plainPassword').sort({ username: 1 });
        res.json(students);
    } catch (err) {
        console.error("Error fetching students:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * PUT /api/student/:id
 * Update a student account.
 */
export const updateStudentAccount = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, rollNumber, email, skipEmail, program, degree, department, regulation, branch } = req.body;

        const student = await User.findById(id);
        if (!student || student.role !== "student") {
            return res.status(404).json({ message: "Student not found" });
        }

        student.name = name || student.name;
        student.username = rollNumber ? rollNumber.trim().toUpperCase() : student.username;
        student.email = email !== undefined ? email : student.email;
        if (program !== undefined) student.program = program;
        if (degree !== undefined) student.degree = degree;
        if (department !== undefined) student.department = department;
        if (regulation !== undefined) student.regulation = regulation;
        if (branch !== undefined) student.branch = branch;

        await student.save();

        if (email && !skipEmail && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            try {
                const mailOptions = {
                    from: `"Exam Cell" <${process.env.EMAIL_USER}>`,
                    to: email,
                    subject: 'Your Exam Hall Planner Account Update',
                    text: `Hello ${student.name},\n\nYour exam portal account details have been updated!\n\nUsername: ${student.username}\n\nPlease login to check your seating plan.\n\nThanks,\nExamination Cell\nSRM MCET`
                };
                await transporter.sendMail(mailOptions);
            } catch (mailError) {
                console.error("Failed to send update email:", mailError);
            }
        }

        const studentResponse = {
            _id: student._id,
            name: student.name,
            username: student.username,
            email: student.email,
            program: student.program,
            degree: student.degree,
            department: student.department,
            regulation: student.regulation,
            branch: student.branch
        };
        res.json({ message: "Student updated successfully", student: studentResponse });
    } catch (err) {
        console.error("Error updating student:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * POST /api/student/bulk-create
 * Bulk create students from array.
 */
export const bulkCreateStudents = async (req, res) => {
    try {
        const { students } = req.body; // array of {name, rollNumber, email, password}
        if (!Array.isArray(students) || students.length === 0) {
            return res.status(400).json({ message: "Valid array of students is required" });
        }

        const createdStudents = [];
        const updatedStudents = [];
        const skippedStudents = [];
        
        const salt = await bcrypt.genSalt(10);

        for (const input of students) {
            try {
                const normalizedRoll = input.rollNumber.trim().toUpperCase();
                const existing = await User.findOne({ username: normalizedRoll });
                if (existing) {
                    existing.name = input.name || existing.name;
                    if (input.email !== undefined) existing.email = input.email;
                    if (input.program) existing.program = input.program;
                    if (input.degree) existing.degree = input.degree;
                    if (input.department) existing.department = input.department;
                    if (input.regulation) existing.regulation = input.regulation;
                    if (input.branch) existing.branch = input.branch;

                    await existing.save();

                    updatedStudents.push({ 
                        rollNumber: normalizedRoll, 
                        name: input.name, 
                        reason: "Register number already existed — updated with newly uploaded data" 
                    });
                    continue;
                }
                
                const hashedPassword = await bcrypt.hash(input.password || "student123", salt);
                
                const student = await User.create({
                    name: input.name,
                    username: normalizedRoll,
                    password: hashedPassword,
                    email: input.email || "",
                    role: "student",
                    program: input.program,
                    degree: input.degree,
                    department: input.department,
                    regulation: input.regulation,
                    branch: input.branch
                });

                createdStudents.push(student);

                if (input.email && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
                    try {
                        const mailOptions = {
                            from: `"Exam Cell" <${process.env.EMAIL_USER}>`,
                            to: input.email,
                            subject: 'Your Exam Hall Planner Account Details',
                            text: `Hello ${input.name},\n\nYour exam portal account has been created!\n\nUsername: ${input.rollNumber}\nPassword: ${input.password || 'student123'}\n\nThis is your auto-generated unique password. Once you log in, you can create or change your own password in the settings.\nRecommendation: If you put your date of birth as your password, it would be fine enough to remember.\n\nPlease login to check your seating plan.\n\nThanks,\nExamination Cell\nSRM MCET`
                        };
                        await transporter.sendMail(mailOptions);
                    } catch (mailError) {
                        console.error(`Failed to send bulk email to ${input.email}:`, mailError);
                    }
                }
            } catch (err) {
                skippedStudents.push({ ...input, reason: err.message });
            }
        }

        res.status(200).json({
            message: `Processed ${students.length} students: ${createdStudents.length} created, ${updatedStudents.length} updated.`,
            createdCount: createdStudents.length,
            updatedCount: updatedStudents.length,
            skippedCount: skippedStudents.length,
            skippedDetailed: skippedStudents,
            updatedDetailed: updatedStudents
        });

    } catch (err) {
        console.error("Error in bulk create:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * DELETE /api/student/:id
 * Delete a student account.
 */
export const deleteStudentAccount = async (req, res) => {
    try {
        const { id } = req.params;
        const student = await User.findByIdAndDelete(id);
        if (!student) {
            return res.status(404).json({ message: "Student not found" });
        }
        res.json({ message: "Student deleted successfully" });
    } catch (err) {
        console.error("Error deleting student:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};
