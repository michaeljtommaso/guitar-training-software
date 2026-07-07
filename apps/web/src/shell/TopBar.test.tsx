import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { TopBar } from "./TopBar";
import { getFusionSnapshot, stopLesson } from "../fusion/fusionStore";
import { useExploreStore } from "../explore/exploreStore";
import { useCaptureStore } from "../capture/captureStore";
import { useToneStore } from "../tone/toneStore";

const C_MAJOR = "open_chords_c_major";
const TRANSITION = "transition_c_g"; // 2 steps — for next-step assertions

function baseProps(overrides: Partial<Parameters<typeof TopBar>[0]> = {}) {
  return {
    theme: "dark" as const,
    onToggleTheme: vi.fn(),
    consoleOpen: false,
    onToggleConsole: vi.fn(),
    ...overrides,
  };
}

describe("TopBar", () => {
  beforeEach(() => {
    stopLesson();
    useExploreStore.getState().setMode("practice");
    useCaptureStore.setState({ mics: [], micId: "", cameras: [], cameraId: "" });
    useToneStore.setState({ params: { ...useToneStore.getState().params, monitor: "off" }, preset: null });
  });
  afterEach(() => {
    stopLesson();
    vi.useRealTimers();
  });

  it("renders the lesson picker with the shipped catalog + a disabled browse-all row", () => {
    render(<TopBar {...baseProps()} />);
    const picker = screen.getByTestId("topbar-lesson-picker") as HTMLSelectElement;
    expect(within(picker).getByText(/C major \(open\)/)).toBeInTheDocument();
    const browseRow = within(picker).getByText(/Browse all lessons/);
    expect(browseRow.closest("option")).toBeDisabled();
  });

  it("selecting a lesson starts it (fusionStore) and applies its tone preset", () => {
    render(<TopBar {...baseProps()} />);
    fireEvent.change(screen.getByTestId("topbar-lesson-picker"), { target: { value: C_MAJOR } });
    expect(getFusionSnapshot().lessonId).toBe(C_MAJOR);
    expect(useToneStore.getState().preset).toBe("Clean Chord Practice");
  });

  it("selecting 'No lesson' stops the active lesson", () => {
    render(<TopBar {...baseProps()} />);
    fireEvent.change(screen.getByTestId("topbar-lesson-picker"), { target: { value: C_MAJOR } });
    expect(getFusionSnapshot().lessonId).toBe(C_MAJOR);
    fireEvent.change(screen.getByTestId("topbar-lesson-picker"), { target: { value: "" } });
    expect(getFusionSnapshot().lessonId).toBeNull();
  });

  it("mode toggle preserves testids and drives useExploreStore.setMode", () => {
    render(<TopBar {...baseProps()} />);
    expect(screen.getByTestId("mode-practice")).toHaveClass("active");
    fireEvent.click(screen.getByTestId("mode-explore"));
    expect(useExploreStore.getState().mode).toBe("explore");
    expect(screen.getByTestId("mode-explore")).toHaveClass("active");
  });

  it("step x/y + next-step only show in practice mode with an active multi-step lesson", () => {
    render(<TopBar {...baseProps()} />);
    expect(screen.queryByTestId("topbar-step")).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId("topbar-lesson-picker"), { target: { value: TRANSITION } });
    expect(screen.getByTestId("topbar-step")).toHaveTextContent("step 1/2");
    fireEvent.click(screen.getByTestId("topbar-next-step"));
    expect(getFusionSnapshot().stepIndex).toBe(1);
    expect(screen.getByTestId("topbar-step")).toHaveTextContent("step 2/2");

    // Switching to explore hides the step cluster even with a lesson loaded.
    fireEvent.click(screen.getByTestId("mode-explore"));
    expect(screen.queryByTestId("topbar-step")).not.toBeInTheDocument();
  });

  it("single-step lesson shows step count but no next-step button", () => {
    render(<TopBar {...baseProps()} />);
    fireEvent.change(screen.getByTestId("topbar-lesson-picker"), { target: { value: C_MAJOR } });
    expect(screen.getByTestId("topbar-step")).toHaveTextContent("step 1/1");
    expect(screen.queryByTestId("topbar-next-step")).not.toBeInTheDocument();
  });

  it("tone preset select applies TONE_PRESETS via the toneStore", () => {
    render(<TopBar {...baseProps()} />);
    fireEvent.change(screen.getByTestId("topbar-tone-preset"), { target: { value: "Lead Sustain" } });
    expect(useToneStore.getState().preset).toBe("Lead Sustain");
  });

  it("input badge reflects classifyAudioInput + shows amber styling for a direct-input device", () => {
    useCaptureStore.setState({
      mics: [{ deviceId: "1", label: "Focusrite Scarlett 2i2", kind: "audioinput" } as MediaDeviceInfo],
      micId: "1",
    });
    render(<TopBar {...baseProps()} />);
    const badge = screen.getByTestId("topbar-input-badge");
    expect(badge).toHaveTextContent("DI");
    expect(badge).toHaveTextContent("Focusrite Scarlett 2i2");
    expect(badge.className).toContain("topbar-input-badge--interface");
  });

  it("input badge click opens the console (spec §3: post-setup input changes live in the drawer)", () => {
    const props = baseProps();
    render(<TopBar {...props} />);
    fireEvent.click(screen.getByTestId("topbar-input-badge"));
    expect(props.onToggleConsole).toHaveBeenCalledTimes(1);
  });

  it("shows a feedback-risk warning when a plain mic is monitoring live", () => {
    useCaptureStore.setState({
      mics: [{ deviceId: "1", label: "Built-in Microphone", kind: "audioinput" } as MediaDeviceInfo],
      micId: "1",
    });
    useToneStore.setState({ params: { ...useToneStore.getState().params, monitor: "amp" } });
    render(<TopBar {...baseProps()} />);
    expect(screen.getByTestId("topbar-feedback-warning")).toBeInTheDocument();
  });

  it("does not show the feedback warning when monitor is off", () => {
    useCaptureStore.setState({
      mics: [{ deviceId: "1", label: "Built-in Microphone", kind: "audioinput" } as MediaDeviceInfo],
      micId: "1",
    });
    render(<TopBar {...baseProps()} />);
    expect(screen.queryByTestId("topbar-feedback-warning")).not.toBeInTheDocument();
  });

  it("renders an hh:mm clock and refreshes every minute", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 13, 25));
    render(<TopBar {...baseProps()} />);
    expect(screen.getByTestId("topbar-clock")).toHaveTextContent("13:25");
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByTestId("topbar-clock")).toHaveTextContent("13:26");
  });

  it("theme + console buttons are pure callbacks (no owned state)", () => {
    const onToggleTheme = vi.fn();
    const onToggleConsole = vi.fn();
    render(<TopBar {...baseProps({ onToggleTheme, onToggleConsole, consoleOpen: true })} />);
    fireEvent.click(screen.getByTestId("topbar-theme-toggle"));
    expect(onToggleTheme).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("topbar-console-toggle"));
    expect(onToggleConsole).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("topbar-console-toggle")).toHaveAttribute("aria-pressed", "true");
  });
});
