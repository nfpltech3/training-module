/**
 * API Client — Axios instance configured for cookie-based auth.
 *
 * The browser sends the httpOnly auth cookie automatically on
 * cross-origin requests when `withCredentials` is enabled.
 */
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
    baseURL: API_URL,
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true,
});

// --- Response interceptor: handle 401 ---
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Only redirect if not already on login page
            if (window.location.pathname !== '/login' && !window.location.pathname.startsWith('/sso')) {
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
export const authLogout = () => api.post('/auth/logout');

// =====================================================================
//  DEPARTMENTS & ROLES (Departments are proxied from OS)
// =====================================================================
export const getDepartments = () => api.get('/departments/');
export const getAssignableDepartments = () => api.get('/departments/assignable');
export const getClientOrganizations = () => api.get('/client-organizations/');
export const getRoles = () => api.get('/roles/');

// =====================================================================
//  USERS (Training App only reads and updates local role/status)
// =====================================================================
export const getMe = () => api.get('/users/me');
export const getUsers = () => api.get('/users/');
export const adminUpdateUser = (userId, data) =>
    api.put(`/admin/users/${userId}`, data);

// =====================================================================
//  MODULES
// =====================================================================
export const getModules = (departmentSlug) => {
    const params = departmentSlug ? { department_slug: departmentSlug } : {};
    return api.get('/modules/', { params });
};
// Admin Portal view: returns ALL modules regardless of the admin's own department
export const getAdminModules = () => api.get('/modules/', { params: { admin_view: true } });
export const getModule = (id) => api.get(`/modules/${id}`);
export const createModule = (data) => api.post('/modules/', data);
export const updateModule = (id, data) => api.put(`/modules/${id}`, data);
export const reorderModule = (id, direction) =>
    api.put(`/modules/${id}/reorder`, { direction });
export const moveModule = (id, newIndex) =>
    api.put(`/modules/${id}/move`, { new_index: newIndex });
export const deleteModule = (id) => api.delete(`/modules/${id}`);

// =====================================================================
//  CONTENT
// =====================================================================
export const createContent = (data) => api.post('/content/', data);
export const updateContent = (id, data) => api.put(`/content/${id}`, data);
export const archiveContent = (id) => api.put(`/content/${id}/archive`);
export const unarchiveContent = (id) => api.put(`/content/${id}/unarchive`);
export const deleteContentPermanently = (id) => api.delete(`/content/${id}`);
export const reorderContent = (id, direction) =>
    api.put(`/content/${id}/reorder`, { direction });
export const moveContent = (id, newIndex) =>
    api.put(`/content/${id}/move`, { new_index: newIndex });
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
export const getReportSummary = (departmentSlug) => {
    const params = departmentSlug ? { department_slug: departmentSlug } : {};
    return api.get('/admin/reports/summary', { params });
};
export const getReportUserDetail = (userId) =>
    api.get(`/admin/reports/user/${userId}`);

export default api;
