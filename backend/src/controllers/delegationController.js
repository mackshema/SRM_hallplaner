import DelegationRequest from "../models/DelegationRequest.js";
import User from "../models/User.js";
import FacultyDuty from "../models/FacultyDuty.js";
import Hall from "../models/Hall.js";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 465,
    secure: process.env.EMAIL_PORT === '465' || process.env.EMAIL_PORT == undefined,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const getBaseUrl = (req) => {
    return `${req.protocol}://${req.get('host')}`;
};

// Email buttons are clicked outside the app, so they can't send a login token.
// Each link carries its own signed token that only allows this action on this
// request (checked by allowEmailLink in delegationRoutes.js).
const actionLink = (req, id, action) => {
    const t = jwt.sign({ rid: String(id), action }, process.env.JWT_SECRET, { expiresIn: '7d' });
    return `${getBaseUrl(req)}/api/delegation/${id}/${action}?t=${t}`;
};

// A failed email must not undo or hide an action that has already been saved.
const trySendMail = async (mailOptions) => {
    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error("Delegation email failed:", error.message);
        return false;
    }
};

export const createDelegationRequest = async (req, res) => {
    try {
        const { requestingFacultyId, replacementFacultyId, examDate, examSession, hallNumber, reason } = req.body;

        const requestingFaculty = await User.findById(requestingFacultyId);
        const replacementFaculty = await User.findById(replacementFacultyId);

        if (!requestingFaculty || !replacementFaculty) {
            return res.status(404).json({ message: "Faculty not found" });
        }

        const newRequest = await DelegationRequest.create({
            requestingFacultyId,
            replacementFacultyId,
            department: requestingFaculty.department,
            designation: requestingFaculty.designation,
            examDate,
            examSession,
            hallNumber,
            reason
        });

        // Step 1: System identifies the HOD of the requesting faculty's department
        const departmentHOD = await User.findOne({
            department: requestingFaculty.department,
            designation: "HOD"
        });

        // Step 2: Delegation approval email is sent ONLY to the requesting faculty's department HOD.
        // Falls back to manually entered hodEmail if HOD user isn't found in DB.
        const hodEmail = departmentHOD ? (departmentHOD.facultyEmail || departmentHOD.username) : requestingFaculty.hodEmail;
        let emailSent = false;
        if (hodEmail) {
            const approveUrl = actionLink(req, newRequest._id, 'hod-approve');
            const declineUrl = actionLink(req, newRequest._id, 'hod-reject');

            const mailOptions = {
                from: `"Exam Cell" <${process.env.EMAIL_USER}>`,
                to: hodEmail,
                subject: 'Emergency Duty Delegation Request - Action Required',
                html: `
                    <h2>Emergency Duty Delegation Request</h2>
                    <p><strong>Requesting Faculty:</strong> ${requestingFaculty.name} (${requestingFaculty.department} - ${requestingFaculty.designation})</p>
                    <p><strong>Proposed Replacement:</strong> ${replacementFaculty.name}</p>
                    <p><strong>Exam Date/Session:</strong> ${examDate} (${examSession})</p>
                    <p><strong>Hall:</strong> ${hallNumber}</p>
                    <p><strong>Reason:</strong> ${reason || "N/A"}</p>
                    <br/>
                    <a href="${approveUrl}" style="padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px;">APPROVE</a>
                    &nbsp;&nbsp;
                    <a href="${declineUrl}" style="padding: 10px 20px; background-color: #f44336; color: white; text-decoration: none; border-radius: 5px;">REJECT</a>
                `
            };

            emailSent = await trySendMail(mailOptions);
        }

        res.status(201).json({ ...newRequest.toObject(), emailSent });
    } catch (error) {
        console.error("Delegation creation error:", error);
        res.status(500).json({ message: "Failed to create delegation request" });
    }
};

export const hodApprove = async (req, res) => {
    try {
        const { id } = req.params;
        const request = await DelegationRequest.findOneAndUpdate(
            { _id: id, status: 'Pending HOD Approval' },
            { hodApprovalStatus: 'Approved', status: 'Pending Faculty Response' },
            { new: true }
        ).populate('requestingFacultyId replacementFacultyId');

        if (!request) {
            const existing = await DelegationRequest.findById(id);
            if (!existing) return res.status(404).send("Request not found");
            return res.status(400).send(`<h1>This request has already been handled (${existing.status}).</h1>`);
        }

        const replacementEmail = request.replacementFacultyId.facultyEmail;
        if (replacementEmail) {
            const acceptUrl = actionLink(req, request._id, 'faculty-accept');
            const declineUrl = actionLink(req, request._id, 'faculty-decline');

            const mailOptions = {
                from: `"Exam Cell" <${process.env.EMAIL_USER}>`,
                to: replacementEmail,
                subject: 'Exam Duty Delegation Request (HOD Approved)',
                html: `
                    <h2>Duty Delegation Request</h2>
                    <p>You have been requested to take over an exam duty.</p>
                    <p><strong>Original Faculty:</strong> ${request.requestingFacultyId.name}</p>
                    <p><strong>Exam Date/Session:</strong> ${request.examDate} (${request.examSession})</p>
                    <p><strong>Hall:</strong> ${request.hallNumber}</p>
                    <br/>
                    <a href="${acceptUrl}" style="padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px;">ACCEPT</a>
                    &nbsp;&nbsp;
                    <a href="${declineUrl}" style="padding: 10px 20px; background-color: #f44336; color: white; text-decoration: none; border-radius: 5px;">DECLINE</a>
                `
            };

            const sent = await trySendMail(mailOptions);
            return res.send(sent
                ? "<h1>Request Approved successfully. Email sent to replacement faculty.</h1>"
                : "<h1>Request Approved. The email to the replacement faculty could not be sent - please inform them directly.</h1>");
        }

        res.send("<h1>Request Approved. The replacement faculty has no email on file - please inform them directly.</h1>");
    } catch (error) {
        console.error("HOD Approve error:", error);
        res.status(500).send("Error approving request");
    }
};

export const hodReject = async (req, res) => {
    try {
        const { id } = req.params;
        const request = await DelegationRequest.findOneAndUpdate(
            { _id: id, status: 'Pending HOD Approval' },
            { hodApprovalStatus: 'Rejected', status: 'Rejected by HOD' }
        );
        if (!request) return res.status(400).send("<h1>This request has already been handled.</h1>");
        res.send("<h1>Request Rejected. The delegation has been cancelled.</h1>");
    } catch (error) {
        res.status(500).send("Error rejecting request");
    }
};

export const facultyAccept = async (req, res) => {
    try {
        const { id } = req.params;
        const request = await DelegationRequest.findById(id).populate('replacementFacultyId');

        if (!request) return res.status(404).send("Request not found");
        if (request.status !== 'Pending Faculty Response') return res.status(400).send("Invalid state for acceptance");

        request.facultyResponseStatus = 'Accepted';
        request.status = 'Accepted';
        await request.save();

        // Transfer Duty in FacultyDuty
        await FacultyDuty.updateMany(
            { 
               facultyId: request.requestingFacultyId, 
               examDate: request.examDate, 
               examSession: request.examSession 
            },
            { $set: { facultyId: request.replacementFacultyId._id } }
        );

        // Transfer Duty in Hall.facultyAssigned
        const halls = await Hall.find({
            name: request.hallNumber,
            examDate: request.examDate,
            examSession: request.examSession
        });

        for (let hall of halls) {
            if (hall.facultyAssigned && hall.facultyAssigned.includes(request.requestingFacultyId._id.toString())) {
                hall.facultyAssigned = hall.facultyAssigned.filter(id => id !== request.requestingFacultyId._id.toString());
                hall.facultyAssigned.push(request.replacementFacultyId._id.toString());
                await hall.save();
            }
        }

        res.send(`<h1>Duty Accepted. Thank you, ${request.replacementFacultyId.name}.</h1>`);
    } catch (error) {
        console.error("Faculty Accept error:", error);
        res.status(500).send("Error accepting request");
    }
};

export const facultyDecline = async (req, res) => {
    try {
        const { id } = req.params;
        const request = await DelegationRequest.findOneAndUpdate(
            { _id: id, status: 'Pending Faculty Response' },
            { facultyResponseStatus: 'Declined', status: 'Declined' }
        );
        if (!request) return res.status(400).send("<h1>This request is not waiting for your response.</h1>");
        res.send("<h1>You have declined the duty delegation.</h1>");
    } catch (error) {
        res.status(500).send("Error declining request");
    }
};

export const getDelegationRequests = async (req, res) => {
    try {
        const { facultyId } = req.params;
        const requests = await DelegationRequest.find({
            $or: [
                { requestingFacultyId: facultyId },
                { replacementFacultyId: facultyId }
            ]
        }).populate('requestingFacultyId replacementFacultyId').sort({ createdAt: -1 });
        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: "Failed to get requests" });
    }
};
