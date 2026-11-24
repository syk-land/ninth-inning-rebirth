// 오디오 매니저 — 효과음(Web Audio 16-bit 합성) + BGM(지연 로드 파일).
//
// 설계:
//   - 효과음: 파일 0. Web Audio 로 즉석 16-bit 합성 (타격/홈런/삼진/클릭/스탯업/마일스톤 등).
//   - BGM:   파일 기반(manifest.BGM). preload="none" + 첫 사용자 제스처·비음소거 시점에만
//            실제 src 로드하여 초기 페이지 로딩(1.3MB×2 WAV)을 즉시 완료시킨다.
//   - 모바일/백그라운드 대응: visibilitychange / pagehide 시 BGM & AudioContext 일시정지,
//            복귀 시 자동 재개.
//   - 음소거/볼륨: systems/settings.js (muted / bgmVolume / sfxVolume).

import { getSetting } from "../systems/settings.js";
import { BGM } from "./manifest.js";

let ctx = null;
let unlocked = false;
let currentBgm = null;        // { key, el } — el 은 실제 재생 준비 시 생성
const bgmCache = {};          // key -> HTMLAudioElement
let unlockWired = false;
let adPaused = false;

function audioCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  }
  return ctx;
}
const clamp01 = v => Math.max(0, Math.min(1, v));
const isMuted = () => !!getSetting("muted");
const sfxVol  = () => clamp01(getSetting("sfxVolume") ?? 0.6);
const bgmVol  = () => clamp01(getSetting("bgmVolume") ?? 0.4);

function ensureBgmElement(key) {
  const def = BGM[key];
  if (!def) return null;
  let el = bgmCache[key];
  if (!el) {
    el = new Audio();
    el.preload = "none";
    el.loop = !!def.loop;
    el.src = def.src;
    el.addEventListener("error", () => {});   // 파일 없으면 무음
    bgmCache[key] = el;
  }
  el.volume = bgmVol();
  return el;
}

function startPendingBgmIfReady() {
  if (!currentBgm || !unlocked || isMuted() || document.hidden || adPaused) return;
  if (!currentBgm.el) {
    currentBgm.el = ensureBgmElement(currentBgm.key);
  }
  if (!currentBgm.el) return;
  currentBgm.el.volume = bgmVol();
  currentBgm.el.play().catch(() => {});
}

// 첫 사용자 제스처에 오디오 unlock (모바일/브라우저 자동재생 정책 우회 + BGM 지연 로드 트리거).
export function initAudioUnlock() {
  if (unlockWired) return;
  unlockWired = true;

  const handler = () => {
    unlocked = true;
    const c = audioCtx();
    if (c && c.state === "suspended") c.resume().catch(() => {});
    startPendingBgmIfReady();
    window.removeEventListener("pointerdown", handler);
    window.removeEventListener("keydown", handler);
  };
  window.addEventListener("pointerdown", handler, { passive: true });
  window.addEventListener("keydown", handler, { passive: true });

  // 모바일/탭 백그라운드 대응: 화면이 가려지면 BGM·AudioContext 정지, 복귀 시 이어서 재생.
  const onHidden = () => {
    if (currentBgm?.el) { try { currentBgm.el.pause(); } catch (_) {} }
    if (ctx && ctx.state === "running") { ctx.suspend().catch(() => {}); }
  };
  const onVisible = () => {
    if (ctx && ctx.state === "suspended" && unlocked && !isMuted()) {
      ctx.resume().catch(() => {});
    }
    startPendingBgmIfReady();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden || document.visibilityState === "hidden") onHidden();
    else onVisible();
  });
  window.addEventListener("pagehide", onHidden);
  window.addEventListener("pageshow", onVisible);
  window.addEventListener("gm-sdk-event", (e) => {
    const name = e?.detail?.name;
    if (name === "SDK_GAME_PAUSE") {
      adPaused = true;
      onHidden();
    } else if (name === "SDK_GAME_START") {
      adPaused = false;
      onVisible();
    }
  });
}

// ── 효과음 (Web Audio 16-bit 합성) ────────────────────────────────
function whiteNoise(c, dur) {
  const n = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  return src;
}

export function sfx(name) {
  if (isMuted() || document.hidden || adPaused) return;
  const vol = sfxVol();
  if (vol <= 0.001) return;
  const c = audioCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  const t = c.currentTime;
  const out = c.createGain();
  out.gain.value = 1;
  out.connect(c.destination);

  const tone = (freq, dur, type = "sine", peak = 0.3, delay = 0, freqEnd = null) => {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t + delay);
    if (freqEnd != null) {
      o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + delay + dur);
    }
    const env = c.createGain();
    o.connect(env); env.connect(out);
    env.gain.setValueAtTime(0.0001, t + delay);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * vol), t + delay + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
    o.start(t + delay); o.stop(t + delay + dur + 0.02);
  };
  const crack = (dur, peak = 0.4, hpFreq = 1500) => {
    const src = whiteNoise(c, dur);
    const env = c.createGain();
    const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = hpFreq;
    src.connect(hp); hp.connect(env); env.connect(out);
    env.gain.setValueAtTime(Math.max(0.0002, peak * vol), t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.start(t); src.stop(t + dur + 0.02);
  };
  const noiseBand = (filterType, freq, dur, peak, env01) => {
    const src = whiteNoise(c, dur);
    const flt = c.createBiquadFilter(); flt.type = filterType;
    if (Array.isArray(freq)) {
      flt.frequency.setValueAtTime(freq[0], t);
      flt.frequency.exponentialRampToValueAtTime(freq[1], t + dur);
    } else { flt.frequency.value = freq; flt.Q.value = 0.7; }
    const env = c.createGain();
    src.connect(flt); flt.connect(env); env.connect(out);
    env.gain.setValueAtTime(0.0001, t);
    for (const [tp, gp] of env01) {
      const time = t + dur * tp, g = Math.max(0.0001, peak * vol * gp);
      if (gp <= 0.0001) env.gain.exponentialRampToValueAtTime(g, time);
      else env.gain.linearRampToValueAtTime(g, time);
    }
    src.start(t); src.stop(t + dur + 0.02);
  };

  switch (name) {
    case "click":
      tone(740, 0.04, "square", 0.11, 0, 520);
      break;
    case "speed":
      tone(587, 0.04, "square", 0.10, 0);
      tone(880, 0.05, "square", 0.10, 0.03);
      break;
    case "pitch":
      noiseBand("lowpass", [3200, 600], 0.18, 0.22, [[0.12, 1], [1, 0.0001]]);
      break;
    case "hit":
      // 16-bit crisp wooden bat crack + pop
      crack(0.09, 0.45, 1700);
      tone(240, 0.09, "triangle", 0.22, 0, 110);
      tone(520, 0.06, "square", 0.10, 0.01, 780);
      break;
    case "out":
      crack(0.06, 0.20, 1200);
      tone(145, 0.13, "triangle", 0.16, 0, 95);
      break;
    case "homerun":
      // Big bat crack + 16-bit rising home run fanfare
      crack(0.12, 0.48, 1600);
      tone(392, 0.12, "square", 0.20, 0.02);
      tone(523, 0.14, "square", 0.22, 0.10);
      tone(659, 0.16, "square", 0.22, 0.19);
      tone(784, 0.34, "sawtooth", 0.24, 0.28);
      break;
    case "crowd":
      noiseBand("bandpass", 1100, 1.5, 0.46, [[0.18, 1], [0.5, 0.7], [1, 0.0001]]);
      break;
    case "strikeout":
      tone(220, 0.14, "square", 0.22, 0, 165);
      tone(146, 0.24, "square", 0.20, 0.09, 105);
      break;
    case "statUp":
      // Kairosoft-style crisp 16-bit stat-up chime
      tone(659, 0.07, "square", 0.13, 0);
      tone(880, 0.08, "square", 0.14, 0.055);
      tone(1175, 0.12, "triangle", 0.18, 0.11);
      break;
    case "milestone":
      // 16-bit milestone / award jingle
      tone(523, 0.09, "square", 0.16, 0);
      tone(659, 0.09, "square", 0.16, 0.08);
      tone(784, 0.09, "square", 0.16, 0.16);
      tone(1046, 0.26, "triangle", 0.24, 0.24);
      break;
    case "good":
      tone(880, 0.11, "square", 0.16, 0);
      tone(1320, 0.14, "triangle", 0.18, 0.07);
      break;
    case "bad":
      tone(180, 0.28, "sawtooth", 0.22, 0, 110);
      break;
    default:
      tone(440, 0.07, "sine", 0.16);
  }
}

// ── BGM (지연 로드 파일) ──────────────────────────────────────────
export function playBgm(key) {
  const def = BGM[key];
  if (!def) { stopBgm(); return; }
  if (currentBgm?.key === key) {
    startPendingBgmIfReady();
    return;
  }
  stopBgm();
  // unlocked && !isMuted() 전에는 Audio 요소를 생성/다운로드하지 않고 key만 기억.
  currentBgm = { key, el: null };
  startPendingBgmIfReady();
}

export function stopBgm() {
  if (!currentBgm) return;
  if (currentBgm.el) {
    try { currentBgm.el.pause(); currentBgm.el.currentTime = 0; } catch (_) {}
  }
  currentBgm = null;
}

// 설정(음소거/볼륨) 변경 시 호출 — 현재 BGM 에 즉시 반영.
export function applyAudioSettings() {
  if (!currentBgm) return;
  if (isMuted()) {
    if (currentBgm.el) {
      try { currentBgm.el.pause(); } catch (_) {}
    }
    return;
  }
  startPendingBgmIfReady();
}
