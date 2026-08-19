"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { ChevronDownIcon } from "@/components/ui/icons";

/**
 * A small popover trigger used by the store and date filters. Closes on
 * outside click, on Escape, and whenever the panel asks to close after a
 * selection.
 */
export function Dropdown({
  label,
  value,
  icon,
  align = "start",
  panelClassName,
  children,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  align?: "start" | "end";
  panelClassName?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex h-8 items-center gap-2 rounded-[6px] border border-line bg-surface pl-2.5 pr-2 text-[13px] text-ink transition-colors hover:border-line-strong hover:bg-surface-muted",
          open && "border-line-strong bg-surface-muted",
        )}
      >
        {icon ? <span className="text-ink-muted">{icon}</span> : null}
        <span className="sr-only">{label}: </span>
        <span className="max-w-[180px] truncate font-medium">{value}</span>
        <ChevronDownIcon className="text-ink-muted" width={14} height={14} />
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={label}
          className={cn(
            "absolute z-30 mt-1.5 min-w-[220px] rounded-lg border border-line bg-surface p-1 shadow-[0_8px_24px_rgba(16,16,18,0.10)]",
            align === "end" ? "right-0" : "left-0",
            panelClassName,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

export function DropdownItem({
  children,
  selected = false,
  onSelect,
}: {
  children: ReactNode;
  selected?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-[5px] px-2.5 py-[7px] text-left text-[13px] transition-colors",
        selected ? "bg-surface-sunken font-medium text-ink" : "text-ink-secondary hover:bg-surface-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
