import mongoose from "mongoose";

/**
 * Small, idempotent schema fixes applied on every startup.
 */
export const runMigrations = async () => {
  // InternalExamData used to have a UNIQUE index on
  // {subjectCode, department, examDate, session}. It blocked mapping more than
  // one student from the same department to a subject (manual map by roll number).
  try {
    const collection = mongoose.connection.collection("internalexamdatas");
    const indexes = await collection.indexes();
    const legacy = indexes.find(
      (i) => i.name === "subjectCode_1_department_1_examDate_1_session_1" && i.unique
    );
    if (legacy) {
      await collection.dropIndex(legacy.name);
      console.log("[MIGRATION] Dropped legacy unique index on InternalExamData");
    }
  } catch (err) {
    // Collection doesn't exist yet on a fresh database - nothing to migrate
    if (err.codeName !== "NamespaceNotFound") {
      console.warn("[MIGRATION] InternalExamData index check failed:", err.message);
    }
  }
};
