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

const GENERIC_ERROR = "Something went wrong. Please try again.";
const INVALID_CREDENTIALS_ERROR = "Invalid email or password";
const LOGIN_RATE_LIMIT_ERROR =
  "Too many login attempts. Please wait a moment and try again.";
const REGISTRATION_RATE_LIMIT_ERROR =
  "Too many attempts. Please wait a moment and try again.";
const REGISTRATION_ERROR =
  "Registration failed. Please check your details and try again.";

/** Reads the HTTP status from a rejected axios error, if there is one. A
 *  network failure or a failed CSRF preflight has no `response`. */
function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const response = (error as { response?: unknown }).response;
  if (typeof response !== "object" || response === null) return undefined;
  const status = (response as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

/** Extracts Laravel's per-field validation messages, ignoring anything that
 *  does not have the expected shape. */
function validationErrorsOf(
  error: unknown
): Record<string, string[]> | null {
  if (typeof error !== "object" || error === null) return null;
  const response = (error as { response?: unknown }).response;
  if (typeof response !== "object" || response === null) return null;
  const data = (response as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;
  const errors = (data as { errors?: unknown }).errors;
  if (typeof errors !== "object" || errors === null || Array.isArray(errors)) {
    return null;
  }

  const fieldErrors: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(errors)) {
    if (!Array.isArray(messages)) continue;
    fieldErrors[field] = messages.filter(
      (message): message is string => typeof message === "string"
    );
  }
  return Object.keys(fieldErrors).length > 0 ? fieldErrors : null;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  fieldErrors: Record<string, string[]> | null;
  /** True once a session lookup (or a successful login/register) has settled,
   *  so a route guard can tell "still asking" apart from "definitely a guest". */
  isSessionChecked: boolean;
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
  fieldErrors: null,
  isSessionChecked: false,

  login: async (email, password) => {
    set({ isLoading: true, error: null, fieldErrors: null });
    try {
      await csrfClient.get("/sanctum/csrf-cookie");
      await apiClient.post("/auth/login", { email, password });
      const { data } = await apiClient.get("/auth/user");
      set({
        user: data.user,
        isAuthenticated: true,
        isLoading: false,
        isSessionChecked: true,
      });
    } catch (error) {
      const status = statusOf(error);
      let message = GENERIC_ERROR;
      if (status === 401 || status === 422) {
        message = INVALID_CREDENTIALS_ERROR;
      } else if (status === 429) {
        message = LOGIN_RATE_LIMIT_ERROR;
      }
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  register: async (name, email, password, passwordConfirmation) => {
    set({ isLoading: true, error: null, fieldErrors: null });
    try {
      await csrfClient.get("/sanctum/csrf-cookie");
      await apiClient.post("/auth/register", {
        name,
        email,
        password,
        password_confirmation: passwordConfirmation,
      });
      const { data } = await apiClient.get("/auth/user");
      set({
        user: data.user,
        isAuthenticated: true,
        isLoading: false,
        isSessionChecked: true,
      });
    } catch (error) {
      const status = statusOf(error);
      let message = GENERIC_ERROR;
      let fieldErrors: Record<string, string[]> | null = null;
      if (status === 422) {
        message = REGISTRATION_ERROR;
        fieldErrors = validationErrorsOf(error);
      } else if (status === 429) {
        message = REGISTRATION_RATE_LIMIT_ERROR;
      }
      set({ isLoading: false, error: message, fieldErrors });
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
      set({
        user: data.user,
        isAuthenticated: true,
        isLoading: false,
        isSessionChecked: true,
      });
    } catch {
      // A failed session lookup is a settled answer ("guest"), not a retryable
      // unknown, so isSessionChecked flips even on the failure path.
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isSessionChecked: true,
      });
    }
  },

  clearAuth: () => {
    set({ user: null, isAuthenticated: false });
  },
}));
