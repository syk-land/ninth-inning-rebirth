// 부트스트랩 + 뷰 라우터
//
// i18n: 초기 진입 시 loadLocaleFromStorage 로 사용자 언어 복원, 토글 버튼으로 즉시 전환.
// 로케일 변경 시 모든 정적 chrome (logo/title/footer)와 현재 뷰를 재렌더한다.

import { state, loadGame, hasSave, saveGame } from "./state.js";
import { renderMenu, renderStart } from "./views/menu.js";
import { renderWeekly } from "./views/weekly.js";
import { renderShop } from "./views/shop.js";
import { renderHomerunDerby } from "./views/homerunDerby.js?v=20261120b";
import { advanceOneDay } from "./systems/tick.js";
import { loadRegressionMeta } from "./systems/regression.js";
import { loadSettings } from "./systems/settings.js";
import { initFirebase } from "./cloud/firebase.js";
import { initAuth } from "./cloud/auth.js";
import {
  t, loadLocaleFromStorage, getLocale,
} from "./i18n/index.js";
import { openSettingsModal } from "./views/settingsModal.js";
import { initAudioUnlock, playBgm, stopBgm, sfx } from "./assets/audio.js";
import { preloadImages } from "./assets/images.js";
import { showInterstitialAd } from "./systems/ads.js";

// 뷰별 BGM 매핑 — 시작/메뉴/상점은 menu 곡, 경기는 game 곡.
const VIEW_BGM = { start: "menu", menu: "menu", shop: "menu", weekly: "game", homerunderby: "game" };

const VIEWS = {
  start: renderStart,
  menu: renderMenu,
  weekly: renderWeekly,
  shop: renderShop,
  homerunderby: renderHomerunDerby,
};

function getRoot() {
  return document.getElementById("view-root");
}

const SPEED_PRESETS = [
  { label: "0.5x", ms: 1000 },
  { label: "1x",   ms: 500 },
  { label: "2x",   ms: 250 },
  { label: "4x",   ms: 125 },
];

function currentSpeedLabel() {
  const cur = state.tickSpeed ?? 500;
  const hit = SPEED_PRESETS.find(s => s.ms === cur);
  return hit ? hit.label : "1x";
}

// 정적 chrome (topbar 로고, 토글 버튼 라벨, footer 버전, document.title) 동기화
function updateChrome() {
  // 게임명은 푸터 오른쪽에 표시(헤더 로고 제거, 버전 문자열 미표시).
  const footerTitle = document.getElementById("footer-title");
  if (footerTitle) footerTitle.textContent = t("app.logo");
  const toggle = document.getElementById("locale-toggle");
  if (toggle) {
    toggle.textContent = "⚙";
    toggle.setAttribute("aria-label", t("settingsModal.title"));
  }
  const gameActive = state.view === "weekly" && !!state.season && !!state.player;
  const speedToggle = document.getElementById("speed-toggle");
  if (speedToggle) {
    speedToggle.hidden = !gameActive;
    speedToggle.disabled = !gameActive;
    speedToggle.textContent = currentSpeedLabel();
    speedToggle.setAttribute("aria-label", `${t("nav.speedAria")}: ${currentSpeedLabel()}`);
  }
  const pauseToggle = document.getElementById("pause-toggle");
  if (pauseToggle) {
    pauseToggle.disabled = !gameActive;
    pauseToggle.style.opacity = gameActive ? "1" : "0.4";
    pauseToggle.textContent = state.paused ? "▶" : "⏸";
    pauseToggle.setAttribute("aria-label", state.paused ? t("weekly.btnPlay") : t("weekly.btnPause"));
  }
  document.title = t("app.title");
  // 현재 locale 을 <html lang> 에 반영 (접근성/SEO — 한·영 병행 게임).
  document.documentElement.lang = getLocale();
}

function updateTopbar() {
  const el = document.getElementById("topbar-info");
  if (!el) return;
  if (state.player) {
    const p = state.player;
    // 단계별 level 라벨 — 고교/대학은 "{grade}학년", 프로·MLB 는 stageShort (1군/2군/A/AA/AAA/메이저).
    let level;
    if (p.stage === "high" || p.stage === "univ") {
      level = t("nav.gradeLabel", { grade: p.grade });
    } else if (p.stage === "retire") {
      level = t("nav.retiredLabel");
    } else {
      level = t("stageShort." + p.stage);
    }
    el.innerHTML = t("nav.topbarFormat", {
      name: `<strong>${escapeHtml(p.name)}</strong>`,
      team: escapeHtml(p.teamName ?? t("nav.teamPlaceholder")),
      level,
      age: p.age,
    });
  } else {
    el.innerHTML = "";
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function updateFooter() {
  const el = document.getElementById("footer-status");
  if (!el) return;
  if (state.log && state.log.length > 0) {
    const recent = state.log[0];
    el.textContent = recent.msg;
  } else {
    el.textContent = "";
  }
}

export function route(name, opts = {}) {
  // 같은 뷰 재렌더(매 tick, 자동훈련 등)에서는 스크롤 위치 유지.
  // 뷰가 실제로 바뀌었을 때만 상단으로 리셋.
  const isViewChange = state.view !== name;
  state.view = name;
  // 뷰가 실제로 바뀔 때, document.body 에 남은 모달 backdrop 제거.
  // 모달은 자기 버튼으로만 닫히므로, 브라우저/안드로이드 뒤로가기로 화면을 벗어나면
  // backdrop(position:fixed; inset:0; z-index:1000) 이 body 에 그대로 남아 다음 화면 전체
  // 클릭을 가로챈다(이어하기·새 게임 먹통). 뷰 전환 시점의 잔존 모달은 항상 스테일이므로 정리.
  //   - tick 재렌더(같은 뷰)는 건드리지 않아 경기 중 모달(결승/이벤트/훈련전환) 보존.
  //   - route() 반환 후 추가되는 모달(승격/강등 등)은 이 정리 이후라 보존.
  if (isViewChange) {
    for (const el of document.querySelectorAll("body > .modal-backdrop")) el.remove();
  }
  // 뷰 전환 시 BGM 곡 교체 (같은 곡이면 audio.js 가 무시).
  if (isViewChange && VIEW_BGM[name]) playBgm(VIEW_BGM[name]);
  const fn = VIEWS[name] ?? VIEWS.menu;
  const root = getRoot();
  fn(root, route, opts);
  updateChrome();
  updateTopbar();
  updateFooter();
  if (isViewChange) {
    // 스크롤은 #view-root 에서 일어나므로 그 컨테이너를 리셋.
    getRoot().scrollTo({ top: 0, behavior: "instant" });
  }
}

// 실시간 진행 루프 (visibilitychange 시 자동 일시 중단하여 백그라운드 점프/CPU 낭비 방지)
let tickTimer = null;
let saveCounter = 0;

function stopTickTimer() {
  if (tickTimer) {
    clearTimeout(tickTimer);
    tickTimer = null;
  }
}

function scheduleTick() {
  stopTickTimer();
  if (document.hidden) return;
  tickTimer = setTimeout(runTick, state.tickSpeed ?? 500);
}

function runTick() {
  tickTimer = null;
  if (document.hidden) return;
  // 게임 진행 가능 조건
  if (state.view !== "weekly" || !state.player || !state.season) {
    scheduleTick();
    return;
  }
  if (state.paused) {
    scheduleTick();
    return;
  }
  // 시즌 종료 시 자동 일시정지
  if (state.season.finished) {
    state.paused = true;
    route("weekly");
    scheduleTick();
    return;
  }
  advanceOneDay();
  // tick 자동 진행 시엔 fromTick 옵션으로 호출 — 타임바(일시정지/속도) 보존
  route("weekly", { fromTick: true });
  if (state.season.finished) {
    state.paused = true;
  }
  saveCounter++;
  if (saveCounter >= 10) {
    saveCounter = 0;
    saveGame();
  }
  scheduleTick();
}

function wireSettingsButton() {
  const btn = document.getElementById("locale-toggle");
  if (!btn) return;
  btn.addEventListener("click", () => openSettingsModal(route));
}

function setSimulationSpeed(ms) {
  state.tickSpeed = ms;
  saveGame();
  updateChrome();
  if (!document.hidden) scheduleTick();
}

function wireSpeedButton() {
  const btn = document.getElementById("speed-toggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    const idx = SPEED_PRESETS.findIndex(s => s.ms === (state.tickSpeed ?? 500));
    const next = SPEED_PRESETS[(idx + 1) % SPEED_PRESETS.length];
    sfx("speed");
    setSimulationSpeed(next.ms);
  });
}

function wirePauseButton() {
  const btn = document.getElementById("pause-toggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    state.paused = !state.paused;
    updateChrome();
  });
}

function wireKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) return;

    const modals = document.querySelectorAll("body > .modal-backdrop");
    if (e.key === "Escape" && modals.length > 0) {
      const top = modals[modals.length - 1];
      if (top.dataset.noDismiss == null) {
        e.preventDefault();
        top.remove();
      }
      return;
    }
    if (modals.length > 0) return;

    const gameActive = state.view === "weekly" && !!state.season && !!state.player && !state.season.finished;
    if (!gameActive) return;

    if (e.code === "Space") {
      e.preventDefault();
      state.paused = !state.paused;
      sfx("click");
      updateChrome();
    } else if (e.key === "1" || e.key === "2" || e.key === "3" || e.key === "4") {
      const preset = SPEED_PRESETS[Number(e.key) - 1];
      if (preset) {
        e.preventDefault();
        sfx("speed");
        setSimulationSpeed(preset.ms);
      }
    }
  });
}

function wireVisibilityPause() {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopTickTimer();
    } else {
      scheduleTick();
    }
  });
}

// "맨 위로" floating 버튼 — 스크롤이 일정 임계 이상이면 표시.
function setupScrollTopButton() {
  const btn = document.createElement("button");
  btn.className = "scroll-top";
  btn.type = "button";
  btn.textContent = "↑";
  btn.setAttribute("aria-label", "Scroll to top");
  const scroller = getRoot();   // 스크롤 컨테이너 = #view-root
  btn.addEventListener("click", () => {
    scroller.scrollTo({ top: 0, behavior: "smooth" });
  });
  document.body.appendChild(btn);

  const THRESHOLD = 200;
  let ticking = false;
  function update() {
    if (scroller.scrollTop > THRESHOLD) btn.classList.add("visible");
    else btn.classList.remove("visible");
    ticking = false;
  }
  scroller.addEventListener("scroll", () => {
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  }, { passive: true });
  // 초기 상태 갱신
  update();
}

// 모달 뒤로가기/닫기 관리 — body 에 붙는 .modal-backdrop 을 MutationObserver 로 감시.
//  (1) 모달이 열리면 history 트랩을 쌓아 안드로이드/브라우저 "뒤로가기" 가 앱을 나가지 않고
//      최상단 모달만 닫게 한다. (옛 버그: 오퍼 모달에서 뒤로가기 → 모달이 body 에 남아
//      시작화면 전체 클릭을 가로채 이어하기/새 게임 먹통.)
//  (2) 닫기(×) 버튼이 없는 모달엔 자동 주입. data-no-dismiss 모달(예: 군 입대)은 제외.
function setupModalManager() {
  const openModals = () => document.querySelectorAll("body > .modal-backdrop");
  const topModal = () => { const m = openModals(); return m.length ? m[m.length - 1] : null; };

  function injectCloseButton(backdrop) {
    if (backdrop.dataset.noDismiss != null) return;
    // 이미 닫기 버튼이 있으면(예: 설정 모달) 추가 안 함.
    if (backdrop.querySelector(".modal-close")) return;
    // backdrop 에 직접 붙인다 — 모달이 rerender 로 dialog.innerHTML 을 비워도 닫기 버튼이 살아남도록.
    // (position:absolute 로 flex 흐름에서 빼고 오버레이 우상단 고정.)
    const x = document.createElement("button");
    x.className = "modal-close";
    x.type = "button";
    x.setAttribute("aria-label", "Close");
    x.textContent = "×";
    x.style.cssText = "position:absolute; top:14px; right:16px; z-index:2;";
    x.addEventListener("click", () => backdrop.remove());
    backdrop.appendChild(x);
  }

  let trapped = false;       // 열린 모달이 있을 때 history 트랩 1개를 유지
  let ignorePop = false;     // 버튼/외부클릭으로 닫혀 우리가 history.back() 한 경우 무시
  function syncTrap() {
    const open = openModals().length > 0;
    if (open && !trapped) {
      history.pushState({ nirModal: true }, "");
      trapped = true;
    } else if (!open && trapped) {
      // 모달이 (뒤로가기 외) 다른 방법으로 모두 닫힘 → 쌓아둔 트랩 소비(페이지 이탈 방지).
      trapped = false;
      ignorePop = true;
      history.back();
    }
  }

  new MutationObserver(mutations => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1 && node.classList?.contains("modal-backdrop")) injectCloseButton(node);
      }
    }
    syncTrap();
  }).observe(document.body, { childList: true });

  window.addEventListener("popstate", () => {
    if (ignorePop) { ignorePop = false; return; }
    const m = topModal();
    if (!m) return;                                   // 모달 없으면 정상 뒤로가기(앱 종료 등)
    if (m.dataset.noDismiss != null) {                // 닫기 금지 모달 — 재트랩만(탈출 차단)
      history.pushState({ nirModal: true }, "");
      return;
    }
    trapped = false;                                  // 이 뒤로가기로 트랩 엔트리 소비됨
    m.remove();                                       // 최상단 모달 닫기 (남은 모달 있으면 syncTrap 이 재트랩)
  });
}

// 초기 진입
function init() {
  loadLocaleFromStorage();
  loadSettings();
  loadRegressionMeta();
  // Firebase Auth/Firestore 부팅 — firebaseConfig 비어있으면 silently 스킵.
  if (initFirebase()) {
    // 인증 상태가 늦게 도착하면(첫 익명 로그인 등) 시작화면을 다시 그려 로그인 카드를 노출.
    initAuth(() => { if (state.view === "start") route("start"); });
  }
  updateChrome();
  wireSettingsButton();
  wireSpeedButton();
  wirePauseButton();
  wireKeyboardShortcuts();
  wireVisibilityPause();
  setupScrollTopButton();
  setupModalManager();  // 뒤로가기로 모달 닫기 + 닫기(×) 버튼 자동 주입
  initAudioUnlock();   // 첫 사용자 제스처에 오디오 unlock
  preloadImages();     // preload=true 이미지 미리 받기 (없으면 조용히 실패)
  // 모든 버튼 클릭에 효과음(위임) + 모달 통과 클릭 차단.
  // 통과 클릭: 모달이 pointerdown 으로 닫히면, 같은 탭의 click 이 뒤에 드러난 요소(예: 훈련 버튼)에
  //   떨어져 의도치 않게 눌린다. pointerdown 이 모달 안에서 시작됐는데 click 이 모달 밖이면 그 click 을 무시.
  let pdInModal = false;
  document.addEventListener("pointerdown", e => {
    pdInModal = !!e.target?.closest?.(".modal-backdrop");
    const btn = e.target?.closest?.("button");
    if (btn && !btn.disabled) sfx("click");
  }, true);
  document.addEventListener("click", e => {
    if (pdInModal && !e.target?.closest?.(".modal-backdrop")) {
      e.stopPropagation();
      e.preventDefault();
    }
    pdInModal = false;
  }, true);
  // 광고(GameMonetize) 동안 BGM 일시정지/복귀 — index.html SDK onEvent 가 호출.
  window.__adPause = () => { try { stopBgm(); } catch (_) {} };
  window.__adResume = () => { try { if (VIEW_BGM[state.view]) playBgm(VIEW_BGM[state.view]); } catch (_) {} };
  route("start");
  scheduleTick();
  // 프리롤 광고는 브라우저 자동재생 차단을 피하기 위해 첫 사용자 클릭 시(index.html) 1회 실행.
}

document.addEventListener("DOMContentLoaded", init);

// 디버그용 노출
window.__gameState = state;
window.__route = route;
