import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { API_BASE } from './lib/api'

// Global fetch interceptor to append JWT token to backend API requests
const originalFetch = window.fetch;
window.fetch = async (input, init) => {
  const token = localStorage.getItem('token');
  const url = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : input.url);

  // Apply authorization header to local API requests
  if (token && (url.startsWith(API_BASE) || url.includes('/api/') || !url.startsWith('http'))) {
    init = init || {};
    const headers = init.headers || {};
    
    if (headers instanceof Headers) {
      headers.set('Authorization', `Bearer ${token}`);
      init.headers = headers;
    } else if (Array.isArray(headers)) {
      const authIndex = headers.findIndex(([k]) => k.toLowerCase() === 'authorization');
      if (authIndex !== -1) {
        headers[authIndex] = ['Authorization', `Bearer ${token}`];
      } else {
        headers.push(['Authorization', `Bearer ${token}`]);
      }
      init.headers = headers;
    } else {
      headers['Authorization'] = `Bearer ${token}`;
      init.headers = headers;
    }
  }

  const response = await originalFetch(input, init);
  // If unauthorized (401), clear session and redirect to login
  if (response.status === 401 && !url.includes('/api/auth/login')) {
    localStorage.removeItem('token');
    localStorage.removeItem('currentUser');
    if (!window.location.pathname.includes('/login')) {
      window.location.href = '/login';
    }
  }
  return response;
};

createRoot(document.getElementById("root")!).render(<App />);
