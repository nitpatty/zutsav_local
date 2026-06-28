import axios from 'axios';
import toast from 'react-hot-toast';

const API = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "https://backend.zutsav.com/api",
  withCredentials: true,
});

API.interceptors.request.use((config) => {
  const token = localStorage.getItem('zutsav_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

API.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;

    if (status === 401) {
      localStorage.removeItem('zutsav_token');
      localStorage.removeItem('zutsav_user');
      // Dispatch event so AuthContext handles logout through React state.
      // Never use window.location.href here — bypasses React Router.
      window.dispatchEvent(new CustomEvent('zutsav:unauthorized'));
    }

    if (status === 429) {
      toast.error('Server is busy. Please try again in a few seconds.', {
        id: 'rate-limit',
        duration: 5000,
      });
    }

    if (status >= 500) {
      toast.error('Server error. Please try again later.');
    }

    return Promise.reject(error);
  }
);

export default API;
