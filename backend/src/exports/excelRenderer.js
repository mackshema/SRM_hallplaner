import ExcelJS from "exceljs";
import { fitWithin } from "../utils/logo.js";

/**
 * Renders a document definition (see exportData.js) to .xlsx.
 *
 * One worksheet per section. Each sheet has the institution header (with the
 * Settings logo when present), a styled + frozen header row with an
 * AutoFilter, set column widths and an A4 print setup that repeats the header
 * row. No merged cells, so sorting and filtering work normally.
 */

const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3A68" } };
const THIN = { style: "thin", color: { argb: "FFB0B7C3" } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

const sheetName = (name, used) => {
  let base = String(name || "Sheet").replace(/[\\/?*[\]:]/g, "-").slice(0, 28) || "Sheet";
  let candidate = base;
  for (let i = 2; used.has(candidate.toLowerCase()); i++) candidate = `${base.slice(0, 26)} ${i}`;
  used.add(candidate.toLowerCase());
  return candidate;
};

const addLogo = (workbook, sheet, logo, col) => {
  if (!logo || !["png", "jpg", "gif"].includes(logo.type)) return 0;
  const size = fitWithin(logo.width, logo.height, 180, 56);
  const id = workbook.addImage({ buffer: logo.buffer, extension: logo.type === "jpg" ? "jpeg" : logo.type });
  sheet.addImage(id, { tl: { col, row: 0 }, ext: { width: size.width, height: size.height }, editAs: "oneCell" });
  return size.height;
};

export const renderExcel = async (doc, { branding, meta }) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = branding.institutionName;
  workbook.created = new Date();
  const used = new Set();

  for (const section of doc.sections.length ? doc.sections : [{ name: doc.title, columns: [{ header: "Info", key: "info", width: 40 }], rows: [] }]) {
    const sheet = workbook.addWorksheet(sheetName(section.name, used));
    const colCount = section.columns.length;
    sheet.columns = section.columns.map((c) => ({ key: c.key, width: c.width || 14 }));

    // Header block: logo row, then one line of text per row (column A, no merging)
    const logoHeight = Math.max(
      addLogo(workbook, sheet, branding.leftLogo, 0),
      addLogo(workbook, sheet, branding.rightLogo, Math.max(colCount - 2, 1))
    );
    let r = 1;
    if (logoHeight) { sheet.getRow(r).height = logoHeight * 0.75 + 4; r++; }
    const lines = [
      { text: branding.institutionName, font: { bold: true, size: 14 } },
      { text: branding.institutionSubtitle, font: { size: 11 } },
      { text: branding.examCellName, font: { bold: true, size: 11 } },
      { text: meta.subtitle, font: { size: 10 } },
      { text: doc.title.toUpperCase(), font: { bold: true, size: 12 } },
      section.heading ? { text: section.heading, font: { italic: true, size: 10 } } : null,
      section.subheading ? { text: section.subheading, font: { size: 10 } } : null,
    ].filter((l) => l && l.text);
    for (const line of lines) {
      const cell = sheet.getCell(r, 1);
      cell.value = line.text;
      cell.font = line.font;
      r++;
    }
    r++; // spacer

    // Table
    const headerRowNumber = r;
    const header = sheet.getRow(headerRowNumber);
    section.columns.forEach((c, i) => {
      const cell = header.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = HEADER_FILL;
      cell.border = BORDER;
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });
    header.height = 22;

    const absent = new Set((section.absentCells || []).map((a) => `${a.row}:${a.key}`));
    section.rows.forEach((row, idx) => {
      const excelRow = sheet.getRow(headerRowNumber + 1 + idx);
      section.columns.forEach((c, i) => {
        const cell = excelRow.getCell(i + 1);
        const v = row[c.key];
        cell.value = v === undefined || v === null ? "" : v;
        cell.border = BORDER;
        cell.alignment = { vertical: "top", wrapText: true };
        if (absent.has(`${idx}:${c.key}`)) cell.font = { color: { argb: "FFC00000" }, bold: true };
      });
    });
    const lastRow = headerRowNumber + section.rows.length;

    if (colCount) {
      sheet.autoFilter = { from: { row: headerRowNumber, column: 1 }, to: { row: Math.max(lastRow, headerRowNumber), column: colCount } };
    }
    sheet.views = [{ state: "frozen", ySplit: headerRowNumber, xSplit: 0 }];

    if (section.footer) {
      const footerRow = sheet.getRow(lastRow + 3);
      footerRow.getCell(1).value = section.footer.left;
      footerRow.getCell(1).font = { bold: true };
      if (colCount > 1) {
        footerRow.getCell(colCount).value = section.footer.right;
        footerRow.getCell(colCount).alignment = { horizontal: "right" };
      }
    }

    sheet.pageSetup = {
      paperSize: 9, // A4
      orientation: doc.orientation === "landscape" ? "landscape" : "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 },
      printTitlesRow: `${headerRowNumber}:${headerRowNumber}`,
    };
    sheet.headerFooter = { oddFooter: `&L${branding.institutionName}&RPage &P of &N` };
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
};
