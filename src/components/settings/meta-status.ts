/**
 * View model for the Meta Ads connection check shown in Settings.
 *
 * Types only, shared by the server action and the client component.
 * Deliberately narrow: the ad account id and access token have no
 * representation here, so they cannot reach the browser by accident.
 */

export type MetaConnectionView =
  | {
      readonly status: 'connected';
      readonly accountName: string;
      readonly accountId: string;
      readonly currency: string;
      readonly timeZone: string | null;
      readonly accountStatus: string;
      readonly isActive: boolean;
      /** False when the ad account reports in a different currency to ICEBOX. */
      readonly currencyMatchesReporting: boolean;
      readonly reportingCurrency: string;
      readonly apiVersion: string;
      readonly checkedAt: string;
    }
  | {
      readonly status: 'error' | 'not-connected';
      readonly message: string;
      readonly guidance: string;
      readonly checkedAt: string;
    };
