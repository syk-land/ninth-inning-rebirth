// Kairosoft "Home Run High" inspired 16-bit Pixel Art Live Field Viewport
const NW = 320;
const NH = 152;

const imgCache = new Map();
function loadImg(src) {
  if (!src) return null;
  if (imgCache.has(src)) return imgCache.get(src);
  const im = new Image();
  im.src = src;
  imgCache.set(src, im);
  return im;
}

export function createKairoStage(player, league, season) {
  const box = document.createElement("div");
  box.className = "kairo-stage-card";
  box.dataset.keep = "kairo-stage";

  const hud = document.createElement("div");
  hud.className = "kairo-stage-hud";
  hud.innerHTML = `<span class="kairo-badge" data-k="mode">PRACTICE</span><span class="kairo-ticker" data-k="ticker">PLAY BALL!</span>`;
  box.appendChild(hud);

  const canvas = document.createElement("canvas");
  canvas.className = "kairo-stage-canvas";
  canvas.width = NW;
  canvas.height = NH;
  box.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const st = {
    mode: "practice", // "game" | "practice" | "rest"
    label: "TRAINING",
    face: 1,
    isPitcher: false,
    tick: 0,
    ball: { x: 160, y: 78, vx: 0, vy: 0, active: false, hit: false },
    bubbles: [],
    sparks: [],
    rafId: null,
    lastWeek: -1,
  };
  box._kairoState = st;

  const stadiumImg = loadImg("assets/img/field-stadium.webp");
  const practiceImg = loadImg("assets/img/field-practice.webp");

  function spawnBubble(x, y, text, bg, fg) {
    st.bubbles.push({ x, y, vy: -0.38, text, bg: bg || "#fff9e0", fg: fg || "#3b2618", life: 64 });
  }

  function spawnSparks(x, y, count, color) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 0.8 + Math.random() * 1.8;
      st.sparks.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 0.5, color, life: 16 + Math.floor(Math.random() * 12) });
    }
  }

  function drawKairoPlayer(cx, bottomY, opts) {
    // Authentic Kairosoft 2-head-tall chibi pixel baseball player (14x20 native pixels)
    const { flipX, capColor, jerseyColor, trimColor, role, phase, swing } = opts;
    const x0 = Math.round(cx);
    const y0 = Math.round(bottomY);
    ctx.save();
    ctx.translate(x0, y0);
    if (flipX) ctx.scale(-1, 1);

    const px = (x, y, w, h, col) => {
      ctx.fillStyle = col;
      ctx.fillRect(x, y, w, h);
    };
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
    px(-1, -12, 2, 7, trimColor); // stripe/placket
    px(-5, -6, 10, 1, outline);   // belt

    // Head + face + cap
    px(-6, -22, 12, 10, outline);
    px(-5, -20, 10, 7, skin);
    px(-5, -22, 10, 3, capColor); // cap crown
    px(2, -20, 5, 2, capColor);   // cap visor facing right
    px(1, -17, 2, 2, outline);    // crisp eye
    px(-2, -17, 1, 2, outline);   // second eye

    // Arms & equipment (Bat or Glove)
    if (role === "batter") {
      if (swing) {
        // Horizontal swing follow-through
        px(4, -11, 4, 3, skin);
        px(6, -12, 11, 3, "#3b2210");
        px(7, -11, 9, 1, "#d99a54");
      } else {
        // Ready batting stance holding bat up
        px(4, -12, 3, 3, skin);
        px(5, -22, 3, 12, "#3b2210");
        px(6, -21, 1, 10, "#d99a54");
      }
    } else {
      // Pitcher glove + throwing arm
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

  function frame() {
    if (!document.body.contains(box)) {
      st.rafId = null;
      return;
    }
    st.tick++;

    const bg = st.mode === "game" ? stadiumImg : practiceImg;
    if (bg && bg.complete && bg.naturalWidth > 0) {
      ctx.drawImage(bg, 0, 0, NW, NH);
    } else {
      // Kairosoft-style sunny striped grass fallback while image loads
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

    const bounce = Math.abs(Math.sin(st.tick * 0.16)) * 2.5;
    const stepPhase = Math.floor(st.tick / 10) % 2;

    if (st.mode === "game") {
      // Pitcher on mound (left-center), Batter at plate (right-center), Catcher behind
      const px = 116;
      const py = 104;
      const bx = 212;
      const by = 114;

      const cyc = st.tick % 80;
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
      });
      drawKairoPlayer(bx, by - bounce * 0.5, {
        flipX: true,
        capColor: st.isPitcher ? "#d63b3b" : "#1e6bd6",
        jerseyColor: "#fffdf5",
        trimColor: st.isPitcher ? "#d63b3b" : "#1e6bd6",
        role: "batter",
        phase: stepPhase,
        swing: swinging,
      });
      // Cute teammate / catcher
      drawKairoPlayer(bx + 22, by + 2, {
        flipX: true,
        capColor: "#2c7a3f",
        jerseyColor: "#eef2f6",
        trimColor: "#2c7a3f",
        role: "pitcher",
        phase: 0,
        swing: false,
      });

      if (cyc === 10) {
        st.ball = { x: px + 8, y: py - 12, vx: 3.6, vy: 0.32, active: true, hit: false };
      }
      if (st.ball.active) {
        st.ball.x += st.ball.vx;
        st.ball.y += st.ball.vy;
        if (!st.ball.hit && st.ball.x >= bx - 8) {
          st.ball.hit = true;
          st.ball.vx = -4.2 - Math.random() * 1.5;
          st.ball.vy = -2.8 - Math.random() * 1.2;
          spawnSparks(bx - 8, by - 12, 12, "#ffe655");
          const calls = st.isPitcher ? ["STRIKE!", "NICE PITCH!", "K!"] : ["CRACK!", "BASE HIT!", "HOMERUN!"];
          spawnBubble(bx, by - 28, calls[Math.floor(Math.random() * calls.length)], "#ffe866", "#3b2618");
        }
        if (st.ball.hit) st.ball.vy += 0.08;
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
      });
      if (st.tick % 45 === 0) {
        spawnSparks(cx, cy - 18, 8, "#6ee787");
        spawnBubble(cx, cy - 28, "STAMINA UP!", "#d4ffdc", "#1d5c2a");
      }
    } else {
      // Club Practice: main player + 2 club teammates running drills!
      const patrol = Math.sin(st.tick * 0.045) * 46;
      const cx = 160 + patrol;
      const cy = 112;
      const facingLeft = Math.cos(st.tick * 0.045) < 0;

      // Teammate 1 (batting drill on left)
      drawShadow(82, 102, 8, 3);
      drawKairoPlayer(82, 102 - bounce * 0.3, {
        flipX: false, capColor: "#2c7a3f", jerseyColor: "#fffdf5", trimColor: "#2c7a3f",
        role: "batter", phase: stepPhase, swing: (st.tick % 48) < 12,
      });
      // Teammate 2 (catch ball on right)
      drawShadow(242, 104, 8, 3);
      drawKairoPlayer(242, 104 - bounce * 0.3, {
        flipX: true, capColor: "#2c7a3f", jerseyColor: "#fffdf5", trimColor: "#2c7a3f",
        role: "pitcher", phase: 1 - stepPhase, swing: false,
      });

      // Main player (blue cap, running/training)
      drawShadow(cx, cy, 9, 3);
      drawKairoPlayer(cx, cy - bounce, {
        flipX: facingLeft, capColor: "#1e6bd6", jerseyColor: "#ffffff", trimColor: "#ff9f1c",
        role: st.isPitcher ? "pitcher" : "batter", phase: stepPhase, swing: (st.tick % 52) < 10,
      });
      if (st.tick % 52 === 0) {
        const statTags = st.isPitcher ? ["+VEL", "+CTRL", "+BRK", "+STA"] : ["+PWR", "+CON", "+SPD", "+EYE"];
        spawnSparks(cx, cy - 16, 10, "#ffd84d");
        spawnBubble(cx, cy - 28, statTags[Math.floor(Math.random() * statTags.length)], "#fff7d6", "#4a2c10");
      }
    }

    // Sparks
    st.sparks = st.sparks.filter((s) => {
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.1;
      s.life--;
      ctx.fillStyle = s.color;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), 2, 2);
      return s.life > 0;
    });

    // Floating Kairosoft stat/call bubbles
    st.bubbles = st.bubbles.filter((b) => {
      b.y += b.vy;
      b.life--;
      drawBubble(b);
      return b.life > 0;
    });

    st.rafId = requestAnimationFrame(frame);
  }

  updateKairoStage(box, player, league, season);
  st.rafId = requestAnimationFrame(frame);
  return box;
}

export function updateKairoStage(box, player, league, season) {
  if (!box || !box._kairoState) return;
  const st = box._kairoState;
  st.face = (player?.avatar?.face ?? 0) + 1;
  st.isPitcher = player?.role === "pitcher";

  const week = season?.week ?? 1;
  const recent = season?.lastAction || season?.weekAction || "";
  const isGameWeek = Boolean(season?.hasGameThisWeek || (week >= 1 && week <= 28 && week % 2 === 0));
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

  const modeEl = box.querySelector("[data-k='mode']");
  const tickEl = box.querySelector("[data-k='ticker']");
  if (modeEl) {
    modeEl.textContent = st.label;
    modeEl.dataset.mode = st.mode;
  }
  if (tickEl) {
    const yr = season?.year ?? 1;
    const lg = league?.name || "BASEBALL CLUB";
    tickEl.textContent = `${lg} · Y${yr} W${week}`;
  }
}
