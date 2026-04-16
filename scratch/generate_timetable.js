import * as XLSX from 'xlsx';

const timetable = [
  { "Subject Code": "CS301", "Date": "2026-05-10", "Session": "FN", "Department": "CSE", "Year": "Year 2" },
  { "Subject Code": "CS302", "Date": "2026-05-12", "Session": "FN", "Department": "CSE", "Year": "Year 2" },
  { "Subject Code": "EC401", "Date": "2026-05-10", "Session": "FN", "Department": "ECE", "Year": "Year 2" },
  { "Subject Code": "EC402", "Date": "2026-05-14", "Session": "FN", "Department": "ECE", "Year": "Year 2" },
  { "Subject Code": "ME201", "Date": "2026-05-11", "Session": "AN", "Department": "MECH", "Year": "Year 3" },
  { "Subject Code": "ME202", "Date": "2026-05-15", "Session": "AN", "Department": "MECH", "Year": "Year 3" },
  { "Subject Code": "IT101", "Date": "2026-05-10", "Session": "FN", "Department": "IT", "Year": "Year 1" },
];

const ws = XLSX.utils.json_to_sheet(timetable);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Timetable");
XLSX.writeFile(wb, "Sample_Anna_Timetable.xlsx");
console.log("Timetable file generated: Sample_Anna_Timetable.xlsx");
