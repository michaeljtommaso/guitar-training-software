// No-leak ErrorBoundary (WP-7, §15). A plain React boundary: componentDidCatch
// receives ONLY the error and the component stack (component names) — never
// props, state, or DOM snapshots — so the captured report cannot leak them.
// The fallback offers a retry that re-mounts the subtree.
import { Component, type ErrorInfo, type ReactNode } from "react";
import { captureComponentError } from "./sentry";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}
interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Only error + componentStack cross into the report. Nothing else is passed.
    captureComponentError(error, info.componentStack ?? "");
  }

  private retry = () => this.setState({ hasError: false });

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div role="alert" className="error-fallback">
        <p>Something went wrong.</p>
        <button type="button" onClick={this.retry}>
          Retry
        </button>
      </div>
    );
  }
}
