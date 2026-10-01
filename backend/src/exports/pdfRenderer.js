import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { fitWithin } from "../utils/logo.js";

/**
 * Renders a document definition (see exportData.js) to PDF: A4, the
 * institution header with the Settings logos repeated on every page, table
 * headers repeated on every page, rows never split across pages, and
 * "Page X of Y" numbering. Each section starts on a new page.
 */

const MARGIN = 12;
const LOGO_BOX = { w: 26, h: 18 }; // mm

const drawLogo = (pdf, logo, x, y, alignRight) => {
  if (!logo) return;
  const size = fitWithin(logo.width, logo.height, LOGO_BOX.w, LOGO_BOX.h);
  const left = alignRight ? x - size.width : x;
  try {
    pdf.addImage(logo.dataUrl, logo.type === "jpg" ? "JPEG" : logo.type.toUpperCase(), left, y, size.width, size.height);
  } catch (err) {
    console.warn("[EXPORT] Logo skipped in PDF:", err.message);
  }
};

/** Draws the page header; returns the y where content may start. */
const drawHeader = (pdf, { branding, meta, title, section }) => {
  const width = pdf.internal.pageSize.getWidth();
  const center = width / 2;
  drawLogo(pdf, branding.leftLogo, MARGIN, 7, false);
  drawLogo(pdf, branding.rightLogo, width - MARGIN, 7, true);

  let y = 12;
  pdf.setTextColor(20);
  pdf.setFont("helvetica", "bold").setFontSize(13);
  pdf.text(branding.institutionName, center, y, { align: "center", maxWidth: width - 2 * (MARGIN + LOGO_BOX.w) });
  y += 5;
  pdf.setFont("helvetica", "normal").setFontSize(9);
  if (branding.institutionSubtitle) { pdf.text(branding.institutionSubtitle, center, y, { align: "center" }); y += 4; }
  if (branding.examCellName) { pdf.setFont("helvetica", "bold"); pdf.text(branding.examCellName, center, y, { align: "center" }); y += 4; }
  pdf.setFont("helvetica", "normal").setFontSize(8.5);
  pdf.text(meta.subtitle, center, y, { align: "center", maxWidth: width - 2 * MARGIN });
  y += 5;
  pdf.setFont("helvetica", "bold").setFontSize(11);
  pdf.text(title.toUpperCase(), center, y, { align: "center" });
  y = Math.max(y + 2, 7 + LOGO_BOX.h + 1);
  pdf.setDrawColor(160).setLineWidth(0.3).line(MARGIN, y, width - MARGIN, y);
  y += 4;
  if (section?.heading) {
    pdf.setFont("helvetica", "bold").setFontSize(9);
    pdf.text(section.heading, MARGIN, y, { maxWidth: width - 2 * MARGIN });
    y += 4.5;
  }
  if (section?.subheading) {
    pdf.setFont("helvetica", "normal").setFontSize(8.5);
    pdf.text(section.subheading, MARGIN, y, { maxWidth: width - 2 * MARGIN });
    y += 4.5;
  }
  return y + 1;
};

export const renderPdf = async (doc, { branding, meta }) => {
  const pdf = new jsPDF({ orientation: doc.orientation === "landscape" ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const sections = doc.sections.length ? doc.sections : [{ name: doc.title, columns: [{ header: "Info", key: "info" }], rows: [{ info: "No data" }] }];

  sections.forEach((section, index) => {
    if (index > 0) pdf.addPage();
    const ctx = { branding, meta, title: doc.title, section };
    const startY = drawHeader(pdf, ctx);
    const absent = new Set((section.absentCells || []).map((a) => `${a.row}:${a.key}`));
    const dense = section.columns.length > 10;

    autoTable(pdf, {
      startY,
      margin: { top: startY, left: MARGIN, right: MARGIN, bottom: 14 },
      head: [section.columns.map((c) => c.header)],
      body: section.rows.map((row) => section.columns.map((c) => (row[c.key] ?? "").toString())),
      theme: "grid",
      showHead: "everyPage",
      rowPageBreak: "avoid",
      styles: { fontSize: dense ? 6.5 : 8.5, cellPadding: dense ? 1.2 : 1.8, overflow: "linebreak", lineColor: [150, 150, 150], lineWidth: 0.2 },
      headStyles: { fillColor: [31, 58, 104], textColor: 255, fontStyle: "bold", halign: "center" },
      didParseCell: (hook) => {
        if (hook.section !== "body") return;
        const key = section.columns[hook.column.index]?.key;
        if (absent.has(`${hook.row.index}:${key}`)) {
          hook.cell.styles.textColor = [192, 0, 0];
          hook.cell.styles.fontStyle = "bold";
        }
      },
      // Repeat the institution header (with logo) on every page after the first
      didDrawPage: (hook) => { if (hook.pageNumber > 1) drawHeader(pdf, ctx); },
    });

    if (section.footer) {
      const pageHeight = pdf.internal.pageSize.getHeight();
      const width = pdf.internal.pageSize.getWidth();
      let y = (pdf.lastAutoTable?.finalY || startY) + 16;
      if (y > pageHeight - 18) { pdf.addPage(); y = drawHeader(pdf, ctx) + 16; }
      pdf.setFont("helvetica", "bold").setFontSize(9);
      pdf.text(section.footer.left, MARGIN, y, { maxWidth: width / 2 - MARGIN });
      pdf.text(section.footer.right, width - MARGIN, y, { align: "right" });
    }
  });

  // Page numbers
  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    const w = pdf.internal.pageSize.getWidth();
    const h = pdf.internal.pageSize.getHeight();
    pdf.setFont("helvetica", "normal").setFontSize(8).setTextColor(90);
    pdf.text(branding.institutionName, MARGIN, h - 6);
    pdf.text(`Page ${i} of ${total}`, w - MARGIN, h - 6, { align: "right" });
  }

  return Buffer.from(pdf.output("arraybuffer"));
};
