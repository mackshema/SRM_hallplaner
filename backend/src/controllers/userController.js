import User from "../models/User.js";
import bcrypt from "bcryptjs";
import xlsx from "xlsx";

// @desc    Get all users
// @route   GET /api/users
export const getUsers = async (req, res) => {
    try {
        // Auto-heal: Ensure all faculty have isSelectedForGeneration set to true if unset or false
        await User.updateMany(
            { role: 'faculty', $or: [{ isSelectedForGeneration: false }, { isSelectedForGeneration: { $exists: false } }] },
            { $set: { isSelectedForGeneration: true } }
        );
        const users = await User.find({}).select('-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Create a new user (Faculty)
// @route   POST /api/users
export const createUser = async (req, res) => {
    const { name, username, password, role, department, designation, facultyEmail, hodEmail, regNo } = req.body;

    try {
        if (!name || !name.trim()) {
            return res.status(400).json({ message: "Faculty name is required." });
        }

        const normalizedUsername = username?.trim().toUpperCase();

        // FIX 2: Duplicate Faculty Error Description
        const facultyExists = await User.findOne({
            $or: [
                { username: normalizedUsername },
                { name, role: 'faculty' }
            ]
        });

        if (facultyExists) {
            return res.status(400).json({ message: "Duplicate faculty detected. The same faculty cannot be added multiple times." });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await User.create({
            name,
            username: normalizedUsername,
            password: hashedPassword,
            plainPassword: password,
            role: role || 'faculty',
            department,
            designation,
            regNo: (regNo && String(regNo).trim()) ? String(regNo).trim() : null,
            facultyEmail,
            hodEmail,
            isSelectedForGeneration: true
        });

        if (user) {
            res.status(201).json({
                _id: user._id,
                id: user._id,
                name: user.name,
                username: user.username,
                password: user.plainPassword || password,
                plainPassword: user.plainPassword || password,
                role: user.role,
                department: user.department,
                designation: user.designation,
                regNo: user.regNo || null,
                facultyEmail: user.facultyEmail,
                hodEmail: user.hodEmail,
            });
        } else {
            res.status(400).json({ message: "Invalid user data" });
        }
    } catch (error) {
        // Bad input (e.g. a designation outside the allowed list) is the caller's error, not the server's
        if (error.name === 'ValidationError') {
            return res.status(400).json({ message: Object.values(error.errors).map(e => e.message).join(', ') });
        }
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
export const deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (user) {
            await User.deleteOne({ _id: req.params.id });
            res.json({ message: "User removed" });
        } else {
            res.status(404).json({ message: "User not found" });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update user
// @route   PUT /api/users/:id
export const updateUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (user) {
            user.name = req.body.name || user.name;
            user.department = req.body.department || user.department;
            if (req.body.designation !== undefined) user.designation = req.body.designation;
            if (req.body.regNo !== undefined) {
                user.regNo = (req.body.regNo && String(req.body.regNo).trim()) ? String(req.body.regNo).trim() : null;
            }
            if (req.body.facultyEmail !== undefined) user.facultyEmail = req.body.facultyEmail;
            if (req.body.hodEmail !== undefined) user.hodEmail = req.body.hodEmail;

            if (req.body.password) {
                const salt = await bcrypt.genSalt(10);
                user.password = await bcrypt.hash(req.body.password, salt);
            }
            if (req.body.isSelected !== undefined) {
                user.isSelected = req.body.isSelected;
            }
            if (req.body.isSelectedForGeneration !== undefined) {
                user.isSelectedForGeneration = req.body.isSelectedForGeneration;
            }

            const updatedUser = await user.save();

            res.json({
                _id: updatedUser._id,
                id: updatedUser._id,
                name: updatedUser.name,
                username: updatedUser.username,
                role: updatedUser.role,
                department: updatedUser.department,
                designation: updatedUser.designation,
                regNo: updatedUser.regNo || null,
                facultyEmail: updatedUser.facultyEmail,
                hodEmail: updatedUser.hodEmail,
                isSelectedForGeneration: updatedUser.isSelectedForGeneration
            });
        } else {
            res.status(404).json({ message: "User not found" });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Bulk upload faculty from Excel sheet
// @route   POST /api/users/bulk-upload
export const bulkUploadFaculty = async (req, res) => {
    try {
        if (!req.file && !req.body.facultyList) {
            return res.status(400).json({ message: "No Excel file or faculty data uploaded." });
        }

        let rawRows = [];
        if (req.file) {
            const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
            for (const sheetName of workbook.SheetNames) {
                const sheet = workbook.Sheets[sheetName];
                const sheetRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
                if (sheetRows && sheetRows.length > 0) {
                    rawRows = sheetRows;
                    break;
                }
            }
        } else if (Array.isArray(req.body.facultyList)) {
            rawRows = req.body.facultyList;
        }

        if (!rawRows || rawRows.length === 0) {
            return res.status(400).json({ message: "Uploaded sheet is empty." });
        }

        // 1. Locate header row
        let headerRowIdx = -1;
        let nameColIdx = -1;
        let deptColIdx = -1;
        let desigColIdx = -1;
        let emailColIdx = -1;
        let hodEmailColIdx = -1;
        let regNoColIdx = -1;

        for (let r = 0; r < Math.min(rawRows.length, 20); r++) {
            const row = rawRows[r];
            if (!Array.isArray(row)) continue;
            for (let c = 0; c < row.length; c++) {
                const cell = String(row[c] || '').trim().toLowerCase();
                if (cell === 'name' || cell === 'faculty name' || cell.includes('faculty name') || cell === 'staff name') {
                    nameColIdx = c;
                    headerRowIdx = r;
                }
                if (cell === 'department' || cell === 'dept' || cell.includes('department')) {
                    deptColIdx = c;
                }
                if (cell.includes('designation') || cell.includes('post') || cell.includes('role')) {
                    desigColIdx = c;
                }
                if (cell === 'reg no' || cell === 'regno' || cell === 'staff reg no' || cell === 'staff id' || cell === 'staffid' || cell === 'faculty id' || cell === 'employee id' || cell.includes('reg no') || cell.includes('staff reg')) {
                    regNoColIdx = c;
                }
                if (cell.includes('email') || cell.includes('mail') || cell.includes('faculty email')) {
                    if (cell.includes('hod')) {
                        hodEmailColIdx = c;
                    } else {
                        emailColIdx = c;
                    }
                }
            }
            if (nameColIdx !== -1 && deptColIdx !== -1) {
                headerRowIdx = r;
                break;
            }
        }

        if (headerRowIdx === -1 || nameColIdx === -1) {
            return res.status(400).json({ 
                message: "Could not find valid column headers. Ensure 'Faculty Name' and 'Department' headers exist." 
            });
        }

        const validDesignations = ["Assistant Professor", "Associate Professor", "Professor", "HOD"];
        let createdCount = 0;
        let updatedCount = 0;
        const processedFaculty = [];
        const salt = await bcrypt.genSalt(10);

        for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
            const row = rawRows[r];
            if (!row || !Array.isArray(row) || row.length === 0) continue;

            const rawName = String(row[nameColIdx] || '').trim();
            if (!rawName || rawName.toLowerCase() === 'name' || rawName.toUpperCase().includes('EXAM CELL') || rawName.toUpperCase().includes('COORDINATOR')) {
                continue;
            }

            const rawDept = deptColIdx !== -1 ? String(row[deptColIdx] || '').trim() : '';
            const rawDesig = desigColIdx !== -1 ? String(row[desigColIdx] || '').trim() : '';
            const rawEmail = emailColIdx !== -1 ? String(row[emailColIdx] || '').trim() : '';
            const rawHodEmail = hodEmailColIdx !== -1 ? String(row[hodEmailColIdx] || '').trim() : '';
            const rawRegNo = regNoColIdx !== -1 ? String(row[regNoColIdx] || '').trim() : '';

            // Match or fallback designation
            let designation = validDesignations.find(d => d.toLowerCase() === rawDesig.toLowerCase()) || "Assistant Professor";
            if (rawDesig.toLowerCase().includes('hod')) designation = "HOD";
            else if (rawDesig.toLowerCase().includes('associate')) designation = "Associate Professor";
            else if (rawDesig.toLowerCase().includes('professor') && !rawDesig.toLowerCase().includes('assistant')) designation = "Professor";

            const cleanName = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
            const cleanDept = (rawDept || 'dept').toLowerCase().replace(/[^a-z0-9]/g, '');
            const username = `${cleanName}@1234`.toUpperCase();
            const defaultPassword = `${cleanName}@srm1234`;
            const facultyEmail = rawEmail || `${cleanName}.${cleanDept}@srm.edu`;
            const hodEmail = rawHodEmail || `hod.${cleanDept}@srm.edu`;

            // Check existing user
            const existingUser = await User.findOne({
                $or: [
                    { username: username },
                    { name: rawName, role: 'faculty' }
                ]
            });

            if (existingUser) {
                existingUser.department = rawDept || existingUser.department;
                existingUser.designation = designation || existingUser.designation;
                if (rawRegNo) existingUser.regNo = rawRegNo;
                if (rawEmail) existingUser.facultyEmail = rawEmail;
                if (rawHodEmail) existingUser.hodEmail = rawHodEmail;
                existingUser.isSelectedForGeneration = true;
                await existingUser.save();
                updatedCount++;
                processedFaculty.push(existingUser);
            } else {
                const hashedPassword = await bcrypt.hash(defaultPassword, salt);
                const newUser = await User.create({
                    name: rawName,
                    username: username,
                    password: hashedPassword,
                    plainPassword: defaultPassword,
                    role: 'faculty',
                    department: rawDept,
                    designation: designation,
                    regNo: rawRegNo || undefined,
                    facultyEmail: facultyEmail,
                    hodEmail: hodEmail,
                    isSelectedForGeneration: true
                });
                createdCount++;
                processedFaculty.push(newUser);
            }
        }

        res.status(200).json({
            message: `Faculty list processed successfully: ${createdCount} created, ${updatedCount} updated.`,
            createdCount,
            updatedCount,
            totalProcessed: createdCount + updatedCount,
            faculty: processedFaculty
        });
    } catch (error) {
        console.error("Bulk upload faculty error:", error);
        res.status(500).json({ message: error.message || "Failed to process faculty Excel upload." });
    }
};
