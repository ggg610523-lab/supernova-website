(function () {
  "use strict";

  var canvas = document.getElementById("supernova");
  var ctx = canvas.getContext("2d");
  var DPR = 1, W = 0, H = 0;
  var TAU = Math.PI * 2;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  // Seeded PRNG so the rhythm feels intentional, not random noise.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rand = mulberry32(20261012);

  // Pre-rendered glow sprites (fast additive blending, no per-frame gradients).
  function makeGlow(rgb) {
    var s = 64, c = document.createElement("canvas");
    c.width = c.height = s;
    var g = c.getContext("2d");
    var grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, "rgba(" + rgb + ",1)");
    grd.addColorStop(0.35, "rgba(" + rgb + ",0.55)");
    grd.addColorStop(1, "rgba(" + rgb + ",0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    return c;
  }
  var GLOW = [
    makeGlow("255,255,255"),
    makeGlow("160,200,255"),
    makeGlow("170,130,255")
  ];

  // Twinkling starfield
  var stars = [];
  for (var i = 0; i < 200; i++) {
    stars.push({
      x: rand() * W,
      y: rand() * H,
      r: rand() * 1.2 + 0.2,
      base: rand() * 0.5 + 0.2,
      tw: rand() * TAU,
      ts: rand() * 0.03 + 0.006,
      drift: (rand() - 0.5) * 0.04
    });
  }

  // ---- State machine: idle -> collapse -> boom -> reform ----
  var phase = "idle";
  var timer = 0;
  var cx = W / 2, cy = H * 0.44;
  var coreScale = 1;
  var coreSpin = 0;
  var coreFlash = 0;
  var shake = 0;

  var rays = [];    // radial light spokes
  var embers = [];  // ejected debris
  var waves = [];   // expanding shockwave rings
  var puffs = [];   // soft nebula blooms

  function placeCore() {
    cx = W * (0.5 + (rand() - 0.5) * 0.45);
    cy = H * (0.44 + (rand() - 0.5) * 0.16);
  }

  function detonate() {
    coreFlash = 1;
    shake = 7;

    // Shockwave rings of differing speed and weight
    waves.push({ r: 0, v: 7.5, w: 6, life: 1, decay: 0.008 });
    waves.push({ r: 0, v: 5.0, w: 3, life: 1, decay: 0.011 });
    waves.push({ r: 0, v: 10.5, w: 2, life: 1, decay: 0.016 });

    // Radial ray bursts
    var rayCount = 42;
    for (var r = 0; r < rayCount; r++) {
      rays.push({
        ang: (r / rayCount) * TAU + rand() * 0.1,
        len: 0,
        v: 14 + rand() * 16,
        life: 1,
        decay: 0.02 + rand() * 0.02,
        w: 1 + rand() * 2.4
      });
    }

    // Swirling embers
    var count = 280;
    for (var e = 0; e < count; e++) {
      var ang = rand() * TAU;
      var spd = 2 + Math.pow(rand(), 0.55) * 9;
      embers.push({
        x: cx,
        y: cy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 1,
        decay: 0.005 + rand() * 0.014,
        size: 0.6 + rand() * 2.2,
        spin: (rand() - 0.5) * 0.14,
        glow: (rand() < 0.55 ? 0 : (rand() < 0.5 ? 1 : 2))
      });
    }

    // Nebula bloom
    puffs.push({ r: 30, v: 3.2, life: 1, decay: 0.006 });
    puffs.push({ r: 20, v: 2.0, life: 1, decay: 0.009 });
  }

  function step() {
    timer++;
    switch (phase) {
      case "idle":
        if (timer > 260) { phase = "collapse"; timer = 0; }
        break;
      case "collapse":
        coreScale = 1 - Math.min(timer / 34, 1) * 0.6;
        if (timer > 34) { phase = "boom"; timer = 0; detonate(); }
        break;
      case "boom":
        coreScale = 0.4 + Math.min(timer / 30, 1) * 1.35;
        if (timer > 190) {
          phase = "reform";
          timer = 0;
        }
        break;
      case "reform":
        coreScale = 1.75 - Math.min(timer / 40, 1) * 0.75;
        if (timer > 60) {
          placeCore();
          rays.length = 0;
          embers.length = 0;
          waves.length = 0;
          puffs.length = 0;
          coreScale = 1;
          phase = "idle";
          timer = 0;
        }
        break;
    }
    coreFlash = Math.max(0, coreFlash - 0.045);
    shake *= 0.86;
    coreSpin += 0.006;
  }

  function drawStars() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < stars.length; i++) {
      var st = stars[i];
      st.tw += st.ts;
      st.x += st.drift;
      if (st.x < -2) st.x = W + 2; else if (st.x > W + 2) st.x = -2;
      var a = st.base * (0.55 + 0.45 * Math.sin(st.tw));
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.r, 0, TAU);
      ctx.fillStyle = "#dfe8ff";
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPuffs() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var i = puffs.length - 1; i >= 0; i--) {
      var p = puffs[i];
      p.r += p.v;
      p.v *= 0.99;
      p.life -= p.decay;
      if (p.life <= 0) { puffs.splice(i, 1); continue; }
      var size = p.r * 7;
      ctx.globalAlpha = p.life * 0.28;
      ctx.drawImage(GLOW[2], cx - size / 2, cy - size / 2, size, size);
    }
    ctx.restore();
  }

  function drawWaves() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var i = waves.length - 1; i >= 0; i--) {
      var w = waves[i];
      w.r += w.v;
      w.v *= 0.994;
      w.life -= w.decay;
      if (w.life <= 0) { waves.splice(i, 1); continue; }
      ctx.globalAlpha = w.life * 0.7;
      ctx.strokeStyle = "#cfe0ff";
      ctx.lineWidth = w.w * (0.35 + w.life);
      ctx.beginPath();
      ctx.arc(cx, cy, w.r, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRays() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (var i = rays.length - 1; i >= 0; i--) {
      var ry = rays[i];
      ry.len += ry.v;
      ry.v *= 0.97;
      ry.life -= ry.decay;
      if (ry.life <= 0) { rays.splice(i, 1); continue; }
      var x2 = cx + Math.cos(ry.ang) * ry.len;
      var y2 = cy + Math.sin(ry.ang) * ry.len;
      ctx.globalAlpha = ry.life * 0.85;
      ctx.strokeStyle = "#eaf1ff";
      ctx.lineWidth = ry.w * ry.life;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEmbers() {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var i = embers.length - 1; i >= 0; i--) {
      var e = embers[i];
      // swirl + drag + slight gravity
      var c = Math.cos(e.spin), s = Math.sin(e.spin);
      var nvx = e.vx * c - e.vy * s;
      var nvy = e.vx * s + e.vy * c;
      e.vx = nvx * 0.986;
      e.vy = nvy * 0.986 + 0.006;
      e.x += e.vx;
      e.y += e.vy;
      e.life -= e.decay;
      if (e.life <= 0) { embers.splice(i, 1); continue; }
      var size = e.size * (10 + e.life * 14);
      ctx.globalAlpha = Math.max(0, e.life);
      ctx.drawImage(GLOW[e.glow], e.x - size / 2, e.y - size / 2, size, size);
    }
    ctx.restore();
  }

  function drawCore() {
    var r = 46 * coreScale;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // Soft outer corona
    var outer = r * 6;
    ctx.globalAlpha = 0.22 + coreFlash * 0.4;
    ctx.drawImage(GLOW[1], cx - outer / 2, cy - outer / 2, outer, outer);

    // Rotating corona spokes (idle life)
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = "#dce7ff";
    ctx.lineWidth = 1;
    for (var k = 0; k < 8; k++) {
      var a = coreSpin + (k / 8) * TAU;
      var len = r * (3.4 + 0.6 * Math.sin(coreSpin * 3 + k));
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      ctx.stroke();
    }

    // Hot core
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.35, "rgba(214,228,255,0.95)");
    g.addColorStop(0.7, "rgba(120,165,255,0.8)");
    g.addColorStop(1, "rgba(120,90,240,0)");
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();

    ctx.restore();
  }

  function drawFlash() {
    if (coreFlash <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var R = Math.max(W, H) * 0.9;
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, "rgba(255,255,255," + coreFlash * 0.9 + ")");
    g.addColorStop(0.25, "rgba(190,215,255," + coreFlash * 0.4 + ")");
    g.addColorStop(1, "rgba(120,140,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawVignette() {
    var g = ctx.createRadialGradient(
      W / 2, H * 0.45, Math.min(W, H) * 0.3,
      W / 2, H * 0.45, Math.max(W, H) * 0.75
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(4,5,12,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function frame() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    step();

    if (shake > 0.2) {
      ctx.translate((rand() - 0.5) * shake, (rand() - 0.5) * shake);
    }

    drawStars();
    drawPuffs();
    drawWaves();
    drawRays();
    drawEmbers();
    drawCore();
    drawFlash();

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawVignette();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  document.getElementById("year").textContent = new Date().getFullYear();
})();
