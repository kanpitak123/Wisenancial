import { defineBoot } from '#q-app/wrappers';
import axios, { type AxiosInstance } from 'axios';

declare module 'vue' {
  interface ComponentCustomProperties {
    $axios: AxiosInstance;
    $api: AxiosInstance;
  }
}

const api = axios.create({ baseURL: 'http://localhost:3000' });

// =================================================================
// 🟢 เพิ่ม Interceptor ตรงนี้ เพื่อดักทุก Request และแนบ Token อัตโนมัติ
// =================================================================
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);
// =================================================================

export default defineBoot(({ app }) => {
  app.config.globalProperties.$axios = axios;
  app.config.globalProperties.$api = api;
});

export { api };
