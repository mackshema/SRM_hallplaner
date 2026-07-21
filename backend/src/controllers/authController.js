import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// @desc    Login user & get token
// @route   POST /api/auth/login
export const loginUser = async (req, res) => {
    const { username, password } = req.body;

    try {
        const normalizedUsername = username?.trim().toUpperCase();
        const user = await User.findOne({ username: normalizedUsername })
            .collation({ locale: 'en', strength: 2 });

        if (user) {
            const isMatch = await bcrypt.compare(password, user.password);
            if (isMatch) {
                const token = jwt.sign(
                    {
                        id: user._id.toString(),
                        role: user.role,
                        username: user.username,
                        name: user.name
                    },
                    process.env.JWT_SECRET,
                    { expiresIn: '10h' }
                );

                return res.json({
                    token,
                    user: {
                        id: user._id,
                        name: user.name,
                        username: user.username,
                        role: user.role,
                        department: user.department
                    }
                });
            } else {
                return res.status(401).json({ message: "Invalid username or password" });
            }
        } else {
            return res.status(401).json({ message: "Invalid username or password" });
        }
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// @desc    Seed initial users
// @route   POST /api/auth/seed
export const seedUsers = async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ message: 'Seeding disabled in production.' });
    }

    try {
        const existingAdmin = await User.findOne({ role: 'admin' });
        if (existingAdmin) {
            return res.status(200).json({ message: 'Already seeded.' });
        }

        const count = await User.countDocuments();
        if (count > 0) {
            return res.json({ message: "Users already seeded" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedStudentPassword = await bcrypt.hash("student123", salt);

        const users = [
            { 
                name: "Admin User", 
                username: process.env.SEED_ADMIN_USERNAME, 
                password: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD, 10), 
                role: "admin" 
            },
            { 
                name: "Faculty User", 
                username: "faculty@1234", 
                password: await bcrypt.hash("srm@123456789", 10), 
                role: "faculty" 
            }
        ];

        await User.insertMany(users);
        res.status(201).json({ message: "Users seeded successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
