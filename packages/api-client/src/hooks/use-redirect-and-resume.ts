import { useCallback } from "react";
import { useNavigate } from "react-router";
import { usePendingActionStore } from "../stores/pending-action-store";
import apiClient from "../api-client";
import { isSafeApiUrl, isSafeInternalPath } from "../utils/safe-path";

/** Why a pending action could not be resumed. Deliberately coarse: no raw
 *  error text or attacker-controlled value is exposed to callers. */
export type ResumeFailureReason = "unsafe" | "replay_failed";

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
      const targetRoute = action.targetRoute ?? window.location.pathname;

      // Nothing is deferred and no untrusted `from` is forwarded when either
      // value is not a same-origin relative path; the user still goes to login.
      if (!isSafeInternalPath(targetRoute) || !isSafeApiUrl(action.url)) {
        navigate("/login");
        return;
      }

      setPendingAction({
        targetRoute,
        method: action.method,
        url: action.url,
        data: action.data,
      });
      navigate("/login", {
        state: { from: targetRoute },
      });
    },
    [navigate, setPendingAction]
  );

  const resumePendingAction = useCallback(
    async (options?: {
      onError?: (reason: ResumeFailureReason) => void;
    }): Promise<boolean> => {
      const pending = getAndClearPendingAction();
      if (!pending) return false;

      // Defense in depth: an action that predates the guard, or was injected
      // into the store directly, is discarded without any request or redirect.
      if (
        !isSafeInternalPath(pending.targetRoute) ||
        !isSafeApiUrl(pending.url)
      ) {
        options?.onError?.("unsafe");
        return false;
      }

      try {
        await apiClient.request({
          method: pending.method,
          url: pending.url,
          data: pending.data,
        });
        navigate(pending.targetRoute);
        return true;
      } catch {
        options?.onError?.("replay_failed");
        return false;
      }
    },
    [getAndClearPendingAction, navigate]
  );

  const clearPendingAction = useCallback(() => {
    usePendingActionStore.getState().clearPendingAction();
  }, []);

  return { requireAuth, resumePendingAction, clearPendingAction };
}
