import axios from 'axios';

const base = import.meta.env.VITE_API_BASE_URL || '';
export const api = axios.create({
  baseURL: base ? `${base}/api` : '/api',
  timeout: 30_000,
});

api.interceptors.response.use(
  (r) => r,
  (e) => {
    if (e.response?.status === 401) {
      localStorage.removeItem('intimate_jwt');
      localStorage.removeItem('intimate_me');
      if (!location.pathname.startsWith('/login') && !location.pathname.startsWith('/register')) {
        location.href = `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;
      }
    }
    return Promise.reject(e);
  }
);

export default api;
