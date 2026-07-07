// Field-testing debug logger (docs/superpowers/sdd/debuglog-brief.md). Pure
// logic + localStorage-backed storage; the snapshot collects ONLY from
// existing stores/helpers (fusionStore, exploreStore, captureStore,
// perceptionStore/visionHot, toneStore, theme.ts) — omit rather than fake
// (spec hard rule), same discipline as TelemetryFooter's composeTelemetryLine.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendEntry,
  captureSnapshot,
  clearEntries,
  downloadMarkdown,
  getEntries,
  renderMarkdown,
  type DebugEntry,
} from "./debugLog";
import { useExploreStore } from "../explore/exploreStore";
import { useCaptureStore } from "../capture/captureStore";
import { useToneStore } from "../tone/toneStore";
import { visionHot } from "../perception/perceptionStore";
import { getFusionSnapshot } from "../fusion/fusionStore";

const STORAGE_KEY = "gt-debug-log";

function resetAllStores() {
  useExploreStore.setState({ mode: "practice", target: null, tier: "auto", loadError: null });
  useCaptureStore.setState({
    cameras: [],
    mics: [],
    cameraId: "",
    micId: "",
    phase: "idle",
    error: null,
    inputMeta: null,
    openStringsSeen: 0,
  });
  useToneStore.setState({ params: useToneStore.getState().params, preset: null });
  visionHot.H = null;
  visionHot.calibConf = 0;
  visionHot.calibSeenAt = 0;
}

describe("debugLog", () => {
  beforeEach(() => {
    localStorage.clear();
    resetAllStores();
  });

  describe("appendEntry / getEntries roundtrip", () => {
    it("appends an entry with an ISO timestamp, the note, and a snapshot, and getEntries reads it back", () => {
      const before = getEntries();
      expect(before).toEqual([]);

      const entry = appendEntry("pedal noise on the low E string");

      expect(entry.note).toBe("pedal noise on the low E string");
      expect(() => new Date(entry.t).toISOString()).not.toThrow();
      expect(entry.snapshot).toBeTruthy();

      const after = getEntries();
      expect(after).toHaveLength(1);
      expect(after[0]).toEqual(entry);
    });

    it("accumulates multiple entries in call order", () => {
      appendEntry("first");
      appendEntry("second");
      const entries = getEntries();
      expect(entries.map((e) => e.note)).toEqual(["first", "second"]);
    });
  });

  describe("200-entry cap", () => {
    it("drops the oldest entries once the log exceeds 200", () => {
      for (let i = 0; i < 205; i++) appendEntry(`note ${i}`);
      const entries = getEntries();
      expect(entries).toHaveLength(200);
      expect(entries[0].note).toBe("note 5");
      expect(entries[entries.length - 1].note).toBe("note 204");
    });
  });

  describe("corrupt localStorage recovery", () => {
    it("getEntries starts fresh (never throws) on invalid JSON", () => {
      localStorage.setItem(STORAGE_KEY, "{not valid json");
      expect(() => getEntries()).not.toThrow();
      expect(getEntries()).toEqual([]);
    });

    it("getEntries starts fresh when the stored value isn't an array", () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ oops: true }));
      expect(getEntries()).toEqual([]);
    });

    it("appendEntry recovers from corrupt storage instead of throwing", () => {
      localStorage.setItem(STORAGE_KEY, "]][[garbage");
      const entry = appendEntry("recovered fine");
      expect(getEntries()).toEqual([entry]);
    });
  });

  describe("renderMarkdown golden test", () => {
    it("renders a deterministic, parseable markdown doc from fixture entries", () => {
      vi.setSystemTime(new Date("2026-07-07T12:00:00.000Z"));
      vi.stubGlobal("navigator", { ...navigator, userAgent: "Mozilla/5.0 (fixture)" });

      const entries: DebugEntry[] = [
        {
          t: "2026-07-07T10:00:00.000Z",
          note: "chord detector froze on Am",
          snapshot: {
            mode: "practice",
            lesson: { id: "open_chords_c_major", stepIndex: 1 },
            capture: { phase: "running", cameraLabel: "FaceTime HD Camera", micLabel: "Scarlett Solo USB", micKind: "interface" },
            calibrated: true,
            audio: { chordLabel: "Am", chordConf: 0.87, tunerNote: "A2", tunerCents: -3.2, onsetCount: 12 },
            telemetryLine: "webgpu · rVFC · vision 120 fr · ring 340 rd · drop 0 · diag 4 · hints 1",
            tone: { preset: "clean", monitor: "amp", drive: 0.3, gateDb: -60, bassDb: 0, midDb: 0, trebleDb: 0, presenceDb: 0 },
            theme: "dark",
            userAgent: "Mozilla/5.0 (entry one)",
          },
        },
        {
          t: "2026-07-07T11:30:00.000Z",
          note: "no repro, just checking explore mode",
          snapshot: {
            mode: "explore",
            exploreTarget: { kind: "scale", root: "A", scaleType: "minor" },
            capture: { phase: "idle" },
            calibrated: false,
            audio: { onsetCount: 0 },
            telemetryLine: "vision 0 fr · diag 0 · hints 0",
            tone: { preset: null, monitor: "off", drive: 0.3, gateDb: -60, bassDb: 0, midDb: 0, trebleDb: 0, presenceDb: 0 },
            theme: "light",
            userAgent: "Mozilla/5.0 (entry two)",
          },
        },
      ];

      const md = renderMarkdown(entries);

      expect(md).toBe(
        [
          "# Guitar Trainer Debug Log",
          "",
          "- Generated: 2026-07-07T12:00:00.000Z",
          "- User agent: Mozilla/5.0 (fixture)",
          "- Entries: 2",
          "",
          "## [2026-07-07T10:00:00.000Z]",
          "",
          "> chord detector froze on Am",
          "",
          "```",
          "mode: practice",
          "lesson.id: open_chords_c_major",
          "lesson.stepIndex: 1",
          "capture.phase: running",
          "capture.cameraLabel: FaceTime HD Camera",
          "capture.micLabel: Scarlett Solo USB",
          "capture.micKind: interface",
          "calibrated: true",
          "audio.chordLabel: Am",
          "audio.chordConf: 0.87",
          "audio.tunerNote: A2",
          "audio.tunerCents: -3.2",
          "audio.onsetCount: 12",
          "telemetryLine: webgpu · rVFC · vision 120 fr · ring 340 rd · drop 0 · diag 4 · hints 1",
          "tone.preset: clean",
          "tone.monitor: amp",
          "tone.drive: 0.3",
          "tone.gateDb: -60",
          "tone.bassDb: 0",
          "tone.midDb: 0",
          "tone.trebleDb: 0",
          "tone.presenceDb: 0",
          "theme: dark",
          "userAgent: Mozilla/5.0 (entry one)",
          "```",
          "",
          "## [2026-07-07T11:30:00.000Z]",
          "",
          "> no repro, just checking explore mode",
          "",
          "```",
          "mode: explore",
          "exploreTarget.kind: scale",
          "exploreTarget.root: A",
          "exploreTarget.scaleType: minor",
          "capture.phase: idle",
          "calibrated: false",
          "audio.onsetCount: 0",
          "telemetryLine: vision 0 fr · diag 0 · hints 0",
          "tone.preset: (none)",
          "tone.monitor: off",
          "tone.drive: 0.3",
          "tone.gateDb: -60",
          "tone.bassDb: 0",
          "tone.midDb: 0",
          "tone.trebleDb: 0",
          "tone.presenceDb: 0",
          "theme: light",
          "userAgent: Mozilla/5.0 (entry two)",
          "```",
          "",
        ].join("\n"),
      );

      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it("renders an empty-log doc with zero entries and no entry sections", () => {
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      vi.stubGlobal("navigator", { ...navigator, userAgent: "Mozilla/5.0 (empty)" });

      const md = renderMarkdown([]);

      expect(md).toBe(
        ["# Guitar Trainer Debug Log", "", "- Generated: 2026-01-01T00:00:00.000Z", "- User agent: Mozilla/5.0 (empty)", "- Entries: 0", ""].join(
          "\n",
        ),
      );

      vi.useRealTimers();
      vi.unstubAllGlobals();
    });
  });

  describe("captureSnapshot — omits rather than fakes when stores are empty", () => {
    it("produces only real, currently-available fields from default/empty store state", () => {
      const snap = captureSnapshot();

      expect(snap.mode).toBe("practice");
      expect(snap.lesson).toBeUndefined();
      expect(snap.exploreTarget).toBeUndefined();
      expect(snap.capture).toEqual({ phase: "idle" });
      expect(snap.calibrated).toBe(false);
      expect(snap.audio).toEqual({ onsetCount: 0 });
      expect(typeof snap.telemetryLine).toBe("string");
      expect(snap.tone.preset).toBeNull();
      expect(snap.tone.monitor).toBe("off");
      expect(typeof snap.theme).toBe("string");
      expect(typeof snap.userAgent).toBe("string");
      expect(snap.userAgent.length).toBeGreaterThan(0);
    });

    it("reflects real store values once they're populated (lesson, capture device labels, calibration)", () => {
      useExploreStore.setState({ mode: "practice" });
      useCaptureStore.setState({
        cameras: [{ deviceId: "cam1", label: "FaceTime HD Camera" } as MediaDeviceInfo],
        mics: [{ deviceId: "mic1", label: "Scarlett Solo USB" } as MediaDeviceInfo],
        cameraId: "cam1",
        micId: "mic1",
        phase: "running",
      });
      visionHot.H = { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0, g: 0, h: 0 } as unknown as typeof visionHot.H;

      const snap = captureSnapshot();
      expect(snap.capture).toEqual({
        phase: "running",
        cameraLabel: "FaceTime HD Camera",
        micLabel: "Scarlett Solo USB",
        micKind: "interface",
      });
      expect(snap.calibrated).toBe(true);
    });

    it("reflects an idle fusionStore lessonId as an omitted `lesson` field", () => {
      // fusionStore's snapshot starts empty (lessonId null) until startLesson()
      // runs the real lesson/chord-lib machinery; the `lesson` omission above
      // already covers that path. This documents the store this reads from.
      expect(getFusionSnapshot().lessonId).toBeNull();
    });
  });

  describe("zero network", () => {
    it("appendEntry never calls fetch", () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      appendEntry("no network please");
      expect(fetchSpy).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it("downloadMarkdown never calls fetch (Blob + anchor only)", () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      const createObjectURLSpy = vi.fn(() => "blob:fake");
      const revokeObjectURLSpy = vi.fn();
      vi.stubGlobal("URL", { ...URL, createObjectURL: createObjectURLSpy, revokeObjectURL: revokeObjectURLSpy });

      appendEntry("one entry so the doc isn't empty");
      downloadMarkdown();

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURLSpy).toHaveBeenCalledTimes(1);

      clickSpy.mockRestore();
      vi.unstubAllGlobals();
    });

    it("names the download guitar-debug-YYYY-MM-DD.md", () => {
      vi.setSystemTime(new Date("2026-07-07T12:00:00.000Z"));
      vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:fake"), revokeObjectURL: vi.fn() });

      let capturedName = "";
      const originalCreateElement = document.createElement.bind(document);
      const createElementSpy = vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
        const el = originalCreateElement(tag);
        if (tag === "a") {
          Object.defineProperty(el, "click", { value: () => {}, configurable: true });
        }
        return el;
      });

      appendEntry("for filename check");
      downloadMarkdown();
      createElementSpy.mock.results.forEach((r) => {
        const el = r.value as HTMLElement;
        if (el.tagName === "A" && (el as HTMLAnchorElement).download) {
          capturedName = (el as HTMLAnchorElement).download;
        }
      });
      expect(capturedName).toBe("guitar-debug-2026-07-07.md");

      createElementSpy.mockRestore();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });
  });

  describe("clearEntries", () => {
    it("empties the log", () => {
      appendEntry("one");
      appendEntry("two");
      expect(getEntries()).toHaveLength(2);
      clearEntries();
      expect(getEntries()).toEqual([]);
    });
  });
});
