import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, ErrorState, Input, LoadingSkeleton } from "@ecommerce/ui";
import {
  changePassword,
  getProfile,
  updateProfile,
  useAuthStore,
  type ChangePasswordData,
  type UpdateProfileData,
} from "@ecommerce/api-client";
import { siteConfig } from "../../config/site";
import { queryKeys } from "../../hooks/query-keys";
import {
  getApiFieldErrors,
  getApiErrorMessage,
  getApiErrorStatus,
  userMessageFor,
} from "../../lib/api-error";
import { handleExpiredSession } from "../../lib/handle-expired-session";
import { profileCopy } from "./profile-copy";
import { useAnnounce } from "../common/Announcer";

export default function ProfileView() {
  const queryClient = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const announce = useAnnounce();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.profile,
    queryFn: getProfile,
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [nameErrors, setNameErrors] = useState<string[]>([]);

  const nameSubmittingRef = useRef(false);

  useEffect(() => {
    if (data?.user) {
      setName(data.user.name || "");
      setEmail(data.user.email || "");
    }
  }, [data?.user]);

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateProfileData) => updateProfile(payload),
    onSuccess: (res) => {
      setNameErrors([]);
      announce(profileCopy.profileUpdated);
      queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      if (authUser) {
        useAuthStore.setState({ user: { ...authUser, name: res.user.name } });
      } else {
        const state = useAuthStore.getState();
        if (state.user) {
          useAuthStore.setState({ user: { ...state.user, name: res.user.name } });
        }
      }
    },
    onError: (err) => {
      const status = getApiErrorStatus(err);
      if (status === 401) {
        handleExpiredSession();
        return;
      }
      const fieldErrors = getApiFieldErrors(err);
      if (fieldErrors.name) {
        setNameErrors(fieldErrors.name);
        return;
      }
      setNameErrors([userMessageFor(err, profileCopy.genericError)]);
    },
    onSettled: () => {
      nameSubmittingRef.current = false;
    },
  });

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (nameSubmittingRef.current) return;
    nameSubmittingRef.current = true;
    setNameErrors([]);
    updateMutation.mutate({ name });
  };

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwErrors, setPwErrors] = useState<Record<string, string[]>>({});
  const [pwMessage, setPwMessage] = useState("");
  const pwSubmittingRef = useRef(false);

  const pwMutation = useMutation({
    mutationFn: (payload: ChangePasswordData) => changePassword(payload),
    onSuccess: () => {
      setPwErrors({});
      setPwMessage(profileCopy.passwordChanged);
      announce(profileCopy.passwordChanged);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err) => {
      const status = getApiErrorStatus(err);
      if (status === 401) {
        handleExpiredSession();
        return;
      }
      if (status === 429) {
        setPwMessage(profileCopy.passwordTooManyAttempts);
        setPwErrors({});
        return;
      }
      const fieldErrors = getApiFieldErrors(err);
      if (Object.keys(fieldErrors).length > 0) {
        setPwErrors(fieldErrors);
        setPwMessage("");
        return;
      }
      const msg = getApiErrorMessage(err) || profileCopy.passwordWrongCurrent;
      setPwMessage(msg);
      setPwErrors({});
    },
    onSettled: () => {
      pwSubmittingRef.current = false;
    },
  });

  const handlePwSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pwSubmittingRef.current) return;
    pwSubmittingRef.current = true;
    setPwErrors({});
    setPwMessage("");
    pwMutation.mutate({
      current_password: currentPassword,
      new_password: newPassword,
      new_password_confirmation: confirmPassword,
    });
  };

  if (isLoading) {
    return (
      <>
        <title>{`${profileCopy.title} | ${siteConfig.name}`}</title>
        <h1 className="sr-only">{profileCopy.title}</h1>
        <LoadingSkeleton label={profileCopy.title} items={3} />
      </>
    );
  }

  if (isError || !data?.user) {
    return (
      <>
        <title>{`${profileCopy.title} | ${siteConfig.name}`}</title>
        <h1>{profileCopy.title}</h1>
        <ErrorState
          title="Something went wrong"
          message="Something went wrong."
          retryLabel="Retry"
          onRetry={() => refetch()}
        />
      </>
    );
  }

  return (
    <>
      <title>{`${profileCopy.title} | ${siteConfig.name}`}</title>
      <h1>{profileCopy.title}</h1>

      <section className="mt-[var(--space-6)]">
        <h2 className="text-lg font-semibold">Profile</h2>
        <form onSubmit={handleNameSubmit} className="mt-[var(--space-4)] max-w-md space-y-4">
          <div>
            <Input
              id="profile-name"
              label={profileCopy.nameLabel}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-describedby={nameErrors.length ? "profile-name-error" : undefined}
            />
            {nameErrors.length > 0 && (
              <p id="profile-name-error" className="mt-1 text-sm text-red-600">{nameErrors[0]}</p>
            )}
          </div>
          <div>
            <p className="block text-sm font-medium">{profileCopy.emailLabel}</p>
            <p className="mt-1 text-sm">{email}</p>
            <p className="text-xs text-gray-500">{profileCopy.emailReadOnlyNote}</p>
          </div>
          <Button type="submit" disabled={updateMutation.isPending}>{profileCopy.save}</Button>
        </form>
      </section>

      <section className="mt-[var(--space-8)]">
        <h2 className="text-lg font-semibold">{profileCopy.passwordSectionTitle}</h2>
        <p className="mt-1 text-sm text-gray-600">{profileCopy.passwordHint}</p>
        <form onSubmit={handlePwSubmit} className="mt-[var(--space-4)] max-w-md space-y-4">
          <div>
            <Input
              id="current-password"
              label={profileCopy.currentPasswordLabel}
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              aria-describedby={pwErrors.current_password ? "current-password-error" : undefined}
            />
            {pwErrors.current_password && <p id="current-password-error" className="mt-1 text-sm text-red-600">{pwErrors.current_password[0]}</p>}
          </div>
          <div>
            <Input
              id="new-password"
              label={profileCopy.newPasswordLabel}
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              aria-describedby={pwErrors.new_password ? "new-password-error" : undefined}
            />
            {pwErrors.new_password && <p id="new-password-error" className="mt-1 text-sm text-red-600">{pwErrors.new_password[0]}</p>}
          </div>
          <div>
            <Input
              id="confirm-password"
              label={profileCopy.confirmPasswordLabel}
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              aria-describedby={pwErrors.new_password_confirmation ? "confirm-password-error" : undefined}
            />
            {pwErrors.new_password_confirmation && <p id="confirm-password-error" className="mt-1 text-sm text-red-600">{pwErrors.new_password_confirmation[0]}</p>}
          </div>
          {pwMessage && <p className="text-sm">{pwMessage}</p>}
          <Button type="submit" disabled={pwMutation.isPending}>{profileCopy.changePasswordButton}</Button>
        </form>
      </section>
    </>
  );
}
