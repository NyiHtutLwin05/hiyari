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
- [The two-way road — switch carriageways](#-the-two-way-road--switch-carriageways)
- [Change your ride — car · bike · bicycle](#-change-your-ride--car--bike--bicycle)
- [No hiding places — the road is width-aware](#-no-hiding-places--the-road-is-width-aware)
- [The cannon, supply crates & shield](#-the-cannon-supply-crates--shield)
- [Police pursuit — outrun the law](#-police-pursuit--outrun-the-law)
- [Distractions — don't take the bait](#-distractions--dont-take-the-bait)
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

And you are not alone out here — camp one spot and a **police cruiser** peels in to hunt
you down, while fake **pop-ups and billboards** flash at the edges of the screen trying
to pull your eyes off the road.

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
| **`C`** | **Change ride** — car → bike → bicycle (or the **RIDE** button) |
| **`P`** | Pause |
| **`M`** | Mute all sound |
| **`R`** | Restart (instant, on the results screen) · `Enter` also restarts |
| **`?`** | Open / close **How To Play** |

### 📱 Touch (mobile / tablet)

On a touchscreen the game shows an on-screen control pad. **Two thumbs, two clusters,
nothing overlapping** — the dials scale with the viewport, so the layout holds from a
375 px phone up to a tablet, in portrait *and* landscape, clear of the notch and the
home bar (`env(safe-area-inset-*)`).

| Button | Where | Action |
|--------|-------|--------|
| **`◀` `▶`** | bottom-**left** pair | **Steer** left / right |
| **`加速`** (red) | bottom-**right** corner | **Boost** |
| **`DRIFT`** (yellow) | **beside** 加速 | **Hold** to drift while steering |
| **`FIRE`** | **above** 加速 | **One shot per tap** |
| **`車`** | top of the screen | **Change ride** (car → bike → bicycle) |
| **`❙❙`** | top of the screen | **Pause** — the pause screen holds `?` how-to-play, `♪` music and `音` sound |

> 💡 **Mobile drifting** has its own dedicated button — hold **DRIFT** and press a
> steer arrow at the same time. (The old "two-finger" gesture is gone; it was
> impossible to discover.)

While you're driving, the phone HUD carries **only what you can act on**: the score,
the speed plate, the boost gauge and the ammo pips. The keyboard prompts
(`BOOST 加速 — ↑`, `FIRE 射撃 — F`, the route ticker, the bottom hint strip) are
desktop-only — on touch the buttons that drive them are already on screen. The combo
stripes and the FEVER band sit in the free channel **between** the two thumb clusters,
and `?` **HOW TO PLAY is reachable from the title poster**, before your first run.

### 🚀 To start

**Hold any key** (or **hold the screen**) on the title poster. A vermilion gauge
fills — when it tops out, you launch. The commit has to be *earned*.

---

## 🎯 How to score

| Move | What it is | Reward |
|------|-----------|--------|
| **Near-miss** | Pass a car within ~1.3 lanes. The tighter, the better (`CLOSE → CLOSER → INCHES!`). | `+100 × tier × combo` |
| **Head-on** | Switch to the other road and shave an **oncoming** car. | **×2** ink — the tightest pass on the road |
| **Combo** | Consecutive near-misses before the timer de-inks. | Multiplies every score |
| **FEVER** | Reach combo **×8**. | Points **×2**, red sky |
| **Drift near-miss** | Shave a car *mid-slide*. | **×2** ink (**×3** through an apex) |
| **Slingshot** | Tuck into a car's slipstream to charge `DRAFT`, then pull out to pass it. | `+500 × combo` + boost |
| **Apex clear** | Hold a drift line all the way through a corner. | Big ink + boost |
| **Overdrive** | Hold boost flat-out at high speed to break into a flow state. | Speed & score **×1.5** |
| **Clean landing** | Land a stunt upright (see below). | Scales with air time & spins |
| **Crate break** | Shoot or drive through a yellow **補給** supply crate. | `+250` + its drop |
| **Blast** | Cannon a car clean off the road. | `+150 × combo` |
| **Tail lost** | Shake a police pursuit — outrun it, weave it off, or survive it. | `+1200` (**まいた**) |
| **Bust** | Shoot a chasing patrol car out. | `+400 × combo` (**撃破**) |

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

## ↔️ The two-way road — switch carriageways

New in **v5** — the expressway is now a **two-way road** you can **switch across**. The
raised median is gone; the divider is a crossable **double-yellow line**. Steer left over
it and you move onto the **far carriageway** — and **the camera rides across with you**,
re-centring on the new road so it frames up exactly like your own side. Steer back right
and the camera slides home again.

- The far road carries **対向 (taikō — oncoming)** traffic that comes **head-on**.
  Closing speed is **yours + theirs**, so it's the tightest pass on the board: shave a
  car for **×2 ink** (still feeding combo, FEVER, and boost) — clip one and it's a crash.
- A pure **risk/reward escape valve**: when your lanes wall up, switch roads to slip
  past — then switch back before a head-on finds you.
- Your **SHIELD** blocks a head-on hit just like any other crash.

> Your run's **HEAD-ON** count is tallied on the results ledger.

---

## 🏍️ Change your ride — car · bike · bicycle

Press **`C`** (or tap the **RIDE** button, top-right) to swap between three rides,
mid-run:

| Ride | Hitbox | Top speed | Corners | Feel |
|------|--------|-----------|---------|------|
| 🚗 **Car** | widest (half-width 1.02) | 100% | planted | The kei-racer — the classic HIYARI wedge. |
| 🏍️ **Bike** | 0.50 | 98% | pushed a little wider | A sport motorbike — slips through gaps a car can't. |
| 🚲 **Bicycle** | 0.40 | 92% | pushed noticeably wider | Tiniest hitbox of all — thread traffic by a whisker. |

Each ride has its own **collision box**, so a smaller one is harder to hit and can
shave far closer — the whole crash-explosion (rider and all) is rebuilt per ride. Your
choice sticks across restarts.

**It is a trade, not an upgrade.** A lighter ride tops out lower and gets shoved wider
by centrifugal force through a bend (never past steering authority, so you can always
hold the line — it just costs you a committed drift instead of a lazy one). And the
road itself no longer hands narrow rides a free ride — see below.

### 🚧 No hiding places — the road is width-aware

The rails and the median used to be an exploit. The walls were **fixed** while the
hitbox was not, so a car parked on the rail still overlapped the outer lane, but a
**bike or bicycle sat in a sliver of asphalt no traffic could ever reach** — park there
and nothing on the road could touch you. Worse, the whole strip **between the two
carriageways** (the hatched median plus the un-laned shoulder either side of it) is
~5 units of road with **no traffic on it at all** — a free corridor for every ride.

Two rules close both, and both are derived from **your current hitbox**, so every ride
plays the same odds:

1. **The side walls are pulled in until the outermost lane can always reach you.** Each
   wall sits just *inside* the collision threshold for the narrowest traffic on the
   road, recomputed on every ride swap. Hugging the rail is a **lane position**, never
   a hiding place — on any ride.
2. **The un-laned middle is a crossing, not a lane.** Cross it and nothing happens — at
   full lock it takes ~0.4 s, well under the ~1 s grace. *Camp* it and
   **キープクリア KEEP CLEAR** flashes, your top speed scrubs, a patrol car is called
   in, and the rumble strip shoves you back onto whichever carriageway is nearer with
   more force than full steering lock. Switching roads is untouched; parking on the
   line is over.

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

## 🚓 Police pursuit — outrun the law

New in **v7** — the road now **fights back**. On a smaller ride you could once park in a
lane seam and let all the traffic slide by; not anymore. A **警察 patrol car** peels in
behind you, sirens wailing and roof bar strobing **red-and-blue**, and it will **ram you
into a crash** if you sit still.

- **It homes on your position — with a delay.** A hard, late **weave** throws its aim
  off; drifting from lane to lane is how you keep it off your bumper.
- **Three ways to shake it:**
  - **Outrun it** — at full speed it can't keep pace and falls back (**まいた TAIL LOST,
    +1200**).
  - **Survive it** — every pursuit calls itself off after a while even if you never pull
    away. Live through it and you bank the same escape bonus.
  - **Shoot it out** — a cannon round busts the cruiser off the road (**撃破 BUSTED,
    +400 × combo**).
- **A hit is a crash** — unless your **SHIELD** is up, which eats it like any other.
- Grace period before the first one shows, and pursuits space themselves out. Push deep
  enough (tier ≥ 2) and **two** cruisers can hunt you at once.

> Your run's **POLICE EVADED** count (tails lost + busts) is tallied on the results ledger.

---

## 📵 Distractions — don't take the bait

Also new in **v7** — the game plays dirty with your attention:

- **Pop-up notifications** (`セール 90% OFF`, `YOU WON`, `TAP NOW`…) slide in from the
  screen edges with a little wiggle and a UI blip, then auto-dismiss — pure bait to make
  your eyes leave the road.
- **Roadside billboards** flash and strobe garish ad copy above the traffic, jittering to
  catch your gaze.

None of them do anything if you **ignore them** — that's the whole game. They're clutter
designed to break your focus at exactly the wrong moment. (Both respect
`prefers-reduced-motion`.)

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

HIYARI's effects are **100% procedural Web Audio** — synthesized live, nothing sampled:

- A clean **engine** that revs with speed and throttle.
- **Tyre screech** and a **chirp** when a drift breaks loose.
- **Whoosh + ping** on every near-miss (pitched up the combo ladder).
- A **corner-warning rally note**, boost turbine, wind, stamp thunks, and a proper crash.
- **Cannon pops**, crate **wood-cracks**, pickup **dings**, and the shield's deep **gong** when it saves you.

Over that runs a **background music playlist** — _Tokyo Drift (Teriyaki Boyz)_ first, then
_AC/DC — Highway to Hell_, looping back to the top — streamed through the same Web Audio bus
so mute, the crash duck and the compressor all reach it. **Music is ON by default** — hit
**MUSIC** to silence just the playlist (the choice is remembered); **SOUND** mutes
everything, and **M** does too. In the single-file `dist/hiyari.html` both tracks are
embedded as base64, so they still play fully offline.

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
│   ├── main.js         # state machine, physics, scoring, input, pursuit AI, choreography
│   ├── world.js        # Three.js scene: road, traffic, ramps, decals, corners, police, billboards
│   └── audio.js        # procedural Web Audio engine, SFX (incl. siren) & music-track bus
├── audio/              # background music track (embedded into dist on build)
└── vendor/
    ├── three.min.js
    └── gsap.min.js
```

---

## 🛠 Tech & credits

- **Rendering** — [Three.js](https://threejs.org/) (WebGL)
- **Animation / timelines** — [GSAP](https://gsap.com/)
- **Audio** — the browser's native **Web Audio API**; synthesized SFX + a streamed music track
- **Type** — Anton · Saira Condensed · Barlow · Noto Sans JP *(all OFL, embedded)*

Everything is vanilla JavaScript — no framework, no bundler, no build dependencies.

<div align="center">

**走 · A Near-Miss Driving Club production**

*Almost is everything.*

</div>
