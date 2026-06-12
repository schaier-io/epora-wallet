"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertOctagon, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (process.env.NODE_ENV !== "production") {
      // surface the stack in dev so it remains debuggable

      console.error("[ErrorBoundary]", error, info.componentStack);
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  reload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    const message =
      this.state.error?.message ??
      "An unexpected error occurred while rendering this view.";

    return (
      <div
        role="alert"
        className="mx-auto my-12 flex max-w-2xl flex-col items-start gap-4 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-foreground shadow-panel backdrop-blur"
      >
        <div className="inline-flex items-center gap-2 text-rose-200">
          <AlertOctagon className="h-5 w-5" aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-[0.18em]">Something went wrong</p>
        </div>
        <p className="text-sm text-muted-foreground">{message}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={this.reset}>
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={this.reload}>
            Reload page
          </Button>
        </div>
      </div>
    );
  }
}
