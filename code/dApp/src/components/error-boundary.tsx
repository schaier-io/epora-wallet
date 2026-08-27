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

    // The raw `Error.message` is a developer string: it says things like "Cannot read
    // properties of undefined (reading 'datum')" or names an SDK internal. It used to be
    // the only sentence on the screen, so a reader whose wallet page had just broken was
    // handed a stack fragment and no idea what it meant or what to do. It is still here,
    // because it is what a bug report needs, but it sits behind a summary instead of
    // standing in for an explanation.
    const technicalMessage = this.state.error?.message ?? null;

    return (
      // The fallback replaces `#main`, whose ancestors carry no horizontal padding,
      // so it has to bring the shell's gutter with it rather than relying on one.
      <div className="container py-10">
        <div
          role="alert"
          className="mx-auto flex max-w-2xl flex-col items-start gap-4 rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-foreground shadow-panel backdrop-blur sm:p-6"
        >
          <div className="inline-flex items-center gap-2 text-rose-200">
            <AlertOctagon className="h-5 w-5" aria-hidden="true" />
            <p className="eyebrow font-semibold">Something went wrong</p>
          </div>
          <p className="text-sm text-muted-foreground">
            This part of the page stopped working. Reloading usually fixes it. If it keeps
            happening, the details below say what failed.
          </p>
          {technicalMessage ? (
            <details className="w-full rounded-md border border-border/60 bg-muted/20 p-3">
              <summary className="cursor-pointer text-sm font-medium text-foreground">
                Technical details
              </summary>
              <p className="mt-3 break-words font-mono text-xs text-muted-foreground">
                {technicalMessage}
              </p>
            </details>
          ) : null}
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
      </div>
    );
  }
}
