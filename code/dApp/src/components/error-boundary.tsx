"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { AlertOctagon, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

// The raw `Error.message` is a developer string: it says things like "Cannot read
// properties of undefined (reading 'datum')" or names an SDK internal. It is not shown;
// the reader gets a written sentence and two ways out.
function ErrorFallback({ onReset, onReload }: { onReset: () => void; onReload: () => void }) {
  const i18n = useTranslations("ComponentsErrorBoundary");

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
          <p className="eyebrow font-semibold">{i18n("somethingWentWrong")}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {i18n("thisPartOfThePageStoppedWorking")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={onReset}>
            <RefreshCw className="h-3.5 w-3.5" />
            {i18n("tryAgain")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onReload}>
            {i18n("reloadPage")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (process.env.NODE_ENV !== "production") {
      // surface the stack in dev so it remains debuggable

      console.error("[ErrorBoundary]", error, info.componentStack);
    }
  }

  reset = () => {
    this.setState({ hasError: false });
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

    return <ErrorFallback onReset={this.reset} onReload={this.reload} />;
  }
}
