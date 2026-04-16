
// Simulating database operations with Backend API
// No localStorage logic allowed for persistence

export interface User {
  id?: number;
  _id?: string;
  name: string;
  username: string;
  password?: string;
  role: 'admin' | 'faculty';
  department?: string;
  designation?: string;
  facultyEmail?: string;
  hodEmail?: string;
  isSelected?: boolean;
  isSelectedForGeneration?: boolean;
}

export interface Department {
  id?: number;
  _id?: string;
  name: string;
  rollNumberStart: string;
  rollNumberEnd: string;
  isSelected?: boolean;
}

export interface Hall {
  _id: string; // MongoDB ObjectId
  name: string;
  rows: number;
  columns: number;
  seatsPerBench: number;
  extraBenches?: {
    id: string;
    row: number;
    column: number;
    offsetX?: number;
    offsetY?: number;
  }[];

  floor?: string;
  facultyAssigned?: string[];
  facultyRequired?: number; // New Field

  examDate?: string;
  examSession?: "FN" | "AN";
  examTime?: string;
  isSelected?: boolean;
}


export interface SeatAssignment {
  hallId: string;
  row: number;
  column: number;
  benchPosition: number;
  studentRollNumber: string;
  departmentId: number | string; // Can be string ID from MongoDB
  isExtraBench?: boolean;
  examDate?: string;
  examSession?: string;
  examTime?: string;
}

export interface ExamSession {
  _id: string;
  examDate: string;
  examSession: "FN" | "AN";
  examTime: string;
  status: "DRAFT" | "FINAL";
  finalizedAt?: string;
  isPublished?: boolean;
  activeHalls?: string[];
  activeDepartments?: string[];
  selectedFaculty?: string[];
  blockedCombinations?: string[][];
}

class DatabaseService {
  private apiUrl = "http://localhost:5000/api";

  constructor() { }

  // ------------------------------------------------------------------
  // EXAM SESSIONS
  // ------------------------------------------------------------------

  async getExamSessions(): Promise<ExamSession[]> {
    try {
      const res = await fetch(`${this.apiUrl}/exam-sessions`);
      return res.ok ? await res.json() : [];
    } catch {
      return [];
    }
  }

  async createExamSession(data: {
    examDate: string;
    examSession: "FN" | "AN";
    examTime: string;
  }): Promise<ExamSession> {
    const res = await fetch(`${this.apiUrl}/exam-sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to create exam session");
    }
    return await res.json();
  }

  async finalizeExamSession(id: string): Promise<ExamSession> {
    const res = await fetch(`${this.apiUrl}/seating/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ examSessionId: id })
    });
    if (!res.ok) throw new Error("Failed to finalize exam session");
    return await res.json();
  }

  async unfinalizeExamSession(id: string): Promise<ExamSession> {
    const res = await fetch(`${this.apiUrl}/exam-sessions/${id}/unfinalize`, {
      method: "PUT",
    });
    if (!res.ok) throw new Error("Failed to unfinalize exam session");
    return await res.json();
  }

  async deleteExamSession(id: string): Promise<void> {
    const res = await fetch(`${this.apiUrl}/exam-sessions/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete exam session");
  }

  async updateExamSession(id: string, data: Partial<ExamSession>): Promise<ExamSession> {
    const res = await fetch(`${this.apiUrl}/exam-sessions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Failed to update exam session" }));
      throw new Error(err.message || err.error || "Failed to update exam session");
    }
    return await res.json();
  }

  // ------------------------------------------------------------------
  // AUTH & USERS
  // ------------------------------------------------------------------

  async getUserByCredentials(username: string, password: string): Promise<User | null> {
    try {
      const res = await fetch(`${this.apiUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      if (res.ok) {
        return await res.json();
      }

      const users = await this.getAllUsers();
      return users.find(u => u.username === username && u.password === password) || null;
    } catch (e) {
      console.error("Login error:", e);
      return null;
    }
  }

  async getAllUsers(): Promise<User[]> {
    try {
      const res = await fetch(`${this.apiUrl}/users`);
      return res.ok ? await res.json() : [];
    } catch {
      return [];
    }
  }

  async getUserById(id: number | string): Promise<User | null> {
    try {
      const users = await this.getAllUsers();
      return users.find(u => u.id === id || u._id === id) || null;
    } catch {
      return null;
    }
  }

  async getAllFaculty(): Promise<User[]> {
    try {
      const users = await this.getAllUsers();
      return users.filter(u => u.role === 'faculty');
    } catch {
      return [];
    }
  }

  async addFaculty(faculty: Omit<User, 'id' | '_id'>): Promise<User> {
    const res = await fetch(`${this.apiUrl}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...faculty, role: 'faculty' })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Failed to add faculty" }));
      throw new Error(err.message || "Failed to add faculty");
    }
    return await res.json();
  }

  async deleteFaculty(id: number | string): Promise<boolean> {
    const res = await fetch(`${this.apiUrl}/users/${id}`, { method: "DELETE" });
    return res.ok;
  }

  async updateFaculty(id: number | string, data: Partial<User>): Promise<User> {
    const res = await fetch(`${this.apiUrl}/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error("Failed to update faculty");
    return await res.json();
  }

  async getFacultyAssignedHalls(facultyId: number | string) {
    try {
      const res = await fetch(`${this.apiUrl}/seating/faculty/${facultyId}`);
      if (!res.ok) {
        return [];
      }
      const summary = await res.json();

      return summary.map((s: any) => ({
        _id: s.hallId,
        name: s.hallName,
        floor: s.floor,
        examDate: s.examDate,
        examSession: s.examSession,
        examTime: s.examTime,
      }));
    } catch (error) {
      console.error("Error fetching faculty assigned halls:", error);
      return [];
    }
  }

  // ------------------------------------------------------------------
  // DEPARTMENTS — removed; departments are now derived from student data
  // These stubs are kept for backward compatibility with any unused references
  // ------------------------------------------------------------------

  async getAllDepartments(examSessionId?: string): Promise<Department[]> {
    return []; // No longer using a Department collection
  }

  async addDepartment(department: Omit<Department, 'id' | '_id'>): Promise<Department> {
    throw new Error("Department collection removed. Departments are now derived from student records.");
  }

  async createDepartment(data: any): Promise<Department> {
    throw new Error("Department collection removed.");
  }

  async updateDepartment(id: number | string, data: Partial<Department>): Promise<Department> {
    throw new Error("Department collection removed.");
  }

  async deleteDepartment(id: number | string): Promise<boolean> {
    return false; // No-op
  }

  // ------------------------------------------------------------------
  // HALLS
  // ------------------------------------------------------------------

  async getAllHalls(): Promise<Hall[]> {
    try {
      const res = await fetch(`${this.apiUrl}/halls`);
      return await res.json();
    } catch {
      return [];
    }
  }

  async deleteHall(id: string): Promise<boolean> {
    const res = await fetch(`${this.apiUrl}/halls/${id}`, { method: "DELETE" });
    return res.ok;
  }

  // ------------------------------------------------------------------
  // Mack core
  // ------------------------------------------------------------------

  async saveHallSeatAssignments(assignments: SeatAssignment[]): Promise<void> {
    const hallId = assignments[0]?.hallId;
    if (!hallId) return;

    await fetch(`${this.apiUrl}/seating/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hallId,
        assignments
      })
    });
  }

  async getHallSeatAssignments(hallId: string): Promise<SeatAssignment[]> {
    const res = await fetch(`${this.apiUrl}/seating/hall/${hallId}`);
    if (res.ok) {
      const data = await res.json();
      return data.assignments || [];
    }
    return [];
  }

  async generateAllSeatingPlans(
    examSessionId: string,
    skipRollNumbers: string[] = [],
    manualRollNumbers: string[] = [],
    demandFacultyIds: string[] = []
  ): Promise<{ success: boolean; unallocated: string[]; allocationResult?: any }> {
    try {
      // Backend now derives departments dynamically from student database
      const res = await fetch(`${this.apiUrl}/seating/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examSessionId,
          departments: [], // Backend ignores this now — uses student DB directly
          skipRollNumbers,
          manualRollNumbers,
          demandFacultyIds
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Failed to generate seating plans" }));
        console.error("Generate seating plans error:", errorData);
        throw new Error(errorData.message || "Failed to generate seating plans");
      }

      const data = await res.json();
      return {
        success: data.success || false,
        unallocated: data.unallocated || [],
        allocationResult: data.allocationResult
      };
    } catch (error) {
      console.error("Error generating plans:", error);
      throw error;
    }
  }

  async getAllSeatAssignments(examSessionId?: string): Promise<SeatAssignment[]> {
    try {
      const url = examSessionId
        ? `${this.apiUrl}/seating/all?examSessionId=${examSessionId}`
        : `${this.apiUrl}/seating/all`;

      const res = await fetch(url);
      if (!res.ok) {
        return [];
      }
      const data = await res.json();
      return data.assignments || [];
    } catch {
      return [];
    }
  }

  async updateHallFaculty(hallId: string, facultyIds: string[]): Promise<void> {
    const res = await fetch(`${this.apiUrl}/halls/${hallId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ facultyAssigned: facultyIds })
    });
    if (!res.ok) throw new Error("Failed to update hall faculty");
  }
}

export const db = new DatabaseService();
