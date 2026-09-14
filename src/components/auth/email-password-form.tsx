import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { authClient } from "@/lib/auth/client";
import { emailAndPasswordEnabled } from "@/lib/auth/email-password";
import { cn } from "@/lib/utils.ts";

type Mode = "signin" | "signup";

export function EmailPasswordForm({
  callbackURL = "/",
  className,
}: {
  callbackURL?: string;
  className?: string;
}) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!emailAndPasswordEnabled) return null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);

    const trimmedEmail = email.trim();
    const trimmedName = name.trim();

    try {
      if (mode === "signup") {
        if (trimmedName.length < 1) {
          setError("Enter your name.");
          return;
        }
        if (password.length < 8) {
          setError("Password must be at least 8 characters.");
          return;
        }
        const { error: signUpError } = await authClient.signUp.email({
          name: trimmedName,
          email: trimmedEmail,
          password,
          callbackURL,
        });
        if (signUpError) {
          setError(signUpError.message ?? "Could not create account.");
          return;
        }
      } else {
        const { error: signInError } = await authClient.signIn.email({
          email: trimmedEmail,
          password,
          callbackURL,
        });
        if (signInError) {
          setError(signInError.message ?? "Could not sign in.");
          return;
        }
      }

      try {
        await authClient.getSession();
      } catch {
        /* session store refreshes on next useSession fetch */
      }

      await navigate({ to: callbackURL });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("flex w-full max-w-sm flex-col gap-4", className)}>
      <div className="flex gap-1 rounded-md bg-paper-warm/70 p-1">
        <button
          type="button"
          onClick={() => {
            setMode("signin");
            setError("");
          }}
          className={cn(
            "flex-1 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
            mode === "signin"
              ? "bg-surface text-ink shadow-border"
              : "text-muted hover:text-ink",
          )}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("signup");
            setError("");
          }}
          className={cn(
            "flex-1 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
            mode === "signup"
              ? "bg-surface text-ink shadow-border"
              : "text-muted hover:text-ink",
          )}
        >
          Create account
        </button>
      </div>

      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        {mode === "signup" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="auth-name">Name</Label>
            <Input
              id="auth-name"
              name="name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={busy}
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="auth-email">Email</Label>
          <Input
            id="auth-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={busy}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="auth-password">Password</Label>
          <Input
            id="auth-password"
            name="password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === "signup" ? 8 : undefined}
            disabled={busy}
          />
        </div>

        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="mt-1 w-full" disabled={busy}>
          {busy ? "Working…" : mode === "signup" ? "Create account" : "Sign in with email"}
        </Button>
      </form>
    </div>
  );
}
