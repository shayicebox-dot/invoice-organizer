/**
 * Inline icon set. Kept in-repo rather than pulled from an icon package so the
 * stroke weight matches the interface everywhere and the bundle stays small.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export function OverviewIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </Base>
  );
}

export function ProfitIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M2 12.5 6 8l3 2.5L14 4" />
      <path d="M14 7.5V4h-3.5" />
    </Base>
  );
}

export function MarketingIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 6.5v3a1 1 0 0 0 1 1h1.5L10 13.5v-11L5.5 5.5H4a1 1 0 0 0-1 1Z" />
      <path d="M12.5 6c.6.6.9 1.3.9 2s-.3 1.4-.9 2" />
    </Base>
  );
}

export function OrdersIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 4.5h10l-.8 8a1 1 0 0 1-1 .9H4.8a1 1 0 0 1-1-.9Z" />
      <path d="M5.8 4.5a2.2 2.2 0 0 1 4.4 0" />
    </Base>
  );
}

export function ProductsIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M8 2 2.5 5v6L8 14l5.5-3V5Z" />
      <path d="M2.5 5 8 8l5.5-3M8 8v6" />
    </Base>
  );
}

export function ExpensesIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="2" y="4" width="12" height="8.5" rx="1.5" />
      <path d="M2 7h12M4.5 10h2.5" />
    </Base>
  );
}

export function CostsIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M8 2.5v11" />
      <path d="M10.8 4.6H6.6a1.9 1.9 0 0 0 0 3.8h2.8a1.9 1.9 0 0 1 0 3.8H5" />
    </Base>
  );
}

export function ConnectionsIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6.5 9.5 4.8 11.2a2.4 2.4 0 0 1-3.4-3.4L3.1 6.1" />
      <path d="M9.5 6.5l1.7-1.7a2.4 2.4 0 0 1 3.4 3.4l-1.7 1.7" />
      <path d="M6 10 10 6" />
    </Base>
  );
}

export function StoresIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M2.5 6.5V13h11V6.5" />
      <path d="M1.8 6.5 3 3h10l1.2 3.5a2 2 0 0 1-3.6 1.2 2 2 0 0 1-3.2 0 2 2 0 0 1-3.6-1.2Z" />
    </Base>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.8v1.4M8 12.8v1.4M14.2 8h-1.4M3.2 8H1.8M12.4 3.6l-1 1M4.6 11.4l-1 1M12.4 12.4l-1-1M4.6 4.6l-1-1" />
    </Base>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m4 6.5 4 3.5 4-3.5" />
    </Base>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m3.5 8.5 3 3 6-7" />
    </Base>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
      <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
    </Base>
  );
}

export function StoreMarkIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M2.5 6.5V13h11V6.5" />
      <path d="M1.8 6.5 3 3h10l1.2 3.5" />
    </Base>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 7.2v4M8 5.1v.2" />
    </Base>
  );
}
