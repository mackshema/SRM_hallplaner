import mongoose from "mongoose";
import DutyRecord, { visibleDutyFilter, countsAsDuty } from "../models/DutyRecord.js";
import User from "../models/User.js";
import { getCategories } from "./examScheduleController.js";
import { autoPromoteDuePlans } from "../services/planLifecycle.js";

/** Duties from plans not yet put under an exam schedule. */
export const UNCATEGORIZED = { key: "OTHER", label: "Other / Unassigned" };

/**
 * GET /api/faculty-duties/:facultyId?academicYear=&semester=
 *
 * Exam duty history of one faculty member, read from the DutyRecord table (the
 * same source as the Duty Summary page). Only duties from published plans whose
 * publish time has passed are included. Categories come from Settings, so a new
 * category needs no UI change. Admins can read anyone; faculty only themselves.
 */
export const getFacultyDutyHistory = async (req, res) => {
    try {
        const { facultyId } = req.params;
        if (!mongoose.isValidObjectId(facultyId)) return res.status(400).json({ error: "Invalid faculty id." });
        if (req.user?.role !== "admin" && String(req.user?.id) !== String(facultyId)) {
            return res.status(403).json({ message: "You can only view your own duties." });
        }

        await autoPromoteDuePlans();
        const faculty = await User.findById(facultyId).select("name department designation").lean();
        if (!faculty) return res.status(404).json({ error: "Faculty not found." });

        const all = (await DutyRecord.find({ facultyId, ...visibleDutyFilter() }).lean()).filter(countsAsDuty);

        // Filter options come from the data itself
        const academicYears = [...new Set(all.map((r) => r.academicYear).filter(Boolean))].sort().reverse();
        const semesters = [...new Set(all.map((r) => r.semester).filter(Boolean))].sort();

        const { academicYear, semester } = req.query;
        const records = all.filter((r) =>
            (!academicYear || r.academicYear === academicYear) && (!semester || r.semester === semester));

        const configured = await getCategories();
        const categories = [...configured.map((c) => ({ key: c.key, label: c.label || c.key }))];
        // Keys used by schedules but since removed from Settings still get a tab
        for (const key of new Set(records.map((r) => r.category).filter(Boolean))) {
            if (!categories.some((c) => c.key === key)) categories.push({ key, label: key });
        }
        if (records.some((r) => !r.category)) categories.push(UNCATEGORIZED);

        const duties = records.map((r) => ({
            _id: r._id,
            category: r.category || UNCATEGORIZED.key,
            examScheduleName: r.examScheduleName || "",
            examDate: r.examDate,
            session: r.session,
            examTime: r.examTime,
            hallName: r.role === "reserve" ? "Reserve" : r.hallName,
            subjects: r.subjects || [],
            role: r.role === "reserve" ? "Reserve" : "Invigilator",
            convertedFromReserve: !!r.convertedFromReserve,
            planType: r.planType,
            academicYear: r.academicYear,
            semester: r.semester,
        })).sort((a, b) => `${b.examDate}${b.session === "AN" ? 1 : 0}`.localeCompare(`${a.examDate}${a.session === "AN" ? 1 : 0}`));

        const countsByCategory = Object.fromEntries(categories.map((c) => [c.key, 0]));
        duties.forEach((d) => { countsByCategory[d.category] = (countsByCategory[d.category] || 0) + 1; });

        res.json({
            faculty,
            total: duties.length,
            categories,
            countsByCategory,
            duties,
            filters: { academicYears, semesters },
        });
    } catch (err) {
        console.error("Error fetching faculty duty history:", err);
        res.status(500).json({ error: "Failed to load duty history" });
    }
};
