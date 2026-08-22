import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/login-form';
import { isAuthConfigured } from '@/lib/config/env';

export const metadata: Metadata = { title: 'Sign in' };

/** Read per request: whether a password exists is a property of the deployment. */
export const dynamic = 'force-dynamic';

type LoginPageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * The only page reachable without a session.
 *
 * It deliberately says nothing about the store, the business or the data behind
 * it — an unauthenticated visitor learns only that this is ICEBOX OS.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = params['next'];

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2.5 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-foreground text-sm font-bold tracking-tight text-background">
            IX
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">ICEBOX OS</h1>
            <p className="mt-0.5 text-sm text-foreground-muted">
              Sign in to continue to the dashboard.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-border-subtle bg-surface p-5">
          <LoginForm
            configured={isAuthConfigured()}
            next={typeof next === 'string' ? next : null}
          />
        </div>

        <p className="mt-4 text-center text-[11px] text-foreground-subtle">
          Internal system · ICEBOX
        </p>
      </div>
    </main>
  );
}
