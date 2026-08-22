'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { AlertCircle } from 'lucide-react';
import { signIn, type SignInState } from '@/lib/auth/actions';

type LoginFormProps = {
  readonly configured: boolean;
  /** Path the visitor was trying to reach before being sent here. */
  readonly next: string | null;
};

const INITIAL_STATE: SignInState = { error: null };

/**
 * Password form.
 *
 * A plain `<form>` posting to a server action: the password goes straight to
 * the server, is never held in component state, and never appears in a URL.
 * It works even if JavaScript has not loaded.
 */
export function LoginForm({ configured, next }: LoginFormProps) {
  const [state, formAction] = useActionState(signIn, INITIAL_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next === null ? null : <input type="hidden" name="next" value={next} />}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-foreground">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          disabled={!configured}
          aria-describedby={state.error === null ? undefined : 'login-error'}
          className="rounded-md border border-border-subtle bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
        />
      </div>

      {state.error === null ? null : (
        <p
          id="login-error"
          role="alert"
          className="flex items-start gap-2 rounded-md border border-border-subtle bg-surface-muted p-3 text-sm text-foreground"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-negative" aria-hidden="true" />
          {state.error}
        </p>
      )}

      {configured ? null : (
        <p className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs leading-relaxed text-foreground-muted">
          No password is set for this deployment. Add{' '}
          <span className="text-foreground-muted">ICEBOX_ADMIN_PASSWORD</span> in Vercel and
          redeploy.
        </p>
      )}

      <SubmitButton disabled={!configured} />
    </form>
  );
}

function SubmitButton({ disabled }: { readonly disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
    >
      {pending ? 'Signing in…' : 'Sign in'}
    </button>
  );
}
