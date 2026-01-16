// src/lib/exportWord.ts
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  AlignmentType,
  HeadingLevel,
  WidthType,
  PageOrientation,
} from "docx";

export type ExportWordOptions = {
  filename: string;
  title: string;
  generatedOn?: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  footerText?: string;
  landscape?: boolean;
};

export async function exportTableAsDoc(options: ExportWordOptions) {
  const { filename, title, generatedOn, headers, rows, footerText, landscape = false } = options;

  console.log("📄 exportTableAsDoc()", {
    filename,
    headers: headers?.length,
    rows: rows?.length,
    landscape
  });

  // -------------------------
  // Filename normalization
  // -------------------------
  const outFilename = filename.toLowerCase().endsWith(".docx")
    ? filename
    : `${filename.replace(/\.doc$/i, "")}.docx`;

  // -------------------------
  // Normalize headers & rows
  // -------------------------
  const safeHeaders: string[] = Array.isArray(headers)
    ? headers.map((h) => String(h))
    : [];

  const safeRows: string[][] = Array.isArray(rows)
    ? rows.map((r) =>
      Array.isArray(r)
        ? r.map((c) => {
          if (c === null || c === undefined) return "";
          // Handle numbers, strings, and other types
          if (typeof c === 'number') return String(c);
          if (typeof c === 'string') return c;
          return String(c);
        })
        : []
    )
    : [];

  // Infer headers if missing
  if (safeHeaders.length === 0 && safeRows.length > 0) {
    for (let i = 0; i < safeRows[0].length; i++) {
      safeHeaders.push(`Column ${i + 1}`);
    }
  }

  if (safeHeaders.length === 0) {
    alert("No data available to export");
    return;
  }

  // -------------------------
  // Build Table Rows
  // -------------------------
  const tableRows: TableRow[] = [];

  // Header row
  tableRows.push(
    new TableRow({
      children: safeHeaders.map(
        (h) =>
          new TableCell({
            width: { size: 100 / safeHeaders.length, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [new TextRun({ text: h, bold: true })],
                alignment: AlignmentType.CENTER,
              }),
            ],
          })
      ),
    })
  );

  // Data rows
  safeRows.forEach((row) => {
    tableRows.push(
      new TableRow({
        children: safeHeaders.map((_, i) =>
          new TableCell({
            children: [
              new Paragraph({
                text: row[i] ?? "",
              }),
            ],
          })
        ),
      })
    );
  });

  // -------------------------
  // Create Table
  // -------------------------
  const table = new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });

  // -------------------------
  // Build Document Children
  // -------------------------
  const children: (Paragraph | Table)[] = [];

  // Title
  // Split title by newline if present to support multiline titles
  const titleLines = title.split('\n');
  titleLines.forEach(line => {
    children.push(
      new Paragraph({
        text: line,
        heading: HeadingLevel.HEADING1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
      })
    );
  });

  if (generatedOn) {
    children.push(
      new Paragraph({
        text: generatedOn,
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
      })
    );
  }

  children.push(table);

  if (footerText) {
    children.push(
      new Paragraph({
        text: footerText,
        spacing: { before: 400 },
      })
    );
  }

  // -------------------------
  // ✅ CREATE DOCUMENT (IMMUTABLE)
  // -------------------------
  const pageProperties: any = {};
  if (landscape) {
    pageProperties.size = {
      orientation: PageOrientation.LANDSCAPE,
      width: 16838,
      height: 11906,
    };
    pageProperties.margin = {
      top: 720,
      right: 720,
      bottom: 720,
      left: 720,
    };
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: pageProperties.size ? pageProperties : undefined
        },
        children,
      },
    ],
  });

  // -------------------------
  // Export DOCX
  // -------------------------
  try {
    const blob = await Packer.toBlob(doc);

    if (!blob || blob.size < 300) {
      throw new Error("DOCX blob too small");
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = outFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    console.log("✅ Word export successful:", outFilename);
    return { success: true, filename: outFilename };
  } catch (err) {
    console.error("❌ DOCX failed, using HTML fallback", err);
    return exportHtmlFallback({
      filename: outFilename.replace(/\.docx$/i, ".doc"),
      title,
      generatedOn,
      headers: safeHeaders,
      rows: safeRows,
      footerText,
    });
  }
}

// --------------------------------------------------
// HTML .DOC FALLBACK (Guaranteed to open in Word)
// --------------------------------------------------
async function exportHtmlFallback(data: {
  filename: string;
  title: string;
  generatedOn?: string;
  headers: string[];
  rows: string[][];
  footerText?: string;
}) {
  const { filename, title, generatedOn, headers, rows, footerText } = data;

  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #000; padding: 6px; }
  th { background: #f2f2f2; }
</style>
</head>
<body>
<h1>${title}</h1>
${generatedOn ? `<p>Generated on: ${generatedOn}</p>` : ""}
<table>
  <thead>
    <tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>
  </thead>
  <tbody>
    ${rows
      .map(
        (r) =>
          `<tr>${headers
            .map((_, i) => `<td>${r[i] ?? ""}</td>`)
            .join("")}</tr>`
      )
      .join("")}
  </tbody>
</table>
${footerText ? `<p>${footerText}</p>` : ""}
</body>
</html>`;

  const blob = new Blob(["\ufeff", html], {
    type: "application/msword",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  console.log("⚠ HTML fallback exported:", filename);
  return { success: false, filename };
}

export default exportTableAsDoc;
