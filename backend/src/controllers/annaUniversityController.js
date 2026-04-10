import xlsx from 'xlsx';
import AnnaExamData from '../models/AnnaExamData.js';
import AnnaSeating from '../models/AnnaSeating.js';
import Hall from '../models/Hall.js';
import User from '../models/User.js';

export const getExamData = async (req, res) => {
  try {
    const data = await AnnaExamData.find({});
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const uploadStudents = async (req, res) => {
  try {
    if (!req.file) {
      // Manual input handling
      if (req.body.students) {
        const result = await AnnaExamData.insertMany(req.body.students);
        return res.json({ success: true, inserted: result.length });
      }
      return res.status(400).json({ error: 'No file or manual array provided' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    // expected columns: Roll Number, Subject Code, Department
    const formattedData = data.map(row => {
      // Trying to be robust with column names
      const roll = row['Roll Number'] || row['Roll No'] || row['rollNumber'] || row['roll_no'];
      const sub = row['Subject Code'] || row['subjectCode'] || row['subject_code'];
      const dept = row['Department'] || row['department'];
      const name = row['Student Name'] || row['studentName'] || '';

      if (!roll || !sub || !dept) return null;

      return {
        rollNumber: String(roll).trim(),
        subjectCode: String(sub).trim(),
        department: String(dept).trim(),
        studentName: String(name).trim()
      };
    }).filter(Boolean);

    if (formattedData.length === 0) {
      return res.status(400).json({ error: 'Invalid file format or missing required columns (Roll Number, Subject Code, Department)' });
    }

    // Upsert or insert many
    // For simplicity, let's update if exists, otherwise insert
    for (const d of formattedData) {
      await AnnaExamData.findOneAndUpdate(
        { rollNumber: d.rollNumber, subjectCode: d.subjectCode },
        d,
        { upsert: true }
      );
    }

    res.json({ success: true, count: formattedData.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

export const uploadTimetableRaw = async (req, res) => {
  try {
    const { textData } = req.body;
    if (!textData) return res.status(400).json({ error: "Missing text data" });

    // Very basic heuristic for OCR: Look for lines with alphanumeric subject codes
    const lines = textData.split('\n');
    let matchedSubjects = 0;

    for (const line of lines) {
      const parts = line.split(/\s+/).filter(Boolean);
      // We assume an OCR line might look like: "CS101 2024-05-15 FN ComputerScience"
      if (parts.length >= 3) {
        let subjectCode = parts[0];
        let examDate = parts[1];
        let session = parts[2];
        let department = parts.slice(3).join(' ') || "Unknown"; // optional department

        // Only save if session is exactly FN or AN
        if (session === "FN" || session === "AN" || session.includes("FN") || session.includes("AN")) {
           session = session.includes("FN") ? "FN" : "AN";
           await AnnaExamData.updateMany(
             { subjectCode },
             { $set: { examDate, session, department } },
             { upsert: true } // Need to create so we know which department has which subject code!
           );
           matchedSubjects++;
        }
      }
    }
    res.json({ success: true, updatedSubjects: matchedSubjects });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};

export const uploadTimetable = async (req, res) => {
  try {
    let updates = [];
    if (!req.file) {
      if (!req.body.timetable) {
         return res.status(400).json({ error: 'No file or manual timetable provided' });
      }
      updates = req.body.timetable;
    } else {
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

      updates = data.map(row => {
        const sub = row['Subject Code'] || row['subjectCode'];
        let dat = row['Date'] || row['date'] || row['examDate'];
        const ses = row['Session'] || row['session'];
        const dept = row['Department'] || row['department'];
        const year = row['Year'] || row['year'] || row['Degree'] || row['degree'];
        
        if (!sub || !dat || !ses) return null;

        // Excel parses dates as serial numbers (e.g., 46152 for May 10, 2026)
        if (typeof dat === 'number') {
            const parsedDate = new Date(Math.round((dat - 25569) * 86400 * 1000));
            dat = parsedDate.toISOString().split('T')[0]; // "YYYY-MM-DD"
        }
        return {
          subjectCode: String(sub).trim(),
          examDate: String(dat).trim(),
          session: String(ses).trim(),
          department: dept ? String(dept).trim() : null,
          year: year ? String(year).trim() : ""
        };
      }).filter(Boolean);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Invalid timetable data provided' });
    }

    // Update ExamData with these dates (upsert so we store the active map for the session)
    let matchedCount = 0;
    for (const u of updates) {
      await AnnaExamData.updateMany(
        { subjectCode: u.subjectCode },
        { $set: { examDate: u.examDate, session: u.session, department: u.department || "Unknown", year: u.year || "" } },
        { upsert: true }
      );
      matchedCount++;
    }

    res.json({ success: true, updatedSubjects: matchedCount });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

export const generateAnnaSeating = async (req, res) => {
  try {
    const { examDate, session, maxPerHall = 25, seatsPerBench: spb = 2 } = req.body;

    if (!examDate || !session) {
      return res.status(400).json({ error: "examDate and session required" });
    }

    // Find out which Subject Codes are scheduled for this Date and Session
    const scheduledSubjects = await AnnaExamData.find({ examDate, session }).lean();
    if (scheduledSubjects.length === 0) {
      return res.status(400).json({ error: "No timetable mappings found for this Date and Session." });
    }

    // Attempt to match global students to these subjects based on Department mapping in Timetable.
    const allStudents = await User.find({ role: 'student' }).lean();
    if(allStudents.length === 0) {
      return res.status(400).json({ error: "No students exist in the main database." });
    }

    const students = [];
    for (const user of allStudents) {
      // For each student, check if their department and year has a subject scheduled today
      const mappedSubject = scheduledSubjects.find(sub => 
          sub.department === user.department && 
          sub.year === user.degree
      );
      if (mappedSubject) {
        students.push({
          rollNumber: user.username,
          studentName: user.name,
          department: user.department,
          subjectCode: mappedSubject.subjectCode
        });
      }
    }

    if (students.length === 0) {
      return res.status(400).json({ error: "No students in the database matched the Departments scheduled for this exam." });
    }

    // Sort students basically by Subject Code and Department to group effectively, then strictly by Roll Number
    students.sort((a, b) => {
      if (a.subjectCode < b.subjectCode) return -1;
      if (a.subjectCode > b.subjectCode) return 1;
      
      const numA = parseInt(a.rollNumber.replace(/\D/g, ''));
      const numB = parseInt(b.rollNumber.replace(/\D/g, ''));
      if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
      
      return a.rollNumber.localeCompare(b.rollNumber, undefined, { numeric: true });
    });

    // Get Active Halls (currently selected)
    const halls = await Hall.find({ isSelected: true }).lean();
    if (halls.length === 0) {
      return res.status(400).json({ error: "No halls selected for generation" });
    }

    // Anna University Rule Validation: A hall MUST have exactly 2 columns (meaning 2 students per bench width)
    for (const hall of halls) {
      if (hall.columns > 2) {
         return res.status(400).json({ 
           error: `Hall ${hall.name} has a configuration of ${hall.rows}x${hall.columns}. Anna University seating STRICTLY permits exactly 2 members per bench. Please go to Exam Halls page, edit this hall, and change its columns to 2.` 
         });
      }
    }

    const allAssignments = [];
    let studentQueue = [...students];

    // Delete existing plan mapping for this date/session to overwrite
    await AnnaSeating.deleteMany({ examDate, session });

    for (const hall of halls) {
      if (studentQueue.length === 0) break;

      const assignmentInHall = [];
      let capacityUsed = 0;
      
      const hallMax = Math.min(
        maxPerHall,
        hall.rows * hall.columns * (req.body.seatsPerBench || spb)
      );

      // We maintain a 2D grid to check adjacencies.
      // Y = row (0 to rows-1)
      // X = col * seatsPerBench + benchPos (0 to cols*seatsPerBench-1)
      const grid = Array(hall.rows).fill(null).map(() => 
        Array(hall.columns * spb).fill(null)
      );

      // Attempt to place students
      for (let r = 0; r < hall.rows; r++) {
        for (let c = 0; c < hall.columns; c++) {
          for (let p = 0; p < spb; p++) {
            if (capacityUsed >= hallMax) break;

            const gridX = c * spb + p;
            const gridY = r;

            // Find a valid student
            let placed = false;
            for (let q = 0; q < studentQueue.length; q++) {
              const candidate = studentQueue[q];
              const candDept = candidate.department;

              // Check Adjacency
              const checkAdjacency = () => {
                const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]]; // Left, Right, Up, Down
                for (const [dy, dx] of dirs) {
                  const ny = gridY + dy;
                  const nx = gridX + dx;
                  if (ny >= 0 && ny < hall.rows && nx >= 0 && nx < hall.columns * spb) {
                    if (grid[ny][nx] && grid[ny][nx].department === candDept) return true;
                  }
                }
                return false;
              };

              if (!checkAdjacency()) {
                // Place this student
                grid[gridY][gridX] = candidate;
                studentQueue.splice(q, 1);
                
                assignmentInHall.push({
                  hallId: hall._id,
                  hallName: hall.name,
                  row: r + 1,
                  column: c + 1,
                  benchPosition: p + 1,
                  rollNumber: candidate.rollNumber,
                  subjectCode: candidate.subjectCode,
                  department: candidate.department
                });
                
                capacityUsed++;
                placed = true;
                break;
              }
            }
            if (!placed && studentQueue.length > 0) {
              // Forced fallback if layout gets stuck due to strictly isolated remaining departments.
              // To avoid infinity loops or extremely sparse halls: just grab the first despite constraint,
              // or leave seat empty. Opting to leave empty to strictly honor requirement? 
              // The user said: "STRICT Department Separation Rule... Show clear errors 'Unable to satisfy seating constraints'".
              console.log("Could not satisfy constraint for seat", r, c, p);
            }
          }
        }
      }

      if (assignmentInHall.length > 0) {
        allAssignments.push(...assignmentInHall);
      }
    }

    if (studentQueue.length > 0) {
      return res.status(400).json({ 
        error: `Unable to satisfy seating constraints or insufficient hall capacity. ${studentQueue.length} students left unassigned.` 
      });
    }

    // Save Seating
    const newSeating = new AnnaSeating({
      examDate,
      session,
      assignments: allAssignments
    });
    await newSeating.save();

    res.json({ success: true, count: allAssignments.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

export const getSeatingPlan = async (req, res) => {
  try {
    const { examDate, session } = req.query;
    if (!examDate || !session) {
      return res.status(400).json({ error: "examDate and session required" });
    }
    const plan = await AnnaSeating.findOne({ examDate, session });
    res.json(plan || { assignments: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

export const updateStatus = async (req, res) => {
  try {
    const { examDate, session, status, isPublished } = req.body;
    if (!examDate || !session) {
      return res.status(400).json({ error: "examDate and session required" });
    }
    const updatePayload = {};
    if (status !== undefined) updatePayload.status = status;
    if (isPublished !== undefined) updatePayload.isPublished = isPublished;
    
    const plan = await AnnaSeating.findOneAndUpdate(
      { examDate, session },
      { $set: updatePayload },
      { new: true }
    );
    if (!plan) return res.status(404).json({ error: "Seating plan not found" });
    res.json(plan);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
