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
  ImageRun,
  BorderStyle,
} from "docx";

export type ExportWordOptions = {
  filename: string;
  title: string;
  generatedOn?: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  footerText?: string;
  landscape?: boolean;
  leftLogo?: string;
  rightLogo?: string;
  institutionSubtitle?: string;
  institutionAffiliation?: string;
};

export async function exportTableAsDoc(options: ExportWordOptions) {
  const { 
    filename, 
    title, 
    generatedOn, 
    headers, 
    rows, 
    footerText, 
    landscape = false,
    leftLogo,
    rightLogo,
    institutionSubtitle,
    institutionAffiliation
  } = options;

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

  // Header with Logos if provided
  if (leftLogo || rightLogo) {
    const parseImg = (dataUrl?: string) => {
      if (!dataUrl) return null;
      try {
        const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
        let type: "png" | "jpg" | "gif" = "png";
        let b64 = dataUrl;
        if (match) {
          const t = match[1].toLowerCase();
          type = (t === "jpeg" || t === "jpg") ? "jpg" : (t === "gif" ? "gif" : "png");
          b64 = match[2];
        } else if (dataUrl.includes(",")) {
          b64 = dataUrl.split(",")[1];
        }
        const binary = atob(b64);
        const data = Uint8Array.from(binary, c => c.charCodeAt(0));
        return { data, type };
      } catch (e) {
        return null;
      }
    };

    const leftImg = parseImg(leftLogo);
    const rightImg = parseImg(rightLogo);

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE, size: 0, color: "auto" },
          bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
          left: { style: BorderStyle.NONE, size: 0, color: "auto" },
          right: { style: BorderStyle.NONE, size: 0, color: "auto" },
          insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
          insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
        },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 15, type: WidthType.PERCENTAGE },
                children: [
                  leftImg ? new Paragraph({
                    children: [
                      new ImageRun({
                        data: leftImg.data,
                        transformation: { width: 60, height: 60 },
                        type: leftImg.type
                      })
                    ],
                    alignment: AlignmentType.LEFT
                  }) : new Paragraph(""),
                ],
              }),
              new TableCell({
                width: { size: 70, type: WidthType.PERCENTAGE },
                children: [
                  new Paragraph({
                    text: title.split('\n')[0] || "",
                    heading: HeadingLevel.HEADING_1,
                    alignment: AlignmentType.CENTER,
                  }),
                  institutionSubtitle ? new Paragraph({
                    text: institutionSubtitle,
                    alignment: AlignmentType.CENTER,
                  }) : new Paragraph(""),
                  institutionAffiliation ? new Paragraph({
                    text: institutionAffiliation,
                    alignment: AlignmentType.CENTER,
                  }) : new Paragraph(""),
                ],
              }),
              new TableCell({
                width: { size: 15, type: WidthType.PERCENTAGE },
                children: [
                  rightImg ? new Paragraph({
                    children: [
                      new ImageRun({
                        data: rightImg.data,
                        transformation: { width: 60, height: 60 },
                        type: rightImg.type
                      })
                    ],
                    alignment: AlignmentType.RIGHT
                  }) : new Paragraph(""),
                ],
              }),
            ],
          }),
        ],
      })
    );

    // Remaining title lines if any
    const titleLines = title.split('\n').slice(1);
    titleLines.forEach(line => {
      children.push(
        new Paragraph({
          text: line,
          heading: HeadingLevel.HEADING_2,
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
        })
      );
    });
  } else {
    // Standard title
    const titleLines = title.split('\n');
    titleLines.forEach(line => {
      children.push(
        new Paragraph({
          text: line,
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
        })
      );
    });
  }

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
      leftLogo,
      rightLogo,
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
  leftLogo?: string;
  rightLogo?: string;
}) {
  const { filename, title, generatedOn, headers, rows, footerText, leftLogo, rightLogo } = data;

  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #000; padding: 6px; }
  th { background: #f2f2f2; }
  .header-table { border: none; margin-bottom: 20px; }
  .header-table td { border: none; padding: 4px; text-align: center; }
</style>
</head>
<body>
${leftLogo || rightLogo ? `
<table class="header-table" style="width: 100%;">
  <tr>
    <td style="width: 20%; text-align: left;">${leftLogo ? `<img src="${leftLogo}" style="max-height: 70px; max-width: 120px;" />` : ''}</td>
    <td style="width: 60%; text-align: center;"><h2>${title.replace(/\n/g, '<br/>')}</h2></td>
    <td style="width: 20%; text-align: right;">${rightLogo ? `<img src="${rightLogo}" style="max-height: 70px; max-width: 120px;" />` : ''}</td>
  </tr>
</table>` : `<h1>${title.replace(/\n/g, '<br/>')}</h1>`}
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
