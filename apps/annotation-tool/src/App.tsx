import { useMemo, useRef, useState } from "react";
import "./App.css";
import { VideoStage } from "./components/VideoStage";
import { WaveformCanvas } from "./components/WaveformCanvas";
import { SpectrogramCanvas } from "./components/SpectrogramCanvas";
import { QuadOverlay, defaultQuad } from "./components/QuadOverlay";
import { FingerAssignPanel } from "./components/FingerAssignPanel";
import { MistakeTagPanel } from "./components/MistakeTagPanel";
import { ActiveLearningQueue } from "./components/ActiveLearningQueue";
import { ConsentPanel } from "./components/ConsentPanel";
import { decodeVideoAudio } from "./audio/decodeVideoAudio";
import { buildCocoFile, buildJamsFile, buildTaxonomyFile, downloadJson, readJsonFile } from "./io/exportImport";
import { TaxonomyFileSchema } from "./schemas/taxonomy";
import { useClipStore } from "./store/clipStore";
import type { Finger } from "./shared/diagnosis";

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoSize, setVideoSize] = useState({ width: 1280, height: 720 });
  const [audio, setAudio] = useState<{ channel: Float32Array; sampleRate: number } | null>(null);
  const [selectedFinger, setSelectedFinger] = useState<Finger>("index");

  const clip = useClipStore();
  const currentFrame = Math.round(currentTime * clip.fps);

  const handleFile = async (file: File) => {
    clip.loadClip(file.name, clip.fps);
    try {
      const decoded = await decodeVideoAudio(file);
      setAudio({ channel: decoded.channel, sampleRate: decoded.sampleRate });
    } catch (err) {
      console.warn("annotation-tool: could not decode audio track", err);
      setAudio(null);
    }
  };

  const handleLoadedMeta = (el: HTMLVideoElement) => {
    const size = { width: el.videoWidth || 1280, height: el.videoHeight || 720 };
    setVideoSize(size);
    if (!clip.quad) clip.setQuad(defaultQuad(size.width, size.height));
  };

  const seek = (t: number) => {
    if (videoRef.current) videoRef.current.currentTime = t;
  };

  const exportable = useMemo(
    () => ({
      clipId: clip.clipId ?? "unknown-clip",
      annotator: clip.annotator,
      consent: clip.consent,
      quad: clip.quad,
      fingerAssignments: clip.fingerAssignments,
      tags: clip.tags,
    }),
    [clip.clipId, clip.annotator, clip.consent, clip.quad, clip.fingerAssignments, clip.tags],
  );

  const handleImportTaxonomy = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const raw = await readJsonFile(file);
    const parsed = TaxonomyFileSchema.parse(raw);
    clip.loadClip(parsed.clipId, clip.fps);
    clip.setAnnotator(parsed.annotator);
    clip.setConsent(parsed.consent);
    if (parsed.quad) clip.setQuad(parsed.quad);
    for (const a of parsed.fingerAssignments) clip.addFingerAssignment(a);
    for (const t of parsed.tags) clip.addTag(t);
    e.target.value = "";
  };

  return (
    <main className="app-shell">
      <h1>Guitar tutor — annotation tool</h1>
      <p className="internal-note">
        Internal data-lane tool (WP-6). Not shipped to end users — see README for why the license firewall
        (scripts/check-licenses.mjs) intentionally does not scan this app.
      </p>

      <div className="stage-row">
        <div className="video-wrap">
          <VideoStage
            fps={clip.fps}
            videoRef={videoRef}
            onFile={(f) => void handleFile(f)}
            onTimeUpdate={(t, d) => {
              setCurrentTime(t);
              setDuration(d);
            }}
            onLoadedMeta={handleLoadedMeta}
          />
          {clip.quad && (
            <QuadOverlay
              videoWidth={videoSize.width}
              videoHeight={videoSize.height}
              quad={clip.quad}
              onQuadChange={clip.setQuad}
              onCellClick={({ px, py, string, fret }) =>
                clip.addFingerAssignment({
                  frame: currentFrame,
                  t: currentTime,
                  finger: selectedFinger,
                  string,
                  fret,
                  px,
                  py,
                })
              }
            />
          )}
        </div>

        <div className="side-panels">
          <label className="fps-control">
            fps
            <input
              type="number"
              min={1}
              max={240}
              value={clip.fps}
              onChange={(e) => clip.setFps(Math.max(1, Number(e.target.value) || 30))}
            />
          </label>
          <label className="fps-control">
            Annotator
            <input type="text" value={clip.annotator} onChange={(e) => clip.setAnnotator(e.target.value)} />
          </label>

          <FingerAssignPanel
            frame={currentFrame}
            selectedFinger={selectedFinger}
            onSelectFinger={setSelectedFinger}
            assignments={clip.fingerAssignments}
            onDelete={clip.removeFingerAssignment}
          />
          <MistakeTagPanel currentTime={currentTime} tags={clip.tags} onAdd={clip.addTag} onDelete={clip.removeTag} />
          <ConsentPanel consent={clip.consent} onChange={clip.setConsent} onDeleteClip={clip.deleteClipData} />
          {clip.lastReceipt && (
            <button type="button" onClick={() => downloadJson(`${clip.lastReceipt!.clipId}_deletion-receipt.json`, clip.lastReceipt)}>
              Download deletion receipt
            </button>
          )}
        </div>
      </div>

      <WaveformCanvas channel={audio?.channel ?? null} duration={duration} currentTime={currentTime} onSeek={seek} />
      <SpectrogramCanvas
        channel={audio?.channel ?? null}
        sampleRate={audio?.sampleRate ?? 48000}
        duration={duration}
        currentTime={currentTime}
      />

      <ActiveLearningQueue queue={clip.queue} onImport={clip.importQueue} onSelect={(item) => seek(item.t)} />

      <section className="panel">
        <h2>Export / import</h2>
        <div className="export-row">
          <button type="button" onClick={() => downloadJson(`${exportable.clipId}.taxonomy.json`, buildTaxonomyFile(exportable))}>
            Export taxonomy JSON
          </button>
          <button type="button" onClick={() => downloadJson(`${exportable.clipId}.jams.json`, buildJamsFile(exportable, duration))}>
            Export JAMS JSON
          </button>
          <button
            type="button"
            onClick={() =>
              downloadJson(
                `${exportable.clipId}.coco.json`,
                buildCocoFile(exportable, { width: videoSize.width, height: videoSize.height, fps: clip.fps }),
              )
            }
          >
            Export COCO keypoints JSON
          </button>
          <label className="import-btn">
            Import taxonomy JSON
            <input type="file" accept="application/json" onChange={(e) => void handleImportTaxonomy(e)} />
          </label>
        </div>
      </section>
    </main>
  );
}

export default App;
