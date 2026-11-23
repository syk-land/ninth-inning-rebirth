// 9th Inning Career Sim - Kairosoft-Style Spotlight Tutorial (KO/EN auto-sync)
(function () {
  const STORAGE_KEY = "ninth_inning_tutorial_seen_v1";

  function isKo() {
    try {
      const saved = localStorage.getItem("locale") || localStorage.getItem("ninth_locale") || "";
      if (saved === "ko") return true;
      if (saved === "en") return false;
      const btn = document.querySelector(".locale-toggle");
      if (btn && btn.textContent && btn.textContent.includes("EN")) return true;
    } catch {}
    return /^ko\b/i.test(navigator.language || "");
  }

  function getSteps() {
    if (isKo()) {
      return [
        {
          title: "1. 주간 스케줄 & 야구부 특훈",
          img: "assets/img/field-practice.webp",
          body: "매주 훈련·경기·휴식을 조합해 투수/타자 능력치를 키우세요. 컨디션과 체력을 관리하면 부상을 막고 성장 효율이 올라갑니다.",
          hint: "그라운드에 흘린 땀방울이 기적을 만든다...",
          target: ".kairo-stage-card",
          cta: "다음 →",
          skip: "건너뛰기",
          prev: "이전",
        },
        {
          title: "2. 실시간 경기 중계 & 결승전",
          img: "assets/img/field-stadium.webp",
          body: "경기 주간과 토너먼트 결승에서는 16-bit 야구장 라이브 중계가 펼쳐집니다. 배속 버튼(0.5x~4x)으로 원하는 템포로 관전하세요.",
          hint: "9회말 2아웃, 타석에 들어설 시간이다...",
          target: null,
          cta: "다음 →",
          skip: "건너뛰기",
          prev: "이전",
        },
        {
          title: "3. 드래프트 · MLB · 명예의 전당",
          img: "assets/img/event-champion.webp",
          body: "고교 우승과 프로 드래프트, FA 계약, 국제대회를 거쳐 최종 목표인 명예의 전당(HOF) 영구결번에 도전하세요!",
          hint: "전설의 등번호를 야구 역사에 새겨라.",
          target: null,
          cta: "플레이볼!",
          skip: "건너뛰기",
          prev: "이전",
        },
      ];
    }
    return [
      {
        title: "1. Weekly Schedule & Club Drills",
        img: "assets/img/field-practice.webp",
        body: "Balance Training, Matches, and Rest each week to build your pitcher or batter stats. Keep stamina high to prevent injuries and maximize growth.",
        hint: "Every drop of sweat on the practice dirt counts...",
        target: ".kairo-stage-card",
        cta: "Next →",
        skip: "Skip",
        prev: "Prev",
      },
      {
        title: "2. Live 16-Bit Match & Finals",
        img: "assets/img/field-stadium.webp",
        body: "Watch live 16-bit stadium play-by-play and tournament finals with pitcher/batter POV action. Adjust playback speed (0.5x–4x) anytime.",
        hint: "Bottom of the 9th, two outs. Step up to the plate...",
        target: null,
        cta: "Next →",
        skip: "Skip",
        prev: "Prev",
      },
      {
        title: "3. Draft, FA & Hall of Fame",
        img: "assets/img/event-champion.webp",
        body: "Win high school championships, enter the Pro Draft, negotiate FA contracts, and chase the ultimate goal: Hall of Fame immortality!",
        hint: "Carve your jersey number into baseball history.",
        target: null,
        cta: "Play Ball!",
        skip: "Skip",
        prev: "Prev",
      },
    ];
  }

  function injectStyles() {
    if (document.getElementById("kairo-tut-style")) return;
    const st = document.createElement("style");
    st.id = "kairo-tut-style";
    st.textContent = `
      .kairo-tut-help-btn{position:fixed;right:12px;bottom:52px;z-index:9990;width:34px;height:34px;border-radius:8px;border:2px solid #4a3321;background:#ffe259;color:#3b2412;font-weight:900;font-size:15px;cursor:pointer;box-shadow:0 3px 0 #4a3321;display:flex;align-items:center;justify-content:center}
      .kairo-tut-help-btn:active{transform:translateY(2px);box-shadow:0 1px 0 #4a3321}
      .kairo-tut-backdrop{position:fixed;inset:0;z-index:9999;background:rgba(20,38,18,.74);display:flex;align-items:center;justify-content:center;padding:16px}
      .kairo-tut-card{width:100%;max-width:340px;background:#fff9ea;border:3px solid #4a3321;border-radius:10px;padding:14px;color:#2f1f14;box-shadow:0 5px 0 #4a3321,0 12px 28px rgba(0,0,0,.45);animation:kTutFloat 2.4s ease-in-out infinite}
      .kairo-tut-img{width:100%;height:132px;object-fit:cover;border-radius:6px;border:2px solid #4a3321;margin-bottom:10px;image-rendering:pixelated}
      .kairo-tut-title{font-size:15px;font-weight:900;color:#1d522b;margin:0 0 6px;border-bottom:2px dashed #d6c39c;padding-bottom:5px}
      .kairo-tut-body{font-size:13px;line-height:1.5;color:#2f1f14;margin:0 0 8px}
      .kairo-tut-hint{font-size:11px;font-style:italic;color:#6e553f;margin:0 0 12px}
      .kairo-tut-footer{display:flex;align-items:center;justify-content:space-between;gap:8px}
      .kairo-tut-dots{display:flex;gap:5px}
      .kairo-tut-dot{width:8px;height:8px;border-radius:2px;background:#d6c39c;border:1px solid #4a3321}
      .kairo-tut-dot.active{background:#ff9f1c}
      .kairo-tut-btns{display:flex;gap:6px}
      .kairo-tut-btn{padding:6px 11px;border-radius:6px;border:2px solid #4a3321;background:#fff4d6;color:#2f1f14;font-size:12px;font-weight:800;cursor:pointer;box-shadow:0 2px 0 #4a3321}
      .kairo-tut-btn.primary{background:#ff9f1c;color:#ffffff;text-shadow:1px 1px 0 #7a3e00}
      @keyframes kTutFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
    `;
    document.head.appendChild(st);
  }

  function openTutorial(startIdx) {
    injectStyles();
    const existing = document.getElementById("kairo-tut-backdrop");
    if (existing) existing.remove();
    const STEPS = getSteps();
    let idx = startIdx || 0;

    const bd = document.createElement("div");
    bd.id = "kairo-tut-backdrop";
    bd.className = "kairo-tut-backdrop";
    document.body.appendChild(bd);

    function render() {
      const step = STEPS[idx];
      bd.innerHTML = `
        <div class="kairo-tut-card">
          <img class="kairo-tut-img" src="${step.img}" onerror="this.style.display='none'" alt="" />
          <h3 class="kairo-tut-title">${step.title}</h3>
          <p class="kairo-tut-body">${step.body}</p>
          <p class="kairo-tut-hint">${step.hint}</p>
          <div class="kairo-tut-footer">
            <div class="kairo-tut-dots">${STEPS.map((_, i) => `<span class="kairo-tut-dot ${i === idx ? "active" : ""}"></span>`).join("")}</div>
            <div class="kairo-tut-btns">
              <button class="kairo-tut-btn" data-act="skip">${step.skip}</button>
              ${idx > 0 ? `<button class="kairo-tut-btn" data-act="prev">${step.prev}</button>` : ""}
              <button class="kairo-tut-btn primary" data-act="next">${step.cta}</button>
            </div>
          </div>
        </div>
      `;
      bd.querySelector("[data-act='skip']").onclick = close;
      const prevBtn = bd.querySelector("[data-act='prev']");
      if (prevBtn) prevBtn.onclick = () => { idx--; render(); };
      bd.querySelector("[data-act='next']").onclick = () => {
        if (idx < STEPS.length - 1) { idx++; render(); } else { close(); }
      };
    }

    function close() {
      bd.remove();
      try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
    }

    render();
  }

  function init() {
    injectStyles();
    if (!document.getElementById("kairo-tut-help-btn")) {
      const btn = document.createElement("button");
      btn.id = "kairo-tut-help-btn";
      btn.className = "kairo-tut-help-btn";
      btn.title = "Tutorial / Guide";
      btn.textContent = "?";
      btn.onclick = () => openTutorial(0);
      document.body.appendChild(btn);
    }
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setTimeout(() => openTutorial(0), 500);
      }
    } catch {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
