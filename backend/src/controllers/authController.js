import User from "../models/User.js";

// @desc    Login user & get token (Mock token for now)
// @route   POST /api/auth/login
export const loginUser = async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ username });

        if (user && user.password === password) {
            res.json({
                id: user.id || user._id, // Return ID for frontend use
                _id: user._id,
                name: user.name,
                username: user.username,
                role: user.role,
                department: user.department,
            });
        } else {
            res.status(401).json({ message: "Invalid username or password" });
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

        const users = [
            { name: "Admin User", username: "SRM@Admin", password: "Admin@12345678", role: "admin" },
            { name: "Faculty User", username: "faculty@1234", password: "srm@123456789", role: "faculty" }
        ];

        await User.insertMany(users);
        res.status(201).json({ message: "Users seeded successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}
