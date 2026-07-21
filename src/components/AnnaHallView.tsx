import React, { useEffect, useState } from "react";
import { Hall } from "@/lib/db";

interface AnnaHallViewProps {
  hallId: string;
  assignments: any[];
  facultyNames?: string[];
}

const AnnaHallView = ({ hallId, assignments, facultyNames }: AnnaHallViewProps) => {
  const [hall, setHall] = useState<Hall | null>(null);

  useEffect(() => {
    fetch(`http://localhost:5000/api/halls/${hallId}`)
      .then(res => res.json())
      .then(data => setHall(data))
      .catch(console.error);
  }, [hallId]);

  if (!hall) return <div className="p-8 text-center text-slate-500 animate-pulse">Loading hall configuration...</div>;

  const seats: any[][] = Array.from({ length: hall.rows }, () =>
    Array(hall.columns * hall.seatsPerBench).fill(null)
  );

  assignments.forEach((a) => {
    const r = a.row - 1;
    const c = (a.column - 1) * hall.seatsPerBench + (a.benchPosition - 1);
    if (seats[r] && seats[r][c] !== undefined) {
      seats[r][c] = {
        rollNumber: a.rollNumber,
        subjectCode: a.subjectCode,
        department: a.department,
      };
    }
  });

  return (
    <div className="overflow-x-auto border border-slate-200 rounded-xl bg-slate-50/50 p-6 min-w-full shadow-inner max-h-[70vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-8 border-b pb-4">
        <div>
           <h3 className="font-bold text-2xl text-slate-800">{hall.name} - View Layout</h3>
           <p className="text-slate-500 text-sm mt-1">Official Anna University Seating Configuration</p>
           {facultyNames && facultyNames.length > 0 && (
             <p className="text-indigo-700 font-semibold text-sm mt-2">
               Assigned Invigilator(s): {facultyNames.join(", ")}
             </p>
           )}
        </div>
        <div className="bg-white border rounded-lg px-4 py-2 text-right shadow-sm">
           <p className="font-semibold text-slate-700 whitespace-nowrap">{hall.rows} Rows × {hall.columns} Columns</p>
           <p className="text-xs text-slate-500">({hall.seatsPerBench} candidates per bench)</p>
        </div>
      </div>

      <div className="grid gap-x-8 gap-y-10" style={{ gridTemplateColumns: `repeat(${hall.columns}, minmax(140px, 1fr))` }}>
        {Array.from({ length: hall.rows }).map((_, rowIndex) => (
          <React.Fragment key={rowIndex}>
            {Array.from({ length: hall.columns }).map((_, colIndex) => {
              const benchStart = colIndex * hall.seatsPerBench;
              return (
                <div key={`${rowIndex}-${colIndex}`} className="relative border border-slate-200 rounded-xl p-3 bg-white shadow-sm w-full flex flex-col items-center hover:shadow-md transition-shadow">
                  <div className="absolute -top-3 bg-slate-100 border text-slate-500 px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-widest shadow-sm">
                    R{rowIndex + 1} - C{colIndex + 1}
                  </div>
                  <div className="w-full space-y-2 mt-2">
                    {Array.from({ length: hall.seatsPerBench }).map((_, seatIndex) => {
                      const idx = benchStart + seatIndex;
                      const seat = seats[rowIndex]?.[idx];
                      return (
                        <div key={seatIndex} className={`w-full p-2.5 text-center text-xs rounded-lg border ${seat ? 'bg-indigo-50/30 border-indigo-200/60' : 'bg-slate-50/50 border-dashed border-slate-200'}`}>
                          {seat ? (
                            <div className="flex flex-col gap-1">
                              <span className="font-bold text-indigo-900 tracking-wide text-sm">{seat.rollNumber}</span>
                              <span className="text-[10.5px] text-indigo-600/80 font-medium leading-tight truncate px-1" title={seat.subjectCode}>
                                {seat.subjectCode}
                              </span>
                            </div>
                          ) : <span className="text-slate-400 italic block py-2">Unoccupied</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
export default AnnaHallView;
