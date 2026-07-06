[ASYNC DELEGATION BATCH COMPLETE — deleg_641a2bd2]
A background fan-out of 3 subagent(s) you dispatched earlier has finished. All ran in parallel and waited on each other; their consolidated results are below. You may have moved on since dispatching — act on these or re-dispatch if things have changed.

Dispatched: 2026-07-02 23:09:15 (9m13s ago)
Role: leaf   Model: gpt-5.4   Total duration: 554.03s

--- ✓ TASK 1/3: Deep research existing commercial guitar-learning software that uses real-time audio and/or vision to watch a player, detect chords/notes/fingering/posture, correct mistakes, display feedback/overlays, and teach guitar. Identify products, features, platform, pricing/status, underlying likely tech, limitations, and whether any have APIs/SDKs or public technical details. Return a citation-heavy Markdown report with URLs.  (status=completed, api_calls=9, 553.89s) ---
## Guitar-learning software deep research report

### What I did
I researched current commercial guitar-learning products that use real-time audio and/or hardware-assisted guidance, plus adjacent/partial-fit products and a few relevant academic vision/AR demos. I pulled data from official product pages, support docs, app-store listings, patent/public-technical materials, and one notable partner-tech announcement.

### Key takeaways
- **The commercial market is still overwhelmingly audio-first, not vision-first.** The strongest commercial products today listen through the **device mic** or an **audio interface/cable** and score timing/pitch/chord accuracy. I did **not** find a major mainstream commercial product that reliably uses a **webcam** to detect full **fingering/posture/wrong-string contact** the way Michael wants.
- **Closest commercial leaders** for real-time feedback are: **Yousician, Rocksmith+, Simply Guitar, Gibson App, Fender Play Feedback Mode, Uberchord**.
- **Hardware-guided alternatives** like **Fret Zealot** and **LiberLive C1** solve some onboarding/fingering problems with LEDs or chord-pad hardware, but they are **not equivalent to camera-based freeform guitar understanding**.
- **APIs/SDKs are mostly absent.** The one clear exception I found is **Uberchord API**. Fender’s feedback appears to be powered by **MatchMySound** (partner tech), but not exposed as a public developer API for guitar apps.
- **Big market gap/opportunity:** a system that combines **mic + webcam/computer vision**, detects **which string/fret/finger is wrong**, understands **posture/left-hand shape/right-hand path**, and gives **overlay corrections** in real time.

---

# 1) Comparison table

| Product | Status | Input modality | What it detects/grades | Teaching/feedback style | Platforms | Pricing/status | Public tech/API notes | Main limitations |
|---|---|---|---|---|---|---|---|---|
| **Yousician** | Active | Mic; can also use connected instrument/audio setup | Officially: instant feedback on **accuracy/timing/precision** while you play | Structured lessons, songs, gamified progression, multi-instrument | iOS, Android, PC/macOS/web ecosystem | Premium / Premium+ / Family; monthly & yearly; 7-day trial; pricing via account pages/support ([site](https://yousician.com), [plans support](https://support.yousician.com/hc/en-us/articles/115005189525-Premium-membership-options-in-Yousician)) | No public API found. Likely audio pitch/onset/timing alignment; product/public patent history overlaps with “interactive guitar game” category ([site](https://yousician.com), [patent context](https://patents.google.com/patent/US9839852B2/en)) | No public evidence of webcam fingering/posture detection; mostly “listens” rather than “watches” |
| **Simply Guitar** | Active | Device mic | Recognizes what you play; gives feedback; support docs reveal mic-permission, tuning, headphone/quiet-room dependence ([official page](https://www.hellosimply.com/simply-guitar), [recognition troubleshooting](https://piano-help.hellosimply.com/en/articles/5135082-improve-note-recognition-in-simply-guitar)) | Beginner-friendly, song-first, video lessons, progress tracking | iOS, Android | Monthly/yearly, 7-day trial on yearly; prices vary by country/platform ([billing help](https://piano-help.hellosimply.com/en/articles/5912097-subscribe-to-simply-guitar), [US App Store listing](https://apps.apple.com/us/app/simply-guitar-learn-guitar/id1476695335)) | No public API found. Patent trail suggests adaptive interactive music teaching IP tied to Simply Ltd ([patent search result](https://patents.google.com/patent/US11670188B2/en)) | Still audio-first; support docs imply recognition is sensitive to bleed/noise/tuning; no camera-based fingering/posture analysis found |
| **Rocksmith+** | Active | Mic app and/or direct cable/interface depending setup | Officially: **real-time feedback**, **note detection**, continuous tracking/analysis, adaptive difficulty | Song-centric, game-like 3D interface, riff repeater, adaptive difficulty, video lessons | iOS, Android, PC, PlayStation | Subscription, free trial messaging on official site ([official](https://www.ubisoft.com/en-us/game/rocksmith/plus), [Google Play](https://play.google.com/store/apps/details?id=com.ubisoft.rocksmith.play.bass.guitar.lessons.tuner.recorder)) | No public API/SDK found. Public patent/litigation history around adaptive guitar-game teaching ([official](https://www.ubisoft.com/en-us/game/rocksmith/plus), [patent](https://patents.google.com/patent/US9839852B2/en)) | Strong on played-note detection, weaker on posture/fingering visibility unless inferred from misses |
| **Fender Play (Feedback Mode)** | Active; feedback feature described as **beta** | Mic/audio listening | **Pitch, rhythm, tempo** feedback; graphically compares playing to tab via MatchMySound partner tech ([support/search result](https://play-support.fender.com/hc/en-us/articles/44538998312603-What-is-Feedback-Mode), [partner announcement](https://www.prweb.com/releases/matchmysound-partners-with-fender-to-create-instant-feedback-feature-for-fender-play-r--867187754.html)) | Traditional lesson platform with select interactive feedback activities | iOS app/web ecosystem | App store lists annual/monthly IAPs incl. ~$89.99 annual in one locale; 14-day free trial messaging ([App Store](https://apps.apple.com/us/app/fender-play-learn-guitar/id1226057939)) | Underlying assessment tech is externally identified: **MatchMySound** and its “note-by-note matching algorithm” ([MatchMySound](https://www.matchmysound.com), [PRWeb](https://www.prweb.com/releases/matchmysound-partners-with-fender-to-create-instant-feedback-feature-for-fender-play-r--867187754.html)) | Feedback mode appears selective/beta, not full app-wide vision/audio tutor; no posture/fingering camera system found |
| **Gibson App** | Active | Mic by default; optional **Zound I/O** interface hardware | Officially claims feedback on **every note and chord**, AI feedback, ~270 tracked guitar skills ([main](https://www.gibson.app), [skills](https://www.gibson.app/skills), [FAQ](https://www.gibson.app/faq)) | Guided path, songs, techniques, leagues, AI feedback, analytics | iOS, Android, Apple Silicon Mac | Free tier, Premium, Premium+; 7-day yearly trial; pricing varies by country/tier ([FAQ](https://www.gibson.app/faq)) | No public API found. Public details mention AI feedback and skill graph, but no developer docs. Optional hardware interface suggests push toward cleaner real-time signal ([Zound I/O](https://www.gibson.app/zound-io)) | Strong feedback claims, but still primarily audio-based; no public webcam/posture/finger-tracking evidence |
| **Uberchord** | Appears active on web; iOS-focused | iPhone mic; optional adapter for electric | Real-time feedback, chord recognition, strumming/rhythm training, song trainer ([site](https://www.uberchord.com), [FAQ](https://www.uberchord.com/faq)) | Chord training, rhythm, daily workout, song catalog | iPhone/iPad/iPod; Android still “on roadmap” per FAQ | $14.99/mo or $89.99/yr in FAQ; iOS only per current FAQ wording ([FAQ](https://www.uberchord.com/faq)) | **Yes: public Uberchord API** for chord/song/search/embed data ([API](https://api.uberchord.com)) | Old-school mobile/audio UX; platform reach limited; no camera-based posture/fret-hand understanding |
| **Chordify** | Active | Audio analysis of songs, not primarily player-performance detection | Extracts/aligns chords for songs; Toolkit helps guitar playing but not true live performance grading | Song chord discovery, transposition, looping, guitar toolkit | Web, iOS, Android | Basic / Premium / Premium+ Toolkit monthly/yearly ([support](https://support.chordify.net/hc/en-us/articles/360002273238-What-are-the-subscription-options), [pricing page](https://chordify.net/premium)) | No public API found from current official surfaces; only community requests surfaced in support search ([community request result](https://support.chordify.net/hc/en-us/community/posts/360005529718-Share-Chordify-API)) | Useful adjacent tool, but **not** a real-time “watch me play and correct my fingering” tutor |
| **Fret Zealot** | Active | Optional LED fretboard hardware; app; “AI Listening Mode” mentioned | Hardware-guided finger placement on fretboard, synchronized with lessons/tabs; app mentions AI listening mode ([official](https://www.fretzealot.com/new-homepage-clone-9), [Google Play result](https://play.google.com/store/apps/details?id=com.fretzealot&hl=en_US)) | LEDs on real fretboard + lessons, tabs, songs, courses | iOS, Android, web + hardware | Subscription trial + optional LED system purchase ([official](https://www.fretzealot.com/new-homepage-clone-9)) | No public API found | Great onboarding/visualization, but it tells you **where** to place fingers more than it truly **detects** freeform fingering/posture via camera |
| **LiberLive C1** | Active | Smart instrument hardware + app | Not traditional guitar detection; chord pads, strumming paddles, app-guided real-time chord sheets/lyrics ([product](https://liberlive.com/products/liberlive-c1-stringless-smart-guitar), [FAQ](https://liberlive.com/pages/faqs)) | Beginner-accessibility, instant song play, no-string simplified learning | Hardware + iOS/Android app | Hardware sale; app is free with no in-app purchases ([FAQ](https://liberlive.com/pages/faqs)) | No public API found | Not a traditional guitar tutor; doesn’t solve camera-based analysis of a normal guitar |

---

# 2) Detailed product notes

## Yousician
**Why it matters:** one of the category leaders and closest thing to “Guitar Hero for real guitar” at scale.  
Official site claims it “listens to you play and gives instant feedback on your accuracy and timing,” with 9,000 lessons and 2,000+ songs on the current homepage snapshot ([https://yousician.com](https://yousician.com)). Support docs show three paid tiers: **Premium**, **Premium+ Personal**, **Premium+ Family**, with monthly/yearly billing and a free trial path ([https://support.yousician.com/hc/en-us/articles/115005189525-Premium-membership-options-in-Yousician](https://support.yousician.com/hc/en-us/articles/115005189525-Premium-membership-options-in-Yousician)).

**Likely tech:** microphone/audio-interface signal ingestion, onset/pitch/timing matching, probably chord/note event alignment against expected score/tab. Public patent-history around Ubisoft’s “interactive guitar game” lawsuit helps frame the broader category mechanics—assessing performance, changing difficulty, fingering notation, targeted mini-games—even if not Yousician’s own public API/docs ([https://patents.google.com/patent/US9839852B2/en](https://patents.google.com/patent/US9839852B2/en)).

**Limitations/opportunity:** Yousician is excellent at **did you play the right thing at roughly the right time?** It is much weaker, publicly, on **which finger is wrong**, **which string is accidentally muted**, **right-hand path**, or **body posture**.

---

## Simply Guitar
Official product page emphasizes song-first learning, guided lessons, tabs/chords, and “real-time feedback” ([https://www.hellosimply.com/simply-guitar](https://www.hellosimply.com/simply-guitar)). Google Play says: “Place your device in front of you and play; the app will immediately recognize what you are playing” ([https://play.google.com/store/apps/details?id=com.joytunes.simplyguitar&hl=en_US](https://play.google.com/store/apps/details?id=com.joytunes.simplyguitar&hl=en_US)).

**Most revealing technical clue:** its own troubleshooting doc. It recommends:
- mic permissions
- headphones if app backing audio interferes
- tuning before play
- quiet room
- removing phone case
- lowering app music
- electric-guitar amp placement/clean tone
- letting strings ring
- avoiding buzz/muting and checking the correct string  
([https://piano-help.hellosimply.com/en/articles/5135082-improve-note-recognition-in-simply-guitar](https://piano-help.hellosimply.com/en/articles/5135082-improve-note-recognition-in-simply-guitar))

That strongly suggests a fairly standard **device-mic audio recognition stack**, not vision. Billing help says monthly/yearly plans exist and prices vary by country/platform ([https://piano-help.hellosimply.com/en/articles/5912097-subscribe-to-simply-guitar](https://piano-help.hellosimply.com/en/articles/5912097-subscribe-to-simply-guitar)).

**Takeaway:** great mainstream benchmark for a polished audio-first beginner UX, but not a camera-based guitar-understanding engine.

---

## Rocksmith+
Official page calls out **real-time feedback**, continuous tracking/analysis, **Adaptive Difficulty**, **Riff Repeater**, and multi-platform support on iOS/Android/PC/PlayStation ([https://www.ubisoft.com/en-us/game/rocksmith/plus](https://www.ubisoft.com/en-us/game/rocksmith/plus)). Google Play explicitly mentions the “unique Rocksmith 3D interface, real-time feedback, Adaptive Difficulty” ([https://play.google.com/store/apps/details?id=com.ubisoft.rocksmith.play.bass.guitar.lessons.tuner.recorder](https://play.google.com/store/apps/details?id=com.ubisoft.rocksmith.play.bass.guitar.lessons.tuner.recorder)).

**Likely tech:** among commercial apps, Rocksmith is still one of the strongest examples of **expected-note tracking against an exact song chart**, especially when used with direct cable/interface input rather than room mic. Public patent-family material in this category reinforces the likely architecture: expected fingering notation display, performance assessment, adaptive difficulty ([https://patents.google.com/patent/US9839852B2/en](https://patents.google.com/patent/US9839852B2/en)).

**Limitations:** very strong at “play this phrase now,” less obviously good at “your third finger is collapsing” or “you hit string 5 accidentally.”

---

## Fender Play + Feedback Mode
Fender Play itself is a large lesson library with 3,000+ bite-sized lessons and 1,000+ songs in the App Store summary, plus integrated “lesson feedback” using **MatchMySound** ([https://apps.apple.com/us/app/fender-play-learn-guitar/id1226057939](https://apps.apple.com/us/app/fender-play-learn-guitar/id1226057939)).

The key technical source is the partner announcement: **Feedback Mode** is powered by MatchMySound’s proprietary algorithm, which listens to guitar playing and graphically compares it to the tab, giving feedback on **pitch, rhythm, and tempo** ([https://www.prweb.com/releases/matchmysound-partners-with-fender-to-create-instant-feedback-feature-for-fender-play-r--867187754.html](https://www.prweb.com/releases/matchmysound-partners-with-fender-to-create-instant-feedback-feature-for-fender-play-r--867187754.html)). MatchMySound itself says it has a “unique note-by-note matching algorithm” and supports progress/assignment/feedback flows for multiple instruments ([https://www.matchmysound.com](https://www.matchmysound.com)).

**Important implication:** Fender is one of the clearest cases where the **assessment layer is a licensable B2B technology partner**, not entirely in-house.

**Limitations:** Fender’s interactive feedback appears narrower than a fully instrument-native vision/audio tutor; also I found no public sign of webcam or posture recognition.

---

## Gibson App
Gibson App is one of the more interesting newer entrants. Official site says it gives “real-time feedback,” listens like a “guitar game,” and is available on iOS/Android ([https://www.gibson.app](https://www.gibson.app)). FAQ says it works with any acoustic/electric guitar, has Free/Premium/Premium+ tiers, and on iOS includes **AI-powered feedback** and a digital amplifier; Android requires headphones when playing ([https://www.gibson.app/faq](https://www.gibson.app/faq)).

Its **Skills & Achievements** page is unusually specific: it tracks **~270 discrete guitar skills** in real time, built from data from **1M+ learners**, and gives post-session analytics and next-step guidance ([https://www.gibson.app/skills](https://www.gibson.app/skills)). Gibson also has **Zound I/O**, an optional guitar interface promising ultra-low latency and cleaner integration into the app ([https://www.gibson.app/zound-io](https://www.gibson.app/zound-io)).

**Likely tech:** audio event detection + skill graph + recommendation system; possibly richer than typical beginner apps, but still fundamentally audio-based from the public evidence.

**Opportunity signal:** Gibson is pushing toward a more “instrument OS” model—feedback, amp, hardware, analytics—yet still does not publicly expose computer vision for fingering/posture.

---

## Uberchord
Uberchord remains notable because it has:
1. real-time guitar feedback through the iPhone mic,
2. a clearer focus on **chord recognition** and **strumming/rhythm training**, and
3. a **public API**.

Official site says it provides real-time feedback, skill adaptation, a “world’s first interactive strumming trainer,” chord recognition, tuner, lesson editor, and song training ([https://www.uberchord.com](https://www.uberchord.com)). FAQ says it uses “advanced audio technology” through the phone mic, recommends iRig2 for electric guitar, is iOS-only for now, and lists current pricing as **$14.99/month or $89.99/year** ([https://www.uberchord.com/faq](https://www.uberchord.com/faq)).

**API:** Uberchord API is public and documented for chord/song/search/embed use cases ([https://api.uberchord.com](https://api.uberchord.com)). That makes it the clearest candidate if Michael wanted to **reuse chord metadata/content infrastructure** rather than build everything from scratch.

**Limitation:** the public API is content/data-oriented, not a public SDK for real-time low-latency listening/assessment.

---

## Chordify
Chordify is important as a **partial-fit adjacent product**, not because it solves the core ask. It is excellent at extracting and displaying song chords, and its subscriptions include Basic / Premium / Premium + Toolkit ([https://support.chordify.net/hc/en-us/articles/360002273238-What-are-the-subscription-options](https://support.chordify.net/hc/en-us/articles/360002273238-What-are-the-subscription-options), [https://chordify.net/premium](https://chordify.net/premium)). But I found no official evidence that Chordify is a robust “watch me play, detect wrong strings/fingers/posture in real time” product.

**Usefulness to Michael:** it is a great benchmark for **chord display UX**, synchronization, and song-learning flows, but not the right model for real-time corrective guitar tutoring.

---

## Fret Zealot
Fret Zealot is one of the strongest **hardware-guided** alternatives. Official page advertises:
- optional LED learning system
- real-time color LED finger positions
- 3,500+ lessons
- 250,000 tabs
- 10,000 chords
- 100+ courses
- **AI Listening Mode**  
([https://www.fretzealot.com/new-homepage-clone-9](https://www.fretzealot.com/new-homepage-clone-9))

This is not freeform vision recognition; instead, it **projects guidance onto the real instrument**. That is commercially smart because it bypasses the hardest CV problem—estimating exact finger/string/fret interactions from casual webcam footage.

**Lesson for product strategy:** if true camera-based fingering detection is too hard/fragile, a hardware-guided path can be much more reliable.

---

## LiberLive C1
LiberLive is not a traditional guitar tutor, but it is commercially relevant because it shows one path to lowering guitar-learning friction. The official product and FAQ describe a **stringless smart guitar** with chord pads, strumming paddles, guiding lights, app-connected real-time chord sheets/lyrics, free app, and no in-app purchases ([https://liberlive.com/products/liberlive-c1-stringless-smart-guitar](https://liberlive.com/products/liberlive-c1-stringless-smart-guitar), [https://liberlive.com/pages/faqs](https://liberlive.com/pages/faqs)).

**Why it matters:** it proves there is a paying beginner market for “play songs immediately” systems.  
**Why it does not solve Michael’s ask:** it avoids traditional guitar fingering rather than understanding and correcting it.

---

# 3) APIs / SDKs / public technical details

## Clear public API found
- **Uberchord API**: documented REST API for chords, songs, search, embedding  
  URL: [https://api.uberchord.com](https://api.uberchord.com)

## Partner tech publicly identified
- **Fender Play Feedback Mode** is powered by **MatchMySound**  
  URLs:  
  - [https://www.prweb.com/releases/matchmysound-partners-with-fender-to-create-instant-feedback-feature-for-fender-play-r--867187754.html](https://www.prweb.com/releases/matchmysound-partners-with-fender-to-create-instant-feedback-feature-for-fender-play-r--867187754.html)  
  - [https://www.matchmysound.com](https://www.matchmysound.com)

## No public developer API/SDK found in official surfaces I checked
- Yousician
- Simply Guitar
- Rocksmith+
- Fender Play
- Gibson App
- Fret Zealot
- LiberLive

Caveat: absence of a surfaced public API is **not proof** that no enterprise/private licensing exists; it means I did not locate a current **public developer offering** in the official/docs/search surfaces I checked.

---

# 4) Likely underlying technical patterns across the market

## What current products actually seem to do
1. **Audio-first event matching**
   - Capture mic/interface audio
   - Estimate note/chord/onset/rhythm/tempo
   - Compare against expected lesson/song events
   - Score and adapt difficulty

2. **Structured expected-content alignment**
   - Products work best when they already know the exact target notes/chords/timing
   - This is much easier than open-ended “what is the player doing?”

3. **Mic-first consumer ergonomics**
   - Low friction, no extra hardware
   - But accuracy suffers from backing-track bleed, room noise, tuning issues, amp effects, buzzing/muting  
   - Simply Guitar’s support doc is especially revealing on these failure modes ([https://piano-help.hellosimply.com/en/articles/5135082-improve-note-recognition-in-simply-guitar](https://piano-help.hellosimply.com/en/articles/5135082-improve-note-recognition-in-simply-guitar))

4. **Optional direct-input hardware for better reliability**
   - Rocksmith cable/interface model
   - Gibson Zound I/O
   - Uberchord recommends iRig2 for electric guitar  
   This is an implicit admission that consumer mic-only recognition is convenient but imperfect.

5. **Very little mainstream webcam/CV**
   - I found no major current market leader centered on webcam-based left-hand/right-hand/posture correction.

---

# 5) Relevant academic / prototype signals for the missing vision layer

These are not major commercial products, but they matter because they show where the **missing capability** is heading:

- **guitARhero: Interactive Augmented Reality Guitar Tutorials** — AR guitar teaching prototype with interactive visual feedback  
  [https://ieeexplore.ieee.org/iel7/2945/10305180/10268399.pdf](https://ieeexplore.ieee.org/iel7/2945/10305180/10268399.pdf)

- **FretMate: ChatGPT-Powered Adaptive Guitar Learning Assistant** — explicitly mentions a gesture-recognition module using computer vision to analyze hand movements and finger positions during guitar playing  
  [https://dl.acm.org/doi/10.1145/3708359.3712080](https://dl.acm.org/doi/10.1145/3708359.3712080)

These academic systems are much closer to Michael’s requested feature set than today’s mainstream commercial apps.

---

# 6) Gaps and opportunities for Michael’s app

## Biggest market gaps
### 1. **Vision + audio fusion is still largely open**
Commercial leaders mostly answer:
- “Did you play the right note/chord at the right time?”

They do **not** robustly answer:
- “Which finger is wrong?”
- “Which string did you accidentally brush?”
- “Is your thumb/wrist/posture causing the error?”
- “Are you fretting too far from the fret?”
- “Did you mute string 2 with finger 3?”
- “Did you use an inefficient fingering even though the audio passed?”

### 2. **No dominant consumer product for webcam overlay correction**
There is no obvious “Duolingo for guitar + webcam posture/fingering correction” leader.

### 3. **No open developer ecosystem**
Outside Uberchord content APIs and MatchMySound’s visible B2B presence, the market is closed.

## What a differentiated product could do
A strong next-gen app could combine:
- **mic-based note/chord/rhythm detection**
- **webcam-based left-hand fret/string/finger tracking**
- **right-hand strum/picking-path analysis**
- **real-time overlays on the user’s own guitar image**
- **error attribution** (“wrong string”, “muted string”, “finger too flat”, “fret too far back”)
- **posture/ergonomics feedback**
- **teaching mode** + **free play mode**
- **confidence score / ambiguity handling**
- optional **audio interface** support for electric users

## Best product-positioning opportunity
The most defensible wedge is **“corrective intelligence”**, not content library size:
- existing incumbents already have huge lesson/song catalogs
- fewer can truly say: **“we can see why you made the mistake, not just that you made it.”**

---

# 7) Practical benchmark recommendations

If Michael is building this, the best commercial benchmarks are:

- **Yousician** → best benchmark for mainstream gamified audio-feedback UX  
  [https://yousician.com](https://yousician.com)

- **Rocksmith+** → best benchmark for song-centric real-time note detection and adaptive practice loops  
  [https://www.ubisoft.com/en-us/game/rocksmith/plus](https://www.ubisoft.com/en-us/game/rocksmith/plus)

- **Fender Play + MatchMySound** → best benchmark for outsourced/embedded assessment engine and tab-comparison feedback  
  [https://www.prweb.com/releases/matchmysound-partners-with-fender-to-create-instant-feedback-feature-for-fender-play-r--867187754.html](https://www.prweb.com/releases/matchmysound-partners-with-fender-to-create-instant-feedback-feature-for-fender-play-r--867187754.html)

- **Gibson App** → best benchmark for skill graph / analytics / AI-feedback product framing  
  [https://www.gibson.app/skills](https://www.gibson.app/skills)

- **Fret Zealot** → best benchmark for real-instrument visual guidance hardware  
  [https://www.fretzealot.com/new-homepage-clone-9](https://www.fretzealot.com/new-homepage-clone-9)

- **Uberchord** → best benchmark for chord/rhythm-specific feedback and only clear API surface  
  [https://www.uberchord.com](https://www.uberchord.com), [https://api.uberchord.com](https://api.uberchord.com)

---

## Bottom line
**Today’s commercial guitar-learning market is mature in real-time audio feedback, immature in real-time computer vision.**  
If Michael wants a product that uses **webcam + microphone** to catch **wrong fingering, wrong strings, muted notes, hand posture, and teach with live overlays**, he is targeting a **real market gap**, not building a me-too clone.

### Files created/modified
- None. I only performed web research and compiled findings.

### Issues encountered
- Some official pages were JS-heavy or failed extraction directly (notably some Fender/Chordify/Yousician support pages), so I cross-validated with app-store listings, support search results, and partner/public announcement pages.
- Public pricing is inconsistent by region/platform for some products (especially Simply Guitar, Yousician, Rocksmith+, Gibson App), so I reported either official billing structure or concrete app-store examples where exact universal pricing was not publicly exposed.

--- ✓ TASK 2/3: Deep research open-source GitHub projects, papers, and libraries relevant to building real-time guitar training using audio transcription/chord detection and computer vision/finger/fret/string tracking. Find whether this already exists as an open-source app; if not, identify closest building blocks. Return a citation-heavy Markdown report with repo URLs, stars/activity if available, tech stack, license, maturity, and integration notes.  (status=completed, api_calls=8, 374.53s) ---
# Deep research report: open-source building blocks for a real-time guitar trainer using **audio + vision**

## Executive summary

**Short answer:** I did **not** find a mature open-source app that already delivers the full target product: **real-time guitar training with both** (1) **audio transcription/chord/note correctness** and (2) **computer-vision-based fret/string/finger placement verification**, with polished feedback comparable to Rocksmith/Yousician. The closest open-source projects are all **partial** or **prototype-stage**:

- **Vision-first real-time chord tutor:**  
  [`nathanchiu05/Computer-Vision-Guitar-Tutor`](https://github.com/nathanchiu05/Computer-Vision-Guitar-Tutor) (“Chordially”) uses **ArUco + MediaPipe** for real-time chord feedback, but no robust audio transcription layer.  
- **Multimodal research prototype:**  
  [`davidshavin4/Learning-Guitar-with-Deep-Learning`](https://github.com/davidshavin4/Learning-Guitar-with-Deep-Learning) explicitly fuses **audio spectrograms + left-hand visual crops**, but is only **5 commits** and looks like a class/research project.  
- **Video+audio tab generation prototype:**  
  [`carlosmbe/TappyTabs_TestCode`](https://github.com/carlosmbe/TappyTabs_TestCode) and the paper **TapToTab** target video-based tab generation from audio+vision, but the repo is a **6-commit messy R&D prototype** and not a training app.  
- **Audio-first learning app:**  
  [`Guitariz/Guitariz`](https://github.com/Guitariz/Guitariz) is the strongest polished OSS **music-learning web app**, but it is **audio/theory oriented** (Madmom chord recognition, Demucs separation, tuner, fretboard) rather than vision-based fingering verification.  
- **Real-time note/fretboard trainer:**  
  [`orhun/tuitar`](https://github.com/orhun/tuitar) does real-time note tracking/tuning and fretboard visualization, but no camera/CV.

So the best answer is: **no, not as a mature OSS end-to-end app**. But the building blocks are now good enough that a practical MVP is realistic.

---

## 1) Closest open-source apps / prototypes

| Project | Relevance | Stack | License | Activity / maturity | What it proves | Integration notes |
|---|---|---|---|---|---|---|
| [`nathanchiu05/Computer-Vision-Guitar-Tutor`](https://github.com/nathanchiu05/Computer-Vision-Guitar-Tutor) | Closest **vision-based real-time tutor** | Python, OpenCV, **MediaPipe**, **ArUco** markers, CSV chord library | Not clearly exposed in extract | **24 commits**; prototype/student-project feel | Real-time hand tracking + mapped fretboard + chord matching is feasible in OSS | Good starting point for **left-hand correctness**; weak on audio, uses markers, likely brittle in natural settings. [Repo extract] |
| [`davidshavin4/Learning-Guitar-with-Deep-Learning`](https://github.com/davidshavin4/Learning-Guitar-with-Deep-Learning) | Closest explicit **audio+vision fusion** | Python, CNNs, spectrogram pipeline, left-hand detection/cropping | Not exposed | **5 commits**; very immature | Multimodal architecture: raw guitar audio → spectrograms + hand pose crop → fused classifier | Valuable as a concept, not a base product. Likely needs total rebuild. [Repo extract] |
| [`carlosmbe/TappyTabs_TestCode`](https://github.com/carlosmbe/TappyTabs_TestCode) | Closest to **video+audio tab generation** | macOS app / Xcode project / CoreML-style packaging implied | `LICENSE` file present; exact license not exposed in extract | **6 commits**; explicitly “messy prototype” | Video-based guitar tab generation from fretboard CV + audio analysis | Strong proof-of-concept direction; not product-ready. Connects directly to **TapToTab** paper. [Repo](https://github.com/carlosmbe/TappyTabs_TestCode), [Paper](https://arxiv.org/abs/2409.08618) |
| [`Guitariz/Guitariz`](https://github.com/Guitariz/Guitariz) | Most polished **open-source guitar learning web app** | React/TS frontend, FastAPI backend, **Madmom** chord recognition, **Demucs**, tuner, WebSockets, PWA | **MIT** | **247 commits**, release **v1.7.0** | Good OSS baseline for product UX, audio features, theory/training UI | Missing camera-based fingering validation, but strongest **product shell**. [Repo extract] |
| [`orhun/tuitar`](https://github.com/orhun/tuitar) | Best real-time **note/fretboard training** OSS tool | Rust, Ratatui, ESP32 firmware/hardware | **Apache-2.0 or MIT** | **176 commits**, 1 release, prototype but active | Real-time note tracking + virtual fretboard + song/scales modes | Strong low-latency note/fretboard UX ideas; no CV. [Repo extract] |
| [`iamdey/raf`](https://github.com/iamdey/raf) | Open-source song practice UI | Web, alphaTab, PixiJS, TypeScript | `COPYING` present; exact license not exposed in extract | **16 commits**, “very early stage” | Progressive tab display + song practice | Useful only as UI inspiration; no audio/CV feedback. [Repo extract] |
| [`djbacad/guitar-chord-recognition`](https://github.com/djbacad/guitar-chord-recognition) | Real-time **vision-only chord classification** | TensorFlow, Keras, transfer learning, EfficientNetV2-style CV | Not exposed | **28 commits**; prototype | Webcam/video chord class prediction is feasible | Useful as visual chord classifier baseline; no explicit string/fret geometry reasoning. [Repo extract] |
| [`akshaybahadur21/Guitar-Learner`](https://github.com/akshaybahadur21/Guitar-Learner) | Older/simple chord-classifier prototype | Python scripts, dataset builder, trainer | `LICENSE` file present | **5 commits** | Basic guitar chord detection/classification demo | Likely too primitive for modern use. [Repo extract] |
| [`1j01/guitar`](https://github.com/1j01/guitar) | Browser-based fretboard/tab UX | Web app, tablature parser, guitar synth, tuna audio effects | `LICENSE` present; exact type not exposed in extract | **102 commits** | Browser UX for fretboard/tab interaction | Good for UI ideas if building a browser-first practice surface. [Repo extract] |

**Conclusion on existing apps:**  
The **closest thing to the exact requested product** is probably a **hybrid of**:

- **Guitariz** for the app shell and audio-analysis UX, plus
- **Chordially** for fretboard/hand tracking, plus
- **Basic Pitch / GuitarSet / FretNet-style models** for note/tab inference.

No single OSS repo already cleanly combines those.

---

## 2) Best audio/transcription building blocks

### A. Real-time or near-real-time audio transcription / pitch / chord layers

| Project | Use | Stack | License | Activity / maturity | Why it matters |
|---|---|---|---|---|---|
| [`spotify/basic-pitch`](https://github.com/spotify/basic-pitch) | **Polyphonic audio-to-MIDI** / note events | Python; TF/CoreML/TFLite/ONNX runtimes | **Apache-2.0** | **266 commits**, **8 releases**, used by **257** repos in extract | Probably the best pragmatic OSS note-transcription layer for guitar MVPs. Works best on one instrument at a time. Backed by paper “A Lightweight Instrument-Agnostic Model for Polyphonic Note Transcription and Multipitch Estimation.” [Repo extract], [Paper](https://arxiv.org/abs/2203.09893) |
| [`spotify/basic-pitch-ts`](https://github.com/spotify/basic-pitch-ts) | Browser/Node AMT | TypeScript / npm | License not explicitly exposed in extract, but sibling project tracks Basic Pitch | Mature sibling, browser-friendly | Important if you want **browser/WebRTC** inference. Accepts Web Audio-compatible formats and mirrors Python functionality. [Repo extract] |
| [`cwitkowitz/amt-tools`](https://github.com/cwitkowitz/amt-tools) | Research/training framework for AMT | PyTorch | `LICENSE.txt` present | **185 commits** | Best framework if you want to train/customize guitar transcription models rather than just consume them. [Repo extract] |
| [`cwitkowitz/guitar-transcription-with-inhibition`](https://github.com/cwitkowitz/guitar-transcription-with-inhibition) | Guitar tablature transcription with playability constraints | PyTorch + amt-tools | `LICENSE.txt` present | **74 commits** | Valuable because guitar training needs **playable string/fret outputs**, not just pitches. [Repo extract], [Paper](https://arxiv.org/abs/2204.08094) |
| [`cwitkowitz/guitar-transcription-continuous`](https://github.com/cwitkowitz/guitar-transcription-continuous) | **FretNet** / continuous-valued pitch contour streaming for guitar tabs | PyTorch + amt-tools | `LICENSE.txt` present | **93 commits** | One of the strongest guitar-specific tab-transcription research codebases. [Repo extract], [Paper link in repo](https://arxiv.org/abs/2212.03023) |
| [`trimplexx/music-transcription`](https://github.com/trimplexx/music-transcription) | CRNN guitar tab transcription from polyphonic audio | PyTorch, CQT, GRU | **MIT** | **36 commits**, **12 stars** | Strong recent repo with explicit GuitarSet performance claim (**0.8736 MPE F1**). [Repo extract] |
| [`marl/crepe`](https://github.com/marl/crepe) | Monophonic pitch tracking | Python / CNN | **MIT** | **85 commits**, 5 releases | Useful for single-note mode, tuning, bends, vibrato, or isolated-string scenarios; not enough alone for polyphonic strumming. [Repo extract] |
| [`CPJKU/madmom`](https://github.com/CPJKU/madmom) | Onset/beat/chord MIR toolkit | Python | BSD code, but **model/data files CC BY-NC-SA 4.0** | **1,753 commits** | Excellent for onset detection, beat tracking, some online/live pipelines; licensing caveat matters for commercial use. [Repo extract] |
| [`MTG/essentia`](https://github.com/MTG/essentia) | MIR/DSP/chroma/chord/onset features | C++ + Python bindings | **AGPLv3** | Mature library | Very strong DSP/MIR toolbox; AGPL may be a blocker depending on distribution model. [Repo extract] |

### Audio takeaways

- For a **real product MVP**, **Basic Pitch** is the strongest starting point for polyphonic note events, especially if you can isolate guitar or ensure solo-guitar input.  
- For **guitar-specific playable tab outputs**, the **Cwitkowitz stack** (amt-tools + inhibition/FretNet repos) is the best research path.  
- For **live rhythm feedback**, **Madmom** is especially useful for **onset/beat** layers, though its model license can matter.  
- For **browser-first**, `basic-pitch-ts` is a major enabler.

---

## 3) Best computer-vision building blocks

### A. Hand / finger / pose tracking

| Project | Use | Stack | License | Activity / maturity | Integration notes |
|---|---|---|---|---|---|
| [`google-ai-edge/mediapipe`](https://github.com/google-ai-edge/mediapipe) | Real-time hand landmarks / pose / on-device CV | C++ / Python / Android / iOS / Web | Apache-2.0 indicated in repo extracts | Large mature project; official docs moved to developers.google.com | Default choice for **hand landmarks** in webcam/browser/mobile setups. Not guitar-specific; you must map landmarks to strings/frets yourself. [Repo extract] |
| [`nathanchiu05/Computer-Vision-Guitar-Tutor`](https://github.com/nathanchiu05/Computer-Vision-Guitar-Tutor) | Guitar-specific hand+fretboard mapping | Python, OpenCV, MediaPipe, ArUco | Not exposed | **24 commits** | Good concrete example of using MediaPipe hands + explicit fretboard geometry. [Repo extract] |
| [`djbacad/guitar-chord-recognition`](https://github.com/djbacad/guitar-chord-recognition) | Visual chord classification | TF/Keras/CNN | Not exposed | **28 commits** | Good if you want classification by image rather than geometry reasoning. [Repo extract] |
| [`omatsui/guitar-posture-analyzer`](https://github.com/omatsui/guitar-posture-analyzer) | Posture analysis | MediaPipe Pose + logistic regression | Not extracted in detail | Search result suggests real-time posture QA | Useful extra feature for teaching ergonomics, but not fingering correctness. [Search](https://github.com/omatsui/guitar-posture-analyzer) |

### B. Fretboard / string / instrument localization

| Project | Use | Notes |
|---|---|---|
| [`nathanchiu05/Computer-Vision-Guitar-Tutor`](https://github.com/nathanchiu05/Computer-Vision-Guitar-Tutor) | ArUco-based fretboard mapping | Best concrete OSS example found for **explicit fretboard calibration**. Great for controlled setups; less ideal for consumer UX because markers are intrusive. |
| [`wumbo/Guitar-String-Recognition`](https://github.com/wumbo/Guitar-String-Recognition) | Guitar string extraction from image | Old/simple OpenCV approach; useful as a reference for line/string detection. [Search result](https://github.com/wumbo/Guitar-String-Recognition) |
| [`sagarnildass/Guitar-Detection-YOLO-V8`](https://github.com/sagarnildass/Guitar-Detection-YOLO-V8) | Detect guitar object with YOLOv8 | Not enough by itself, but good for **instrument ROI detection** before fine fretboard estimation. [Search result](https://github.com/sagarnildass/Guitar-Detection-YOLO-V8) |

### CV takeaways

- **MediaPipe Hands** is the default backbone.
- The hard unsolved piece is not hand landmarks alone; it is **calibrating those landmarks into fret/string coordinates** under real camera angles, occlusion, and motion blur.
- Marker-based systems (ArUco) are easiest to get working; markerless systems will likely need:
  1. guitar detection/ROI,
  2. neck/fretboard pose estimation,
  3. line detection or learned keypoint model for strings/frets,
  4. temporal smoothing.

---

## 4) Best datasets and papers

### Must-have dataset

| Resource | Why important | Notes |
|---|---|---|
| **GuitarSet** — [`marl/GuitarSet`](https://github.com/marl/GuitarSet), dataset on [Zenodo](https://zenodo.org/records/3371780) | The standard OSS dataset for guitar transcription research | Provides recordings plus **string and fret annotations**, chords, beats, downbeats, style metadata. The ISMIR 2018 paper explicitly highlights time-aligned **string/fret** information and hexaphonic pickup methodology. [Repo extract], [Paper PDF](https://archives.ismir.net/ismir2018/paper/000188.pdf) |

### Important papers / code pairs

| Paper / code | Relevance | Why it matters |
|---|---|---|
| **Basic Pitch** paper — [arXiv:2203.09893](https://arxiv.org/abs/2203.09893), code: [`spotify/basic-pitch`](https://github.com/spotify/basic-pitch) | Lightweight polyphonic AMT | Best practical OSS transcription core for MVP. |
| **TapToTab: Video-Based Guitar Tabs Generation using AI and Audio Analysis** — [arXiv:2409.08618](https://arxiv.org/abs/2409.08618), prototype: [`carlosmbe/TappyTabs_TestCode`](https://github.com/carlosmbe/TappyTabs_TestCode) | Closest research direction to the user’s exact goal | Explicitly targets tabs from **video + audio**. |
| **A Data-Driven Methodology for Considering Feasibility and Pairwise Likelihood in Deep Learning Based Guitar Tablature Transcription Systems** — [arXiv:2204.08094](https://arxiv.org/abs/2204.08094), code: [`guitar-transcription-with-inhibition`](https://github.com/cwitkowitz/guitar-transcription-with-inhibition) | Playability-aware tab inference | Helps convert raw pitch predictions into guitar-feasible string/fret outputs. |
| **FretNet: Continuous-Valued Pitch Contour Streaming for Polyphonic Guitar Tablature Transcription** — code: [`guitar-transcription-continuous`](https://github.com/cwitkowitz/guitar-transcription-continuous) | Guitar-specific continuous transcription | Better for expressive pitch contours than coarse note-only outputs. |
| **High Resolution Guitar Transcription via Domain Adaptation** — [arXiv HTML](https://arxiv.org/html/2402.15258v1) | SOTA-ish zero-shot guitar transcription direction | Strong argument that transfer/domain-adaptation pipelines are now viable for guitar even with scarce labeled data. |
| **CNN Transfer Learning for Visual Guitar Chord Classification** — [PDF](https://shawnbzhang.github.io/assets/PDFs/CS_230_Report.pdf) | Visual chord recognition | Good for image-classification framing of left-hand chord shapes. [Search result surfaced it] |
| **Guitar chord recognition based on finger patterns with deep learning** — [ACM DOI](https://dl.acm.org/doi/10.1145/3290420.3290422) | Vision-based finger-pattern recognition | Strongly aligned with the finger/fret CV problem. |
| **Three-Dimensional Vision-Based Recognition of Guitar Chords** — [MIT/Computer Music Journal page](https://direct.mit.edu/comj/article/doi/10.1162/COMJ.a.690/135590/Three-Dimensional-Vision-Based-Recognition-of) | 3D vision for chord recognition | Important prior art if you later consider depth cameras. |

### Research takeaways

- **Audio transcription** is much more mature than **markerless visual fingering verification**.
- The most novel/hard part of the desired app is **synchronizing playable note hypotheses from audio with observed finger placement from video**.
- GuitarSet remains foundational because it provides **string/fret labels**, not just pitch.

---

## 5) Browser / WebRTC / productization options

If Michael wants a **browser-first trainer**, the OSS stack is surprisingly plausible:

### Strong browser-compatible pieces
- **Audio AMT:** [`spotify/basic-pitch-ts`](https://github.com/spotify/basic-pitch-ts)  
- **CV landmarks:** **MediaPipe Web** via the MediaPipe ecosystem ([repo](https://github.com/google-ai-edge/mediapipe))  
- **Learning UI shell:** ideas from [`Guitariz/Guitariz`](https://github.com/Guitariz/Guitariz) and [`1j01/guitar`](https://github.com/1j01/guitar)  
- **Tab rendering:** `alphaTab` is used by [`iamdey/raf`](https://github.com/iamdey/raf)  
- **Realtime streaming architecture:** Guitariz’s backend includes `websocket_chords.py` for real-time chord streaming in a FastAPI setup. [Repo extract]

### What likely works in browser MVP
1. **Mic input** via Web Audio / WebRTC  
2. **Basic Pitch TS** for note events  
3. **MediaPipe Hands** for 21-point hand landmarks  
4. A neck ROI estimator / manual calibration step  
5. Feedback UI:
   - expected chord/notes
   - played notes
   - estimated fretting region
   - confidence score
   - timing/onset feedback

### What likely does *not* work well yet in pure browser MVP
- Fully robust **markerless** fret/string mapping across random camera angles
- Accurate multi-note fingering verification during fast chord changes without a custom trained CV model
- Rocksmith-grade latency/accuracy without careful performance engineering

---

## 6) Recommended architecture from the available OSS

## Best practical MVP stack

### Option A — fastest path to working prototype
- **Frontend / UI:** use **Guitariz-like** web stack patterns ([repo](https://github.com/Guitariz/Guitariz))
- **Audio layer:** **Basic Pitch** / **Basic Pitch TS** ([Python](https://github.com/spotify/basic-pitch), [TS](https://github.com/spotify/basic-pitch-ts))
- **Rhythm/onset layer:** **Madmom** ([repo](https://github.com/CPJKU/madmom))
- **CV layer:** **MediaPipe Hands**
- **Fretboard calibration:** start with **ArUco markers** like **Chordially** ([repo](https://github.com/nathanchiu05/Computer-Vision-Guitar-Tutor))
- **Target content:** chord drills first, then scale exercises, then riffs

**Why:** this is the shortest route to “does the user’s fretting match the expected shape and timing?”

### Option B — best research-quality path
- **Dataset:** GuitarSet ([repo](https://github.com/marl/GuitarSet), [dataset](https://zenodo.org/records/3371780))
- **AMT framework:** **amt-tools** ([repo](https://github.com/cwitkowitz/amt-tools))
- **Playable tab inference:** **guitar-transcription-with-inhibition** + **FretNet** repos  
- **Custom CV model:** train guitar-neck keypoints / string-fret intersections + fingertip contact estimation
- **Fusion:** combine audio-derived candidate notes with visual string/fret contact priors

**Why:** this is the best route to accurate per-note/per-string correctness, but much slower.

---

## 7) What is still missing in open source

The OSS gap is not “can we detect pitch?” or “can we track hands?” Both exist. The gap is this **joined inference problem**:

> **At time t, did the player fret the intended string/fret(s) and sound them correctly?**

That requires all of:
- time-aligned **onset detection**
- **polyphonic note estimation**
- **string/fret disambiguation**
- **camera-space to fretboard-space mapping**
- **occlusion handling**
- **feedback logic** tolerant to human variation

No OSS project I found solves all of that cleanly as a reusable product.

---

## 8) Best building blocks shortlist

If I had to choose only the most relevant components:

### Product shell / UX
- [`Guitariz/Guitariz`](https://github.com/Guitariz/Guitariz)

### Audio transcription
- [`spotify/basic-pitch`](https://github.com/spotify/basic-pitch)
- [`spotify/basic-pitch-ts`](https://github.com/spotify/basic-pitch-ts)

### Guitar-specific transcription research
- [`cwitkowitz/amt-tools`](https://github.com/cwitkowitz/amt-tools)
- [`cwitkowitz/guitar-transcription-with-inhibition`](https://github.com/cwitkowitz/guitar-transcription-with-inhibition)
- [`cwitkowitz/guitar-transcription-continuous`](https://github.com/cwitkowitz/guitar-transcription-continuous)
- [`trimplexx/music-transcription`](https://github.com/trimplexx/music-transcription)

### Vision / hand tracking
- [`google-ai-edge/mediapipe`](https://github.com/google-ai-edge/mediapipe)
- [`nathanchiu05/Computer-Vision-Guitar-Tutor`](https://github.com/nathanchiu05/Computer-Vision-Guitar-Tutor)

### Dataset / evaluation
- [`marl/GuitarSet`](https://github.com/marl/GuitarSet)

### DSP / onset / chord / rhythm
- [`CPJKU/madmom`](https://github.com/CPJKU/madmom)
- [`MTG/essentia`](https://github.com/MTG/essentia)

---

## Bottom line

**Does this already exist as a solid open-source app?**  
**No** — not as a mature, well-maintained OSS app that combines **real-time guitar pedagogy + audio transcription + CV-based fingering verification**.

**What exists instead?**  
A strong set of **near-composable building blocks**:

- **Basic Pitch** for polyphonic note events
- **MediaPipe** for hand landmarks
- **Chordially** for fretboard mapping ideas
- **GuitarSet** for evaluation/training
- **FretNet / inhibition-based guitar transcription** for playable tab inference
- **Guitariz** for a modern web app shell and music-learning UX

That combination is enough to build a compelling MVP, especially if the first version:
1. starts with **chord drills / slow exercises**,  
2. uses **marker-based calibration** or constrained camera setup, and  
3. uses audio primarily to confirm **what sounded**, with vision confirming **how it was fingered**.

---

## Concise task summary

### What I did
- Searched GitHub and the web for open-source guitar training, transcription, chord detection, tab following, fretboard detection, MediaPipe, YOLO/OpenCV guitar CV, Rocksmith-like apps, and browser-first/web prototypes.
- Extracted and compared the most relevant repos, datasets, and papers.

### What I found
- No mature OSS app fully matches the target product.
- Closest end-to-end prototypes:  
  - **Chordially** (vision-only tutor)  
  - **Learning Guitar with Deep Learning** (audio+vision research prototype)  
  - **TappyTabs / TapToTab** (video+audio tab generation prototype)  
  - **Guitariz** (best product shell, audio-focused)  
  - **Tuitar** (real-time note/fretboard trainer, no CV)
- Best building blocks: **Basic Pitch**, **MediaPipe**, **GuitarSet**, **amt-tools / FretNet / inhibition**, **Madmom**, **Essentia**.

### Files created or modified
- **None**. This environment exposed web research tools but no local file-write tool in this task.

### Issues encountered
- GitHub page extraction often hid **star counts/watchers/forks**, so I reported **stars/activity only where the tool exposed them** and otherwise used **commit count / releases / prototype status** as maturity signals.

--- ✓ TASK 3/3: Design a complete implementation strategy for a real-time multimodal guitar tutor: front-end UX, webcam/audio capture, ML models, signal processing, inference pipeline, latency budgets, datasets, evaluation, MVP roadmap, and risks. Specifically address using a powerful multimodal model such as 'Fable 5 Clubs' / frontier vision-language-audio model if available, and fallback open-source/on-device components. Return a detailed Markdown technical architecture and build plan.  (status=completed, api_calls=5, 233.64s) ---
# Real-Time Multimodal Guitar Tutor — Technical Architecture & Build Plan

## 1. Product goal

Build a personal guitar training app that can:

- watch the player in real time via webcam
- listen to guitar audio via microphone or direct input
- identify chords, notes, rhythm, and probable key
- detect wrong string/fret/fingering when teaching an exercise
- provide immediate visual feedback and spoken/text coaching
- highlight what to fix next: finger placement, muted strings, timing, strumming pattern, chord transitions

This is a **multimodal tutoring system**, not just a chord recognizer. It must combine:

- **vision**: hands, fretboard, finger positions, pick/strumming motion
- **audio**: note/chord/onset/pitch/timing estimation
- **music context**: chord progression, key, exercise intent, expected fingering
- **teaching logic**: feedback prioritization, drill generation, progression tracking

---

## 2. Product scope by phase

## Phase 0: Narrow MVP
Focus on beginner acoustic/electric guitar with:

- open chords
- standard tuning
- seated practice position
- front/angled webcam
- mono mic audio
- single-user real-time feedback

### MVP use cases
1. **Chord coach**
   - “Show me G major”
   - App overlays target finger positions and confirms when correct.

2. **Play-along correction**
   - User plays a chord progression.
   - App detects chord timing and flags wrong chord / dead string / missing note.

3. **Strumming/timing coach**
   - App listens for down/up pattern alignment to metronome/backing track.

4. **Lesson mode**
   - App displays next chord, next finger, common mistakes, and progress.

## Phase 1
- bar chords
- capo support
- fingerstyle
- alternate camera angles
- mobile companion
- teacher dashboard / session replay

## Phase 2
- improvisation feedback
- scale position tutoring
- expressive technique recognition: bends, slides, hammer-ons, pull-offs, vibrato
- adaptive curriculum
- multimodal voice tutor with natural conversation

---

## 3. User experience design

## Core UX principles
- feedback must be **instant and sparse**
- show **one correction at a time**
- avoid punishing false positives
- confidence-aware UI: “likely muted B string” is better than wrong certainty
- audio and visual feedback should reinforce each other

## Main screens

### A. Practice home
- Start lesson
- Free play
- Chord trainer
- Scale trainer
- Review mistakes

### B. Real-time lesson screen
Layout:
- live webcam feed with overlay
- chord diagram target panel
- current detected chord
- key / progression panel
- confidence bar
- issue stack: “index finger too far behind fret”, “high E not ringing”
- mini fretboard heatmap
- metronome / tempo status
- optional voice coach button

### C. Session review
- timeline of mistakes
- chord transition latency
- missed strings
- rhythm drift
- “most common fingering issue”
- clips where feedback fired

## Real-time feedback design
Use three layers of feedback:

1. **Immediate micro-feedback** (<300 ms)
   - red/yellow/green string indicators
   - finger halo on misplaced finger
   - “late strum”, “muted G string”

2. **Short coaching feedback** (0.5–2 s)
   - “Rotate wrist slightly”
   - “Ring finger should move to low E, 3rd fret”

3. **Reflective post-phrase feedback**
   - “2/8 chord changes were late”
   - “You consistently missed the B string on C major”

## Interaction model
- default silent visuals while playing
- spoken feedback only on pauses or when user asks
- push-to-talk or voice assistant mode for:
  - “What am I doing wrong?”
  - “Show me slower”
  - “Quiz me on the next chord”

---

## 4. Platform strategy: web vs desktop vs mobile

## Recommended launch order
**Desktop/web-first**, mobile later.

## Web app advantages
- easiest onboarding
- webcam/mic via browser
- fast iteration on overlays and lessons
- deployable with WebRTC + Web Audio + WebGPU/WASM

## Web app limitations
- browser audio stack can be inconsistent
- mobile browser performance/thermal constraints
- camera angle control limited
- lower reliability for heavy on-device multimodal inference

## Desktop app advantages
- better control over low-latency audio/video
- easier hardware acceleration
- can bundle local models
- more reliable for long practice sessions

## Mobile app advantages
- best camera convenience
- likely where users actually practice
- can use phone mounted to observe fretboard

## Mobile limitations
- compute and battery
- harder real-time multi-model inference
- backgrounding / audio session complexity

## Recommendation
- **MVP**: browser app + optional lightweight backend
- **Beta**: Electron/Tauri desktop build for serious users
- **Later**: native mobile companion for capture and review

---

## 5. High-level system architecture

```text
[Browser/Desktop Client]
  ├─ Webcam Capture
  ├─ Microphone / Line-in Capture
  ├─ Real-time UI + Overlay Renderer
  ├─ Local low-latency inference
  │   ├─ Hand/Fretboard tracking
  │   ├─ Audio DSP
  │   ├─ Lightweight chord/note models
  │   └─ Event fusion
  └─ Stream selected features/events to backend

[Realtime Backend]
  ├─ Session orchestration
  ├─ State store (exercise, target chord, calibration, timing)
  ├─ Heavier ML inference
  │   ├─ multimodal tutor model
  │   ├─ vision refinement
  │   ├─ sequence models
  │   └─ feedback ranking
  ├─ Analytics / replay
  └─ content / curriculum service

[Model Layer]
  ├─ Frontier multimodal model (if available)
  ├─ fallback specialized models
  ├─ rules + music theory engine
  └─ evaluation pipeline

[Data Layer]
  ├─ lesson definitions
  ├─ chord/fingering library
  ├─ calibration profiles
  ├─ annotated training data
  └─ telemetry / metrics
```

---

## 6. Realtime multimodal inference strategy

## Key design decision
Do **not** send raw continuous high-rate audio/video to a frontier model and hope it becomes a tutor. Instead:

- run **specialized low-latency perception locally**
- extract structured events/features
- use a frontier multimodal model for:
  - explanation
  - ambiguous reasoning
  - high-level coaching
  - lesson planning
  - replay analysis
  - confidence-aware synthesis of multi-signal evidence

This keeps latency low and cost bounded.

---

## 7. Model architecture options

## Option A: Frontier model path (“Fable 5 Clubs” / equivalent)
Treat **“Fable 5 Clubs”** as an ambiguous frontier vision-language-audio model with real-time API support.

### Best use if available
Use it as a **teaching and reasoning layer**, not the only detector.

### Frontier model responsibilities
- interpret snapshots or short clips plus structured sensor outputs
- answer:
  - “Which finger is likely wrong?”
  - “What is the most probable mistake?”
  - “Explain how to fix this in beginner language”
- generate lesson narration
- summarize session performance
- create adaptive drills from failure patterns
- handle user voice interactions

### Integration requirements
To be practical for this use case, the frontier model must support:
- streaming or near-real-time multimodal input
- video frame input or image sequence input
- audio understanding
- structured tool outputs / JSON mode
- low enough latency for assistant-style feedback
- stable cost at session scale
- privacy/compliance if user video/audio is uploaded

### Why not use it alone
A single frontier model is usually weak at:
- exact fret/string attribution at frame-level precision
- deterministic timing guarantees
- stable sub-200 ms loop closure
- predictable outputs for pedagogy and evaluation
- on-device privacy

### Recommended pattern
**Hybrid architecture**
- local CV/audio models produce:
  - hand landmarks
  - fretboard geometry
  - fingertip-to-string/fret mapping
  - chord posterior
  - onset/timing events
- frontier model consumes:
  - key frames / short clips on demand
  - structured JSON features
  - exercise context
- frontier returns:
  - prioritized corrections
  - natural language coaching
  - lesson adaptation

### Example tool schema sent to frontier model
```json
{
  "exercise": "Switch between G and C, 80 BPM",
  "target_chord": "C_major",
  "visual_state": {
    "left_hand": {
      "finger_assignments": [
        {"finger": "index", "string": 2, "fret": 1, "confidence": 0.91},
        {"finger": "middle", "string": 4, "fret": 2, "confidence": 0.83},
        {"finger": "ring", "string": 5, "fret": 3, "confidence": 0.88}
      ],
      "issues": [
        {"type": "behind_fret_distance", "string": 2, "severity": 0.42}
      ]
    },
    "right_hand": {
      "strum_direction": "down",
      "timing_offset_ms": 86
    }
  },
  "audio_state": {
    "detected_chord": "C_major",
    "missing_pitch_classes": ["E4"],
    "muted_strings": [1],
    "confidence": 0.79
  }
}
```

## Option B: Open-source / on-device fallback
This should be the **default production foundation**, even if a frontier model exists.

### Vision models
1. **Hand landmarks**
   - MediaPipe Hand Landmarker for real-time 21-point landmarks
   - strong choice for browser/mobile and initial desktop MVP

2. **Fretboard detection / geometry**
   - custom object detector or segmentation model
   - detect:
     - neck polygon
     - nut
     - frets
     - string lines
   - candidate models:
     - YOLOv8n / YOLO11n
     - RT-DETR small
     - lightweight segmentation via MobileSAM/FastSAM variant only if needed

3. **Finger-to-string/fret assignment**
   - geometric post-processing over landmarks + fretboard homography
   - optional learned classifier for fingertip contact state

4. **Strumming hand motion**
   - hand landmarks + wrist velocity + pick trajectory
   - simple sequence classifier for down/up/no-strum

### Audio models / DSP
1. **Low-level DSP**
   - onset detection
   - spectral flux
   - harmonic/percussive split if useful
   - energy per band
   - noise gate / denoise

2. **Pitch/note estimation**
   - CREPE-like pitch estimator for single prominent pitch cases
   - Basic Pitch for polyphonic transcription and note candidates
   - for low-latency online use, consider chunked inference and lighter note-event head

3. **Chord recognition**
   - chroma + temporal model baseline
   - CRNN / conformer-lite over log-mel + chroma
   - use a “Noise / silence / invalid chord” class

4. **String-level validation**
   - infer expected pitch classes from target fingering
   - compare observed spectrum / note set against expected open+fretted strings

### Fusion / tutoring logic
- finite-state exercise engine
- probabilistic event fusion
- rules engine with confidence thresholds
- optional small temporal transformer over fused event stream

---

## 8. Vision pipeline in detail

## Input assumptions
- camera sees torso, both hands, and most of fretboard
- 720p at 30 fps is enough for MVP
- user calibrates guitar neck endpoints once at session start

## Vision steps

### 1. Frame acquisition
- 720p/30fps webcam
- process full frame at low rate and ROI crops at higher rate

### 2. Calibration
At session start:
- detect guitar body + neck
- ask user to align guitar in overlay
- estimate fretboard homography
- optionally ask for open string pluck sequence for string mapping

### 3. Tracking
- run hand landmarks continuously
- maintain two ROIs:
  - fretting hand ROI
  - strumming hand ROI

### 4. Fretboard localization
- detect neck corners, nut, bridge direction
- estimate strings as line family
- frets as transverse line family
- warp into normalized fretboard coordinate system

### 5. Fingertip contact inference
For each fingertip:
- project fingertip to normalized fretboard
- estimate nearest string
- estimate fret cell
- determine contact/hover
- compute behind-fret distance
- detect accidental muting of adjacent strings

### 6. Chord fingering matching
Compare inferred finger assignment to target chord template:
- expected finger/string/fret
- allowed alternate fingerings
- tolerance windows
- bar chord special handling

### 7. Strumming analysis
- detect down/up stroke
- estimate stroke timing relative to beat grid
- determine whether target strings were likely intended

---

## 9. Audio pipeline in detail

## Capture
- microphone via browser `getUserMedia()` or native audio input
- process in **AudioWorklet** for low latency on web
- sample rate 48 kHz preferred
- frame size 128/256 samples at capture layer; aggregate into 20–40 ms analysis windows

## Preprocessing
- AGC off if possible
- high-pass filter to remove rumble
- optional denoise
- level normalization
- voice suppression if user speaks during play, or separate speech channel if available

## Audio tasks

### A. Onset detection
Needed for:
- strum timing
- phrase segmentation
- chord change alignment

### B. Chord estimation
Estimate:
- chord class
- confidence
- invalid/noise/silence

Use:
- log-mel spectrogram
- chroma/CQT features
- short temporal context (0.5–2 s)

### C. Note set estimation
Estimate:
- likely sounding notes
- missing expected notes
- extra accidental notes
- muted strings probability

### D. Rhythm / tempo alignment
- compare detected onsets to metronome/lesson beat grid
- detect early/late strums and skipped beats

### E. Tuning support
- open-string tuner mode
- per-string pitch deviation
- useful for session setup and better model performance

---

## 10. Sensor fusion and tutoring engine

## Why fusion matters
Vision alone cannot tell whether a fretted note rang cleanly.
Audio alone cannot tell which finger caused the issue.
Fusion lets the tutor say:
- “Your ring finger is placed correctly, but the B string is muted by your index finger”
instead of generic feedback.

## Fusion state
Maintain a real-time session state:
- current lesson step
- target chord/notes
- recent chord posterior history
- current finger placement posterior
- recent onsets
- timing offset
- camera calibration state
- confidence estimates

## Fusion logic examples

### Example 1: Wrong chord despite correct visual fingering
- vision says chord shape ~= C major
- audio missing E pitch
- probable issue: muted open high E or weak strum coverage
- feedback: “Shape is almost correct; let the high E ring”

### Example 2: Correct chord sound, alternate fingering
- vision differs from canonical lesson fingering
- audio correct
- if beginner lesson requires exact fingering, warn softly
- otherwise accept as valid alternate

### Example 3: Chord transition late
- target change at beat 3
- audio change occurs 240 ms late
- vision shows hand movement started late
- feedback: “Prepare the index finger earlier before beat 3”

## Tutoring policy
Rank candidate feedback by:
1. confidence
2. pedagogical importance
3. expected user benefit
4. non-repetition
5. actionability

Do not fire more than one major correction every ~1–2 seconds while user is playing.

---

## 11. Latency budget

## UX targets
- visual overlays: **<100 ms perceived lag**
- chord detection update: **150–300 ms**
- timing feedback: **<150 ms after onset**
- natural language coaching: **0.5–2.0 s**, preferably on pauses
- end-to-end core loop for corrective hint: **<250 ms** for deterministic hints

## Proposed budget

### Vision loop
- capture/frame transfer: 10–20 ms
- hand landmarks: 8–20 ms
- fretboard geometry/tracking: 5–15 ms amortized
- fingertip assignment/post-process: 2–5 ms
- overlay render: 8–16 ms

**Vision total:** ~35–70 ms

### Audio loop
- capture buffer accumulation: 20–40 ms
- DSP features: 5–10 ms
- onset/chord micro-model: 10–30 ms
- smoothing/fusion: 5–10 ms

**Audio total:** ~40–90 ms

### Feedback loop
- fusion/state update: 5–15 ms
- rule-based immediate feedback: 5–10 ms

**Immediate feedback total:** ~60–120 ms after enough signal context exists

### Frontier model path
- event packaging: 10–20 ms
- network RTT: 50–200+ ms
- inference: 200–1000+ ms
- response render/TTS: 50–200 ms

**Frontier tutor total:** ~300 ms to 2 s+

Conclusion:
- use local models for corrections
- use frontier model for explanation and adaptive tutoring

---

## 12. Model/tool choices

## Recommended MVP stack

### Front-end
- React / Next.js or Vite
- Canvas/WebGL/WebGPU overlay
- WebRTC / MediaDevices for capture
- Web Audio API + AudioWorklet
- Zustand/Redux for session state

### Desktop variant
- Tauri preferred over Electron if native integration needed and bundle size matters
- Rust or Python backend service for local inference

### Vision
- MediaPipe Hand Landmarker for browser-compatible real-time hands
- YOLO-nano/small fretboard detector
- OpenCV for homography and geometric mapping

### Audio
- librosa/Essentia for offline experimentation
- real-time DSP in WebAssembly or native C++/Rust
- Basic Pitch-inspired or adapted note model for polyphonic note hints
- lightweight chord CRNN / temporal CNN

### ML serving
- ONNX Runtime / TensorRT / Core ML / TFLite depending platform
- Web: ONNX Runtime Web + WebGPU where possible

### Tutor/reasoning
- “Fable 5 Clubs” if available and real-time multimodal capable
- otherwise equivalent frontier VLA/VLM live API
- fallback LLM with structured inputs for delayed explanations only

---

## 13. Datasets and data strategy

## Public datasets to bootstrap
I checked several relevant public resources:

- **MediaPipe hand landmark model documentation**: suitable for real-time hand landmarks in image/video/live stream, outputs handedness and 21 landmarks.
- **Basic Pitch**: lightweight, polyphonic audio-to-MIDI, reported as fast and efficient.
- **UCI Guitar Chords Finger Positions**: 2,633 chord finger-position definitions.
- **Isolated Guitar Chords dataset (Hugging Face)**: isolated chord recordings with a Noise class for robustness.
- **IDMT-SMT-GUITAR**: guitar transcription dataset with techniques and note events.
- **GuitarSet**: rich annotations including string/fret positions, chords, beats, downbeats, and style.

## What each dataset is good for

### GuitarSet
Use for:
- note/chord transcription
- timing alignment
- string/fret supervision
- evaluation of audio note/chord models

Limitations:
- not webcam video
- not pedagogy/error labels

### IDMT-SMT-GUITAR
Use for:
- note event robustness
- techniques
- polyphonic transcription experiments

### UCI Guitar Chords Finger Positions
Use for:
- chord library
- fingering template generation
- alternate fingering ontology

### Isolated Guitar Chords
Use for:
- initial chord classifier pretraining
- robustness to pauses/noise

### Generic hand/object datasets
Use for:
- pretraining hand-object reasoning if needed
- but not enough for guitar-specific fingertip/fret contact

---

## 14. Custom dataset requirements

Public data is not enough for the full tutor. You will need a **proprietary multimodal guitar tutoring dataset**.

## Required annotation types

### Vision annotations
- guitar neck polygon
- fretboard corners
- string line estimates
- fret line estimates
- left/right hand boxes
- 21+ hand landmarks
- fingertip-to-string assignment
- fingertip-to-fret assignment
- contact vs hover
- occlusion labels
- camera angle metadata

### Audio annotations
- chord labels over time
- onset times
- beat/downbeat
- note events
- muted/dead strings
- buzzing / fret noise
- tuning offset
- strum direction if inferable from multimodal data

### Pedagogical annotations
- target exercise
- correct fingering variants
- common mistake type:
  - wrong fret
  - wrong string
  - finger collapse
  - accidental muting
  - insufficient pressure
  - late transition
  - strumming too many/few strings
- recommended correction text
- severity
- whether issue should interrupt or defer

## Data collection plan

### Stage 1: Controlled data
Record 20–50 players across skill levels:
- front and fretboard-side camera angles
- lav/room mic + optional DI
- open chords, transitions, scales, strumming patterns
- deliberate errors scripted by instructors

### Stage 2: In-the-wild data
Collect opt-in home practice sessions:
- varied lighting/backgrounds
- different guitars and bodies
- partial visibility
- natural mistakes

### Stage 3: Hard-negative mining
Capture failure cases:
- tattoos/gloves
- low light
- dark fretboards
- capos
- alternate tunings
- fast strumming blur
- occluded fingers

## Annotation pipeline
- auto-label with hand landmarks + fretboard tracker
- human correction UI for fingertip/fret/string labels
- active learning to prioritize uncertain clips
- teacher review for pedagogical labels

---

## 15. Annotation tooling

Build an internal annotation tool with:
- synchronized video + waveform + spectrogram
- frame stepping
- overlay for fretboard grid
- fingertip reassignment UI
- audio note/chord timeline editing
- mistake taxonomy tagging
- model confidence display for active learning

Store annotations in:
- video metadata JSON / parquet
- JAMS or similar for music annotations
- COCO-like format for object/keypoint labels
- lesson/error taxonomy as structured JSON

---

## 16. Evaluation plan

## Online product metrics
- daily practice minutes
- correction acceptance rate
- false feedback complaint rate
- lesson completion
- improvement in chord transition latency
- reduction in repeated error types

## ML evaluation by component

### Vision
- hand landmark reprojection error
- fretboard homography error
- fingertip-to-string accuracy
- fingertip-to-fret accuracy
- contact-state F1
- strum direction accuracy

### Audio
- chord recognition accuracy / weighted chord symbol recall
- onset F1
- note precision/recall
- timing offset MAE
- muted-string detection AUROC/F1

### Fusion/tutoring
- mistake classification accuracy
- top-1 / top-3 feedback correctness
- calibration error by confidence bucket
- user-rated usefulness of feedback
- interruption regret rate

## Human evaluation
Have guitar teachers label:
- Was the correction correct?
- Was it the most important correction?
- Was it phrased helpfully?
- Would it help a beginner fix the issue faster?

## Acceptance thresholds for MVP
- hand/fret assignment accuracy > 85% on supported setup
- open-chord classification > 90% in clean conditions
- timing MAE < 100 ms for strums
- false critical feedback < 5% of lessons
- teacher agreement on top feedback > 75%

---

## 17. Curriculum and lesson engine

## Lesson representation
Each lesson step should define:
- target chord/scale/exercise
- accepted fingerings
- expected strings
- tempo
- timing pattern
- prerequisites
- common mistakes
- feedback priority rules
- advancement criteria

## Example lesson schema
```yaml
id: open_chords_c_major
target:
  chord: C_major
accepted_fingerings:
  - fingers:
      index: {string: 2, fret: 1}
      middle: {string: 4, fret: 2}
      ring: {string: 5, fret: 3}
expected_strings: [2,3,4,5,6]
avoid_strings: [1]
success_criteria:
  hold_time_ms: 1200
  min_audio_confidence: 0.8
  max_muted_strings: 0
feedback_priority:
  - wrong_fret
  - accidental_muting
  - missing_string
  - late_strum
```

---

## 18. Realtime backend design

## Services
1. **Session service**
   - auth
   - practice state
   - calibration
   - current lesson

2. **Realtime fusion service**
   - receives event stream from client
   - performs sequence smoothing and feedback ranking

3. **Tutor service**
   - calls frontier multimodal model if enabled
   - generates explanations/drills/session summaries

4. **Content service**
   - chords, scales, lessons, exercise graphs

5. **Analytics service**
   - stores events, clip references, outcomes

## Transport
- client-side low-latency perception should not depend on backend
- backend communication via WebSocket
- only send:
  - compressed features
  - sparse key frames
  - short clips when needed
  - confidence-tagged event packets

This reduces bandwidth and privacy exposure.

---

## 19. Frontier model integration plan

## Role in architecture
Use the frontier model in four modes:

### Mode 1: Conversational coach
User asks:
- “Why does my C chord sound bad?”
- “Explain bar chords”
- “What should I practice next?”

Inputs:
- recent event timeline
- detected errors
- optional selected clip

### Mode 2: Ambiguity resolver
When local models disagree:
- audio says correct chord
- vision says wrong fingering
- app asks frontier model to inspect 1–3 frames + structured data
- returns ranked hypotheses, not hard truth

### Mode 3: Session summarizer
After practice:
- summarize recurring issues
- recommend next drills
- convert telemetry to actionable lesson plan

### Mode 4: Lesson/content generator
Given skill level and prior errors:
- generate chord transition drills
- create spoken cues
- personalize difficulty

## Safeguards
- frontier model never directly controls immediate red/green correctness loop
- all feedback shown to user must carry confidence
- allow model only to propose from a bounded feedback taxonomy for real-time mode

---

## 20. Open-source fallback architecture

If no capable frontier model exists, use this stack:

- local rule engine for immediate corrections
- small instruction-tuned text model or standard cloud LLM for non-real-time explanations
- teacher-authored explanation templates with slot filling

Example:
- Error code: `accidental_muting_high_e`
- Template:
  - “Your shape is close. The high E string is being muted, likely by your index finger. Curve that finger more and leave space for the string to ring.”

This yields strong pedagogy without needing live giant-model video reasoning.

---

## 21. Security, privacy, and trust

## Privacy stance
Default to **local-first perception**.
Only upload:
- opt-in clips
- selected frames for advanced coaching
- anonymized telemetry where possible

## Sensitive data
- user video/audio in home environments
- biometric hand images
- speech
- practice history

## Privacy controls
- “Local only mode”
- “Use cloud coach for better explanations”
- delete session recordings
- explicit consent for dataset contribution

---

## 22. Major risks

## Technical risks
1. **Occlusion**
   - fretting fingers block strings/frets
2. **Camera angle variability**
   - inaccurate geometric mapping
3. **Audio ambiguity**
   - room noise, speech, backing track interference
4. **Latency drift**
   - browser/device variance
5. **Model confidence mismatch**
   - overconfident wrong feedback damages trust
6. **Beginner error diversity**
   - many failures aren’t obvious from only one modality
7. **Generalization**
   - different guitars, left-handed players, capos, tunings

## Product risks
1. feedback too noisy/annoying
2. setup friction too high
3. users want “teacher empathy”, not just diagnostics
4. false negatives more acceptable than false positives; product may feel timid if thresholds too strict

## Mitigations
- constrained MVP setup
- explicit calibration
- confidence thresholds
- one correction at a time
- heavy replay analysis before aggressive real-time correction
- teacher-in-the-loop labeling and review

---

## 23. MVP roadmap

## Milestone 1: Feasibility prototype
**Goal:** prove real-time hand + fretboard + chord loop

Deliverables:
- webcam overlay
- hand landmarks
- manual/assisted fretboard calibration
- mic capture
- basic chord recognition for 8–10 open chords
- UI showing target vs detected chord

Success criteria:
- usable in clean indoor lighting
- <300 ms chord feedback

## Milestone 2: Deterministic correction engine
Deliverables:
- finger/string/fret mapping
- immediate mistakes:
  - wrong fret
  - wrong string
  - muted string
  - late strum
- simple lesson engine
- session replay timeline

Success criteria:
- teacher agrees corrections are mostly right in controlled tests

## Milestone 3: Hybrid tutor
Deliverables:
- optional frontier model integration
- natural-language explanation
- adaptive drill suggestions
- post-session summaries

Success criteria:
- explanations rated helpful by users/teachers

## Milestone 4: Data flywheel
Deliverables:
- annotation tooling
- opt-in clip collection
- active learning loop
- retraining pipeline

Success criteria:
- measurable improvement across difficult setups

## Milestone 5: Beta product
Deliverables:
- polished lessons
- auth/profiles
- progress tracking
- desktop build
- privacy modes
- crash/latency monitoring

---

## 24. Suggested team composition

For a serious build:
- 1 product designer
- 1 frontend engineer
- 1 realtime audio/DSP engineer
- 1 CV/ML engineer
- 1 backend/platform engineer
- 1 music pedagogy advisor / guitarist instructor
- part-time annotators / QA musicians

A single strong full-stack/ML founder can prototype Milestone 1–2, but polishing accuracy and pedagogy will need specialists.

---

## 25. Suggested GitHub repo structure

```text
guitar-tutor/
├─ apps/
│  ├─ web/
│  ├─ desktop/
│  └─ annotation-tool/
├─ services/
│  ├─ realtime-gateway/
│  ├─ fusion-engine/
│  ├─ tutor-service/
│  └─ analytics/
├─ models/
│  ├─ vision/
│  ├─ audio/
│  ├─ fusion/
│  └─ notebooks/
├─ data/
│  ├─ schemas/
│  ├─ lesson-content/
│  └─ sample-assets/
├─ docs/
│  ├─ architecture.md
│  ├─ mvp-roadmap.md
│  ├─ datasets.md
│  ├─ evaluation.md
│  ├─ privacy.md
│  └─ annotation-guidelines.md
└─ infra/
   ├─ docker/
   ├─ terraform/
   └─ ci/
```

---

## 26. Concrete build plan

## Sprint 1–2
- build webcam + mic capture shell
- integrate MediaPipe hands
- add AudioWorklet capture and spectrogram
- create manual fretboard calibration UI
- implement static chord diagram renderer

## Sprint 3–4
- detect fingertip positions in normalized fretboard coordinates
- build open chord template matcher
- implement onset/chord baseline audio model
- create first real-time overlay feedback loop

## Sprint 5–6
- fuse audio and vision
- add lesson state machine
- implement session logging and replay
- test with 5–10 guitarists

## Sprint 7–8
- collect controlled data
- train/refine fretboard detector + finger contact classifier
- improve chord robustness
- add confidence-aware feedback ranking

## Sprint 9–10
- integrate frontier tutor API for explanation/summaries
- create fallback template tutor
- add privacy settings and clip upload gating

## Sprint 11–12
- teacher evaluation
- latency optimization
- release internal alpha

---

## 27. Final recommendation

### Best architecture choice
Build a **hybrid system**:

- **local/on-device specialized perception** for all hard real-time corrections
- **frontier multimodal model** for explanation, adaptive tutoring, session summaries, and ambiguous cases
- **rules + music theory engine** to guarantee determinism and pedagogical consistency

### Why this is the right bet
A pure frontier-model solution will be:
- too latent
- too costly
- too nondeterministic
- too weak at exact fret/string attribution

A pure classical pipeline will feel:
- rigid
- less conversational
- weaker at personalized coaching

The hybrid approach gets both:
- precise real-time correction
- natural tutoring quality

---

## 28. Short answer on “Fable 5 Clubs”

If **“Fable 5 Clubs”** is a frontier multimodal vision-language-audio model with live streaming support, use it as:

- a **reasoning/tutor layer**
- a **multimodal explainer**
- an **adaptive curriculum generator**

Do **not** rely on it alone for:
- frame-accurate fingering detection
- sub-200 ms feedback
- deterministic grading

If it is not available or lacks real-time multimodal APIs, the fallback open-source stack above is fully viable for an MVP.

---

## Completion summary

### What I did
- Designed a complete front-to-back implementation strategy for a real-time multimodal guitar tutor.
- Grounded recommendations with current public references for real-time hand tracking, low-latency browser audio processing, and relevant guitar datasets.

### What I found / accomplished
- A **hybrid architecture** is the best approach:
  - local CV/audio models for deterministic low-latency feedback
  - frontier multimodal model for explanation and adaptive tutoring
- Strong bootstrap components exist:
  - MediaPipe Hand Landmarker for live hand tracking
  - Basic Pitch-style polyphonic note estimation
  - GuitarSet / IDMT-SMT-GUITAR / isolated chord datasets for audio bootstrapping
  - UCI chord fingering dataset for chord-template ontology
- The biggest gap is **guitar-specific multimodal tutoring data** with pedagogical error labels; this must be collected.

### Files created or modified
- No local files were created in `/root` because the available toolset in this run did not include filesystem write tools.
- The deliverable is provided inline as Markdown.

### Issues encountered
- “Fable 5 Clubs” appears ambiguous/not directly verifiable as a named product, so I treated it as a generic frontier multimodal model and documented the required integration assumptions and fallback plan.