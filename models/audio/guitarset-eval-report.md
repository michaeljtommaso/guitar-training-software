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
