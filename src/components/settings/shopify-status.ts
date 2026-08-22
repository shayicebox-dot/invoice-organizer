/**
 * View model for the Shopify connection check shown in Settings.
 *
 * Types only — no runtime code, so both the server action and the client
 * component can share it. Deliberately narrow: it carries what a person needs
 * to see and nothing else. The client ID, client secret and access tokens have
 * no representation here, so they cannot reach the browser by accident.
 */

export type ShopifyStatus = 'connected' | 'not-connected' | 'error';

export type ShopifyConnectionView =
  | {
      readonly status: 'connected';
      readonly storeName: string;
      readonly myshopifyDomain: string;
      readonly currency: string;
      readonly timeZone: string;
      readonly plan: string | null;
      readonly grantedScopes: readonly string[];
      readonly missingScopes: readonly string[];
      /** False when orders older than 60 days will not be readable. */
      readonly historicalOrdersGranted: boolean;
      readonly apiVersion: string;
      readonly checkedAt: string;
    }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly guidance: string;
      readonly checkedAt: string;
    }
  | {
      readonly status: 'not-connected';
      readonly message: string;
      readonly guidance: string;
      readonly checkedAt: string;
    };
