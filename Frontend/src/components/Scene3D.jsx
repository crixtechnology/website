import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useTheme } from "../context/ThemeContext.jsx";
import { REDUCED } from "./ui.jsx";

// The two WebGL scenes — the home-page hero and the particle animation inside the
// laptop mockup. They live in their own file so the ~100 kB three.js library is a
// separate download that arrives AFTER the page is usable, instead of sitting in the
// main script every visitor waits for (see the lazy() wrappers in ui.jsx).

/* ---------- Hero3D: neural constellation background ---------- */
// Colors/opacities tuned separately per theme — this is a raw WebGL canvas
// (Three.js material colors), not DOM/CSS, so the CSS custom-property
// theme system (global.css's [data-theme="light"] block) can't reach it at
// all. The dark-mode values below (pale cyan/teal at low opacity) were
// tuned to pop against the near-black --ink background; over the light
// theme's near-white background the same pale, low-opacity colors read as
// washed out almost to invisible, so light gets its own deeper, more
// opaque set instead of just reusing dark's. Dark mode adds glows together
// (they light up against the dark); light mode draws them normally.
const HERO3D_PALETTE = {
  dark: {
    points: 0x7fe8e0, pointsOpacity: 0.85, line: 0x14c9c9, lineOpacity: 0.16,
    globe: [0x14c9c9, 0x7fe8e0, 0xf2b44c], globeOpacity: [0.35, 0.18, 0.2],
    node: 0x7fe8e0, core: 0x14c9c9, coreOpacity: 0.28, ring: 0x7fe8e0, ringOpacity: 0.38, spark: 0xf2b44c, glow: true,
  },
  light: {
    points: 0x0891b2, pointsOpacity: 0.9, line: 0x0d8c86, lineOpacity: 0.3,
    globe: [0x0d8c86, 0x0891b2, 0xb45309], globeOpacity: [0.55, 0.32, 0.34],
    node: 0x0e7490, core: 0x14c9c9, coreOpacity: 0.16, ring: 0x0d8c86, ringOpacity: 0.45, spark: 0xb45309, glow: false,
  },
};

// Full detail for desktops. Phones, tablets and low-power devices get the same
// scene with fewer points and lines, one orbit ring, normal pixel density and
// 30 frames a second — light enough to run there too, instead of being off.
const HERO3D_DETAIL = {
  full: { points: 420, lines: 260, connectEvery: 6, maxRatio: 1.6, antialias: true, frameMs: 0, rings: 2 },
  lite: { points: 220, lines: 140, connectEvery: 8, maxRatio: 1, antialias: false, frameMs: 33, rings: 1 },
};

export function Hero3D({ lite = false }) {
  const mountRef = useRef(null);
  const { theme } = useTheme();
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    const palette = HERO3D_PALETTE[theme] || HERO3D_PALETTE.dark;
    const detail = lite ? HERO3D_DETAIL.lite : HERO3D_DETAIL.full;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.z = 14;
    const renderer = new THREE.WebGLRenderer({ antialias: detail.antialias, alpha: true, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, detail.maxRatio));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    // A soft round glow, used for the constellation's dots, the globe's nodes,
    // its core and the travelling sparks.
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = glowCanvas.height = 64;
    const gctx = glowCanvas.getContext("2d");
    const grad = gctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.3, "rgba(255,255,255,.7)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 64, 64);
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    const blending = palette.glow ? THREE.AdditiveBlending : THREE.NormalBlending;
    const disposables = [glowTex];
    const keep = (...xs) => { disposables.push(...xs); return xs[0]; };
    const sprite = (color, opacity, scale) => {
      const s = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false, blending })));
      s.scale.setScalar(scale);
      return s;
    };

    // ----- the constellation: drifting dots, joined when they come close -----
    const N = detail.points;
    const positions = new Float32Array(N * 3);
    const speeds = [];
    for (let i = 0; i < N; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 18;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 14;
      speeds.push(0.0016 + Math.random() * 0.003);
    }
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    // Round, softly glowing dots (they were single square pixels before).
    scene.add(new THREE.Points(geo, keep(new THREE.PointsMaterial({ color: palette.points, map: glowTex, size: 0.16, transparent: true, opacity: palette.pointsOpacity, depthWrite: false, blending }))));

    const MAXL = detail.lines;
    const linePos = new Float32Array(MAXL * 6);
    const lineGeo = keep(new THREE.BufferGeometry());
    lineGeo.setAttribute("position", new THREE.BufferAttribute(linePos, 3));
    scene.add(new THREE.LineSegments(lineGeo, keep(new THREE.LineBasicMaterial({ color: palette.line, transparent: true, opacity: palette.lineOpacity }))));

    // ----- the globe -----
    // The globe sits in a "rig" so it can lean toward the cursor (rig
    // rotation) independently of its own continuous spin (cluster rotation).
    const rig = new THREE.Group();
    const cluster = new THREE.Group();
    rig.add(cluster);
    scene.add(rig);
    const GLOBES = [[2.6, 0, 0, 0], [1.1, 4.4, 1.6, -1.5], [0.8, -4.8, -2.0, 1.0]];
    const globes = GLOBES.map((c, i) => {
      const mat = keep(new THREE.MeshBasicMaterial({ color: palette.globe[i], wireframe: true, transparent: true, opacity: palette.globeOpacity[i] }));
      // the main globe is a finer geodesic sphere than before
      const m = new THREE.Mesh(keep(new THREE.IcosahedronGeometry(c[0], i === 0 ? 2 : 1)), mat);
      m.position.set(c[1], c[2], c[3]);
      cluster.add(m);
      return m;
    });
    // Glowing nodes on the main globe's corners, turning with it.
    {
      const pa = globes[0].geometry.attributes.position;
      const seen = new Set();
      const nodes = [];
      for (let i = 0; i < pa.count; i++) {
        const key = [pa.getX(i), pa.getY(i), pa.getZ(i)].map((v) => v.toFixed(2)).join();
        if (seen.has(key)) continue;
        seen.add(key);
        if (seen.size % 2) nodes.push(pa.getX(i), pa.getY(i), pa.getZ(i)); // every other corner
      }
      const nodeGeo = keep(new THREE.BufferGeometry());
      nodeGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(nodes), 3));
      globes[0].add(new THREE.Points(nodeGeo, keep(new THREE.PointsMaterial({ color: palette.node, map: glowTex, size: 0.24, transparent: true, opacity: 0.9, depthWrite: false, blending }))));
    }
    // A soft glow at the globe's heart, gently breathing.
    const core = sprite(palette.core, palette.coreOpacity, 6.5);
    cluster.add(core);
    // Links from the main globe to the two small ones, with sparks of light
    // travelling along them.
    const linkGeo = keep(new THREE.BufferGeometry());
    linkGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(GLOBES.slice(1).flatMap((c) => [0, 0, 0, c[1], c[2], c[3]])), 3));
    cluster.add(new THREE.LineSegments(linkGeo, keep(new THREE.LineBasicMaterial({ color: palette.ring, transparent: true, opacity: palette.ringOpacity, depthWrite: false }))));
    const sparks = GLOBES.slice(1).map((c, i) => {
      const sp = sprite(palette.spark, 0.95, 0.42);
      cluster.add(sp);
      return { sp, to: new THREE.Vector3(c[1], c[2], c[3]), phase: i * 0.5 };
    });
    // Thin orbit rings around the globe, each with a light travelling round it.
    const rings = [[3.5, 1.15, 0.35], [4.3, 1.9, -0.6]].slice(0, detail.rings).map(([r, tiltX, tiltZ], i) => {
      const pts = [];
      for (let k = 0; k <= 128; k++) { const a = (k / 128) * Math.PI * 2; pts.push(Math.cos(a) * r, Math.sin(a) * r, 0); }
      const ringGeo = keep(new THREE.BufferGeometry());
      ringGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
      const ring = new THREE.Group();
      ring.rotation.set(tiltX, 0, tiltZ);
      ring.add(new THREE.Line(ringGeo, keep(new THREE.LineBasicMaterial({ color: palette.ring, transparent: true, opacity: palette.ringOpacity * (i ? 0.7 : 1), depthWrite: false }))));
      const sat = sprite(palette.spark, 1, 0.5);
      ring.add(sat);
      rig.add(ring);
      return { sat, r, speed: i ? -0.006 : 0.009, a: i * 2 };
    });
    // Beside the headline on wide screens; on a narrow, upright screen (where
    // the right-hand position was mostly off the edge) tucked into the top-right
    // corner, smaller, so it stays clear of the headline.
    const place = () => {
      const narrow = mount.clientWidth < 820 || mount.clientWidth < mount.clientHeight;
      rig.position.set(narrow ? 2.7 : 4.5, narrow ? 4.6 : 0, 0);
      rig.scale.setScalar(narrow ? 0.6 : 1);
    };
    place();

    let mx = 0, my = 0, frame = 0, spinBoost = 0, lastY = window.scrollY;
    const onMove = (e) => { mx = e.clientX / window.innerWidth - 0.5; my = e.clientY / window.innerHeight - 0.5; };
    const onScrollFx = () => {
      if (REDUCED) return;
      const y = window.scrollY;
      cluster.rotation.z = y * 0.0008;
      cluster.position.y = y * 0.004;
      // Scrolling spins the globe faster for a moment; decays in step().
      spinBoost = Math.min(0.05, spinBoost + Math.abs(y - lastY) * 0.00012);
      lastY = y;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", onScrollFx, { passive: true });

    // Phone tilt (gyroscope) drives the same parallax as mouse move on desktop.
    // Baseline is whatever angle the phone is held at when the first reading
    // arrives, so the effect is relative to "however you're holding it" —
    // not an absolute flat-on-a-table orientation.
    let baseBeta = null, baseGamma = null;
    const onOrientation = (e) => {
      if (REDUCED || e.beta == null || e.gamma == null) return;
      if (baseBeta === null) { baseBeta = e.beta; baseGamma = e.gamma; }
      const dGamma = Math.max(-30, Math.min(30, e.gamma - baseGamma));
      const dBeta = Math.max(-30, Math.min(30, e.beta - baseBeta));
      mx = (dGamma / 30) * 0.5;
      my = (dBeta / 30) * 0.5;
    };
    const startMotion = () => window.addEventListener("deviceorientation", onOrientation, { passive: true });
    const requestMotion = () => {
      if (REDUCED) return;
      if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
        DeviceOrientationEvent.requestPermission().then((s) => { if (s === "granted") startMotion(); }).catch(() => {});
      } else {
        startMotion();
      }
    };
    // iOS requires a user gesture before it will grant motion permission.
    window.addEventListener("touchstart", requestMotion, { once: true, passive: true });

    const connect = () => {
      const p = geo.attributes.position.array;
      let li = 0;
      for (let i = 0; i < N && li < MAXL; i++) {
        for (let j = i + 1; j < N && li < MAXL; j += 7) {
          const dx = p[i*3]-p[j*3], dy = p[i*3+1]-p[j*3+1], dz = p[i*3+2]-p[j*3+2];
          if (dx*dx + dy*dy + dz*dz < 5.5) {
            linePos.set([p[i*3], p[i*3+1], p[i*3+2], p[j*3], p[j*3+1], p[j*3+2]], li * 6);
            li++;
          }
        }
      }
      linePos.fill(0, li * 6);
      lineGeo.attributes.position.needsUpdate = true;
    };

    // One frame. `dt` scales the motion to real elapsed time, so the 30-frames-
    // a-second version moves at the same speed as the 60 one.
    const step = (dt) => {
      const p = geo.attributes.position.array;
      const now = Date.now();
      for (let i = 0; i < N; i++) {
        p[i*3+1] += Math.sin(now * 0.0004 + i) * 0.0015 * dt;
        p[i*3] += speeds[i] * 0.4 * dt;
        if (p[i*3] > 15) p[i*3] = -15;
      }
      geo.attributes.position.needsUpdate = true;
      if (frame++ % detail.connectEvery === 0) connect();
      cluster.rotation.y += (0.0022 + spinBoost) * dt;
      cluster.rotation.x += 0.0009 * dt;
      spinBoost *= Math.pow(0.94, dt);
      // Lean toward the cursor (or phone tilt), eased.
      rig.rotation.y += (mx * 0.7 - rig.rotation.y) * 0.05;
      rig.rotation.x += (my * 0.5 - rig.rotation.x) * 0.05;
      globes.forEach((m, i) => { m.rotation.x += (0.002 + i * 0.001) * dt; m.rotation.z += 0.0015 * dt; });
      const tt = now * 0.001;
      sparks.forEach((s) => { const k = (Math.sin(tt * 0.9 + s.phase * Math.PI) + 1) / 2; s.sp.position.copy(s.to).multiplyScalar(k); });
      rings.forEach((r) => { r.a += r.speed * dt; r.sat.position.set(Math.cos(r.a) * r.r, Math.sin(r.a) * r.r, 0); });
      core.material.opacity = palette.coreOpacity * (0.85 + Math.sin(tt * 1.3) * 0.15);
      camera.position.x += (mx * 1.6 - camera.position.x) * 0.04;
      camera.position.y += (-my * 1.1 - camera.position.y) * 0.04;
      camera.lookAt(scene.position);
      renderer.render(scene, camera);
    };

    // Runs only while the hero is on screen and the tab is visible: nobody sees
    // it otherwise, so there's no reason to keep the processor busy.
    let raf = 0, running = false, onScreen = true, last = 0;
    const loop = (now) => {
      if (!running) return;
      raf = requestAnimationFrame(loop);
      if (detail.frameMs && now - last < detail.frameMs) return;
      const dt = last ? Math.min(3, (now - last) / 16.7) : 1; // in 60-fps frames
      last = now;
      step(dt);
    };
    const update = () => {
      const should = !REDUCED && onScreen && !document.hidden;
      if (should && !running) { running = true; last = 0; raf = requestAnimationFrame(loop); }
      if (!should && running) { running = false; cancelAnimationFrame(raf); }
    };
    const io = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((es) => { onScreen = es.some((e) => e.isIntersecting); update(); })
      : null;
    if (io) io.observe(mount);
    document.addEventListener("visibilitychange", update);
    connect();
    step(0); // a first frame straight away (the only one with reduced motion)
    update();

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      place();
      if (!running) renderer.render(scene, camera);
    };
    window.addEventListener("resize", onResize);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      if (io) io.disconnect();
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScrollFx);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("touchstart", requestMotion);
      window.removeEventListener("deviceorientation", onOrientation);
      // Disposes GPU-side geometry/material/texture buffers, not just the
      // renderer — this effect re-runs on every theme toggle, so without this
      // a few toggles back and forth would leak WebGL resources.
      disposables.forEach((x) => x.dispose());
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [theme, lite]);
  return <div className="bg3d" ref={mountRef}></div>;
}

/* ---------- MorphParticles: a cloud of points that morphs between icon shapes,
   the effect from the reference reel, rebuilt for Crix (teal/cyan, on-brand shapes) ---------- */
function seg(a, b, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  return pts;
}
function arc(cx, cy, r, a0, a1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = a0 + (a1 - a0) * (i / n); pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]); }
  return pts;
}
function resample(points, count) {
  const out = new Array(count);
  for (let i = 0; i < count; i++) out[i] = points[Math.min(points.length - 1, Math.floor((i / count) * points.length))];
  return out;
}

const SHAPES = [
  { name: "Internships", gen: () => [
    ...seg([0, 0.62], [0.78, 0.30], 20), ...seg([0.78, 0.30], [0, -0.02], 20),
    ...seg([0, -0.02], [-0.78, 0.30], 20), ...seg([-0.78, 0.30], [0, 0.62], 20),
    ...seg([-0.24, -0.06], [0.24, -0.06], 10), ...seg([0.24, -0.06], [0.24, -0.30], 8),
    ...seg([0.24, -0.30], [-0.24, -0.30], 10), ...seg([-0.24, -0.30], [-0.24, -0.06], 8),
    ...seg([0.22, 0.32], [0.36, -0.34], 14),
  ] },
  { name: "IT Services", gen: () => [
    ...seg([-0.95, 0.42], [-1.35, 0], 24), ...seg([-1.35, 0], [-0.95, -0.42], 24),
    ...seg([-0.18, 0.62], [0.18, -0.62], 28),
    ...seg([0.95, 0.42], [1.35, 0], 24), ...seg([1.35, 0], [0.95, -0.42], 24),
  ] },
  { name: "Courses", gen: () => [
    ...arc(0, 0.30, 0.52, 0, Math.PI * 2, 48),
    ...seg([-0.20, -0.22], [0.20, -0.22], 10), ...seg([0.20, -0.22], [0.13, -0.50], 10),
    ...seg([0.13, -0.50], [-0.13, -0.50], 8), ...seg([-0.13, -0.50], [-0.20, -0.22], 10),
    ...seg([-0.09, -0.50], [-0.09, -0.64], 6), ...seg([0.09, -0.50], [0.09, -0.64], 6),
  ] },
  { name: "AI Agents", gen: () => {
    let pts = [...arc(0, 0, 0.12, 0, Math.PI * 2, 16)];
    const N = 6;
    for (let i = 0; i < N; i++) {
      const ang = (Math.PI * 2 / N) * i - Math.PI / 2;
      const nx = Math.cos(ang) * 0.85, ny = Math.sin(ang) * 0.85;
      pts = pts.concat(seg([0, 0], [nx, ny], 14), arc(nx, ny, 0.11, 0, Math.PI * 2, 14));
    }
    return pts;
  } },
];
const PARTICLE_COUNT = 900;

export function MorphParticles() {
  const mountRef = useRef(null);
  const [label, setLabel] = useState(SHAPES[0].name);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const targets = SHAPES.map((s) => resample(s.gen(), PARTICLE_COUNT));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 20);
    camera.position.z = 4.6;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const spriteCanvas = document.createElement("canvas");
    spriteCanvas.width = spriteCanvas.height = 64;
    const sctx = spriteCanvas.getContext("2d");
    const grad = sctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.4, "rgba(200,250,245,.8)");
    grad.addColorStop(1, "rgba(20,201,201,0)");
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 64, 64);
    const spriteTex = new THREE.CanvasTexture(spriteCanvas);

    const N = PARTICLE_COUNT;
    const positions = new Float32Array(N * 3);
    const current = new Float32Array(N * 3);
    const from = new Float32Array(N * 3);
    const to = new Float32Array(N * 3);
    const colors = new Float32Array(N * 3);

    const colA = new THREE.Color(0x7fe8e0), colB = new THREE.Color(0x14c9c9), colC = new THREE.Color(0xf2b44c);
    for (let i = 0; i < N; i++) {
      const p = targets[0][i];
      current[i * 3] = p[0] * 1.7; current[i * 3 + 1] = p[1] * 1.7; current[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
      const c = Math.random() < 0.08 ? colC : (Math.random() < 0.5 ? colA : colB);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    positions.set(current);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.045, map: spriteTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, vertexColors: true, opacity: 0.9,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    let shapeIdx = 0, morphing = false, morphStart = 0, raf = 0, alive = true;
    const morphDur = 1500, t0 = performance.now();

    const startMorph = () => {
      const nextIdx = (shapeIdx + 1) % SHAPES.length;
      for (let i = 0; i < N; i++) {
        from[i * 3] = current[i * 3]; from[i * 3 + 1] = current[i * 3 + 1]; from[i * 3 + 2] = current[i * 3 + 2];
        const p = targets[nextIdx][i];
        to[i * 3] = p[0] * 1.7; to[i * 3 + 1] = p[1] * 1.7; to[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
      }
      shapeIdx = nextIdx;
      morphing = true; morphStart = performance.now();
      setLabel(SHAPES[shapeIdx].name);
    };
    const interval = setInterval(() => { if (!REDUCED) startMorph(); }, 3600);

    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    const animate = () => {
      if (!alive) return;
      raf = requestAnimationFrame(animate);
      const now = performance.now();
      const pos = geo.attributes.position.array;
      if (morphing) {
        const t = Math.min((now - morphStart) / morphDur, 1);
        const e = ease(t);
        for (let i = 0; i < N; i++) {
          current[i * 3] = from[i * 3] + (to[i * 3] - from[i * 3]) * e;
          current[i * 3 + 1] = from[i * 3 + 1] + (to[i * 3 + 1] - from[i * 3 + 1]) * e;
          current[i * 3 + 2] = from[i * 3 + 2] + (to[i * 3 + 2] - from[i * 3 + 2]) * e;
        }
        if (t >= 1) morphing = false;
      }
      const drift = (now - t0) * 0.0002;
      for (let i = 0; i < N; i++) {
        pos[i * 3] = current[i * 3] + Math.sin(drift * 2 + i) * 0.01;
        pos[i * 3 + 1] = current[i * 3 + 1] + Math.cos(drift * 2 + i * 1.3) * 0.01;
        pos[i * 3 + 2] = current[i * 3 + 2];
      }
      geo.attributes.position.needsUpdate = true;
      points.rotation.y = Math.sin(drift * 0.6) * 0.15;
      points.rotation.x = Math.cos(drift * 0.4) * 0.05;
      renderer.render(scene, camera);
    };
    if (REDUCED) renderer.render(scene, camera); else animate();

    const onResize = () => {
      if (!mount.clientWidth || !mount.clientHeight) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);
    // The mount div can still be mid-layout (width 0) the instant this effect
    // fires — a ResizeObserver catches the real size as soon as it settles,
    // not just on window resize.
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      alive = false;
      clearInterval(interval);
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      renderer.dispose(); mat.dispose(); geo.dispose(); spriteTex.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="particle-stage" ref={mountRef}>
      <span className="particle-label">{label}</span>
    </div>
  );
}
