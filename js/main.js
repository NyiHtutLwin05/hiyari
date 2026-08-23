/* ============================================================
   HIYARI — main. State machine, traffic fairness, near-miss
   economy, crash ballet, and every GSAP choreography.
   States: boot → intro → starting → run → crash → results
   ============================================================ */

(function () {
  'use strict';

  /* ---------- tuning ---------- */
  const V0 = 26;                 // cruise at green flag, units/s
  const VMAX = 88;
  const ACCEL = 0.55;            // base speed growth per second
  const KMH = 3.4;               // display conversion
  const KM = 0.000944;           // units → km (consistent with KMH)
  const STEER_VMAX = 16;         // lateral units/s at full lock
  const X_WALL_R = 8.35;         // hard right wall — the guardrail lip
  // the road is now TWO-WAY: the left wall reaches clear across the divider onto
  // the far carriageway. Cross CENTER_X and you've SWITCHED to the other road —
  // the camera rides across with you and re-centres on it.
  const X_WALL_L = -21.3;        // hard left wall — just shy of the far barrier
  const CENTER_X  = -10.5;       // the divider between the two carriageways
  const OTHER_CENTER = -17.15;   // centre of the far road (mean of ONCOMING_X)
  const ONCOMING_HW = 1.05;      // oncoming car half-width  (body 2.1 wide)
  const ONCOMING_HL = 2.3;       // oncoming car half-length (body 4.6 long)
  const HEADON_MULT = 2;         // head-on shave pays double — highest risk on the road
  const TIER_AT = [0, 38, 54, 70];      // baseSpeed thresholds
  const DECAY = 4.5;             // combo lifetime, seconds
  const COMBO_MAX = 8;
  const NEAR_TIERS = [           // widest first; evaluated tightest first
    { gap: 0.35, mult: 3, word: 'INCHES!', jp: 'ヒヤリハット', cls: 't3' },
    { gap: 0.80, mult: 2, word: 'CLOSER',  jp: 'ヒヤリ!',     cls: 't2' },
    { gap: 1.35, mult: 1, word: 'CLOSE',   jp: 'ヒヤリ',      cls: 't1' },
  ];
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- v3 tuning: cornering / speed skills / stunts ---------- */
  // cornering — a bend the car must actively hold; drift is the tool
  const CORNER_MIN  = 1.2e-4;   // |curveK| above this = a "hard" corner (grip/apex/thinning)
  // Centrifugal push is intentionally held BELOW plain steering authority
  // (STEER_VMAX = 16) so ordinary left/right steering can always hold a corner.
  // Earlier CF_MAX=22 > 16 shoved the car into the outside wall every corner —
  // that was the "car always goes left, I can't control it" bug. Now a corner
  // is a lean you steer through; drift (26.4 authority) just makes it effortless
  // and scores the apex.
  const CF_K        = RM ? 7 : 9;    // centrifugal coefficient (was 14 / 18)
  const CF_MAX      = RM ? 9 : 11;   // hard cap, < STEER_VMAX so steering wins (was 16 / 22)
  const CF_AIR      = 0.30;     // centrifugal scale while airborne (don't shove landings)
  const GRIP_CANCEL = 0.55;     // fraction of push cancelled when drifting into the apex
  const CAM_YAW_K   = 820;      // camera turn-in feel-term (was 650 — read the corner harder)
  const CAM_YAW_MAX = 0.16;     // rad (~9.2°) comfort cap (was 0.11 — a corner should feel like one)
  const CAM_ROLL_K  = 300;      // camera bank (was 380 — headroom for yaw)
  const PLYR_YAW_K  = 600;      // player nose points into the corner
  const APEX_K      = 0.6;      // apex-ink accrual rate
  const APEX_CLEAR  = 300;      // cornerApex needed for an APEX CLEAR payout
  const P_HARD      = 0.45;     // chance a corner is "hard"

  // speed skills — draft / slingshot / overdrive
  const DRAFT_LATERAL = 1.7;    // |c.lx - px| to sit "in the pocket"
  const DRAFT_ZMIN    = 5;      // forward gap min (units ahead)
  const DRAFT_ZMAX    = 22;     // forward gap max
  const DRAFT_FULL    = 1.0;    // seconds to full charge
  const DRAFT_DECAY   = 1.1;    // seconds to bleed out of the pocket (was 0.5 — gentler drop-off)
  const SLING_MIN     = 0.6;    // draft charge needed to arm a slingshot
  const SLING_TIME    = 1.5;    // slingshot decay window, seconds (was 0.9 — melt, don't sag)
  const SLING_MULT    = 1.18;   // peak slingshot speed mult, decays -> 1.0
  const OD_ARM        = 1.5;    // sustained boost@high-speed to arm overdrive
  const OD_ENTER_N    = 0.80;   // speedNorm to arm
  const OD_EXIT_N     = 0.65;   // speedNorm to drop
  const OD_SPEED      = 1.06;   // overdrive speed mult (extends the top end)
  const OD_SCORE      = 1.5;    // overdrive score mult
  const SCORE_MULT_CAP = 4;     // clamp on fever×boost×overdrive score mult

  // air tricks
  const ROLL_RATE = 6.0;        // rad/s barrel roll on z (←/→)
  const FLIP_RATE = 5.0;        // rad/s flip on x (↑)
  const SPIN_RATE = 5.5;        // rad/s spin on y (drift)
  const AIR_STEER = 0.40;       // lateral steer scale while airborne (aim the landing)
  const CLEAN_THRESH = 0.9;     // rad (~52°) residual-to-upright for a CLEAN land
  const BOTCH_TIME  = 0.7;      // wipeout control-loss window
  const BOTCH_STEER = 0.35;     // steer authority during wipeout (never zero)
  const BOTCH_GRACE = 0.9;      // landGrace on a botch — forgiving, never a crash

  // arsenal — front cannon, supply crates, one-time crash shield
  const AMMO_START = 3;
  const AMMO_MAX   = 9;
  const AMMO_PER_CRATE = 3;
  const TRACER_SPEED = 170;     // units/s, relative to the player
  const BLAST_PTS  = 150;       // × combo when a shot clears a car
  const CRATE_PTS  = 250;       // flat ink for cracking a crate open
  const SHIELD_CHANCE = 0.4;    // crate rolls a shield when you don't have one
  const SHIELD_GRACE  = 1.4;    // post-save invulnerability window, seconds

  /* ---------- police chasers: menace from your mirror, lunge to shunt ----------
     A patrol car creeps up and PACES you just off your bumper — strobe + siren,
     but it can NOT ram while merely shadowing you. Every couple seconds it locks
     its aim, flares its lights (a clear tell), then darts forward to shunt you —
     only that committed lunge can crash you, and a sideways juke during the tell
     makes it whiff. Punishes camping without ever being an instant, undodgeable
     wall. Closes when you're slow, drops back (and you shake it) when you're fast. */
  const CH_START_DELAY  = 14;   // seconds of grace before the first pursuit
  const CH_GAP_MIN      = 12;   // seconds between pursuits (min)
  const CH_GAP_RND      = 12;   // + up to this many random seconds
  const CH_SPAWN_Z      = 26;   // birth distance behind the player (in front of KILL_Z)
  const CH_HOME_RATE    = 3.4;  // lateral homing responsiveness while closing in
  const CH_BASE_CLOSE   = 6.5;  // closing speed toward you at zero speedNorm (units/s)
  const CH_SPEED_FACTOR = 11;   // how hard your speed pushes the patrol back
  const CH_RAM_Z        = 1.1;  // extra z-overlap slack for the lunge hit
  const CH_ESCAPE_Z     = 33;   // fall this far behind → you've shaken it
  const CH_DURATION     = 13;   // a pursuit calls itself off after this long (survive it)
  const CH_ESCAPE_PTS   = 1200; // ink for losing a tail
  const CH_BUST_PTS     = 400;  // ink for shooting a patrol car out
  const CH_SPAWN_OFF    = 3.4;  // lateral offset it spawns at — gives the approach a SIDE to read
  const CH_WARN_TIME    = 1.5;  // reaction window: it hangs back & barely homes so a dodge sticks
  const CH_WARN_HOME    = 0.25; // homing multiplier during the warn window (near-frozen → dodgeable)
  const CH_WARN_CLOSE   = 0.45; // closing multiplier during the warn window (hangs back, telegraphed)
  const CH_WARN_SEE_Z   = 9;    // above this z it's still behind the camera → keep the edge warning up
  // --- pace-and-lunge cadence: the ONLY thing that rams is a committed lunge ---
  const CH_HOLD_Z       = 4.4;  // pace point — shadows you just off your bumper here
  const CH_HOLD_HOME    = 2.2;  // gentle lateral homing while pacing (leaves juke room)
  const CH_LUNGE_GAP    = 2.0;  // seconds pacing before it winds up the next lunge
  const CH_LUNGE_GAP_RND= 1.4;  // + up to this random, so the timing never reads as metronome
  const CH_LUNGE_TELE   = 0.55; // tell window: aim LOCKS + lights flare → juke NOW to dodge
  const CH_LUNGE_SPEED  = 24;   // forward dart speed once it commits (fast → brief overlap)
  const CH_LUNGE_TIME   = 0.6;  // how long the committed dart lasts before it peels off

  /* ---------- v8: shoulder-hugging & median camping are no longer free ----------
     The old walls were FIXED (8.35 / −21.3) while the hitbox is not: a car
     (halfW 1.02) parked on the rail still overlapped the outer lane, but a bike
     (0.50) or a bicycle (0.40) sat in a sliver of asphalt no traffic could ever
     reach — park there and nothing on the road could touch you. Worse, the whole
     strip between the two carriageways (own edge line −9.1 → far edge line −12.4,
     plus the un-laned shoulders either side of it) is ~5 units of road with NO
     traffic on it at all: a free corridor for every ride.

     Two rules fix both, and they're width-aware so every ride plays by the same
     odds instead of the smallest one winning by default:
       1. the side walls are pulled in until the outermost lane can always reach
          you — hugging the rail is a lane position, never a hiding place;
       2. the un-laned middle (median + both inner shoulders) is a CROSSING, not
          a lane: you have ~1s to get across before the rumble strip spits you
          back onto a carriageway, bleeds speed, and calls the police in. */
  const TRAF_HW_MIN = 0.95;      // narrowest traffic half-width (the kei, w 1.9)
  const EDGE_BITE   = 0.15;      // how far INSIDE the collision threshold a wall sits
  const ZONE_GRACE  = 1.0;       // seconds you may spend crossing the un-laned middle
  const ZONE_RAMP   = 0.55;      // seconds for the eject shove to reach full force
  const ZONE_PUSH   = 30;        // lateral eject speed, units/s (> STEER_VMAX: it wins)
  const ZONE_SCRUB  = 0.45;      // top-speed multiplier floor while riding the hatching
  // per-ride handling — a smaller hitbox has to cost something, or the bicycle is
  // strictly the best ride. Index matches player.vehicle: 0 car, 1 bike, 2 bicycle.
  const RIDE_TOP = [1, 0.98, 0.92];   // top-speed multiplier
  const RIDE_CF  = [1, 1.18, 1.34];   // lighter rides get shoved wider through corners

  const fmt = (n) => Math.floor(n).toLocaleString('en-US');
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };

  /* ---------- WebGL gate ---------- */
  function glOK() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }
  if (!glOK()) {
    document.getElementById('nogl').hidden = false;
    document.getElementById('intro').style.display = 'none';
    return;
  }

  /* ---------- three ---------- */
  const canvas = document.getElementById('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 700);

  const world = HYW.createWorld(renderer, scene);
  const THEME = world.THEME;
  const LANE_X = world.LANE_X;
  const player = world.buildPlayer();
  const audio = new window.HiyariAudio();

  /* ---------- state ---------- */
  let state = 'boot';
  let paused = false;
  let helpOpen = false;
  const ts = { v: 1 };                    // gameplay time scale (GSAP-tweened)
  let baseSpeed = 0, speed = 0, speedNorm = 0;
  let steerL = false, steerR = false, vx = 0;
  let score = 0, dist = 0, combo = 1, comboTimer = 0;
  let fever = false, feverTime = 0;
  let nearMisses = 0, bestCombo = 1, topSpeed = 0, headOns = 0;
  let onOtherRoad = false;
  let tier = 0, nextMilestone = 10000;
  let best = parseInt(store.get('hiyari-best') || '0', 10) || 0;
  let bestPassedShown = false;
  let fovKick = 0;
  let lastStampMesh = null;
  let camX = 0;
  let camRoadShift = 0;                    // eased 0→1 as the camera rides to the far road
  let camShiftX = 0;                        // camRoadShift × OTHER_CENTER, used by chasePose
  let clockT = 0;

  /* v2 systems: boost / drift / air / curves */
  let boostMeter = 0, wantBoost = false, boosting = false, boostFov = 0;
  let driftHeld = false, drifting = false, wasDrifting = false;
  let driftPts = 0, driftTotal = 0, driftTime = 0, skidTimer = 0;
  let airborne = false, vyAir = 0, airTime = 0, airTotal = 0;
  let landGrace = 0;
  const curveK = { v: 0 };
  let curveActive = false, curveTimer = 14;
  const ramps = [];
  let rampTimer = 18;

  /* v3 systems: real cornering / speed skills / air tricks */
  let curveDir = 1, curveHard = false, cornerApex = 0, apexDrift = false;
  let camYaw = 0;
  let draftCharge = 0, draftedThisFrame = false, slingTimer = 0;
  let overdrive = false, overdriveArm = 0, overdriveTime = 0, wasBoosting = false;
  let rollAngle = 0, flipAngle = 0, spinAngle = 0, lastTrickSpin = 0, wipeoutTimer = 0;
  let slingshots = 0, apexClears = 0, bestTrick = 10;   // bestTrick = ×mult*10 (10 => ×1.0)

  /* v4 systems: cannon / supply crates / crash shield */
  let ammo = AMMO_START, shieldOn = false;
  let cratesBroken = 0, carsBlasted = 0;
  const shots = [];             // pooled tracer bolts
  const crates = [];            // pooled supply drops
  const shards = [];            // crate-shatter debris in flight
  let crateTimer = 9;

  /* v7 systems: police chasers */
  const chasers = [];           // patrol cars built lazily below
  let chaserTimer = CH_START_DELAY;
  let sirenTimer = 0;
  let chasersBusted = 0, tailsLost = 0;
  let pursuitShown = false;
  let cwSide = 0;   // side the police edge-warning currently points to (-1 left, +1 right, 0 hidden)

  /* v8 systems: ride-aware road limits + the un-laned "keep clear" middle */
  let xWallR = X_WALL_R, xWallL = X_WALL_L;   // outer walls (ride-width aware)
  let zoneR = 0, zoneL = 0;                   // inner edges of the un-laned middle
  let zoneTime = 0, zoneOut = 0;              // dwell timer, 0→1 eject/scrub ramp
  let keepClearShown = false;

  /* Recomputed on every ride swap. `reach` is how far past a lane centre the
     collision test still bites (the same 0.88 / 0.9 forgiveness factors the
     traffic and oncoming checks use), so a wall placed one EDGE_BITE inside it
     guarantees the outer lane can always reach a parked player — whatever the
     ride. Never pushed OUTSIDE the physical rails. */
  function refreshRideLimits() {
    const reachOwn = (TRAF_HW_MIN + player.halfW) * 0.88 - EDGE_BITE;
    const reachOnc = (ONCOMING_HW + player.halfW) * 0.90 - EDGE_BITE;
    xWallR = Math.min(X_WALL_R, LANE_X[LANE_X.length - 1] + reachOwn);
    xWallL = Math.max(X_WALL_L, world.ONCOMING_X[1] - reachOnc);
    // the un-laned middle: past the reach of your own left lane, and not yet in
    // reach of the nearest oncoming lane. Crossable, never campable.
    zoneR = LANE_X[0] - reachOwn;
    zoneL = world.ONCOMING_X[0] + reachOnc;
  }

  refreshRideLimits();
  player.group.position.set(LANE_X[2], 0, 0);

  /* ---------- DOM refs ---------- */
  const $ = (s) => document.querySelector(s);
  const el = {
    hud: $('#hud'), scoreBlock: $('#score-block'), scoreDigits: $('#score-digits'),
    scoreRule: $('#score-rule'), speedNum: $('#speed-num'), speedPlate: $('#speed-plate'),
    routeName: $('#route-name'), comboStack: $('#combo-stack'), feverBand: $('#fever-band'),
    stamps: $('#stamps'), hint: $('#hint'), inkFlash: $('#ink-flash'), wipe: $('#wipe'),
    intro: $('#intro'), introTop: $('#intro-top'), introBottom: $('#intro-bottom'),
    introField: $('#intro-field'), title: $('#title'), tline1: $('#tline1'), tline2: $('#tline2'),
    spine: $('#spine'), roundel: $('#roundel'), colophon: $('#colophon'),
    bestRun: $('#best-run'), inkFill: $('#ink-fill'), startWord: $('#start-word'),
    crashStamp: $('#crash-stamp'), results: $('#results'),
    rDist: $('#r-dist'), rMiss: $('#r-miss'), rCombo: $('#r-combo'), rSpeed: $('#r-speed'),
    rFever: $('#r-fever'), rScore: $('#r-score'), newRecord: $('#new-record'),
    restartBtn: $('#restart-btn'), pause: $('#pause'), muteBtn: $('#mute-btn'),
    musicBtn: $('#music-btn'), boostFill: $('#boost-fill'), boostBtn: $('#boost-btn'),
    driftLive: $('#drift-live'), driftLivePts: $('#drift-live-pts'),
    rDrift: $('#r-drift'), rAir: $('#r-air'),
    // v3 HUD
    speedLines: $('#speed-lines'), draftCharge: $('#draft-charge'),
    overdriveTag: $('#overdrive-tag'), apexLive: $('#apex-live'), apexLivePts: $('#apex-live-pts'),
    airTrick: $('#air-trick'),
    turnSignal: $('#turn-signal'), turnArrow: $('#turn-arrow'), turnText: $('#turn-text'),
    // v4 HUD
    ammoPips: $('#ammo-pips'), shieldTag: $('#shield-tag'), vignette: $('#vignette'),
    rCrate: $('#r-crate'), rBlast: $('#r-blast'), rHeadon: $('#r-headon'),
    rSling: $('#r-sling'), rApex: $('#r-apex'), rTrick: $('#r-trick'), rOd: $('#r-od'),
    // v7 HUD: police pursuit
    pursuit: $('#pursuit'), chaseWarn: $('#chase-warn'), rChase: $('#r-chase'), distractCards: $('#distract-cards'),
    // v8 HUD: the un-laned middle you may cross but never camp
    keepClear: $('#keep-clear'),
  };

  /* ---------- score odometer ---------- */
  const DIGITS = 7;
  const strips = [];
  (function buildOdometer() {
    for (let i = 0; i < DIGITS; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot dim';
      const strip = document.createElement('div');
      strip.className = 'strip';
      for (let d = 0; d <= 9; d++) {
        const s = document.createElement('span');
        s.textContent = d;
        strip.appendChild(s);
      }
      slot.appendChild(strip);
      el.scoreDigits.appendChild(slot);
      strips.push({ slot, strip, cur: 0 });
    }
  })();
  let scoreShown = -1;
  function syncScore() {
    const v = Math.min(Math.floor(score), 9999999);
    if (v === scoreShown) return;
    scoreShown = v;
    const str = String(v).padStart(DIGITS, '0');
    const firstSig = str.length - String(v).length;
    for (let i = 0; i < DIGITS; i++) {
      const d = +str[i];
      strips[i].slot.classList.toggle('dim', i < (v === 0 ? DIGITS - 1 : firstSig));
      if (strips[i].cur !== d) {
        strips[i].cur = d;
        gsap.to(strips[i].strip, { yPercent: -d * 10, duration: 0.18, ease: 'power2.out', overwrite: true });
      }
    }
    audio.tick();
  }

  /* ---------- ammo pips ---------- */
  const ammoPipEls = [];
  (function buildAmmoPips() {
    for (let i = 0; i < AMMO_MAX; i++) {
      const p = document.createElement('span');
      p.className = 'pip';
      el.ammoPips.appendChild(p);
      ammoPipEls.push(p);
    }
  })();
  function syncAmmo() {
    for (let i = 0; i < AMMO_MAX; i++) ammoPipEls[i].classList.toggle('on', i < ammo);
    el.shieldTag.style.opacity = shieldOn ? '1' : '0';
  }
  syncAmmo();

  /* ---------- combo stripes ---------- */
  function syncStripes() {
    const want = Math.max(0, combo - 1);
    while (el.comboStack.children.length > want) el.comboStack.removeChild(el.comboStack.lastChild);
    while (el.comboStack.children.length < want) {
      const s = document.createElement('div');
      s.className = 'stripe';
      s.style.width = (100 - el.comboStack.children.length * 8) + '%';
      el.comboStack.appendChild(s);
      gsap.fromTo(s, { scaleX: 0 }, { scaleX: 1, duration: 0.28, ease: 'power3.out' });
    }
  }

  /* ---------- near-miss stamps (pooled DOM) ---------- */
  const stampPool = [];
  for (let i = 0; i < 5; i++) {
    const n = document.createElement('div');
    n.className = 'stamp';
    n.innerHTML = '<span class="s-jp" lang="ja"></span><span class="s-word"></span><span class="s-pts"></span>';
    el.stamps.appendChild(n);
    stampPool.push(n);
  }
  let stampCursor = 0;
  function showStamp(side, tierDef, pts) {
    const n = stampPool[stampCursor];
    stampCursor = (stampCursor + 1) % stampPool.length;
    n.className = 'stamp ' + (side < 0 ? 'left' : 'right') + ' ' + tierDef.cls;
    n.children[0].textContent = tierDef.jp;
    n.children[1].textContent = tierDef.word;
    n.children[2].textContent = pts ? '+' + fmt(pts) : '';
    gsap.killTweensOf(n);
    gsap.timeline()
      .fromTo(n, { opacity: 1, scale: RM ? 1 : 1.45, rotation: -4, x: 0, skewX: 0 },
        { scale: 1, duration: 0.24, ease: 'back.out(4)' })
      .to(n, { x: side < 0 ? -60 : 60, skewX: 8, opacity: 0, duration: 0.26, ease: 'power2.in' }, 0.78);
  }

  function inkSlap(op) {
    if (RM) return;
    gsap.fromTo(el.inkFlash, { opacity: op }, { opacity: 0, duration: 0.16, ease: 'power1.out', overwrite: true });
  }

  /* ---------- distraction cards: flashing notification bait ----------
     Fake ads / notifications slide in from a screen edge to pull your eyes off
     the road. Pure decoration — they never touch collision — but a glance at one
     is a glance away from the traffic. That's the whole point. */
  const DISTRACT_MSGS = [
    { emoji: '📱', jp: '新着メッセージ', en: '3 NEW MESSAGES' },
    { emoji: '🎁', jp: 'おめでとう！', en: 'YOU WON A PRIZE' },
    { emoji: '🔔', jp: '通知', en: 'TAP TO CLAIM' },
    { emoji: '❤️', jp: 'いいね', en: 'SOMEONE LIKED YOU' },
    { emoji: '🍜', jp: 'ラーメン 500m', en: 'NEXT EXIT — EAT NOW' },
    { emoji: '⚡', jp: '限定セール', en: '90% OFF · ENDS SOON' },
    { emoji: '📸', jp: 'タグ付けされました', en: 'YOU WERE TAGGED' },
    { emoji: '🎉', jp: '当選しました', en: 'FREE GIFT!! LOOK' },
  ];
  const distractPool = [];
  if (el.distractCards) {
    for (let i = 0; i < 4; i++) {
      const card = document.createElement('div');
      card.className = 'distract-card';
      card.innerHTML = '<span class="dc-emoji"></span><span class="dc-text"><b></b><i lang="ja"></i></span>';
      el.distractCards.appendChild(card);
      distractPool.push({ el: card, live: false });
    }
  }
  let distractCursor = 0, distractTimer = 8;
  function spawnDistractCard() {
    if (!distractPool.length) return;
    const d = distractPool[distractCursor];
    distractCursor = (distractCursor + 1) % distractPool.length;
    if (d.live) return;
    const msg = DISTRACT_MSGS[Math.floor(Math.random() * DISTRACT_MSGS.length)];
    d.el.children[0].textContent = msg.emoji;
    d.el.children[1].children[0].textContent = msg.en;
    d.el.children[1].children[1].textContent = msg.jp;
    const right = Math.random() < 0.5;
    d.el.classList.toggle('right', right);
    d.el.classList.toggle('left', !right);
    d.el.style.top = (20 + Math.random() * 48) + 'vh';
    d.live = true;
    const from = right ? 130 : -130;
    gsap.killTweensOf(d.el);
    const tl = gsap.timeline({ onComplete: () => { d.live = false; d.el.style.opacity = 0; } });
    tl.set(d.el, { opacity: 1, xPercent: from, rotation: right ? 4 : -4 });
    tl.to(d.el, { xPercent: 0, rotation: 0, duration: 0.42, ease: 'back.out(1.9)' });
    if (!RM) tl.to(d.el, { rotation: right ? 2.5 : -2.5, duration: 0.11, yoyo: true, repeat: 5, ease: 'sine.inOut' }, '>');
    tl.to(d.el, { xPercent: from, opacity: 0, duration: 0.34, ease: 'power2.in' }, '+=' + (2 + Math.random() * 1.6));
    audio.uiBlip();
  }
  function clearDistractCards() {
    for (const d of distractPool) { gsap.killTweensOf(d.el); d.live = false; d.el.style.opacity = 0; }
  }

  /* ---------- sky / tier plates ---------- */
  function applySky(hex, dur) {
    const c = new THREE.Color(hex);
    gsap.to(scene.fog.color, { r: c.r, g: c.g, b: c.b, duration: dur, ease: 'power2.inOut', overwrite: 'auto' });
    gsap.to(world.bandMat.color, { r: c.r, g: c.g, b: c.b, duration: dur, ease: 'power2.inOut', overwrite: 'auto' });
  }

  const gantryQueue = [];
  function farthestGantry() {
    return world.gantries.reduce((a, b) => (a.position.z < b.position.z ? a : b));
  }
  world.onGantryRecycle = (g) => {
    if (gantryQueue.length) {
      const q = gantryQueue.shift();
      world.paintGantry(g, q.main, q.sub);
    } else {
      const opts = [
        ['EXIT: NEVER', null],
        [fmt(score) + ' PTS AHEAD', 'KEEP MISSING'],
        ['REST AREA: NONE', null],
        [(dist * KM).toFixed(1) + ' KM — NOWHERE', null],
      ];
      const pick = opts[Math.floor(Math.random() * opts.length)];
      world.paintGantry(g, pick[0], pick[1]);
    }
  };
  world.onKmRecycle = (m) => {
    world.paintKmPost(m, ((dist + Math.abs(m.position.z)) * KM).toFixed(1));
  };

  function setTier(n) {
    tier = n;
    applySky(THEME.tiers[n], 1.2);
    audio.chime();
    // signboard flip
    gsap.timeline()
      .to(el.speedPlate, { rotationX: -88, duration: 0.22, ease: 'power2.in', onComplete: () => {
        el.routeName.textContent = THEME.tierNames[n];
      } })
      .to(el.speedPlate, { rotationX: 0, duration: 0.4, ease: 'back.out(1.7)' });
    gsap.fromTo(el.routeName, { yPercent: 110 }, { yPercent: 0, duration: 0.45, ease: 'power3.out', delay: 0.25 });
    // the new route arrives as a real gantry you drive under
    world.paintGantry(farthestGantry(), THEME.tierNames[n], 'SPEED UNCAPPED — STAY CLOSE');
  }

  /* ---------- fever ---------- */
  function enterFever() {
    if (fever) return;
    fever = true;
    applySky(THEME.shu, 0.6);
    world.paintMoon(true);
    player.paintLivery(combo, true);
    audio.feverOn();
    audio.musicSet('fever');
    gsap.to(el.feverBand, { scaleX: 1, duration: 0.35, ease: 'back.out(2)' });
    inkSlap(0.12);
    audio.thunk(true);
  }
  function exitFever() {
    if (!fever) return;
    fever = false;
    applySky(THEME.tiers[tier], 0.8);
    world.paintMoon(false);
    player.paintLivery(combo, false);
    audio.feverOff();
    if (state === 'run') audio.musicSet('run');
    gsap.to(el.feverBand, { scaleX: 0, duration: 0.3, ease: 'power2.in' });
  }

  function breakCombo() {
    if (combo === 1) return;
    combo = 1;
    exitFever();
    player.paintLivery(1, false);
    const kids = Array.from(el.comboStack.children);
    gsap.to(kids, {
      scaleX: 0, duration: 0.2, stagger: 0.03, ease: 'power2.in',
      // guard: a near-miss during the shatter rebuilds the stack — don't wipe it
      onComplete: () => { if (combo === 1) el.comboStack.innerHTML = ''; },
    });
  }

  /* ---------- traffic ---------- */
  const active = [];            // live traffic cars
  const pools = {};             // per-type recycled meshes
  let spawnTimer = 1.2;
  let laneChangerBusy = false;

  function acquireCar(typeIdx) {
    const pool = pools[typeIdx] || (pools[typeIdx] = []);
    let car = pool.pop();
    if (!car) car = world.spawnTrafficMesh(typeIdx);
    car.group.visible = true;
    return car;
  }
  function releaseCar(car) {
    car.group.visible = false;
    gsap.killTweensOf(car);                 // lane-change lx tween
    // if that kill caught a live lane change, its onComplete never fires —
    // free the global lock or no car would ever signal again this run
    if (car.changing) { car.changing = false; laneChangerBusy = false; }
    gsap.killTweensOf(car.group.position);
    gsap.killTweensOf(car.group.rotation);
    car.group.rotation.set(0, 0, 0);
    car.isDraft = false; car.drafted = false; car.slingDone = false; car.dead = false;
    (pools[car.typeIdx] || (pools[car.typeIdx] = [])).push(car);
  }

  function carsInWindow(zc, half, exceptCar) {
    const out = [];
    for (const c of active) {
      if (c !== exceptCar && Math.abs(c.z - zc) < half) out.push(c);
    }
    return out;
  }

  /* fairness: same-lane gap, ≥1 free lane in the spawn window, AND ≥1 free
     lane when this car actually arrives at the player (speed differentials
     otherwise let staggered spawns converge into a four-lane wall). */
  function trySpawn(zBase) {
    const SP = zBase != null ? zBase : world.SPAWN_Z;
    const windowCars = carsInWindow(SP, 44);

    // pick the archetype first so its closure rate can be projected
    const r = Math.random();
    let typeIdx = r < 0.34 ? 0 : r < 0.56 ? 1 : r < 0.70 ? 2 : r < 0.88 ? 3 : 4;
    if (typeIdx >= 3 && windowCars.some((c) => c.typeIdx >= 3)) typeIdx = 0;
    const type = world.TRAFFIC_TYPES[typeIdx];
    const frac = type.speed[0] + Math.random() * (type.speed[1] - type.speed[0]);
    const carSpeed = Math.max(10, Math.min(baseSpeed * frac, baseSpeed - 12));
    const closure = Math.max(6, speed - carSpeed);
    const tArrive = -SP / closure;                 // seconds until it reaches z≈0

    const lanes = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    for (const lane of lanes) {
      let blocked = false;
      for (const c of active) {
        if (c.lane === lane && Math.abs(c.z - SP) < 55 + speed * 0.3) { blocked = true; break; }
      }
      if (blocked) continue;

      const occupied = new Set(windowCars.map((c) => c.lane));
      occupied.add(lane);
      if (occupied.size >= 4) continue;            // never wall the spawn window

      // project every live car to this car's arrival time; the player plane
      // must still have an escape lane at that moment
      const atArrival = new Set([lane]);
      for (const c of active) {
        const zProj = c.z + (speed - c.speed) * tArrive;
        if (Math.abs(zProj) < 38) atArrival.add(c.lane);
      }
      if (atArrival.size >= 4) continue;           // never wall the player either

      const car = acquireCar(typeIdx);
      car.typeIdx = typeIdx;
      car.lane = lane;
      car.z = SP - Math.random() * 24;
      car.speed = carSpeed;
      car.lx = LANE_X[lane];                // logical x — bend is render-only
      car.passed = false;
      car.swelled = false;
      car.minGap = Infinity;
      car.changing = false;
      car.baseTail = 1.4;
      car.isDraft = false; car.drafted = false; car.slingDone = false; car.dead = false;
      car.group.rotation.set(0, 0, 0);
      car.group.position.set(car.lx, 0, car.z);
      active.push(car);
      return;
    }
  }

  /* the road is already alive when the run begins */
  function seedTraffic() {
    for (const z of [-115, -165, -215, -265, -315, -365]) {
      trySpawn(z);
      if (Math.random() < 0.45) trySpawn(z - 20);
    }
  }

  function tryLaneChange(car, dt) {
    if (laneChangerBusy || car.changing || car.z > -120 || car.z < -300) return;
    if (Math.random() > 0.015 * dt * 60) return;
    const dir = Math.random() < 0.5 ? -1 : 1;
    const target = car.lane + dir;
    if (target < 0 || target > 3) return;
    for (const c of active) {
      if (c !== car && c.lane === target && Math.abs(c.z - car.z) < 95) return;
    }
    const occupied = new Set(carsInWindow(car.z, 44, car).map((c) => c.lane));
    occupied.add(target);
    if (occupied.size >= 4) return;

    laneChangerBusy = true;
    car.changing = true;
    car.lane = target;
    // blinker, then the eased drift (logical x — the bend rides on top)
    const blink = gsap.to(car.tail.glow.material, { opacity: 0.15, duration: 0.12, repeat: 5, yoyo: true });
    gsap.to(car, {
      lx: LANE_X[target], duration: 1.15, delay: 0.7, ease: 'power1.inOut',
      onComplete: () => { car.changing = false; laneChangerBusy = false; blink.kill(); car.tail.glow.material.opacity = 0.55; },
    });
  }

  /* ---------- oncoming traffic (now a real head-on carriageway) ---------- */
  const oncoming = [];
  for (let i = 0; i < 8; i++) {
    const g = world.buildOncoming();
    const o = { g, lx: world.ONCOMING_X[i % 2], speed: 30 + Math.random() * 26,
      played: false, passed: false, swelled: false, minGap: Infinity, prevZ: 0 };
    oncoming.push(o);
    g.position.set(o.lx, 0, -80 - i * 70 - Math.random() * 40);
    g.visible = true;
  }
  function resetOncoming(o) {
    gsap.killTweensOf(o);                 // lx deflection tween
    gsap.killTweensOf(o.g.position);      // crash shove
    gsap.killTweensOf(o.g.rotation);      // crash / shield spin
    o.g.position.z = -430 - Math.random() * 160;
    o.lx = world.ONCOMING_X[Math.random() < 0.5 ? 0 : 1];
    o.g.position.x = o.lx;
    o.g.rotation.set(0, 0, 0);
    o.speed = 30 + Math.random() * 26;
    o.played = false;
    o.passed = false;
    o.swelled = false;
    o.minGap = Infinity;
    o.prevZ = o.g.position.z;
  }

  /* ---------- near-miss economy ---------- */
  function award(car) {
    const g = car.minGap;
    let tierDef = null;
    for (const t of NEAR_TIERS) { if (g <= t.gap) { tierDef = t; break; } }
    if (!tierDef) return;

    combo = Math.min(COMBO_MAX, combo + 1);
    comboTimer = DECAY;
    nearMisses++;
    bestCombo = Math.max(bestCombo, combo);
    // shaving a car mid-slide is the crown move: double ink — triple through an apex
    const driftMult = drifting ? (apexDrift ? 3 : 2) : 1;
    const pts = 100 * tierDef.mult * combo * (fever ? 2 : 1) * driftMult;
    score += pts;
    boostMeter = Math.min(100, boostMeter + 8 + tierDef.mult * 5);

    const side = Math.sign(car.lx - player.group.position.x) || 1;
    const def = drifting
      ? { jp: tierDef.jp, word: 'DRIFT ' + tierDef.word, cls: tierDef.cls }
      : tierDef;
    showStamp(side, def, pts);

    // slingshot: pulling out of a fully-charged draft to shave the car you tucked behind
    if (car.drafted && !car.slingDone) {
      car.slingDone = true;
      slingTimer = SLING_TIME;
      slingshots++;
      boostMeter = Math.min(100, boostMeter + 25);
      const slPts = 500 * combo;
      score += slPts;
      showStamp(side, { jp: 'スリングショット', word: 'SLINGSHOT', cls: 't3' }, slPts);
      inkSlap(0.14);
      if (!RM) fovKick = Math.min(8, fovKick + 4);
    }
    audio.whoosh(side * 0.8, combo);
    audio.thunk(tierDef.mult === 3);
    inkSlap(tierDef.mult === 3 ? 0.14 : 0.08);

    if (!RM) {
      // no time-dip here anymore — the old hitstop read as the game "suddenly
      // slowing down" on every pass. The FOV kick alone sells the rush forward.
      fovKick = Math.min(6, fovKick + (tierDef.mult === 3 ? 3.5 : 2));
    }

    // print the near-miss onto the asphalt — the wake of close calls
    const midX = (car.lx + player.group.position.x) / 2;
    lastStampMesh = world.stampRoad(tierDef.jp, midX, 2.5, {
      jp: true,
      width: 3.2 + tierDef.mult * 1.6,
      color: fever ? THEME.yellow : THEME.paper,
      tilt: side * 3,
    });

    gsap.fromTo(el.scoreBlock, { scale: 1 }, { scale: 1.05, duration: 0.12, yoyo: true, repeat: 1, ease: 'power2.out' });
    gsap.fromTo(el.scoreRule, { backgroundColor: '#E8380D' }, { backgroundColor: '#F2EFE5', duration: 0.3 });

    if (combo === COMBO_MAX) enterFever();
    else player.paintLivery(combo, fever);
    syncStripes();

    // flash the passed car's shell white for two frames (skip transparent
    // ground-effect planes — flashing the tail streak paints the road white)
    car.group.traverse((o) => {
      if (o.isMesh && o.material && o.material.color && !o.material.transparent && !o.userData.flashing) {
        o.userData.flashing = true;
        const old = o.material;
        o.material = new THREE.MeshBasicMaterial({ color: 0xF2EFE5 });
        setTimeout(() => { o.material = old; o.userData.flashing = false; }, 34);
      }
    });
  }

  /* ---------- head-on near-miss (the far carriageway) ----------
     shaving a car on the other road closes at speed+theirs — the tightest pass
     on the board, so it pays double and stamps 対向 (taikō, oncoming). */
  function awardOncoming(o) {
    const g = o.minGap;
    let tierDef = null;
    for (const t of NEAR_TIERS) { if (g <= t.gap) { tierDef = t; break; } }
    if (!tierDef) return;

    combo = Math.min(COMBO_MAX, combo + 1);
    comboTimer = DECAY;
    nearMisses++;
    headOns++;
    bestCombo = Math.max(bestCombo, combo);
    const pts = 100 * tierDef.mult * combo * (fever ? 2 : 1) * HEADON_MULT;
    score += pts;
    boostMeter = Math.min(100, boostMeter + 12 + tierDef.mult * 5);

    const side = Math.sign(o.lx - player.group.position.x) || -1;
    showStamp(side, { jp: '対向', word: 'HEAD-ON ' + tierDef.word, cls: 't3' }, pts);
    audio.whoosh(side * 0.9, combo);
    audio.thunk(true);
    inkSlap(tierDef.mult === 3 ? 0.16 : 0.1);
    if (!RM) fovKick = Math.min(8, fovKick + (tierDef.mult === 3 ? 4 : 2.5));

    const midX = (o.lx + player.group.position.x) / 2;
    world.stampRoad('対向', midX, 2.5, {
      jp: true, width: 4 + tierDef.mult * 1.6, color: THEME.shu, tilt: side * 3,
    });

    if (combo === COMBO_MAX) enterFever();
    else player.paintLivery(combo, fever);
    syncStripes();

    gsap.fromTo(el.scoreBlock, { scale: 1 }, { scale: 1.05, duration: 0.12, yoyo: true, repeat: 1, ease: 'power2.out' });
  }

  /* ---------- crash ---------- */
  const wreckPieces = [];
  let orbitProxy = { a: 0 };
  let crashPos = new THREE.Vector3();

  function crash(car) {
    state = 'crash';
    audio.crash();
    inkSlap(0.2);
    exitFever();
    drifting = false;
    apexDrift = false;
    overdrive = false;
    el.driftLive.style.opacity = 0;
    el.apexLive.style.opacity = 0;
    el.airTrick.style.opacity = 0;
    el.overdriveTag.style.opacity = 0;
    if (!RM) el.speedLines.style.opacity = 0;
    // the run's ink dries: combo stack fades out under the crash
    gsap.to([el.comboStack, el.feverBand, el.hint], { opacity: 0, duration: 0.5 });
    gsap.killTweensOf(ts);
    ts.v = 0;                                   // impact freeze
    gsap.to(ts, { v: 0.14, duration: 0.35, delay: 0.12, ease: 'power2.out' });
    // kill the pending corner ramp-out tween so its onComplete can't pay out an apex after the crash
    gsap.killTweensOf(curveK);
    curveActive = false;
    cornerApex = 0;
    if (el.turnSignal) { gsap.killTweensOf(el.turnSignal); gsap.set(el.turnSignal, { opacity: 0 }); }
    if (el.pursuit) { gsap.killTweensOf(el.pursuit); gsap.set(el.pursuit, { opacity: 0 }); }
    pursuitShown = false;
    if (el.chaseWarn) { gsap.killTweensOf(el.chaseWarn); gsap.set(el.chaseWarn, { opacity: 0 }); }
    cwSide = 0;
    clearDistractCards();
    aura.visible = false;   // a crash means the shield wasn't armed — keep the wreck clean

    crashPos.copy(player.group.position);
    topSpeed = Math.max(topSpeed, speed * KMH);

    // the poster explodes into its shapes
    wreckPieces.length = 0;
    for (const p of player.pieces) {
      scene.attach(p.obj);
      wreckPieces.push({
        obj: p.obj,
        vel: new THREE.Vector3((Math.random() - 0.5) * 14, 4 + Math.random() * 9, -4 - Math.random() * 10),
        ang: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9),
      });
    }
    // shove the car we hit
    gsap.to(car.group.position, { x: car.group.position.x + Math.sign(car.group.position.x - crashPos.x || 1) * 3.5, duration: 1.2, ease: 'power2.out' });
    gsap.to(car.group.rotation, { y: (Math.random() - 0.5) * 1.4, duration: 1.2, ease: 'power2.out' });

    // 事故 / CRASH diagonal stamp
    gsap.timeline({ delay: 0.14 })
      .set(el.crashStamp, { opacity: 1 })
      .fromTo(el.crashStamp, { scale: 0, rotation: -14 },
        { scale: 1, rotation: -8, duration: 0.3, ease: 'back.out(2.2)', onStart: () => audio.thunk(true) });

    // camera orbits the wreck in slowed time
    orbitProxy.a = 0;
    gsap.to(orbitProxy, { a: 1.25, duration: 1.7, ease: 'power1.inOut' });

    gsap.delayedCall(1.55, () => { if (state === 'crash') showResults(); });
  }

  function skipCrash() {
    gsap.killTweensOf(orbitProxy);
    if (state === 'crash') showResults();
  }

  /* ---------- results ---------- */
  let newBest = false;
  let resultsTl = null;
  function showResults() {
    state = 'results';
    el.results.setAttribute('aria-hidden', 'false');
    gsap.to(ts, { v: 0, duration: 0.4 });
    gsap.to(el.crashStamp, { opacity: 0, duration: 0.3, delay: 0.2 });
    gsap.to(canvas, { filter: 'brightness(0.42)', duration: 0.6 });

    // wipe the previous run's ledger before it slides in
    const rowsInit = el.results.querySelectorAll('.ledger .row');
    rowsInit.forEach((row) => {
      gsap.set(row, { opacity: 0 });
      gsap.set(row.querySelector('.leader'), { scaleX: 0 });
    });
    el.rDist.textContent = '0.0 km';
    el.rMiss.textContent = '0';
    el.rHeadon.textContent = '0';
    el.rCombo.textContent = '×1';
    el.rSpeed.textContent = '0 km/h';
    el.rDrift.textContent = '0';
    el.rAir.textContent = '0.0 s';
    el.rSling.textContent = '0';
    el.rApex.textContent = '0';
    el.rCrate.textContent = '0';
    el.rBlast.textContent = '0';
    if (el.rChase) el.rChase.textContent = '0';
    el.rTrick.textContent = '×1.0';
    el.rOd.textContent = '0.0 s';
    el.rFever.textContent = '0.0 s';
    el.rScore.textContent = '0';
    audio.musicSet('results');

    newBest = score > best;
    if (newBest) {
      best = Math.floor(score);
      store.set('hiyari-best', String(best));
      // the world keeps your score, printed at the crash site
      world.stampRoad(fmt(best), crashPos.x, 6, { width: 10, noGhost: false });
    }

    el.newRecord.style.visibility = newBest ? 'visible' : 'hidden';
    gsap.set(el.newRecord, { scale: 0 });

    if (resultsTl) resultsTl.kill();
    const tl = resultsTl = gsap.timeline();
    tl.to(el.results, { yPercent: 0, duration: 0.55, ease: 'power3.out' });

    const rows = el.results.querySelectorAll('.ledger .row');
    rows.forEach((row, i) => {
      tl.to(row, { opacity: 1, duration: 0.2 }, 0.35 + i * 0.14);
      tl.fromTo(row.querySelector('.leader'), { scaleX: 0 }, { scaleX: 1, duration: 0.25, ease: 'power2.out' }, 0.35 + i * 0.14);
    });
    const vals = [
      [el.rDist, { v: 0 }, dist * KM, (o) => o.v.toFixed(1) + ' km'],
      [el.rMiss, { v: 0 }, nearMisses, (o) => String(Math.round(o.v))],
      [el.rHeadon, { v: 0 }, headOns, (o) => String(Math.round(o.v))],
      [el.rCombo, { v: 0 }, bestCombo, (o) => '×' + Math.round(o.v)],
      [el.rSpeed, { v: 0 }, Math.round(topSpeed), (o) => Math.round(o.v) + ' km/h'],
      [el.rDrift, { v: 0 }, driftTotal, (o) => fmt(o.v)],
      [el.rAir, { v: 0 }, airTotal, (o) => o.v.toFixed(1) + ' s'],
      [el.rSling, { v: 0 }, slingshots, (o) => String(Math.round(o.v))],
      [el.rApex, { v: 0 }, apexClears, (o) => String(Math.round(o.v))],
      [el.rCrate, { v: 0 }, cratesBroken, (o) => String(Math.round(o.v))],
      [el.rBlast, { v: 0 }, carsBlasted, (o) => String(Math.round(o.v))],
      [el.rChase, { v: 0 }, tailsLost + chasersBusted, (o) => String(Math.round(o.v))],
      [el.rTrick, { v: 0 }, bestTrick / 10, (o) => '×' + o.v.toFixed(1)],
      [el.rOd, { v: 0 }, overdriveTime, (o) => o.v.toFixed(1) + ' s'],
      [el.rFever, { v: 0 }, feverTime, (o) => o.v.toFixed(1) + ' s'],
    ];
    vals.forEach(([node, o, target, fmtFn], i) => {
      tl.to(o, {
        v: target, duration: 0.5, ease: 'power1.out',
        onUpdate: () => { node.textContent = fmtFn(o); },
      }, 0.45 + i * 0.14);
    });
    tl.fromTo('#score-final-rule', { scaleX: 0 }, { scaleX: 1, duration: 0.3, ease: 'power3.out' }, 1.15);
    const so = { v: 0 };
    tl.to(so, {
      v: Math.floor(score), duration: 1.3, ease: 'power2.out',
      onUpdate: () => { el.rScore.textContent = fmt(so.v); audio.tick(); },
    }, 1.25);
    if (newBest) {
      tl.fromTo(el.newRecord, { scale: 0, rotation: -20 },
        { scale: 1, rotation: -8, duration: 0.4, ease: 'back.out(5)', onStart: () => { audio.thunk(true); inkSlap(0.1); } }, 2.4);
    }
    tl.call(() => el.restartBtn.focus({ preventScroll: true }), null, 1.6);
  }

  /* ---------- restart: squeegee wipe, rolling in under a second ---------- */
  function restart() {
    if (state !== 'results' && state !== 'crash') return;
    audio.uiBlip();
    gsap.killTweensOf(orbitProxy);
    const tl = gsap.timeline();
    tl.set(el.wipe, { x: '-102%' });
    tl.to(el.wipe, { x: '0%', duration: 0.32, ease: 'power3.in' });
    tl.call(resetRun);
    tl.to(el.wipe, { x: '102%', duration: 0.34, ease: 'power3.out' }, '+=0.05');
    tl.set(el.wipe, { x: '-102%' });
  }

  function resetRun() {
    gsap.killTweensOf(ts);
    ts.v = 1;
    // kill every tween the crash/results choreography may still be running
    if (resultsTl) { resultsTl.kill(); resultsTl = null; }
    gsap.killTweensOf(canvas);
    gsap.killTweensOf([el.comboStack, el.feverBand, el.hint]);
    el.results.setAttribute('aria-hidden', 'true');
    gsap.set(canvas, { filter: 'none' });
    gsap.to(el.results, { yPercent: 102, duration: 0.3, ease: 'power2.in' });
    gsap.set(el.crashStamp, { opacity: 0, scale: 0 });

    // reassemble the wreck under the wipe
    for (const p of player.pieces) {
      player.group.attach(p.obj);
      p.obj.position.copy(p.pos);
      p.obj.rotation.copy(p.rot);
    }
    wreckPieces.length = 0;
    refreshRideLimits();   // the ride carries over between runs — so must its band
    player.group.position.set(LANE_X[2], 0, 0);
    player.group.rotation.set(0, 0, 0);
    vx = 0;

    for (let i = active.length - 1; i >= 0; i--) releaseCar(active[i]);
    active.length = 0;
    laneChangerBusy = false;
    world.clearDecals();
    lastStampMesh = null;
    oncoming.forEach((o, i) => { resetOncoming(o); o.g.position.z = -110 - i * 80; o.prevZ = o.g.position.z; });
    onOtherRoad = false; camRoadShift = 0; camShiftX = 0;

    score = 0; dist = 0; combo = 1; comboTimer = 0;
    fever = false; feverTime = 0; nearMisses = 0; bestCombo = 1; topSpeed = 0; headOns = 0;
    nextMilestone = 10000; bestPassedShown = false;

    // v2 state
    boostMeter = 0; boosting = false; boostFov = 0;
    drifting = false; wasDrifting = false; driftPts = 0; driftTotal = 0; driftTime = 0;
    airborne = false; vyAir = 0; airTime = 0; airTotal = 0;
    landGrace = 0;
    gsap.killTweensOf(curveK);
    curveK.v = 0; world.curveK = 0; curveActive = false; curveTimer = 14;
    rampTimer = 18;
    for (const r of ramps) { r.live = false; r.group.visible = false; }
    world.clearSkids();
    el.boostFill.style.transform = 'scaleX(0)';
    el.driftLive.style.opacity = 0;

    // v3 state: cornering / speed skills / air tricks
    curveDir = 1; curveHard = false; cornerApex = 0; apexDrift = false; camYaw = 0;
    if (el.turnSignal) { gsap.killTweensOf(el.turnSignal); gsap.set(el.turnSignal, { opacity: 0 }); }
    draftCharge = 0; draftedThisFrame = false; slingTimer = 0;
    overdrive = false; overdriveArm = 0; overdriveTime = 0; wasBoosting = false;
    rollAngle = 0; flipAngle = 0; spinAngle = 0; lastTrickSpin = 0; wipeoutTimer = 0;
    slingshots = 0; apexClears = 0; bestTrick = 10;

    // v4 state: cannon / crates / shield
    ammo = AMMO_START; shieldOn = false; aura.visible = false;
    aura.scale.set(1, 1, 1);
    cratesBroken = 0; carsBlasted = 0; crateTimer = 9;
    for (const s of shots) killShot(s);
    for (const cr of crates) { cr.live = false; cr.group.visible = false; }
    for (const sh of shards) sh.m.visible = false;
    shards.length = 0;
    // v7: clear any pursuit and reset the distraction sky
    for (const ch of chasers) releaseChaser(ch);
    chaserTimer = CH_START_DELAY; sirenTimer = 0;
    chasersBusted = 0; tailsLost = 0;
    if (el.pursuit) { gsap.killTweensOf(el.pursuit); el.pursuit.style.opacity = 0; }
    pursuitShown = false;
    if (el.chaseWarn) { gsap.killTweensOf(el.chaseWarn); el.chaseWarn.style.opacity = 0; }
    cwSide = 0;
    // v8: keep-clear dwell — the middle is a crossing again on every fresh run
    zoneTime = 0; zoneOut = 0; keepClearShown = false;
    if (el.keepClear) { gsap.killTweensOf(el.keepClear); el.keepClear.style.opacity = 0; }
    world.clearDistractors();
    clearDistractCards();
    distractTimer = 8;
    syncAmmo();
    el.vignette.style.opacity = 0;
    gsap.killTweensOf(player.group.rotation);
    el.speedLines.style.opacity = RM ? '0.10' : '0';
    el.speedLines.style.transform = 'none';
    el.airTrick.style.opacity = 0;
    el.overdriveTag.style.opacity = 0;
    el.apexLive.style.opacity = 0;
    el.draftCharge.style.transform = 'scaleX(0)';
    audio.setDrift(0);
    audio.musicSet('run');
    scoreShown = -1; syncScore();
    el.comboStack.innerHTML = '';
    gsap.set([el.comboStack, el.feverBand], { opacity: 1 });
    gsap.set(el.feverBand, { scaleX: 0 });
    world.paintMoon(false);
    player.paintLivery(1, false);
    world.billboards.forEach((b) => { b.visible = false; });

    tier = 0;
    applySky(THEME.tiers[0], 0.1);
    el.routeName.textContent = THEME.tierNames[0];
    audio.feverOff();

    baseSpeed = V0;
    speed = V0;
    speedNorm = 0;
    spawnTimer = 1.4;
    seedTraffic();
    state = 'run';
  }

  /* ---------- intro ---------- */
  (function buildTitle() {
    const put = (host, word) => {
      for (const ch of word) {
        const s = document.createElement('span');
        s.className = 'tletter';
        s.dataset.l = ch;
        s.textContent = ch;
        host.appendChild(s);
      }
    };
    put(el.tline1, 'HIYA');
    put(el.tline2, 'RI!!');
    // vermilion flood duplicate for the hold-to-drive ritual
    const fill = document.createElement('div');
    fill.id = 'title-fill';
    fill.innerHTML = '<span class="tline">HIYA</span><span class="tline">RI!!</span>';
    el.introTop.appendChild(fill);
    el.titleFill = fill;
  })();

  if (best > 0) el.bestRun.textContent = 'BEST RUN — ' + fmt(best) + ' PTS';

  function introChoreography() {
    const letters = el.title.querySelectorAll('.tletter');
    const tl = gsap.timeline({ delay: 0.15 });
    tl.to(el.introField, { x: 0, duration: 0.55, ease: 'power3.inOut' });
    tl.to(letters, {
      clipPath: 'inset(0% 0% 0% 0%)', duration: 0.5, stagger: 0.07, ease: 'power4.out',
    }, 0.35);
    tl.call(() => {
      letters.forEach((l, i) => setTimeout(() => l.classList.add('ghost'), i * 70 + 80));
    }, null, 0.6);
    tl.fromTo(el.spine, { y: -26 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' }, 0.9);
    tl.fromTo(el.roundel, { scale: 1.4, rotation: -30 }, { scale: 1, rotation: -8, opacity: 0.94, duration: 0.5, ease: 'back.out(2)' }, 1.05);
    tl.to(el.colophon, { opacity: 1, duration: 0.45 }, 1.2);
  }

  /* hold-to-drive: the commit must be earned */
  const hold = { v: 0, active: false, done: false };
  let holdTween = null;
  function holdStart() {
    if (state !== 'intro' || hold.done) return;
    audio.init();
    audio.resume();
    audio.idle();
    audio.musicSet('intro');
    hold.active = true;
    if (holdTween) holdTween.kill();
    holdTween = gsap.to(hold, {
      v: 1, duration: 0.8 * (1 - hold.v), ease: 'none',
      onUpdate: applyHold,
      onComplete: commitStart,
    });
  }
  function holdEnd() {
    if (!hold.active || hold.done) return;
    hold.active = false;
    if (holdTween) holdTween.kill();
    holdTween = gsap.to(hold, { v: 0, duration: 0.45, ease: 'power2.out', onUpdate: applyHold });
  }
  function applyHold() {
    el.titleFill.style.clipPath = 'inset(' + ((1 - hold.v) * 100).toFixed(1) + '% 0 0 0)';
    el.inkFill.style.transform = 'scaleX(' + hold.v.toFixed(3) + ')';
    audio.holdRev(hold.v);
  }

  /* camera pose lerp for the fall into chase */
  const introPose = { pos: new THREE.Vector3(10.5, 1.5, -10), look: new THREE.Vector3(LANE_X[2], 0.8, 1.6), fov: 30 };
  const camTrans = { t: 0 };
  const _look = new THREE.Vector3();
  const _pos = new THREE.Vector3();

  function chasePose(outPos, outLook) {
    const px = player.group.position.x;
    const py = player.group.position.y;
    // the whole rig is translated by camShiftX so the far carriageway frames up
    // exactly like the near one does — the car sits centred on whichever road it's on
    outPos.set(camX, 5.3 - speedNorm * 0.7 + py * 0.55, 10.6 - speedNorm * 1.1);
    outLook.set(camShiftX * 0.18 + px * 0.82, 1.35 + py * 0.4, -24);
  }

  function commitStart() {
    hold.done = true;
    hold.active = false;
    state = 'starting';
    audio.thunk(true);
    audio.musicSet('run');
    inkSlap(0.1);

    // the title is already painted on the asphalt — drive over it
    world.stampRoad('HIYA', 0, -34, { width: 15 });
    world.stampRoad('RI!!', 0, -62, { width: 15 });
    world.stampRoad('ALMOST IS EVERYTHING', 0, -95, { width: 12, noGhost: true, opacity: 0.5 });
    baseSpeed = V0;
    seedTraffic();

    // poster tears along the horizon
    const tear = gsap.timeline({ delay: 0.1 });
    tear.to(el.introTop, { yPercent: -105, duration: 0.7, ease: 'power4.inOut' });
    tear.to(el.introBottom, { yPercent: 105, duration: 0.7, ease: 'power4.inOut' }, 0.05);
    tear.set(el.intro, { display: 'none' });

    gsap.to(camTrans, { t: 1, duration: 1.9, ease: 'power3.inOut', delay: 0.15 });
    const sp = { v: 0 };
    gsap.to(sp, {
      v: V0, duration: 2.3, ease: 'power2.inOut', delay: 0.15,
      onUpdate: () => { speed = sp.v; },
      onComplete: () => {
        baseSpeed = V0;
        state = 'run';
        el.hint && gsap.to(el.hint, { opacity: 0, duration: 0.6, delay: 5 });
      },
    });

    // the HUD typesets itself as the engine opens up
    const hudTl = gsap.timeline({ delay: 0.9 });
    hudTl.to([el.scoreBlock, $('#speed-block'), el.comboStack, el.stamps, el.feverBand, el.hint], {
      opacity: 1, duration: 0.01, stagger: 0.05,
    });
    hudTl.fromTo(el.scoreRule, { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'power3.out' }, 0.1);
    hudTl.fromTo([el.scoreBlock, $('#speed-block')], { y: 18 }, { y: 0, duration: 0.5, stagger: 0.08, ease: 'power3.out' }, 0);
    gsap.set(el.feverBand, { scaleX: 0 });
  }

  /* ---------- curves: real corners you must hold — drift is the tool ---------- */
  function startCurve() {
    curveActive = true;
    const dir = Math.random() < 0.5 ? -1 : 1;
    const hard = Math.random() < P_HARD;
    // hard corners bend nearly 2× harder and demand a committed drift to hold the line
    const mag = dir * (hard ? 1.6e-4 + Math.random() * 0.4e-4 : 0.7e-4 + Math.random() * 0.4e-4);
    curveDir = dir;
    curveHard = hard;
    cornerApex = 0;                       // per-corner apex ledger starts fresh
    const tIn = hard ? 2 : 3;
    const tHold = hard ? 5 + Math.random() * 4 : 7 + Math.random() * 5;
    const tOut = hard ? 2.5 : 3;
    gsap.to(curveK, { v: mag, duration: tIn, ease: 'power1.inOut' });
    gsap.to(curveK, {
      v: 0, duration: tOut, ease: 'power1.inOut', delay: tIn + tHold,
      onComplete: () => { curveActive = false; curveTimer = 9 + Math.random() * 10; evalApexClear(); hideTurnSignal(); },
    });
    // telegraph at the fog edge — hard corners burn in vermilion, gentle in paper
    world.stampRoad(dir > 0 ? 'ドリフト →' : '← ドリフト', 0, -330, {
      jp: true, width: 11, noGhost: true, opacity: 0.6, color: hard ? THEME.shu : THEME.paper,
    });
    // HUD turn-call + a panned rally note so the corner is unmissable
    showTurnSignal(dir, hard);
    audio.cornerAlert(dir, hard);
  }

  /* ---------- turn-call banner (makes a corner read as LEFT / RIGHT) ---------- */
  function showTurnSignal(dir, hard) {
    if (!el.turnSignal) return;
    const right = dir > 0;
    el.turnArrow.textContent = right ? '▶' : '◀';
    el.turnText.textContent = (right ? 'TURN RIGHT' : 'TURN LEFT') + (hard ? ' !!' : '');
    el.turnSignal.classList.toggle('right', right);
    el.turnSignal.classList.toggle('left', !right);
    el.turnSignal.classList.toggle('hard', hard);
    gsap.killTweensOf(el.turnSignal);
    // xPercent:-50 keeps GSAP's inline transform centred — animating bare `x`
    // would overwrite the CSS translateX(-50%) and shove the banner off-centre
    gsap.fromTo(el.turnSignal,
      { opacity: 0, xPercent: -50, x: right ? 40 : -40 },
      { opacity: 1, xPercent: -50, x: 0, duration: 0.4, ease: 'back.out(2)' });
  }
  function hideTurnSignal() {
    if (!el.turnSignal) return;
    gsap.killTweensOf(el.turnSignal);
    gsap.to(el.turnSignal, { opacity: 0, duration: 0.35, ease: 'power2.in' });
  }

  /* the payout for holding a drift line all the way through a corner */
  function evalApexClear() {
    if (state !== 'run') { cornerApex = 0; return; }   // a stray onComplete after a crash pays nothing
    if (cornerApex >= APEX_CLEAR) {
      const pts = Math.floor(cornerApex) * combo;
      score += pts;
      apexClears++;
      boostMeter = Math.min(100, boostMeter + 20);
      showStamp(curveDir, { jp: 'アペックス', word: 'APEX CLEAR', cls: 't3' }, pts);
      world.stampRoad('アペックス', player.group.position.x, 2.5, { jp: true, width: 5 });
      inkSlap(0.12);
      audio.thunk(true);
      if (!RM) fovKick = Math.min(8, fovKick + 3);
    }
    cornerApex = 0;
  }

  /* ---------- stunt ramps ---------- */
  for (let i = 0; i < 2; i++) {
    const r = world.buildRamp();
    r.live = false;
    r.lane = 0;
    r.z = 0;
    ramps.push(r);
  }

  function spawnRamp() {
    const r = ramps.find((x) => !x.live);
    if (!r) return;
    const lanes = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    for (const lane of lanes) {
      if (active.some((c) => c.lane === lane && Math.abs(c.z - world.SPAWN_Z) < 90)) continue;
      r.live = true;
      r.lane = lane;
      r.z = world.SPAWN_Z - 10;
      r.group.visible = true;
      return;
    }
  }

  function updateRamps(dt) {
    for (const r of ramps) {
      if (!r.live) continue;
      r.z += speed * dt;
      r.group.position.set(LANE_X[r.lane] + world.bendX(r.z), 0, r.z);
      if (r.z > world.KILL_Z) { r.live = false; r.group.visible = false; continue; }
      if (state === 'run' && !airborne &&
          Math.abs(player.group.position.x - LANE_X[r.lane]) < r.halfW + 0.5 &&
          Math.abs(r.z) < r.halfL) {
        launch();
      }
    }
  }

  function launch() {
    airborne = true;
    vyAir = 6.8 + speed * 0.075;          // more hang time to actually fly a trick
    airTime = 0;
    rollAngle = 0; flipAngle = 0; spinAngle = 0; lastTrickSpin = 0;
    audio.swell();
    if (!RM) fovKick = Math.min(8, fovKick + 3);
  }

  /* ---------- arsenal: front cannon, supply crates, crash shield ---------- */
  const aura = world.buildShieldAura();
  player.group.add(aura);

  for (let i = 0; i < 4; i++) shots.push({ ...world.buildTracer(), live: false, x: 0, z: 0 });
  for (let i = 0; i < 3; i++) crates.push({ ...world.buildCrate(), live: false, lane: 0, z: 0 });
  // two patrol cars in the pool (a second joins the hunt on the high tiers)
  for (let i = 0; i < 2; i++) {
    chasers.push({ ...world.buildPolice(), live: false, dead: false, x: 0, z: 0, lit: 0, warned: 0 });
  }

  function fire() {
    if (state !== 'run' || paused || helpOpen || airborne || ammo <= 0) return;
    const s = shots.find((x) => !x.live);
    if (!s) return;
    ammo--;
    syncAmmo();
    s.live = true;
    s.x = player.group.position.x;
    s.z = -3;
    s.group.visible = true;
    audio.shoot();
    if (!RM) fovKick = Math.min(6, fovKick + 0.8);   // recoil breath, not a jolt
  }
  function killShot(s) { s.live = false; s.group.visible = false; }

  function spawnCrate() {
    const cr = crates.find((x) => !x.live);
    if (!cr) return;
    const lanes = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    for (const lane of lanes) {
      if (active.some((c) => c.lane === lane && Math.abs(c.z - world.SPAWN_Z) < 90)) continue;
      if (ramps.some((r) => r.live && r.lane === lane && Math.abs(r.z - world.SPAWN_Z) < 90)) continue;
      cr.live = true;
      cr.lane = lane;
      cr.z = world.SPAWN_Z - 5;
      cr.group.visible = true;
      return;
    }
  }

  function shatterCrate(x, z) {
    for (const m of world.crateShards) {
      if (m.visible) continue;   // let overlapping bursts share what's free
      m.visible = true;
      m.position.set(x + (Math.random() - 0.5) * 1.2, 0.8, z);
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      shards.push({
        m,
        vel: new THREE.Vector3((Math.random() - 0.5) * 9, 3 + Math.random() * 7, (Math.random() - 0.5) * 6),
        ang: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12),
        life: 0.9 + Math.random() * 0.4,
      });
    }
  }

  function gainShield() {
    shieldOn = true;
    aura.visible = true;
    syncAmmo();
    showStamp(1, { jp: 'バリア', word: 'SHIELD ARMED', cls: 't3' }, 0);
    audio.shieldGain();
    inkSlap(0.08);
  }

  function breakCrate(cr) {
    cr.live = false;
    cr.group.visible = false;
    cratesBroken++;
    const cx = LANE_X[cr.lane] + world.bendX(cr.z);
    shatterCrate(cx, cr.z);
    audio.crateBreak();
    score += CRATE_PTS;
    // the drop: a shield if you're bare (sometimes), ammo otherwise
    if (!shieldOn && Math.random() < SHIELD_CHANCE) {
      gainShield();
    } else {
      ammo = Math.min(AMMO_MAX, ammo + AMMO_PER_CRATE);
      syncAmmo();
      showStamp(Math.sign(cx - player.group.position.x) || 1,
        { jp: '弾薬', word: 'AMMO +' + AMMO_PER_CRATE, cls: 't1' }, CRATE_PTS);
      audio.pickup();
    }
  }

  /* a shot clears a car off the road — fewer points than shaving it, but a way out */
  function blastCar(c) {
    c.dead = true;
    carsBlasted++;
    const pts = BLAST_PTS * combo;
    score += pts;
    boostMeter = Math.min(100, boostMeter + 6);
    const side = Math.sign(c.lx - player.group.position.x) || 1;
    showStamp(side, { jp: '撃破', word: 'BLASTED', cls: 't2' }, pts);
    audio.blastHit();
    inkSlap(0.08);
    const dir = c.lane <= 1 ? -1 : 1;   // spin out toward the nearest edge
    gsap.killTweensOf(c);
    // killing a mid-lane-change tween strands its onComplete — release the lock
    if (c.changing) { c.changing = false; laneChangerBusy = false; }
    gsap.to(c, { lx: dir * 15, duration: 0.9, ease: 'power2.in' });
    gsap.to(c.group.rotation, { y: dir * 2.6, duration: 0.9, ease: 'power1.in' });
  }

  /* the one-time barrier: eats a crash, spits the car aside */
  function shieldSave(c) {
    shieldOn = false;
    aura.visible = false;
    syncAmmo();
    landGrace = SHIELD_GRACE;
    c.dead = true;
    const side = Math.sign(c.lx - player.group.position.x) || 1;
    const dir = c.lane <= 1 ? -1 : 1;
    gsap.killTweensOf(c);
    if (c.changing) { c.changing = false; laneChangerBusy = false; }
    gsap.to(c, { lx: dir * 15, duration: 0.8, ease: 'power2.in' });
    gsap.to(c.group.rotation, { y: dir * 3, duration: 0.8, ease: 'power1.in' });
    showStamp(side, { jp: 'バリア', word: 'SHIELD SAVED', cls: 't3' }, 0);
    world.stampRoad('バリア', player.group.position.x, 2.5, { jp: true, width: 5 });
    audio.shieldSave();
    inkSlap(0.16);
    if (!RM) fovKick = Math.min(9, fovKick + 4);
  }

  function updateShots(dt) {
    for (const s of shots) {
      if (!s.live) continue;
      // swept test: the bolt covers [s.z, zPrev] this frame — anything inside
      // that segment is hit, so fast bolts can't tunnel through a thin target
      const zPrev = s.z;
      s.z -= TRACER_SPEED * dt;
      s.group.position.set(s.x + world.bendX(s.z), 0, s.z);
      if (s.z < -280) { killShot(s); continue; }
      if (state !== 'run') continue;   // frozen states: fly, but hit nothing
      let spent = false;
      for (const cr of crates) {
        if (cr.live && cr.z > s.z - 2 && cr.z < zPrev + 2 &&
            Math.abs(s.x - LANE_X[cr.lane]) < 1.5) {
          breakCrate(cr);
          killShot(s);
          spent = true;
          break;
        }
      }
      if (spent) continue;
      let hit = false;
      for (const c of active) {
        if (!c.dead && c.z > s.z - c.halfL && c.z < zPrev + c.halfL &&
            Math.abs(s.x - c.lx) < c.halfW + 0.5) {
          blastCar(c);
          killShot(s);
          hit = true;
          break;
        }
      }
      if (hit) continue;
      // a tracer can shoot a patrol car out of the pursuit
      for (const ch of chasers) {
        if (ch.live && !ch.dead && ch.z > s.z - ch.halfL && ch.z < zPrev + ch.halfL &&
            Math.abs(s.x - ch.x) < ch.halfW + 0.5) {
          chasersBusted++;
          retireChaser(ch, CH_BUST_PTS * combo, '撃破', 'BUSTED', 't3');
          audio.blastHit();
          killShot(s);
          break;
        }
      }
    }
  }

  function updateCrates(dt) {
    for (const cr of crates) {
      if (!cr.live) continue;
      cr.z += speed * dt;
      cr.group.position.set(LANE_X[cr.lane] + world.bendX(cr.z), 0, cr.z);
      cr.box.rotation.y += dt * 1.1;   // idle spin so it reads as a pickup
      if (cr.z > world.KILL_Z) { cr.live = false; cr.group.visible = false; continue; }
      if (state === 'run' && !airborne &&
          Math.abs(player.group.position.x - LANE_X[cr.lane]) < 1.6 && Math.abs(cr.z) < 1.8) {
        breakCrate(cr);
      }
    }
    // shard debris: gravity + world scroll, then gone
    for (let i = shards.length - 1; i >= 0; i--) {
      const sh = shards[i];
      sh.vel.y -= 22 * dt;
      sh.m.position.x += sh.vel.x * dt;
      sh.m.position.y = Math.max(0.12, sh.m.position.y + sh.vel.y * dt);
      sh.m.position.z += sh.vel.z * dt + speed * dt;
      sh.m.rotation.x += sh.ang.x * dt;
      sh.m.rotation.y += sh.ang.y * dt;
      sh.life -= dt;
      if (sh.life <= 0 || sh.m.position.z > world.KILL_Z) {
        sh.m.visible = false;
        shards.splice(i, 1);
      }
    }
  }

  const wrapAng = (a) => { a %= (Math.PI * 2); if (a > Math.PI) a -= Math.PI * 2; if (a < -Math.PI) a += Math.PI * 2; return a; };
  const fullTurns = (a) => Math.floor(Math.abs(a) / (Math.PI * 2));

  function trickName(distinct, fRoll, fFlip, fSpin) {
    if (distinct >= 3) return '神業';                 // godlike: all three axes
    if (distinct === 2) return 'コンボ';               // two-axis combo
    if (fRoll >= 1) return fRoll >= 2 ? 'ダブルロール' : 'ロール';
    if (fFlip >= 1) return fFlip >= 2 ? 'ダブルフリップ' : 'フリップ';
    if (fSpin >= 1) return fSpin >= 2 ? 'ダブルスピン' : 'スピン';
    return 'エア';
  }

  function land() {
    const p = player.group.position;
    p.y = 0;
    airborne = false;
    audio.landThump();
    airTotal += airTime;

    // near a multiple of 2π on every axis = a clean set-down; otherwise a botch
    const cleanness = Math.max(Math.abs(wrapAng(rollAngle)), Math.abs(wrapAng(flipAngle)), Math.abs(wrapAng(spinAngle)));
    const fRoll = fullTurns(rollAngle), fFlip = fullTurns(flipAngle), fSpin = fullTurns(spinAngle);
    const totalFull = fRoll + fFlip + fSpin;
    const distinct = (fRoll >= 1) + (fFlip >= 1) + (fSpin >= 1);
    const trickMult = 1 + distinct * 0.5 + Math.max(0, totalFull - 1) * 0.25;

    // settle from the WRAPPED angle so the grounded lerps unwind a small amount,
    // never the full accumulated spin (18 rad → snap-back would look broken)
    player.group.rotation.set(wrapAng(flipAngle), wrapAng(spinAngle), wrapAng(rollAngle));

    if (cleanness < CLEAN_THRESH) {
      const pts = Math.floor((150 + airTime * 250 + totalFull * 200) * trickMult * combo);
      score += pts;
      boostMeter = Math.min(100, boostMeter + 15 + 5 * distinct);
      bestTrick = Math.max(bestTrick, Math.round(trickMult * 10));
      showStamp(Math.sign(p.x) || 1,
        { jp: trickName(distinct, fRoll, fFlip, fSpin),
          word: totalFull >= 1 ? 'CLEAN' : 'AIR TIME',
          cls: distinct >= 3 ? 't3' : (totalFull >= 1 || airTime > 1.15 ? 't2' : 't1') }, pts);
      world.stampRoad('着地', p.x, 2.5, { jp: true, width: 3.6 });
      inkSlap(distinct >= 2 ? 0.12 : 0.08);
      audio.thunk(distinct >= 2);
    } else {
      // botched set-down: a tumble + a beat of lost steering — never a crash
      wipeoutTimer = BOTCH_TIME;
      landGrace = BOTCH_GRACE;
      showStamp(Math.sign(p.x) || 1, { jp: '失敗', word: 'BOTCH', cls: 't1' }, 0);
      inkSlap(0.06);
      audio.thunk(false);
    }
    landGrace = Math.max(landGrace, 0.6);   // never below the base grace
    el.airTrick.style.opacity = 0;
  }

  /* ---------- drift bank ---------- */
  function endDrift() {
    if (driftPts >= 80) {
      const banked = Math.floor(driftPts);
      score += banked;
      driftTotal += banked;
      showStamp(Math.sign(vx) || 1, { jp: 'ドリフト', word: 'DRIFT INK', cls: driftTime > 2 ? 't2' : 't1' }, banked);
      audio.thunk(false);
      if (driftTime > 1.1) boostMeter = Math.min(100, boostMeter + 12);
    }
    driftPts = 0;
    driftTime = 0;
    el.driftLive.style.opacity = 0;
  }

  /* ---------- milestones & personal best ---------- */
  function checkMilestones() {
    if (score >= nextMilestone) {
      const b = world.billboards.reduce((a, c) => (a.position.z < c.position.z ? a : c));
      world.paintBillboard(b, fmt(nextMilestone), 'MILESTONE PRINTED');
      b.visible = true;
      audio.chime();
      nextMilestone += 10000;
    }
    if (!bestPassedShown && best > 0 && score > best && state === 'run') {
      bestPassedShown = true;
      world.paintGantry(farthestGantry(), 'BEST: PASSED', fmt(best) + ' PTS IS BEHIND YOU');
      audio.chime();
    }
  }

  /* ---------- input ---------- */
  const keyState = {};
  window.addEventListener('keydown', (e) => {
    if (e.repeat) { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault(); return; }
    audio.resume();
    keyState[e.code] = true;
    // how-to-play: '?' toggles, Escape closes — handled before gameplay keys
    if (e.key === '?' || (e.code === 'Slash' && e.shiftKey)) { toggleHelp(); e.preventDefault(); return; }
    if (helpOpen) { if (e.code === 'Escape') closeHelp(); return; }
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': steerL = true; e.preventDefault(); break;
      case 'ArrowRight': case 'KeyD': steerR = true; e.preventDefault(); break;
      case 'ArrowUp': case 'KeyW': wantBoost = true; e.preventDefault(); break;
      case 'ShiftLeft': case 'ShiftRight': case 'Space': driftHeld = true; e.preventDefault(); break;
      case 'KeyF': fire(); break;
      case 'KeyC': cycleVehicle(); break;
      case 'KeyM': toggleMute(); break;
      case 'KeyP': togglePause(); break;
      case 'KeyR':
        if (state === 'crash') skipCrash();
        else if (state === 'results') restart();
        break;
      case 'Enter':
        if (state === 'results') restart();
        break;
    }
    if (state === 'intro' && !e.metaKey && !e.ctrlKey && !e.altKey && !['KeyM', 'KeyP'].includes(e.code)) holdStart();
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    keyState[e.code] = false;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') steerL = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') steerR = false;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') wantBoost = false;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'Space') driftHeld = false;
    if (state === 'intro') holdEnd();
  });

  /* touch: on-screen buttons steer & drift (wired below). A bare-screen touch
     only drives the intro hold-to-start ritual and unlocks the audio context —
     the old "screen-half steer / two-finger drift" scheme was the thing mobile
     players couldn't work out, so it's replaced by explicit buttons. */
  let touchSteer = 0;   // retained only for the `|| touchSteer` fallback in updatePlayer
  const onButton = (e) => !!(e.target && e.target.closest && e.target.closest('button'));
  window.addEventListener('touchstart', (e) => {
    if (onButton(e)) return;               // control buttons handle their own touches
    audio.resume();
    if (state === 'intro') { e.preventDefault(); holdStart(); }
  }, { passive: false });
  window.addEventListener('touchend', () => { if (state === 'intro') holdEnd(); });
  window.addEventListener('touchcancel', () => { if (state === 'intro') holdEnd(); });

  /* on-screen control pad: press = hold, release = let go. In the air the same
     three buttons become trick controls (roll / spin), exactly like the keys. */
  function bindHold(id, on, off) {
    const b = document.getElementById(id);
    if (!b) return;
    const press = (e) => { e.preventDefault(); audio.resume(); on(); };
    const release = (e) => { if (e && e.cancelable) e.preventDefault(); off(); };
    b.addEventListener('pointerdown', press);
    b.addEventListener('pointerup', release);
    b.addEventListener('pointerleave', release);
    b.addEventListener('pointercancel', release);
  }
  bindHold('btn-left',  () => { steerL = true; },   () => { steerL = false; });
  bindHold('btn-right', () => { steerR = true; },   () => { steerR = false; });
  bindHold('btn-drift', () => { driftHeld = true; }, () => { driftHeld = false; });
  bindHold('btn-fire',  () => { fire(); },           () => {});   // tap = one shot

  /* on-screen boost trigger (coarse pointers) */
  const boostOn = (e) => { e.preventDefault(); audio.resume(); wantBoost = true; };
  const boostOff = () => { wantBoost = false; };
  el.boostBtn.addEventListener('pointerdown', boostOn);
  el.boostBtn.addEventListener('pointerup', boostOff);
  el.boostBtn.addEventListener('pointercancel', boostOff);
  el.boostBtn.addEventListener('pointerleave', boostOff);
  window.addEventListener('mousedown', (e) => {
    if (state === 'intro' && !onButton(e)) holdStart();
  });
  window.addEventListener('mouseup', () => { if (state === 'intro') holdEnd(); });

  el.restartBtn.addEventListener('click', restart);

  /* Settings chips carry two labels — a long desktop one and a short touch one.
     Writing textContent would blow both spans away, so set them individually. */
  function setChip(btn, long, short) {
    if (!btn) return;
    const l = btn.querySelector('.ab-l'), s = btn.querySelector('.ab-s');
    if (l) l.textContent = long; else btn.textContent = long;
    if (s && short != null) s.textContent = short;
  }

  /* mute */
  let muted = store.get('hiyari-muted') === '1';
  function syncMuteBtn() {
    setChip(el.muteBtn, muted ? 'SOUND OFF' : 'SOUND ON', '音');
    el.muteBtn.classList.toggle('muted', muted);
  }
  function toggleMute() {
    muted = !muted;
    store.set('hiyari-muted', muted ? '1' : '0');
    audio.setMuted(muted);
    syncMuteBtn();
  }
  audio.muted = muted;
  syncMuteBtn();
  el.muteBtn.addEventListener('click', () => { audio.init(); audio.resume(); toggleMute(); });

  /* music toggle (independent of SFX). Default ON — plays the AC/DC background
     track through the music bus; the button silences it (choice is persisted). */
  let musicOn = store.get('hiyari-music') !== '0';
  audio._musicPref = musicOn;
  function syncMusicBtn() {
    setChip(el.musicBtn, musicOn ? 'MUSIC ON' : 'MUSIC OFF', '♪');
    el.musicBtn.classList.toggle('muted', !musicOn);
  }
  syncMusicBtn();
  el.musicBtn.addEventListener('click', () => {
    audio.init();
    audio.resume();
    musicOn = !musicOn;
    store.set('hiyari-music', musicOn ? '1' : '0');
    audio.setMusicOn(musicOn);
    syncMusicBtn();
    audio.uiBlip();
  });

  /* ride swap — car → bike → bicycle, cycled with C or the RIDE button.
     grounded run only, so the crash pieces / hitbox never swap mid-air. */
  const vehicleBtn = document.getElementById('vehicle-btn');
  const RIDE_JP = { CAR: '車', BIKE: '単車', BICYCLE: '自転車' };
  function syncVehicleBtn() {
    setChip(vehicleBtn, 'RIDE — ' + player.vehicleName, RIDE_JP[player.vehicleName] || '車');
  }
  syncVehicleBtn();
  function cycleVehicle() {
    if (state !== 'run' || airborne || paused || helpOpen) return;
    const name = player.setVehicle(player.vehicle + 1);
    // the road limits are hitbox-derived — a narrower ride gets a narrower band,
    // so no ride can park somewhere the traffic it shares the road with can't reach
    refreshRideLimits();
    const p = player.group.position;
    p.x = Math.max(xWallL, Math.min(xWallR, p.x));
    syncVehicleBtn();
    audio.uiBlip();
    showStamp(1, { jp: '車両変更', word: name, cls: 't2' }, 0);
  }
  if (vehicleBtn) vehicleBtn.addEventListener('click', () => { audio.resume(); cycleVehicle(); });

  /* how-to-play overlay — freezes the drive (helpOpen gate in frame()) so a
     player can read the controls without the car ploughing on without them */
  const helpEl = document.getElementById('help');
  function openHelp() {
    if (helpOpen) return;
    helpOpen = true;
    clearInputs();
    // freeze GSAP too — otherwise tweens and delayedCalls (e.g. crash → results)
    // keep firing on GSAP's own ticker behind the overlay. Skip if already paused.
    if (!paused) gsap.globalTimeline.pause();
    if (helpEl) helpEl.setAttribute('aria-hidden', 'false');
    audio.init(); audio.resume(); audio.duck(true); audio.uiBlip();
  }
  function closeHelp() {
    if (!helpOpen) return;
    helpOpen = false;
    if (!paused) gsap.globalTimeline.resume();
    if (helpEl) helpEl.setAttribute('aria-hidden', 'true');
    audio.duck(paused);
    last = performance.now();   // don't fold the frozen span into the next dt
  }
  function toggleHelp() { helpOpen ? closeHelp() : openHelp(); }
  document.getElementById('help-btn').addEventListener('click', () => { audio.init(); openHelp(); });
  document.getElementById('help-close').addEventListener('click', closeHelp);
  if (helpEl) helpEl.addEventListener('pointerdown', (e) => { if (e.target === helpEl) closeHelp(); });

  /* pause — gameplay GSAP tweens (lane changes, blinkers) freeze with it */
  function togglePause() {
    if (state !== 'run') return;
    paused = !paused;
    // paused is the moment a touch player CAN reach the settings chips — the
    // coarse layout hides all but RIDE while driving, and shows them again here
    document.body.classList.toggle('paused', paused);
    el.pause.style.display = paused ? 'flex' : 'none';
    el.pause.setAttribute('aria-hidden', paused ? 'false' : 'true');
    if (paused) gsap.globalTimeline.pause();
    else gsap.globalTimeline.resume();
    audio.duck(paused);
  }
  // tap anywhere on the overlay resumes — touch players have no P key
  el.pause.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    // the settings chips sit ABOVE the veil now; a tap on one is not a resume
    if (paused && !(e.target && e.target.closest && e.target.closest('button'))) togglePause();
  });
  // …and the touch-only chip that gets them INTO pause in the first place
  const pauseBtn = document.getElementById('pause-btn');
  if (pauseBtn) pauseBtn.addEventListener('click', () => { audio.resume(); if (!paused) togglePause(); });
  function clearInputs() {
    steerL = false;
    steerR = false;
    touchSteer = 0;
    wantBoost = false;
    driftHeld = false;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInputs();
      if (state === 'run' && !paused) togglePause();
    }
    audio.resume();
  });
  window.addEventListener('blur', () => {
    clearInputs();
    if (state === 'run' && !paused) togglePause();
  });

  /* resize */
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  /* ---------- per-frame systems ---------- */
  let hudScoreAt = 0, hudSpeedAt = 0;

  function updateRun(dt, raw, now) {
    baseSpeed = Math.min(VMAX, baseSpeed + ACCEL * dt);

    // boost can't fire mid-air — up-arrow there is a FLIP, not a burn
    boosting = wantBoost && boostMeter > 0 && !airborne;
    if (boosting) boostMeter = Math.max(0, boostMeter - 34 * dt);
    if (boosting && !wasBoosting && !RM) fovKick = Math.min(8, fovKick + 4);   // launch snap
    wasBoosting = boosting;

    // overdrive: hold boost flat-out long enough to break into a flow state.
    // arm only builds while NOT yet in overdrive (stays bounded), and resets on
    // every drop so re-entry must earn a fresh sustain window — no free re-pop.
    if (!overdrive) {
      if (speedNorm > OD_ENTER_N && boosting) overdriveArm = Math.min(OD_ARM, overdriveArm + dt);
      else overdriveArm = Math.max(0, overdriveArm - dt * 2);
      if (overdriveArm >= OD_ARM) {
        overdrive = true;
        showStamp(1, { jp: 'オーバードライブ', word: 'OVERDRIVE', cls: 't3' }, 0);
        inkSlap(0.1);
        if (!RM) fovKick = Math.min(9, fovKick + 3);
      }
    } else if (speedNorm < OD_EXIT_N || boostMeter <= 0) {
      overdrive = false;
      overdriveArm = 0;
    }
    if (overdrive) overdriveTime += dt;

    // slingshot burst decays over its window — eased (f·(2−f) holds the peak
    // early, tapers late) so the burst melts away instead of sagging
    if (slingTimer > 0) slingTimer = Math.max(0, slingTimer - dt);
    const sf = slingTimer / SLING_TIME;
    const slingMult = slingTimer > 0 ? 1 + (SLING_MULT - 1) * sf * (2 - sf) : 1;

    // the speed the systems ASK for… (a smaller ride tops out lower, and the
    // median hatching scrubs you right down — camping it costs real pace)
    const speedTarget = baseSpeed * (fever ? 1.12 : 1) * (boosting ? 1.42 : 1) *
            (1 + 0.05 * draftCharge) * slingMult * (overdrive ? OD_SPEED : 1) *
            (RIDE_TOP[player.vehicle] || 1) * (1 - (1 - ZONE_SCRUB) * zoneOut);
    // …and the speed the car actually DOES. Asymmetric chase: surges arrive
    // fast (feels responsive) but decay is slow (never the sudden "why am I
    // slowing down" jolt after a pass — the user's exact complaint).
    const chase = speedTarget > speed ? 5.5 : 1.6;
    speed += (speedTarget - speed) * (1 - Math.exp(-chase * dt));
    speedNorm = Math.max(0, Math.min(1, (speed - V0) / (VMAX - V0)));
    topSpeed = Math.max(topSpeed, speed * KMH);

    const sm = Math.min(SCORE_MULT_CAP, (fever ? 2 : 1) * (boosting ? 1.5 : 1) * (overdrive ? OD_SCORE : 1));
    score += speed * dt * sm;
    dist += speed * dt;
    if (fever) feverTime += dt;

    // turning points arrive on their own schedule
    if (!curveActive) {
      curveTimer -= dt;
      if (curveTimer <= 0) startCurve();
    }
    rampTimer -= dt;
    if (rampTimer <= 0) { spawnRamp(); rampTimer = 24 + Math.random() * 16; }
    crateTimer -= dt;
    if (crateTimer <= 0) { spawnCrate(); crateTimer = 10 + Math.random() * 8; }

    // police pursuit cadence — a second patrol joins the hunt on the high tiers
    const maxChasers = tier >= 2 ? 2 : 1;
    const liveChasers = chasers.reduce((n, c) => n + (c.live && !c.dead ? 1 : 0), 0);
    chaserTimer -= dt;
    if (chaserTimer <= 0) {
      if (liveChasers < maxChasers) { spawnChaser(); chaserTimer = CH_GAP_MIN + Math.random() * CH_GAP_RND; }
      else chaserTimer = 3;   // hunt at capacity — retry shortly
    }

    // distraction bait slides in on its own rhythm
    distractTimer -= dt;
    if (distractTimer <= 0) { spawnDistractCard(); distractTimer = 5 + Math.random() * 6; }

    // tier ladder
    for (let i = TIER_AT.length - 1; i > tier; i--) {
      if (baseSpeed >= TIER_AT[i]) { setTier(i); break; }
    }

    // combo decay: the printed wake de-inks behind you
    if (combo > 1) {
      comboTimer -= dt;
      const frac = Math.max(0, comboTimer / DECAY);
      const top = el.comboStack.lastChild;
      if (top) top.style.transform = 'scaleX(' + frac.toFixed(3) + ')';
      if (lastStampMesh && lastStampMesh.userData.live) {
        lastStampMesh.material.opacity = 0.2 + 0.72 * frac;
      }
      if (comboTimer < 1 && comboTimer > 0) audio.warnTick();
      if (comboTimer <= 0) breakCombo();
    }

    checkMilestones();

    // spawner
    const density = 0.35 + speedNorm * 0.65;
    spawnTimer -= dt * (fever ? 1.3 : 1);
    if (spawnTimer <= 0) {
      trySpawn();
      spawnTimer = (1.7 - density * 1.05) * (0.75 + Math.random() * 0.5);
      if (Math.abs(curveK.v) > CORNER_MIN) spawnTimer *= 1.4;   // thin traffic through hard corners
    }

    // HUD throttles
    if (now - hudScoreAt > 0.08) { hudScoreAt = now; syncScore(); }
    if (now - hudSpeedAt > 0.12) {
      hudSpeedAt = now;
      el.speedNum.textContent = Math.round(speed * KMH);
      el.boostFill.style.transform = 'scaleX(' + (boostMeter / 100).toFixed(3) + ')';
      el.draftCharge.style.transform = 'scaleX(' + draftCharge.toFixed(3) + ')';
      el.overdriveTag.style.opacity = overdrive ? '1' : '0';
      if (!RM) {
        const inten = Math.max(0, Math.min(1, speedNorm * 0.6 + (boosting ? 0.3 : 0) + (overdrive ? 0.4 : 0)));
        el.speedLines.style.opacity = speedNorm > 0.30 ? (inten * 0.5).toFixed(3) : '0';
        el.speedLines.style.transform = 'scale(' + (1 + inten * 0.14).toFixed(3) + ')';
      }
      // night vignette deepens with speed — frames the road, smooths the edges
      el.vignette.style.opacity = (0.16 + speedNorm * 0.36).toFixed(3);
    }

    audio.setDrive(speedNorm, vx / STEER_VMAX, tier, boosting ? 1 : 0);
  }

  /* ---------- the un-laned middle: a crossing, never a lane ----------
     Between zoneR (past your own left lane's reach) and zoneL (not yet in the
     oncoming lane's reach) there is no traffic at all — the median hatching and
     the two shoulders either side of it. Crossing takes ~0.4s at full lock, so
     ZONE_GRACE never touches a genuine carriageway switch; sit there longer and
     the rumble strip takes over: it bleeds speed, shoves you back onto whichever
     road is nearer, and the patrol car that was still minutes away comes now. */
  function updateKeepClear(dt, p) {
    const inZone = state === 'run' && !airborne && p.x > zoneL && p.x < zoneR;
    if (inZone) zoneTime += dt;
    else zoneTime = Math.max(0, zoneTime - dt * 3);

    zoneOut = Math.max(0, Math.min(1, (zoneTime - ZONE_GRACE) / ZONE_RAMP));
    if (zoneOut > 0) {
      // eject toward the nearer carriageway — a shove that out-muscles full lock
      const dir = (zoneR - p.x) < (p.x - zoneL) ? 1 : -1;
      p.x += dir * ZONE_PUSH * zoneOut * dt;
      if (Math.sign(vx) === -dir) vx *= Math.max(0, 1 - 4 * dt);   // fight the throttle-in
      if (chaserTimer > 1.5) chaserTimer = 1.5;                     // camping the median calls it in
    }
    showKeepClear(inZone && zoneTime > ZONE_GRACE * 0.45);
  }

  function showKeepClear(on) {
    if (!el.keepClear || on === keepClearShown) return;
    keepClearShown = on;
    gsap.killTweensOf(el.keepClear);
    gsap.to(el.keepClear, { opacity: on ? 1 : 0, duration: on ? 0.18 : 0.3, ease: 'power2.out' });
  }

  function updatePlayer(dt, raw) {
    const steer = (steerR ? 1 : 0) - (steerL ? 1 : 0) || touchSteer;
    const steerSign = Math.sign(steer);
    const p = player.group.position;

    // drift: rear steps out, lateral authority jumps, the road gets inked (ground only)
    drifting = driftHeld && state === 'run' && !airborne &&
      (steer !== 0 || Math.abs(vx) > 5);
    if (drifting && !wasDrifting) audio.tyreChirp();   // the bark as rubber lets go
    wasDrifting = drifting;
    // drifting INTO a live corner is the cornering skill — grip + apex ink
    apexDrift = drifting && Math.abs(curveK.v) > CORNER_MIN && steerSign === Math.sign(curveK.v);

    // fumbled landing = a beat of lost steering. scale the TARGET (dt-invariant,
    // true 35% authority) — multiplying vx each frame would compound to ~6%.
    const target = steer * STEER_VMAX * (drifting ? 1.65 : 1) * (airborne ? AIR_STEER : 1) *
      (wipeoutTimer > 0 ? BOTCH_STEER : 1);
    vx += (target - vx) * (1 - Math.exp(-(drifting ? 5.2 : 7) * dt));

    // centrifugal push: a corner shoves you toward the outside wall. capped BELOW drift
    // authority (26.4) so a committed drift can always hook the line back inside.
    let cf = curveK.v * speed * speed * CF_K;
    cf = Math.max(-CF_MAX, Math.min(CF_MAX, cf));
    cf *= RIDE_CF[player.vehicle] || 1;         // a lighter ride gets pushed wider
    if (airborne) cf *= CF_AIR;                 // don't shove landings around
    if (apexDrift) cf *= (1 - GRIP_CANCEL);     // drift grip cancels most of the push
    p.x -= cf * dt;                             // BEFORE the clamp: the wall always catches first

    p.x += vx * dt;
    updateKeepClear(dt, p);
    if (p.x > xWallR) { p.x = xWallR; vx = Math.min(0, vx); }
    if (p.x < xWallL) { p.x = xWallL; vx = Math.max(0, vx); }

    if (airborne) {
      // in the air the SAME keys become trick controls — continuous rotation you "fly"
      p.y += vyAir * dt;
      vyAir -= 20 * dt;
      airTime += dt;
      if (steerSign) { rollAngle += ROLL_RATE * steerSign * dt; lastTrickSpin = steerSign; }
      if (wantBoost) flipAngle += FLIP_RATE * dt;                 // ↑ = flip (no boost aloft)
      if (driftHeld) spinAngle += SPIN_RATE * (lastTrickSpin || 1) * dt;
      player.group.rotation.set(flipAngle, spinAngle, rollAngle); // air OWNS all three axes
      // live trick readout
      const rc = fullTurns(rollAngle), fc = fullTurns(flipAngle), sc = fullTurns(spinAngle);
      let lbl = '';
      if (rc) lbl += 'ロール×' + rc + ' ';
      if (fc) lbl += 'フリップ×' + fc + ' ';
      if (sc) lbl += 'スピン×' + sc + ' ';
      el.airTrick.textContent = lbl || 'エア';
      el.airTrick.style.opacity = 1;
      if (p.y <= 0 && vyAir < 0) land();
    } else {
      landGrace = Math.max(0, landGrace - dt);
      if (wipeoutTimer > 0) wipeoutTimer -= dt;
      player.group.rotation.x += (0 - player.group.rotation.x) * (1 - Math.exp(-8 * dt));
      p.y = Math.sin(clockT * 52) * 0.004 * (0.4 + speedNorm);

      // body language: in a slide the tail steps out and the nose COUNTER-STEERS
      // (points into the flick, opposite the way the car is sliding) — the classic
      // drift pose — while a corner points the whole car into the bend.
      let yaw = -vx * (drifting ? 0.052 : 0.012) - curveK.v * PLYR_YAW_K;
      if (drifting) yaw += steerSign * 0.22;   // counter-steer flick: nose leads the drift
      yaw = Math.max(-0.68, Math.min(0.68, yaw));
      const yawEase = drifting ? 12 : 9;       // the slide breaks fast, settles slow
      player.group.rotation.y += (yaw - player.group.rotation.y) * (1 - Math.exp(-yawEase * dt));
      const bank = -vx * (drifting ? 0.03 : 0.021);
      player.group.rotation.z += (bank - player.group.rotation.z) * (1 - Math.exp(-9 * dt));
    }

    // skid ink + drift ledger (ground)
    if (drifting && Math.abs(vx) > 6) {
      driftTime += dt;
      driftPts += speed * dt * 2;
      skidTimer -= dt;
      if (skidTimer <= 0) {
        skidTimer = 0.055;
        const y = player.group.rotation.y;
        world.dropSkid(p.x - 0.8, 2.0, y);
        world.dropSkid(p.x + 0.8, 2.0, y);
      }
      audio.setDrift(Math.min(1, Math.abs(vx) / 22));
      el.driftLive.style.opacity = 1;
      el.driftLivePts.textContent = '+' + Math.floor(driftPts);
    } else {
      if (driftTime > 0) endDrift();
      audio.setDrift(0);
    }

    // the armed shield breathes around the car
    if (shieldOn) {
      aura.rotation.y += dt * 1.6;
      const as = 1 + Math.sin(clockT * 5) * 0.05;
      aura.scale.set(as, 1, as);
    }

    // apex ink accrues while you hold the drift through a corner
    if (apexDrift) {
      cornerApex += speed * dt * (Math.abs(curveK.v) / 1e-4) * APEX_K;
      el.apexLive.style.opacity = 1;
      el.apexLivePts.textContent = Math.floor(cornerApex);
    } else {
      el.apexLive.style.opacity = 0;
    }
  }

  function updateTraffic(dt) {
    const px = player.group.position.x;
    draftedThisFrame = false;
    for (let i = active.length - 1; i >= 0; i--) {
      const c = active[i];
      c.isDraft = false;
      c.z += (speed - c.speed) * dt;
      c.group.position.z = c.z;
      c.group.position.x = c.lx + world.bendX(c.z);

      // blasted / shield-shoved cars are ghosts: they spin off and interact with nothing
      if (c.dead) {
        if (c.z > world.KILL_Z) { releaseCar(c); active.splice(i, 1); }
        continue;
      }

      tryLaneChange(c, dt);

      // danger telegraph: taillights bloom when you share a lane path
      const conflict = c.z > -95 && c.z < -6 && Math.abs(c.lx - px) < 1.7;
      const targetGlow = conflict ? 3.2 : 1.4;
      c.baseTail += (targetGlow - c.baseTail) * (1 - Math.exp(-6 * dt));
      c.tail.bar.material.emissiveIntensity = c.baseTail;
      if (!c.changing) c.tail.glow.material.opacity = 0.4 + (c.baseTail - 1.4) * 0.2;

      const halfLsum = c.halfL + player.halfL;
      const halfWsum = c.halfW + player.halfW;
      const dx = Math.abs(c.lx - px);
      const dz = Math.abs(c.z);

      // slipstream pocket: tucked close behind a car you're catching, not yet passed
      const gapAhead = -c.z;
      if (!c.passed && c.z < 0 && gapAhead > DRAFT_ZMIN && gapAhead < DRAFT_ZMAX &&
          dx < DRAFT_LATERAL && speed > c.speed) {
        c.isDraft = true;
        draftedThisFrame = true;
        if (draftCharge >= SLING_MIN) c.drafted = true;   // armed — passing it fires a slingshot
      }

      // track the tightest lateral gap through the overlap window (grounded only)
      if (dz < halfLsum + 2.5 && !airborne) {
        c.minGap = Math.min(c.minGap, dx - halfWsum);
      }

      // the inhale before the tightest passes
      if (!c.passed && !c.swelled && c.z < 0 && !airborne) {
        const rel = speed - c.speed;
        if (rel > 1) {
          const tta = (-c.z - halfLsum) / rel;
          if (tta > 0 && tta < 0.3 && dx - halfWsum < 0.55) {
            c.swelled = true;
            audio.swell();
          }
        }
      }

      // collision (0.88/0.86 forgiveness; airborne cars fly clean over traffic).
      // An armed shield eats the crash once and shoves the car off the road.
      if (state === 'run' && !airborne && landGrace <= 0 &&
          dx < halfWsum * 0.88 && dz < halfLsum * 0.86) {
        if (shieldOn) { shieldSave(c); continue; }
        crash(c);
        return;
      }

      // fully passed → judge the pass
      if (!c.passed && c.z - c.halfL > player.halfL) {
        c.passed = true;
        if (c.minGap > 0) award(c);
      }

      if (c.z > world.KILL_Z) {
        releaseCar(c);
        active.splice(i, 1);
      }
    }

    // charge the draft while tucked in; bleed it out once you leave the pocket
    if (draftedThisFrame) draftCharge = Math.min(1, draftCharge + dt / DRAFT_FULL);
    else draftCharge = Math.max(0, draftCharge - dt / DRAFT_DECAY);
  }

  /* a head-on hit deflects the oncoming car via its logical x (the per-frame
     x-assignment below reads o.lx, so tweening the mesh directly wouldn't hold) */
  function shieldSaveOncoming(o) {
    shieldOn = false;
    aura.visible = false;
    syncAmmo();
    landGrace = SHIELD_GRACE;
    o.passed = true;
    const dir = Math.sign(o.lx - player.group.position.x) || -1;
    gsap.killTweensOf(o);
    gsap.to(o, { lx: o.lx + dir * 6, duration: 0.8, ease: 'power2.in' });
    gsap.to(o.g.rotation, { y: dir * 2.6, duration: 0.8, ease: 'power1.in' });
    showStamp(dir, { jp: 'バリア', word: 'SHIELD SAVED', cls: 't3' }, 0);
    world.stampRoad('バリア', player.group.position.x, 2.5, { jp: true, width: 5 });
    audio.shieldSave();
    inkSlap(0.16);
    if (!RM) fovKick = Math.min(9, fovKick + 4);
  }

  function updateOncoming(dt) {
    const px = player.group.position.x;
    const live = state === 'run' && !airborne;
    const halfWsum = ONCOMING_HW + player.halfW;
    const halfLsum = ONCOMING_HL + player.halfL;
    for (const o of oncoming) {
      o.prevZ = o.g.position.z;
      o.g.position.z += (speed + o.speed) * dt;      // closing speed = ours + theirs
      const z = o.g.position.z;
      o.g.position.x = o.lx + world.bendX(z);

      if (!o.played && z > 4) {
        o.played = true;
        if (state === 'run') audio.passby(-0.75);
      }

      if (live) {
        const dx = Math.abs(o.lx - px);
        // track the tightest lateral gap while it's level with the player
        if (Math.abs(z) < halfLsum + 2.5) o.minGap = Math.min(o.minGap, dx - halfWsum);

        // swept collision: at head-on closing speed a car jumps several units
        // per frame, so test the whole segment it covered against the player band
        const lo = Math.min(o.prevZ, z), hi = Math.max(o.prevZ, z);
        if (landGrace <= 0 && dx < halfWsum * 0.9 && lo < halfLsum && hi > -halfLsum) {
          if (shieldOn) { shieldSaveOncoming(o); }
          else { crash({ group: o.g }); return; }
        }

        // fully passed behind the player → judge the head-on shave
        if (!o.passed && o.prevZ < halfLsum && z >= halfLsum) {
          o.passed = true;
          if (o.minGap > 0) awardOncoming(o);
        }
      }

      if (z > world.KILL_Z + 8) resetOncoming(o);
    }

    onOtherRoad = px < CENTER_X;
  }

  /* ---------- police chasers ---------- */
  function releaseChaser(ch) {
    ch.live = false;
    ch.dead = false;
    ch.group.visible = false;
    gsap.killTweensOf(ch.group.rotation);
    gsap.killTweensOf(ch.group.position);
    ch.group.rotation.set(0, 0, 0);
  }

  function showPursuitBanner() {
    if (!el.pursuit || pursuitShown) return;
    pursuitShown = true;
    gsap.killTweensOf(el.pursuit);
    gsap.fromTo(el.pursuit,
      { opacity: 0, scale: 1.3, xPercent: -50 },
      { opacity: 1, scale: 1, xPercent: -50, duration: 0.4, ease: 'back.out(2)' });
  }
  function hidePursuitBanner() {
    if (!el.pursuit || !pursuitShown) return;
    pursuitShown = false;
    gsap.killTweensOf(el.pursuit);
    gsap.to(el.pursuit, { opacity: 0, duration: 0.4, ease: 'power2.in' });
  }

  // edge warning telling the player which side an off-camera patrol car is closing from
  function showChaseWarn(side) {
    if (!el.chaseWarn || side === cwSide) return;
    cwSide = side;
    el.chaseWarn.classList.toggle('from-left', side < 0);
    el.chaseWarn.classList.toggle('from-right', side > 0);
    gsap.killTweensOf(el.chaseWarn);
    gsap.to(el.chaseWarn, { opacity: 1, duration: 0.2, ease: 'power2.out' });
  }
  function hideChaseWarn() {
    if (!el.chaseWarn || cwSide === 0) return;
    cwSide = 0;
    gsap.killTweensOf(el.chaseWarn);
    gsap.to(el.chaseWarn, { opacity: 0, duration: 0.3, ease: 'power2.in' });
  }

  function spawnChaser() {
    const ch = chasers.find((c) => !c.live);
    if (!ch) return;
    ch.live = true;
    ch.dead = false;
    ch.age = 0;
    // pick a side to come from, hugging the far edge of it if the player's already at the rail
    ch.side = player.group.position.x > CENTER_X ? -1 : (Math.random() < 0.5 ? -1 : 1);
    ch.x = player.group.position.x + ch.side * CH_SPAWN_OFF;
    ch.z = CH_SPAWN_Z + Math.random() * 6;
    ch.lit = Math.random() * 6;
    ch.mode = 'close';   // close → hold (pace) → lunge (the only rammer) → close …
    ch.lungeT = 0;       // countdown to the next lunge while pacing
    ch.locked = false;   // true during the tell: aim frozen at ch.aimX, lights flaring
    ch.aimX = ch.x;      // the x the lunge is committed to (stale if you juke away)
    ch.group.rotation.set(0, 0, 0);
    ch.group.position.set(ch.x, 0, ch.z);
    ch.group.visible = true;
    audio.siren(ch.side * 0.4);
    showPursuitBanner();
    showStamp(-1, { jp: '警察', word: 'PURSUIT', cls: 't3' }, 0);
  }

  // a chaser leaves the hunt — shot out, or shaken off. spins it toward the edge.
  function retireChaser(ch, pts, jp, word, cls) {
    ch.dead = true;
    if (pts) score += pts;
    const side = Math.sign(ch.x - player.group.position.x) || 1;
    showStamp(side, { jp, word, cls: cls || 't2' }, pts || 0);
    gsap.killTweensOf(ch.group.rotation);
    gsap.to(ch.group.rotation, { y: side * 3, duration: 1.0, ease: 'power1.in' });
    inkSlap(0.1);
  }

  function updateChasers(dt) {
    const px = player.group.position.x;
    let anyClose = false;
    for (const ch of chasers) {
      if (!ch.live) continue;

      if (ch.dead) {
        // wrecked / shaken: drift back off-screen, then recycle
        ch.z += (40 + speed * 0.3) * dt;
        ch.group.position.set(ch.x + world.bendX(ch.z), 0, ch.z);
        if (ch.z > world.KILL_Z + 6) releaseChaser(ch);
        continue;
      }

      // strobing light bar — red/blue out of phase
      ch.lit += dt * 9;
      const s = Math.sin(ch.lit);
      ch.red.glow.material.opacity = s > 0 ? 0.95 : 0.14;
      ch.blue.glow.material.opacity = s > 0 ? 0.14 : 0.95;
      ch.red.lamp.scale.setScalar(s > 0 ? 1.3 : 0.8);
      ch.blue.lamp.scale.setScalar(s > 0 ? 0.8 : 1.3);
      if (ch.locked) {   // the tell: both beacons flare hot and steady — a lunge is coming
        ch.red.glow.material.opacity = 1; ch.blue.glow.material.opacity = 1;
        ch.red.lamp.scale.setScalar(1.55); ch.blue.lamp.scale.setScalar(1.55);
      }

      ch.age += dt;
      const warning = ch.age < CH_WARN_TIME;

      // shaken off — out-ran it, or it called the chase off after its window
      if (ch.z > CH_ESCAPE_Z || ch.age > CH_DURATION) {
        tailsLost++;
        retireChaser(ch, CH_ESCAPE_PTS, 'まいた', 'TAIL LOST', 't3');
        world.stampRoad('まいた', px, 2.5, { jp: true, width: 5 });
        audio.chime();
        continue;
      }

      if (ch.mode === 'lunge') {
        // committed dart: aim FROZEN at ch.aimX (juke earlier already decided this),
        // drives hard toward your bumper line and brief-overlaps — the only rammer
        ch.z -= CH_LUNGE_SPEED * dt;
        ch.x += (ch.aimX - ch.x) * (1 - Math.exp(-CH_HOLD_HOME * dt));
        ch.lungeT -= dt;
        if (ch.lungeT <= 0 || ch.z < -(player.halfL + player.halfW)) {
          ch.mode = 'close'; ch.locked = false;   // whiffed / spent — re-establish the pace
        }
      } else {
        // closing / pacing: home on your x, ease to the pace point, NEVER rams.
        // during the tell the aim is locked to ch.aimX so a juke actually breaks it.
        const aim = ch.locked ? ch.aimX : px;
        const homeRate = warning ? CH_HOME_RATE * CH_WARN_HOME
                       : ch.locked ? 0.0
                       : ch.mode === 'hold' ? CH_HOLD_HOME : CH_HOME_RATE;
        ch.x += (aim - ch.x) * (1 - Math.exp(-homeRate * dt));

        // z: close toward the pace point, then settle and shadow you there
        let approach = CH_BASE_CLOSE - speedNorm * CH_SPEED_FACTOR;
        if (warning) approach *= CH_WARN_CLOSE;
        if (ch.z - approach * dt <= CH_HOLD_Z) {
          ch.z += (CH_HOLD_Z - ch.z) * (1 - Math.exp(-6 * dt));   // ease onto the pace point
          if (ch.mode !== 'hold') { ch.mode = 'hold'; ch.lungeT = CH_LUNGE_GAP + Math.random() * CH_LUNGE_GAP_RND; }
        } else {
          ch.z -= approach * dt;
        }

        // pacing on your bumper → wind up a lunge. tell first (aim locks + flare),
        // then commit. only fires when it's genuinely behind you, not mid-whiff.
        if (ch.mode === 'hold' && !warning && ch.z > CH_HOLD_Z - 1.2) {
          ch.lungeT -= dt;
          if (!ch.locked && ch.lungeT <= CH_LUNGE_TELE) {
            ch.locked = true; ch.aimX = px;                       // LOCK — juke now to dodge
            audio.siren(Math.sign(ch.x - px) * 0.4 || 0.4);
          }
          if (ch.lungeT <= 0) { ch.mode = 'lunge'; ch.locked = false; ch.lungeT = CH_LUNGE_TIME; }
        }
      }

      ch.group.position.set(ch.x + world.bendX(ch.z), 0, ch.z);
      ch.group.rotation.y = -(px - ch.x) * 0.05;   // nose tracks toward your lane
      if (ch.z < 20) anyClose = true;

      // the shunt: ONLY a committed lunge connects (shield eats it once)
      const halfWsum = ch.halfW + player.halfW;
      const halfLsum = ch.halfL + player.halfL;
      if (ch.mode === 'lunge' && state === 'run' && !airborne && landGrace <= 0 &&
          Math.abs(ch.x - px) < halfWsum * 0.9 &&
          ch.z < halfLsum + CH_RAM_Z && ch.z > -(halfLsum + CH_RAM_Z)) {
        if (shieldOn) {
          shieldOn = false;
          aura.visible = false;
          syncAmmo();
          landGrace = SHIELD_GRACE;
          retireChaser(ch, 0, 'バリア', 'SHIELD SAVED', 't3');
          audio.shieldSave();
        } else {
          crash({ group: ch.group });
        }
        return;   // state changed / shield handled — bail this frame
      }
    }

    // siren wail while a patrol car is on your bumper
    if (anyClose) {
      sirenTimer -= dt;
      if (sirenTimer <= 0) {
        sirenTimer = 1.1;
        const near = chasers.find((c) => c.live && !c.dead && c.z < 20);
        if (near) audio.siren(Math.sign(near.x - px) * 0.4);
      }
    }

    // edge warning: point to the nearest patrol car still lurking behind the camera.
    // once it draws alongside (z drops below the see line) the player can see it — drop the arrow.
    let warnCh = null;
    for (const c of chasers) {
      if (!c.live || c.dead || c.z <= CH_WARN_SEE_Z) continue;
      if (!warnCh || c.z < warnCh.z) warnCh = c;
    }
    if (warnCh) showChaseWarn(Math.sign(warnCh.x - px) || warnCh.side || -1);
    else hideChaseWarn();

    // pull the banner down once no patrol car is actively hunting
    if (!chasers.some((c) => c.live && !c.dead)) hidePursuitBanner();
  }

  function updateWreck(dt) {
    for (const w of wreckPieces) {
      w.vel.y -= 22 * dt;
      w.obj.position.addScaledVector(w.vel, dt);
      if (w.obj.position.y < 0.2) { w.obj.position.y = 0.2; w.vel.y *= -0.35; w.vel.x *= 0.8; w.vel.z *= 0.8; }
      w.obj.rotation.x += w.ang.x * dt;
      w.obj.rotation.y += w.ang.y * dt;
      w.obj.rotation.z += w.ang.z * dt;
    }
  }

  function updateCamera(raw) {
    const px = player.group.position.x;
    // ride the camera across to whichever carriageway the car is on. camRoadShift
    // eases 0→1 the instant you cross the divider, so the whole view slides over
    // to the far road and settles centred on it — a visible "switch", not a drift.
    const wantShift = (state === 'run' || state === 'starting') && px < CENTER_X ? 1 : 0;
    camRoadShift += (wantShift - camRoadShift) * (1 - Math.exp(-3.2 * raw));
    camShiftX = camRoadShift * OTHER_CENTER;
    // translate the follow target by the shift: on the near road it's px*0.55 as
    // before; on the far road it re-centres about OTHER_CENTER with the same lead
    const camXTarget = camShiftX * 0.45 + px * 0.55;
    camX += (camXTarget - camX) * (1 - Math.exp(-4.5 * raw));

    if (state === 'intro') {
      camera.position.copy(introPose.pos);
      camera.position.y += Math.sin(clockT * 0.7) * 0.06;
      camera.lookAt(introPose.look);
      camera.fov = introPose.fov;
    } else if (state === 'starting') {
      chasePose(_pos, _look);
      camera.position.lerpVectors(introPose.pos, _pos, camTrans.t);
      _look.lerpVectors(introPose.look, _look, camTrans.t);
      camera.lookAt(_look);
      camera.fov = introPose.fov + (62 + 26 * speedNorm - introPose.fov) * camTrans.t;
    } else if (state === 'crash' || state === 'results') {
      const a = orbitProxy.a;
      const r = 13 - a * 2.5;
      camera.position.set(
        crashPos.x + Math.sin(a) * r,
        5.4 + a * 1.6,
        crashPos.z + Math.cos(a) * r
      );
      camera.lookAt(crashPos.x, 0.7, crashPos.z);
      camera.fov = 58;
    } else {
      chasePose(_pos, _look);
      camera.position.copy(_pos);
      camera.lookAt(_look);
      if (!RM) {
        // swing the whole view INTO the bend — this is what makes a corner read as a turn
        const yawTarget = Math.max(-CAM_YAW_MAX, Math.min(CAM_YAW_MAX,
          -curveK.v * CAM_YAW_K * (0.7 + 0.5 * speedNorm)));
        camYaw += (yawTarget - camYaw) * (1 - Math.exp(-6 * raw));
        camera.rotation.y += camYaw;
        // bank into the curve; lean a touch with the slide
        camera.rotation.z += -curveK.v * CAM_ROLL_K + (drifting ? -vx * 0.0011 : 0);
      }
      fovKick = Math.max(0, fovKick - raw * 9);
      boostFov += ((boosting ? 9 : 0) - boostFov) * (1 - Math.exp(-6 * raw));
      camera.fov = 62 + 26 * speedNorm + fovKick + boostFov;
    }
    camera.updateProjectionMatrix();
  }

  /* streetlight pools breathe on the intro screen */
  function updateAmbient(raw) {
    if (state !== 'intro') return;
    for (let i = 0; i < world.lampPools.length; i++) {
      const l = world.lampPools[i];
      const b = 0.5 + Math.sin(clockT * 1.4 + i * 1.7) * 0.12;
      l.pool.material.opacity = b;
    }
  }

  /* ---------- main loop ---------- */
  let last = performance.now();
  function frame(nowMs) {
    requestAnimationFrame(frame);
    const raw = Math.min((nowMs - last) / 1000, 1 / 30);
    last = nowMs;
    // touch controls only exist while actually driving — hides them under the
    // intro/crash/results screens (which don't full-screen-cover on wide tablets)
    document.body.classList.toggle('playing', state === 'run' || state === 'starting');
    // the results poster owns the whole screen on a phone — the settings chips
    // must get out of its way rather than float over RUN IT BACK
    document.body.classList.toggle('scored', state === 'crash' || state === 'results');
    // on the intro poster HOW TO PLAY / MUSIC / SOUND are the only chips that
    // mean anything — and they were buried under the poster, so a touch player
    // could never read the controls before their first run
    document.body.classList.toggle('intro', state === 'intro' || state === 'boot');
    if (paused || helpOpen) { renderer.render(scene, camera); return; }

    const dt = raw * ts.v;
    clockT += raw;
    const now = nowMs / 1000;

    world.curveK = curveK.v;

    if (state === 'run') {
      updateRun(dt, raw, now);
      updatePlayer(dt, raw);
      updateTraffic(dt);
      updateRamps(dt);
      updateShots(dt);
      updateCrates(dt);
      updateChasers(dt);
    } else if (state === 'starting') {
      updatePlayer(dt, raw);
      for (const c of active) {
        c.z += (speed - c.speed) * dt;
        c.group.position.z = c.z;
      }
    } else if (state === 'crash') {
      updateWreck(dt);
      for (let i = active.length - 1; i >= 0; i--) {
        const c = active[i];
        c.z += (speed - c.speed) * dt;
        c.group.position.z = c.z;
      }
      updateShots(dt);    // both guard their run-only interactions internally —
      updateCrates(dt);   // props keep scrolling instead of freezing mid-road
    }

    if (state !== 'boot' && state !== 'intro') {
      world.scroll(speed * dt, dt);
      updateOncoming(dt);
      world.distractOn = state === 'run' && !paused && !helpOpen;
      world.updateDistractors(raw, clockT);   // real-time strobe, independent of hitstop
    }

    updateAmbient(raw);
    world.twinkle(clockT);
    updateCamera(raw);
    renderer.render(scene, camera);
  }

  /* ---------- boot: wait for the inks (fonts), then print ---------- */
  const fontProbe = [
    "120px 'Anton'", "700 40px 'Saira Condensed'",
    "600 16px 'Barlow'", "900 40px 'Noto Sans JP'",
  ];
  function boot() {
    if (state !== 'boot') return;
    state = 'intro';
    gsap.set(el.results, { y: 0, yPercent: 102 });   // clear the parsed CSS px offset
    if (window.matchMedia && matchMedia('(pointer: coarse)').matches) {
      $('#start-keys').textContent = 'hold to drive · ◀ ▶ steer · 加速 boost · DRIFT · FIRE · tap ? for how to play';
    }
    // paint everything that needs type (fonts are ready now)
    player.paintLivery(1, false);
    world.kmPosts.forEach((m) => world.paintKmPost(m, ((dist + Math.abs(m.position.z)) * KM).toFixed(1)));
    world.gantries.forEach((g, i) => world.paintGantry(g,
      i === 0 ? 'NEAR-MISS DRIVING CLUB' : 'EXIT: NEVER',
      i === 0 ? 'MEMBERS ONLY — HOLD TO ENTER' : null));
    introChoreography();
    requestAnimationFrame(frame);
  }
  Promise.all(fontProbe.map((f) => document.fonts.load(f, 'ヒヤリ0123 HIYA')))
    .then(() => document.fonts.ready)
    .then(boot)
    .catch(boot);
  setTimeout(boot, 3000);   // never strand the player on a blank page

  /* read-only probe + dev-only visual triggers for tests/tooling */
  window.__HY = {
    testStamp: (t) => {
      const def = NEAR_TIERS[t || 0];
      showStamp(Math.random() < 0.5 ? -1 : 1, def, 600);
      world.stampRoad(def.jp, player.group.position.x, 2.5, { jp: true, width: 3.2 + def.mult * 1.6 });
      inkSlap(0.1);
    },
    testFever: (on) => (on ? enterFever() : exitFever()),
    testCurve: (k) => { gsap.killTweensOf(curveK); gsap.to(curveK, { v: k, duration: 2 }); },
    testRamp: () => {
      const r = ramps.find((x) => !x.live);
      if (!r) return;
      r.live = true;
      r.lane = LANE_X.reduce((b, x, i) => (Math.abs(x - player.group.position.x) < Math.abs(LANE_X[b] - player.group.position.x) ? i : b), 0);
      r.z = -100;
      r.group.visible = true;
    },
    // goes through the same door the C key does, so the ride-width road limits
    // are always recomputed — never let a test park a bicycle outside its band
    setVehicle: (i) => { const n = player.setVehicle(i); refreshRideLimits(); syncVehicleBtn(); return n; },
    spawnChaser: () => { chaserTimer = 0; spawnChaser(); },
    // drop the player on an exact x with no lateral momentum — lets a test park
    // on the median / the rail without steering into something on the way there
    park: (x) => { player.group.position.x = Math.max(xWallL, Math.min(xWallR, x)); vx = 0; },
    snap: () => ({
      state,
      vehicle: player.vehicleName,
      px: player.group.position.x,
      speed: Math.round(speed * 10) / 10,
      combo,
      nearMisses,
      headOns,
      onOtherRoad,
      halfW: player.halfW,
      wallR: Math.round(xWallR * 1000) / 1000,
      wallL: Math.round(xWallL * 1000) / 1000,
      zoneR: Math.round(zoneR * 1000) / 1000,
      zoneL: Math.round(zoneL * 1000) / 1000,
      zoneTime: Math.round(zoneTime * 100) / 100,
      zoneOut: Math.round(zoneOut * 100) / 100,
      camShiftX: Math.round(camShiftX * 100) / 100,
      score: Math.floor(score),
      boostMeter: Math.round(boostMeter),
      boosting,
      drifting,
      airborne,
      curve: curveK.v,
      curveHard,
      camYaw: Math.round(camYaw * 1000) / 1000,
      driftTotal: Math.floor(driftTotal),
      airTotal: Math.round(airTotal * 10) / 10,
      draftCharge: Math.round(draftCharge * 100) / 100,
      slingTimer: Math.round(slingTimer * 100) / 100,
      overdrive,
      overdriveTime: Math.round(overdriveTime * 10) / 10,
      apexDrift,
      cornerApex: Math.round(cornerApex),
      apexClears,
      slingshots,
      wipeoutTimer: Math.round(wipeoutTimer * 100) / 100,
      trick: { roll: rollAngle, flip: flipAngle, spin: spinAngle },
      bestTrick,
      ammo,
      shieldOn,
      cratesBroken,
      carsBlasted,
      chasersBusted,
      tailsLost,
      chasers: chasers.filter((c) => c.live).map((c) => ({
        x: Math.round(c.x * 100) / 100, z: Math.round(c.z * 10) / 10, dead: c.dead,
      })),
      crates: crates.filter((c) => c.live).map((c) => ({ lane: c.lane, z: Math.round(c.z) })),
      cars: active.map((c) => ({
        x: Math.round(c.group.position.x * 100) / 100,
        z: Math.round(c.z * 10) / 10,
        lane: c.lane,
        halfW: c.halfW,
        passed: c.passed,
      })),
    }),
  };
})();
