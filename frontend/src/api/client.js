import axios from 'axios';
import { useAuthStore } from '../store/authStore.js';

function resolveBaseUrl(rawUrl) {
  if (!rawUrl) return '/api/v1';
  const trimmed = String(rawUrl).trim().replace(/\/+$/, '');
  if (!trimmed || trimmed === '/api/v1') return '/api/v1';
  if (trimmed.endsWith('/api/v1')) return trimmed;
  if (trimmed.endsWith('/api')) return `${trimmed}/v1`;
  return `${trimmed}/api/v1`;
}

const baseURL = resolveBaseUrl(import.meta.env.VITE_API_URL);

export const apiClient = axios.create({
  baseURL,
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshPromise = null;

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const errCode = error?.response?.data?.error?.code;

    if (
      error?.response?.status === 401 &&
      errCode === 'TOKEN_EXPIRED' &&
      original &&
      !original._retry
    ) {
      original._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = axios
            .post(`${baseURL}/auth/refresh`, {}, { withCredentials: true })
            .then((res) => {
              const newToken = res.data.data.access_token;
              useAuthStore.getState().setAccessToken(newToken);
              return newToken;
            })
            .finally(() => {
              refreshPromise = null;
            });
        }
        const newToken = await refreshPromise;
        original.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(original);
      } catch (refreshErr) {
        useAuthStore.getState().clearSession();
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  },
);

