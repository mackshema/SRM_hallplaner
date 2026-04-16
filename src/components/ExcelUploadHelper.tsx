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
  columns: ColumnSpec[];
  templateFilename: string;
  sampleRows?: Record<string, string>[];  // Extra sample rows beyond the single example
  note?: string;
}

/**
 * ExcelUploadHelper — Renders a compact format guide + template download button
 * for any Excel/CSV file upload box.
 *
 * Usage:
 *   <ExcelUploadHelper
 *     columns={[
 *       { header: "Subject Code", example: "CS3401", required: true },
 *       { header: "Date",         example: "2025-04-15", required: true },
 *       { header: "Session",      example: "FN",         required: true, description: "FN or AN" },
 *     ]}
 *     templateFilename="Timetable_Template.xlsx"
 *   />
 */
const ExcelUploadHelper: React.FC<ExcelUploadHelperProps> = ({
  columns,
  templateFilename,
  sampleRows,
  note,
}) => {
  const handleDownloadTemplate = () => {
    const headers = columns.reduce((acc, col) => {
      acc[col.header] = col.example;
      return acc;
    }, {} as Record<string, string>);

    const rows = [headers, ...(sampleRows || [])];
    const ws = XLSX.utils.json_to_sheet(rows);

    // Style: auto-width columns
    const colWidths = columns.map((c) => ({
      wch: Math.max(c.header.length, c.example.length) + 4,
    }));
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, templateFilename);
  };

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3 space-y-2 text-sm">
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

      {/* Column table */}
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

      {note && (
        <p className="text-[11px] text-blue-600 italic leading-snug">
          ⚠ {note}
        </p>
      )}
    </div>
  );
};

export default ExcelUploadHelper;
