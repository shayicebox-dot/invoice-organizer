'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Contains a rendering failure to the part of a diagnostic that failed.
 *
 * A diagnostic renders values nobody has seen yet — that is what it is for. One
 * of them being a shape this code did not expect must degrade that row, or that
 * panel, and nothing else: an uncaught error in a client component unmounts the
 * whole tree, so a single malformed payment would otherwise take Settings down
 * and hide the very evidence the panel exists to show.
 *
 * A React error boundary has to be a class; there is no hook equivalent.
 */

type DiagnosticBoundaryProps = {
  /** Shown instead of the children when they throw. Must fit where they sat. */
  readonly fallback: ReactNode;
  readonly children: ReactNode;
};

type DiagnosticBoundaryState = {
  readonly failed: boolean;
};

export class DiagnosticBoundary extends Component<
  DiagnosticBoundaryProps,
  DiagnosticBoundaryState
> {
  override state: DiagnosticBoundaryState = { failed: false };

  static getDerivedStateFromError(): DiagnosticBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // The browser console is the right place for this: it is a developer's
    // problem, not the owner's, and financial data must not be sent anywhere.
    // Only the message and the component stack — never the value that caused
    // it, which is provider data.
    console.error('Diagnostic row failed to render:', error.message, info.componentStack);
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
