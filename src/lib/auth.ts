
import { db } from './db';

export interface User {
  id: number;
  name: string;
  username: string;
  role: 'admin' | 'faculty';
}

// Store the current user in memory
let currentUser: User | null = null;

export async function loginUser(username: string, password: string): Promise<User | null> {
  try {
    // In a real application, this would be a database query with password hashing
    // For this demo, we'll simulate a database lookup
    const user = await db.getUserByCredentials(username, password);
    
    if (user) {
      // Store the user in memory/session
      currentUser = user;
      localStorage.setItem('currentUser', JSON.stringify(user));
      return user;
    }
    
    return null;
  } catch (error) {
    console.error("Login error:", error);
    throw new Error("Authentication failed");
  }
}

export function getCurrentUser(): User | null {
  if (currentUser) return currentUser;
  
  // Try to get from localStorage
  const storedUser = localStorage.getItem('currentUser');
  if (storedUser) {
    currentUser = JSON.parse(storedUser);
    return currentUser;
  }
  
  return null;
}

export function logout(): void {
  currentUser = null;
  localStorage.removeItem('currentUser');
}

export function isAuthenticated(): boolean {
  return getCurrentUser() !== null;
}

export function isAdmin(): boolean {
  const user = getCurrentUser();
  return user !== null && user.role === 'admin';
}

export function isFaculty(): boolean {
  const user = getCurrentUser();
  return user !== null && user.role === 'faculty';
}
