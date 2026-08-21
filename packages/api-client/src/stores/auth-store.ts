import { create } from "zustand";
import axios from "axios";
import apiClient from "../api-client";

const serverOrigin = new URL(
  import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1"
).origin;

const csrfClient = axios.create({
  baseURL: serverOrigin,
  withCredentials: true,
});

export interface User {
  id: number;
  name: string;
  email: string;
  role: { id: number; name: string; slug: string } | null;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (
    name: string,
    email: string,
    password: string,
    passwordConfirmation: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      await csrfClient.get("/sanctum/csrf-cookie");
      await apiClient.post("/auth/login", { email, password });
      const { data } = await apiClient.get("/auth/user");
      set({ user: data.user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ isLoading: false, error: "Invalid email or password" });
      throw error;
    }
  },

  register: async (name, email, password, passwordConfirmation) => {
    set({ isLoading: true, error: null });
    try {
      await csrfClient.get("/sanctum/csrf-cookie");
      await apiClient.post("/auth/register", {
        name,
        email,
        password,
        password_confirmation: passwordConfirmation,
      });
      const { data } = await apiClient.get("/auth/user");
      set({ user: data.user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      set({ isLoading: false, error: "Registration failed. Please check your details and try again." });
      throw error;
    }
  },

  logout: async () => {
    try {
      await apiClient.post("/auth/logout");
    } finally {
      set({ user: null, isAuthenticated: false });
    }
  },

  fetchUser: async () => {
    set({ isLoading: true });
    try {
      const { data } = await apiClient.get("/auth/user");
      set({ user: data.user, isAuthenticated: true, isLoading: false });
    } catch {
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  clearAuth: () => {
    set({ user: null, isAuthenticated: false });
  },
}));
