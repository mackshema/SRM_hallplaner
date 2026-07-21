import XLSX from 'xlsx';

const data = [
  { "Subject Code": "CSE101", "Year": "Year 1", "Department": "CSE", "Date": "2026-05-10", "Session": "FN" },
  { "Subject Code": "CSE201", "Year": "Year 2", "Department": "CSE", "Date": "2026-05-12", "Session": "FN" },
  { "Subject Code": "ECE101", "Year": "Year 1", "Department": "ECE", "Date": "2026-05-10", "Session": "FN" },
  { "Subject Code": "MEC101", "Year": "Year 1", "Department": "MECH", "Date": "2026-05-11", "Session": "AN" },
  { "Subject Code": "ITT101", "Year": "Year 1", "Department": "IT", "Date": "2026-05-09", "Session": "FN" },
  { "Subject Code": "CB3902", "Year": "Year 1", "Department": "CSE", "Date": "2026-05-15", "Session": "FN" },
  { "Subject Code": "fgc", "Year": "Year 1", "Department": "CSE", "Date": "2026-05-16", "Session": "FN" },
  { "Subject Code": "CSE301", "Year": "Year 3", "Department": "CSE", "Date": "2026-05-20", "Session": "AN" }
];

const ws = XLSX.utils.json_to_sheet(data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Timetable");

XLSX.writeFile(wb, "Sync_Test_Timetable.xlsx");
console.log("Successfully generated Sync_Test_Timetable.xlsx with matching subject codes!");
