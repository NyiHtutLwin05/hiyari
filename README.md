<div align="center">

# ヒヤリ · HIYARI

### *Almost is everything.*

**A near-miss expressway driving game rendered as a living Japanese street poster.**
Weave through traffic at 200 km/h — every close call is stamped onto the asphalt in vermilion ink.

`Three.js` · `GSAP` · `Web Audio` · **zero build step, zero dependencies to install**

</div>

---

## 目次 · Contents

- [What is HIYARI?](#-what-is-hiyari)
- [Controls](#-controls) — **desktop & mobile, fully explained**
- [How to score](#-how-to-score)
- [Cornering & drifting](#-cornering--drifting)
- [The cannon, supply crates & shield](#-the-cannon-supply-crates--shield)
- [Stunts (the ramp air-game)](#-stunts--the-air-game)
- [Sound](#-sound)
- [Running the game](#-running-the-game)
- [Building the single-file version](#-building-the-single-file-version)
- [Project structure](#-project-structure)
- [Tech & credits](#-tech--credits)

---

## 🏁 What is HIYARI?

**HIYARI** (ヒヤリ — the Japanese word for the cold-sweat gasp of a near-miss) is a
one-lane-at-a-time arcade racer. You don't win by finishing — there is no finish.
You win by *nearly* crashing, again and again, and living.

Shave a car by inches and you score. Chain those near-misses into a combo. Hold the
combo to **×8** and the world tips into **FEVER** — the sky bleeds vermilion, points
double, and the road starts printing your close calls into the tarmac behind you.

There are real corners to hold, slipstreams to steal, stunt ramps to fly, and a
top speed that never stops climbing. It is fast, it is loud, and it is beautiful.

The night itself is part of the picture: a **twinkling starfield** over the fog line,
**distant city lights** beyond the oncoming lanes, taillights and headlights
**smearing across the wet asphalt**, and a speed-deepening **vignette** that frames
the road the faster you go.

---

## 🎮 Controls

> Press **`?`** anytime — or tap **HOW TO PLAY** — to open the in-game controls card.

### ⌨️ Keyboard (desktop)

| Key | Action |
|-----|--------|
| **`←` `→`**  (or **`A` `D`**) | **Steer** left / right |
| **`↑`**  (or **`W`**) | **Boost** — spends the `BOOST` gauge you fill with near-misses |
| **`SHIFT`**  (or **`SPACE`**) | **Drift** — *hold it while steering* to slide |
| **`F`** | **Fire the cannon** — clears a car off the road, spends 1 ammo |
| **`P`** | Pause |
| **`M`** | Mute all sound |
| **`R`** | Restart (instant, on the results screen) · `Enter` also restarts |
| **`?`** | Open / close **How To Play** |

### 📱 Touch (mobile / tablet)

On a touchscreen the game shows an on-screen control pad:

| Button | Where | Action |
|--------|-------|--------|
| **`◀` `▶`** | bottom-**left** | **Steer** left / right |
| **`FIRE`** | above the steer buttons | **One shot per tap** |
| **`DRIFT`** (yellow) | bottom-**right, upper** | **Hold** to drift while steering |
| **`加速`** (red) | bottom-**right, lower** | **Boost** |
| **HOW TO PLAY** | top-right | Full controls card |

> 💡 **Mobile drifting** now has its own dedicated button — hold **DRIFT** and press a
> steer arrow at the same time. (The old "two-finger" gesture is gone; it was
> impossible to discover.)

### 🚀 To start

**Hold any key** (or **hold the screen**) on the title poster. A vermilion gauge
fills — when it tops out, you launch. The commit has to be *earned*.

---

## 🎯 How to score

| Move | What it is | Reward |
|------|-----------|--------|
| **Near-miss** | Pass a car within ~1.3 lanes. The tighter, the better (`CLOSE → CLOSER → INCHES!`). | `+100 × tier × combo` |
| **Combo** | Consecutive near-misses before the timer de-inks. | Multiplies every score |
| **FEVER** | Reach combo **×8**. | Points **×2**, red sky |
| **Drift near-miss** | Shave a car *mid-slide*. | **×2** ink (**×3** through an apex) |
| **Slingshot** | Tuck into a car's slipstream to charge `DRAFT`, then pull out to pass it. | `+500 × combo` + boost |
| **Apex clear** | Hold a drift line all the way through a corner. | Big ink + boost |
| **Overdrive** | Hold boost flat-out at high speed to break into a flow state. | Speed & score **×1.5** |
| **Clean landing** | Land a stunt upright (see below). | Scales with air time & spins |
| **Crate break** | Shoot or drive through a yellow **補給** supply crate. | `+250` + its drop |
| **Blast** | Cannon a car clean off the road. | `+150 × combo` |

> ⚡ **Speed feel (v4):** speed changes are now *smoothed asymmetrically* — surges
> (boost, slingshot, draft) arrive fast, but decay melts away slowly. The old
> "pass a car → suddenly slow down" jolt (a hitstop time-freeze fired on every
> near-miss) is gone.

Your best score is saved locally and **printed onto the road** at the spot where you
crashed — drive over your own record next run.

---

## 🌀 Cornering & drifting

Real corners now arrive on the expressway, and they **announce themselves**:

- A big **`◀ TURN LEFT` / `TURN RIGHT ▶`** call flashes on screen.
- A panned "rally note" chirps in the ear the corner is bending toward.
- The road visibly banks and the camera swings into the turn.

A gentle corner you can **steer** through. A **hard** corner (marked `!!`, burning red)
pushes harder — the trick is to **hold DRIFT through the apex**: the slide cancels the
push, hooks your nose into the bend, and pays **triple** near-miss ink for any car you
shave while sliding.

> 🔧 **Handling was rebalanced (v3.1).** The old build shoved the car into the outside
> wall harder than you could steer back — it felt like *"the car keeps drifting left and
> I can't control it."* Now the centrifugal push is tuned **below** steering authority,
> so ordinary steering can always hold a corner. Drifting is a **reward**, not a
> requirement — and it actually looks like a drift now: the tail steps out and the nose
> counter-steers into the slide.

---

## 🔫 The cannon, supply crates & shield

New in v4 — an arcade arsenal that never replaces the near-miss economy, only bails you out of it:

- **The cannon** (`F` / **FIRE** button) fires a glowing tracer down your lane. Hit a
  car and it spins off the road — **+150 × combo**, and suddenly that four-lane wall
  has a door in it. You start each run with **3 rounds** (max 9). Ammo is shown as
  yellow **pips** under the boost gauge.
- **Supply crates** (yellow, stamped **補給**) appear in random lanes. **Shoot them or
  drive straight through** — they shatter into debris and drop:
  - **弾薬 AMMO +3**, or
  - **バリア SHIELD** — a glowing ring arms around your car.
- **The shield is one-time crash protection.** Take a hit that would end the run and
  instead the shield eats it: the car you hit is hurled off the road, you keep rolling
  with a moment of invulnerability, and the ring is gone. One save per shield.

---

## ✈️ Stunts — the air game

Hit a **ramp** and you launch. While airborne, your normal controls become trick controls:

| Input (key / touch) | Trick |
|---------------------|-------|
| **`←` `→`** / **`◀` `▶`** | Barrel **roll** |
| **`↑`** / **`加速`** | Front **flip** |
| **`SHIFT`** / **`DRIFT`** | **Spin** |

Stack all three for a **神業 (godlike)** combo. **Land upright** for a clean bonus that
scales with air time and rotations — land sideways and you botch it (a wobble, never a
crash). Airborne, you fly clean over traffic.

---

## 🔊 Sound

HIYARI's audio is **100% procedural Web Audio** — no audio files, nothing copyrighted.

This build ships as **racing sound effects, not a soundtrack**:

- A clean **engine** that revs with speed and throttle.
- **Tyre screech** and a **chirp** when a drift breaks loose.
- **Whoosh + ping** on every near-miss (pitched up the combo ladder).
- A **corner-warning rally note**, boost turbine, wind, stamp thunks, and a proper crash.
- **Cannon pops**, crate **wood-cracks**, pickup **dings**, and the shield's deep **gong** when it saves you.

The noisy layers (wind / boost hiss and the beat) were pulled right down so the effects
read clean. **Music is a separate, off-by-default toggle** — hit **MUSIC** if you want a
Tokyo-street-racing beat under it. **SOUND** mutes everything; **M** does too.

---

## ▶️ Running the game

No install, no server needed.

```bash
# Option A — just open the dev version
open index.html            # macOS   (or double-click it)

# Option B — the self-contained single file (great for sharing / offline)
open dist/hiyari.html
```

> Any modern browser with WebGL works. If WebGL is unavailable the game shows a polite
> fallback instead of a blank page.

If your browser blocks audio until you interact, that's expected — sound unlocks on the
first key press / tap (the hold-to-start).

---

## 📦 Building the single-file version

`dist/hiyari.html` bundles **everything** — CSS, JS, the Three.js/GSAP vendors, and the
base64-embedded fonts — into one portable file you can email or drop on any static host.

After editing anything in `js/`, `css/`, or `index.html`, regenerate it:

```bash
node build.js
```

No npm, no toolchain — `build.js` is a dependency-free Node script that inlines the
sources in order.

---

## 🗂 Project structure

```
hiyari/
├── index.html          # dev entry — links the modules below
├── build.js            # inlines everything → dist/hiyari.html
├── dist/
│   └── hiyari.html     # self-contained single-file build
├── css/
│   ├── fonts.css       # base64-embedded fonts (Anton, Saira, Barlow, Noto Sans JP)
│   └── style.css       # HUD, poster UI, touch pad, help overlay
├── js/
│   ├── main.js         # state machine, physics, scoring, input, choreography
│   ├── world.js        # Three.js scene: road, traffic, ramps, decals, corners
│   └── audio.js        # procedural Web Audio engine & SFX
└── vendor/
    ├── three.min.js
    └── gsap.min.js
```

---

## 🛠 Tech & credits

- **Rendering** — [Three.js](https://threejs.org/) (WebGL)
- **Animation / timelines** — [GSAP](https://gsap.com/)
- **Audio** — the browser's native **Web Audio API**, fully synthesized
- **Type** — Anton · Saira Condensed · Barlow · Noto Sans JP *(all OFL, embedded)*

Everything is vanilla JavaScript — no framework, no bundler, no build dependencies.

<div align="center">

**走 · A Near-Miss Driving Club production**

*Almost is everything.*

</div>
