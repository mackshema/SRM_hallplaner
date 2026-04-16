import * as XLSX from 'xlsx';
import fs from 'fs';

const students = [
  // CSE - Year 2
  { "Name": "Aravind K", "Roll Number": "911122104001", "Email": "aravind@test.com", "Program": "Engineering", "Year": "Year 2", "Department": "CSE" },
  { "Name": "Bhavana S", "Roll Number": "911122104002", "Email": "bhavana@test.com", "Program": "Engineering", "Year": "Year 2", "Department": "CSE" },
  { "Name": "Chandru M", "Roll Number": "911122104003", "Email": "chandru@test.com", "Program": "Engineering", "Year": "Year 2", "Department": "CSE" },
  { "Name": "Deepika R", "Roll Number": "911122104004", "Email": "deepika@test.com", "Program": "Engineering", "Year": "Year 2", "Department": "CSE" },
  { "Name": "Ezhil V", "Roll Number": "911122104005", "Email": "ezhil@test.com", "Program": "Engineering", "Year": "Year 2", "Department": "CSE" },
  // ECE - Year 2
  { "Name": "Farooq A", "Roll Number": "911122106001", "Email": "farooq@test.com", "Program": "Engineering", "Year": "Year 2", "Department": "ECE" },
  { "Name": "Gowtham P", "Roll Number": "911122106002", "Email": "gowtham@test.com", "Program": "Engineering", "Year": "Year 2", "Department": "ECE" },
  { "Name": "Harini K", "Roll Number": "911122106003", "Email": "harini@test.com", "Program": "Engineering", "Year": "Year 2", "Department": "ECE" },
  { "Name": "Ismail S", "Roll Number": "911122106004", "Email": "ismail@test.com", "Program": "Engineering", "Year": "Year 2", "Department": "ECE" },
  { "Name": "Janani R", "Roll Number": "911122106005", "Email": "janani@test.com", "Program": "Engineering", "Year": "Year 2", "Department": "ECE" },
  // MECH - Year 3
  { "Name": "Kiran Kumar", "Roll Number": "911121114001", "Email": "kiran@test.com", "Program": "Engineering", "Year": "Year 3", "Department": "MECH" },
  { "Name": "Lokesh W", "Roll Number": "911121114002", "Email": "lokesh@test.com", "Program": "Engineering", "Year": "Year 3", "Department": "MECH" },
  { "Name": "Manoj P", "Roll Number": "911121114003", "Email": "manoj@test.com", "Program": "Engineering", "Year": "Year 3", "Department": "MECH" },
  { "Name": "Nive P", "Roll Number": "911121114004", "Email": "nive@test.com", "Program": "Engineering", "Year": "Year 3", "Department": "MECH" },
  { "Name": "Oviya S", "Roll Number": "911121114005", "Email": "oviya@test.com", "Program": "Engineering", "Year": "Year 3", "Department": "MECH" },
  // IT - Year 1
  { "Name": "Prakash J", "Roll Number": "911123110001", "Email": "prakash@test.com", "Program": "Engineering", "Year": "Year 1", "Department": "IT" },
  { "Name": "Qadir M", "Roll Number": "911123110002", "Email": "qadir@test.com", "Program": "Engineering", "Year": "Year 1", "Department": "IT" },
  { "Name": "Ramesh L", "Roll Number": "911123110003", "Email": "ramesh@test.com", "Program": "Engineering", "Year": "Year 1", "Department": "IT" },
  { "Name": "Sowmya G", "Roll Number": "911123110004", "Email": "sowmya@test.com", "Program": "Engineering", "Year": "Year 1", "Department": "IT" },
  { "Name": "Tarun K", "Roll Number": "911123110005", "Email": "tarun@test.com", "Program": "Engineering", "Year": "Year 1", "Department": "IT" },
];

const ws = XLSX.utils.json_to_sheet(students);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Students");
XLSX.writeFile(wb, "Global_Bulk_Upload_Test.xlsx");
console.log("Excel file generated: Global_Bulk_Upload_Test.xlsx");
