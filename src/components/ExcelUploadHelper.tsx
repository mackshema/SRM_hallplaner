import React from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Download, Info } from "lucide-react";

export interface ColumnSpec {
  header: string;
  example: string;
  required?: boolean;
  description?: string;
}

interface ExcelUploadHelperProps {
  columns?: ColumnSpec[];
  templateFilename: string;
  sampleRows?: Record<string, string>[];  // Extra sample rows beyond the single example
  note?: string;
  multiSectionMode?: boolean;
  templateMode?: 'default' | 'multiSection' | 'iatTimetable' | 'facultyList' | 'hallsList';
}

const ExcelUploadHelper: React.FC<ExcelUploadHelperProps> = ({
  columns = [],
  templateFilename,
  sampleRows,
  note,
  multiSectionMode = false,
  templateMode
}) => {
  const activeMode = templateMode || (multiSectionMode ? 'multiSection' : 'default');

  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();

    if (activeMode === 'multiSection') {
      const cseRows = [
        ["Regulation", "Year", "Branch"],
        [2025, "II", "104 - B.E. Computer Science and Engineering"],
        ["S.No.", "Register Number", "Student Name"],
        [1, "911125104001", "AANANDHA RUBAN M R K"],
        [2, "911125104002", "AATHISH RAO A B"]
      ];

      const eceRows = [
        ["Regulation", "Year", "Branch"],
        [2025, "II", "106 - B.E. Electronics and Communication Engineering"],
        ["S.No.", "Register Number", "Student Name"],
        [1, "911125106001", "AADHIL AHAMED A"],
        [2, "911125106002", "AADHIRA SANTHOSI V"]
      ];

      const wsCSE = XLSX.utils.aoa_to_sheet(cseRows);
      const wsECE = XLSX.utils.aoa_to_sheet(eceRows);

      XLSX.utils.book_append_sheet(wb, wsCSE, "CSE");
      XLSX.utils.book_append_sheet(wb, wsECE, "ECE");
    } else if (activeMode === 'iatTimetable') {
      const iatRows = [
        ["EXAMINATION CELL"],
        ["ACADEMIC YEAR 2026 – 2027 (ODD SEMESTER) INTERNAL ASSESSMENT TEST (IAT) - I"],
        ["Session: 09.00 AM – To: 11.00 AM (Forenoon)"],
        ["Date / Department", "Year", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-21", "2026-10-22"],
        ["Civil", "I", "MA25C01", "UC25H01", "PH25C01", "EN25C01", "CY25C01", "CE25C01"],
        ["CSE", "I", "MA25C01", "UC25H01", "PH25C01", "EN25C01", "CY25C01", "CS25C03"],
        ["EEE", "I", "MA25C01", "UC25H01", "PH25C01", "EN25C01", "CY25C01", "EE25C03"],
        ["ECE", "I", "MA25C01", "UC25H01", "PH25C01", "EN25C01", "CY25C01", "EE25C04"],
        ["Mech", "I", "MA25C01", "UC25H01", "PH25C01", "EN25C01", "CY25C01", "ME25C03"],
        ["AIML", "I", "MA25C01", "UC25H01", "PH25C01", "EN25C01", "CY25C01", "CS25C03"],
        ["IT", "I", "MA25C01", "UC25H01", "PH25C01", "EN25C01", "CY25C01", "CS25C03"],
        ["AI&DS", "I", "MA25C01", "UC25H01", "PH25C01", "EN25C01", "CY25C01", "CS25C03"]
      ];
      const wsIAT = XLSX.utils.aoa_to_sheet(iatRows);
      XLSX.utils.book_append_sheet(wb, wsIAT, "IAT-Schedule");
    } else if (activeMode === 'facultyList') {
      const facultyRows = [
        ["Sl. No", "Staff Reg No", "Faculty Name", "Department", "Designation", "Faculty Email ID", "HOD Email ID"],
        [1, "FAC001", "Dr. M. Ananda Kumar", "Chemistry", "Associate Professor", "anandakumar@srm.edu", "hod.chemistry@srm.edu"],
        [2, "FAC002", "R. Krishna", "CSE", "Assistant Professor", "krishna@srm.edu", "hod.cse@srm.edu"],
        [3, "FAC003", "Dr. P. Gandhimathi", "Physics", "Professor", "gandhimathi@srm.edu", "hod.physics@srm.edu"],
        [4, "FAC004", "K. Radha", "Maths", "HOD", "radha@srm.edu", "hod.maths@srm.edu"]
      ];
      const wsFaculty = XLSX.utils.aoa_to_sheet(facultyRows);
      wsFaculty["!cols"] = [{ wch: 8 }, { wch: 14 }, { wch: 24 }, { wch: 18 }, { wch: 22 }, { wch: 28 }, { wch: 28 }];
      XLSX.utils.book_append_sheet(wb, wsFaculty, "Faculty-List");
    } else if (activeMode === 'hallsList') {
      const hallRows = [
        ["Serial No", "Floor", "Hall number", "Hall Capacity", "Rows", "Columns", "Seats Per Bench", "Faculty Required"],
        [1, "Ground Floor", "101", 30, 5, 3, 2, 1],
        [2, "Ground Floor", "102", 30, 5, 3, 2, 1],
        [3, "First Floor", "201", 30, 5, 3, 2, 1],
        [4, "Second Floor", "310DH", 25, 5, 5, 1, 1]
      ];
      const wsHalls = XLSX.utils.aoa_to_sheet(hallRows);
      wsHalls["!cols"] = [{ wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 10 }, { wch: 16 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, wsHalls, "Exam-Halls");
    } else {
      const headers = columns.reduce((acc, col) => {
        acc[col.header] = col.example;
        return acc;
      }, {} as Record<string, string>);

      const rows = [headers, ...(sampleRows || [])];
      const ws = XLSX.utils.json_to_sheet(rows);

      const colWidths = columns.map((c) => ({
        wch: Math.max(c.header.length, c.example.length) + 4,
      }));
      ws["!cols"] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, "Template");
    }

    XLSX.writeFile(wb, templateFilename);
  };

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3 space-y-2.5 text-sm">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-blue-700 font-semibold">
          <Info className="h-4 w-4 flex-shrink-0" />
          Required Excel Format
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-100 hover:border-blue-400 gap-1.5"
          onClick={handleDownloadTemplate}
        >
          <Download className="h-3.5 w-3.5" />
          Download Template
        </Button>
      </div>

      {activeMode === 'multiSection' ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <span>Workbook Sheets:</span>
            <span className="inline-flex gap-1 font-mono text-[11px] text-blue-800">
              <span className="px-1.5 py-0.5 bg-blue-100 rounded border border-blue-200">Civil</span>
              <span className="px-1.5 py-0.5 bg-blue-100 rounded border border-blue-200">CSE</span>
              <span className="px-1.5 py-0.5 bg-blue-100 rounded border border-blue-200">EEE</span>
              <span className="px-1.5 py-0.5 bg-blue-100 rounded border border-blue-200">ECE</span>
              <span className="px-1.5 py-0.5 bg-blue-100 rounded border border-blue-200">IT</span>
              <span className="px-1.5 py-0.5 bg-blue-100 rounded border border-blue-200">...</span>
            </span>
          </div>
          <div className="overflow-x-auto rounded border border-slate-300 bg-white">
            <table className="w-full text-xs border-collapse text-center">
              <thead>
                <tr className="bg-slate-100 font-bold text-slate-800 border-b border-slate-300">
                  <th className="border border-slate-300 px-3 py-1 text-center w-1/4">Regulation</th>
                  <th className="border border-slate-300 px-3 py-1 text-center w-1/4">Year</th>
                  <th className="border border-slate-300 px-3 py-1 text-center w-2/4">Branch</th>
                </tr>
                <tr className="bg-white text-slate-700 border-b-2 border-slate-400">
                  <td className="border border-slate-300 px-3 py-1 font-mono">2021</td>
                  <td className="border border-slate-300 px-3 py-1 font-mono">IV</td>
                  <td className="border border-slate-300 px-3 py-1 font-mono text-left pl-4">103 - B.E. Civil Engineering</td>
                </tr>
                <tr className="bg-slate-100 font-bold text-slate-800 border-b border-slate-300">
                  <th className="border border-slate-300 px-3 py-1 text-center">S.No.</th>
                  <th className="border border-slate-300 px-3 py-1 text-center">Register Number</th>
                  <th className="border border-slate-300 px-3 py-1 text-center">Student Name</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-200">
                  <td className="border border-slate-300 px-3 py-1 font-mono text-slate-500">1</td>
                  <td className="border border-slate-300 px-3 py-1 font-mono font-semibold text-slate-800">911123103001</td>
                  <td className="border border-slate-300 px-3 py-1 font-medium text-slate-900 text-left pl-4">ARUN KUMAR B</td>
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="border border-slate-300 px-3 py-1 font-mono text-slate-500">2</td>
                  <td className="border border-slate-300 px-3 py-1 font-mono font-semibold text-slate-800">911123103003</td>
                  <td className="border border-slate-300 px-3 py-1 font-medium text-slate-900 text-left pl-4">DURGESH ADITYA V A</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : activeMode === 'iatTimetable' ? (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-700">
            Official IAT Timetable (Matrix) Format:
          </div>
          <div className="overflow-x-auto rounded border border-blue-200 bg-white shadow-xs">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-blue-100/70 text-blue-900 border-b border-blue-200 font-semibold">
                  <th className="border-r border-blue-200 px-2.5 py-1 text-left">Date / Department</th>
                  <th className="border-r border-blue-200 px-2 py-1 text-center">Year</th>
                  <th className="border-r border-blue-200 px-2.5 py-1 text-center">2026-10-13</th>
                  <th className="border-r border-blue-200 px-2.5 py-1 text-center">2026-10-14</th>
                  <th className="border-r border-blue-200 px-2.5 py-1 text-center">2026-10-15</th>
                  <th className="border-r border-blue-200 px-2.5 py-1 text-center">2026-10-16</th>
                  <th className="px-2.5 py-1 text-center">...</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700">
                <tr className="hover:bg-slate-50">
                  <td className="border-r border-slate-200 px-2.5 py-1 font-semibold text-blue-900">Civil</td>
                  <td className="border-r border-slate-200 px-2 py-1 text-center font-mono">I</td>
                  <td className="border-r border-slate-200 px-2.5 py-1 font-mono text-center">MA25C01</td>
                  <td className="border-r border-slate-200 px-2.5 py-1 font-mono text-center">UC25H01</td>
                  <td className="border-r border-slate-200 px-2.5 py-1 font-mono text-center">PH25C01</td>
                  <td className="border-r border-slate-200 px-2.5 py-1 font-mono text-center">EN25C01</td>
                  <td className="px-2.5 py-1 text-center font-mono text-slate-400">...</td>
                </tr>
                <tr className="hover:bg-slate-50">
                  <td className="border-r border-slate-200 px-2.5 py-1 font-semibold text-blue-900">CSE</td>
                  <td className="border-r border-slate-200 px-2 py-1 text-center font-mono">I</td>
                  <td className="border-r border-slate-200 px-2.5 py-1 font-mono text-center">MA25C01</td>
                  <td className="border-r border-slate-200 px-2.5 py-1 font-mono text-center">UC25H01</td>
                  <td className="border-r border-slate-200 px-2.5 py-1 font-mono text-center">PH25C01</td>
                  <td className="border-r border-slate-200 px-2.5 py-1 font-mono text-center">EN25C01</td>
                  <td className="px-2.5 py-1 text-center font-mono text-slate-400">...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : activeMode === 'facultyList' ? (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded border border-blue-200 bg-white">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-blue-100/70 text-blue-900 border-b border-blue-200 font-semibold">
                  <th className="border-r border-blue-200 px-2 py-1 text-center">Sl. No</th>
                  <th className="border-r border-blue-200 px-2.5 py-1 text-left font-mono">Staff Reg No</th>
                  <th className="border-r border-blue-200 px-3 py-1 text-left">Faculty Name <span className="text-red-500">*</span></th>
                  <th className="border-r border-blue-200 px-3 py-1 text-left">Department <span className="text-red-500">*</span></th>
                  <th className="border-r border-blue-200 px-3 py-1 text-left">Designation <span className="text-red-500">*</span></th>
                  <th className="border-r border-blue-200 px-3 py-1 text-left">Faculty Email ID <span className="text-red-500">*</span></th>
                  <th className="px-3 py-1 text-left">HOD Email ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700">
                <tr className="hover:bg-slate-50">
                  <td className="border-r border-slate-200 px-2 py-1 text-center font-mono text-slate-400">1</td>
                  <td className="border-r border-slate-200 px-2.5 py-1 font-mono font-medium text-slate-700">FAC001</td>
                  <td className="border-r border-slate-200 px-3 py-1 font-medium text-slate-900">Dr. M. Ananda Kumar</td>
                  <td className="border-r border-slate-200 px-3 py-1">Chemistry</td>
                  <td className="border-r border-slate-200 px-3 py-1 text-blue-800 font-medium">Associate Professor</td>
                  <td className="border-r border-slate-200 px-3 py-1 font-mono text-slate-600">anandakumar@srm.edu</td>
                  <td className="px-3 py-1 font-mono text-slate-600">hod.chemistry@srm.edu</td>
                </tr>
                <tr className="hover:bg-slate-50">
                  <td className="border-r border-slate-200 px-2 py-1 text-center font-mono text-slate-400">2</td>
                  <td className="border-r border-slate-200 px-2.5 py-1 font-mono font-medium text-slate-700">FAC002</td>
                  <td className="border-r border-slate-200 px-3 py-1 font-medium text-slate-900">R. Krishna</td>
                  <td className="border-r border-slate-200 px-3 py-1">CSE</td>
                  <td className="border-r border-slate-200 px-3 py-1 text-blue-800 font-medium">Assistant Professor</td>
                  <td className="border-r border-slate-200 px-3 py-1 font-mono text-slate-600">krishna@srm.edu</td>
                  <td className="px-3 py-1 font-mono text-slate-600">hod.cse@srm.edu</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600 bg-white/80 p-2.5 rounded border border-blue-100">
            <div>
              <span className="font-semibold text-blue-900">Staff Reg No:</span> Unique Faculty ID / Register Number (e.g., <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800 font-mono">FAC001</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800 font-mono">10245</code>).
            </div>
            <div>
              <span className="font-semibold text-blue-900">Faculty Name:</span> Full faculty name (no compulsory initial format required).
            </div>
          </div>
        </div>
      ) : activeMode === 'hallsList' ? (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded border border-blue-200 bg-white">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-blue-100/70 text-blue-900 border-b border-blue-200 font-semibold">
                  <th className="border-r border-blue-200 px-2 py-1 text-center">Serial No</th>
                  <th className="border-r border-blue-200 px-3 py-1 text-left">Floor <span className="text-red-500">*</span></th>
                  <th className="border-r border-blue-200 px-3 py-1 text-left font-mono">Hall number <span className="text-red-500">*</span></th>
                  <th className="border-r border-blue-200 px-2.5 py-1 text-center">Hall Capacity <span className="text-red-500">*</span></th>
                  <th className="border-r border-blue-200 px-2 py-1 text-center">Rows</th>
                  <th className="border-r border-blue-200 px-2 py-1 text-center">Columns</th>
                  <th className="border-r border-blue-200 px-2.5 py-1 text-center">Seats / Bench</th>
                  <th className="px-2.5 py-1 text-center">Faculty Required</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700">
                <tr className="hover:bg-slate-50">
                  <td className="border-r border-slate-200 px-2 py-1 text-center font-mono text-slate-400">1</td>
                  <td className="border-r border-slate-200 px-3 py-1 font-medium">Ground Floor</td>
                  <td className="border-r border-slate-200 px-3 py-1 font-mono font-bold text-blue-900">101</td>
                  <td className="border-r border-slate-200 px-2.5 py-1 text-center font-semibold text-slate-800">30</td>
                  <td className="border-r border-slate-200 px-2 py-1 text-center font-mono text-slate-500">5</td>
                  <td className="border-r border-slate-200 px-2 py-1 text-center font-mono text-slate-500">3</td>
                  <td className="border-r border-slate-200 px-2.5 py-1 text-center font-mono text-slate-500">2</td>
                  <td className="px-2.5 py-1 text-center font-semibold text-slate-700">1</td>
                </tr>
                <tr className="hover:bg-slate-50">
                  <td className="border-r border-slate-200 px-2 py-1 text-center font-mono text-slate-400">2</td>
                  <td className="border-r border-slate-200 px-3 py-1 font-medium">Second Floor</td>
                  <td className="border-r border-slate-200 px-3 py-1 font-mono font-bold text-blue-900">310DH</td>
                  <td className="border-r border-slate-200 px-2.5 py-1 text-center font-semibold text-slate-800">25</td>
                  <td className="border-r border-slate-200 px-2 py-1 text-center font-mono text-slate-500">5</td>
                  <td className="border-r border-slate-200 px-2 py-1 text-center font-mono text-slate-500">5</td>
                  <td className="border-r border-slate-200 px-2.5 py-1 text-center font-mono text-slate-500">1</td>
                  <td className="px-2.5 py-1 text-center font-semibold text-slate-700">1</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Column table */
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-blue-100 text-blue-800">
                {columns.map((col) => (
                  <th
                    key={col.header}
                    className="border border-blue-200 px-2 py-1 font-semibold text-left whitespace-nowrap"
                  >
                    {col.header}
                    {col.required && (
                      <span className="text-red-500 ml-0.5">*</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="bg-white">
                {columns.map((col) => (
                  <td
                    key={col.header}
                    className="border border-blue-200 px-2 py-1 text-slate-600 font-mono whitespace-nowrap"
                  >
                    {col.example}
                  </td>
                ))}
              </tr>
              {columns.some((c) => c.description) && (
                <tr className="bg-blue-50/40">
                  {columns.map((col) => (
                    <td
                      key={col.header}
                      className="border border-blue-100 px-2 py-1 text-slate-400 italic text-[10px] whitespace-nowrap"
                    >
                      {col.description || ""}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {note && (
        <p className="text-[11px] text-blue-600 italic leading-snug">
          ⚠ {note}
        </p>
      )}
    </div>
  );
};

export default ExcelUploadHelper;
