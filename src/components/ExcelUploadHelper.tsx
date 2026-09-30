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
}

const ExcelUploadHelper: React.FC<ExcelUploadHelperProps> = ({
  columns = [],
  templateFilename,
  sampleRows,
  note,
  multiSectionMode = false
}) => {
  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();

    if (multiSectionMode) {
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

      {multiSectionMode ? (
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
