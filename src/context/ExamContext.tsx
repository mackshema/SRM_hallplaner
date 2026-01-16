import React, {
  createContext,
  useContext,
  useState,
  useEffect,
} from "react";

/* -----------------------------
   Context Type
----------------------------- */
type ExamContextType = {
  examDate: string;
  setExamDate: (date: string) => void;

  examTime: string;
  setExamTime: (time: string) => void;

  examSession: "FN" | "AN";
  setExamSession: (s: "FN" | "AN") => void;
};

/* -----------------------------
   Context Creation
----------------------------- */
const ExamContext = createContext<ExamContextType | undefined>(undefined);

/* -----------------------------
   Provider
----------------------------- */
export const ExamProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  /* ---- Persistent State ---- */
  const [examDate, setExamDate] = useState(() => {
    return (
      localStorage.getItem("examDate") ||
      new Date().toISOString().split("T")[0]
    );
  });

  const [examTime, setExamTime] = useState(() => {
    return localStorage.getItem("examTime") || "09:30 AM";
  });

  const [examSession, setExamSession] = useState<"FN" | "AN">(() => {
    return (localStorage.getItem("examSession") as "FN" | "AN") || "FN";
  });

  /* ---- Persist to localStorage ---- */
  useEffect(() => {
    localStorage.setItem("examDate", examDate);
  }, [examDate]);

  useEffect(() => {
    localStorage.setItem("examTime", examTime);
  }, [examTime]);

  useEffect(() => {
    localStorage.setItem("examSession", examSession);
  }, [examSession]);

  /* ---- Provider ---- */
  return (
    <ExamContext.Provider
      value={{
        examDate,
        setExamDate,
        examTime,
        setExamTime,
        examSession,
        setExamSession,
      }}
    >
      {children}
    </ExamContext.Provider>
  );
};

/* -----------------------------
   Hook
----------------------------- */
export const useExam = () => {
  const ctx = useContext(ExamContext);
  if (!ctx) {
    throw new Error("useExam must be used inside ExamProvider");
  }
  return ctx;
};
