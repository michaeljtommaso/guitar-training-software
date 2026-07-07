// VideoMount (v2-ui T6): mounts the capture host's singleton <video> element
// into the current screen by physically appending the SAME DOM node — this is
// what lets the live capture survive the Wizard → PracticeScreen swap without
// a stop/restart (the element, its srcObject and the controller's frame pump
// all stay intact; only its position in the document changes).
//
// Moving a playing media element between documents/parents can pause it in
// some engines, so we re-issue play() on every attach — a no-op when already
// playing, a resume when the move paused it, and a harmless rejection when
// nothing is attached yet.
import { useCallback } from "react";

export function VideoMount({ video }: { video: HTMLVideoElement }) {
  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return; // unmount — the host keeps the element alive off-DOM
      if (video.parentElement !== node) node.appendChild(video);
      if (!video.srcObject) return; // nothing to resume; autoplay covers the real start path
      try {
        // jsdom's play() is unimplemented (returns undefined) — guard both.
        const p = video.play();
        if (p && typeof p.catch === "function") p.catch(() => undefined);
      } catch {
        /* not ready — harmless, next attach retries */
      }
    },
    [video],
  );
  return <div className="video-mount" data-testid="video-mount" ref={attach} />;
}
