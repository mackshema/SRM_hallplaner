import {
    Document,
    Packer,
    Paragraph,
    Table,
    TableRow,
    TableCell,
    TextRun,
    AlignmentType,
    WidthType,
    PageOrientation,
    BorderStyle,
} from "docx";
import { Hall, Department } from "./db";

type StudentSeat = {
    row: number;
    column: number;
    benchPosition: number;
    rollNumber: string;
    departmentId?: number;
    departmentName?: string;
};

export interface HeaderSettings {
    institutionName: string;
    institutionSubtitle: string;
    institutionAffiliation: string;
    examCellName: string;
    academicYear: string;
    examName: string;
}

interface ExportBenchLayoutWordOptions {
    hall: Hall;
    seats: StudentSeat[][];
    seatAssignments?: any[]; // Allow passing raw assignments for full coverage
    departments: Department[];
    examDate: string;
    examSession: string;
    examTime: string;
    headerSettings: HeaderSettings;
}

export const exportBenchLayoutWordDoc = async ({
    hall,
    seats,
    seatAssignments,
    departments,
    examDate,
    examSession,
    examTime,
    headerSettings,
}: ExportBenchLayoutWordOptions) => {
    // 1. Prepare Header Paragraphs
    const headerParagraphs = [
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({
                    text: headerSettings.institutionName || "SRM MADURAI",
                    bold: true,
                    size: 36, // 18pt
                }),
            ],
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({
                    text: headerSettings.institutionSubtitle || "COLLEGE FOR ENGINEERING AND TECHNOLOGY",
                    size: 28, // 14pt
                }),
            ],
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
                new TextRun({
                    text: headerSettings.institutionAffiliation || "Approved by AICTE, New Delhi | Affiliated to Anna University, Chennai",
                    size: 20, // 10pt
                }),
            ],
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({
                    text: headerSettings.examCellName || "EXAMINATION CELL",
                    bold: true,
                    size: 28, // 14pt
                }),
            ],
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({
                    text: headerSettings.academicYear || "ACADEMIC YEAR 2025-2026 (ODD SEMESTER)",
                    size: 22, // 11pt
                }),
            ],
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({
                    text: headerSettings.examName || "INTERNAL ASSESSMENT TEST – II (Except I Year)",
                    size: 22,
                }),
            ],
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
            children: [
                new TextRun({
                    text: "SEATING ARRANGEMENT",
                    size: 22,
                }),
            ],
        }),
    ];

    // 2. Hall Info & Date Row (Using a borderless table for alignment)
    const infoTable = new Table({
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
                        width: { size: 50, type: WidthType.PERCENTAGE },
                        children: [
                            new Paragraph({
                                children: [new TextRun({ text: `Hall No: ${hall.name}`, size: 20 })],
                            }),
                        ],
                    }),
                    new TableCell({
                        width: { size: 50, type: WidthType.PERCENTAGE },
                        children: [
                            new Paragraph({
                                alignment: AlignmentType.RIGHT,
                                children: [
                                    new TextRun({
                                        text: `Date: ${examDate} (${examSession}) ${examTime}`,
                                        size: 20,
                                    }),
                                ],
                            }),
                        ],
                    }),
                ],
            }),
        ],
    });

    // 3. Summary Table Data Calculation
    const deptGroups: { [deptId: string]: string[] } = {};
    for (let r = 0; r < hall.rows; r++) {
        for (let c = 0; c < hall.columns; c++) {
            for (let s = 0; s < hall.seatsPerBench; s++) {
                const seatIndex = c * hall.seatsPerBench + s;
                const seat = seats[r]?.[seatIndex];
                if (seat?.rollNumber && seat.departmentId !== undefined) {
                    const deptKey = String(seat.departmentId);
                    if (!deptGroups[deptKey]) {
                        deptGroups[deptKey] = [];
                    }
                    if (!deptGroups[deptKey].includes(seat.rollNumber)) {
                        deptGroups[deptKey].push(seat.rollNumber);
                    }
                }
            }
        }
    }

    const summaryRows: TableRow[] = [];
    let totalCount = 0;

    // Header Row
    summaryRows.push(
        new TableRow({
            tableHeader: true,
            children: ["Department", "From", "To", "Count", "Present", "Absent", "Absentees Reg No*"].map(
                (text) =>
                    new TableCell({
                        children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 18 })], alignment: AlignmentType.CENTER })],
                    })
            ),
        })
    );

    Object.keys(deptGroups).forEach((deptIdStr) => {
        const deptId = parseInt(deptIdStr);
        // Find department by matching both id (number) and _id (string from MongoDB)
        const dept = departments.find((d) =>
            d.id === deptId ||
            String(d._id || d.id) === deptIdStr ||
            String(d._id || d.id) === String(deptId)
        );
        const rollNumbers = (deptGroups[deptIdStr] || []).sort((a, b) => {
            const numA = parseInt(a.replace(/\D/g, ''));
            const numB = parseInt(b.replace(/\D/g, ''));
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
        });

        if (rollNumbers.length > 0) {
            const fromRoll = rollNumbers[0];
            const toRoll = rollNumbers[rollNumbers.length - 1];
            const count = rollNumbers.length;
            totalCount += count;

            summaryRows.push(
                new TableRow({
                    children: [
                        dept?.name || (deptId === 0 ? "Manual Entry" : "Unknown"),
                        fromRoll,
                        toRoll,
                        count.toString(),
                        "",
                        "",
                        "",
                    ].map(
                        (val) =>
                            new TableCell({
                                children: [new Paragraph({ children: [new TextRun({ text: val, size: 18 })], alignment: AlignmentType.CENTER })],
                            })
                    ),
                })
            );
        }
    });

    // Total Row
    summaryRows.push(
        new TableRow({
            children: [
                new TableCell({ children: [new Paragraph("")] }),
                new TableCell({ children: [new Paragraph("")] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "TOTAL", bold: true, size: 18 })], alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: totalCount.toString(), bold: true, size: 18 })], alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [new Paragraph("")] }),
                new TableCell({ children: [new Paragraph("")] }),
                new TableCell({ children: [new Paragraph("")] }),
            ],
        })
    );

    const summaryTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: summaryRows,
    });

    // 4. Seating Layout Grid
    let seatGrid: string[][];
    let maxRow = hall.rows;
    let maxCol = hall.columns * hall.seatsPerBench; // Approx columns

    // If we have raw seat assignments, use them to expand the grid beyond hall.rows/cols (e.g. extra benches)
    if (seatAssignments && seatAssignments.length > 0) {
        // Find max row and max column from assignments
        seatAssignments.forEach(a => {
            if (a.row > maxRow) maxRow = a.row;
            // Column for grid is roughly (col-1)*seatsPerBench + (benchPosition-1)
            // But wait, export logic treats columns as distinct entities.
            // Let's ensure we cover all positions.
            const gridCol = (a.column - 1) * hall.seatsPerBench + (a.benchPosition - 1);
            if (gridCol >= maxCol) maxCol = gridCol + 1;
        });
    }

    // Initialize grid with dynamic size
    seatGrid = Array(maxRow)
        .fill(null)
        .map(() => Array(maxCol).fill(""));

    // Populate grid
    if (seatAssignments && seatAssignments.length > 0) {
        // Use assignments as source of truth
        seatAssignments.forEach(a => {
            const r = a.row - 1;
            const c = (a.column - 1) * hall.seatsPerBench + (a.benchPosition - 1);
            if (r >= 0 && c >= 0 && a.studentRollNumber) {
                // Ensure array bounds (just in case)
                if (!seatGrid[r]) seatGrid[r] = Array(maxCol).fill("");
                seatGrid[r][c] = a.studentRollNumber;
            }
        });
    } else {
        // Fallback: Use 'seats' 2D array (legacy/regular grid only)
        for (let r = 0; r < hall.rows; r++) {
            for (let c = 0; c < hall.columns * hall.seatsPerBench; c++) {
                const seat = seats[r]?.[c];
                if (seat?.rollNumber) {
                    seatGrid[r][c] = seat.rollNumber;
                }
            }
        }
    }

    // Identify non-empty columns
    const nonEmptyColumns: number[] = [];
    for (let c = 0; c < maxCol; c++) {
        let hasStudent = false;
        for (let r = 0; r < maxRow; r++) {
            if (seatGrid[r] && seatGrid[r][c]) {
                hasStudent = true;
                break;
            }
        }
        if (hasStudent) {
            nonEmptyColumns.push(c);
        }
    }

    const gridRows: TableRow[] = [];

    // Grid Header (A, B, C...)
    gridRows.push(
        new TableRow({
            children: [
                new TableCell({ children: [new Paragraph("")] }), // Row label column
                ...nonEmptyColumns.map((actualCol) => {
                    const columnLabel = String.fromCharCode(65 + actualCol);
                    return new TableCell({
                        children: [
                            new Paragraph({
                                children: [new TextRun({ text: columnLabel, bold: true, size: 18 })],
                                alignment: AlignmentType.CENTER,
                            }),
                        ],
                    });
                }),
            ],
        })
    );

    // Grid Rows
    for (let r = 0; r < maxRow; r++) {
        const rowCells: TableCell[] = [];

        // Row Number Label
        rowCells.push(
            new TableCell({
                children: [
                    new Paragraph({
                        children: [new TextRun({ text: (r + 1).toString(), bold: true, size: 18 })],
                        alignment: AlignmentType.CENTER,
                    }),
                ],
            })
        );

        // Roll Numbers
        nonEmptyColumns.forEach((actualCol) => {
            const rollNumber = seatGrid[r][actualCol] || "";
            const isBoldColumn = actualCol % 2 === 0;

            rowCells.push(
                new TableCell({
                    children: [
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: rollNumber,
                                    bold: !!rollNumber && isBoldColumn,
                                    italics: !!rollNumber && !isBoldColumn,
                                    size: 14, // 7pt
                                }),
                            ],
                            alignment: AlignmentType.CENTER,
                        }),
                    ],
                })
            );
        });

        gridRows.push(new TableRow({ children: rowCells }));
    }

    const seatingGridTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: gridRows,
    });


    // 5. Build Document
    const doc = new Document({
        sections: [
            {
                properties: {
                    page: {
                        size: {
                            orientation: PageOrientation.LANDSCAPE,
                            width: 16838, // A4 Landscape width (approx 297mm)
                            height: 11906, // A4 Landscape height (approx 210mm)
                        },
                        margin: {
                            top: 720, // 0.5 inch
                            right: 720,
                            bottom: 720,
                            left: 720,
                        },
                    },
                },
                children: [
                    ...headerParagraphs,
                    infoTable,
                    new Paragraph({ text: "" }), // Spacer
                    summaryTable,
                    new Paragraph({
                        text: "BLACK BOARD",
                        bold: true,
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 200, after: 200 }
                    }),
                    seatingGridTable,

                    new Paragraph({
                        text: "* It should be filled carefully by Invigilators. Encircle the Absentees.",
                        italics: true,
                        spacing: { before: 300 },
                    }),

                    new Paragraph({
                        text: "Name & Signature of the Hall Superintendent",
                        alignment: AlignmentType.RIGHT,
                        spacing: { before: 800 },
                    }),
                ],
            },
        ],
    });

    // 6. Generate Blob
    try {
        const blob = await Packer.toBlob(doc);

        if (!blob || blob.size < 300) {
            throw new Error("Generated document is too small or invalid");
        }

        const currentDate = new Date().toLocaleDateString("en-IN").replace(/\//g, "-");
        const filename = `${hall.name}-seating-arrangement-${currentDate}.docx`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Error generating Word document:", error);
        throw new Error(`Failed to generate Word document: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
};
