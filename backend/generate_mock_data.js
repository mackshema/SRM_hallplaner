import xlsx from 'xlsx';
import fs from 'fs';

// 1. Mock Timetable Data for CSE & Year 1
const timetableData = [
    { "Subject Code": "CSE101", "Date": "2026-05-15", "Session": "FN", "Department": "CSE", "Year": "Year 1" },
    { "Subject Code": "CSE201", "Date": "2026-05-15", "Session": "FN", "Department": "CSE", "Year": "Year 2" },
    { "Subject Code": "ECE101", "Date": "2026-05-15", "Session": "FN", "Department": "ECE", "Year": "Year 1" },
];

const timetableSheet = xlsx.utils.json_to_sheet(timetableData);
const timetableBook = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(timetableBook, timetableSheet, "Timetable");
xlsx.writeFile(timetableBook, "CSE_Anna_Timetable.xlsx");

// 2. Mock Students Data for CSE Bulk Upload
const studentsData = [
    { "Name": "Alice Android", "Roll Number": "CSE001", "Email": "alice@mock.edu" },
    { "Name": "Bob Byte", "Roll Number": "CSE002", "Email": "bob@mock.edu" },
    { "Name": "Charlie Code", "Roll Number": "CSE003", "Email": "charlie@mock.edu" },
    { "Name": "Diana Data", "Roll Number": "CSE004", "Email": "diana@mock.edu" },
    { "Name": "Evan Ethernet", "Roll Number": "CSE005", "Email": "evan@mock.edu" },
    { "Name": "Fiona Firewall", "Roll Number": "CSE006", "Email": "fiona@mock.edu" },
    { "Name": "George Gateway", "Roll Number": "CSE007", "Email": "george@mock.edu" },
    { "Name": "Hannah Html", "Roll Number": "CSE008", "Email": "hannah@mock.edu" },
    { "Name": "Ian Internet", "Roll Number": "CSE009", "Email": "ian@mock.edu" },
    { "Name": "Jessica Java", "Roll Number": "CSE010", "Email": "jessica@mock.edu" },
];

const studentSheet = xlsx.utils.json_to_sheet(studentsData);
const studentBook = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(studentBook, studentSheet, "Students");
xlsx.writeFile(studentBook, "CSE_Students_Bulk.xlsx");

console.log("Successfully created new CSE_Anna_Timetable.xlsx and CSE_Students_Bulk.xlsx");
