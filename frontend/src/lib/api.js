/**
 * API Client — Axios instance with automatic JWT header injection.
 *
 * Every request reads the token from localStorage and attaches it
 * as a Bearer token. If the server returns 401, the token is cleared
 * and the user is redirected to login.
 */
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
    baseURL: API_URL,
    headers: { 'Content-Type': 'application/json' },
});

// --- Request interceptor: attach JWT ---
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('nagarkot_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// --- Response interceptor: handle 401 ---
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('nagarkot_token');
            localStorage.removeItem('nagarkot_user');
            // Only redirect if not already on login page
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

// =====================================================================
//  AUTH
// =====================================================================
export const authLogin = (identifier, password) =>
    api.post('/auth/login', { identifier, password });

// =====================================================================
//  DEPARTMENTS
// =====================================================================
export const getDepartments = () => api.get('/departments/');
export const createDepartment = (data) => api.post('/departments/', data);
export const updateDepartment = (id, data) => api.put(`/departments/${id}`, data);

// =====================================================================
//  USERS
// =====================================================================
export const getMe = () => api.get('/users/me');
export const updateMe = (data) => api.put('/users/me', data);
export const getUsers = () => api.get('/users/');
export const createUser = (data) => api.post('/users/', data);
export const adminUpdateUser = (userId, data) =>
    api.put(`/admin/users/${userId}`, data);

// =====================================================================
//  MODULES
// =====================================================================
export const getModules = (departmentId) => {
    const params = departmentId ? { department_id: departmentId } : {};
    return api.get('/modules/', { params });
};
export const createModule = (data) => api.post('/modules/', data);
export const updateModule = (id, data) => api.put(`/modules/${id}`, data);
export const reorderModule = (id, direction) =>
    api.put(`/modules/${id}/reorder`, { direction });

// =====================================================================
//  CONTENT
// =====================================================================
export const createContent = (data) => api.post('/content/', data);
export const updateContent = (id, data) => api.put(`/content/${id}`, data);
export const reorderContent = (id, direction) =>
    api.put(`/content/${id}/reorder`, { direction });
export const uploadDocument = (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/content/upload-document', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
};

// =====================================================================
//  PROGRESS
// =====================================================================
export const updateProgress = (data) => api.post('/progress/', data);
export const getMyProgress = () => api.get('/progress/');

// =====================================================================
//  ADMIN REPORTS
// =====================================================================
export const getReportSummary = (departmentId) => {
    const params = departmentId ? { department_id: departmentId } : {};
    return api.get('/admin/reports/summary', { params });
};
export const getReportUserDetail = (userId) =>
    api.get(`/admin/reports/user/${userId}`);

export default api;
