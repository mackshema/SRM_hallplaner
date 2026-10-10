import xlsx from 'xlsx';

/**
 * Shared timetable import logic for the Internal and Anna University modules.
 *
 * - Validation runs BEFORE any destructive step, so a bad file never wipes
 *   existing seating plans.
 * - Timetable rows are applied per (subjectCode, department, year), so a subject
 *   code shared by several departments (e.g. MA3354 for CSE and IT) no longer
 *   overwrites itself.
 */

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "FN", "fn", "F.N.", "Forenoon" -> "FN"; "AN", "Afternoon" -> "AN"; anything else -> null */
export const normalizeSession = (value) => {
  const s = String(value ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  if (s === 'FN' || s === 'FORENOON') return 'FN';
  if (s === 'AN' || s === 'AFTERNOON') return 'AN';
  return null;
};

/** Excel serial date (e.g. 46300) -> "YYYY-MM-DD"; strings are trimmed. */
const normalizeDate = (value) => {
  if (typeof value === 'number') {
    const parsed = new Date(Math.round((value - 25569) * 86400 * 1000));
    return parsed.toISOString().split('T')[0];
  }
  return String(value ?? '').trim();
};

/** Maps a spreadsheet row (any supported header spelling) to a timetable entry. */
export const timetableEntryFromRow = (row) => ({
  subjectCode: row['Subject Code'] || row['subjectCode'],
  examDate: row['Date'] || row['date'] || row['examDate'],
  session: row['Session'] || row['session'],
  department: row['Department'] || row['department'],
  year: row['Year'] || row['year'] || row['Degree'] || row['degree'],
});

/**
 * Parses an entire Excel workbook containing either:
 * 1) Matrix timetable format (e.g. IAT - I Schedule prototype with Dept/Year rows and Date columns)
 * 2) Tabular format (Subject Code, Date, Session, Department, Year)
 */
export const parseWorkbookTimetable = (workbook) => {
  const matrixEntries = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (!rawRows || rawRows.length === 0) continue;

    let globalSession = 'FN';
    let headerRowIdx = -1;
    let deptColIdx = 0;
    let yearColIdx = 1;
    const dateCols = [];

    // 1. Scan for session and table header
    for (let r = 0; r < Math.min(rawRows.length, 15); r++) {
      const row = rawRows[r];
      if (!Array.isArray(row)) continue;
      const rowText = row.join(' ');
      if (rowText.toUpperCase().includes('SESSION') || rowText.toUpperCase().includes('FORENOON') || rowText.toUpperCase().includes('AFTERNOON')) {
        const parsedSess = normalizeSession(rowText);
        if (parsedSess) globalSession = parsedSess;
      }

      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c] || '').trim().toLowerCase();
        if (cell.includes('department') || cell.includes('dept') || cell.includes('branch') || cell.includes('date / department')) {
          headerRowIdx = r;
          deptColIdx = c;
          break;
        }
      }
      if (headerRowIdx !== -1) break;
    }

    if (headerRowIdx !== -1) {
      const headerRow = rawRows[headerRowIdx];
      // Find Year col
      for (let c = 0; c < headerRow.length; c++) {
        const cell = String(headerRow[c] || '').trim().toLowerCase();
        if (c !== deptColIdx && (cell.includes('year') || cell.includes('degree') || cell.includes('sem'))) {
          yearColIdx = c;
          break;
        }
      }

      // Identify Date columns
      for (let c = 0; c < headerRow.length; c++) {
        if (c === deptColIdx || c === yearColIdx) continue;
        const cellVal = headerRow[c];
        if (cellVal !== undefined && cellVal !== '' && cellVal !== null) {
          const dateStr = normalizeDate(cellVal);
          if (dateStr && dateStr.length >= 8) {
            dateCols.push({ colIdx: c, date: dateStr });
          }
        }
      }

      if (dateCols.length > 0) {
        // Parse matrix rows
        for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
          const row = rawRows[r];
          if (!row || !Array.isArray(row) || row.length === 0) continue;
          const deptVal = String(row[deptColIdx] || '').trim();
          if (!deptVal) continue;
          
          const rowUpper = row.join(' ').toUpperCase();
          if (rowUpper.includes('COORDINATOR') || rowUpper.includes('PRINCIPAL') || rowUpper.includes('COPY TO') || rowUpper.includes('NOTICE')) {
            continue;
          }

          const yearVal = String(row[yearColIdx] || '').trim();

          dateCols.forEach(({ colIdx, date }) => {
            const subjectCode = String(row[colIdx] || '').trim();
            if (subjectCode && subjectCode !== '-' && subjectCode !== '--' && subjectCode.toUpperCase() !== 'N/A' && subjectCode.toUpperCase() !== 'NIL') {
              matrixEntries.push({
                subjectCode: subjectCode.toUpperCase(),
                department: deptVal,
                year: yearVal,
                examDate: date,
                session: globalSession
              });
            }
          });
        }
      }
    }
  }

  if (matrixEntries.length > 0) {
    return matrixEntries;
  }

  // Fallback to tabular sheet_to_json across sheets
  const tabularEntries = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);
    if (data && data.length > 0) {
      tabularEntries.push(...data.map(timetableEntryFromRow));
    }
  }
  return tabularEntries;
};

/**
 * Validates and normalizes timetable entries.
 * `firstRowNumber` is the label of entries[0] in error messages
 * (2 for a spreadsheet whose row 1 is the header).
 * Returns { updates, errors }. Completely blank rows are ignored.
 */
export const validateTimetable = (entries, firstRowNumber = 1) => {
  const updates = [];
  const errors = [];
  const seen = new Map();

  entries.forEach((entry, i) => {
    const rowNo = firstRowNumber + i;
    const subjectCode = String(entry.subjectCode ?? '').trim();
    const examDate = normalizeDate(entry.examDate);
    const rawSession = String(entry.session ?? '').trim();

    if (!subjectCode && !examDate && !rawSession) return; // blank row

    const problems = [];
    if (!subjectCode) problems.push('missing Subject Code');
    if (!examDate) problems.push('missing Date');
    const session = normalizeSession(rawSession);
    if (!rawSession) problems.push('missing Session');
    else if (!session) problems.push(`invalid Session "${rawSession}" (use FN or AN)`);

    if (problems.length) {
      errors.push({ row: rowNo, subjectCode, message: problems.join(', ') });
      return;
    }

    const department = entry.department ? String(entry.department).trim() : null;
    const year = entry.year ? String(entry.year).trim() : '';

    const key = `${subjectCode.toUpperCase()}|${department || ''}|${year}`;
    const previous = seen.get(key);
    if (previous) {
      if (previous.examDate !== examDate || previous.session !== session) {
        errors.push({
          row: rowNo,
          subjectCode,
          message: `conflicts with row ${previous.rowNo} (same subject, department and year on a different date/session)`,
        });
      }
      return; // exact duplicate: keep the first
    }
    seen.set(key, { rowNo, examDate, session });
    updates.push({ subjectCode, examDate, session, department, year });
  });

  return { updates, errors };
};

/**
 * Parses OCR / pasted text lines like "CS101 2024-05-15 FN Computer Science".
 * Lines whose third token doesn't contain FN or AN are ignored.
 */
export const parseRawTimetableLines = (textData) => {
  const updates = [];
  for (const line of textData.split('\n')) {
    const parts = line.split(/\s+/).filter(Boolean);
    if (parts.length < 3) continue;
    const [subjectCode, examDate, rawSession] = parts;
    if (!rawSession.includes('FN') && !rawSession.includes('AN')) continue;
    updates.push({
      subjectCode,
      examDate,
      session: rawSession.includes('FN') ? 'FN' : 'AN',
      department: parts.slice(3).join(' ') || null,
      year: '',
    });
  }
  return updates;
};

/** One-line summary suitable for a toast, plus the full list for API clients. */
export const timetableErrorResponse = (errors) => {
  const shown = errors.slice(0, 5).map((e) => `Row ${e.row}${e.subjectCode ? ` (${e.subjectCode})` : ''}: ${e.message}`);
  const more = errors.length > 5 ? ` …and ${errors.length - 5} more.` : '';
  return {
    error: `Timetable not uploaded - fix these rows and try again. ${shown.join('; ')}.${more} No existing data was changed.`,
    rowErrors: errors,
  };
};

/**
 * Writes validated timetable entries into an exam-data collection
 * (InternalExamData or AnnaExamData). Callers must clear existing dates first.
 *
 * - Department-level mapping: one row per (subjectCode, department, year) with no
 *   rollNumber; this is what seats a whole class.
 * - Per-student rows (manual maps, Anna arrear registrations) only receive the
 *   date/session - their department is the student's own and is never overwritten.
 *   They take the date of the same department's row first, otherwise the first
 *   row for that subject code.
 */
export const applyTimetable = async (Model, updates, { caseInsensitive = false } = {}) => {
  const codeFilter = (code) =>
    caseInsensitive ? { $regex: new RegExp(`^${escapeRegex(code)}$`, 'i') } : code;
  const noRoll = { rollNumber: { $in: [null, ''] } };
  const hasRoll = { rollNumber: { $nin: [null, ''] } };

  for (const u of updates) {
    const department = u.department || 'Unknown';
    await Model.updateMany(
      { subjectCode: codeFilter(u.subjectCode), department, year: u.year || { $in: [null, ''] }, ...noRoll },
      { $set: { subjectCode: u.subjectCode, examDate: u.examDate, session: u.session, department, year: u.year || '' } },
      { upsert: true }
    );
    if (u.department) {
      await Model.updateMany(
        { subjectCode: codeFilter(u.subjectCode), department: u.department, examDate: '', ...hasRoll },
        { $set: { examDate: u.examDate, session: u.session } }
      );
    }
  }

  // Students registered for a subject their department has no timetable row for
  for (const u of updates) {
    await Model.updateMany(
      { subjectCode: codeFilter(u.subjectCode), examDate: '', ...hasRoll },
      { $set: { examDate: u.examDate, session: u.session } }
    );
  }

  return updates.length;
};
