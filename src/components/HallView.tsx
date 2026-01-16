import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db, Hall, Department, SeatAssignment } from "@/lib/db";
import { toast } from "@/components/ui/use-toast";
import { useExam } from "@/context/ExamContext";
import exportTableAsDoc from "@/lib/exportWord";
import { exportBenchLayoutWordDoc, HeaderSettings } from "@/lib/exportBenchLayoutWord";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileDown } from "lucide-react";

interface HallViewProps {
  hallId: string;   // ✅ MongoDB ObjectId (Strict String)
  readOnly?: boolean;
}

interface StudentSeat {
  row: number;
  column: number;
  benchPosition: number;
  rollNumber: string;
  departmentId?: string | number;
  departmentName?: string;
}

const HallView = ({ hallId, readOnly = false }: HallViewProps) => {
  const [hall, setHall] = useState<Hall | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [seats, setSeats] = useState<StudentSeat[][]>([]);
  const [seatAssignments, setSeatAssignments] = useState<SeatAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<HeaderSettings>({
    institutionName: "",
    institutionSubtitle: "",
    institutionAffiliation: "",
    examCellName: "",
    academicYear: "",
    examName: ""
  });
  const {
    examDate,
    examTime,
    examSession,
    setExamDate,
    setExamTime,
    setExamSession,
  } = useExam();

  const buildGrid = (assignments: SeatAssignment[]): StudentSeat[][] => {
    if (!hall) return [];

    const grid: StudentSeat[][] = Array.from({ length: hall.rows }, () =>
      Array.from(
        { length: hall.columns * hall.seatsPerBench },
        () => ({
          row: 0,
          column: 0,
          benchPosition: 0,
          rollNumber: "",
        })
      )
    );

    assignments.forEach((a) => {
      const r = a.row - 1;
      const c =
        (a.column - 1) * hall.seatsPerBench + (a.benchPosition - 1);

      if (grid[r] && grid[r][c]) {
        // Find department name for display
        const match = departments.find(d => String(d._id || d.id) === String(a.departmentId));
        const finalDeptId = match ? (match._id || match.id) : a.departmentId;

        grid[r][c] = {
          row: a.row,
          column: a.column,
          benchPosition: a.benchPosition,
          rollNumber: a.studentRollNumber,
          departmentId: finalDeptId,
          departmentName: match?.name,
        };
      }
    });

    return grid;
  };


  useEffect(() => {
    const fetchHallDetails = async () => {
      try {
        if (!hallId) return;

        // ✅ CHANGED: Fetch directly from Backend API
        const res = await fetch(`http://localhost:5000/api/halls/${hallId}`);
        if (!res.ok) {
          if (res.status === 404) {
            setHall(null);
            return;
          }
          throw new Error("Failed to load hall");
        }

        const hallData = await res.json();
        setHall(hallData);

        // Load exam metadata from hall if available
        if (hallData.examDate) setExamDate(hallData.examDate);
        if (hallData.examSession) setExamSession(hallData.examSession);
        if (hallData.examTime) setExamTime(hallData.examTime);

        const departmentsData = await db.getAllDepartments();
        setDepartments(departmentsData);

        // Fetch settings
        const settingsRes = await fetch('http://localhost:5000/api/settings');
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          setSettings(settingsData);
        }
      } catch (error) {
        console.error("Error fetching hall details:", error);
        setHall(null);
      } finally {
        setLoading(false);
      }
    };

    fetchHallDetails();
  }, [hallId]);




  useEffect(() => {
    if (!hallId || !hall) return;

    // Load seating assignments from MongoDB
    fetch(`http://localhost:5000/api/seating/hall/${hallId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data) return;

        const assignments = data.assignments || [];
        setSeatAssignments(assignments);

        // Load exam metadata from hall if available
        if (data.examDate) setExamDate(data.examDate);
        if (data.examSession) setExamSession(data.examSession);
        if (data.examTime) setExamTime(data.examTime);

        // Build grid with department names
        setSeats(buildGrid(assignments));
      })
      .catch((err) => {
        console.error("Failed to load saved seating:", err);
      });
  }, [hallId, hall]);





  //const generateSeatingPlan = async () => {
  //if (!hall) {
  //toast({
  //title: "Cannot Generate Seating Plan",
  //        description: "Hall information not found.",
  //        variant: "destructive",
  //      });
  //    return;
  //   }

  //  if (departments.length === 0) {
  //  toast({
  //  title: "No Department Added",
  //description: "No department added yet. Please add at least one department to generate seating plans.",
  //    variant: "destructive",
  //    });
  //  return;
  //  }

  //try {
  //const result = await db.generateHallSeatingPlan(hall.id, skipRollNumbers, manualRollNumbers);

  //      if (result.success) {
  // Reload the seating assignments
  //      const existingAssignments = await db.getHallSeatAssignments(hall.id);
  //    const departmentsData = await db.getAllDepartments();

  //    const newSeats = Array(hall.rows).fill(null).map(() =>
  //    Array(hall.columns * hall.seatsPerBench).fill(null).map(() => ({
  //      row: 0,
  //    column: 0,
  //  benchPosition: 0,
  //rollNumber: "",
  //     departmentId: undefined,
  //   departmentName: undefined
  // }))
  // );

  //       existingAssignments.forEach(assignment => {
  //  const deptInfo = departmentsData.find(d => d.id === assignment.departmentId);
  //    const rowIndex = assignment.row - 1;
  //      const colIndex = (assignment.column - 1) * hall.seatsPerBench + (assignment.benchPosition - 1);

  //        if (rowIndex >= 0 && rowIndex < newSeats.length && colIndex >= 0 && colIndex < newSeats[0].length) {
  //  newSeats[rowIndex][colIndex] = {
  //      row: assignment.row,
  //        column: assignment.column,
  //          benchPosition: assignment.benchPosition,
  //            rollNumber: assignment.studentRollNumber,
  //departmentId: assignment.departmentId,
  //  departmentName: deptInfo?.name
  //  };
  //  }
  //  });

  //    setSeats(newSeats);

  // Show warnings and unallocated students
  //      if (result.warnings.length > 0) {
  // result.warnings.forEach((warning, index) => {
  // Check if this is the missing numbers warning
  //     const isMissingNumbersWarning = warning.toLowerCase().includes('missing') || warning.toLowerCase().includes('seat numbers');

  //       toast({
  //  title: isMissingNumbersWarning ? "Missing Roll Numbers" : "Warning",
  //    description: warning,
  //      variant: isMissingNumbersWarning ? "default" : "destructive",
  //        duration: 5000,
  //          });
  //      });
  // }

  //if (result.unallocated.length > 0) {
  //    setUnallocatedRollNumbers(result.unallocated);
  //      setShowUnallocatedDialog(true);
  //      } else {
  //toast({
  //    title: "Success",
  //      d
  //        escription: "Seating plan generated successfully with department alternation.",
  // duration: 3000,
  // });
  // }
  // } else {
  //       toast({
  //       title: "Error",
  //          description: "Failed to generate seating plan.",
  //        variant: "destructive",
  //    });
  //  }
  //  } catch (error) {
  // console.error("Error generating seating plan:", error);
  //toast({
  // title: "Error",
  //  description: "An error occurred while generating the seating plan.",
  //variant: "destructive",
  //});
  //}
  //};




  /* ---------------------------------------------------------------------------
     * EXPORT HANDLERS
     * --------------------------------------------------------------------------- */

  const getExportMetadata = () => {
    const contextDateIsDefault = examDate === new Date().toISOString().split("T")[0];

    let finalDate = hall?.examDate || "";
    let finalSession = hall?.examSession || "";
    let finalTime = hall?.examTime || "";

    // If context has a non-default date (user selected), use it.
    if (examDate && !contextDateIsDefault) finalDate = examDate;
    if (examSession && examSession !== "FN") finalSession = examSession;
    if (examTime && examTime !== "09:30 AM") finalTime = examTime;

    return {
      date: finalDate,
      session: finalSession,
      time: finalTime
    };
  };

  const exportConsolidatedWord = async () => {
    if (!hall) return;

    // Guard: Check if seating data exists
    if (!seatAssignments || seatAssignments.length === 0) {
      toast({
        title: "No Data",
        description: "No seating data available. Please generate seating plans first.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Group seats by department
      const deptGroups: { [deptId: string]: string[] } = {};

      for (let r = 0; r < hall.rows; r++) {
        for (let c = 0; c < hall.columns; c++) {
          for (let s = 0; s < hall.seatsPerBench; s++) {
            const seatIndex = c * hall.seatsPerBench + s;
            const seat = seats[r]?.[seatIndex];

            if (seat?.rollNumber && seat.departmentId !== undefined) {
              if (!deptGroups[seat.departmentId]) {
                deptGroups[seat.departmentId] = [];
              }
              deptGroups[seat.departmentId].push(seat.rollNumber);
            }
          }
        }
      }

      const tableData: (string | number)[][] = [];
      const meta = getExportMetadata();

      Object.keys(deptGroups).forEach((deptIdStr) => {
        const dept = departments.find(d => String(d._id || d.id) === deptIdStr);

        const rollNumbers = deptGroups[deptIdStr].sort((a, b) => {
          const numA = parseInt(a.replace(/\D/g, ''));
          const numB = parseInt(b.replace(/\D/g, ''));
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return a.localeCompare(b);
        });

        if (rollNumbers.length > 0) {
          const fromRoll = rollNumbers[0];
          const toRoll = rollNumbers[rollNumbers.length - 1];
          const count = rollNumbers.length;

          let floor = hall.floor;
          if (!floor) {
            const nameLower = hall.name.toLowerCase();
            if (nameLower.includes("second") || nameLower.includes("2nd")) floor = "SECOND FLOOR";
            else if (nameLower.includes("third") || nameLower.includes("3rd")) floor = "THIRD FLOOR";
            else if (nameLower.includes("first") || nameLower.includes("1st")) floor = "FIRST FLOOR";
            else floor = "GROUND FLOOR";
          } else if (floor) {
            floor = floor.toUpperCase();
          }

          tableData.push([
            dept?.name || "Unknown",
            String(fromRoll),
            String(toRoll),
            String(count),
            hall.name,
            floor || "GROUND FLOOR",
            `${meta.date || "N/A"} | ${meta.session || "N/A"} | ${meta.time || "N/A"}`,
          ]);
        }
      });

      if (tableData.length === 0) {
        toast({
          title: "No Data",
          description: "No seating data available to export.",
          variant: "destructive",
        });
        return;
      }

      try {
        const titleText = [
          settings.institutionName || "SRM MADURAI",
          settings.examCellName || "EXAMINATION CELL",
          settings.academicYear || "ACADEMIC YEAR 2025-2026",
          settings.examName || "INTERNAL TEST",
          "CONSOLIDATED HALL PLAN"
        ].filter(Boolean).join('\n');

        await exportTableAsDoc({
          filename: `${hall.name}-consolidated-plan.docx`,
          title: titleText,
          generatedOn: `Date / Session : ${meta.date || "_______"} | ${meta.session || "___"} | ${meta.time || "___"}`,
          headers: [
            "Dept.",
            "Reg. No. From",
            "Reg. No. To",
            "No. of Candidates",
            "Hall No",
            "Floor",
            "Exam Info",
          ],
          rows: tableData as (string | number)[][], // Explicit cast to match expected type
          footerText: "Examcell Coordinator\t\t\t\t\t\tChief Superintendent",
          landscape: true
        });

        toast({
          title: "Word Exported",
          description: "Consolidated hall plan exported successfully.",
        });
      } catch (exportError) {
        console.error("Word export error:", exportError);
        throw exportError;
      }
    } catch (error) {
      console.error("Error exporting to Word:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to export seating plan to Word.",
        variant: "destructive",
      });
    }
  };


  const exportBenchLayout = () => {
    if (!hall) return;

    try {
      // Use A4 landscape
      const doc = new jsPDF('landscape', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth(); // Should be ~297mm
      const centerX = pageWidth / 2;

      const currentDate = new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      const currentDateTime = new Date().toLocaleString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      // Header
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(settings.institutionName || "SRM MADURAI", centerX, 15, { align: "center" });

      doc.setFontSize(14);
      doc.text(settings.institutionSubtitle || "COLLEGE FOR ENGINEERING AND TECHNOLOGY", centerX, 22, { align: "center" });

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(settings.institutionAffiliation || "Approved by AICTE, New Delhi | Affiliated to Anna University, Chennai", centerX, 28, { align: "center" });

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(settings.examCellName || "EXAMINATION CELL", centerX, 38, { align: "center" });

      doc.setFontSize(11);
      doc.text(settings.academicYear || "ACADEMIC YEAR 2025-2026 (ODD SEMESTER)", centerX, 45, { align: "center" });
      doc.text(settings.examName || "INTERNAL ASSESSMENT TEST – II (Except I Year)", centerX, 51, { align: "center" });
      doc.text("SEATING ARRANGEMENT", centerX, 57, { align: "center" });

      // Hall number and date
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Hall No: ${hall.name}`, 14, 68);
      doc.text(`Date: ${examDate} (${examSession}) ${examTime}`, pageWidth - 14, 68, { align: "right" });

      // Group seats by department for summary table
      const deptGroups: { [deptId: string]: string[] } = {};

      for (let r = 0; r < hall.rows; r++) {
        for (let c = 0; c < hall.columns; c++) {
          for (let s = 0; s < hall.seatsPerBench; s++) {
            const seatIndex = c * hall.seatsPerBench + s;
            const seat = seats[r]?.[seatIndex];

            if (seat?.rollNumber && seat.departmentId !== undefined) {
              if (!deptGroups[seat.departmentId]) {
                deptGroups[seat.departmentId] = [];
              }
              deptGroups[seat.departmentId].push(seat.rollNumber);
            }
          }
        }
      }

      // Create department summary table
      const summaryData: any[] = [];
      let totalCount = 0;

      Object.keys(deptGroups).forEach((deptIdStr) => {
        const dept = departments.find(d => String(d._id || d.id) === deptIdStr);
        const rollNumbers = deptGroups[deptIdStr].sort((a, b) => parseInt(a) - parseInt(b));

        if (rollNumbers.length > 0) {
          const fromRoll = rollNumbers[0];
          const toRoll = rollNumbers[rollNumbers.length - 1];
          const count = rollNumbers.length;
          totalCount += count;

          summaryData.push([
            dept?.name || (deptId === 0 ? "Manual Entry" : "Unknown"),
            fromRoll,
            toRoll,
            count.toString(),
            "", // Present column - empty
            "", // Absent column - empty
            ""  // Absentees Reg No - empty
          ]);
        }
      });

      // Add total row
      if (summaryData.length > 0) {
        summaryData.push([
          "",
          "",
          "TOTAL",
          totalCount.toString(),
          "",
          "",
          ""
        ]);
      }

      // Draw summary table
      autoTable(doc, {
        head: [["Department", "From", "To", "Count", "Present", "Absent", "Absentees Reg No*"]],
        body: summaryData,
        startY: 75,
        theme: "grid",
        headStyles: {
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0],
          fontStyle: "bold",
          lineWidth: 0.5,
          lineColor: [0, 0, 0],
          halign: 'center'
        },
        bodyStyles: {
          lineWidth: 0.5,
          lineColor: [0, 0, 0],
          halign: 'center'
        },
        columnStyles: {
          0: { cellWidth: 50 },
          1: { cellWidth: 50 },
          2: { cellWidth: 50 },
          3: { cellWidth: 30 },
          4: { cellWidth: 30 },
          5: { cellWidth: 30 },
          6: { cellWidth: 80 }
        },
        styles: {
          fontSize: 9,
          cellPadding: 3
        }
      });

      const summaryEndY = (doc as any).lastAutoTable.finalY + 10;

      // BLACK BOARD label
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("BLACK BOARD", centerX, summaryEndY, { align: "center" });

      // Collect all roll numbers in column-by-column order (matching seating arrangement)
      const seatGrid: string[][] = Array(hall.rows).fill(null).map(() => Array(hall.columns * hall.seatsPerBench).fill(""));

      for (let r = 0; r < hall.rows; r++) {
        for (let c = 0; c < hall.columns * hall.seatsPerBench; c++) {
          const seat = seats[r]?.[c];
          if (seat?.rollNumber) {
            seatGrid[r][c] = seat.rollNumber;
          }
        }
      }

      // Find which columns have at least one student
      const totalColumns = hall.columns * hall.seatsPerBench;
      const nonEmptyColumns: number[] = [];

      for (let c = 0; c < totalColumns; c++) {
        let hasStudent = false;
        for (let r = 0; r < hall.rows; r++) {
          if (seatGrid[r][c]) {
            hasStudent = true;
            break;
          }
        }
        if (hasStudent) {
          nonEmptyColumns.push(c);
        }
      }

      // Calculate seating grid dimensions based on non-empty columns
      const gridStartY = summaryEndY + 8;
      const gridStartX = 14;
      const cellWidth = Math.min(28, (400 - gridStartX) / nonEmptyColumns.length);
      const cellHeight = 12;

      // Column labels (A, B, C, ...) - only for non-empty columns
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");

      nonEmptyColumns.forEach((actualCol, displayIndex) => {
        const columnLabel = String.fromCharCode(65 + actualCol); // A, B, C, ...
        const x = gridStartX + 12 + displayIndex * cellWidth;
        doc.text(columnLabel, x + cellWidth / 2, gridStartY - 2, { align: 'center' });
      });

      // Draw seating grid - only for non-empty columns
      for (let r = 0; r < hall.rows; r++) {
        const y = gridStartY + r * cellHeight;

        // Row number
        doc.setFont("helvetica", "bold");
        doc.text((r + 1).toString(), gridStartX + 5, y + cellHeight / 2 + 2, { align: 'center' });

        nonEmptyColumns.forEach((actualCol, displayIndex) => {
          const x = gridStartX + 12 + displayIndex * cellWidth;
          const rollNumber = seatGrid[r][actualCol];

          // Draw cell border
          doc.rect(x, y, cellWidth, cellHeight);

          // Draw roll number if exists
          if (rollNumber) {
            // Alternate between bold and italic for each column
            const isBoldColumn = actualCol % 2 === 0;
            doc.setFont("helvetica", isBoldColumn ? "bold" : "italic");
            doc.setFontSize(7);
            doc.text(rollNumber, x + cellWidth / 2, y + cellHeight / 2 + 2, {
              align: 'center',
              maxWidth: cellWidth - 2
            });
          }
        });
      }

      // Footer note
      const footerY = gridStartY + hall.rows * cellHeight + 8;
      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      doc.text("* It should be filled carefully by Invigilators. Encircle the Absentees.", 14, footerY);

      // Signature line
      doc.setFont("helvetica", "normal");
      doc.text("Name & Signature of the Hall Superintendent", pageWidth - 14, footerY + 15, { align: "right" });

      doc.save(`${hall.name}-seating-arrangement-${currentDate.replace(/\//g, '-')}.pdf`);

      toast({
        title: "Seating Arrangement Exported",
        description: "Detailed seating arrangement has been exported successfully."
      });
    } catch (error) {
      console.error("Error exporting bench layout:", error);
      toast({
        title: "Error",
        description: "Failed to export bench layout.",
        variant: "destructive",
      });
    }
  };

  /* 🔼🔼🔼 END WORD EXPORT 🔼🔼🔼 */

  const exportBenchLayoutWord = async () => {
    if (!hall) return;

    try {
      if (seatAssignments.length === 0) {
        toast({
          title: "No Data",
          description: "No seating data available. Please generate seating plans first.",
          variant: "destructive",
        });
        return;
      }

      // Priority: Saved Plan Date > Hall Config Date
      const meta = getExportMetadata();

      try {
        await exportBenchLayoutWordDoc({
          hall,
          seats,
          departments,
          examDate: meta.date,
          examSession: meta.session,
          examTime: meta.time,
          headerSettings: settings
        });

        toast({
          title: "Word Exported",
          description: "Bench layout exported successfully as Word document.",
        });
      } catch (exportError) {
        console.error("Bench layout Word export error:", exportError);
        throw exportError;
      }
    } catch (error) {
      console.error("Error exporting bench layout to Word:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to export bench layout to Word.",
        variant: "destructive",
      });
    }
  };



  const saveSeatingPlan = async () => {
    if (!hall) return;

    try {
      const assignments = [];

      for (let r = 0; r < hall.rows; r++) {
        for (let c = 0; c < hall.columns; c++) {
          for (let s = 0; s < hall.seatsPerBench; s++) {
            const idx = c * hall.seatsPerBench + s;
            const seat = seats[r]?.[idx];

            if (seat?.rollNumber) {
              // Ensure departmentId is properly formatted (string for MongoDB)
              const deptId = typeof seat.departmentId === 'string'
                ? seat.departmentId
                : (seat.departmentId ? String(seat.departmentId) : undefined);

              assignments.push({
                row: r + 1,
                column: c + 1,
                benchPosition: s + 1,
                studentRollNumber: seat.rollNumber,
                departmentId: deptId,
              });
            }
          }
        }
      }

      // SEND TO MONGODB BACKEND
      const res = await fetch("http://localhost:5000/api/seating/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hallId: hall._id, // ✅ FIX: hall._id
          examDate,
          examSession,
          examTime,
          assignments,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Failed to save seating plan" }));
        if (errorData.duplicates) {
          toast({
            title: "Duplicate Roll Numbers",
            description: `Duplicate roll numbers detected: ${errorData.duplicates.join(", ")}`,
            variant: "destructive",
          });
        } else {
          throw new Error(errorData.error || "Failed to save seating plan");
        }
        return;
      }

      toast({
        title: "Saved",
        description: "Seating plan saved permanently",
      });
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to save seating plan",
        variant: "destructive",
      });
    }
  };


  if (loading) {
    return <div className="p-8 text-center">Loading hall details...</div>;
  }

  if (!hall) {
    return <div className="p-8 text-center">Hall not found.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Exam Info Banner */}
      <div className="mb-4 rounded-lg border bg-blue-50 p-3 text-sm">
        <div className="flex justify-between items-center">
          <div>
            <strong>Exam:</strong>{" "}
            {examDate || "Not set"} &nbsp;|&nbsp; {examSession || "Not set"} &nbsp;|&nbsp; {examTime || "Not set"}
          </div>
          {hall.facultyAssigned && hall.facultyAssigned.length > 0 && (
            <div>
              <strong>Assigned Faculty:</strong> {hall.facultyAssigned.length} faculty member(s)
            </div>
          )}
        </div>
      </div>
      {!readOnly && (
        <div className="flex gap-2 mb-6 justify-end">
          <Button variant="outline" onClick={exportConsolidatedWord}>
            <FileDown className="mr-2 h-4 w-4" />
            Export Consolidated Plan (Word)
          </Button>
          <Button variant="outline" onClick={exportBenchLayoutWord}>
            <FileDown className="mr-2 h-4 w-4" />
            Export Bench Layout (Word)
          </Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <h3 className="font-semibold mb-4">{hall.name} - Seating Plan</h3>
        <div className="border rounded-lg p-4 bg-white">
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${hall.columns}, minmax(100px, 1fr))` }}>
            {Array.from({ length: hall.columns }).map((_, colIndex) => (
              <div key={colIndex} className="text-center font-semibold">
                Column {colIndex + 1}
              </div>
            ))}

            {Array.from({ length: hall.rows }).map((_, rowIndex) => (
              <React.Fragment key={rowIndex}>
                {Array.from({ length: hall.columns }).map((_, colIndex) => {
                  const benchStart = colIndex * hall.seatsPerBench;

                  return (
                    <div
                      key={`${rowIndex}-${colIndex}`}
                      className="border rounded-lg p-2 bg-gray-50"
                    >
                      {Array.from({ length: hall.seatsPerBench }).map((_, seatIndex) => {
                        const seatIndexInRow = benchStart + seatIndex;
                        const seat = seats[rowIndex] && seats[rowIndex][seatIndexInRow];

                        return (
                          <div
                            key={`${rowIndex}-${colIndex}-${seatIndex}`}
                            className={`mb-2 p-2 rounded-md ${seat?.departmentId !== undefined
                              ? 'bg-white border'
                              : 'bg-gray-100'}`}
                          >
                            <div className="text-xs">Seat {seatIndex + 1}</div>
                            {seat?.rollNumber ? (
                              <>
                                <div className="font-semibold">{seat.rollNumber}</div>
                                <div className="text-xs text-gray-500">{seat.departmentName}</div>
                              </>
                            ) : (
                              <div className="text-gray-400 italic">Empty</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                <div key={`row-label-${rowIndex}`} className="col-span-full border-t border-gray-200 mt-2 mb-4" />
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {!readOnly && (
        <div className="flex justify-end mt-4">
          <Button onClick={saveSeatingPlan}>
            Save Seating Plan
          </Button>
        </div>
      )}

    </div>
  );
};

export default HallView;
