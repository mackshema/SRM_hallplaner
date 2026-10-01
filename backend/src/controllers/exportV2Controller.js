import mongoose from "mongoose";
import archiver from "archiver";
import ExamSession from "../models/ExamSession.js";
import AnnaSeating from "../models/AnnaSeating.js";
import ExamSchedule from "../models/ExamSchedule.js";
import Settings from "../models/Settings.js";
import {
  PLAN_DOCUMENTS, SCHEDULE_DOCUMENTS, loadPlanExportData, buildPlanDocument, ensureDocumentData,
  buildDutySummaryDocument, buildFacultyHistoryDocument,
} from "../exports/exportData.js";
import { renderExcel } from "../exports/excelRenderer.js";
import { renderPdf } from "../exports/pdfRenderer.js";
import { startZipJob, getJob, jobView } from "../exports/exportJobs.js";
import { getFacultyDutyHistory } from "./facultyDutyHistoryController.js";

/**
 * Excel + PDF exports (replacing the Word exports; those stay available behind
 * Settings.useLegacyWordExport / EXPORT_LEGACY_WORD=true).
 *
 * format = xlsx | pdf | both   (both -> ZIP with /Excel and /PDF folders)
 */

const FORMATS = { xlsx: "xlsx", excel: "xlsx", pdf: "pdf", both: "both" };
const MIME = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  zip: "application/zip",
};

const parseFormat = (value) => FORMATS[String(value || "xlsx").toLowerCase()] || null;

const render = (format, doc, ctx) => (format === "xlsx" ? renderExcel(doc, ctx) : renderPdf(doc, ctx));

const sendFile = (res, fileName, type, buffer) => {
  res.attachment(fileName);
  res.type(type);
  res.send(buffer);
};

/** Sends one document in the requested format(s). */
const sendDocument = async (res, format, doc, ctx) => {
  if (format === "both") {
    res.attachment(`${doc.fileStem}.zip`);
    res.type(MIME.zip);
    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("error", (err) => { console.error("Archive error:", err); res.end(); });
    archive.pipe(res);
    archive.append(await renderExcel(doc, ctx), { name: `Excel/${doc.fileStem}.xlsx` });
    archive.append(await renderPdf(doc, ctx), { name: `PDF/${doc.fileStem}.pdf` });
    await archive.finalize();
    return;
  }
  sendFile(res, `${doc.fileStem}.${format}`, MIME[format], await render(format, doc, ctx));
};

/** GET /api/exports/config */
export const getExportConfig = async (req, res) => {
  const settings = await Settings.findOne().select("useLegacyWordExport").lean();
  res.json({
    legacyWord: process.env.EXPORT_LEGACY_WORD === "true" || !!settings?.useLegacyWordExport,
    planDocuments: PLAN_DOCUMENTS,
    scheduleDocuments: SCHEDULE_DOCUMENTS,
  });
};

/** GET /api/exports/plan/:planType/:planId/:docKey?format=&hallId= */
export const exportPlanDocument = async (req, res) => {
  try {
    const { planType, planId, docKey } = req.params;
    const format = parseFormat(req.query.format);
    if (!format) return res.status(400).json({ error: "format must be xlsx, pdf or both" });
    if (!PLAN_DOCUMENTS.some((d) => d.key === docKey)) return res.status(404).json({ error: "Unknown document type" });

    const data = await loadPlanExportData(planType, planId, { hallId: req.query.hallId });
    if (!data) return res.status(404).json({ error: "Seating plan not found" });
    if (req.query.hallId && !data.halls.length) return res.status(404).json({ error: "No students are seated in this hall for this plan" });
    await ensureDocumentData(docKey, data);
    const doc = buildPlanDocument(docKey, data);
    if (req.query.hallId && data.halls[0]) doc.fileStem += `_${data.halls[0].name}`.replace(/\s+/g, "_");
    await sendDocument(res, format, doc, data);
  } catch (err) {
    console.error("Export failed:", err);
    if (!res.headersSent) res.status(500).json({ error: "Export failed" });
  }
};

/** Adds every document of a plan to a ZIP job, in the chosen formats. */
const addPlanDocuments = async (ctx, planType, planId, formats, folderPrefix = "") => {
  const data = await loadPlanExportData(planType, planId);
  if (!data) return;
  for (const { key } of PLAN_DOCUMENTS) {
    await ensureDocumentData(key, data);
    const doc = buildPlanDocument(key, data);
    for (const format of formats) {
      const folder = format === "xlsx" ? "Excel" : "PDF";
      ctx.add(`${folderPrefix}${folder}/${doc.fileStem}.${format}`, await render(format, doc, data));
      ctx.step(`${data.meta.examDate} ${data.meta.session}: ${doc.title} (${format.toUpperCase()})`);
      await new Promise((r) => setImmediate(r)); // keep the server responsive
    }
  }
};

const parseFormats = (body) => {
  const f = parseFormat(body?.format || "both");
  return f === "both" ? ["xlsx", "pdf"] : f ? [f] : null;
};

/** POST /api/exports/plan/:planType/:planId/package  { format } -> job */
export const startPlanPackage = async (req, res) => {
  try {
    const { planType, planId } = req.params;
    const formats = parseFormats(req.body);
    if (!formats) return res.status(400).json({ error: "format must be xlsx, pdf or both" });
    const Model = planType === "anna" ? AnnaSeating : planType === "internal" ? ExamSession : null;
    if (!Model || !mongoose.isValidObjectId(planId)) return res.status(404).json({ error: "Seating plan not found" });
    const plan = await Model.findById(planId).select("examDate examSession session").lean();
    if (!plan) return res.status(404).json({ error: "Seating plan not found" });
    const session = plan.examSession || plan.session;

    const job = startZipJob({
      ownerId: req.user.id,
      fileName: `${planType === "anna" ? "Anna_University" : "Internal"}_${plan.examDate}_${session}_All_Documents.zip`,
      build: async (ctx) => {
        ctx.setTotal(PLAN_DOCUMENTS.length * formats.length);
        await addPlanDocuments(ctx, planType, planId, formats);
      },
    });
    res.status(202).json(job);
  } catch (err) {
    console.error("Failed to start export:", err);
    res.status(500).json({ error: "Failed to start export" });
  }
};

/** GET /api/exports/schedule/:scheduleId/duty-summary?format= */
export const exportDutySummary = async (req, res) => {
  try {
    const format = parseFormat(req.query.format);
    if (!format) return res.status(400).json({ error: "format must be xlsx, pdf or both" });
    if (!mongoose.isValidObjectId(req.params.scheduleId)) return res.status(404).json({ error: "Exam schedule not found" });
    const built = await buildDutySummaryDocument(req.params.scheduleId);
    if (!built) return res.status(404).json({ error: "Exam schedule not found" });
    await sendDocument(res, format, built.doc, built);
  } catch (err) {
    console.error("Duty summary export failed:", err);
    if (!res.headersSent) res.status(500).json({ error: "Export failed" });
  }
};

/**
 * POST /api/exports/schedule/:scheduleId/package { format }
 * Every document of every plan in the schedule + the duty summary, one folder per plan.
 */
export const startSchedulePackage = async (req, res) => {
  try {
    const formats = parseFormats(req.body);
    if (!formats) return res.status(400).json({ error: "format must be xlsx, pdf or both" });
    const { scheduleId } = req.params;
    if (!mongoose.isValidObjectId(scheduleId)) return res.status(404).json({ error: "Exam schedule not found" });
    const schedule = await ExamSchedule.findById(scheduleId).lean();
    if (!schedule) return res.status(404).json({ error: "Exam schedule not found" });
    const [internal, anna] = await Promise.all([
      ExamSession.find({ examScheduleId: scheduleId }).select("examDate examSession").lean(),
      AnnaSeating.find({ examScheduleId: scheduleId }).select("examDate session").lean(),
    ]);
    const plans = [
      ...internal.map((p) => ({ planType: "internal", planId: p._id, label: `${p.examDate}_${p.examSession}` })),
      ...anna.map((p) => ({ planType: "anna", planId: p._id, label: `${p.examDate}_${p.session}_Anna` })),
    ].sort((a, b) => a.label.localeCompare(b.label));
    const stem = schedule.name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_");

    const job = startZipJob({
      ownerId: req.user.id,
      fileName: `${stem}_All_Documents.zip`,
      build: async (ctx) => {
        ctx.setTotal((plans.length * PLAN_DOCUMENTS.length + 1) * formats.length);
        for (const p of plans) await addPlanDocuments(ctx, p.planType, p.planId, formats, `${p.label}/`);
        const built = await buildDutySummaryDocument(scheduleId);
        for (const format of formats) {
          ctx.add(`Duty_Summary/${format === "xlsx" ? "Excel" : "PDF"}/${built.doc.fileStem}.${format}`, await render(format, built.doc, built));
          ctx.step(`Duty Summary (${format.toUpperCase()})`);
        }
      },
    });
    res.status(202).json(job);
  } catch (err) {
    console.error("Failed to start schedule export:", err);
    res.status(500).json({ error: "Failed to start export" });
  }
};

/** GET /api/exports/faculty/:facultyId/history?format=  (admin, or the faculty member) */
export const exportFacultyHistory = async (req, res) => {
  try {
    const format = parseFormat(req.query.format);
    if (!format) return res.status(400).json({ error: "format must be xlsx, pdf or both" });
    // Reuse the history endpoint's logic (and its access check) to get the data
    let history = null;
    let status = 200;
    await getFacultyDutyHistory(req, {
      status(code) { status = code; return this; },
      json(body) { history = body; return this; },
    });
    if (status !== 200) return res.status(status).json(history);
    const built = await buildFacultyHistoryDocument(history);
    await sendDocument(res, format, built.doc, built);
  } catch (err) {
    console.error("Faculty history export failed:", err);
    if (!res.headersSent) res.status(500).json({ error: "Export failed" });
  }
};

/** GET /api/exports/jobs/:jobId */
export const getExportJob = (req, res) => {
  const job = getJob(req.params.jobId, req.user);
  if (!job) return res.status(404).json({ error: "Export job not found or expired" });
  res.json(jobView(job));
};

/** GET /api/exports/jobs/:jobId/download */
export const downloadExportJob = (req, res) => {
  const job = getJob(req.params.jobId, req.user);
  if (!job) return res.status(404).json({ error: "Export job not found or expired" });
  if (job.status !== "done") return res.status(409).json({ error: "Export is not ready yet" });
  res.download(job.filePath, job.fileName);
};
