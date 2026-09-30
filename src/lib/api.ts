/**
 * Backend location. Set VITE_API_URL to the server origin; a trailing `/api`
 * is accepted too, since older config used both forms.
 */
export const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000")
  .replace(/\/+$/, "")
  .replace(/\/api$/, "");

export const API_URL = `${API_BASE}/api`;
