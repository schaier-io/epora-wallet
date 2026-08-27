"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { AlertOctagon, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
};

type ErrorBoundaryCopy = {
  reloadPage: string;
  recoveryHint: string;
  title: string;
  tryAgain: string;
};

type LocalizedErrorBoundaryProps = ErrorBoundaryProps & {
  copy: ErrorBoundaryCopy;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

class LocalizedErrorBoundary extends Component<LocalizedErrorBoundaryProps, ErrorBoundaryState> {
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
      process.env.NODE_ENV === "development" && this.state.error?.message
        ? this.state.error.message
        : this.props.copy.recoveryHint;

    return (
      <div
        role="alert"
        className="mx-auto my-12 flex max-w-2xl flex-col items-start gap-4 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-foreground shadow-panel backdrop-blur"
      >
        <div className="inline-flex items-center gap-2 text-rose-200">
          <AlertOctagon className="h-5 w-5" aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-[0.18em]">
            {this.props.copy.title}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">{message}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={this.reset}>
            <RefreshCw className="h-3.5 w-3.5" />
            {this.props.copy.tryAgain}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={this.reload}>
            {this.props.copy.reloadPage}
          </Button>
        </div>
      </div>
    );
  }
}

export function ErrorBoundary(props: ErrorBoundaryProps) {
  const i18n = useTranslations("ComponentsErrorBoundary");
  const copy: ErrorBoundaryCopy = {
    reloadPage: i18n("reloadPage"),
    recoveryHint: i18n("recoveryHint"),
    title: i18n("title"),
    tryAgain: i18n("tryAgain")
  };

  return <LocalizedErrorBoundary {...props} copy={copy} />;
}
