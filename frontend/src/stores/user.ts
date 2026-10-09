import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '@/lib/axios';

export interface User {
  id: string;
  email: string;
  fullName?: string;
  isAdmin: boolean;
  timezone: string;
}

const JWT_KEY = 'intimate_jwt';
const ME_KEY = 'intimate_me';

export const useUserStore = defineStore('user', () => {
  const token = ref<string | null>(localStorage.getItem(JWT_KEY));
  const me = ref<User | null>(null);
  const ready = ref(false);

  const isLoggedIn = computed(() => !!token.value && !!me.value);

  function saveToken(t: string | null) {
    token.value = t;
    if (t) localStorage.setItem(JWT_KEY, t); else localStorage.removeItem(JWT_KEY);
    if (t) api.defaults.headers.common['Authorization'] = `Bearer ${t}`;
    else delete api.defaults.headers.common['Authorization'];
  }

  async function restore() {
    if (token.value) {
      try {
        const { data } = await api.get<{ok: boolean; data: User }>('/auth/me');
        me.value = data.data;
        localStorage.setItem(ME_KEY, JSON.stringify(me.value));
      } catch {
        saveToken(null);
        me.value = null;
        localStorage.removeItem(ME_KEY);
      }
    } else {
      const cached = localStorage.getItem(ME_KEY);
      if (cached) { try { me.value = JSON.parse(cached); } catch {} }
    }
    ready.value = true;
  }

  async function login(payload: { email: string; password: string }) {
    const { data } = await api.post<{ ok: boolean; data: { token: string; user: User } }>('/auth/login', payload);
    saveToken(data.data.token);
    me.value = data.data.user;
    localStorage.setItem(ME_KEY, JSON.stringify(me.value));
    return data.data;
  }

  async function register(payload: { email: string; password: string; fullName: string }) {
    const { data } = await api.post<{ ok: boolean; data: { token: string; user: User } }>('/auth/register', payload);
    saveToken(data.data.token);
    me.value = data.data.user;
    localStorage.setItem(ME_KEY, JSON.stringify(me.value));
    return data.data;
  }

  function logout() {
    saveToken(null);
    me.value = null;
    localStorage.removeItem(ME_KEY);
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith('order_access_')) sessionStorage.removeItem(key);
    }
  }

  if (token.value) api.defaults.headers.common['Authorization'] = `Bearer ${token.value}`;

  return { token, me, ready, isLoggedIn, login, register, logout, restore };
});
