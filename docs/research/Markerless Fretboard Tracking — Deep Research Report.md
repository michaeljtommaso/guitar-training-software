# Markerless Fretboard Tracking — Deep Research Report

**Feature Proposal:** `docs/proposals/markerless-fretboard-tracking.md`
**Date:** 2026-07-07
**Scope:** Research only — not yet scoped for a work package

***

## Executive Summary

Real-time markerless guitar fretboard tracking is technically feasible but sits on a spectrum of effort versus robustness. The most practical path for the existing browser-based architecture is a **hybrid approach**: use the one-shot calibration homography as a seeded anchor, then apply frame-to-frame planar tracking via **OpenCV.js sparse optical flow** (`calcOpticalFlowPyrLK`) to propagate `H` cheaply each frame. This avoids a per-frame detector entirely, fits inside the remaining budget after MediaPipe HandLandmarker (~17ms on Pixel 6 CPU), and can be implemented almost entirely within the existing `visionWorker.ts` without new model weights. A fiducial sticker on the headstock is the next cheapest option and dramatically outperforms both pure classical CV and learned approaches on robustness-per-effort. Full markerless detection — either Hough-based or deep-learned — is the long-term goal but is not recommended as a first implementation step given the browser budget and occlusion constraints.[^1]

***

## 1. Existing Open-Source Projects

### 1.1 TabbyCat (Samuel Keke, 2025)

A Python/OpenCV/MediaPipe system that detects the guitar fretboard and string positions in real-time and maps finger placements to specific frets and strings. Uses geometric algorithms for perspective correction and MediaPipe for hand landmark detection alongside OpenCV for fretboard recognition. Not browser-based; no public GitHub link has been confirmed at time of research, only a LinkedIn announcement. The technique (fretboard bounding + perspective correction + hand landmark overlay) is directly analogous to what the proposal requires.[^2]

### 1.2 guitar-augmented-reality (abhishekrana, 2019)

[GitHub: abhishekrana/guitar-augmented-reality](https://github.com/abhishekrana/guitar-augmented-reality)[^3]

- **What it does:** Detects the guitar fretboard via a trained UNet segmentation model, projects a mesh onto the detected region using a homography, then overlays notes to play.
- **Technique:** Deep learning segmentation (UNet) → binary fretboard mask → homography solve from mask quad → note projection.
- **Stack:** Python, Docker, TensorFlow/Keras. Training images are custom-collected and manually masked.
- **Real-time:** Not documented as real-time; inference is Python-based server-side.
- **License:** Not specified (research demo).
- **Client-side:** No. Server-side Python only.
- **Relevance:** The segmentation-to-homography pipeline is the canonical reference architecture for a learned tracker. The UNet can theoretically be exported to ONNX/TF.js but would need significant re-training and optimization.

### 1.3 ChordSight (Devpost, 2025)

[Devpost: chordsight](https://devpost.com/software/chordsight)[^4]

- **What it does:** Detects guitar fretboard corners in real-time with a custom CV model, overlays chord notes on a live webcam feed.
- **Technique:** Custom trained detection model (5+ hours of training) + OpenCV algorithms for fretboard corner detection.
- **Stack:** React frontend, Node.js/FastAPI backend, OpenCV, custom detection model.
- **Real-time:** Yes, live webcam input demonstrated.
- **Client-side:** No — backend Python does the detection.
- **License:** Hackathon project, no explicit license.
- **Note:** This architecture (React frontend → Python detection backend) is a common pattern but offloads compute off-device, which is incompatible with the app's browser-only constraint.

### 1.4 Chordially (Devpost, 2025)

[Devpost: ai-music-tutor](https://devpost.com/software/ai-music-tutor)[^5]

- **What it does:** Tracks finger positions on guitar frets in real-time using Python + OpenCV + **ArUco markers** attached to the fretboard. Maps strings and 12 frets using a mathematical fret-spacing model (1/17.817 ratio).
- **Technique:** ArUco marker detection for fretboard anchoring + mathematical fret model; 5-frame smoothing for stability.
- **Stack:** Python, OpenCV. Achieves <50ms latency at 30+ FPS.
- **License:** Hackathon project.
- **Key takeaway:** Demonstrates that a fiducial marker on the instrument + math model achieves 30+ FPS at <50ms latency — directly validating the "cheaper interim option" from the proposal.

### 1.5 Fret-Nav (Kulikauskaite, TCD MSc 2025)

[PDF: TCD Fret-Nav thesis](https://www.scss.tcd.ie/Kenneth.Dawson-Howe/Projects/Previous/2025%20Zemyna%20Kulikauskaite%20-%20Bass%20Guitar.pdf)[^6]

- **What it does:** Real-time bass guitar fretboard navigation overlay. Detects fretboard and strings, tracks hand+finger positions, detects plucks.
- **Technique:** Template matching + Hough Line Transform for fretboard localization; MediaPipe Hands for finger tracking; optical flow for pluck detection. Uses 12th-root-of-2 fret spacing formula for fret position calculation. Achieved 90.96% note detection accuracy on 157 manually annotated notes.
- **Stack:** Python/OpenCV, MediaPipe. Not browser-based.
- **License:** Academic thesis — open access on TCD domain.
- **Real-time:** Yes, demonstrated in controlled conditions.
- **Occlusion robustness:** Limited — relies on controlled environments; cluttered backgrounds are a noted future-work item.

### 1.6 guitARhero (Graz University of Technology, IEEE TVCG 2023)

[Paper: guitARhero TVCG 2023](https://immersive-technology-lab.github.io/projects/guitarhero/assets/ribeiroskreinig_tvcg23_paper.pdf)[^7]

- **What it does:** AR guitar tutorial system overlaying fret highlights and a virtual 3D hand onto a real guitar.
- **Tracking method:** **Not markerless**. For the magic mirror (desktop) setup, they avoided tracking entirely by rigidly mounting webcams on the guitar head — the camera moves with the guitar, so no re-estimation is needed. For the HMD display, they used an **HTC Vive Tracker** attached to the guitar strap bolt. No per-frame markerless fretboard detection.[^7]
- **License:** IEEE paper — implementation not public.
- **Key takeaway:** The most thorough AR guitar paper explicitly *avoids* the tracking problem by either (a) co-locating camera and guitar or (b) using a hardware tracker. This confirms that markerless tracking is a hard-open problem even in academic work.

### 1.7 Guitar Fretboard OBB + Hough (Reddit, Feb 2026)

[Reddit r/computervision](https://www.reddit.com/r/computervision/comments/1rbhkn1/singleimage_guitar_fretboard_string_localization/)[^8]

- **Technique:** Oriented bounding box (OBB) detection model to locate the fretboard → crop and rectify → Canny edge + Hough line transform to identify strings → map back to original image.
- **Real-time:** Explicitly stated **not real-time** — motion blur and frame instability cause failures in video.
- **Client-side:** No (Python).

### 1.8 Guitar Fretboard Roboflow Dataset (Code and Chords, 2025)

[Roboflow Universe: guitar-fretboard-c7wzr](https://universe.roboflow.com/code-and-chords/guitar-fretboard-c7wzr)[^9]

- **What it is:** 384 open-source annotated fretboard images with 23 classes (hand, fret1, fret10, etc.) and a pre-trained detection model with hosted inference API.
- **Relevance:** The most directly usable public dataset for training a custom YOLO or similar detector. Exportable in YOLOv8 format. The pre-trained model can be exported to ONNX for browser inference.

### 1.9 guitar-chord-recognition (djbacad, 2023)

[GitHub: djbacad/guitar-chord-recognition](https://github.com/djbacad/guitar-chord-recognition)[^10]

- **Technique:** Transfer learning classification of guitar chords from video frames. Not fretboard pose estimation.
- **Relevance:** Low — classification only, no spatial homography output.

### 1.10 Asmar MSc Thesis (Polytechnique Montréal, 2022)

[PolyPublié: Asmar 2022](https://publications.polymtl.ca/10470/)[^11]

- **What it does:** Full automatic guitar tablature transcription from RGBD video.
- **Technique:** Deep learning segmentation model for fretboard binary mask (custom trained), optical flow for pluck detection, MediaPipe Hands for pose estimation. Uses depth maps from an RGBD camera to resolve finger hover ambiguity.
- **Key finding:** Explicitly builds a custom dataset of fretboard images for training the segmentation model — highlighting that no usable public RGB-only segmentation dataset exists at scale.
- **Relevance:** The segmentation→optical flow→hand pose pipeline is the most complete academic reference for the proposed feature. The RGBD camera dependency is a constraint not present in the app (webcam only).

### 1.11 AprilTag WASM Browser Port (arenaxr, 2020–present)

[GitHub: arenaxr/apriltag-js-standalone](https://github.com/arenaxr/apriltag-js-standalone)[^12]

- **What it does:** AprilTag C library compiled to WebAssembly via Emscripten. Runs tag detection client-side in the browser.
- **Stack:** C → WASM. Supports tag36h11, tag25h9, tagStandard41h12 families.
- **Real-time:** Demonstrated for live camera use in browser apps.[^13][^14]
- **License:** BSD-2-Clause (AprilTag library).
- **Relevance:** Directly enables the "fiducial sticker on guitar" interim option in-browser with no server dependency.

### 1.12 GeetAR (Wizard Systems, Google Play)

[Play Store: GeetAR](https://play.google.com/store/apps/details?id=com.wizardsystems.guitar)[^15]

- Marketed as "world's first AR app for learning and playing guitar." Uses AI + AR to show where to press on the fretboard. Closed-source mobile app (not browser, not open source). Uses a phone headset form factor. Tracking method undisclosed.

***

## 2. Academic and Technical Approaches

### 2.1 Classical CV: Hough/LSD Line Detection → Fretboard Quad

The fretboard is a planar rectangle with parallel fret lines (horizontal) and parallel string lines (diagonal/vertical). The classical pipeline is:

1. Canny edge detection
2. Probabilistic Hough Line Transform (HoughLinesP) to extract line segments
3. Classify lines by angle into "fret lines" vs. "string lines" clusters
4. Intersect line clusters to recover the fretboard quad corners
5. Solve homography from detected quad to reference model

**Accuracy:** Moderate. Works well in controlled lighting with an unoccluded fretboard. The Fret-Nav system achieved this with template matching as a pre-step to narrow the search region. The OBB+Hough Reddit demo worked on stills but failed on video due to motion blur.[^6][^8]

**Robustness to occlusion:** Poor. The fretting hand covers 30–60% of the fretboard during play — this breaks line-fitting across the full neck length. Short visible segments can still be used if the tracker is robust to partial lines, but fret lines behind the hand disappear entirely.

**Compute cost:** Low. Hough on a downsized image (e.g., 320×180) runs in 2–5ms in native code. In OpenCV.js WASM, expect 3–8× overhead; 10–30ms is realistic per frame. This is feasible within budget only if triggered adaptively (not every frame).[^16][^17]

**Vanishing point geometry:** The two families of parallel lines (frets, strings) converge at two vanishing points. These can be used as geometric constraints to filter spurious Hough detections. Several academic papers address vanishing point detection via Hough transform, but these are not guitar-specific and would need adaptation.[^18][^19][^20]

### 2.2 Classical CV: Feature Matching → Homography (ORB/AKAZE)

1. At calibration time, extract ORB or AKAZE keypoints from a reference frame of the fretboard.
2. Each frame: extract keypoints, match to reference descriptors via brute-force or FLANN.
3. Filter matches with RANSAC and solve `findHomography`.

**Accuracy:** High when texture is rich. The fretboard surface (wood grain, fret dot inlays) provides reasonable texture for ORB matching. ORB is "almost two orders of magnitude faster than SIFT" and provides comparable detection accuracy. AKAZE is more robust to scale/rotation but slower.[^21]

**Robustness to occlusion:** Moderate. Features on the occluded portion are unavailable, but RANSAC with features from the visible portion can still estimate `H` if ≥4 inlier correspondences survive. The fretting-hand area is the worst case.

**Compute cost:** ORB feature detection + description on a 640×480 image: ~5–15ms in native OpenCV. In OpenCV.js WASM, 20–60ms per frame is realistic, which may not fit a 33ms frame budget when combined with existing MediaPipe work. Reducing resolution to 320×240 helps significantly.

**OpenCV.js availability:** `cv.ORB_create()`, `cv.BFMatcher`, `cv.findHomography` are all present in OpenCV.js. AKAZE is also available.[^22]

### 2.3 Frame-to-Frame Planar Tracking: Lucas-Kanade Optical Flow

This is the recommended first-implementation approach (see §6). The workflow:

1. At calibration time, detect Shi-Tomasi corner points (`goodFeaturesToTrack`) on the fretboard region.
2. Each subsequent frame: run `calcOpticalFlowPyrLK` to track where those corners moved.
3. From the set of (prev_pt → curr_pt) correspondences, solve `findHomography` with RANSAC to get the updated `H`.
4. If too few inliers survive (occlusion), hold the last valid `H` and let the existing `calibLive` decay path handle graceful degradation.

**Accuracy:** High for small frame-to-frame motion. LK is designed for incremental tracking, not large-displacement re-detection.

**Robustness to occlusion:** Moderate. Points under the hand go "lost" (status=0 in LK output). RANSAC on surviving points can recover `H` as long as ≥4 inliers remain visible — typically satisfied unless the entire neck is covered.

**Compute cost (browser):** Sparse LK on 30–50 points at 320×240 in OpenCV.js: approximately **5–15ms** per frame. `findHomography` with RANSAC on ~30 points: ~2–5ms. Total per-frame overhead: **~10–20ms** — feasible within the remaining budget after MediaPipe HandLandmarker (~17ms).[^23][^24][^1]

**Drift:** LK accumulates error over time. A periodic re-anchor (every ~30 frames or when confidence falls) via a fast Hough pass or RANSAC feature re-match prevents long-term drift.

**Academic backing:** WOFT (Weighted Optical Flow Tracker) is a state-of-the-art learned variant for planar object tracking that uses dense optical flow with learned correspondence weights to estimate the 8-DOF homography robustly, achieving top results on POT-210 and POIC benchmarks. This is a research reference, not a browser-deployable package, but demonstrates the approach is well-validated.[^25][^26]

### 2.4 Learned Keypoint Detection (Nut, Fret Corners, Neck Edges)

Train a lightweight keypoint detection model to predict the positions of: the nut (top-left/right corners of the neck at the headstock), several fret positions, and/or the neck boundary edges. These keypoints constrain the homography solve.

**Approach A — Regression head on a lightweight backbone (MobileNetV2, EfficientNet-Lite):**
Predict N×2 heatmaps or direct regression. MobileNet with a shallow head: ~1–2MB, ~10–20ms on WebGPU.[^27]

**Approach B — YOLO-based keypoint detection (YOLOv8-pose variant):**
YOLOv8n exported to ONNX at 192×192 achieves ~25–28 FPS on modern mobile browsers. A custom-trained fretboard keypoint version would need 500+ labeled images minimum.[^28]

**Accuracy:** High if training data is diverse. The main bottleneck is training data.

**Robustness to occlusion:** Learned models can be explicitly trained with partial occlusion augmentation — they can infer occluded keypoints from visible context if the training set includes such examples.

**Compute cost (browser):** YOLOv8n ONNX at 640×640 on WASM backend in Chrome M1: ~30ms/frame. At 192×192: ~10–15ms. With the existing MediaPipe load, this is marginal on mid-range hardware.[^29]

### 2.5 Learned Segmentation (UNet, Lightweight FCN)

Train a model to produce a binary mask of the fretboard region, then extract the quad from the mask boundary. The abhishekrana repo uses UNet for this; Asmar (2022) builds a custom training set and trains a deep segmentation model.[^3][^11]

**Accuracy:** High. Segmentation is robust to partial occlusion — the mask simply shrinks where the hand covers.

**Compute cost (browser):** UNet is too heavy for real-time browser inference without aggressive quantization and downsizing. A MobileNet-based segmentation head (DeepLab-MobileNetV2) at 256×256 produces ~4MB ONNX and can run at ~20ms WebGPU inference. Still expensive when stacked with existing MediaPipe.[^27]

***

## 3. In-Browser Feasibility

### 3.1 Frame Budget Analysis

The app already consumes:
- MediaPipe HandLandmarker: ~17ms CPU latency (Pixel 6 benchmark) — in practice 15–30ms on a modern desktop[^1]
- Audio analysis: estimate 5–10ms
- Remaining budget for 33ms target (30 FPS): **~5–15ms**

| Approach | Estimated Browser Latency | Fits Budget? |
|---|---|---|
| LK sparse optical flow (320×240, 30–50 pts) | 10–15ms WASM | ✅ Yes (tight) |
| AprilTag WASM detection | ~10–15ms (arenaxr lib) | ✅ Yes |
| ORB feature match (320×240) | 20–40ms WASM | ⚠️ Marginal |
| Hough line detection (320×240) | 15–25ms WASM | ⚠️ Marginal |
| YOLOv8n ONNX @ 192×192 WASM | 15–25ms WASM | ⚠️ Marginal |
| YOLOv8n ONNX @ 192×192 WebGPU | 5–10ms WebGPU | ✅ Yes (WebGPU required) |
| UNet segmentation (256×256) | 40–80ms WASM | ❌ Too slow |
| WOFT dense optical flow | 30–60ms WASM | ❌ Too slow |

### 3.2 Model Sizes and Cold-Start

The existing codebase already loads ~13MB for OpenCV.js WASM. Additional model budgets:

| Model | Size | Cold-Start Impact |
|---|---|---|
| apriltag-js-standalone WASM | ~500KB | Negligible |
| YOLOv8n ONNX (int8 quantized) | ~3–4MB | ~1–2s first load |
| YOLOv8n ONNX (fp32) | ~6MB | ~2–3s first load |
| MobileNetV2 segmentation ONNX | ~4–5MB | ~1–2s first load |
| ORB/LK via OpenCV.js | 0MB extra (already loaded) | None |

**Key insight:** Sparse LK + homography update via OpenCV.js requires **zero additional model downloads** — it uses the already-loaded WASM binary.

### 3.3 Runtime Environments

- **TensorFlow.js WebGL backend:** ~25–30ms inference for MobileNet-class models. Supported on all modern browsers.[^27]
- **ONNX Runtime Web (WASM):** 30ms for YOLOv8n @ 640×640, ~10ms for 192×192. WebGPU backend: 3–5× faster, but WebGPU availability is still ~70% of Chrome/Edge users as of 2025–2026.[^29][^28]
- **OpenCV.js WASM:** Standard image processing (Hough, LK) runs at roughly 3–8× native C++ speed. SIMD builds improve this by ~28%.[^16]
- **MediaPipe custom tasks:** MediaPipe has no public "guitar fretboard" task; a custom MediaPipe Pose task would require proprietary tooling to author.

***

## 4. Cheaper Interim Options

### 4.1 Fully Markerless (Baseline Reference)

Requires either a Hough-based per-frame detector or a trained model. Per-frame Hough is brittle to occlusion and motion blur; a trained model requires data collection, annotation, training, ONNX export, and browser integration. **Highest effort; moderate robustness.**

### 4.2 Fiducial Sticker on Guitar (Interim Option A)

Attach a small AprilTag (e.g., tag36h11 family, 3×3cm printed sticker) to the guitar **headstock** — above the nut, not on the fretboard itself. The headstock is never covered by the fretting hand.

**Workflow:**
1. Detect the AprilTag each frame using `arenaxr/apriltag-js-standalone` WASM — proven to run in-browser live.[^12]
2. The tag gives a precise 6-DOF pose of the headstock relative to the camera.
3. Use the known rigid body relationship (headstock → nut → fret positions, calibrated once at setup) to compute `H` each frame.
4. `calibLive = true`, re-stamp `calibSeenAt` each confirmed detection.

**Robustness:** The headstock is never occluded during normal fretting. The tag is outside the playing area. Detection is robust to lighting variation (AprilTag is a high-contrast binary pattern).

**Limitations:** Requires the player to print/attach a sticker. Fails if the headstock exits the camera frame. Not "fully markerless" — may be unacceptable for a consumer product but is perfectly valid for a practice-focused app.

**Effort:** Low. The `arenaxr/apriltag-js-standalone` library is ready to use. Integration requires: (1) add WASM dependency, (2) run tag detection in the vision worker, (3) compute `H` from tag pose + rigid offset.[^14][^12]

**Verdict: Best robustness-for-effort ratio of all options.**

### 4.3 Frame-to-Frame LK Tracking Seeded by Calibration (Interim Option B)

As described in §2.3. Seed corner points from the calibration homography, track them per frame via LK, recompute `H` from tracked correspondences.

**Robustness:** Good for small movements. Fails under large/fast guitar motion or after long occlusion (drift accumulates). Periodic re-detection every N frames (using Hough or ORB on a low-priority background task) prevents long-term drift.

**Limitations:** Drift over time; no absolute reference. Requires a reliable re-anchor strategy.

**Effort:** Low — entirely within OpenCV.js, no additional model. This is the "zero-dependency" path.

**Verdict: Best first-implementation path; lowest total effort and no new assets.**

### 4.4 Comparison Table

| Option | Robustness to Occlusion | Robustness to Movement | Browser Feasibility | Effort | Requires Extra Assets? |
|---|---|---|---|---|---|
| Hough per-frame (markerless) | ❌ Poor | ⚠️ Moderate | ⚠️ Marginal budget | High | Model training optional |
| YOLOv8n detector (markerless) | ✅ Good (with augmentation) | ✅ Good | ⚠️ Needs WebGPU | Very High | Custom training + ONNX export |
| UNet segmentation (markerless) | ✅ Good | ✅ Good | ❌ Too slow | Very High | Custom training + ONNX export |
| **LK optical flow (seeded)** | ⚠️ Moderate | ✅ Good | ✅ Within budget | **Low** | None (OpenCV.js already loaded) |
| **AprilTag sticker (headstock)** | ✅ Very Good | ✅ Very Good | ✅ Within budget | **Low** | WASM lib + printed sticker |
| ORB feature match (markerless) | ⚠️ Moderate | ✅ Good | ⚠️ Marginal budget | Medium | None |

***

## 5. Datasets

### 5.1 Guitar Fretboard (Roboflow — Code and Chords, 2025)

[Roboflow Universe](https://universe.roboflow.com/code-and-chords/guitar-fretboard-c7wzr)[^30][^9]

- 384 images with 23 annotated classes including hand, fret1, fret10
- Pre-trained detection model with hosted inference API
- Exportable in YOLOv8/YOLO11/COCO formats
- **Best available public dataset for this task**

### 5.2 Guitar Fretboard (Ghaleb, Roboflow 2024)

[Roboflow: guitar-fretboard by Ghaleb](https://universe.roboflow.com/ghaleb/guitar-fretboard)[^31]

- 384 images, object detection annotations
- Available for browser inference demo via Roboflow hosted API

### 5.3 Guitar Fretboard Notes (Hugging Face, 2026)

[HuggingFace: collegefishiesd/guitar-fretboard-notes](https://huggingface.co/datasets/collegefishiesd/guitar-fretboard-notes)[^32]

- Small image classification dataset focused on fret note positions, not segmentation or pose.

### 5.4 GuitarSet (MARL, 2018)

[GitHub: marl/GuitarSet](https://github.com/marl/GuitarSet)[^33][^34][^35]

- Audio-visual dataset of 360 solo guitar recordings (CC-BY-4.0) with per-string MIDI pitch annotations.
- **Audio-only** — no fretboard bounding boxes or image annotations. Not directly useful for visual fretboard tracking.

### 5.5 Custom Training Data (from Asmar 2022, Fret-Nav 2025)

Both Asmar and Fret-Nav explicitly collected their own training data by recording video of a guitar, then manually annotating fretboard regions. This is the dominant pattern: **no large public dataset of annotated guitar fretboard images (with masks or keypoints) exists.** Any learned approach requires custom data collection.[^11][^6]

**Practical recommendation:** Record 200–400 frames of the guitar in the typical practice setup (varied lighting, partial occlusion by hand), annotate fretboard quadrilateral corners using Roboflow Annotate, and train a YOLOv8-obb or keypoint model. The existing Roboflow dataset can augment your custom data.[^36][^9]

***

## 6. Recommendation & Implementation Path

### 6.1 Ranked by Feasibility-vs-Effort

| Rank | Approach | When to Implement |
|---|---|---|
| 1 | **LK sparse optical flow tracker** (seeded by one-shot calibration) | Now — Phase 1 |
| 2 | **AprilTag headstock sticker** (arenaxr WASM) | Now — Phase 1 parallel/alternative |
| 3 | **ORB feature match with periodic re-anchor** | Phase 2 — if LK drift is unacceptable |
| 4 | **YOLOv8n custom-trained detector** (ONNX/WebGPU) | Phase 3 — after training data collected |
| 5 | **Full markerless UNet/segmentation** | Long-term — high effort, high reward |

### 6.2 Phase 1: LK Optical Flow Tracker (Recommended First Implementation)

**Architecture within the existing codebase:**

```
visionWorker.ts
  ├── [existing] MediaPipe HandLandmarker → hand landmarks
  ├── [existing] audio analysis
  └── [NEW] fretboardTracker module
        ├── init(H_calib, frame) → extract corner points via goodFeaturesToTrack()
        │     within the calibrated fretboard ROI
        ├── track(prevFrame, currFrame) → calcOpticalFlowPyrLK()
        │     → RANSAC findHomography on surviving points
        │     → emit {H_live, conf, trackedPoints}
        └── maybeReanchor(frame) → periodic Hough or ORB pass to refresh seed points
```

**Integration with existing stores:**

- Call `setCalibration(H_live, conf)` per frame (or an equivalent lighter `setLiveH(H_live)` updater to avoid triggering full recalibration logic).
- Set `visionHot.calibLive = true` so the existing decay path in `perception/vision/degradation.ts` activates.
- Re-stamp `calibSeenAt` on every confirmed frame.
- Open the `calib`-type event gate in `controller.ts` (`applyVisionFrame`) for the live tracking path.
- Consumers (`drawVision.ts`, `ZoomPane.tsx`, `targetDots.ts`) read `visionHot.H` unchanged — they get tracking for free.

**Key parameters to tune:**
- Feature detection: `maxCorners=50, qualityLevel=0.01, minDistance=7` in `goodFeaturesToTrack`
- LK: `winSize=(21,21), maxLevel=3` for pyramidal tracking
- RANSAC: `method=RANSAC, ransacReprojThreshold=4.0` in `findHomography`
- Confidence threshold: `conf = inlierCount / totalPoints`; decay if `conf < 0.3`
- Re-anchor trigger: every 30 frames, or when `inlierCount < 8`

**Expected performance:** ~10–15ms per frame in OpenCV.js WASM at 320×240 input, fitting inside the ~15ms remaining budget after MediaPipe.

### 6.3 Phase 1 Alternative: AprilTag Headstock Sticker

If optical flow drift proves unacceptable in early testing:

1. Add `arenaxr/apriltag-js-standalone` as a dependency.[^12]
2. Run tag detection in `visionWorker.ts` alongside existing processing.
3. From the tag's detected corners, use the pre-calibrated rigid offset (headstock-to-nut distance, measured once at setup) to compute `H` each frame.
4. Same integration pattern as above: `setCalibration(H_computed, 1.0)` when tag is found; decay path handles loss-of-detection gracefully.

**Trade-off vs LK:** AprilTag gives absolute pose every frame (no drift), but requires the player to attach a sticker. LK requires no hardware change but drifts. Both are viable Phase 1 paths.

### 6.4 Phase 2: ORB Re-Anchor Strategy

Augment the LK tracker with an ORB feature matching pass every ~30 frames as a re-anchor:

1. Store ORB descriptors of the calibration reference frame.
2. Each re-anchor: extract ORB from current frame, match to reference, filter with RANSAC.
3. If enough inliers: reset LK seed points from the re-anchored `H`.
4. This prevents long-term drift while keeping the per-frame cost low (ORB only runs ~3% of frames).

### 6.5 Phase 3: Learned Detector (Custom YOLOv8n)

1. **Data collection:** Record 300–500 frames with the practice webcam, varying lighting, hand positions, and guitar angles.
2. **Annotation:** Use Roboflow Annotate to label fretboard corners (keypoints: nut-left, nut-right, body-left, body-right) or oriented bounding boxes.[^36]
3. **Training:** Fine-tune YOLOv8n-pose or YOLOv8n-obb on the custom dataset + the existing Roboflow dataset.[^9]
4. **Export:** `model.export(format="onnx", imgsz=192, opset=12)` → ~3–4MB int8 quantized.
5. **Browser integration:** Load via `onnxruntime-web` with WebGPU backend. Fall back to WASM on unsupported clients.[^28][^29]
6. **Frame budget:** At 192×192 WebGPU: ~5–10ms, leaving headroom. WASM fallback: ~15–25ms — may require running every other frame.

***

## 7. Open Questions — Research Answers

**Q: Marker-based (sticker) vs. fully markerless — which is better for an interim step?**
A: The sticker (AprilTag) is unambiguously better for the interim step. It provides absolute pose, no drift, robust detection even in poor lighting, and the detection WASM exists and is proven in browsers. The only cost is the user experience of attaching a sticker. For a seated practice app targeting a specific setup, this is acceptable. Reserve fully markerless for Phase 3+.[^12]

**Q: Is frame-to-frame planar tracking enough to avoid a per-frame detector?**
A: Yes for moderate guitar movement (the "seated, mostly static" case that is closer to the current non-goal than the "standing/moving" case). For small movements between consecutive frames, LK optical flow propagates `H` accurately enough. A re-anchor every ~30 frames prevents drift from compounding. If the player makes large rapid movements (e.g., repositioning the guitar), the tracker will lose points and the decay path takes over — this is the correct designed behavior.

**Q: Any existing in-browser guitar-AR project to build on?**
A: No complete in-browser markerless guitar AR tracker exists as an open-source project. The closest usable in-browser component is `arenaxr/apriltag-js-standalone` for the fiducial sticker approach. The OpenCV.js LK tracker pathway is fully supported by OpenCV.js API primitives but has no guitar-specific open-source implementation. The ChordSight and Chordially projects are similar in goal but use Python backends, not browser WASM.[^24][^23][^12]

***

## 8. Key References

| Reference | Relevance |
|---|---|
| Asmar (2022), Polytechnique Montréal[^11] | Most complete academic pipeline: segmentation → optical flow → hand pose → tablature |
| Fret-Nav, TCD MSc 2025[^6] | Closest recent implementation: template + Hough + MediaPipe, Python |
| guitARhero, IEEE TVCG 2023[^7] | Gold standard AR guitar paper; explicitly avoids markerless tracking |
| arenaxr/apriltag-js-standalone[^12][^14] | Ready-to-use WASM AprilTag browser detector |
| Roboflow Guitar Fretboard Dataset[^9] | Only public annotated fretboard image dataset |
| OpenCV.js LK Optical Flow docs[^23][^24] | Browser LK API reference |
| WOFT: Weighted Optical Flow Tracker (WACV 2023)[^25] | State-of-the-art planar tracker using learned optical flow + homography |
| YOLOv8n ONNX browser inference guide[^29][^28] | Validated path for custom ONNX models at ~30ms WASM, ~10ms WebGPU |
| MediaPipe HandLandmarker benchmarks[^1] | Frame budget baseline: ~17ms CPU latency |
| Brian Cohn browser ML inference guide (2025)[^27] | Comprehensive ONNX Runtime Web / TF.js latency benchmarks |

---

## References

1. [Models](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker)

2. ["TabbyCat: Realtime Guitar Fretboard Detection" | Samuel Keke ...](https://www.linkedin.com/posts/samuelkeke_musictech-computervision-python-activity-7331951957391171584-idby) - Technical implementation: MediaPipe for hand tracking and landmark detection OpenCV for computer vis...

3. [GitHub - abhishekrana/guitar-augmented-reality: Displaying notes to play on guitar using augmented reality and deep learning](https://github.com/abhishekrana/guitar-augmented-reality) - Displaying notes to play on guitar using augmented reality and deep learning - abhishekrana/guitar-a...

4. [ChordSight](https://devpost.com/software/chordsight) - Our app uses your webcam to track finger placement on the guitar fretboard, giving real-time feedbac...

5. [Chordially - Devpost](https://devpost.com/software/ai-music-tutor) - Master guitar techniques with real-time hand tracking, personalized feedback, and an intelligent AI ...

6. [[PDF] Fret-Nav: A Computer Vision Tool to Aid Beginner Electric Bass ...](https://www.scss.tcd.ie/Kenneth.Dawson-Howe/Projects/Previous/2025%20Zemyna%20Kulikauskaite%20-%20Bass%20Guitar.pdf) - Fret-Nav processes a live video feed of the player's bass guitar, detects the fretboard and strings,...

7. [guitARhero: Interactive Augmented Reality Guitar Tutorials](https://www.computer.org/csdl/journal/tg/2023/11/10268399/1QQ9ofPVbIA) - guitARhero can visualize interactive instructions using fret highlighting and a virtual hand on a de...

8. [Single-image guitar fretboard & string localization using OBB + ...](https://www.reddit.com/r/computervision/comments/1rbhkn1/singleimage_guitar_fretboard_string_localization/) - I use a trained oriented bounding box (OBB) model to detect the guitar fretboard in an image. I crop...

9. [Guitar Fretboard Object Detection Model by Code and Chords](https://universe.roboflow.com/code-and-chords/guitar-fretboard-c7wzr) - 384 open source Frets images plus a pre-trained Guitar Fretboard model and API. Created by Code and ...

10. [GitHub - djbacad/guitar-chord-recognition: Quick demo of real-time guitar chord recognition. Basic multi-class classification with transfer learning using TF+Keras computer vision models.](https://github.com/djbacad/guitar-chord-recognition) - Quick demo of real-time guitar chord recognition. Basic multi-class classification with transfer lea...

11. [A Computer Vision-Based Automatic Transcription of Guitar Music ...](https://publications.polymtl.ca/10470/) - Asmar, M. (2022). A Computer Vision-Based Automatic Transcription of Guitar Music from RGBD Videos [...

12. [GitHub - arenaxr/apriltag-js-standalone](https://github.com/arenaxr/apriltag-js-standalone) - This is the main WASM apriltag detector source, with additional tests and a standalone javascript ap...

13. [Project: in-browser AprilTag detector - Ross Gardiner](https://www.rossng.eu/posts/2025-08-03-apriltag-detector/) - The personal site of Ross Gardiner

14. [ARENA Source and Links](https://docs.arenaxr.org/content/source.html) - ARENA Sources ; arenaxr/apriltag-gen, AprilTag 36h11 Generator ; arenaxr/apriltag-js-standalone, Apr...

15. [GeetAR - Play Guitar in AR - Google Playত এপ্](https://play.google.com/store/apps/details?id=com.wizardsystems.guitar&hl=as) - Learn and play guitar in Augmented Reality.

16. [OpenCV in the Browser? Lets give it a try - Kinograph Forums](https://forums.kinograph.cc/t/opencv-in-the-browser-lets-give-it-a-try/2649) - the first run took 4448.38ms, and subsequent runs were around 4112.38ms. Thats a 28% increase in spe...

17. [[PDF] Measuring Opencv.js performance with Wasm execution engine in ...](https://sedici.unlp.edu.ar/bitstream/handle/10915/89186/Documento_completo.pdf-PDFA.pdf?sequence=1) - In this paper, a set of recommended practices to use and to benchmark Opencv.js are presented and ob...

18. [Vanishing Point Detection in the Hough Transform Space | Proceedings of the 5th International Euro-Par Conference on Parallel Processing](https://dl.acm.org/doi/10.5555/646664.700751)

19. [[PDF] Deep Vanishing Point Detection: Geometric Priors Make Dataset ...](https://openaccess.thecvf.com/content/CVPR2022/papers/Lin_Deep_Vanishing_Point_Detection_Geometric_Priors_Make_Dataset_Variations_Vanish_CVPR_2022_paper.pdf)

20. [Vanishing Point Detection Using Angle-based Hough Transform and RANSAC](https://ieeexplore.ieee.org/document/10006943/) - The information provided by vanishing points is essential for Intelligence Transportation Systems (I...

21. [# **What is ORB? How to implement ORB in Computer Vision ...](https://www.facebook.com/groups/1939366696159868/posts/2431674730262393/) - ORB performs as well as SIFT on the task of feature detection (and is better than SURF) while being ...

22. [AKAZE and ORB planar tracking](https://docs.opencv.org/3.4/dc/d16/tutorial_akaze_tracking.html)

23. [Optical Flow - OpenCV Documentation](https://docs.opencv.org/3.4/db/d7f/tutorial_js_lucas_kanade.html)

24. [Lucas-Kanade Optical Flow Example](https://docs.opencv.org/4.x/js_optical_flow_lucas_kanade.html)

25. [[2301.10057] Planar Object Tracking via Weighted Optical Flow - arXiv](https://arxiv.org/abs/2301.10057) - We propose WOFT -- a novel method for planar object tracking that estimates a full 8 degrees-of-free...

26. [Planar Object Tracking via Weighted Optical Flow - Semantic Scholar](https://www.semanticscholar.org/paper/Planar-Object-Tracking-via-Weighted-Optical-Flow-Serych-Matas/2a98fa7ea3f37b83da1bee2117130d8d001d8967) - A novel method for planar object tracking that estimates a full 8 degrees-of-freedom pose, i.e. the ...

27. [Browser-Based ML Inference Guide | Brian Cohn Ph.D.](https://briancohn.com/2025/11/12/browser-based-inference/) - Comprehensive comparison of tools and frameworks for running ML models directly in the browser.

28. [Run YOLO on Phone or Desktop Without App Store or Server](https://www.linkedin.com/posts/marcelo-jose-rovai-brazil-chile_edgeai-tinyml-yolo-activity-7457887545247297536-62gv) - 🚀 Running YOLO on phone or desktop — no app store, no server, no install. One of the tools that I mi...

29. [Real-time YOLO Inference in the Browser | blog - atsukoba.com](https://atsukoba.com/en/blog/yolov8-wasm-browser/) - Development of a web app for real-time YOLOv8 inference in the browser using WebAssembly (WASM). Exp...

30. [How to Use the Guitar Fretboard Detection API - Roboflow Universe](https://universe.roboflow.com/code-and-chords/guitar-fretboard-c7wzr/model/1) - Inference is Roboflow's open source deployment package for developer-friendly vision inference. How ...

31. [Guitar Fretboard Object Detection Model by Ghaleb](https://universe.roboflow.com/ghaleb/guitar-fretboard) - 384 open source Frets images plus a pre-trained Guitar Fretboard model and API. Created by Ghaleb.

32. [collegefishiesd/guitar-fretboard-notes · Datasets at Hugging Face](https://huggingface.co/datasets/collegefishiesd/guitar-fretboard-notes) - We’re on a journey to advance and democratize artificial intelligence through open source and open s...

33. [[PDF] GUITARSET: A DATASET FOR GUITAR TRANSCRIPTION](https://archives.ismir.net/ismir2018/paper/000188.pdf)

34. [ryangowe/guitar-chord-mix · Datasets at Hugging Face](https://huggingface.co/datasets/ryangowe/guitar-chord-mix) - We’re on a journey to advance and democratize artificial intelligence through open source and open s...

35. [GitHub - marl/GuitarSet: GuitarSet: a dataset for guitar transcription](https://github.com/marl/GuitarSet) - GuitarSet: a dataset for guitar transcription. Contribute to marl/GuitarSet development by creating ...

36. [Roboflow Annotate: Label Images Faster Than Ever](https://roboflow.com/annotate) - Label data quickly with a suite of AI-assisted annotation tools to augment human labeling or fully a...

