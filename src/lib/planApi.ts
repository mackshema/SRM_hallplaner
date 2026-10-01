import { API_URL } from "@/lib/api";

/**
 * Client for the plan-level API shared by Internal and Anna University plans
 * (/api/plans/:planType/:planId/...), exam schedules and exports.
 */

export type PlanType = "internal" | "anna";
export type PlanStatus = "DRAFT" | "FINAL" | "SCHEDULED" | "PUBLISHED";

export interface Vacancy {
  hallId: string;
  hallName: string;
  required: number;
  assigned: number;
  missing: number;
}

export interface PlanVacancies {
  planType: PlanType;
  planId: string;
  examDate: string;
  session: string;
  vacancies: Vacancy[];
}

export interface StaffingState {
  halls: { hallId: string; hallName: string; floor: string; required: number; assigned: string[] }[];
  totalRequired: number;
  quota: number;
  deptUsage: Record<string, number>;
  vacancies: Vacancy[];
  message: string | null;
  warnings?: string[];
  filled?: number;
}

export interface PickerFaculty {
  _id: string;
  name: string;
  username: string;
  department: string;
  designation: string;
  dutyCount: number;
  conflict: string | null;
  warnings: string[];
}

export interface ExamScheduleItem {
  _id: string;
  name: string;
  category: string;
  academicYear: string;
  semester: string;
  isComplete: boolean;
  totalPlans: number;
  publishedPlans: number;
  plans: { planType: PlanType; planId: string; examDate: string; session: string; status: PlanStatus; publish_at: string | null; published: boolean }[];
  summaryGeneratedAt: string | null;
}

export interface ExportConfig {
  legacyWord: boolean;
  planDocuments: { key: string; title: string }[];
  scheduleDocuments: { key: string; title: string }[];
}

const request = async <T = any>(method: string, path: string, body?: unknown): Promise<T> => {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `Request failed (${res.status})`);
  return data as T;
};

const plan = (planType: PlanType, planId: string) => `/plans/${planType}/${planId}`;

export const planApi = {
  publish: (t: PlanType, id: string, body: object) => request("PUT", `${plan(t, id)}/publish`, body),
  cancelSchedule: (t: PlanType, id: string) => request("PUT", `${plan(t, id)}/cancel-schedule`),
  unpublish: (t: PlanType, id: string) => request("PUT", `${plan(t, id)}/unpublish`),
  setTiming: (t: PlanType, id: string, body: object) => request("PUT", `${plan(t, id)}/timing`, body),
  setSchedule: (t: PlanType, id: string, examScheduleId: string | null) => request("PUT", `${plan(t, id)}/schedule`, { examScheduleId }),
  vacancies: (t: PlanType, id: string) => request<StaffingState>("GET", `${plan(t, id)}/vacancies`),
  fillVacancies: (t: PlanType, id: string) => request<StaffingState>("POST", `${plan(t, id)}/fill-vacancies`),
  facultyPicker: (t: PlanType, id: string) => request<{ quota: number; deptUsage: Record<string, number>; faculty: PickerFaculty[] }>("GET", `${plan(t, id)}/faculty-picker`),
  addHallFaculty: (t: PlanType, id: string, hallId: string, facultyId: string) => request<StaffingState>("POST", `${plan(t, id)}/halls/${hallId}/faculty`, { facultyId }),
  removeHallFaculty: (t: PlanType, id: string, hallId: string, facultyId: string) => request<StaffingState>("DELETE", `${plan(t, id)}/halls/${hallId}/faculty/${facultyId}`),
  reserves: (t: PlanType, id: string) => request<{ _id: string; name: string; department: string; designation: string }[]>("GET", `${plan(t, id)}/reserves`),
  schedules: () => request<ExamScheduleItem[]>("GET", "/exam-schedules"),
  exportConfig: () => request<ExportConfig>("GET", "/exports/config"),
  settings: () => request<{ absenteeWindowMinutes?: number }>("GET", "/settings"),
};

export const isLockedStatus = (status?: string) => ["FINAL", "SCHEDULED", "PUBLISHED"].includes(status || "");

export const formatIST = (value?: string | Date | null) =>
  value
    ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })
    : "";
