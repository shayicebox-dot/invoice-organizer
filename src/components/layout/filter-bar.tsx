"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import { CalendarIcon, CheckIcon, StoreMarkIcon } from "@/components/ui/icons";
import {
  DATE_RANGE_PRESETS,
  type DateRangePreset,
  PRESET_LABELS,
  isISODate,
  resolveDateRange,
} from "@/lib/date-range";
import {
  ALL_STORES,
  type StoreOption,
  labelForScope,
  normalizeScope,
} from "@/lib/view-params";

/**
 * The single filter row. Store and period live in the URL so every page below
 * renders against the same slice and any view can be shared as a link.
 */
export function FilterBar({ stores }: { stores: StoreOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeStore = normalizeScope(searchParams.get("store") ?? undefined, stores);
  const activeStoreLabel = labelForScope(activeStore, stores);
  const range = resolveDateRange(
    searchParams.get("range") ?? undefined,
    searchParams.get("from") ?? undefined,
    searchParams.get("to") ?? undefined,
  );
  const activePreset = range.preset;
  const rangeLabel = range.label;

  const apply = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    <div className="flex items-center gap-2">
      <Dropdown label="Store" value={activeStoreLabel} icon={<StoreMarkIcon width={14} height={14} />}>
        {(close) => (
          <>
            <DropdownItem
              selected={activeStore === ALL_STORES}
              onSelect={() => {
                apply({ store: null });
                close();
              }}
            >
              <span>All Stores</span>
              {activeStore === ALL_STORES ? <CheckIcon width={14} height={14} /> : null}
            </DropdownItem>
            <div className="my-1 h-px bg-line" />
            {stores.map((store) => (
              <DropdownItem
                key={store.id}
                selected={activeStore === store.id}
                onSelect={() => {
                  apply({ store: store.id });
                  close();
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate">{store.name}</span>
                  <span className="block truncate text-[11px] text-ink-muted">{store.domain}</span>
                </span>
                {activeStore === store.id ? <CheckIcon width={14} height={14} /> : null}
              </DropdownItem>
            ))}
          </>
        )}
      </Dropdown>

      <Dropdown
        label="Date range"
        value={PRESET_LABELS[activePreset]}
        icon={<CalendarIcon width={14} height={14} />}
        align="end"
        panelClassName="min-w-[268px]"
      >
        {(close) => (
          <DateRangePanel
            activePreset={activePreset}
            rangeLabel={rangeLabel}
            customFrom={range.start}
            customTo={range.end}
            onPreset={(preset) => {
              apply({ range: preset, from: null, to: null });
              close();
            }}
            onCustom={(from, to) => {
              apply({ range: "custom", from, to });
              close();
            }}
          />
        )}
      </Dropdown>
    </div>
  );
}

function DateRangePanel({
  activePreset,
  rangeLabel,
  customFrom,
  customTo,
  onPreset,
  onCustom,
}: {
  activePreset: DateRangePreset;
  rangeLabel: string;
  customFrom: string;
  customTo: string;
  onPreset: (preset: Exclude<DateRangePreset, "custom">) => void;
  onCustom: (from: string, to: string) => void;
}) {
  const [from, setFrom] = useState(customFrom);
  const [to, setTo] = useState(customTo);
  const isValid = isISODate(from) && isISODate(to) && from <= to;

  return (
    <>
      {DATE_RANGE_PRESETS.filter((preset) => preset !== "custom").map((preset) => (
        <DropdownItem
          key={preset}
          selected={activePreset === preset}
          onSelect={() => onPreset(preset as Exclude<DateRangePreset, "custom">)}
        >
          <span>{PRESET_LABELS[preset]}</span>
          {activePreset === preset ? <CheckIcon width={14} height={14} /> : null}
        </DropdownItem>
      ))}

      <div className="my-1 h-px bg-line" />

      <div className="px-2.5 pb-2 pt-1.5">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.04em] text-ink-muted">
          Custom
        </p>
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            aria-label="Start date"
            value={from}
            max={to || undefined}
            onChange={(event) => setFrom(event.target.value)}
            className="h-8 w-full rounded-[5px] border border-line bg-surface px-2 text-[12px] text-ink tabular"
          />
          <span aria-hidden className="text-ink-muted">
            –
          </span>
          <input
            type="date"
            aria-label="End date"
            value={to}
            min={from || undefined}
            onChange={(event) => setTo(event.target.value)}
            className="h-8 w-full rounded-[5px] border border-line bg-surface px-2 text-[12px] text-ink tabular"
          />
        </div>
        <button
          type="button"
          disabled={!isValid}
          onClick={() => onCustom(from, to)}
          className="mt-2 h-8 w-full rounded-[5px] bg-ink text-[12.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Apply range
        </button>
        <p className="mt-2 text-[11px] text-ink-muted">Showing {rangeLabel}</p>
      </div>
    </>
  );
}
