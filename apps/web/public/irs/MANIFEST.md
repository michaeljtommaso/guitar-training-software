# Bundled cabinet impulse responses — provenance & licences

License firewall (ADR-011): every shipped asset is **CC0** or **CC-BY** with
verifiable provenance. The three IRs below are all **CC0 (Creative Commons 0 /
public domain dedication)**, so no attribution is legally required — the credit
here is courtesy + auditability. CC0 permits copying, modifying (incl. format
transcoding), and redistribution for any purpose, commercial included.

All three come from the same CC0 pack on Freesound:
**"Speaker Impulse Responses" by user `jesterdyne`** —
<https://freesound.org/people/jesterdyne/packs/6385/>. They are captures of the
cabinet-simulation voicings of a Korg AX1500G modeller, released by the author
under CC0. UI names are descriptive (no amp/brand trademarks); the factual source
lives only here.

## Transcode note (how these bytes were produced)
Freesound gates the original-WAV download behind an authenticated account, which
this build environment does not have. The **publicly served high-quality preview**
(`…-hq.mp3`, ~207 kbps) was fetched instead and decoded to **48 kHz / mono /
16-bit PCM WAV** with ffmpeg (`-map_metadata -1`). CC0 explicitly allows this
modification. The decoded impulses retain a correct guitar-cab response (sharp
onset, mid-forward body, high-frequency roll-off above ~5 kHz), verified
spectrally before shipping. To swap in the lossless originals later, log into
Freesound, download the original .wav for each sound id below, convert to
48 kHz mono, and replace the file (update the sha256 in this manifest).

## Files

| File | UI label | Source (Freesound sound id) | License | Bytes | sha256 |
|------|----------|-----------------------------|---------|-------|--------|
| `vintage-4x12.wav` | Vintage 4x12 | [129399 — "4x12 Vintage"](https://freesound.org/people/jesterdyne/sounds/129399/) | CC0 (Creative Commons 0) | 610 | `aa7e02369d735805bff0f8c2ab8ba160cbdf699883f4e8a7e3d9e883f8ec6fac` |
| `clean-1x12-combo.wav` | Clean 1x12 Combo | [129391 — "1x12 Black Panel"](https://freesound.org/people/jesterdyne/sounds/129391/) | CC0 (Creative Commons 0) | 610 | `ee38a89af6c7a57e827b585819bac0f95919f210382c16a74ed80c16c7568848` |
| `tweed-4x10.wav` | Tweed 4x10 | [129393 — "4x10 Tweet"](https://freesound.org/people/jesterdyne/sounds/129393/) | CC0 (Creative Commons 0) | 610 | `b1e9696d0565de04618be97d5f9b5ba52610e58464cc30000a47d0b2b5290cff` |

Author: `jesterdyne` (Freesound). Pack: 6385. Licence verified on each sound's
Freesound page (displayed as "Creative Commons 0") on 2026-07-07.
