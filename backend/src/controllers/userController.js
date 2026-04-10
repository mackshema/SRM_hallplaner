import User from "../models/User.js";

// @desc    Get all users
// @route   GET /api/users
export const getUsers = async (req, res) => {
    try {
        const users = await User.find({});
        // Map _id to id for frontend compatibility if needed, though frontend now handles _id
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Create a new user (Faculty)
// @route   POST /api/users
export const createUser = async (req, res) => {
    const { name, username, password, role, department, designation, facultyEmail, hodEmail } = req.body;

    try {
        // FIX 3: Faculty Name Format Validation
        // Initial is mandatory • Must contain at least one character before "." • Followed by full name
        if (role === 'faculty' || !role) {
            const nameRegex = /^.+\.\s*.+$/;
            if (!nameRegex.test(name)) {
                return res.status(400).json({ message: "Faculty name must include initial and full name (Example: R. Kumar)." });
            }
        }

        // FIX 2: Duplicate Faculty Error Description
        const facultyExists = await User.findOne({
            $or: [
                { username },
                { name, role: 'faculty' }
            ]
        });

        if (facultyExists) {
            return res.status(400).json({ message: "Duplicate faculty detected. The same faculty cannot be added multiple times." });
        }

        const user = await User.create({
            name,
            username,
            password, // Plain text for demo as per requirement
            role: role || 'faculty',
            department,
            designation,
            facultyEmail,
            hodEmail
        });

        if (user) {
            res.status(201).json({
                _id: user._id,
                id: user._id,
                name: user.name,
                username: user.username,
                role: user.role,
                department: user.department,
                designation: user.designation,
                facultyEmail: user.facultyEmail,
                hodEmail: user.hodEmail,
            });
        } else {
            res.status(400).json({ message: "Invalid user data" });
        }
    } catch (error) {
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
            if (req.body.facultyEmail !== undefined) user.facultyEmail = req.body.facultyEmail;
            if (req.body.hodEmail !== undefined) user.hodEmail = req.body.hodEmail;

            if (req.body.password) {
                user.password = req.body.password;
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
                facultyEmail: updatedUser.facultyEmail,
                hodEmail: updatedUser.hodEmail,
                password: updatedUser.password,
                isSelectedForGeneration: updatedUser.isSelectedForGeneration
            });
        } else {
            res.status(404).json({ message: "User not found" });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
