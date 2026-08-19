"use client";

import { type RefObject, useEffect, useState } from "react";

/**
 * Track a container's rendered width so charts can be drawn at real pixel
 * sizes. Scaling a fixed viewBox instead would stretch strokes and text.
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>, fallback = 720): number {
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next && Math.abs(next - width) > 0.5) setWidth(next);
    });

    observer.observe(element);
    setWidth(element.clientWidth || fallback);
    return () => observer.disconnect();
    // `width` is intentionally excluded: it is written by this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, fallback]);

  return width;
}
