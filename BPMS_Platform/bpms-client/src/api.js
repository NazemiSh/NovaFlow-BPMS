import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

// اضافه کردن خودکار توکن به تمام درخواست‌ها
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('bpms_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// مدیریت خطای انقضای توکن
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 401) {
      const url = err.config?.url || '';
      // در صورتی که درخواست مربوط به ورود (Login) باشد، به عنوان انقضای توکن تلقی نشود و صفحه رفرش نگردد
      const isLoginRequest = url.includes('/auth/login');
      const isPublicPath = typeof window !== 'undefined' && (
        window.location.pathname.startsWith('/survey/') ||
        window.location.pathname.startsWith('/attachments/')
      );
      if (!isLoginRequest && !isPublicPath) {
        localStorage.removeItem('bpms_token');
        localStorage.removeItem('bpms_user');
        window.location.reload();
      }
    }
    return Promise.reject(err);
  }
);

export default api;