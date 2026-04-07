import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

// Interceptor to add phone based auth 
api.interceptors.request.use((config) => {
  const phone = localStorage.getItem('user_phone');
  if (phone) {
    config.headers['x-user-phone'] = phone;
  }
  return config;
});

export const memberApi = {
  getMembers: () => api.get('/members').then(res => res.data),
  addMember: (data) => api.post('/members', data).then(res => res.data),
  updateMember: (id, data) => api.put(`/members/${id}`, data).then(res => res.data),
  updateMemberPosition: (id, x, y) => api.patch(`/members/${id}/position`, { x, y }).then(res => res.data),
  uploadPhoto: (file) => {
    const formData = new FormData();
    formData.append('photo', file);
    return api.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(res => res.data);
  }
};

export const relationApi = {
  getRelations: () => api.get('/relations').then(res => res.data),
  addRelation: (data) => api.post('/relations', data).then(res => res.data),
  deleteRelation: (id) => api.delete(`/relations/${id}`).then(res => res.data),
};

export const authApi = {
  login: (phone) => { localStorage.setItem('user_phone', phone); return Promise.resolve({ phone }); },
  logout: () => { localStorage.removeItem('user_phone'); return Promise.resolve(); },
  getUser: () => localStorage.getItem('user_phone')
};

export default api;
