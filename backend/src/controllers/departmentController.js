import Department from "../models/Department.js";

// @desc    Get all departments
// @route   GET /api/departments
export const getDepartments = async (req, res) => {
    try {
        const departments = await Department.find({});
        res.json(departments);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Create a department
// @route   POST /api/departments
export const createDepartment = async (req, res) => {
    const { name, rollNumberStart, rollNumberEnd } = req.body;

    try {
        const department = new Department({
            name,
            rollNumberStart,
            rollNumberEnd,
        });

        const createdDepartment = await department.save();
        res.status(201).json(createdDepartment);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update a department
// @route   PUT /api/departments/:id
export const updateDepartment = async (req, res) => {
    const { name, rollNumberStart, rollNumberEnd } = req.body;

    try {
        const department = await Department.findById(req.params.id);

        if (department) {
            department.name = name;
            department.rollNumberStart = rollNumberStart;
            department.rollNumberEnd = rollNumberEnd;

            const updatedDepartment = await department.save();
            res.json(updatedDepartment);
        } else {
            res.status(404).json({ message: "Department not found" });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Delete a department
// @route   DELETE /api/departments/:id
export const deleteDepartment = async (req, res) => {
    try {
        const department = await Department.findById(req.params.id);

        if (department) {
            await Department.deleteOne({ _id: req.params.id });
            res.json({ message: "Department removed" });
        } else {
            res.status(404).json({ message: "Department not found" });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
