import User from "../models/User.js";
import bcrypt from "bcryptjs";

// @desc    Login user & get token (Mock token for now)
// @route   POST /api/auth/login
export const loginUser = async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ username });

        if (user) {
            let isMatch = false;
            if (user.role === 'student') {
                isMatch = await bcrypt.compare(password, user.password);
            } else {
                isMatch = (user.password === password);
            }

            if (isMatch) {
                sendLoginSuccess(user, res);
            } else {
                res.status(401).json({ message: "Invalid username or password" });
            }
            return;
        } else {
            res.status(401).json({ message: "Invalid username or password" });
        }

        // Helper function inside to keep response formatting DRY
        function sendLoginSuccess(u, response) {
            response.json({
                id: u.id || u._id,
                _id: u._id,
                name: u.name,
                username: u.username,
                role: u.role,
                department: u.department,
            });
        }

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Seed initial users
// @route   POST /api/auth/seed
export const seedUsers = async (req, res) => {
    try {
        const count = await User.countDocuments();
        if (count > 0) {
            return res.json({ message: "Users already seeded" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedStudentPassword = await bcrypt.hash("student123", salt);

        const users = [
            { name: "Admin User", username: "SRM@Admin", password: "Admin@12345678", role: "admin" },
            { name: "Faculty User", username: "faculty@1234", password: "srm@123456789", role: "faculty" },
            { name: "Demo Student", username: "911123149001", password: hashedStudentPassword, role: "student", email: "student@example.com" }
        ];

        await User.insertMany(users);
        res.status(201).json({ message: "Users seeded successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}
