import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  it("renders the app title", () => {
    render(<App />);
    expect(screen.getByText("Guitar tutor")).toBeInTheDocument();
  });

  it("flips data-theme on <html> when the toggle is clicked", () => {
    document.documentElement.removeAttribute("data-theme");
    render(<App />);
    const toggle = screen.getByRole("button", { name: /switch to/i });

    fireEvent.click(toggle);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    fireEvent.click(toggle);
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });
});
