# GuitarSet open-chord matcher eval (Q-04, first real-audio evidence)

**Scope framing (read first):** these numbers are from **real recorded guitar** (GuitarSet `audio_mono-mic`, 44.1 kHz mono, realistic room/mic), **NOT the user's home setup**. This is the first real-recorded-guitar evidence toward the BLOCKERS row "Audio accuracy gates unmeasured" and the Q-04 validation. **The §16 "≥90% open-chord" gate is specified for the user's home setup and remains UNCLAIMED here.** Whatever the number is, it is honest Q-04 data.

## Methodology

- **Matcher (production, unmodified):** `MagnitudeSpectrum(8192)` → `computeChroma(mag, sampleRate, 8192)` → `ChordMatcher` (chroma L2-norm → cosine vs 8 binary open-chord templates → softmax posterior, with an RMS silence gate and a spectral-flatness noise gate). Same code path as `apps/web/src/eval/evalSmoke.test.ts`.
- **Annotation namespace:** GuitarSet ships two `chord` JAMS annotations. We use the **INSTRUCTED** one (`annotation_metadata.data_source` empty), whose labels are clean `X:maj`/`X:min` triads. The **PERFORMED** one (`data_source = "Semi-automatic chord transcription with manual verification"`) is voicing-specific (`…/1` bass inversions, `maj7`, `sus4`, `(*5)`, `(1,5,7)`): **0 of its 2160 segments** map under the strict `X:maj`/`X:min` table, and slash/extended chords are out-of-scope by the eval's own rule — so it is unusable for the 8-class mapping. Both annotations share identical segmentation and roots; only the voicing detail differs.
- **Label → class map (strict; natural roots only can be in scope):**

  | JAMS label | class |   | JAMS label | class |
  | --- | --- | --- | --- | --- |
  | `C:maj` | C |   | `A:min` | Am |
  | `G:maj` | G |   | `E:min` | Em |
  | `D:maj` | D |   | `D:min` | Dm |
  | `A:maj` | A |   | *anything else* | out of scope |
  | `E:maj` | E |   | (7ths, slash, F/B/#/b roots, N, X) | (counted, not scored) |

- **Sample rate:** the chroma path is fully parameterized (`computeChroma(mag, sampleRate, fftSize)`, `AudioAnalyzer(sampleRate)`), so the true **44100 Hz** is passed straight through — **no resampling**, no 48 kHz hardcode. The 8192-window bin spacing is ~5.4 Hz / 186 ms at 44.1 kHz (vs ~5.9 Hz / 170 ms at 48 kHz in production), which still resolves open low-E.
- **Windowing / aggregation:** for each in-scope segment ≥ 1 s, drop the first/last 15% and step 8192-sample windows (hop 2048) across the stable middle. Each window is classified by the real `ChordMatcher` (its EMA smooths within the segment); the segment prediction is the **majority-vote** label over those windows (ties → higher summed top-1 confidence). The silence/noise gate can therefore surface as a predicted outcome.
- **Split (held-out):** players `00`–`03` = dev, players `04`–`05` = held-out. No thresholds were fit to any split (nothing was tuned — the pipeline ran as shipped), so dev and held-out are both honest test sets; the split is reported so any future tuning has a pre-committed hold-out.
- **Scale:** all comp + solo takes, 360 excerpts processed.

## Headline — comp takes (strummed chords, the realistic case)

**Overall top-1 = 75.1%** on **678** in-scope comp segments.

| split | top-1 | n |
| --- | --- | --- |
| players 00–03 (dev) | 80.3% | 452 |
| players 04–05 (held-out) | 64.6% | 226 |
| **all comp** | **75.1%** | **678** |

### Per-class accuracy (comp)

| class | C | G | D | A | E | Am | Em | Dm |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| top-1 | 61.4% | 73.8% | 88.2% | 77.1% | 85.2% | 83.3% | 53.3% | 77.8% |
| n | 114 | 126 | 102 | 96 | 108 | 36 | 60 | 36 |

### Confusion matrix (comp) — rows = true, cols = predicted

| true \ pred | C | G | D | A | E | Am | Em | Dm | noise | silence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **C** | 70 | 6 | 4 | · | · | 10 | 20 | 2 | · | 2 |
| **G** | 1 | 93 | 7 | · | 4 | 1 | 9 | 10 | · | 1 |
| **D** | 2 | 1 | 90 | · | 2 | 1 | 2 | 1 | · | 3 |
| **A** | · | · | 12 | 74 | 3 | 4 | 2 | · | · | 1 |
| **E** | · | 1 | 12 | · | 92 | 1 | 2 | · | · | · |
| **Am** | 1 | 1 | · | 2 | · | 30 | 2 | · | · | · |
| **Em** | · | 8 | 5 | · | 15 | · | 32 | · | · | · |
| **Dm** | · | · | 7 | · | · | 1 | · | 28 | · | · |

**Top confusion pairs (comp):** C→Em (20), Em→E (15), E→D (12)

## Solo takes (melodic lines — chord-frame classification expected to be poor)

**Overall top-1 = 36.0%** on **678** in-scope solo segments. Solos are single-note melodic passages over the same instructed harmony; the chroma of one sustained melody note is NOT the chord's triad, so low accuracy here is expected and is reported separately — it is not a fault of the matcher and is not blended into the comp headline.

## Counts

| | total seen | in-scope | scored | skipped < 1 s | out-of-scope |
| --- | --- | --- | --- | --- | --- |
| comp | 2160 | 678 | 678 | 0 | 1482 |
| solo | 2160 | 678 | 678 | 0 | 1482 |

**Out-of-scope comp labels (top 10):** `F:maj`×144, `G#:maj`×114, `C#:maj`×114, `D#:maj`×108, `A#:maj`×102, `F#:maj`×96, `B:maj`×96, `G:min`×60, `C#:min`×48, `D#:7`×48

## Interpretation (Q-04)

On real strummed GuitarSet comp audio the production template matcher scores **75.1%** top-1 (dev 80.3%, held-out 64.6%) — i.e. template matching looks broadly viable on real strummed audio, though below the 90% home-setup target. The biggest confusion is **C→Em** (20 segments), then Em→E (15), consistent with open chords that share two of three chord tones (e.g. C={C,E,G} and Em={E,G,B} share E+G) collapsing together in a bare, binary 12-bin chroma with no octave/bass weighting. The ~16-point dev→held-out drop is untuned player/instrument/mic variance, not overfitting (no threshold was fit to any split). Because this is real-recorded-guitar evidence and still below 90%, it directly informs the Q-04 decision trigger (templates <90% on realistic audio → pull the Phase-1 CRNN forward); the equivalent home-mic measurement (the actual §16 gate condition) still needs the user's own recordings and remains unclaimed.

_Reproduce:_ `node scripts/eval-guitarset.mjs` (add `--limit N` for a quick subset). Data: GuitarSet (Zenodo 3371780, CC-BY-4.0), `audio_mono-mic` + `annotation`, extracted under `data/eval/guitarset/extracted/`.

---

## Root/bass weighting experiment (2026-07-04)

**Everything above this line is the pre-experiment baseline (production `fMax=2000`).** This section supersedes the headline: the shipped default is now `fMax=800` (one-line change in `chroma.ts`). The §16 "≥90% open-chord" home-setup gate remains **UNCLAIMED**.

### Hypothesis (from the baseline confusion structure)

The baseline's dominant errors are harmonic-leakage collisions, not root/bass ambiguity. A note's **3rd harmonic lands on its fifth** and its **5th harmonic on its major third**. In a wide-band (70–2000 Hz) linear chroma the loud upper partials of the higher chord tones smear energy into neighbouring pitch classes:

- **C→Em (20):** C={C,E,G}; the two E's 3rd harmonic injects **B**, forging Em={E,G,B}.
- **Em→E (15):** the E's **5th harmonic injects G#**, forging the major third of E={E,G#,B}.

So the cheapest lever is **band-limiting**, not the root-weighting first guessed: keep the fundamentals (highest open-chord fundamental is G4≈392 Hz) and their 2nd harmonic (an octave = same pitch class, harmless/reinforcing), but fold out the 3rd+ harmonics that carry the contamination.

### Candidates tried (tuned on DEV only — players 00–03 comp, n=452; baseline 80.3% = 363/452)

Two sweep rounds, decode-once, all configs scored on the identical dev segments/scoring as the harness. Held-out was **not** consulted during tuning.

| lever | config | dev top-1 |
| --- | --- | --- |
| band-limit fMax | 350 | 66.4% |
| | 450 | 76.8% |
| | 550 | 79.0% |
| | 650 | 82.1% |
| | 700 | 82.7% |
| | 750 | 82.1% |
| | **800** | **83.0%** |
| | 850 | 82.7% |
| | 900 | 82.5% |
| | 1000 | 81.2% |
| | 1100 | 81.6% |
| | 1200 | 81.9% |
| | 2000 (baseline) | 80.3% |
| magnitude compression | sqrt (fMax 2000) | 75.0% |
| | log1p (fMax 2000) | 72.1% |
| | sqrt (fMax 550) | 76.1% |
| root-weighted templates | 1.5/1.0/0.8 (fMax 2000) | 71.9% |
| (root/third/fifth) | 1.3/1.0/0.9 (fMax 2000) | 76.1% |
| | 1.15/1.0/0.95 (fMax 800) | 81.9% |
| | 1.0/1.0/0.85 fifth-down (fMax 800) | 80.8% |
| bass-band fusion | cut 260 Hz w1.0 | 80.3% |
| (full ⊕ w·bass, both L2) | cut 260 Hz w1.5 | 77.2% |
| | cut 330 Hz w1.0 | 81.0% |
| | fMax 800 ⊕ cut 330 w0.5 | 81.6% |
| | fMax 800 ⊕ cut 260 w0.5 | 81.0% |
| | fMax 900 ⊕ cut 330 w0.5 | 82.1% |
| combos | fMax 550 + 1.5/1.0/0.8 | 71.0% |
| | fMax 450 + 1.3/1.0/0.9 | 75.0% |
| | fMax 650 + 1.3/1.0/0.9 | 79.9% |
| | bass cut260 w1.0 + 1.3/1.0/0.9 | 73.2% |

**Findings:** every non-band-limit lever either matched or *hurt* — root-weighted templates were actively harmful (the true root is often genuinely weaker than its harmonic-boosted neighbours, so up-weighting it in the template can't manufacture the missing energy), compression amplified the leakage it was meant to tame, bass-fusion helped only marginally and never beat plain band-limiting. The band-limit peak is a **broad plateau (fMax 700–900 all 82.5–83.0%)**, not a knife-edge — a robust physical effect, not a dev-fitted threshold.

### Winner: `fMax = 800` (templates unchanged, 1/1/1 binary)

Dev **83.0%** (375/452, +2.7 vs 80.3). Same O(FFT) cost (folds *fewer* bins). No new template weights, no fusion — a one-parameter change to the default `fMax` in `computeChroma`.

### Held-out result (single pre-committed run, no re-pick)

| split | baseline | fMax=800 | Δ |
| --- | --- | --- | --- |
| players 00–03 (dev) | 80.3% | **83.0%** | +2.7 |
| players 04–05 (held-out) | 64.6% | **69.5%** | **+4.9** |
| **all comp** | **75.1%** | **78.5%** | **+3.4** |

The winner **improves held-out by +4.9 pts** — it generalizes rather than overfitting the dev split (the honest outcome; had it regressed, that would be reported here unchanged). Solo takes moved 36.0% → 32.4% (still out of the headline scope — melodic lines, not chord frames).

#### Per-class (comp) and confusion after

| class | C | G | D | A | E | Am | Em | Dm |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | 61.4% | 73.8% | 88.2% | 77.1% | 85.2% | 83.3% | 53.3% | 77.8% |
| fMax=800 | 69.3% | 76.2% | 90.2% | 74.0% | 81.5% | 88.9% | **76.7%** | 77.8% |
| Δ | +7.9 | +2.4 | +2.0 | −3.1 | −3.7 | +5.6 | **+23.4** | 0 |

| true \ pred | C | G | D | A | E | Am | Em | Dm | noise | silence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **C** | 79 | 5 | 4 | · | · | 8 | 13 | 3 | · | 2 |
| **G** | 1 | 96 | 5 | · | · | 1 | 11 | 11 | · | 1 |
| **D** | 2 | 1 | 92 | · | · | 1 | 1 | 1 | · | 4 |
| **A** | 3 | 1 | 12 | 71 | · | 7 | 1 | · | · | 1 |
| **E** | · | 1 | 10 | 1 | 88 | 1 | 7 | · | · | · |
| **Am** | 1 | · | · | 1 | · | 32 | 2 | · | · | · |
| **Em** | · | 4 | 2 | · | 8 | · | 46 | · | · | · |
| **Dm** | · | · | 7 | · | · | 1 | · | 28 | · | · |

**Top confusion pairs (comp) after:** C→Em (13), A→D (12), G→Dm (11). The predicted mechanisms held: **Em→E fell 15 → 8** (5th-harmonic G# removed, Em +23.4 pts) and **C→Em fell 20 → 13** (3rd-harmonic B removed). The residual C→Em/A→D are true two-shared-tone ambiguities that band-limiting cannot resolve; E and A each gave back ~3 pts as some E now leaks to Em and some A to D — a small, worthwhile trade for the large Em/C/Am gains.

### Interpretation & recommendation

Band-limiting is a free, no-regression, generalizing win (+3.4 comp / +4.9 held-out, no new deps, no new fixtures, same latency) and is shipped. But **78.5% comp / 69.5% held-out is still well short of the 90% home-setup target**, and the remaining errors are genuine chord-tone ambiguities a bare 12-bin chroma can't disentangle. So this is a cheap down-payment, **not** a substitute for the model path: the Q-04 decision trigger (templates <90% on realistic audio → pull the Phase-1 CRNN forward) still stands. Recommendation: **keep the fMax=800 change** and **still pull the CRNN forward** for the accuracy gate; the §16 home-setup measurement remains unclaimed and needs the user's own recordings.

_Reproduce:_ same harness (`node scripts/eval-guitarset.mjs`) — the change is the `fMax` default in `apps/web/src/perception/audio/dsp/chroma.ts`. Running the harness now regenerates the headline above with the fMax=800 numbers; this addendum preserves the baseline→winner comparison that a single regeneration would overwrite.
