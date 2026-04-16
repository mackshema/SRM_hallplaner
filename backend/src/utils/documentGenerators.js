import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, AlignmentType, WidthType, PageOrientation, BorderStyle, ImageRun } from "docx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// 1. generateBenchLayoutDocx
export const generateBenchLayoutDocx = async ({
    hall,
    seatAssignments,
    departments,
    examDate,
    examSession,
    examTime,
    headerSettings,
}) => {
    // 1. Prepare Header Paragraphs
    const headerElements = [];
    if (headerSettings.leftLogo || headerSettings.rightLogo) {
        headerElements.push(new Table({
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
                                headerSettings.leftLogo ? (() => {
                                    const type = headerSettings.leftLogo.substring(headerSettings.leftLogo.indexOf('/') + 1, headerSettings.leftLogo.indexOf(';'));
                                    return new Paragraph({
                                        children: [new ImageRun({
                                            data: Buffer.from(headerSettings.leftLogo.split(",")[1], "base64"),
                                            transformation: { width: 80, height: 80 },
                                            type: type === 'jpeg' ? 'jpg' : type
                                        })],
                                        alignment: AlignmentType.LEFT
                                    });
                                })() : new Paragraph("")
                            ]
                        }),
                        new TableCell({
                            width: { size: 70, type: WidthType.PERCENTAGE },
                            children: [
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
                                            text: headerSettings.institutionAffiliation || "Approved by AICTE | Affiliated to Anna University",
                                            size: 20, // 10pt
                                        }),
                                    ],
                                })
                            ]
                        }),
                        new TableCell({
                            width: { size: 15, type: WidthType.PERCENTAGE },
                            children: [
                                headerSettings.rightLogo ? (() => {
                                    const type = headerSettings.rightLogo.substring(headerSettings.rightLogo.indexOf('/') + 1, headerSettings.rightLogo.indexOf(';'));
                                    return new Paragraph({
                                        children: [new ImageRun({
                                            data: Buffer.from(headerSettings.rightLogo.split(",")[1], "base64"),
                                            transformation: { width: 80, height: 80 },
                                            type: type === 'jpeg' ? 'jpg' : type
                                        })],
                                        alignment: AlignmentType.RIGHT
                                    });
                                })() : new Paragraph("")
                            ]
                        })
                    ]
                })
            ]
        }));
    } else {
        headerElements.push(
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
                        text: headerSettings.institutionAffiliation || "Approved by AICTE | Affiliated to Anna University",
                        size: 20, // 10pt
                    }),
                ],
            })
        );
    }
    
    headerElements.push(
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
                    text: headerSettings.academicYear || "ACADEMIC YEAR 2025-2026",
                    size: 22, // 11pt
                }),
            ],
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({
                    text: headerSettings.examName || "INTERNAL ASSESSMENT TEST",
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
        })
    );

    // 2. Hall Info & Date Row
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
    const deptGroups = {};
    seatAssignments.forEach(seat => {
        if (seat.studentRollNumber && seat.departmentId !== undefined) {
            const deptKey = String(seat.departmentId);
            if (!deptGroups[deptKey]) deptGroups[deptKey] = [];
            if (!deptGroups[deptKey].includes(seat.studentRollNumber)) {
                deptGroups[deptKey].push(seat.studentRollNumber);
            }
        }
    });

    const summaryRows = [];
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
        const dept = departments.find((d) => String(d._id) === deptIdStr || String(d.id) === deptIdStr);
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
                        dept?.name || "Unknown",
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
    let maxRow = hall.rows || 1;
    let maxCol = (hall.columns || 1) * (hall.seatsPerBench || 1);

    if (seatAssignments && seatAssignments.length > 0) {
        seatAssignments.forEach(a => {
            if (a.row > maxRow) maxRow = a.row;
            const gridCol = (a.column - 1) * hall.seatsPerBench + (a.benchPosition - 1);
            if (gridCol >= maxCol) maxCol = gridCol + 1;
        });
    }

    const seatGrid = Array(maxRow)
        .fill(null)
        .map(() => Array(maxCol).fill(""));

    seatAssignments.forEach(a => {
        const r = a.row - 1;
        const c = (a.column - 1) * hall.seatsPerBench + (a.benchPosition - 1);
        if (r >= 0 && c >= 0 && a.studentRollNumber) {
            if (!seatGrid[r]) seatGrid[r] = Array(maxCol).fill("");
            seatGrid[r][c] = a.studentRollNumber;
        }
    });

    const nonEmptyColumns = [];
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

    const gridRows = [];

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
        const rowCells = [];
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

    const doc = new Document({
        sections: [
            {
                properties: {
                    page: {
                        size: { orientation: PageOrientation.LANDSCAPE },
                        margin: { top: 720, right: 720, bottom: 720, left: 720 },
                    },
                },
                children: [
                    ...headerElements,
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

    return await Packer.toBuffer(doc);
};

export const generateAllBenchLayoutsDocx = async ({
    halls,
    seatAssignments,
    departments,
    examDate,
    examSession,
    examTime,
    headerSettings,
}) => {
    const sections = [];

    // Combine all logic per hall
    for (const hall of halls) {
        const hallAssignments = seatAssignments.filter(a => a.hallId.toString() === hall._id.toString());
        if(hallAssignments.length === 0) continue;

        const headerElements = [];
        if (headerSettings.leftLogo || headerSettings.rightLogo) {
            headerElements.push(new Table({
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
                                    headerSettings.leftLogo ? (() => {
                                        const type = headerSettings.leftLogo.substring(headerSettings.leftLogo.indexOf('/') + 1, headerSettings.leftLogo.indexOf(';'));
                                        return new Paragraph({
                                            children: [new ImageRun({
                                                data: Buffer.from(headerSettings.leftLogo.split(",")[1], "base64"),
                                                transformation: { width: 80, height: 80 },
                                                type: type === 'jpeg' ? 'jpg' : type
                                            })],
                                            alignment: AlignmentType.LEFT
                                        });
                                    })() : new Paragraph("")
                                ]
                            }),
                            new TableCell({
                                width: { size: 70, type: WidthType.PERCENTAGE },
                                children: [
                                    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: headerSettings.institutionName || "SRM MADURAI", bold: true, size: 36 })] }),
                                    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: headerSettings.institutionSubtitle || "COLLEGE FOR ENGINEERING AND TECHNOLOGY", size: 28 })] }),
                                    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: headerSettings.institutionAffiliation || "Approved by AICTE | Affiliated to Anna University", size: 20 })] })
                                ]
                            }),
                            new TableCell({
                                width: { size: 15, type: WidthType.PERCENTAGE },
                                children: [
                                    headerSettings.rightLogo ? (() => {
                                        const type = headerSettings.rightLogo.substring(headerSettings.rightLogo.indexOf('/') + 1, headerSettings.rightLogo.indexOf(';'));
                                        return new Paragraph({
                                            children: [new ImageRun({
                                                data: Buffer.from(headerSettings.rightLogo.split(",")[1], "base64"),
                                                transformation: { width: 80, height: 80 },
                                                type: type === 'jpeg' ? 'jpg' : type
                                            })],
                                            alignment: AlignmentType.RIGHT
                                        });
                                    })() : new Paragraph("")
                                ]
                            })
                        ]
                    })
                ]
            }));
        } else {
            headerElements.push(
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: headerSettings.institutionName || "SRM MADURAI", bold: true, size: 36 })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: headerSettings.institutionSubtitle || "COLLEGE FOR ENGINEERING AND TECHNOLOGY", size: 28 })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: headerSettings.institutionAffiliation || "Approved by AICTE | Affiliated to Anna University", size: 20 })] })
            );
        }

        headerElements.push(
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: headerSettings.examCellName || "EXAMINATION CELL", bold: true, size: 28 })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: headerSettings.academicYear || "ACADEMIC YEAR 2025-2026", size: 22 })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: headerSettings.examName || "INTERNAL ASSESSMENT TEST", size: 22 })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 300 }, children: [new TextRun({ text: "SEATING ARRANGEMENT", size: 22 })] })
        );

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
                        new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: `Hall No: ${hall.name}`, size: 20 })] })] }),
                        new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `Date: ${examDate} (${examSession}) ${examTime}`, size: 20 })] })] }),
                    ],
                }),
            ],
        });

        const deptGroups = {};
        hallAssignments.forEach(seat => {
            if (seat.studentRollNumber && seat.departmentId !== undefined) {
                const deptKey = String(seat.departmentId);
                if (!deptGroups[deptKey]) deptGroups[deptKey] = [];
                if (!deptGroups[deptKey].includes(seat.studentRollNumber)) {
                    deptGroups[deptKey].push(seat.studentRollNumber);
                }
            }
        });

        const summaryRows = [];
        let totalCount = 0;

        summaryRows.push(
            new TableRow({
                tableHeader: true,
                children: ["Department", "From", "To", "Count", "Present", "Absent", "Absentees Reg No*"].map(
                    (text) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 18 })], alignment: AlignmentType.CENTER })] })
                ),
            })
        );

        Object.keys(deptGroups).forEach((deptIdStr) => {
            const dept = departments.find((d) => String(d._id) === deptIdStr || String(d.id) === deptIdStr);
            const rollNumbers = (deptGroups[deptIdStr] || []).sort((a, b) => {
                const numA = parseInt(a.replace(/\D/g, ''));
                const numB = parseInt(b.replace(/\D/g, ''));
                if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                return a.localeCompare(b);
            });

            if (rollNumbers.length > 0) {
                const count = rollNumbers.length;
                totalCount += count;
                summaryRows.push(
                    new TableRow({
                        children: [dept?.name || "Unknown", rollNumbers[0], rollNumbers[rollNumbers.length - 1], count.toString(), "", "", ""].map(
                            (val) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: val, size: 18 })], alignment: AlignmentType.CENTER })] })
                        ),
                    })
                );
            }
        });

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

        const summaryTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: summaryRows });

        let maxRow = hall.rows || 1;
        let maxCol = (hall.columns || 1) * (hall.seatsPerBench || 1);

        if (hallAssignments.length > 0) {
            hallAssignments.forEach(a => {
                if (a.row > maxRow) maxRow = a.row;
                const gridCol = (a.column - 1) * hall.seatsPerBench + (a.benchPosition - 1);
                if (gridCol >= maxCol) maxCol = gridCol + 1;
            });
        }

        const seatGrid = Array(maxRow).fill(null).map(() => Array(maxCol).fill(""));
        hallAssignments.forEach(a => {
            const r = a.row - 1;
            const c = (a.column - 1) * hall.seatsPerBench + (a.benchPosition - 1);
            if (r >= 0 && c >= 0 && a.studentRollNumber) {
                if (!seatGrid[r]) seatGrid[r] = Array(maxCol).fill("");
                seatGrid[r][c] = a.studentRollNumber;
            }
        });

        const nonEmptyColumns = [];
        for (let c = 0; c < maxCol; c++) {
            let hasStudent = false;
            for (let r = 0; r < maxRow; r++) {
                if (seatGrid[r] && seatGrid[r][c]) {
                    hasStudent = true;
                    break;
                }
            }
            if (hasStudent) nonEmptyColumns.push(c);
        }

        const gridRows = [];
        gridRows.push(
            new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph("")] }),
                    ...nonEmptyColumns.map((actualCol) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String.fromCharCode(65 + actualCol), bold: true, size: 18 })], alignment: AlignmentType.CENTER })] })),
                ],
            })
        );

        for (let r = 0; r < maxRow; r++) {
            const rowCells = [];
            rowCells.push(new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: (r + 1).toString(), bold: true, size: 18 })], alignment: AlignmentType.CENTER })] }));
            nonEmptyColumns.forEach((actualCol) => {
                const rollNumber = seatGrid[r][actualCol] || "";
                rowCells.push(new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: rollNumber, bold: !!rollNumber && (actualCol % 2 === 0), italics: !!rollNumber && !(actualCol % 2 === 0), size: 14 })], alignment: AlignmentType.CENTER })] }));
            });
            gridRows.push(new TableRow({ children: rowCells }));
        }

        const seatingGridTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: gridRows });

        sections.push({
            properties: {
                page: {
                    size: { orientation: PageOrientation.LANDSCAPE },
                    margin: { top: 720, right: 720, bottom: 720, left: 720 },
                },
            },
            children: [
                ...headerElements,
                infoTable,
                new Paragraph({ text: "" }),
                summaryTable,
                new Paragraph({ text: "BLACK BOARD", bold: true, alignment: AlignmentType.CENTER, spacing: { before: 200, after: 200 } }),
                seatingGridTable,
                new Paragraph({ text: "* It should be filled carefully by Invigilators. Encircle the Absentees.", italics: true, spacing: { before: 300 } }),
                new Paragraph({ text: "Name & Signature of the Hall Superintendent", alignment: AlignmentType.RIGHT, spacing: { before: 800 } }),
            ],
        });
    }

    const compiledDoc = new Document({ sections });
    return await Packer.toBuffer(compiledDoc);
};


// 2. generateConsolidatedPdf
export const generateConsolidatedPdf = async ({ assignments, halls, departments, examDate, examSession, examTime, headerSettings }) => {
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const centerX = pageWidth / 2;

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(headerSettings.institutionName || "SRM MADURAI", centerX, 15, { align: "center" });

    if (headerSettings.leftLogo) {
        const format = headerSettings.leftLogo.substring(headerSettings.leftLogo.indexOf('/') + 1, headerSettings.leftLogo.indexOf(';')).toUpperCase();
        doc.addImage(headerSettings.leftLogo, format, 14, 8, 20, 20);
    }
    if (headerSettings.rightLogo) {
        const format = headerSettings.rightLogo.substring(headerSettings.rightLogo.indexOf('/') + 1, headerSettings.rightLogo.indexOf(';')).toUpperCase();
        doc.addImage(headerSettings.rightLogo, format, pageWidth - 34, 8, 20, 20);
    }

    doc.setFontSize(14);
    doc.text(headerSettings.institutionSubtitle || "COLLEGE FOR ENGINEERING AND TECHNOLOGY", centerX, 22, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(headerSettings.institutionAffiliation || "Approved by AICTE", centerX, 28, { align: "center" });

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(headerSettings.examCellName || "EXAMINATION CELL", centerX, 38, { align: "center" });

    doc.setFontSize(11);
    doc.text(headerSettings.academicYear || "ACADEMIC YEAR 2025-2026", centerX, 45, { align: "center" });
    doc.text("CONSOLIDATED HALL PLAN", centerX, 57, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Date / Session : ${examDate} (${examSession})`, 14, 68);
    if (examTime) doc.text(`Exam Time: ${examTime}`, centerX, 68, { align: "center" });

    const hallGroups = {};
    assignments.forEach((assignment) => {
        const hallId = String(assignment.hallId);
        const deptId = String(assignment.departmentId || '');
        if (!hallGroups[hallId]) hallGroups[hallId] = {};
        if (!hallGroups[hallId][deptId]) hallGroups[hallId][deptId] = [];
        hallGroups[hallId][deptId].push(assignment.studentRollNumber);
    });

    const tableData = [];
    Object.keys(hallGroups).forEach((hallId) => {
        const hall = halls.find(h => String(h._id) === hallId);
        const deptGroups = hallGroups[hallId];
        Object.keys(deptGroups).forEach((deptId) => {
            const dept = departments.find(d => String(d._id) === deptId || String(d.id) === deptId);
            const rollNumbers = deptGroups[deptId].sort((a, b) => {
                const numA = parseInt(a.replace(/\D/g, ''));
                const numB = parseInt(b.replace(/\D/g, ''));
                if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                return a.localeCompare(b);
            });

            if (rollNumbers.length > 0) {
                let floor = hall?.floor;
                if (!floor && hall) {
                    const nameLower = hall.name.toLowerCase();
                    if (nameLower.includes("second") || nameLower.includes("2nd")) floor = "SECOND FLOOR";
                    else if (nameLower.includes("third") || nameLower.includes("3rd")) floor = "THIRD FLOOR";
                    else if (nameLower.includes("first") || nameLower.includes("1st")) floor = "FIRST FLOOR";
                    else floor = "GROUND FLOOR";
                } else if (!floor) {
                    floor = "GROUND FLOOR";
                }

                tableData.push([
                    dept?.name || "Unknown",
                    rollNumbers[0],
                    rollNumbers[rollNumbers.length - 1],
                    rollNumbers.length.toString(),
                    hall?.name || hallId,
                    floor.toUpperCase()
                ]);
            }
        });
    });

    tableData.sort((a, b) => {
        if (a[4] !== b[4]) return a[4].localeCompare(b[4]);
        return a[0].localeCompare(b[0]);
    });

    autoTable(doc, {
        head: [["Dept.", "Reg. No. From", "Reg. No. To", "No. of Candidates", "Hall No", "Floor"]],
        body: tableData,
        startY: 75,
        theme: "grid",
        headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold", lineWidth: 0.5, lineColor: [0, 0, 0] },
        bodyStyles: { lineWidth: 0.5, lineColor: [0, 0, 0] },
        styles: { fontSize: 9, cellPadding: 3 }
    });

    const finalY = doc.lastAutoTable?.finalY || 75;
    doc.setFontSize(10);
    doc.text("Examcell Coordinator", 14, finalY + 15);
    doc.text("Chief Superintendent", pageWidth - 14, finalY + 15, { align: "right" });

    // Output as buffer
    return Buffer.from(doc.output('arraybuffer'));
};


// 3. generateFacultyDutyPdf
export const generateFacultyDutyPdf = async ({ duties, examDate, examSession, examTime, headerSettings }) => {
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const centerX = pageWidth / 2;

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(headerSettings.institutionName || "SRM MADURAI", centerX, 15, { align: "center" });

    if (headerSettings.leftLogo) {
        const format = headerSettings.leftLogo.substring(headerSettings.leftLogo.indexOf('/') + 1, headerSettings.leftLogo.indexOf(';')).toUpperCase();
        doc.addImage(headerSettings.leftLogo, format, 14, 8, 20, 20);
    }
    if (headerSettings.rightLogo) {
        const format = headerSettings.rightLogo.substring(headerSettings.rightLogo.indexOf('/') + 1, headerSettings.rightLogo.indexOf(';')).toUpperCase();
        doc.addImage(headerSettings.rightLogo, format, pageWidth - 34, 8, 20, 20);
    }

    doc.setFontSize(14);
    doc.text("FACULTY DUTY CHART", centerX, 30, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Date / Session : ${examDate} (${examSession})      Time: ${examTime}`, 14, 40);

    const tableData = duties.map(duty => [
        duty.facultyId?.name || "Unknown Faculty",
        duty.facultyId?.department || "Unknown Dept",
        duty.hallId?.name || "Unknown Hall",
        duty.hallId?.floor || ""
    ]);

    tableData.sort((a, b) => a[2].localeCompare(b[2])); // Sort by Hall

    autoTable(doc, {
        head: [["Faculty", "Department", "Hall Assigned", "Floor"]],
        body: tableData,
        startY: 45,
        theme: "grid",
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold", lineWidth: 0.5, lineColor: [0, 0, 0] },
        bodyStyles: { lineWidth: 0.5, lineColor: [0, 0, 0] }
    });

    return Buffer.from(doc.output('arraybuffer'));
};


// 4. generateSummaryReportPdf
export const generateSummaryReportPdf = async ({ assignments, departments, examDate, examSession, examTime, headerSettings }) => {
    const doc = new jsPDF('portrait', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const centerX = pageWidth / 2;

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(headerSettings.institutionName || "SRM MADURAI", centerX, 15, { align: "center" });

    if (headerSettings.leftLogo) {
        const format = headerSettings.leftLogo.substring(headerSettings.leftLogo.indexOf('/') + 1, headerSettings.leftLogo.indexOf(';')).toUpperCase();
        doc.addImage(headerSettings.leftLogo, format, 14, 8, 20, 20);
    }
    if (headerSettings.rightLogo) {
        const format = headerSettings.rightLogo.substring(headerSettings.rightLogo.indexOf('/') + 1, headerSettings.rightLogo.indexOf(';')).toUpperCase();
        doc.addImage(headerSettings.rightLogo, format, pageWidth - 34, 8, 20, 20);
    }

    doc.setFontSize(14);
    doc.text("EXAM SUMMARY REPORT", centerX, 30, { align: "center" });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Date / Session : ${examDate} (${examSession})      Time: ${examTime}`, 14, 40);

    const deptCounts = {};
    assignments.forEach(a => {
        const deptId = String(a.departmentId);
        if (!deptCounts[deptId]) deptCounts[deptId] = 0;
        deptCounts[deptId]++;
    });

    const tableData = [];
    let grandTotal = 0;

    Object.keys(deptCounts).forEach(deptId => {
        const dept = departments.find(d => String(d._id) === deptId || String(d.id) === deptId);
        const count = deptCounts[deptId];
        grandTotal += count;
        tableData.push([dept?.name || "Unknown", count.toString()]);
    });

    autoTable(doc, {
        head: [["Department", "Total Students Allocated"]],
        body: tableData,
        startY: 45,
        theme: "grid",
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: "bold", lineWidth: 0.5, lineColor: [0, 0, 0] },
        bodyStyles: { lineWidth: 0.5, lineColor: [0, 0, 0] },
        foot: [["GRAND TOTAL", grandTotal.toString()]],
        footStyles: { fillColor: [200, 200, 200], textColor: [0, 0, 0], fontStyle: "bold" }
    });

    return Buffer.from(doc.output('arraybuffer'));
};
