// Kairosoft "Home Run High" inspired 16-bit Pixel Art Live Field Viewport
// Optimized: capped DPR (<=2), dt clamping (<=50ms), visibilitychange auto-pause,
// particle/bubble caps, prefers-reduced-motion support, and real stat/match burst feedback.

import { sfx } from "../assets/audio.js";

const NW = 320;
const NH = 152;
const MAX_SPARKS = 48;
const MAX_BUBBLES = 6;
const MAX_RINGS = 6;

const STAT_ABBR = {
  contact: "CON",
  power: "PWR",
  speed: "SPD",
  eye: "EYE",
  defense: "DEF",
  mental: "MNT",
  velocity: "VEL",
  control: "CTRL",
  breaking: "BRK",
  stamina: "STA",
};

const imgCache = new Map();
function loadImg(src) {
  if (!src) return null;
  if (imgCache.has(src)) return imgCache.get(src);
  const im = new Image();
  im.decoding = "async";
  im.src = src;
  imgCache.set(src, im);
  return im;
}

function prefersReducedMotion() {
  return typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

export function createKairoStage(player, league, season) {
  const box = document.createElement("div");
  box.className = "kairo-stage-card";
  box.dataset.keep = "kairo-stage";

  const hud = document.createElement("div");
  hud.className = "kairo-stage-hud";
  hud.innerHTML = `<span class="kairo-badge" data-k="mode">PRACTICE</span><span class="kairo-streak" data-k="streak" hidden>HOT!</span><span class="kairo-ticker" data-k="ticker">PLAY BALL!</span>`;
  box.appendChild(hud);

  const canvas = document.createElement("canvas");
  canvas.className = "kairo-stage-canvas";
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(NW * dpr);
  canvas.height = Math.round(NH * dpr);
  box.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  const st = {
    mode: "practice", // "game" | "practice" | "rest"
    label: "TRAINING",
    face: 1,
    isPitcher: false,
    hotStreak: false,
    tick: 0,
    lastTs: 0,
    ball: { x: 160, y: 78, vx: 0, vy: 0, active: false, hit: false },
    bubbles: [],
    sparks: [],
    rings: [],
    rafId: null,
    lastActionSig: "",
    lastResultWeek: -1,
    milestoneTimer: null,
    spawnBubble: null,
    spawnSparks: null,
    spawnRing: null,
    triggerMilestone: null,
  };
  box._kairoState = st;

  const stadiumImg = loadImg("assets/img/field-stadium.webp");
  const practiceImg = loadImg("assets/img/field-practice.webp");

  function spawnBubble(x, y, text, bg, fg) {
    if (st.bubbles.length >= MAX_BUBBLES) st.bubbles.shift();
    st.bubbles.push({
      x: Math.max(36, Math.min(NW - 36, x)),
      y: Math.max(20, Math.min(NH - 12, y)),
      vy: -0.36,
      text,
      bg: bg || "#fff9e0",
      fg: fg || "#3b2618",
      life: 64,
    });
  }

  function spawnSparks(x, y, count, colors) {
    const palette = Array.isArray(colors) ? colors : [colors || "#ffd84d"];
    const actual = prefersReducedMotion() ? Math.min(count, 4) : count;
    for (let i = 0; i < actual; i++) {
      if (st.sparks.length >= MAX_SPARKS) st.sparks.shift();
      const a = Math.random() * Math.PI * 2;
      const spd = 0.8 + Math.random() * 1.9;
      st.sparks.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 0.6,
        color: palette[i % palette.length],
        size: Math.random() < 0.35 ? 3 : 2,
        life: 16 + Math.floor(Math.random() * 14),
      });
    }
  }

  function spawnRing(x, y, color, maxR = 26) {
    if (prefersReducedMotion()) return;
    if (st.rings.length >= MAX_RINGS) st.rings.shift();
    st.rings.push({ x, y, r: 3, maxR, color: color || "#ffe259", life: 20, maxLife: 20 });
  }

  function triggerMilestone() {
    box.classList.remove("is-milestone");
    void box.offsetWidth;
    box.classList.add("is-milestone");
    if (st.milestoneTimer) clearTimeout(st.milestoneTimer);
    st.milestoneTimer = setTimeout(() => {
      box.classList.remove("is-milestone");
      st.milestoneTimer = null;
    }, 650);
  }

  st.spawnBubble = spawnBubble;
  st.spawnSparks = spawnSparks;
  st.spawnRing = spawnRing;
  st.triggerMilestone = triggerMilestone;

  function drawKairoPlayer(cx, bottomY, opts) {
    // Authentic Kairosoft 2-head-tall chibi pixel baseball player (14x20 native pixels)
    const { flipX, capColor, jerseyColor, trimColor, role, phase, swing, aura } = opts;
    const x0 = Math.round(cx);
    const y0 = Math.round(bottomY);
    ctx.save();
    ctx.translate(x0, y0);
    if (flipX) ctx.scale(-1, 1);

    const px = (x, y, w, h, col) => {
      ctx.fillStyle = col;
      ctx.fillRect(x, y, w, h);
    };

    if (aura) {
      ctx.fillStyle = "rgba(255, 226, 89, 0.28)";
      ctx.fillRect(-9, -24, 18, 25);
    }

    const outline = "#2b1b12";
    const skin = "#ffdbb5";
    const pants = "#f7f7f2";
    const legShift = phase ? 1 : -1;

    // Legs & cleats
    px(-4, -5 + (phase ? 0 : -1), 3, 5, pants);
    px(1, -5 + (phase ? -1 : 0), 3, 5, pants);
    px(-4, -2 + (phase ? 0 : -1), 4, 2, outline);
    px(1, -2 + (phase ? -1 : 0), 4, 2, outline);

    // Jersey torso + outline
    px(-6, -13, 12, 9, outline);
    px(-5, -12, 10, 7, jerseyColor);
    px(-1, -12, 2, 7, trimColor);
    px(-5, -6, 10, 1, outline);

    // Head + face + cap
    px(-6, -22, 12, 10, outline);
    px(-5, -20, 10, 7, skin);
    px(-5, -22, 10, 3, capColor);
    px(2, -20, 5, 2, capColor);
    px(1, -17, 2, 2, outline);
    px(-2, -17, 1, 2, outline);

    // Arms & equipment (Bat or Glove)
    if (role === "batter") {
      if (swing) {
        px(4, -11, 4, 3, skin);
        px(6, -12, 11, 3, "#3b2210");
        px(7, -11, 9, 1, "#d99a54");
      } else {
        px(4, -12, 3, 3, skin);
        px(5, -22, 3, 12, "#3b2210");
        px(6, -21, 1, 10, "#d99a54");
      }
    } else {
      px(4, -11 + legShift, 4, 4, "#8c4a1c");
      px(-7, -11 - legShift, 3, 3, skin);
    }

    ctx.restore();
  }

  function drawShadow(cx, cy, rx, ry) {
    ctx.fillStyle = "rgba(30, 20, 12, 0.35)";
    ctx.beginPath();
    ctx.ellipse(Math.round(cx), Math.round(cy), rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBubble(b) {
    ctx.font = "bold 9px monospace";
    const tw = Math.ceil(ctx.measureText(b.text).width);
    const pw = tw + 10;
    const ph = 14;
    const x = Math.round(b.x - pw / 2);
    const y = Math.round(b.y - ph);
    ctx.fillStyle = "#3b2618";
    ctx.fillRect(x - 1, y - 1, pw + 2, ph + 2);
    ctx.fillStyle = b.bg;
    ctx.fillRect(x, y, pw, ph);
    ctx.fillStyle = b.fg;
    ctx.fillText(b.text, x + 5, y + 10);
  }

  function frame(ts) {
    if (!document.body.contains(box)) {
      stopLoop();
      return;
    }
    if (document.hidden) {
      st.rafId = null;
      st.lastTs = 0;
      return;
    }

    const rawDt = st.lastTs ? (ts - st.lastTs) : 16.6667;
    st.lastTs = ts;
    // Clamp dt to 50ms max to prevent jumps after tab switch or lag spikes
    const dtScale = Math.min(Math.max(rawDt, 0), 50) / 16.6667;
    const prevTickInt = Math.floor(st.tick);
    st.tick += dtScale;
    const tickInt = Math.floor(st.tick);
    const crossedTick = tickInt !== prevTickInt;

    ctx.imageSmoothingEnabled = false;
    const bg = st.mode === "game" ? stadiumImg : practiceImg;
    if (bg && bg.complete && bg.naturalWidth > 0) {
      ctx.drawImage(bg, 0, 0, NW, NH);
    } else {
      for (let i = 0; i < 16; i++) {
        ctx.fillStyle = i % 2 === 0 ? "#58b84c" : "#4ca842";
        ctx.fillRect(0, i * 10, NW, 10);
      }
      ctx.fillStyle = "#d99b52";
      ctx.beginPath();
      ctx.moveTo(160, 42);
      ctx.lineTo(245, 92);
      ctx.lineTo(160, 142);
      ctx.lineTo(75, 92);
      ctx.closePath();
      ctx.fill();
    }

    const reduced = prefersReducedMotion();
    const bounce = reduced ? 0 : Math.abs(Math.sin(st.tick * 0.16)) * 2.5;
    const stepPhase = Math.floor(st.tick / 10) % 2;

    if (st.mode === "game") {
      const px = 116;
      const py = 104;
      const bx = 212;
      const by = 114;

      const cyc = tickInt % 80;
      const swinging = cyc >= 34 && cyc <= 46;

      drawShadow(px, py, 9, 3);
      drawShadow(bx, by, 9, 3);
      drawShadow(bx + 22, by + 2, 8, 3);

      drawKairoPlayer(px, py - bounce * 0.4, {
        flipX: false,
        capColor: st.isPitcher ? "#1e6bd6" : "#d63b3b",
        jerseyColor: "#ffffff",
        trimColor: st.isPitcher ? "#1e6bd6" : "#d63b3b",
        role: "pitcher",
        phase: stepPhase,
        swing: false,
        aura: st.hotStreak && st.isPitcher,
      });
      drawKairoPlayer(bx, by - bounce * 0.5, {
        flipX: true,
        capColor: st.isPitcher ? "#d63b3b" : "#1e6bd6",
        jerseyColor: "#fffdf5",
        trimColor: st.isPitcher ? "#d63b3b" : "#1e6bd6",
        role: "batter",
        phase: stepPhase,
        swing: swinging,
        aura: st.hotStreak && !st.isPitcher,
      });
      drawKairoPlayer(bx + 22, by + 2, {
        flipX: true,
        capColor: "#2c7a3f",
        jerseyColor: "#eef2f6",
        trimColor: "#2c7a3f",
        role: "pitcher",
        phase: 0,
        swing: false,
      });

      if (crossedTick && cyc === 10) {
        st.ball = { x: px + 8, y: py - 12, vx: 3.6, vy: 0.32, active: true, hit: false };
      }
      if (st.ball.active) {
        st.ball.x += st.ball.vx * dtScale;
        st.ball.y += st.ball.vy * dtScale;
        if (!st.ball.hit && st.ball.x >= bx - 8) {
          st.ball.hit = true;
          st.ball.vx = -4.2 - Math.random() * 1.5;
          st.ball.vy = -2.8 - Math.random() * 1.2;
          spawnSparks(bx - 8, by - 12, 12, ["#ffe655", "#ff9f1c", "#ffffff"]);
          spawnRing(bx - 8, by - 12, "#ffe655", 20);
          const calls = st.isPitcher ? ["STRIKE!", "NICE PITCH!", "K!"] : ["CRACK!", "BASE HIT!", "HOMERUN!"];
          spawnBubble(bx, by - 28, calls[Math.floor(Math.random() * calls.length)], "#ffe866", "#3b2618");
        }
        if (st.ball.hit) st.ball.vy += 0.08 * dtScale;
        ctx.fillStyle = "#2a1c12";
        ctx.fillRect(Math.round(st.ball.x) - 2, Math.round(st.ball.y) - 2, 5, 5);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(Math.round(st.ball.x) - 1, Math.round(st.ball.y) - 1, 3, 3);
        if (st.ball.x < -10 || st.ball.x > NW + 10 || st.ball.y < -10 || st.ball.y > NH + 10) {
          st.ball.active = false;
        }
      }
    } else if (st.mode === "rest") {
      const cx = 160;
      const cy = 112;
      drawShadow(cx, cy, 9, 3);
      drawKairoPlayer(cx, cy - bounce * 0.25, {
        flipX: false,
        capColor: "#1e6bd6",
        jerseyColor: "#ffffff",
        trimColor: "#1e6bd6",
        role: st.isPitcher ? "pitcher" : "batter",
        phase: 0,
        swing: false,
        aura: st.hotStreak,
      });
      if (crossedTick && tickInt % 48 === 0) {
        spawnSparks(cx, cy - 18, 8, ["#6ee787", "#d4ffdc"]);
        spawnBubble(cx, cy - 28, "STAMINA UP!", "#d4ffdc", "#1d5c2a");
      }
    } else {
      const patrol = reduced ? 0 : Math.sin(st.tick * 0.045) * 46;
      const cx = 160 + patrol;
      const cy = 112;
      const facingLeft = !reduced && Math.cos(st.tick * 0.045) < 0;

      drawShadow(82, 102, 8, 3);
      drawKairoPlayer(82, 102 - bounce * 0.3, {
        flipX: false, capColor: "#2c7a3f", jerseyColor: "#fffdf5", trimColor: "#2c7a3f",
        role: "batter", phase: stepPhase, swing: (tickInt % 48) < 12,
      });
      drawShadow(242, 104, 8, 3);
      drawKairoPlayer(242, 104 - bounce * 0.3, {
        flipX: true, capColor: "#2c7a3f", jerseyColor: "#fffdf5", trimColor: "#2c7a3f",
        role: "pitcher", phase: 1 - stepPhase, swing: false,
      });

      drawShadow(cx, cy, 9, 3);
      drawKairoPlayer(cx, cy - bounce, {
        flipX: facingLeft, capColor: "#1e6bd6", jerseyColor: "#ffffff", trimColor: "#ff9f1c",
        role: st.isPitcher ? "pitcher" : "batter", phase: stepPhase, swing: (tickInt % 52) < 10,
        aura: st.hotStreak,
      });
      if (st.hotStreak && crossedTick && tickInt % 18 === 0) {
        spawnSparks(cx, cy - 12, 2, ["#ffe259", "#ff9f1c"]);
      }
      if (crossedTick && tickInt % 60 === 0 && st.bubbles.length === 0) {
        const statTags = st.isPitcher ? ["+VEL", "+CTRL", "+BRK", "+STA"] : ["+PWR", "+CON", "+SPD", "+EYE"];
        spawnSparks(cx, cy - 16, 8, "#ffd84d");
        spawnBubble(cx, cy - 28, statTags[Math.floor(Math.random() * statTags.length)], "#fff7d6", "#4a2c10");
      }
    }

    // Expanding pixel impact rings
    st.rings = st.rings.filter((r) => {
      r.life -= dtScale;
      const p = 1 - Math.max(0, r.life / r.maxLife);
      const rad = Math.round(3 + (r.maxR - 3) * p);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(Math.round(r.x), Math.round(r.y), rad, 0, Math.PI * 2);
      ctx.stroke();
      return r.life > 0;
    });

    // Sparks
    st.sparks = st.sparks.filter((s) => {
      s.x += s.vx * dtScale;
      s.y += s.vy * dtScale;
      s.vy += 0.1 * dtScale;
      s.life -= dtScale;
      ctx.fillStyle = s.color;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), s.size || 2, s.size || 2);
      return s.life > 0;
    });

    // Floating Kairosoft stat/call bubbles
    st.bubbles = st.bubbles.filter((b) => {
      b.y += b.vy * dtScale;
      b.life -= dtScale;
      drawBubble(b);
      return b.life > 0;
    });

    st.rafId = requestAnimationFrame(frame);
  }

  function startLoop() {
    if (st.rafId != null || document.hidden) return;
    st.lastTs = 0;
    st.rafId = requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (st.rafId != null) {
      cancelAnimationFrame(st.rafId);
      st.rafId = null;
    }
    st.lastTs = 0;
    document.removeEventListener("visibilitychange", onVisibility);
  }

  function onVisibility() {
    if (!document.body.contains(box)) {
      stopLoop();
      return;
    }
    if (document.hidden) {
      if (st.rafId != null) {
        cancelAnimationFrame(st.rafId);
        st.rafId = null;
      }
      st.lastTs = 0;
    } else {
      startLoop();
    }
  }

  document.addEventListener("visibilitychange", onVisibility);
  updateKairoStage(box, player, league, season);
  startLoop();
  return box;
}

export function updateKairoStage(box, player, league, season) {
  if (!box || !box._kairoState) return;
  const st = box._kairoState;
  st.face = (player?.avatar?.face ?? 0) + 1;
  st.isPitcher = player?.role === "pitcher";

  const week = (season?.weekIndex ?? 0) + 1;
  const actions = season?.weekActions ?? [];
  const latestAction = actions.length > 0 ? actions[actions.length - 1] : null;
  const recent = latestAction?.action || season?.lastAction || "";
  const isGameWeek = Boolean(season?.dayIndex >= 5 || (season?.weekResults?.length > 0 && actions.length === 0));

  if (recent === "rest") {
    st.mode = "rest";
    st.label = "REST & RECOVERY";
  } else if (isGameWeek) {
    st.mode = "game";
    st.label = "MATCH DAY";
  } else {
    st.mode = "practice";
    st.label = "CLUB PRACTICE";
  }

  // Hot streak detection: high condition (>=82) or recent multi-hit / HR / K dominance
  let hotFromGame = false;
  const results = season?.weekResults ?? [];
  if (results.length > 0) {
    for (const r of results) {
      const b = r?.mainPlayer?.batterBox;
      const p = r?.mainPlayer?.pitcherBox;
      if ((b && (b.hr > 0 || b.h >= 2)) || (p && (p.pK >= 5 || p.w > 0 || p.sv > 0))) {
        hotFromGame = true;
        break;
      }
    }
  }
  st.hotStreak = (player?.condition ?? 50) >= 82 || hotFromGame;
  box.classList.toggle("is-hot-streak", st.hotStreak);

  // Trigger real floating stat-gain popups on new daily action
  const actionSig = `${season?.weekIndex ?? 0}-${season?.dayIndex ?? 0}-${actions.length}`;
  if (latestAction && actionSig !== st.lastActionSig) {
    st.lastActionSig = actionSig;
    if (latestAction.action === "train" && latestAction.result?.gained) {
      const entries = Object.entries(latestAction.result.gained).filter(([, v]) => v > 0);
      const isCrit = !!latestAction.result.critical;
      entries.slice(0, 2).forEach(([statKey, val], idx) => {
        const abbr = STAT_ABBR[statKey] || statKey.slice(0, 3).toUpperCase();
        const txt = isCrit ? `CRIT +${abbr}!` : `+${abbr} +${val.toFixed(1)}`;
        st.spawnBubble?.(
          160 + (idx * 34 - (entries.length > 1 ? 17 : 0)),
          82 - idx * 14,
          txt,
          isCrit ? "#ffe259" : "#fff7d6",
          isCrit ? "#7a2e00" : "#4a2c10",
        );
      });
      if (isCrit) {
        st.spawnSparks?.(160, 92, 18, ["#ffe259", "#ff9f1c", "#ffffff"]);
        st.spawnRing?.(160, 92, "#ffe259", 30);
        st.triggerMilestone?.();
        sfx("statUp");
      } else if (entries.length > 0) {
        st.spawnSparks?.(160, 96, 8, ["#ffd84d", "#fff9e0"]);
      }
    } else if (latestAction.action === "rest") {
      st.spawnBubble?.(160, 84, "+STAMINA!", "#d4ffdc", "#1d5c2a");
      st.spawnSparks?.(160, 96, 8, ["#6ee787", "#d4ffdc"]);
    }
  }

  // Trigger real match-day pixel bursts (HR / HIT / K) when weekly results arrive
  if (results.length > 0 && week !== st.lastResultWeek) {
    st.lastResultWeek = week;
    let totalHr = 0;
    let totalH = 0;
    let totalK = 0;
    for (const r of results) {
      const b = r?.mainPlayer?.batterBox;
      const p = r?.mainPlayer?.pitcherBox;
      if (b) { totalHr += b.hr ?? 0; totalH += b.h ?? 0; }
      if (p) { totalK += p.pK ?? 0; }
    }
    if (totalHr > 0) {
      st.spawnSparks?.(160, 70, 24, ["#ffe259", "#ff6b4a", "#5aff87", "#ffffff"]);
      st.spawnRing?.(160, 70, "#ffe259", 36);
      st.spawnBubble?.(160, 66, totalHr > 1 ? `${totalHr} HR!!` : "HOMERUN!!", "#ffe259", "#8c1d00");
      st.triggerMilestone?.();
    } else if (totalK >= 4) {
      st.spawnSparks?.(120, 84, 16, ["#ff5757", "#ffe259", "#ffffff"]);
      st.spawnRing?.(120, 84, "#ff5757", 28);
      st.spawnBubble?.(120, 76, `${totalK} K!`, "#ffe5e5", "#991b1b");
    } else if (totalH > 0) {
      st.spawnSparks?.(204, 92, 12, ["#ffe655", "#ffffff"]);
      st.spawnRing?.(204, 92, "#ffe655", 22);
      st.spawnBubble?.(204, 82, totalH > 1 ? `${totalH} HITS!` : "BASE HIT!", "#fff7d6", "#3b2618");
    }
  }

  const modeEl = box.querySelector("[data-k='mode']");
  const streakEl = box.querySelector("[data-k='streak']");
  const tickEl = box.querySelector("[data-k='ticker']");
  if (modeEl) {
    modeEl.textContent = st.label;
    modeEl.dataset.mode = st.mode;
  }
  if (streakEl) {
    streakEl.hidden = !st.hotStreak;
  }
  if (tickEl) {
    const yr = player?.grade ?? 1;
    const lg = league?.name || "BASEBALL CLUB";
    tickEl.textContent = `${lg} · Y${yr} W${week}`;
  }
}
