import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";
import { _lastErrorReportForTest } from "./sentry";

const SENTINEL = "SENTINEL-DO-NOT-LEAK-9f3a";

// A child that carries a sensitive prop AND throws on first render.
function Boom({ secret }: { secret: string }): never {
  void secret; // the sentinel rides on props/state — it must NOT reach the report
  throw new Error("render failed");
}

let shouldThrow = true;
function MaybeBoom({ secret }: { secret: string }) {
  if (shouldThrow) return <Boom secret={secret} />;
  return <div>recovered</div>;
}

describe("no-leak ErrorBoundary", () => {
  beforeEach(() => {
    shouldThrow = true;
    // React logs caught render errors to console.error — silence the noise.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders the fallback with a retry when a child throws", () => {
    render(
      <ErrorBoundary>
        <MaybeBoom secret={SENTINEL} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("captures error + component stack ONLY — the sentinel prop never leaks", () => {
    render(
      <ErrorBoundary>
        <MaybeBoom secret={SENTINEL} />
      </ErrorBoundary>,
    );
    const report = _lastErrorReportForTest() as {
      exception: { message: string };
      componentStack: string;
    };
    // The report carries the error and the component stack…
    expect(report.exception.message).toBe("render failed");
    expect(report.componentStack).toContain("Boom");
    // …but NEVER the child's prop value.
    expect(JSON.stringify(report)).not.toContain(SENTINEL);
  });

  it("retry re-mounts the subtree", () => {
    render(
      <ErrorBoundary>
        <MaybeBoom secret={SENTINEL} />
      </ErrorBoundary>,
    );
    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(screen.getByText("recovered")).toBeInTheDocument();
  });
});
