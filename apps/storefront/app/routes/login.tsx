import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@ecommerce/api-client";
import { Button, Input } from "@ecommerce/ui";
import { Link } from "react-router";
import { usePostAuthNavigation } from "../hooks/usePostAuthNavigation";

export function meta() {
  return [
    { title: "Login — TechFix" },
    { name: "description", content: "Sign in to your TechFix account." },
  ];
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Real sign-in form. Kept render-safe for prerender: nothing here touches
 * window/document during render, and all effects run after mount.
 */
export default function Login() {
  const login = useAuthStore((state) => state.login);
  const isLoading = useAuthStore((state) => state.isLoading);
  const storeError = useAuthStore((state) => state.error);
  const isSessionChecked = useAuthStore((state) => state.isSessionChecked);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const {
    run: runPostAuthNavigation,
    navigateHome,
    notice,
  } = usePostAuthNavigation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const submitting = useRef(false);
  /**
   * Latches once the post-auth navigation chain has taken over. `submitting`
   * is not enough: it is cleared in `finally`, and the store update from a
   * successful login can reach React after that, at which point the effect
   * below sees an authenticated visitor, fires `navigateHome()` and overwrites
   * the destination it just chose — silently dropping a deep link on the floor.
   */
  const postAuthNavigationRan = useRef(false);

  // A signed-in visitor has no business on /login: always straight home.
  // Skipped while a submission is in flight, because then the post-auth
  // navigation chain (pending action / `from`) must own the redirect.
  useEffect(() => {
    if (submitting.current || postAuthNavigationRan.current) return;
    if (isSessionChecked && isAuthenticated) {
      navigateHome();
    }
  }, [isSessionChecked, isAuthenticated, navigateHome]);

  // A stale error from a previous page must not greet the next visitor.
  useEffect(() => {
    return () => {
      useAuthStore.setState({ error: null });
    };
  }, []);

  useEffect(() => {
    if (storeError) alertRef.current?.focus();
  }, [storeError]);

  const clearStoreError = () => {
    if (useAuthStore.getState().error) {
      useAuthStore.setState({ error: null });
    }
  };

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!email.trim()) {
      errors.email = "Please enter your email.";
    } else if (!EMAIL_PATTERN.test(email)) {
      errors.email = "Please enter a valid email address.";
    }
    if (!password) errors.password = "Please enter your password.";

    setFieldErrors(errors);
    if (errors.email) {
      emailRef.current?.focus();
    } else if (errors.password) {
      passwordRef.current?.focus();
    }
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // The Button is disabled while loading too; this covers programmatic and
    // Enter-key submits that race the disable.
    if (submitting.current) return;
    if (!validate()) return;

    clearStoreError();
    submitting.current = true;
    try {
      await login(email, password);
      setPassword("");
      postAuthNavigationRan.current = true;
      await runPostAuthNavigation();
    } catch {
      // The store already mapped this to a user-facing message.
      setPassword("");
    } finally {
      submitting.current = false;
    }
  };

  return (
    <main id="main-content">
      <h1>Login</h1>

      {notice && (
        <p role="status" data-testid="resume-notice" className="mb-[var(--space-4)]">
          {notice}
        </p>
      )}

      {storeError && (
        <p
          ref={alertRef}
          role="alert"
          tabIndex={-1}
          data-testid="login-error"
        >
          {storeError}
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <Input
          ref={emailRef}
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          error={fieldErrors.email}
          onChange={(event) => {
            setEmail(event.target.value);
            setFieldErrors((prev) => ({ ...prev, email: "" }));
            clearStoreError();
          }}
        />
        <Input
          ref={passwordRef}
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          error={fieldErrors.password}
          onChange={(event) => {
            setPassword(event.target.value);
            setFieldErrors((prev) => ({ ...prev, password: "" }));
            clearStoreError();
          }}
        />
        <Button type="submit" isLoading={isLoading}>
          Sign in
        </Button>
      </form>

      <p>
        Need an account? <Link to="/register">Register</Link>
      </p>
    </main>
  );
}
