import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { usePendingActionStore } from "../stores/pending-action-store";
import apiClient from "../api-client";

export function useRedirectAndResume() {
  const navigate = useNavigate();
  const { setPendingAction, getAndClearPendingAction } = usePendingActionStore();

  const requireAuth = useCallback(
    (action: {
      method: string;
      url: string;
      data?: Record<string, unknown>;
      targetRoute?: string;
    }) => {
      setPendingAction({
        targetRoute: action.targetRoute ?? window.location.pathname,
        method: action.method,
        url: action.url,
        data: action.data,
      });
      navigate("/login", {
        state: { from: action.targetRoute ?? window.location.pathname },
      });
    },
    [navigate, setPendingAction]
  );

  const resumePendingAction = useCallback(async (): Promise<boolean> => {
    const pending = getAndClearPendingAction();
    if (!pending) return false;

    try {
      await apiClient.request({
        method: pending.method,
        url: pending.url,
        data: pending.data,
      });
      navigate(pending.targetRoute);
      return true;
    } catch {
      return false;
    }
  }, [getAndClearPendingAction, navigate]);

  const clearPendingAction = useCallback(() => {
    usePendingActionStore.getState().clearPendingAction();
  }, []);

  return { requireAuth, resumePendingAction, clearPendingAction };
}
