import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-foreground-subtle">404</p>
      <h1 className="text-lg font-semibold tracking-tight text-foreground">Page not found</h1>
      <p className="max-w-sm text-sm text-foreground-muted">
        This route does not exist in ICEBOX OS.
      </p>
      <Link
        href="/dashboard"
        className="mt-2 rounded-md border border-border-subtle bg-surface px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-surface-muted"
      >
        Back to dashboard
      </Link>
    </main>
  );
}
