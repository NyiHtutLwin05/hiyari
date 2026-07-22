/* ============================================================
   HIYARI world — a Japanese expressway rebuilt as a poster.
   Everything procedural: primitives + canvas-painted textures.
   Flat Lambert/Basic inks, fog as the layering medium, and the
   road surface as the game's primary typographic canvas.
   ============================================================ */

(function () {
  'use strict';

  const THEME = {
    ink:    0x121417,
    green:  0x00704A,
    paper:  0xF2EFE5,
    shu:    0xE8380D,
    yellow: 0xF7B500,
    blue:   0x1D50C8,
    // speed-tier horizon plates
    tiers:  [0x00704A, 0x0A5C6E, 0x1D50C8, 0x3B2FA0],
    tierNames: ['ROUTE 1 — MEISHIN', 'ROUTE 2 — HANSHIN', 'ROUTE 3 — WANGAN', 'ROUTE 4 — MIDNIGHT'],
    treeInk: 0x0A3325,
    barrier: 0x0A3D2C,
    carWhite: 0xDAD7CC,
    carGrey:  0x8A8F98,
    carTeal:  0x0E4D42,
  };

  const LANE_X = [-6.75, -2.25, 2.25, 6.75];
  const ONCOMING_X = [-14.9, -19.4];
  const KILL_Z = 34;           // behind the camera → recycle
  const SPAWN_Z = -380;        // birth line, hidden inside fog

  const css = (hex) => '#' + hex.toString(16).padStart(6, '0');

  /* ---------- canvas texture helpers ---------- */

  function makeCanvas(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    return c;
  }

  function canvasTexture(c, maxAniso) {
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = maxAniso;
    return t;
  }

  /* ============================================================ */

  function createWorld(renderer, scene) {
    const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const W = {};

    /* ---------- lights ---------- */
    scene.add(new THREE.HemisphereLight(0xf2efe5, 0x14171a, 0.95));
    const sun = new THREE.DirectionalLight(0xfff2dd, 0.45);
    sun.position.set(-8, 16, 6);
    scene.add(sun);

    /* ---------- sky: two ink plates + printed moon ---------- */
    scene.background = new THREE.Color(THEME.ink);
    scene.fog = new THREE.Fog(THEME.green, 60, 340);

    // horizon band: an unfogged plate whose top edge soft-blends 4% into the zenith ink
    const bandCanvas = makeCanvas(8, 128, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.1, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,1)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
    const bandMat = new THREE.MeshBasicMaterial({
      map: canvasTexture(bandCanvas, 1),
      color: THEME.green,
      transparent: true,
      fog: false,
      depthWrite: false,
    });
    const band = new THREE.Mesh(new THREE.PlaneGeometry(1600, 190), bandMat);
    band.position.set(0, 33, -352);
    band.renderOrder = -2;
    scene.add(band);

    // printed halftone moon, low at ten o'clock
    const moonCanvas = makeCanvas(256, 256, () => {});
    const moonTex = canvasTexture(moonCanvas, 1);
    function paintMoon(feverHex) {
      const ctx = moonCanvas.getContext('2d');
      ctx.clearRect(0, 0, 256, 256);
      ctx.fillStyle = feverHex ? css(THEME.shu) : css(THEME.paper);
      const R = 118, step = 13, dot = 5.6;
      for (let y = step / 2; y < 256; y += step) {
        for (let x = step / 2; x < 256; x += step) {
          const dx = x - 128, dy = y - 128;
          if (dx * dx + dy * dy < R * R) {
            ctx.beginPath();
            ctx.arc(x, y, dot, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      moonTex.needsUpdate = true;
    }
    paintMoon(false);
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: moonTex, fog: false, depthWrite: false, transparent: true, opacity: 0.95,
    }));
    moon.position.set(-95, 62, -338);
    moon.scale.set(46, 46, 1);
    moon.renderOrder = -1;
    scene.add(moon);
    W.paintMoon = paintMoon;
    W.bandMat = bandMat;

    /* ---------- meme sky: friends' portraits drift across as an easter egg ----
       sources are inlined as base64 in the built file (window.HIYARI_MEME_SRCS)
       and fall back to the meme_image/ folder when running the dev index.html. */
    const MEME_SRCS = (typeof window !== 'undefined' && window.HIYARI_MEME_SRCS) ||
      ['meme_image/kmh.png', 'meme_image/wla.jpeg'];
    const memeLoader = new THREE.TextureLoader();
    const memes = [];
    // WebGL refuses to texture a file:// image (opaque origin → tainted), which
    // would throw at render time. The dist inlines them as data: URIs (always
    // safe); a raw folder path is only safe when served over http. So skip the
    // rest — the game just runs without the sky memes on a bare file:// dev open.
    for (let i = 0; i < MEME_SRCS.length; i++) {
      const src = MEME_SRCS[i];
      const safe = src.indexOf('data:') === 0 ||
        (typeof location === 'undefined' || location.protocol !== 'file:');
      if (!safe) continue;
      const mat = new THREE.SpriteMaterial({ fog: false, depthWrite: false, transparent: true, opacity: 0 });
      const spr = new THREE.Sprite(mat);
      spr.renderOrder = -1;
      spr.visible = false;
      scene.add(spr);
      const m = { spr, mat, phase: 'wait', t: 3 + i * 6, baseX: 0, baseY: 70, ar: 0.72 };
      memeLoader.load(
        src,
        (tex) => {
          if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
          mat.map = tex; mat.needsUpdate = true;
          if (tex.image && tex.image.height) m.ar = tex.image.width / tex.image.height;
        },
        undefined,
        () => { m.phase = 'dead'; spr.visible = false; }   // missing file → stay hidden
      );
      memes.push(m);
    }
    // fade a portrait up somewhere in the sky, hold, fade out, then wait — a loop
    W.updateMemes = function (dt, t) {
      for (const m of memes) {
        m.t -= dt;
        if (m.phase === 'wait') {
          if (m.t <= 0) {
            m.baseX = -170 + Math.random() * 340;
            m.baseY = 62 + Math.random() * 54;
            const h = 50 + Math.random() * 20;      // bigger, taller portraits
            m.spr.scale.set(h * m.ar, h, 1);
            m.spr.position.set(m.baseX, m.baseY, -333);
            m.spr.visible = true;
            m.phase = 'in'; m.t = 0.9;
          }
        } else if (m.phase === 'in') {
          m.mat.opacity = Math.min(0.9, m.mat.opacity + dt / 0.9);
          if (m.t <= 0) { m.phase = 'hold'; m.t = 4 + Math.random() * 3.5; m.mat.opacity = 0.9; }
        } else if (m.phase === 'hold') {
          if (m.t <= 0) { m.phase = 'out'; m.t = 0.9; }
        } else if (m.phase === 'out') {
          m.mat.opacity = Math.max(0, m.mat.opacity - dt / 0.9);
          if (m.t <= 0) { m.phase = 'wait'; m.t = 8 + Math.random() * 11; m.spr.visible = false; m.mat.opacity = 0; }
        }
        if (m.spr.visible) {
          m.spr.position.x = m.baseX + Math.sin(t * 0.4 + m.baseY) * 3.5;
          m.spr.position.y = m.baseY + Math.sin(t * 0.7) * 1.8;
        }
      }
    };

    /* ---------- starfield: two clouds twinkling out of phase ----------
       Screen-space point sizes (no attenuation) so they stay pin-sharp;
       fog:false keeps them burning through the horizon haze. */
    function starCloud(n, size, opacity) {
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        pos[i * 3]     = (Math.random() - 0.5) * 1000;
        pos[i * 3 + 1] = 34 + Math.random() * 130;
        pos[i * 3 + 2] = -344 - Math.random() * 8;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        color: THEME.paper, size, sizeAttenuation: false,
        transparent: true, opacity, fog: false, depthWrite: false,
      });
      const pts = new THREE.Points(geo, mat);
      pts.renderOrder = -1;
      scene.add(pts);
      return mat;
    }
    const starMatA = starCloud(150, 2, 0.5);
    const starMatB = starCloud(110, 3, 0.36);
    W.twinkle = function (t) {
      starMatA.opacity = 0.42 + Math.sin(t * 1.3) * 0.13;
      starMatB.opacity = 0.30 + Math.sin(t * 1.7 + 2.1) * 0.11;
    };

    /* ---------- road ---------- */
    const asphaltTex = canvasTexture(makeCanvas(256, 256, (ctx, w, h) => {
      ctx.fillStyle = css(THEME.ink);
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 2400; i++) {
        ctx.fillStyle = Math.random() < 0.5 ? 'rgba(242,239,229,0.05)' : 'rgba(0,0,0,0.28)';
        ctx.fillRect(Math.random() * w, Math.random() * h, 1.6, 1.6);
      }
    }), maxAniso);
    asphaltTex.wrapS = asphaltTex.wrapT = THREE.RepeatWrapping;
    asphaltTex.repeat.set(6, 44);
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 540),
      new THREE.MeshLambertMaterial({ map: asphaltTex })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(-4, 0, -220);
    scene.add(road);

    // paint inks (poster-flat, unlit)
    const paintPaper = new THREE.MeshBasicMaterial({ color: THEME.paper });
    const paintYellow = new THREE.MeshBasicMaterial({ color: THEME.yellow });
    W.paintMats = { paintPaper, paintYellow };

    // dashed separators: one instanced mesh, scrolled with modulo wrap
    const DASH_CYCLE = 9, DASH_LEN = 3;
    const dashGeo = new THREE.PlaneGeometry(0.28, DASH_LEN);
    dashGeo.rotateX(-Math.PI / 2);
    const nRows = 62;
    // dash lanes: 3 down the near carriageway + 1 down the far carriageway
    // (between the two oncoming lanes) so the far road reads as drivable
    const DASH_X = [-4.5, 0, 4.5, -17.15];
    const dashes = new THREE.InstancedMesh(dashGeo, paintPaper, nRows * DASH_X.length);
    const dummy = new THREE.Object3D();
    const dashData = [];
    let di = 0;
    for (let r = 0; r < nRows; r++) {
      for (const x of DASH_X) {
        dummy.position.set(x, 0.02, 30 - r * DASH_CYCLE);
        dummy.updateMatrix();
        dashes.setMatrixAt(di++, dummy.matrix);
        dashData.push({ x, z: 30 - r * DASH_CYCLE });
      }
    }
    const dashGroup = new THREE.Group();
    dashGroup.add(dashes);
    scene.add(dashGroup);
    let dashOff = 0;
    let dashesBent = false;

    /* ---------- road curvature ----------
       Gameplay lives in straight space; the WORLD bends. One curvature
       value k warps every object's render x by k*z^2 ahead of the car. */
    W.curveK = 0;
    const bendX = (z) => (z < 0 ? W.curveK * z * z : 0);
    const bendYaw = (z) => (z < 0 ? Math.atan(2 * W.curveK * z) : 0);
    W.bendX = bendX;

    /* ---------- conveyors (recycled prop trains) ---------- */
    const conveyors = [];
    function conveyor(count, spacing, build, onRecycle, longSeg) {
      const items = [];
      for (let i = 0; i < count; i++) {
        const o = build(i);
        o.position.z = KILL_Z - 6 - i * spacing;
        o.userData.baseX = o.position.x;
        scene.add(o);
        items.push(o);
      }
      const span = count * spacing;
      const c = {
        items,
        scroll(dz) {
          for (const o of items) {
            o.position.z += dz;
            if (o.position.z > KILL_Z) {
              o.position.z -= span;
              if (onRecycle) onRecycle(o);
            }
            o.position.x = o.userData.baseX + bendX(o.position.z);
            if (longSeg) o.rotation.y = bendYaw(o.position.z);
          }
        },
      };
      conveyors.push(c);
      return c;
    }

    // solid edge lines + median line — segmented so they bend through curves
    function segLine(x, w, mat) {
      const geo = new THREE.PlaneGeometry(w, 61);
      geo.rotateX(-Math.PI / 2);
      conveyor(10, 60, () => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, 0.018, 0);
        return m;
      }, null, true);
    }
    segLine(9.1, 0.34, paintPaper);
    segLine(-9.1, 0.34, paintPaper);
    segLine(-9.85, 0.3, paintYellow);
    segLine(-12.4, 0.3, paintYellow);   // centre divider (far edge of it)
    segLine(-21.7, 0.34, paintPaper);   // far carriageway outer edge — closes the road

    /* sound barriers, both sides */
    const barrierTex = canvasTexture(makeCanvas(64, 8, (ctx, w, h) => {
      ctx.fillStyle = css(THEME.barrier);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (let x = 0; x < w; x += 4) ctx.fillRect(x, 0, 1, h);
    }), maxAniso);
    barrierTex.wrapS = THREE.RepeatWrapping;
    barrierTex.repeat.set(10, 1);
    const barrierMat = new THREE.MeshLambertMaterial({ map: barrierTex });
    const barrierGeo = new THREE.BoxGeometry(0.4, 3.2, 60.5);
    for (const side of [11.4, -23.2]) {
      conveyor(10, 60, () => {
        const m = new THREE.Mesh(barrierGeo, barrierMat);
        m.position.set(side, 1.6, 0);
        return m;
      }, null, true);
    }
    // low guardrail lip at the right road edge
    const railMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
    const railGeo = new THREE.BoxGeometry(0.25, 0.5, 60.5);
    conveyor(10, 60, () => {
      const m = new THREE.Mesh(railGeo, railMat);
      m.position.set(9.9, 0.25, 0);
      return m;
    }, null, true);
    // flat centre median — the raised jersey barrier is gone so the divider is
    // a crossable double-yellow: this is now a TWO-WAY road you can cut into the
    // oncoming carriageway on. A hatched "keep-clear" strip still reads the split.
    const medianTex = canvasTexture(makeCanvas(32, 128, (ctx, w, h) => {
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = css(THEME.yellow);
      ctx.lineWidth = 4;
      for (let y = -h; y < h; y += 14) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + w); ctx.stroke();
      }
    }), maxAniso);
    medianTex.wrapS = medianTex.wrapT = THREE.RepeatWrapping;
    medianTex.repeat.set(1, 30);
    const medianMat = new THREE.MeshLambertMaterial({ map: medianTex, transparent: true, opacity: 0.5 });
    const medianGeo = new THREE.PlaneGeometry(2.2, 61);
    medianGeo.rotateX(-Math.PI / 2);
    conveyor(10, 60, () => {
      const m = new THREE.Mesh(medianGeo, medianMat);
      m.position.set(-11.2, 0.02, 0);
      return m;
    }, null, true);

    /* streetlights with light pools (the fake-glow budget) */
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x23272c });
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 6.4, 6);
    const armGeo = new THREE.CylinderGeometry(0.07, 0.07, 3.4, 6);
    const headGeo = new THREE.BoxGeometry(0.7, 0.16, 0.3);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xFFE8B8 });
    const poolTex = canvasTexture(makeCanvas(128, 128, (ctx) => {
      const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
      g.addColorStop(0, 'rgba(255,232,184,0.55)');
      g.addColorStop(1, 'rgba(255,232,184,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    }), 1);
    const glowTex = canvasTexture(makeCanvas(64, 64, (ctx) => {
      const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
      g.addColorStop(0, 'rgba(255,232,184,0.9)');
      g.addColorStop(1, 'rgba(255,232,184,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    }), 1);
    const lampPools = [];
    conveyor(10, 55, (i) => {
      const side = i % 2 === 0 ? 1 : -1;
      const g = new THREE.Group();
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(side * 10.6, 3.2, 0);
      const arm = new THREE.Mesh(armGeo, poleMat);
      arm.rotation.z = side * (Math.PI / 2 - 0.28);
      arm.position.set(side * 9.1, 6.15, 0);
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.set(side * 7.6, 6.55, 0);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85,
      }));
      glow.position.set(side * 7.6, 6.6, 0);
      glow.scale.set(3.2, 3.2, 1);
      const pool = new THREE.Mesh(
        new THREE.PlaneGeometry(7, 15),
        new THREE.MeshBasicMaterial({
          map: poolTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5,
        })
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(side * 6.4, 0.03, 0);
      pool.renderOrder = 3;
      g.add(pole, arm, head, glow, pool);
      lampPools.push({ glow, pool });
      return g;
    });
    W.lampPools = lampPools;

    /* poster trees behind the barriers */
    const treeCircle = canvasTexture(makeCanvas(64, 64, (ctx) => {
      ctx.fillStyle = css(THEME.treeInk);
      ctx.beginPath(); ctx.arc(32, 26, 24, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(29, 44, 6, 20);
    }), 1);
    const treeTri = canvasTexture(makeCanvas(64, 64, (ctx) => {
      ctx.fillStyle = css(THEME.treeInk);
      ctx.beginPath(); ctx.moveTo(32, 0); ctx.lineTo(58, 48); ctx.lineTo(6, 48); ctx.closePath(); ctx.fill();
      ctx.fillRect(29, 46, 6, 18);
    }), 1);
    const treeGeoBig = new THREE.PlaneGeometry(4.6, 4.6);
    for (const side of [15.5, -26.5]) {
      conveyor(14, 27, (i) => {
        const m = new THREE.Mesh(treeGeoBig, new THREE.MeshBasicMaterial({
          map: i % 3 === 0 ? treeTri : treeCircle, transparent: true, alphaTest: 0.4,
        }));
        m.position.set(side + (Math.sin(i * 7.3) * 2.5), 2.3, 0);
        return m;
      });
    }

    /* distant city lights beyond the oncoming lanes — scattered warm/cool
       windows that the fog swallows into the horizon. Pure night dressing. */
    const cityTex = canvasTexture(makeCanvas(512, 96, (ctx, w, h) => {
      for (let i = 0; i < 300; i++) {
        ctx.fillStyle = Math.random() < 0.72
          ? 'rgba(255,225,170,' + (0.35 + Math.random() * 0.5).toFixed(2) + ')'
          : 'rgba(150,200,255,' + (0.3 + Math.random() * 0.4).toFixed(2) + ')';
        const bx = Math.random() * w, by = Math.random() * (h - 8);
        ctx.fillRect(bx, by, 2, 2 + Math.random() * 3);
      }
    }), 1);
    const cityGeo = new THREE.PlaneGeometry(60, 9);
    cityGeo.rotateY(Math.PI / 2);   // pre-rotated: the conveyor's bendYaw owns rotation.y
    conveyor(8, 60, () => {
      const m = new THREE.Mesh(cityGeo, new THREE.MeshBasicMaterial({
        map: cityTex, transparent: true, depthWrite: false, opacity: 0.85,
      }));
      m.position.set(-33.5, 4.5, 0);
      return m;
    }, null, true);

    /* curve chevron boards, right roadside rhythm */
    const chevTex = canvasTexture(makeCanvas(128, 96, (ctx, w, h) => {
      ctx.fillStyle = css(THEME.yellow);
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = css(THEME.ink);
      ctx.lineWidth = 13;
      for (let x = -20; x < w + 20; x += 34) {
        ctx.beginPath();
        ctx.moveTo(x, h - 8);
        ctx.lineTo(x + 22, h / 2);
        ctx.lineTo(x, 8);
        ctx.stroke();
      }
    }), maxAniso);
    conveyor(3, 195, () => {
      const g = new THREE.Group();
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(2.1, 1.35),
        new THREE.MeshBasicMaterial({ map: chevTex })
      );
      board.position.set(10.55, 1.75, 0);
      board.rotation.y = Math.PI + 0.12;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 5), poleMat);
      post.position.set(10.55, 0.55, 0);
      g.add(board, post);
      return g;
    });

    /* km posts (they count your real distance) */
    const kmCanvases = [];
    const kmConv = conveyor(5, 100, (i) => {
      const c = makeCanvas(64, 128, () => {});
      const tex = canvasTexture(c, maxAniso);
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 1.0),
        new THREE.MeshBasicMaterial({ map: tex })
      );
      m.position.set(-10.15, 0.75, 0);
      m.rotation.y = Math.PI;
      m.userData.canvas = c;
      m.userData.tex = tex;
      kmCanvases.push(m);
      return m;
    }, (m) => { if (W.onKmRecycle) W.onKmRecycle(m); });
    W.paintKmPost = function (m, kmText) {
      const ctx = m.userData.canvas.getContext('2d');
      ctx.fillStyle = css(THEME.paper);
      ctx.fillRect(0, 0, 64, 128);
      ctx.fillStyle = css(THEME.green);
      ctx.fillRect(0, 0, 64, 36);
      ctx.fillStyle = css(THEME.paper);
      ctx.font = "600 20px 'Saira Condensed'";
      ctx.textAlign = 'center';
      ctx.fillText('KM', 32, 26);
      ctx.fillStyle = css(THEME.ink);
      ctx.font = "700 44px 'Saira Condensed'";
      ctx.fillText(kmText, 32, 92);
      m.userData.tex.needsUpdate = true;
    };
    W.kmPosts = kmConv.items;

    /* gantries: overhead signs that print the player's own data */
    function makeGantry() {
      const g = new THREE.Group();
      const postGeo = new THREE.CylinderGeometry(0.32, 0.38, 7.2, 8);
      for (const x of [-10.8, 10.8]) {
        const p = new THREE.Mesh(postGeo, poleMat);
        p.position.set(x, 3.6, 0);
        g.add(p);
      }
      const truss = new THREE.Mesh(new THREE.BoxGeometry(22.4, 1.0, 1.0), poleMat);
      truss.position.set(0, 7.2, 0);
      g.add(truss);
      const c = makeCanvas(1024, 256, () => {});
      const tex = canvasTexture(c, maxAniso);
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(11, 2.6, 0.18),
        [
          new THREE.MeshLambertMaterial({ color: 0x1a1f23 }),
          new THREE.MeshLambertMaterial({ color: 0x1a1f23 }),
          new THREE.MeshLambertMaterial({ color: 0x1a1f23 }),
          new THREE.MeshLambertMaterial({ color: 0x1a1f23 }),
          new THREE.MeshLambertMaterial({ color: 0x1a1f23 }),
          new THREE.MeshBasicMaterial({ map: tex }),
        ]
      );
      sign.position.set(0, 5.4, 0.2);
      g.add(sign);
      g.userData.canvas = c;
      g.userData.tex = tex;
      return g;
    }
    W.paintGantry = function (g, main, sub) {
      const ctx = g.userData.canvas.getContext('2d');
      ctx.fillStyle = css(THEME.green);
      ctx.fillRect(0, 0, 1024, 256);
      ctx.strokeStyle = css(THEME.paper);
      ctx.lineWidth = 8;
      ctx.strokeRect(22, 22, 980, 212);
      ctx.fillStyle = css(THEME.paper);
      ctx.textAlign = 'center';
      if (sub) {
        ctx.font = "84px 'Anton'";
        ctx.fillText(main, 512, 122);
        ctx.font = "500 44px 'Barlow'";
        ctx.fillText(sub, 512, 196);
      } else {
        ctx.font = "110px 'Anton'";
        ctx.fillText(main, 512, 168);
      }
      g.userData.tex.needsUpdate = true;
    };
    const gantryConv = conveyor(2, 560, () => makeGantry(),
      (g) => { if (W.onGantryRecycle) W.onGantryRecycle(g); });
    W.gantries = gantryConv.items;

    /* milestone billboards, right side beyond the barrier */
    function makeBillboard() {
      const g = new THREE.Group();
      const c = makeCanvas(512, 384, () => {});
      const tex = canvasTexture(c, maxAniso);
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(7.6, 5.7),
        new THREE.MeshBasicMaterial({ map: tex })
      );
      board.position.set(16.5, 4.6, 0);
      board.rotation.y = Math.PI + 0.22;
      const legGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.2, 6);
      for (const dx of [-2.6, 2.6]) {
        const leg = new THREE.Mesh(legGeo, poleMat);
        leg.position.set(16.5 + dx * 0.9, 1.0, 0);
        g.add(leg);
      }
      g.add(board);
      g.userData.canvas = c;
      g.userData.tex = tex;
      g.visible = false;
      return g;
    }
    W.paintBillboard = function (g, bigText, kicker) {
      const ctx = g.userData.canvas.getContext('2d');
      ctx.fillStyle = css(THEME.paper);
      ctx.fillRect(0, 0, 512, 384);
      ctx.fillStyle = css(THEME.shu);
      ctx.fillRect(0, 0, 512, 74);
      ctx.fillStyle = css(THEME.paper);
      ctx.textAlign = 'center';
      ctx.font = "500 34px 'Barlow'";
      ctx.fillText(kicker, 256, 50);
      ctx.fillStyle = css(THEME.ink);
      ctx.font = "700 150px 'Saira Condensed'";
      ctx.fillText(bigText, 256, 268);
      // halftone screen over the number
      ctx.fillStyle = css(THEME.paper);
      for (let y = 100; y < 384; y += 14) {
        for (let x = 8; x < 512; x += 14) {
          ctx.beginPath();
          ctx.arc(x + ((y / 14) % 2) * 7, y, 2.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.fillStyle = css(THEME.ink);
      ctx.font = "40px 'Anton'";
      ctx.fillText('PTS — KEEP MISSING', 256, 348);
      g.userData.tex.needsUpdate = true;
    };
    const billboardConv = conveyor(2, 620, () => makeBillboard(),
      (g) => { g.visible = false; });   // never re-show a stale milestone
    W.billboards = billboardConv.items;

    /* ---------- anamorphic road type (the signature) ---------- */
    const DECAL_COUNT = 14;
    const decalPool = [];
    const decalGeo = new THREE.PlaneGeometry(1, 1);
    decalGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < DECAL_COUNT; i++) {
      const c = makeCanvas(512, 160, () => {});
      const tex = canvasTexture(c, maxAniso);
      const m = new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({
        map: tex, transparent: true, depthWrite: false, opacity: 0,
      }));
      m.position.y = 0.028 + i * 0.0012;   // stable stacking order
      m.renderOrder = 4;
      m.visible = false;
      m.userData = { canvas: c, tex, live: false, age: 0 };
      scene.add(m);
      decalPool.push(m);
    }
    let decalCursor = 0;

    /* stamp(text, x, z, opts) → mesh. Text drawn normally, quad stretched
       ~4.5x along Z so it compresses into legibility at the grazing angle —
       exactly how road-marking painters distort letters. */
    W.stampRoad = function (text, x, z, opts = {}) {
      const m = decalPool[decalCursor];
      m.userData.baseX = x;
      decalCursor = (decalCursor + 1) % DECAL_COUNT;
      const ctx = m.userData.canvas.getContext('2d');
      ctx.clearRect(0, 0, 512, 160);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const jp = opts.jp;
      const font = jp ? "900 120px 'Noto Sans JP'" : "120px 'Anton'";
      ctx.font = font;
      const tw = ctx.measureText(text).width;
      const s = Math.min(1, 470 / Math.max(1, tw));
      ctx.save();
      ctx.translate(256, 84);
      ctx.scale(s, s);
      ctx.rotate((opts.tilt || 0) * 0.017);
      // misregistered shu ghost under the paper ink
      if (!opts.noGhost) {
        ctx.fillStyle = css(THEME.shu);
        ctx.fillText(text, 5, 5);
      }
      ctx.fillStyle = css(opts.color != null ? opts.color : THEME.paper);
      ctx.fillText(text, 0, 0);
      ctx.restore();
      m.userData.tex.needsUpdate = true;

      const w = opts.width || 6;
      m.scale.set(w, 1, w * (opts.stretch || 4.5) * (160 / 512));
      m.position.x = x;
      m.position.z = z;
      m.material.opacity = opts.opacity != null ? opts.opacity : 0.92;
      m.visible = true;
      m.userData.live = true;
      return m;
    };
    W.decals = decalPool;
    W.clearDecals = function () {
      for (const m of decalPool) { m.visible = false; m.userData.live = false; m.material.opacity = 0; }
    };

    /* ---------- car kit ---------- */
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x0b0c0e });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x0d1013 });
    const tailGlowTex = canvasTexture(makeCanvas(64, 64, (ctx) => {
      const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
      g.addColorStop(0, 'rgba(232,56,13,0.95)');
      g.addColorStop(1, 'rgba(232,56,13,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    }), 1);
    const headGlowTex = glowTex;

    // wet-asphalt light streaks: a vertical fade the road "reflects" under
    // every light source. Bright end (gradient stop 0 = canvas top = local +Y
    // = world −Z after the flat rotation) sits against the car.
    function streakTex(rgb) {
      return canvasTexture(makeCanvas(32, 128, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, 'rgba(' + rgb + ',0.5)');
        g.addColorStop(1, 'rgba(' + rgb + ',0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }), 1);
    }
    const tailStreakTex = streakTex('232,56,13');
    const headStreakTex = streakTex('255,232,184');
    function addStreak(g, tex, width, len, y, z, opacity) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(width, len),
        new THREE.MeshBasicMaterial({
          map: tex, transparent: true, blending: THREE.AdditiveBlending,
          depthWrite: false, opacity,
        })
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, y, z);
      m.renderOrder = 3;
      g.add(m);
      return m;
    }

    function addWheels(g, w, l, y) {
      const xs = w / 2 - 0.08, zs = l / 2 - 0.75;
      for (const [x, z] of [[-xs, -zs], [xs, -zs], [-xs, zs], [xs, zs]]) {
        const wh = new THREE.Mesh(wheelGeo, wheelMat);
        wh.position.set(x, y, z);
        g.add(wh);
      }
    }

    function tailBar(g, w, y, z) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.16, 0.06),
        new THREE.MeshLambertMaterial({ color: 0x2a0d06, emissive: THEME.shu, emissiveIntensity: 1.4 })
      );
      bar.position.set(0, y, z);
      g.add(bar);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tailGlowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.35,
      }));
      glow.position.set(0, y - 0.05, z + 0.5);
      glow.scale.set(w * 0.8, 0.45, 1);
      g.add(glow);
      return { bar, glow };
    }

    /* traffic archetypes */
    const TRAFFIC_TYPES = [
      { key: 'sedan', w: 2.1, l: 4.5, body: 0.72, cabin: [1.86, 0.52, 2.1, -0.25], speed: [0.50, 0.63], colors: [THEME.carWhite, THEME.carGrey, THEME.blue] },
      { key: 'kei',   w: 1.9, l: 3.4, body: 0.85, cabin: [1.7, 0.6, 1.9, -0.1],   speed: [0.44, 0.58], colors: [THEME.carWhite, THEME.carGrey] },
      { key: 'taxi',  w: 2.1, l: 4.5, body: 0.72, cabin: [1.86, 0.52, 2.1, -0.25], speed: [0.52, 0.66], colors: [THEME.yellow] },
      { key: 'truck', w: 2.35, l: 7.8, body: 0, cabin: null, speed: [0.38, 0.48], colors: [THEME.carGrey, THEME.carTeal] },
      { key: 'bus',   w: 2.4, l: 9.0, body: 0, cabin: null, speed: [0.40, 0.50], colors: [THEME.carTeal, THEME.carWhite] },
    ];

    function buildTraffic(type, colorHex) {
      const g = new THREE.Group();
      const bodyMat = new THREE.MeshLambertMaterial({ color: colorHex });
      if (type.key === 'truck') {
        const cab = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.6, 1.9), bodyMat);
        cab.position.set(0, 1.15, -2.75);
        const cargo = new THREE.Mesh(new THREE.BoxGeometry(2.35, 2.25, 5.4), new THREE.MeshLambertMaterial({ color: 0xBDB9AC }));
        cargo.position.set(0, 1.45, 0.9);
        g.add(cab, cargo);
        addWheels(g, 2.35, 7.4, 0.42);
      } else if (type.key === 'bus') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 9.0), bodyMat);
        body.position.y = 1.5;
        const winStrip = new THREE.Mesh(new THREE.BoxGeometry(2.44, 0.6, 7.6), glassMat);
        winStrip.position.set(0, 2.0, -0.2);
        g.add(body, winStrip);
        addWheels(g, 2.4, 8.0, 0.42);
      } else {
        const body = new THREE.Mesh(new THREE.BoxGeometry(type.w, type.body, type.l), bodyMat);
        body.position.y = 0.55 + type.body / 2 - 0.35;
        g.add(body);
        const [cw, ch, cl, cz] = type.cabin;
        const cab = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, cl), bodyMat);
        cab.position.set(0, body.position.y + type.body / 2 + ch / 2 - 0.04, cz);
        g.add(cab);
        const glass = new THREE.Mesh(new THREE.BoxGeometry(cw + 0.04, ch * 0.55, cl * 0.82), glassMat);
        glass.position.copy(cab.position);
        glass.position.y += ch * 0.1;
        g.add(glass);
        if (type.key === 'taxi') {
          const sign = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.3), new THREE.MeshLambertMaterial({ color: THEME.ink }));
          sign.position.set(0, cab.position.y + ch / 2 + 0.13, cz);
          g.add(sign);
        }
        addWheels(g, type.w, type.l, 0.42);
      }
      const rearY = type.key === 'truck' ? 1.0 : type.key === 'bus' ? 1.0 : 0.72;
      const tail = tailBar(g, type.w * 0.86, rearY, type.l / 2 - 0.02);
      // taillights bleed onto the wet asphalt behind the car
      addStreak(g, tailStreakTex, type.w * 0.62, 6.5, 0.032, type.l / 2 + 3.2, 0.45);
      return { group: g, tail, halfW: type.w / 2, halfL: type.l / 2, type };
    }

    W.TRAFFIC_TYPES = TRAFFIC_TYPES;
    W.spawnTrafficMesh = function (typeIdx) {
      const type = TRAFFIC_TYPES[typeIdx];
      const color = type.colors[Math.floor(Math.random() * type.colors.length)];
      const t = buildTraffic(type, color);
      scene.add(t.group);
      return t;
    };

    /* ---------- player: three switchable rides (car → bike → bicycle) ----------
       All three live inside one player.group; only the active one is visible.
       Each returns { root, meshes, paint(combo,fever), halfW, halfL, name }.
       `meshes` is the flat list the crash scatters and setVehicle toggles. */

    /* a limb / strut spanning two points in the bike's y–z plane. `axis` says
       which local axis of the box/cylinder runs along the segment ('z' for the
       box limbs, 'y' for cylinder tubes) so the piece points the right way.
       Everything is added straight to `root` (identity in player space) so the
       crash-scatter's cached home transforms stay valid. */
    function spanMesh(y1, z1, y2, z2, thick, mat, x, axis) {
      const dy = y2 - y1, dz = z2 - z1, len = Math.hypot(dy, dz) || 0.01;
      const geo = axis === 'y'
        ? new THREE.CylinderGeometry(thick, thick, len, 8)
        : new THREE.BoxGeometry(thick, thick, len);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x || 0, (y1 + y2) / 2, (z1 + z2) / 2);
      // cylinder long axis is +y → φ=atan2(dz,dy); box long axis is +z → φ=atan2(-dy,dz)
      m.rotation.x = axis === 'y' ? Math.atan2(dz, dy) : Math.atan2(-dy, dz);
      return m;
    }

    // a dark ink rider: helmet + leaning torso + arms to the bars + legs to the
    // pegs/pedals. lean is the forward tip (rad); pass foot* to draw the legs.
    function addRider(root, o) {
      // a pale racing suit (never black — it vanished against the road)
      const suit = new THREE.MeshLambertMaterial({ color: o.suit || THEME.paper });
      const helmet = new THREE.MeshLambertMaterial({ color: o.helmet });
      const a = o.lean, cos = Math.cos(a), sin = Math.sin(a);
      const up = (d) => [o.hipY + d * cos, o.hipZ - d * sin];   // d up the leaning spine
      const TH = 0.62;
      const [ty, tz] = up(TH / 2);
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, TH, 0.30), suit);
      torso.position.set(0, ty, tz); torso.rotation.x = -a;
      const [hy, hz] = up(TH + 0.16);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 12), helmet);
      head.position.set(0, hy, hz);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.11, 0.06), glassMat);
      visor.position.set(0, hy - 0.01, hz - 0.16);
      root.add(torso, head, visor);
      // arms: shoulders → bars
      const [sy, sz] = up(TH * 0.82);
      root.add(spanMesh(sy, sz, o.barY, o.barZ, 0.12, suit, 0.16, 'z'));
      root.add(spanMesh(sy, sz, o.barY, o.barZ, 0.12, suit, -0.16, 'z'));
      // legs: hips → pedals/pegs
      if (o.footY != null) {
        root.add(spanMesh(o.hipY, o.hipZ, o.footY, o.footZ, 0.15, suit, 0.14, 'z'));
        root.add(spanMesh(o.hipY, o.hipZ, o.footY, o.footZ, 0.15, suit, -0.14, 'z'));
      }
    }

    // a bicycle/motorbike spoked wheel: an open rim ring + hub + a few spokes,
    // built in the y–z plane (rolls along z). returns nothing, adds to root.
    function addSpokedWheel(root, cz, R, tube, rimMat, spokeMat) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R, tube, 8, 24), rimMat);
      rim.rotation.y = Math.PI / 2;                    // face sideways
      rim.position.set(0, R, cz);
      root.add(rim);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.14, 8), rimMat);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(0, R, cz);
      root.add(hub);
      for (let k = 0; k < 4; k++) {
        const ang = k * Math.PI / 4 + 0.2;
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.02, R * 2 - tube, 0.02), spokeMat);
        sp.position.set(0, R, cz);
        sp.rotation.x = ang;
        root.add(sp);
      }
    }

    // ===================== 0 · the kei-racer car =====================
    function buildCar() {
      const root = new THREE.Group();
      const L = 4.4, HW = 1.02;
      const s = new THREE.Shape();
      s.moveTo(-2.2, 0.16);
      s.lineTo(-2.2, 0.98);          // kamm tail, chopped clean
      s.lineTo(-1.5, 1.06);          // roof
      s.lineTo(-0.45, 1.06);
      s.lineTo(0.55, 0.66);          // windshield rake
      s.lineTo(1.7, 0.58);           // hood
      s.lineTo(2.18, 0.5);
      s.lineTo(2.2, 0.2);            // nose
      s.closePath();
      const bodyGeo = new THREE.ExtrudeGeometry(s, { depth: HW * 2, bevelEnabled: false });
      bodyGeo.translate(0, 0, -HW);
      bodyGeo.rotateY(Math.PI / 2);
      const pos = bodyGeo.attributes.position;
      const uv = bodyGeo.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        uv.setXY(i, pos.getX(i) / (HW * 2) + 0.5, pos.getZ(i) / L + 0.5);
      }
      uv.needsUpdate = true;

      const liveryCanvas = makeCanvas(256, 512, () => {});
      const liveryTex = canvasTexture(liveryCanvas, maxAniso);
      const body = new THREE.Mesh(bodyGeo, new THREE.MeshLambertMaterial({ map: liveryTex }));
      root.add(body);

      const glass = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.26, 1.0), glassMat);
      glass.position.set(0, 0.84, 0.55);
      root.add(glass);
      addWheels(root, 2.2, 4.4, 0.42);
      tailBar(root, 1.9, 0.86, 2.19);
      const hlMat = new THREE.MeshBasicMaterial({ color: 0xFFF2D0 });
      for (const x of [-0.7, 0.7]) {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.06), hlMat);
        hl.position.set(x, 0.42, -2.21);
        root.add(hl);
      }
      const beam = new THREE.Mesh(
        new THREE.PlaneGeometry(4.4, 10),
        new THREE.MeshBasicMaterial({ map: poolTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.4 })
      );
      beam.rotation.x = -Math.PI / 2;
      beam.position.set(0, 0.04, -7.4);
      beam.renderOrder = 3;
      root.add(beam);

      function paint(combo, fever) {
        const ctx = liveryCanvas.getContext('2d');
        const bodyC = fever ? css(THEME.shu) : css(THEME.paper);
        const s1 = fever ? css(THEME.paper) : css(THEME.shu);
        const s2 = fever ? css(THEME.paper) : css(THEME.blue);
        ctx.fillStyle = bodyC;
        ctx.fillRect(0, 0, 256, 512);
        ctx.fillStyle = s1;
        ctx.fillRect(78, 0, 34, 512);
        ctx.fillStyle = css(THEME.ink);
        ctx.fillRect(114, 0, 5, 512);
        ctx.fillStyle = s2;
        ctx.fillRect(121, 0, 22, 512);
        ctx.save();
        ctx.translate(178, 428);
        ctx.fillStyle = fever ? css(THEME.paper) : css(THEME.ink);
        ctx.beginPath(); ctx.arc(0, 0, 44, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = fever ? css(THEME.shu) : css(THEME.paper);
        ctx.font = "700 56px 'Saira Condensed'";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('×' + combo, 0, 4);
        ctx.restore();
        liveryTex.needsUpdate = true;
      }
      return { root, paint, halfW: HW, halfL: L / 2, name: 'CAR' };
    }

    // ===================== 1 · the sport motorbike =====================
    function buildBike() {
      const root = new THREE.Group();
      const HW = 0.5, L = 2.7;
      const bodyMat = new THREE.MeshLambertMaterial({ color: THEME.paper });
      const accentMat = new THREE.MeshLambertMaterial({ color: THEME.shu });
      const darkMat = new THREE.MeshLambertMaterial({ color: THEME.ink });
      const metalMat = new THREE.MeshLambertMaterial({ color: 0x2b2f35 });

      // fat tyres (solid discs) with a bright rim ring on top
      const tyreGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.24, 20);
      tyreGeo.rotateZ(Math.PI / 2);
      for (const z of [-1.08, 1.08]) {
        const wh = new THREE.Mesh(tyreGeo, wheelMat);
        wh.position.set(0, 0.5, z);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 18), metalMat);
        rim.rotation.y = Math.PI / 2; rim.position.set(0, 0.5, z);
        root.add(wh, rim);
      }
      // raked front fork + tele legs to the wheel
      root.add(spanMesh(1.12, -0.62, 0.5, -1.08, 0.06, metalMat, 0.14, 'y'));
      root.add(spanMesh(1.12, -0.62, 0.5, -1.08, 0.06, metalMat, -0.14, 'y'));
      // swingarm to the rear wheel
      root.add(spanMesh(0.55, 0.15, 0.5, 1.08, 0.07, metalMat, 0.12, 'y'));
      root.add(spanMesh(0.55, 0.15, 0.5, 1.08, 0.07, metalMat, -0.12, 'y'));

      // engine block, low and central
      const engine = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.66), darkMat);
      engine.position.set(0, 0.6, 0.02);
      root.add(engine);
      // fuel tank, sloping down toward the front
      const tank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.95), bodyMat);
      tank.position.set(0, 1.02, 0.18); tank.rotation.x = -0.16;
      // front fairing + a raked screen
      const fairing = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.6), bodyMat);
      fairing.position.set(0, 0.86, -0.78); fairing.rotation.x = -0.42;
      const screen = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.3, 0.05), glassMat);
      screen.position.set(0, 1.2, -0.72); screen.rotation.x = -0.55;
      // tail cowl, kicked up at the rear
      const tailCowl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.8), accentMat);
      tailCowl.position.set(0, 1.14, 0.95); tailCowl.rotation.x = 0.28;
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.72), darkMat);
      seat.position.set(0, 1.0, 0.62);
      root.add(tank, fairing, screen, tailCowl, seat);
      // clip-on handlebars
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.07, 0.07), darkMat);
      bar.position.set(0, 1.12, -0.5);
      root.add(bar);
      // chromed exhaust down the right side
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 1.3, 10), metalMat);
      pipe.rotation.x = Math.PI / 2 + 0.05; pipe.position.set(0.3, 0.5, 0.55);
      root.add(pipe);
      // headlight + tail lamp
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.06), new THREE.MeshBasicMaterial({ color: 0xFFF2D0 }));
      hl.position.set(0, 0.9, -1.05);
      root.add(hl);
      tailBar(root, 0.42, 1.05, 1.28);

      addRider(root, { hipY: 1.02, hipZ: 0.58, lean: 0.62, helmet: THEME.shu, barY: 1.12, barZ: -0.5, footY: 0.6, footZ: 0.12 });

      const bodyMats = [tank.material, fairing.material];
      function paint(_combo, fever) {
        const c = new THREE.Color(fever ? THEME.shu : THEME.paper);
        for (const m of bodyMats) m.color.copy(c);
        accentMat.color.set(fever ? THEME.paper : THEME.shu);
      }
      return { root, paint, halfW: HW, halfL: L / 2, name: 'BIKE' };
    }

    // ===================== 2 · the bicycle =====================
    function buildBicycle() {
      const root = new THREE.Group();
      const HW = 0.4, L = 2.1;
      const frameMat = new THREE.MeshLambertMaterial({ color: THEME.shu });
      const darkMat = new THREE.MeshLambertMaterial({ color: THEME.ink });
      const rimMat = new THREE.MeshLambertMaterial({ color: 0x1b1e22 });
      const spokeMat = new THREE.MeshLambertMaterial({ color: 0x6b6f76 });

      // open spoked wheels front & rear
      const R = 0.6;
      addSpokedWheel(root, -0.92, R, 0.045, rimMat, spokeMat);
      addSpokedWheel(root, 0.92, R, 0.045, rimMat, spokeMat);

      // key frame joints (y, z), all in the centre plane
      const BB = [0.5, 0.0];          // bottom bracket / crank
      const seatCl = [1.12, 0.42];    // seat cluster
      const headTop = [1.08, -0.6];   // top of head tube (bars)
      const headBot = [0.86, -0.66];  // bottom of head tube (fork crown)
      const rear = [R, 0.92], front = [R, -0.92];
      const T = 0.045;
      root.add(
        spanMesh(BB[0], BB[1], seatCl[0], seatCl[1], T, frameMat, 0, 'y'),      // seat tube
        spanMesh(BB[0], BB[1], headBot[0], headBot[1], T, frameMat, 0, 'y'),    // down tube
        spanMesh(seatCl[0], seatCl[1], headTop[0], headTop[1], T, frameMat, 0, 'y'), // top tube
        spanMesh(headTop[0], headTop[1], headBot[0], headBot[1], 0.05, frameMat, 0, 'y'), // head tube
        // twin chain- & seat-stays out to the rear hub
        spanMesh(BB[0], BB[1], rear[0], rear[1], 0.03, frameMat, 0.06, 'y'),
        spanMesh(BB[0], BB[1], rear[0], rear[1], 0.03, frameMat, -0.06, 'y'),
        spanMesh(seatCl[0], seatCl[1], rear[0], rear[1], 0.03, frameMat, 0.06, 'y'),
        spanMesh(seatCl[0], seatCl[1], rear[0], rear[1], 0.03, frameMat, -0.06, 'y'),
        // twin fork blades to the front hub
        spanMesh(headBot[0], headBot[1], front[0], front[1], 0.03, rimMat, 0.07, 'y'),
        spanMesh(headBot[0], headBot[1], front[0], front[1], 0.03, rimMat, -0.07, 'y')
      );
      // saddle, stem + handlebar, crank arm + pedal
      const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.09, 0.44), darkMat);
      saddle.position.set(0, seatCl[0] + 0.18, seatCl[1] + 0.06);
      const stem = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.24), darkMat);
      stem.position.set(0, headTop[0] + 0.06, headTop[1] - 0.1);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.07, 0.07), darkMat);
      bar.position.set(0, headTop[0] + 0.1, headTop[1] - 0.22);
      const crank = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.06), darkMat);
      crank.position.set(0.1, BB[0], BB[1]);
      const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.2), darkMat);
      pedal.position.set(0.14, BB[0] - 0.16, BB[1]);
      root.add(saddle, stem, bar, crank, pedal);

      addRider(root, { hipY: seatCl[0] + 0.24, hipZ: seatCl[1] + 0.06, lean: 0.34, helmet: THEME.blue, barY: headTop[0] + 0.12, barZ: headTop[1] - 0.22, footY: BB[0] - 0.14, footZ: BB[1] + 0.02 });

      function paint(_combo, fever) {
        frameMat.color.set(fever ? THEME.yellow : THEME.shu);
      }
      return { root, paint, halfW: HW, halfL: L / 2, name: 'BICYCLE' };
    }

    function buildPlayer() {
      const g = new THREE.Group();
      const vehicles = [buildCar(), buildBike(), buildBicycle()];
      let active = 0, lastCombo = 1, lastFever = false;

      // flatten each ride's meshes for the crash-scatter + visibility toggle,
      // and cache home transforms (relative to the identity sub-root == g space)
      for (const v of vehicles) {
        g.add(v.root);
        v.meshes = [];
        v.root.traverse((o) => { if (o.isMesh || o.isSprite) v.meshes.push(o); });
        v.pieces = v.meshes.map((o) => ({ obj: o, pos: o.position.clone(), rot: o.rotation.clone() }));
        v.paint(1, false);
      }

      const api = {
        group: g,
        halfW: vehicles[0].halfW,
        halfL: vehicles[0].halfL,
        pieces: vehicles[0].pieces,
        vehicle: 0,
        vehicleCount: vehicles.length,
        vehicleName: vehicles[0].name,
        paintLivery(combo, fever) {
          lastCombo = combo; lastFever = fever;
          vehicles[active].paint(combo, fever);
        },
        setVehicle(idx) {
          idx = ((idx % vehicles.length) + vehicles.length) % vehicles.length;
          active = idx;
          for (let i = 0; i < vehicles.length; i++) {
            const vis = i === idx;
            for (const o of vehicles[i].meshes) o.visible = vis;
          }
          api.halfW = vehicles[idx].halfW;
          api.halfL = vehicles[idx].halfL;
          api.pieces = vehicles[idx].pieces;
          api.vehicle = idx;
          api.vehicleName = vehicles[idx].name;
          vehicles[idx].paint(lastCombo, lastFever);
          return api.vehicleName;
        },
      };
      api.setVehicle(0);
      scene.add(g);
      return api;
    }
    W.buildPlayer = buildPlayer;

    /* ---------- stunt ramps: caution-striped launch wedges ---------- */
    const rampStripeTex = canvasTexture(makeCanvas(128, 64, (ctx, w, h) => {
      ctx.fillStyle = css(THEME.yellow);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = css(THEME.ink);
      for (let x = -h; x < w + h; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, h); ctx.lineTo(x + 16, h); ctx.lineTo(x + 16 + h, 0); ctx.lineTo(x + h, 0);
        ctx.closePath(); ctx.fill();
      }
    }), maxAniso);
    rampStripeTex.wrapS = THREE.RepeatWrapping;

    W.buildRamp = function () {
      const g = new THREE.Group();
      const L = 7, H = 1.15, HW = 1.6;
      // wedge: low lip toward the player (+z), full height at the far (-z) end
      const s = new THREE.Shape();
      s.moveTo(-L / 2, 0);
      s.lineTo(L / 2, 0);
      s.lineTo(L / 2, H);
      s.closePath();
      const geo = new THREE.ExtrudeGeometry(s, { depth: HW * 2, bevelEnabled: false });
      geo.translate(0, 0, -HW);
      geo.rotateY(Math.PI / 2);   // profile length onto Z, low edge at +z
      const body = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x2a2e33 }));
      g.add(body);
      // caution-striped plate laid on the slope
      const slopeLen = Math.sqrt(L * L + H * H);
      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(HW * 2 - 0.1, slopeLen - 0.2),
        new THREE.MeshBasicMaterial({ map: rampStripeTex })
      );
      plate.rotation.x = -Math.PI / 2 + Math.atan2(H, L);
      plate.position.set(0, H / 2 + 0.03, 0);
      g.add(plate);
      g.visible = false;
      scene.add(g);
      return { group: g, halfW: HW, halfL: L / 2, height: H };
    };

    /* ---------- supply crates: shoot them or drive through them ---------- */
    const crateTex = canvasTexture(makeCanvas(128, 128, (ctx, w, h) => {
      ctx.fillStyle = css(THEME.yellow);
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = css(THEME.ink);
      ctx.lineWidth = 10;
      ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.fillStyle = css(THEME.ink);
      ctx.font = "900 62px 'Noto Sans JP'";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('補給', w / 2, h / 2 + 2);   // "supply"
    }), maxAniso);
    W.buildCrate = function () {
      const g = new THREE.Group();
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 1.6, 1.6),
        new THREE.MeshLambertMaterial({ map: crateTex })
      );
      box.position.y = 0.8;
      g.add(box);
      // warm night-glow so the drop reads from deep in the fog
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55,
      }));
      glow.position.y = 1.0;
      glow.scale.set(4.2, 4.2, 1);
      g.add(glow);
      g.visible = false;
      scene.add(g);
      return { group: g, box, half: 0.8 };
    };

    // shattered-crate shards, one shared pool (main drives the physics)
    const shardMats = [
      new THREE.MeshBasicMaterial({ color: THEME.yellow }),
      new THREE.MeshBasicMaterial({ color: THEME.ink }),
      new THREE.MeshBasicMaterial({ color: THEME.paper }),
    ];
    const shardGeoA = new THREE.BoxGeometry(0.42, 0.42, 0.42);
    const shardGeoB = new THREE.BoxGeometry(0.26, 0.26, 0.26);
    W.crateShards = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(i % 2 ? shardGeoA : shardGeoB, shardMats[i % 3]);
      m.visible = false;
      scene.add(m);
      W.crateShards.push(m);
    }

    /* ---------- tracer bolt: the front cannon's round ---------- */
    W.buildTracer = function () {
      const g = new THREE.Group();
      const bolt = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.2, 3.0),
        new THREE.MeshBasicMaterial({ color: THEME.yellow })
      );
      bolt.position.y = 0.6;
      g.add(bolt);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9,
      }));
      glow.position.y = 0.6;
      glow.scale.set(2.4, 2.4, 1);
      g.add(glow);
      g.visible = false;
      scene.add(g);
      return { group: g };
    };

    /* ---------- shield aura: the one-time crash barrier ---------- */
    W.buildShieldAura = function () {
      // arc < 2π: the gap breaks the ring's symmetry so its spin actually reads
      const geo = new THREE.TorusGeometry(2.5, 0.08, 8, 48, Math.PI * 1.7);
      geo.rotateX(Math.PI / 2);   // lie flat — caller spins rotation.y
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: THEME.yellow, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      m.position.y = 0.6;
      m.visible = false;
      return m;   // caller parents it to the player group
    };

    /* ---------- drift skid ink (the road remembers your slides) ---------- */
    const SKID_COUNT = 34;
    const skidGeo = new THREE.PlaneGeometry(0.17, 1.5);
    skidGeo.rotateX(-Math.PI / 2);
    const skids = [];
    for (let i = 0; i < SKID_COUNT; i++) {
      const m = new THREE.Mesh(skidGeo, new THREE.MeshBasicMaterial({
        color: THEME.shu, transparent: true, opacity: 0, depthWrite: false,
      }));
      m.position.y = 0.024 + (i % 8) * 0.0007;
      m.renderOrder = 3;
      m.visible = false;
      m.userData = { live: false, baseX: 0 };
      scene.add(m);
      skids.push(m);
    }
    let skidCursor = 0;
    W.dropSkid = function (x, z, yaw) {
      const m = skids[skidCursor];
      skidCursor = (skidCursor + 1) % SKID_COUNT;
      m.userData.live = true;
      m.userData.baseX = x;
      m.position.x = x;
      m.position.z = z;
      m.rotation.y = yaw;
      m.material.opacity = 0.34;
      m.visible = true;
    };
    W.clearSkids = function () {
      for (const m of skids) { m.visible = false; m.userData.live = false; m.material.opacity = 0; }
    };

    /* ---------- oncoming silhouettes (pure speed sensation) ---------- */
    function buildOncoming() {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.1, 4.6), new THREE.MeshLambertMaterial({ color: 0x181c20 }));
      body.position.y = 0.85;
      g.add(body);
      const hlMat2 = new THREE.MeshBasicMaterial({ color: 0xFFF2D0 });
      for (const x of [-0.7, 0.7]) {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.06), hlMat2);
        hl.position.set(x, 0.6, 2.31);
        g.add(hl);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
          map: headGlowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9,
        }));
        glow.position.set(x, 0.62, 2.5);
        glow.scale.set(2.4, 2.4, 1);
        g.add(glow);
      }
      // headlights smear down the wet lane ahead of the silhouette
      addStreak(g, headStreakTex, 1.7, 8, 0.03, 2.3 + 4, 0.38);
      scene.add(g);
      return g;
    }
    W.buildOncoming = buildOncoming;

    /* ---------- shared scroll ---------- */
    W.scroll = function (dz, dt) {
      dashOff += dz;
      const groupZ = dashOff % DASH_CYCLE;
      dashGroup.position.z = groupZ;
      // bend the lane dashes through curves (matrices only touched when needed)
      if (W.curveK !== 0 || dashesBent) {
        for (let i = 0; i < dashData.length; i++) {
          const d = dashData[i];
          dummy.position.set(d.x + bendX(d.z + groupZ), 0.02, d.z);
          dummy.rotation.y = bendYaw(d.z + groupZ);
          dummy.updateMatrix();
          dashes.setMatrixAt(i, dummy.matrix);
        }
        dashes.instanceMatrix.needsUpdate = true;
        dashesBent = W.curveK !== 0;
      }
      for (const c of conveyors) c.scroll(dz);
      for (const m of decalPool) {
        if (!m.userData.live) continue;
        m.position.z += dz;
        m.position.x = (m.userData.baseX || 0) + bendX(m.position.z);
        if (m.position.z > KILL_Z) {
          m.visible = false;
          m.userData.live = false;
        }
      }
      for (const m of skids) {
        if (!m.userData.live) continue;
        m.position.z += dz;
        m.position.x = m.userData.baseX + bendX(m.position.z);
        m.material.opacity -= (dt || 0.016) * 0.055;
        if (m.position.z > KILL_Z || m.material.opacity <= 0) {
          m.visible = false;
          m.userData.live = false;
        }
      }
    };

    W.THEME = THEME;
    W.LANE_X = LANE_X;
    W.ONCOMING_X = ONCOMING_X;
    W.KILL_Z = KILL_Z;
    W.SPAWN_Z = SPAWN_Z;
    return W;
  }

  window.HYW = { THEME, LANE_X, ONCOMING_X, createWorld };
})();
