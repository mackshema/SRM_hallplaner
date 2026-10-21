import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Pure simulation of the column-first internal seating placement logic.
 */
function placeInternalSeats({ hall, deptQueuesInput, batchDeptIds }) {
  const deptQueues = {};
  for (const [k, v] of Object.entries(deptQueuesInput)) {
    deptQueues[k] = [...v];
  }

  const singleDept = batchDeptIds.length === 1;
  const grid = Array(hall.rows + 1).fill(null).map(() => Array(hall.columns * hall.seatsPerBench + 1).fill(null));
  const assignments = [];

  const tryPlace = (dId, gridX, gridY, seat) => {
    if (seat > 1) {
      const benchMateDept = grid[gridY][(Math.floor((gridX - 1) / hall.seatsPerBench)) * hall.seatsPerBench + 1];
      if (benchMateDept && benchMateDept !== '__EMPTY__' && benchMateDept === dId) return false;
    }
    if (gridX > 1 && grid[gridY][gridX - 1] === dId) return false;
    if (gridX < hall.columns * hall.seatsPerBench && grid[gridY][gridX + 1] === dId) return false;
    return true;
  };

  const getStudentFromDept = (dId) => {
    if (deptQueues[dId] && deptQueues[dId].length > 0) return deptQueues[dId].shift();
    return null;
  };

  for (let col = 1; col <= hall.columns; col++) {
    for (let seat = 1; seat <= hall.seatsPerBench; seat++) {
      const gridX = (col - 1) * hall.seatsPerBench + seat;

      if (singleDept && seat > 1) {
        for (let row = 1; row <= hall.rows; row++) {
          grid[row][gridX] = '__EMPTY__';
        }
        continue;
      }

      const candidateDepts = [...batchDeptIds];

      let chosenDept = null;
      for (const dId of candidateDepts) {
        const hasStudents = deptQueues[dId]?.length > 0;
        if (!hasStudents) continue;
        if (seat > 1) {
          const benchMate = grid[1][(col - 1) * hall.seatsPerBench + 1];
          if (benchMate && benchMate !== '__EMPTY__' && benchMate === dId) continue;
        }
        if (gridX > 1) {
          const leftDept = grid[1][gridX - 1];
          if (leftDept && leftDept !== '__EMPTY__' && leftDept === dId) continue;
        }
        chosenDept = dId;
        break;
      }

      for (let row = 1; row <= hall.rows; row++) {
        let placed = false;
        const deptsToTry = chosenDept
          ? [chosenDept, ...candidateDepts.filter(d => d !== chosenDept)]
          : candidateDepts;

        for (let i = 0; i < deptsToTry.length; i++) {
          const dId = deptsToTry[i];
          if (!tryPlace(dId, gridX, row, seat)) continue;
          const roll = getStudentFromDept(dId);
          if (roll === null) continue;
          grid[row][gridX] = dId;
          assignments.push({
            row,
            column: col,
            benchPosition: seat,
            gridX,
            studentRollNumber: roll,
            departmentId: dId,
          });
          placed = true;
          break;
        }
        if (!placed) grid[row][gridX] = '__EMPTY__';
      }
    }
  }

  return { assignments, grid };
}

/** Font determination helper */
function getFontStyle(departmentId, uniqueDepartments) {
  if (uniqueDepartments.length <= 1) {
    return { bold: true, italic: false };
  }
  const idx = uniqueDepartments.indexOf(departmentId);
  return {
    bold: idx === -1 || idx % 2 === 0,
    italic: idx !== -1 && idx % 2 === 1,
  };
}

test("Internal seating: single department seats straight down columns, seat 1 only, all bold", () => {
  const hall = { rows: 5, columns: 3, seatsPerBench: 2 };
  const deptQueues = {
    CSE: Array.from({ length: 15 }, (_, i) => `CSE${100 + i}`),
  };
  const { assignments, grid } = placeInternalSeats({
    hall,
    deptQueuesInput: deptQueues,
    batchDeptIds: ["CSE"],
  });

  // Exactly 15 seats filled in 3 columns * 5 rows on seat 1
  assert.equal(assignments.length, 15);

  // Every assignment is seat 1
  for (const a of assignments) {
    assert.equal(a.benchPosition, 1, `Seat position should be 1 but got ${a.benchPosition}`);
    assert.equal(a.departmentId, "CSE");
  }

  // Seat 2 of each bench is EMPTY
  for (let r = 1; r <= hall.rows; r++) {
    for (let c = 1; c <= hall.columns; c++) {
      const gridXSeat2 = (c - 1) * hall.seatsPerBench + 2;
      assert.equal(grid[r][gridXSeat2], '__EMPTY__');
    }
  }

  // All students have BOLD formatting and NO italics
  const uniqueDepts = ["CSE"];
  for (const a of assignments) {
    const style = getFontStyle(a.departmentId, uniqueDepts);
    assert.equal(style.bold, true);
    assert.equal(style.italic, false);
  }
});

test("Internal seating: two departments sit behind each other down columns, alternate horizontally, bold vs italic", () => {
  const hall = { rows: 4, columns: 2, seatsPerBench: 2 }; // 4 rows, 2 benches = 4 seat columns, 16 seats total
  const deptQueues = {
    CSE: Array.from({ length: 8 }, (_, i) => `CSE${100 + i}`),
    ECE: Array.from({ length: 8 }, (_, i) => `ECE${100 + i}`),
  };
  const { assignments, grid } = placeInternalSeats({
    hall,
    deptQueuesInput: deptQueues,
    batchDeptIds: ["CSE", "ECE"],
  });

  assert.equal(assignments.length, 16);

  // Check column-wise straight seating:
  // Column 1 Seat 1 (gridX=1): all CSE
  for (let r = 1; r <= 4; r++) {
    assert.equal(grid[r][1], "CSE", `Row ${r} Col 1 Seat 1 should be CSE`);
  }
  // Column 1 Seat 2 (gridX=2): all ECE
  for (let r = 1; r <= 4; r++) {
    assert.equal(grid[r][2], "ECE", `Row ${r} Col 1 Seat 2 should be ECE`);
  }
  // Column 2 Seat 1 (gridX=3): all CSE
  for (let r = 1; r <= 4; r++) {
    assert.equal(grid[r][3], "CSE", `Row ${r} Col 2 Seat 1 should be CSE`);
  }
  // Column 2 Seat 2 (gridX=4): all ECE
  for (let r = 1; r <= 4; r++) {
    assert.equal(grid[r][4], "ECE", `Row ${r} Col 2 Seat 2 should be ECE`);
  }

  // Check that horizontal neighbors never match
  for (let r = 1; r <= hall.rows; r++) {
    for (let x = 1; x < hall.columns * hall.seatsPerBench; x++) {
      assert.notEqual(grid[r][x], grid[r][x + 1], `Horizontal adjacency violation at row ${r}, col ${x}`);
    }
  }

  // Check font formatting:
  const uniqueDepts = ["CSE", "ECE"];
  const cseStyle = getFontStyle("CSE", uniqueDepts);
  const eceStyle = getFontStyle("ECE", uniqueDepts);
  assert.equal(cseStyle.bold, true);
  assert.equal(cseStyle.italic, false);
  assert.equal(eceStyle.bold, false);
  assert.equal(eceStyle.italic, true);
});

test("Internal seating: three departments font formatting and horizontal separation", () => {
  const hall = { rows: 3, columns: 3, seatsPerBench: 2 };
  const deptQueues = {
    CSE: Array.from({ length: 6 }, (_, i) => `CSE${100 + i}`),
    ECE: Array.from({ length: 6 }, (_, i) => `ECE${100 + i}`),
    MECH: Array.from({ length: 6 }, (_, i) => `MECH${100 + i}`),
  };
  const { assignments, grid } = placeInternalSeats({
    hall,
    deptQueuesInput: deptQueues,
    batchDeptIds: ["CSE", "ECE", "MECH"],
  });

  // Verify horizontal neighbors never match
  for (let r = 1; r <= hall.rows; r++) {
    for (let x = 1; x < hall.columns * hall.seatsPerBench; x++) {
      if (grid[r][x] && grid[r][x + 1] && grid[r][x] !== '__EMPTY__' && grid[r][x + 1] !== '__EMPTY__') {
        assert.notEqual(grid[r][x], grid[r][x + 1]);
      }
    }
  }

  // Verify font differentiation: Dept 0=bold, Dept 1=italic, Dept 2=bold
  const uniqueDepts = ["CSE", "ECE", "MECH"];
  assert.deepEqual(getFontStyle("CSE", uniqueDepts), { bold: true, italic: false });
  assert.deepEqual(getFontStyle("ECE", uniqueDepts), { bold: false, italic: true });
  assert.deepEqual(getFontStyle("MECH", uniqueDepts), { bold: true, italic: false });
});
