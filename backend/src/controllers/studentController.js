import SeatAssignment from "../models/SeatAssignment.js";
import ExamSession from "../models/ExamSession.js";
import AnnaSeating from "../models/AnnaSeating.js";
import Hall from "../models/Hall.js";
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";

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
            const finalizedInternal = internalSeats.filter(seat => 
                seat.examSessionId && 
                seat.examSessionId.status === "FINAL" && 
                seat.examSessionId.isPublished === true
            );

            finalizedInternal.forEach(seat => {
                const rowLabel = seat.isExtraBench ? "Extra Bench" : `Row ${seat.row}`;
                results.push({
                    hall: seat.hallId ? seat.hallId.name : "N/A",
                    floor: seat.hallId ? seat.hallId.floor : "N/A",
                    date: seat.examSessionId.examDate,
                    session: seat.examSessionId.examSession,
                    time: seat.examSessionId.examTime,
                    rollNumber: seat.studentRollNumber,
                    seatPosition: `${rowLabel} - Column ${seat.column} - Seat ${seat.benchPosition}`,
                    type: "Internal"
                });
            });
        }

        // 2. FETCH ANNA UNIVERSITY ASSIGNMENTS
        const annaPlans = await AnnaSeating.find({ 
            isPublished: true, 
            status: "FINAL",
            "assignments.rollNumber": normalizedRoll
        });

        if (annaPlans && annaPlans.length > 0) {
            annaPlans.forEach(plan => {
                const myAssignment = plan.assignments.find(a => 
                    a.rollNumber.toUpperCase() === normalizedRoll
                );
                
                if (myAssignment) {
                    results.push({
                        hall: myAssignment.hallName || "N/A",
                        floor: "N/A", // Anna University seating doesn't always store floor in assignment
                        date: plan.examDate,
                        session: plan.session,
                        time: "09:30 AM", // Standard Anna University time if not specified
                        rollNumber: myAssignment.rollNumber,
                        seatPosition: `Row ${myAssignment.row} - Column ${myAssignment.column} - Seat ${myAssignment.benchPosition}`,
                        type: "Anna University"
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
        const { name, rollNumber, email, password, program, degree, department } = req.body;

        if (!name || !rollNumber || !password) {
            return res.status(400).json({ message: "Name, roll number, and password are required" });
        }

        const normalizedRoll = rollNumber.trim().toUpperCase();

        // Check if student already exists
        const existingStudent = await User.findOne({ username: normalizedRoll });
        if (existingStudent) {
            return res.status(400).json({ message: "Student account already exists for this roll number." });
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
            department
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

        const student = await User.findOne({ username, role: "student" });
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
        const students = await User.find({ role: "student" }).select('-password -plainPassword');
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
        const { name, rollNumber, email, skipEmail, program, degree, department } = req.body;

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
            department: student.department
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
        const skippedStudents = [];
        
        const salt = await bcrypt.genSalt(10);

        for (const input of students) {
            try {
                const normalizedRoll = input.rollNumber.trim().toUpperCase();
                const existing = await User.findOne({ username: normalizedRoll });
                if (existing) {
                    skippedStudents.push({ ...input, reason: "Roll number already exists" });
                    continue;
                }
                
                const hashedPassword = await bcrypt.hash(input.password, salt);
                
                const student = await User.create({
                    name: input.name,
                    username: normalizedRoll,
                    password: hashedPassword,
                    email: input.email || "",
                    role: "student",
                    program: input.program,
                    degree: input.degree,
                    department: input.department
                });

                createdStudents.push(student);

                if (input.email && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
                    try {
                        const mailOptions = {
                            from: `"Exam Cell" <${process.env.EMAIL_USER}>`,
                            to: input.email,
                            subject: 'Your Exam Hall Planner Account Details',
                            text: `Hello ${input.name},\n\nYour exam portal account has been created!\n\nUsername: ${input.rollNumber}\nPassword: ${input.password}\n\nThis is your auto-generated unique password. Once you log in, you can create or change your own password in the settings.\nRecommendation: If you put your date of birth as your password, it would be fine enough to remember.\n\nPlease login to check your seating plan.\n\nThanks,\nExamination Cell\nSRM MCET`
                        };
                        await transporter.sendMail(mailOptions);
                    } catch (mailError) {
                        console.error("Failed to send bulk email to ${input.email}:", mailError);
                    }
                }
            } catch (err) {
                skippedStudents.push({ ...input, reason: err.message });
            }
        }

        res.status(201).json({
            message: `Successfully created ${createdStudents.length} students. Skipped ${skippedStudents.length}.`,
            createdCount: createdStudents.length,
            skippedCount: skippedStudents.length,
            skippedDetailed: skippedStudents
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
