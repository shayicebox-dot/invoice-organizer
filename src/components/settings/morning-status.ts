/**
 * View model for the Morning (Green Invoice) connection check shown in
 * Settings.
 *
 * Types only, shared by the server action and the client component.
 * Deliberately narrow: the API key id, its secret and the minted token have no
 * representation here, so they cannot reach the browser by accident.
 */

export type MorningConnectionView =
  | {
      readonly status: 'connected';
      /** `null` when the account exposes no business name — not a failure. */
      readonly businessName: string | null;
      readonly environment: 'production' | 'sandbox';
      readonly host: string;
      readonly checkedAt: string;
    }
  | {
      readonly status: 'error' | 'not-connected';
      readonly message: string;
      readonly guidance: string;
      /**
       * The HTTP status Morning answered with, shown so a failure can be
       * reported precisely. `null` when the request never got an answer —
       * unset credentials, an expired session, a timeout, an unreachable host.
       */
      readonly httpStatus: number | null;
      readonly checkedAt: string;
    };
