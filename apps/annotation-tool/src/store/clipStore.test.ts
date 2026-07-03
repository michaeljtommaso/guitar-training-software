import { beforeEach, describe, expect, it } from "vitest";
import { buildDeletionReceipt, rankByUncertainty, useClipStore } from "./clipStore";

describe("rankByUncertainty", () => {
  it("sorts ascending by confidence (most uncertain first)", () => {
    const items = [
      { clipId: "a", t: 0, code: "wrong_fret", conf: 0.9 },
      { clipId: "b", t: 1, code: "ok", conf: 0.1 },
      { clipId: "c", t: 2, code: "muted_string", conf: 0.5 },
    ];
    expect(rankByUncertainty(items).map((i) => i.clipId)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate the input array", () => {
    const items = [{ clipId: "a", t: 0, code: "ok", conf: 0.9 }, { clipId: "b", t: 0, code: "ok", conf: 0.1 }];
    const before = [...items];
    rankByUncertainty(items);
    expect(items).toEqual(before);
  });
});

describe("buildDeletionReceipt", () => {
  it("captures who/what/when for the deleted clip", () => {
    const receipt = buildDeletionReceipt("clip-1", "mikey", { fingerAssignments: 3, tags: 2 }, () => new Date("2026-07-03T00:00:00.000Z"));
    expect(receipt).toEqual({
      clipId: "clip-1",
      deletedBy: "mikey",
      deletedAt: "2026-07-03T00:00:00.000Z",
      itemsRemoved: { fingerAssignments: 3, tags: 2 },
    });
  });
});

describe("useClipStore", () => {
  beforeEach(() => {
    useClipStore.setState({
      clipId: null,
      annotator: "",
      fps: 30,
      quad: null,
      fingerAssignments: [],
      tags: [],
      consent: { given: false, scope: "", date: "" },
      queue: [],
      lastReceipt: null,
    });
  });

  it("loadClip resets per-clip annotation state", () => {
    const s = useClipStore.getState();
    s.addTag({ start: 0, end: 1, code: "ok" });
    s.loadClip("clip-2", 24);
    const after = useClipStore.getState();
    expect(after.clipId).toBe("clip-2");
    expect(after.fps).toBe(24);
    expect(after.tags).toEqual([]);
  });

  it("adds and removes finger assignments by index", () => {
    const s = useClipStore.getState();
    s.addFingerAssignment({ frame: 1, t: 0.03, finger: "index", string: 2, fret: 1 });
    s.addFingerAssignment({ frame: 1, t: 0.03, finger: "middle", string: 4, fret: 2 });
    expect(useClipStore.getState().fingerAssignments).toHaveLength(2);
    useClipStore.getState().removeFingerAssignment(0);
    const remaining = useClipStore.getState().fingerAssignments;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].finger).toBe("middle");
  });

  it("adds and removes mistake tags by index", () => {
    const s = useClipStore.getState();
    s.addTag({ start: 0, end: 0.5, code: "wrong_fret" });
    s.addTag({ start: 0.5, end: 1, code: "muted_string", note: "6th string" });
    expect(useClipStore.getState().tags).toHaveLength(2);
    useClipStore.getState().removeTag(0);
    expect(useClipStore.getState().tags).toEqual([{ start: 0.5, end: 1, code: "muted_string", note: "6th string" }]);
  });

  it("importQueue stores items ranked ascending by confidence", () => {
    useClipStore.getState().importQueue([
      { clipId: "a", t: 0, code: "ok", conf: 0.8 },
      { clipId: "b", t: 0, code: "ok", conf: 0.2 },
    ]);
    expect(useClipStore.getState().queue.map((i) => i.clipId)).toEqual(["b", "a"]);
  });

  it("deleteClipData clears assignments/tags/quad/consent and produces a receipt", () => {
    useClipStore.setState({ clipId: "clip-9", annotator: "mikey" });
    const s = useClipStore.getState();
    s.addFingerAssignment({ frame: 0, t: 0, finger: "thumb", string: 6, fret: 0 });
    s.addTag({ start: 0, end: 1, code: "ok" });
    s.setQuad([[0, 0], [1, 0], [1, 1], [0, 1]]);
    s.setConsent({ given: true, scope: "internal", date: "2026-07-03" });

    s.deleteClipData();

    const after = useClipStore.getState();
    expect(after.fingerAssignments).toEqual([]);
    expect(after.tags).toEqual([]);
    expect(after.quad).toBeNull();
    expect(after.consent).toEqual({ given: false, scope: "", date: "" });
    expect(after.lastReceipt).toMatchObject({
      clipId: "clip-9",
      deletedBy: "mikey",
      itemsRemoved: { fingerAssignments: 1, tags: 1 },
    });
  });

  it("deleteClipData is a no-op when no clip is loaded", () => {
    useClipStore.getState().deleteClipData();
    expect(useClipStore.getState().lastReceipt).toBeNull();
  });
});
