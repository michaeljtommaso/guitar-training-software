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
