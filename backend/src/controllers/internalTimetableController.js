import xlsx from 'xlsx';
import InternalExamData from '../models/InternalExamData.js';
import SeatAssignment from '../models/SeatAssignment.js';
import ExamSession from '../models/ExamSession.js';
import Hall from '../models/Hall.js';
import User from '../models/User.js';
import FacultyDuty from '../models/FacultyDuty.js';

export const getExamData = async (req, res) => {
  try {
    const data = await InternalExamData.find({});
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const uploadTimetableRaw = async (req, res) => {
  try {
    const { textData } = req.body;
    if (!textData) return res.status(400).json({ error: "Missing text data" });

    const lines = textData.split('\n');
    let matchedSubjects = 0;

    for (const line of lines) {
      const parts = line.split(/\s+/).filter(Boolean);
      if (parts.length >= 3) {
        let subjectCode = parts[0];
        let examDate = parts[1];
        let session = parts[2];
        let department = parts.slice(3).join(' ') || "Unknown";

        if (session === "FN" || session === "AN" || session.includes("FN") || session.includes("AN")) {
           session = session.includes("FN") ? "FN" : "AN";
           await InternalExamData.updateMany(
             { subjectCode },
             { $set: { examDate, session, department } },
             { upsert: true }
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

        if (typeof dat === 'number') {
            const parsedDate = new Date(Math.round((dat - 25569) * 86400 * 1000));
            dat = parsedDate.toISOString().split('T')[0];
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

    let matchedCount = 0;
    for (const u of updates) {
      await InternalExamData.updateMany(
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

export const manualMapSubject = async (req, res) => {
  try {
    const { subjectCode, examDate, session, type, year, department, rollNumber } = req.body;
    
    if (!subjectCode || !examDate || !session || !type) {
      return res.status(400).json({ error: "Missing required fields for manual mapping." });
    }

    if (type === 'department') {
      if (!department || !year) return res.status(400).json({ error: "Department and Year are required." });
      
      await InternalExamData.updateOne(
        { subjectCode, department, year, examDate, session },
        { $set: { subjectCode, department, year, examDate, session, rollNumber: "" } },
        { upsert: true }
      );
      return res.json({ success: true, message: `Mapped ${subjectCode} for generic department ${department} (${year}).` });
      
    } else if (type === 'rollNumber') {
      if (!rollNumber) return res.status(400).json({ error: "Roll Number is required." });
      
      const rollNumbersArray = typeof rollNumber === 'string' 
          ? rollNumber.split(',').map(r => r.trim()).filter(Boolean)
          : Array.isArray(rollNumber) ? rollNumber : [rollNumber];
          
      if (rollNumbersArray.length === 0) return res.status(400).json({ error: "No valid roll numbers provided." });

      const missingRolls = [];
      const successfulMappings = [];
      
      for (const r of rollNumbersArray) {
        const student = await User.findOne({ username: r, role: 'student' });
        if (!student) {
          missingRolls.push(r);
          continue;
        }
        
        await InternalExamData.updateOne(
          { subjectCode, rollNumber: r, examDate, session },
          { $set: { subjectCode, rollNumber: r, examDate, session, department: student.department || "Unknown", year: student.degree || "", studentName: student.name } },
          { upsert: true }
        );
        successfulMappings.push({ rollNumber: r, name: student.name, year: student.degree, department: student.department });
      }
      
      if (missingRolls.length > 0) {
         if (successfulMappings.length === 0) {
             return res.status(404).json({ error: `The following roll numbers are not in the database: ${missingRolls.join(', ')}` });
         } else {
             return res.status(200).json({ 
                 success: true,
                 partialError: `Successfully mapped ${successfulMappings.length} students. WARNING: The following roll numbers are not in database: ${missingRolls.join(', ')}`,
                 mapped: successfulMappings
             });
         }
      }
      
      return res.json({ success: true, message: `Mapped ${subjectCode} for ${successfulMappings.length} student(s).`, mapped: successfulMappings });
    } else {
      return res.status(400).json({ error: "Invalid mapping type." });
    }
  } catch (err) {
    console.error("Error in manual map:", err);
    res.status(500).json({ error: err.message });
  }
};

export const generateAllInternalSeating = async (req, res) => {
  try {
    const scheduledSubjects = await InternalExamData.find({}).lean();
    if (scheduledSubjects.length === 0) {
      return res.status(400).json({ error: "No internal timetable mappings found." });
    }

    const uniqueSessions = [];
    scheduledSubjects.forEach(s => {
       if (!uniqueSessions.find(u => u.examDate === s.examDate && u.session === s.session)) {
           uniqueSessions.push({ examDate: s.examDate, session: s.session });
       }
    });

    const allStudents = await User.find({ role: 'student' }).lean();
    if(allStudents.length === 0) {
      return res.status(400).json({ error: "No students exist in the main database." });
    }

    const halls = await Hall.find({ isSelected: true });
    if (halls.length === 0) {
      return res.status(400).json({ error: "No halls selected for generation" });
    }

    let generatedCount = 0;
    let skippedCount = 0;
    let globalAllocationWarnings = [];

    for (const { examDate, session } of uniqueSessions) {
       // Check if ExamSession already exists
       let examSessionDoc = await ExamSession.findOne({ examDate, examSession: session });
       if (examSessionDoc) {
          skippedCount++;
          continue; // Don't disturb existing internal sessions
       }

       // Create ExamSession
       examSessionDoc = new ExamSession({
         examDate,
         examSession: session,
         examTime: session === "FN" ? "09:30 AM" : "01:30 PM",
         status: "DRAFT"
       });
       await examSessionDoc.save();

       const activeSubjects = scheduledSubjects.filter(sub => sub.examDate === examDate && sub.session === session);
       
       const students = [];
       for (const user of allStudents) {
         let mappedSubject = activeSubjects.find(sub => sub.rollNumber === user.username);
         if (!mappedSubject) {
           mappedSubject = activeSubjects.find(sub => 
               sub.department === user.department && 
               sub.year === user.degree &&
               !sub.rollNumber 
           );
         }
         
         if (mappedSubject) {
           students.push({
             rollNumber: user.username,
             department: user.department || "Unknown",
             subjectCode: mappedSubject.subjectCode
           });
         }
       }

       if (students.length === 0) {
          await ExamSession.findByIdAndDelete(examSessionDoc._id);
          continue; 
       }

       const deptQueues = {};
       students.forEach(s => {
         if (!deptQueues[s.department]) deptQueues[s.department] = [];
         deptQueues[s.department].push(s.rollNumber);
       });

       const deptIds = Object.keys(deptQueues);
       
       for (const k of deptIds) {
           deptQueues[k].sort((a,b) => {
               const numA = parseInt(a.replace(/\D/g, ''));
               const numB = parseInt(b.replace(/\D/g, ''));
               if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
               return a.localeCompare(b, undefined, { numeric: true });
           });
       }

       const shuffledDeptIds = [...deptIds];
       // Shuffle Departments
       for (let i = shuffledDeptIds.length - 1; i > 0; i--) {
         const j = Math.floor(Math.random() * (i + 1));
         [shuffledDeptIds[i], shuffledDeptIds[j]] = [shuffledDeptIds[j], shuffledDeptIds[i]];
       }

       const startIndex = Math.floor(Math.random() * halls.length);
       const orderedHalls = [
         ...halls.slice(startIndex),
         ...halls.slice(0, startIndex),
       ];

       const assignments = [];
       let deptPtr = 0;

       const getNextActiveDepts = (n) => {
         const active = [];
         let checked = 0;
         while (active.length < n && checked < shuffledDeptIds.length) {
           const dId = shuffledDeptIds[(deptPtr + checked) % shuffledDeptIds.length];
           if (deptQueues[dId] && deptQueues[dId].length > 0) {
             if (!active.includes(dId)) {
               active.push(dId);
             }
           }
           checked++;
         }
         return active;
       };

       for (const hall of orderedHalls) {
         const extraSeats = (hall.extraBenches && hall.extraBenches.length) ? hall.extraBenches.length * hall.seatsPerBench : 0;
         const hallCapacity = (hall.rows * hall.columns * hall.seatsPerBench) + extraSeats;

         const desiredDeptCount = 3;
         let activeDepts = getNextActiveDepts(desiredDeptCount);

         if (activeDepts.length === 0) break;

         deptPtr = (deptPtr + 1) % shuffledDeptIds.length;

         const hallBatch = new Map();
         activeDepts.forEach((d) => hallBatch.set(d, []));

         let seatsFilled = 0;
         const targetPerDept = Math.floor(hallCapacity / activeDepts.length);

         activeDepts.forEach((dId) => {
           const queue = deptQueues[dId];
           const takeCount = Math.min(targetPerDept, queue.length);
           for (let k = 0; k < takeCount; k++) {
             hallBatch.get(dId).push(queue.shift());
             seatsFilled++;
           }
         });

         // Fill remaining hall capacity — pull round-robin from any dept globally
         let safetyCheck = 0;
         while (seatsFilled < hallCapacity && safetyCheck < hallCapacity * 2) {
           safetyCheck++;
           // Prefer depts already in batch so we don't mix too many depts
           let candidates = activeDepts.filter((d) => deptQueues[d].length > 0);
           if (candidates.length === 0) {
             // Exceptional case: primary batch depts exhausted — pull from any global dept
             candidates = shuffledDeptIds.filter((d) => deptQueues[d].length > 0);
             if (candidates.length === 0) break;
             candidates.forEach((c) => {
               if (!hallBatch.has(c)) hallBatch.set(c, []);
             });
           }
           const dId = candidates[seatsFilled % candidates.length];
           hallBatch.get(dId).push(deptQueues[dId].shift());
           seatsFilled++;
         }

         // Rebuild batchDeptIds after pre-fill (includes any globally pulled depts)
         const batchDeptIds = Array.from(hallBatch.keys()).filter(d => hallBatch.get(d).length > 0);
         // singleDept = only one distinct dept going into this hall
         const singleDept = batchDeptIds.length === 1;

         // grid[row][colSeatIndex] stores the dept placed at that cell
         // indices are 1-based; row 0 and col 0 stay null as padding
         const grid = Array(hall.rows + 1).fill(null).map(() => Array(hall.columns * hall.seatsPerBench + 1).fill(null));

         // ─────────────────────────────────────────────────────────────────────
         // PLACEMENT RULES (all three enforced simultaneously):
         //   1. Bench-mate rule  : seat-2 dept ≠ seat-1 dept on the SAME bench
         //   2. Left-neighbor    : must differ from the immediately adjacent seat
         //                         (same row, previous gridX position)
         //   3. Top-neighbor     : must differ from the seat directly above
         //                         (previous row, same gridX position) ← NEW
         //
         // EXCEPTIONAL FILL: when hallBatch for a dept is empty but the hall
         // still has room AND globally that dept still has students, pull
         // directly from the global deptQueue so no seat stays empty
         // unnecessarily.
         //
         // SINGLE-DEPT rule: if only one dept is assigned to this hall,
         // leave alternate bench seats empty (no two students from the same
         // exam written side-by-side).
         // ─────────────────────────────────────────────────────────────────────
         const tryPlace = (dId, gridX, gridY, seat, benchPos1Dept) => {
           // Constraint 1: bench-mate
           if (seat > 1 && benchPos1Dept === dId) return false;
           // Constraint 2: left neighbor
           if (gridX > 1 && grid[gridY][gridX - 1] === dId) return false;
           // Constraint 3: top neighbor (vertical adjacency) — NEW
           if (gridY > 1 && grid[gridY - 1][gridX] === dId) return false;
           return true;
         };

         const getStudentFromDept = (dId) => {
           // Try hallBatch first
           const bQueue = hallBatch.get(dId);
           if (bQueue && bQueue.length > 0) return bQueue.shift();
           // Exceptional fill: pull directly from global queue
           if (deptQueues[dId] && deptQueues[dId].length > 0) {
             return deptQueues[dId].shift();
           }
           return null;
         };

         for (let row = 1; row <= hall.rows; row++) {
           for (let col = 1; col <= hall.columns; col++) {
             let benchPos1Dept = null;

             for (let seat = 1; seat <= hall.seatsPerBench; seat++) {
               const gridX = (col - 1) * hall.seatsPerBench + seat;
               const gridY = row;

               // SINGLE-DEPT RULE: leave bench position 2+ empty
               if (singleDept && seat > 1) {
                 grid[gridY][gridX] = '__EMPTY__';
                 continue;
               }

               let placed = false;

               // Try every dept in batchDeptIds; also include any other globally
               // available dept not in the batch (for exceptional fill)
               const globalExtras = shuffledDeptIds.filter(
                 d => !batchDeptIds.includes(d) && deptQueues[d].length > 0
               );
               const candidateDepts = [...batchDeptIds, ...globalExtras];

               for (let attempt = 0; attempt < candidateDepts.length; attempt++) {
                 const dId = candidateDepts[attempt];

                 if (!tryPlace(dId, gridX, gridY, seat, benchPos1Dept)) continue;

                 const roll = getStudentFromDept(dId);
                 if (roll === null) continue;

                 // Register in hallBatch so later seats see this dept is active
                 if (!hallBatch.has(dId)) hallBatch.set(dId, []);

                 grid[gridY][gridX] = dId;
                 if (seat === 1) benchPos1Dept = dId;

                 assignments.push({
                   hallId: hall._id,
                   row,
                   column: col,
                   benchPosition: seat,
                   studentRollNumber: roll,
                   departmentId: dId,
                   examDate,
                   examSession: session,
                   examTime: examSessionDoc.examTime,
                   examSessionId: examSessionDoc._id,
                 });
                 placed = true;
                 break;
               }

               // If STILL no eligible dept found — mark empty rather than violate rules
               if (!placed) {
                 grid[gridY][gridX] = '__EMPTY__';
               }
             }
           }
         }

         // Fill Extra Benches (all three adjacency rules apply)
         if (hall.extraBenches && hall.extraBenches.length > 0) {
           for (const bench of hall.extraBenches) {
             let extraBenchPos1Dept = null;

             for (let seat = 1; seat <= hall.seatsPerBench; seat++) {
               // SINGLE-DEPT RULE: leave position 2+ empty
               if (singleDept && seat > 1) continue;

               let placed = false;
               const globalExtras = shuffledDeptIds.filter(
                 d => !batchDeptIds.includes(d) && deptQueues[d].length > 0
               );
               const candidateDepts = [...batchDeptIds, ...globalExtras];

               for (let attempt = 0; attempt < candidateDepts.length; attempt++) {
                 const dId = candidateDepts[attempt];

                 // Bench-mate constraint (no top/left for extra benches — isolated)
                 if (seat > 1 && extraBenchPos1Dept === dId) continue;

                 const roll = getStudentFromDept(dId);
                 if (roll === null) continue;

                 if (!hallBatch.has(dId)) hallBatch.set(dId, []);
                 if (seat === 1) extraBenchPos1Dept = dId;

                 assignments.push({
                   hallId: hall._id,
                   row: bench.row,
                   column: bench.column,
                   benchPosition: seat,
                   studentRollNumber: roll,
                   departmentId: dId,
                   examDate,
                   examSession: session,
                   examTime: examSessionDoc.examTime,
                   examSessionId: examSessionDoc._id,
                   isExtraBench: true,
                 });
                 placed = true;
                 break;
               }
               // If no student can be placed without violating rules — leave empty
               if (!placed) continue;
             }
           }
         }
       }

       if (assignments.length > 0) {
         await SeatAssignment.insertMany(assignments);
       }

       // ============================================
       // FACULTY ASSIGNMENT — WITH INTERNAL EXAM RULES
       // ============================================
       // Rules:
       // 1. No faculty assigned to two halls in the same session (hard constraint)
       // 2. No department more than 2 faculty in the same hall
       // 3. No consecutive sessions for the same faculty (unless no one else)
       // 4. Max 4 duties per 7-day window per faculty

       const allFacultyForSession = await User.find({ role: 'faculty' }).lean();
       const allDuties = await FacultyDuty.find({}).lean();

       // Shuffle faculty for variety
       const shuffledFaculty = [...allFacultyForSession];
       for (let i = shuffledFaculty.length - 1; i > 0; i--) {
         const j = Math.floor(Math.random() * (i + 1));
         [shuffledFaculty[i], shuffledFaculty[j]] = [shuffledFaculty[j], shuffledFaculty[i]];
       }

       // Track who was assigned in the PREVIOUS session of this exam date (for no-consecutive rule)
       const prevSession = session === 'FN' ? null : 'FN';
       const previouslyAssignedIds = new Set();
       if (prevSession) {
         const prevDuties = allDuties.filter(d => d.examDate === examDate && d.examSession === prevSession);
         prevDuties.forEach(d => previouslyAssignedIds.add(d.facultyId.toString()));
       }

       const isFacultyAvailable = (faculty, hallAssignedIds) => {
         const fId = faculty._id.toString();

         // Rule 1: Not already assigned to this hall
         if (hallAssignedIds.includes(fId)) return false;

         // Rule 2: Max 2 from same department per hall
         const sameDeptCount = hallAssignedIds.filter(id => {
           const f = allFacultyForSession.find(fac => fac._id.toString() === id);
           return f && f.department === faculty.department;
         }).length;
         if (sameDeptCount >= 2) return false;

         const fDuties = allDuties.filter(d => d.facultyId.toString() === fId);

         // Rule 3: Not already assigned to another hall in the same session/date (hard)
         if (fDuties.some(d => d.examDate === examDate && d.examSession === session)) return false;

         // Rule 4: No consecutive session (if assigned in FN, skip AN)
         if (previouslyAssignedIds.has(fId)) return false;

         // Rule 5: Max 4 duties in past 7 days
         const targetDate = new Date(examDate);
         const dutiesThisWeek = fDuties.filter(d => {
           const diffDays = Math.abs(new Date(d.examDate) - targetDate) / (1000 * 60 * 60 * 24);
           return diffDays <= 7;
         });
         if (dutiesThisWeek.length >= 4) return false;

         return true;
       };

       // Only assign faculty to halls that actually received students this session
       const hallsWithStudentsInSession = new Set(assignments.map(a => a.hallId.toString()));

       const globalAssignedInSession = new Set();
       const allocationWarnings = [];

       for (const hall of halls) {
         if (!hallsWithStudentsInSession.has(hall._id.toString())) {
           // Clear stale faculty from any previous generation run
           await Hall.findByIdAndUpdate(hall._id, { facultyAssigned: [] });
           continue; // No students → no faculty needed
         }

         const required = hall.facultyRequired || 1;
         const hallAssignedIds = [];

         for (let i = 0; i < required; i++) {
           let selected = null;
           for (const faculty of shuffledFaculty) {
             const fId = faculty._id.toString();
             if (globalAssignedInSession.has(fId)) continue;
             if (isFacultyAvailable(faculty, hallAssignedIds)) {
               selected = faculty;
               break;
             }
           }

           if (selected) {
             const fId = selected._id.toString();
             hallAssignedIds.push(fId);
             globalAssignedInSession.add(fId);
             // Record as a FacultyDuty so subsequent halls see it
             allDuties.push({
               facultyId: selected._id,
               hallId: hall._id,
               examDate,
               examSession: session
             });
           } else {
             allocationWarnings.push(`Hall ${hall.name}: Cannot find eligible faculty (need ${required}, found ${hallAssignedIds.length})`);
           }
         }

         await Hall.findByIdAndUpdate(hall._id, { facultyAssigned: hallAssignedIds });

         // Persist FacultyDuty records for permanently assigned faculty
         for (const fId of hallAssignedIds) {
           await FacultyDuty.findOneAndUpdate(
             { facultyId: fId, hallId: hall._id, examDate, examSession: session },
             { facultyId: fId, hallId: hall._id, examDate, examSession: session },
             { upsert: true }
           );
         }
       }

       if (allocationWarnings.length > 0) {
         console.warn(`[Internal Seating] Faculty warnings for ${examDate} ${session}:`, allocationWarnings);
         globalAllocationWarnings.push(...allocationWarnings);
       }

       generatedCount++;
    }

    // Build shortage summary for frontend popup
    const hasShortage = globalAllocationWarnings && globalAllocationWarnings.length > 0;
    let facultySuggestions = [];
    if (hasShortage) {
      // Find faculty who are generally eligible (no weekly limit breach, no rules broken)
      const allFacultyInDb = await User.find({ role: 'faculty' }).lean();
      const allExistingDuties = await FacultyDuty.find({}).lean();
      const today = new Date();
      facultySuggestions = allFacultyInDb
        .filter(f => {
          const fDuties = allExistingDuties.filter(d => d.facultyId.toString() === f._id.toString());
          const dutiesThisWeek = fDuties.filter(d => {
            const diffDays = Math.abs(new Date(d.examDate) - today) / (1000 * 60 * 60 * 24);
            return diffDays <= 7;
          });
          return dutiesThisWeek.length < 4;
        })
        .map(f => ({ id: f._id, name: f.name, department: f.department }));
    }

    res.json({
      success: true,
      count: generatedCount,
      skipped: skippedCount,
      shortage: hasShortage,
      allocationWarnings: globalAllocationWarnings || [],
      facultySuggestions
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
