import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { apiRequest, ApiError, getAuthToken, setAuthToken } from '../services/api';
import { User, UserRole } from '../types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, role: UserRole) => Promise<boolean>;
  register: (userData: { name: string; email: string; phone: string; password: string; role: UserRole; barCouncil?: string; enrollmentNumber?: string }) => Promise<true | string>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email: string, password: string, role: UserRole) => {
        set({ isLoading: true });
        try {
          const result = await apiRequest<{ token: string; user: User }>('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password, role }),
          });
          setAuthToken(result.token);
          set({ user: result.user, isAuthenticated: true, isLoading: false });
          return true;
        } catch {
          set({ isLoading: false });
          return false;
        }
      },

      register: async (userData) => {
        set({ isLoading: true });
        try {
          const result = await apiRequest<{ token: string; user: User }>('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData),
          });
          setAuthToken(result.token);
          set({ user: result.user, isAuthenticated: true, isLoading: false });
          return true;
        } catch (error) {
          set({ isLoading: false });
          return error instanceof ApiError ? error.message : 'Registration failed. Please try again.';
        }
      },

      logout: () => {
        setAuthToken(null);
        set({ user: null, isAuthenticated: false });
      },

      refreshUser: async () => {
        if (!getAuthToken()) {
          set({ user: null, isAuthenticated: false, isLoading: false });
          return;
        }
        set({ isLoading: true });
        try {
          const result = await apiRequest<{ user: User }>('/api/auth/me');
          set({ user: result.user, isAuthenticated: true, isLoading: false });
        } catch {
          setAuthToken(null);
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      },

      setUser: (user) => set({ user, isAuthenticated: true }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
