# Design Brief — Guitar Tutor UI

> A self-contained prompt to hand to an AI design tool (v0, Lovable, Figma AI, etc.)
> to generate UI mockups for the Guitar Tutor app. Paste the block below.

---

Design a UI for a real-time guitar-tutor web app called "Guitar Tutor" (working name).

## WHAT IT IS
A browser app (desktop Chrome/Edge, React) that watches you play guitar through
your webcam and listens through an audio interface, then gives live visual feedback:
it detects your chords, notes, finger positions, and mistakes in real time and
coaches you as you play. It also has a built-in digital amp so you hear amp tone
while practicing. Think "Guitar Hero meets a real teacher," but grounded and
professional, not gamey.

## THE CRITICAL DESIGN CONSTRAINT
The user is HOLDING A GUITAR while using this. They cannot lean in, use a mouse
precisely, or read small text. Everything actionable during play must be readable
and understandable from ~3 feet away at a glance. Big, high-contrast, glanceable.
Feedback must be instantly legible in peripheral vision while their eyes are mostly
on their hands. This is the #1 rule.

## THE SCREENS / PANELS TO DESIGN

1. SETUP WIZARD (first thing the user sees)
   - Start Capture button (primary action, requests camera + mic)
   - Audio input device picker, with a status chip showing "direct input" (good) vs
     "mic · fallback" (degraded)
   - A live input LEVEL METER with a clip indicator
   - An "open-string check": six string indicators that light up as the user strums
     each string, progressing to 6/6
   - An optional "Measure round-trip latency" action
   Design this as a calm, guided, step-by-step onboarding — reassuring, not technical.

2. TONE PANEL (the amp)
   - A Monitor toggle: off / amp (must always default to OFF on load, for safety)
   - Amp controls: drive, EQ, gate, cabinet — knobs or sliders
   - Tone presets (e.g. "Clean Chord Practice")
   - An option to load a cabinet impulse-response (.wav) file
   Design like a tasteful, modern guitar-pedal/amp interface — physical and musical
   in feel, but clean, not skeuomorphic-cheesy.

3. COACH PANEL (the main practice screen — the heart of the app)
   - Large live WEBCAM VIDEO of the fretboard as the centerpiece
   - Overlay ON the video: colored target dots showing where fingers should go
     (labeled Index/Middle/Ring/Pinky), plus markers for open/avoid strings.
     Correct = green, wrong = red flash. THIS overlay must never be obscured by UI.
   - A lesson picker + Start Lesson button
   - Live chord readout (what chord you're playing vs the target)
   - A tuner display
   - A hints/feedback area for corrective coaching messages (must feel encouraging,
     never scolding — trust-preserving)
   Layout so the video + overlay dominate, and all the readouts frame it without
   covering it.

## DESIGN DIRECTION
- Modern, premium, confident. Musician-tool credibility (think high-end audio
  software / boutique pedal brands), not a childish learning app.
- Dark mode as the primary theme (people practice in dim rooms), with a light mode.
- High contrast, large type, generous spacing. Color used meaningfully: green =
  correct, red = mistake, amber = warning/caution.
- Motion should be purposeful and fast (this is a real-time app) — no slow decorative
  animation that competes with live feedback.
- Accessible: colorblind-safe status cues (never rely on red/green alone — pair with
  icons/shapes), large tap targets.

## DELIVERABLES
Full-screen mockups of all three panels (Setup Wizard, Tone Panel, Coach Panel) in
dark mode, plus the Coach Panel in light mode. Show the Coach Panel mid-lesson with
the fretboard overlay and a live chord/feedback state visible.
