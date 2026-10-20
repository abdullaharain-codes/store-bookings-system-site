import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@ecommerce/api-client";
import { Button, Input } from "@ecommerce/ui";
import { Link } from "react-router";
import { usePostAuthNavigation } from "../hooks/usePostAuthNavigation";

export function meta() {
  return [
    { title: "Register — TechFix" },
    { name: "description", content: "Create your TechFix account." },
  ];
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Matches server RegisterRequest: password => ['required','string','min:8','confirmed'].
const MIN_PASSWORD_LENGTH = 8;

export default function Register() {
  const register = useAuthStore((state) => state.register);
  const isLoading = useAuthStore((state) => state.isLoading);
  const storeError = useAuthStore((state) => state.error);
  const storeFieldErrors = useAuthStore((state) => state.fieldErrors);
  const isSessionChecked = useAuthStore((state) => state.isSessionChecked);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const {
    run: runPostAuthNavigation,
    notice,
    navigateHome,
  } = usePostAuthNavigation();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const submitting = useRef(false);
  /**
   * Latches once the post-auth navigation chain has taken over. `submitting`
   * alone is not enough: it is cleared in `finally`, and the store update from
   * a successful registration can reach React after that, at which point the
   * effect below sees an authenticated visitor, fires `navigateHome()` and
   * overwrites the destination it just chose.
   */
  const postAuthNavigationRan = useRef(false);

  useEffect(() => {
    if (submitting.current || postAuthNavigationRan.current) return;
    if (isSessionChecked && isAuthenticated) {
      navigateHome();
    }
  }, [isSessionChecked, isAuthenticated, navigateHome]);

  useEffect(() => {
    return () => {
      useAuthStore.setState({ error: null, fieldErrors: null });
    };
  }, []);

  useEffect(() => {
    if (storeError) alertRef.current?.focus();
  }, [storeError]);

  // Server-side Laravel errors are authoritative (unique email, etc.) and win
  // over the local checks.
  const errorFor = (field: string): string | undefined =>
    fieldErrors[field] || storeFieldErrors?.[field]?.[0];

  const clearError = (field: string) => {
    setFieldErrors((prev) => ({ ...prev, [field]: "" }));
    const current = useAuthStore.getState().fieldErrors;
    if (current?.[field]) {
      const next = { ...current };
      delete next[field];
      useAuthStore.setState({
        fieldErrors: Object.keys(next).length > 0 ? next : null,
      });
    }
  };

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = "Please enter your name.";
    if (!email.trim()) {
      errors.email = "Please enter your email.";
    } else if (!EMAIL_PATTERN.test(email)) {
      errors.email = "Please enter a valid email address.";
    }
    if (!password) {
      errors.password = "Please enter a password.";
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    } else if (password !== passwordConfirmation) {
      // Mirrors the backend's `confirmed` rule, which keys a mismatch on
      // `password` (not on `password_confirmation`).
      errors.password = "Passwords do not match.";
    }

    setFieldErrors(errors);
    if (errors.name) nameRef.current?.focus();
    else if (errors.email) emailRef.current?.focus();
    else if (errors.password) passwordRef.current?.focus();
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    if (!validate()) return;

    useAuthStore.setState({ error: null, fieldErrors: null });
    submitting.current = true;
    try {
      await register(name, email, password, passwordConfirmation);
      postAuthNavigationRan.current = true;
      await runPostAuthNavigation();
    } catch {
      // Mapped to a user-facing summary + fieldErrors by the store.
    } finally {
      setPassword("");
      setPasswordConfirmation("");
      submitting.current = false;
    }
  };

  return (
    <main id="main-content">
      <h1>Register</h1>

      {notice && (
        <p role="status" data-testid="resume-notice" className="mb-[var(--space-4)]">
          {notice}
        </p>
      )}

      {storeError && (
        <p ref={alertRef} role="alert" tabIndex={-1} data-testid="register-error">
          {storeError}
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <Input
          ref={nameRef}
          label="Name"
          name="name"
          type="text"
          autoComplete="name"
          value={name}
          error={errorFor("name")}
          onChange={(event) => {
            setName(event.target.value);
            clearError("name");
          }}
        />
        <Input
          ref={emailRef}
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          error={errorFor("email")}
          onChange={(event) => {
            setEmail(event.target.value);
            clearError("email");
          }}
        />
        <Input
          ref={passwordRef}
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          error={errorFor("password")}
          onChange={(event) => {
            setPassword(event.target.value);
            clearError("password");
          }}
        />
        <Input
          label="Confirm password"
          name="password_confirmation"
          type="password"
          autoComplete="new-password"
          value={passwordConfirmation}
          onChange={(event) => {
            setPasswordConfirmation(event.target.value);
            clearError("password");
          }}
        />
        <Button type="submit" isLoading={isLoading}>
          Create account
        </Button>
      </form>

      <p>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </main>
  );
}
