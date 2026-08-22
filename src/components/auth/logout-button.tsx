import { LogOut } from 'lucide-react';
import { signOut } from '@/lib/auth/actions';

/**
 * Sign out.
 *
 * A form posting to a server action rather than a fetch: the session cookie is
 * HTTP-only, so only the server can clear it, and this works without
 * JavaScript.
 */
export function LogoutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        aria-label="Sign out"
        title="Sign out"
        className="flex size-8 items-center justify-center rounded-md border border-border-subtle bg-surface text-foreground-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <LogOut className="size-4" aria-hidden="true" />
      </button>
    </form>
  );
}
