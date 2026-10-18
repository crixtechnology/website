import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useTheme } from "../context/ThemeContext.jsx";
import { REDUCED } from "./ui.jsx";

// The two WebGL scenes — the home-page hero and the particle animation inside the
// laptop mockup. They live in their own file so the ~100 kB three.js library is a
// separate download that arrives AFTER the page is usable, instead of sitting in the
// main script every visitor waits for (see the lazy() wrappers in ui.jsx).

/* ---------- Hero3D: holographic globe over a drifting constellation ---------- */
// Colors/opacities tuned separately per theme — this is a raw WebGL canvas
// (Three.js material colors), not DOM/CSS, so the CSS custom-property
// theme system (global.css's [data-theme="light"] block) can't reach it at
// all. Dark mode adds glows together (they light up against the near-black
// background); light mode uses deeper colors drawn normally, since pale,
// added-together glows wash out to nothing over the near-white background.
// `body` matches each theme's page background, so the globe's far side is
// hidden behind a sphere that blends into the page.
const HERO3D_PALETTE = {
  dark: {
    points: 0x7fe8e0, pointsOpacity: 0.8, line: 0x14c9c9, lineOpacity: 0.14,
    grid: 0x14c9c9, gridOpacity: 0.2, land: 0x7fe8e0, landOpacity: 0.95,
    body: 0x060b1a, bodyOpacity: 0.88, rim: 0x14c9c9, halo: 0x14c9c9, haloOpacity: 0.6,
    arc: 0x14c9c9, arcOpacity: 0.5, pulse: 0xf2b44c, ping: 0x7fe8e0,
    ring: 0x7fe8e0, ringOpacity: 0.35, moon: 0xf2b44c, moonOpacity: 0.6, glow: true,
  },
  light: {
    points: 0x0891b2, pointsOpacity: 0.85, line: 0x0d8c86, lineOpacity: 0.26,
    grid: 0x0d8c86, gridOpacity: 0.32, land: 0x0e7490, landOpacity: 0.95,
    body: 0xf5f7fb, bodyOpacity: 0.9, rim: 0x14c9c9, halo: 0x14c9c9, haloOpacity: 0.4,
    arc: 0x0d8c86, arcOpacity: 0.6, pulse: 0xb45309, ping: 0x0e7490,
    ring: 0x0d8c86, ringOpacity: 0.45, moon: 0xb45309, moonOpacity: 0.75, glow: false,
  },
};

// Full detail for desktops. Phones, tablets and low-power devices get the same
// scene with fewer dots, arcs and lines, one orbit ring, normal pixel density
// and 30 frames a second — light enough to run there too, instead of being off.
const HERO3D_DETAIL = {
  full: { points: 360, lines: 220, connectEvery: 6, maxRatio: 1.6, antialias: true, frameMs: 0, rings: 2, dots: 2600, arcs: 10, segs: 48 },
  lite: { points: 160, lines: 100, connectEvery: 8, maxRatio: 1, antialias: false, frameMs: 33, rings: 1, dots: 1500, arcs: 6, segs: 32 },
};

const GLOBE_R = 2.6;
const ARC_PTS = 40;

// Where the "land" is: a smooth, made-up pattern over the sphere, so the dots
// gather into continent-like patches. The same every time (no randomness).
const isLand = (x, y, z) =>
  Math.sin(3.4 * x + 1.3) * Math.cos(2.9 * y - 0.4) +
  0.6 * Math.sin(4.6 * z + 2.1) * Math.cos(3.8 * x + 0.7) +
  0.35 * Math.sin(7.3 * y + 0.5) > 0.22;

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

    const disposables = [];
    const keep = (...xs) => { disposables.push(...xs); return xs[0]; };
    const blending = palette.glow ? THREE.AdditiveBlending : THREE.NormalBlending;
    // A soft-edged texture drawn once on a small canvas: `stops` are
    // [position 0-1 from the centre, opacity].
    const radialTex = (stops) => {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const g = c.getContext("2d");
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      stops.forEach(([at, a]) => grad.addColorStop(at, `rgba(255,255,255,${a})`));
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
      return keep(new THREE.CanvasTexture(c));
    };
    const dotTex = radialTex([[0, 1], [0.3, 0.7], [1, 0]]);
    const sprite = (color, opacity, scale) => {
      const s = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: dotTex, color, transparent: true, opacity, depthWrite: false, blending })));
      s.scale.setScalar(scale);
      return s;
    };
    const lineMat = (color, opacity, extra) => keep(new (extra && extra.dashSize ? THREE.LineDashedMaterial : THREE.LineBasicMaterial)({ color, transparent: true, opacity, depthWrite: false, ...extra }));
    const geometry = (arr) => {
      const g = keep(new THREE.BufferGeometry());
      g.setAttribute("position", new THREE.BufferAttribute(arr instanceof Float32Array ? arr : new Float32Array(arr), 3));
      return g;
    };

    // ----- the constellation: drifting dots, joined when they come close -----
    const N = detail.points;
    const positions = new Float32Array(N * 3);
    const speeds = [];
    for (let i = 0; i < N; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 18;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 14 - 3;
      speeds.push(0.0016 + Math.random() * 0.003);
    }
    const geo = geometry(positions);
    scene.add(new THREE.Points(geo, keep(new THREE.PointsMaterial({ color: palette.points, map: dotTex, size: 0.14, transparent: true, opacity: palette.pointsOpacity, depthWrite: false, blending }))));
    const MAXL = detail.lines;
    const linePos = new Float32Array(MAXL * 6);
    const lineGeo = geometry(linePos);
    scene.add(new THREE.LineSegments(lineGeo, lineMat(palette.line, palette.lineOpacity)));

    // ----- the globe -----
    // It sits in a "rig" that leans toward the cursor (rig rotation), and
    // spins on its own tilted axis inside it (globe rotation).
    const rig = new THREE.Group();
    const tilt = new THREE.Group();
    tilt.rotation.set(0.28, 0, 0.32);
    const globe = new THREE.Group();
    tilt.add(globe);
    rig.add(tilt);
    scene.add(rig);
    const R = GLOBE_R;

    // A sphere the color of the page hides the far side, so the globe reads as
    // solid; its edge is lit (a "rim"), like an atmosphere seen from space.
    const body = new THREE.Mesh(
      keep(new THREE.SphereGeometry(R * 0.99, lite ? 32 : 48, lite ? 24 : 32)),
      keep(new THREE.ShaderMaterial({
        transparent: true,
        uniforms: { body: { value: new THREE.Color(palette.body) }, rim: { value: new THREE.Color(palette.rim) }, alpha: { value: palette.bodyOpacity } },
        vertexShader: "varying float f; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vec3 n = normalize(normalMatrix * normal); f = pow(1.0 - abs(dot(n, normalize(-mv.xyz))), 2.6); gl_Position = projectionMatrix * mv; }",
        fragmentShader: "uniform vec3 body; uniform vec3 rim; uniform float alpha; varying float f; void main(){ gl_FragColor = vec4(mix(body, rim, f * 0.85), mix(alpha, 1.0, f)); }",
      })),
    );
    body.renderOrder = -1; // drawn first, so it hides only what lies behind it
    globe.add(body);

    // The wire: lines of latitude and longitude.
    {
      const g = [];
      const r = R * 1.002;
      for (let lat = -75; lat <= 75; lat += 15) {
        const phi = (lat * Math.PI) / 180, y = Math.sin(phi) * r, rr = Math.cos(phi) * r;
        for (let k = 0; k < 96; k++) {
          const a0 = (k / 96) * Math.PI * 2, a1 = ((k + 1) / 96) * Math.PI * 2;
          g.push(Math.cos(a0) * rr, y, Math.sin(a0) * rr, Math.cos(a1) * rr, y, Math.sin(a1) * rr);
        }
      }
      for (let m = 0; m < 18; m++) {
        const th = (m / 18) * Math.PI * 2;
        for (let k = 0; k < 48; k++) {
          const p0 = -Math.PI / 2 + (k / 48) * Math.PI, p1 = -Math.PI / 2 + ((k + 1) / 48) * Math.PI;
          g.push(Math.cos(p0) * Math.cos(th) * r, Math.sin(p0) * r, Math.cos(p0) * Math.sin(th) * r,
            Math.cos(p1) * Math.cos(th) * r, Math.sin(p1) * r, Math.cos(p1) * Math.sin(th) * r);
        }
      }
      globe.add(new THREE.LineSegments(geometry(g), lineMat(palette.grid, palette.gridOpacity)));
    }

    // Glowing dots, spread evenly over the sphere, kept only on "land".
    const land = [];
    {
      const pts = [];
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < detail.dots; i++) {
        const y = 1 - (i / (detail.dots - 1)) * 2, rr = Math.sqrt(1 - y * y), th = golden * i;
        const x = Math.cos(th) * rr, z = Math.sin(th) * rr;
        if (!isLand(x, y, z)) continue;
        pts.push(x * R * 1.006, y * R * 1.006, z * R * 1.006);
        land.push(new THREE.Vector3(x, y, z));
      }
      globe.add(new THREE.Points(geometry(pts), keep(new THREE.PointsMaterial({ color: palette.land, map: dotTex, size: lite ? 0.13 : 0.1, transparent: true, opacity: palette.landOpacity, depthWrite: false, blending }))));
    }

    // Data arcs between places on the globe: a faint path, a bright pulse
    // that runs along it, and a ripple where the pulse lands.
    const pingGeo = keep(new THREE.RingGeometry(0.07, 0.11, 32));
    const arcs = [];
    for (let i = 0; i < detail.arcs && land.length > 2; i++) {
      const a = land[Math.floor(Math.random() * land.length)];
      let b = land[Math.floor(Math.random() * land.length)];
      for (let t = 0; t < 20 && a.distanceTo(b) < 0.6; t++) b = land[Math.floor(Math.random() * land.length)];
      const lift = R * (1.12 + a.distanceTo(b) * 0.35);
      const mid = a.clone().add(b).normalize().multiplyScalar(lift);
      const curve = new THREE.QuadraticBezierCurve3(a.clone().multiplyScalar(R * 1.01), mid, b.clone().multiplyScalar(R * 1.01));
      const arr = new Float32Array((ARC_PTS + 1) * 3);
      curve.getPoints(ARC_PTS).forEach((p, k) => arr.set([p.x, p.y, p.z], k * 3));
      const pathGeo = geometry(arr);
      globe.add(new THREE.Line(pathGeo, lineMat(palette.arc, palette.arcOpacity)));
      // the pulse: the same points, drawn only a short stretch at a time
      const pulseGeo = keep(new THREE.BufferGeometry());
      pulseGeo.setAttribute("position", pathGeo.getAttribute("position"));
      pulseGeo.setDrawRange(0, 0);
      globe.add(new THREE.Line(pulseGeo, lineMat(palette.pulse, 0.95)));
      const head = sprite(palette.pulse, 1, 0.34);
      head.visible = false;
      globe.add(head);
      const ping = new THREE.Mesh(pingGeo, keep(new THREE.MeshBasicMaterial({ color: palette.ping, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending })));
      ping.position.copy(b).multiplyScalar(R * 1.012);
      ping.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), b);
      globe.add(ping);
      arcs.push({ arr, pulseGeo, head, ping, period: 2.6 + Math.random() * 2.4, offset: Math.random() * 5 });
    }

    // A soft halo around the globe (a flat glow that always faces the camera).
    const halo = new THREE.Sprite(keep(new THREE.SpriteMaterial({
      map: radialTex([[0, 0], [0.6, 0], [0.665, 0.85], [0.74, 0.32], [1, 0]]),
      color: palette.halo, transparent: true, opacity: palette.haloOpacity, depthWrite: false, blending,
    })));
    halo.scale.setScalar((R * 2) / 0.665 * 1.005);
    rig.add(halo);

    // Orbit rings; the first carries a small amber wire moon (the old globe's
    // satellites), the second (desktop) is dashed with a light running round.
    const rings = [[R * 1.42, 1.2, 0.42], [R * 1.72, 1.85, -0.55]].slice(0, detail.rings).map(([r, tiltX, tiltZ], i) => {
      const pts = [];
      for (let k = 0; k <= 160; k++) { const a = (k / 160) * Math.PI * 2; pts.push(Math.cos(a) * r, Math.sin(a) * r, 0); }
      const ringGeo = geometry(pts);
      const line = new THREE.Line(ringGeo, i ? lineMat(palette.ring, palette.ringOpacity * 0.8, { dashSize: 0.18, gapSize: 0.14 }) : lineMat(palette.ring, palette.ringOpacity));
      if (i) line.computeLineDistances();
      const ring = new THREE.Group();
      ring.rotation.set(tiltX, 0, tiltZ);
      ring.add(line);
      let rider;
      if (i === 0) {
        rider = new THREE.Mesh(keep(new THREE.IcosahedronGeometry(0.34, 1)), keep(new THREE.MeshBasicMaterial({ color: palette.moon, wireframe: true, transparent: true, opacity: palette.moonOpacity })));
        rider.add(sprite(palette.moon, 0.5, 1.1));
      } else {
        rider = sprite(palette.pulse, 1, 0.42);
      }
      ring.add(rider);
      rig.add(ring);
      return { rider, r, speed: i ? -0.005 : 0.007, a: i * 2.4 };
    });

    // Beside the headline on wide screens. On a narrow, upright screen it is
    // larger than the screen's width allows beside the text, so it sits low,
    // behind the buttons, like a planet rising — clear of the headline.
    const place = () => {
      const narrow = mount.clientWidth < 820 || mount.clientWidth < mount.clientHeight;
      const halfH = camera.position.z * Math.tan((camera.fov * Math.PI) / 360);
      const halfW = halfH * camera.aspect;
      if (narrow) {
        const s = Math.min(1, (halfW * 0.92) / (R * 1.42));
        rig.scale.setScalar(s);
        rig.position.set(halfW * 0.22, -halfH * 0.56, 0);
      } else {
        rig.scale.setScalar(1);
        rig.position.set(Math.min(4.8, halfW * 0.42), -0.2, 0);
      }
    };
    place();

    let mx = 0, my = 0, frame = 0, spinBoost = 0, lastY = window.scrollY, scrollShift = 0;
    const onMove = (e) => { mx = e.clientX / window.innerWidth - 0.5; my = e.clientY / window.innerHeight - 0.5; };
    const onScrollFx = () => {
      if (REDUCED) return;
      const y = window.scrollY;
      scrollShift = y * 0.004;
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
    const TRAIL = 0.28;
    const step = (dt) => {
      const p = geo.attributes.position.array;
      const now = Date.now();
      const tt = now * 0.001;
      for (let i = 0; i < N; i++) {
        p[i*3+1] += Math.sin(now * 0.0004 + i) * 0.0015 * dt;
        p[i*3] += speeds[i] * 0.4 * dt;
        if (p[i*3] > 15) p[i*3] = -15;
      }
      geo.attributes.position.needsUpdate = true;
      if (frame++ % detail.connectEvery === 0) connect();
      globe.rotation.y += (0.0018 + spinBoost) * dt;
      spinBoost *= Math.pow(0.94, dt);
      tilt.position.y += (scrollShift - tilt.position.y) * 0.1;
      // Lean toward the cursor (or phone tilt), eased.
      rig.rotation.y += (mx * 0.6 - rig.rotation.y) * 0.05;
      rig.rotation.x += (my * 0.4 - rig.rotation.x) * 0.05;
      // Each pulse runs its arc, then a ripple spreads where it lands.
      arcs.forEach((arc) => {
        const u = (((tt + arc.offset) % arc.period) / arc.period) * 1.6; // 0-1 travelling, then a pause
        const headAt = Math.min(u, 1);
        const from = Math.floor(Math.max(0, Math.min(u, 1 + TRAIL) - TRAIL) * ARC_PTS);
        const to = Math.floor(headAt * ARC_PTS);
        arc.pulseGeo.setDrawRange(from, Math.max(0, to - from + 1));
        arc.head.visible = u < 1;
        if (u < 1) arc.head.position.set(arc.arr[to * 3], arc.arr[to * 3 + 1], arc.arr[to * 3 + 2]);
        const k = u >= 1 ? Math.min(1, (u - 1) / 0.45) : 0; // ripple progress
        arc.ping.material.opacity = u >= 1 ? (1 - k) * 0.9 : 0;
        arc.ping.scale.setScalar(1 + k * 3.2);
      });
      rings.forEach((r) => { r.a += r.speed * dt; r.rider.position.set(Math.cos(r.a) * r.r, Math.sin(r.a) * r.r, 0); r.rider.rotation.x += 0.01 * dt; r.rider.rotation.y += 0.014 * dt; });
      halo.material.opacity = palette.haloOpacity * (0.88 + Math.sin(tt * 1.2) * 0.12);
      camera.position.x += (mx * 1.4 - camera.position.x) * 0.04;
      camera.position.y += (-my * 1 - camera.position.y) * 0.04;
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
