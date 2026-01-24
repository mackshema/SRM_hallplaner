
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
}

export interface Department {
  id?: number;
  _id?: string;
  name: string;
  rollNumberStart: string;
  rollNumberEnd: string;
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

  examDate?: string;
  examSession?: "FN" | "AN";
  examTime?: string;
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

class DatabaseService {
  private apiUrl = "http://localhost:5000/api";

  constructor() { }

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
    if (!res.ok) throw new Error("Failed to add faculty");
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
  // DEPARTMENTS
  // ------------------------------------------------------------------

  async getAllDepartments(): Promise<Department[]> {
    try {
      const res = await fetch(`${this.apiUrl}/departments`);
      return res.ok ? await res.json() : [];
    } catch {
      return [];
    }
  }

  async addDepartment(department: Omit<Department, 'id' | '_id'>): Promise<Department> {
    return this.createDepartment(department);
  }

  async createDepartment(data: {
    name: string;
    rollNumberStart: string;
    rollNumberEnd: string;
  }): Promise<Department> {
    const res = await fetch(`${this.apiUrl}/departments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error("Failed to create department");
    return await res.json();
  }

  async updateDepartment(
    id: number | string,
    data: Partial<Department>
  ): Promise<Department> {
    const res = await fetch(`${this.apiUrl}/departments/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error("Failed to update department");
    return await res.json();
  }

  async deleteDepartment(id: number | string): Promise<boolean> {
    const res = await fetch(`${this.apiUrl}/departments/${id}`, { method: "DELETE" });
    return res.ok;
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
    examDate?: string,
    examSession?: string,
    examTime?: string,
    skipRollNumbers: string[] = [],
    manualRollNumbers: string[] = []
  ): Promise<{ success: boolean; unallocated: string[] }> {
    try {
      const departments = await this.getAllDepartments();

      const res = await fetch(`${this.apiUrl}/seating/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examDate,
          examSession,
          examTime,
          departments: departments.map(dept => ({
            name: dept.name,
            rollNumberStart: dept.rollNumberStart,
            rollNumberEnd: dept.rollNumberEnd
          })),
          skipRollNumbers,
          manualRollNumbers
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Failed to generate seating plans" }));
        console.error("Generate seating plans error:", errorData);
        return { success: false, unallocated: [] };
      }

      const data = await res.json();
      return {
        success: data.success || false,
        unallocated: data.unallocated || []
      };
    } catch (error) {
      console.error("Error generating plans:", error);
      return { success: false, unallocated: [] };
    }
  }

  async getAllSeatAssignments(): Promise<SeatAssignment[]> {
    try {
      const res = await fetch(`${this.apiUrl}/seating/all`);
      if (!res.ok) {
        return [];
      }
      const data = await res.json();
      return data.assignments || [];
    } catch {
      return [];
    }
  }
}

export const db = new DatabaseService();
