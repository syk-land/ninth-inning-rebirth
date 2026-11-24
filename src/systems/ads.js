// 게임 광고(전면 인터스티셜) — GameMonetize.com SDK.
//
// 노출 시점: 시작(앱 진입) / 3시즌마다 새 시즌 / 은퇴 (호출부: main.js·weekly.js).
// SDK 가 전면 광고 UI 와 게임 일시정지(SDK_GAME_PAUSE/START)를 직접 처리하므로 여기선 "호출"만 한다.
//
// ⚠ 설정: index.html 의 SDK_OPTIONS.gameId 를 GameMonetize 에 게임 등록 후 받은 ID로 교체.
//   gameId placeholder 거나 SDK 미로드 시 — 조용히 무시(게임 흐름 영향 없음).
//
// 보상형 광고가 필요하면 showRewardedAd() 사용(보상 지급은 SDK_REWARDED_WATCH_COMPLETE 이벤트로
//   index.html onEvent 에서 처리하도록 확장).

// 시즌 광고 주기 — 매 N시즌(새 시즌 시작 시) 1회. 고교 3시즌 → 졸업 후 첫 프로시즌에 첫 노출.
const SEASON_AD_INTERVAL = 3;

// 새 시즌 시작 시 호출 — 진행 시즌 수가 주기 배수면 전면 광고.
export function maybeShowSeasonAd(seasonCount) {
  if (seasonCount > 0 && seasonCount % SEASON_AD_INTERVAL === 0) showInterstitialAd();
}

// 전면(인터스티셜) 광고 — CrazyGames SDK v3 / Yandex Games SDK / GameMonetize SDK 멀티 지원.
export function showInterstitialAd() {
  try {
    if (window.__cgSdkReady && window.CrazyGames?.SDK?.ad?.requestAd) {
      try { window.CrazyGames.SDK.game.gameplayStop(); } catch (_) {}
      window.CrazyGames.SDK.ad.requestAd("midgame", {
        adStarted: () => { try { window.__adPause && window.__adPause(); } catch (_) {} },
        adFinished: () => {
          try { window.__adResume && window.__adResume(); } catch (_) {}
          try { window.CrazyGames.SDK.game.gameplayStart(); } catch (_) {}
        },
        adError: () => {
          try { window.__adResume && window.__adResume(); } catch (_) {}
          try { window.CrazyGames.SDK.game.gameplayStart(); } catch (_) {}
        },
      });
      return;
    }
    if (window.__ysdk?.adv?.showFullscreenAdv) {
      window.__ysdk.adv.showFullscreenAdv({
        callbacks: {
          onOpen: () => { try { window.__adPause && window.__adPause(); } catch (_) {} },
          onClose: () => { try { window.__adResume && window.__adResume(); } catch (_) {} },
          onError: () => { try { window.__adResume && window.__adResume(); } catch (_) {} },
        },
      });
      return;
    }
    if (window.sdk && typeof window.sdk.showBanner === "function") {
      window.sdk.showBanner();
    } else if (typeof window.ShowAds === "function") {
      window.ShowAds();
    }
  } catch (_) { /* SDK 미준비/미설정 — 무시 */ }
}

// 보상형 광고 — CrazyGames SDK v3 / Yandex Games SDK / GameMonetize SDK 멀티 지원.
export function showRewardedAd() {
  if (window.__cgSdkReady && window.CrazyGames?.SDK?.ad?.requestAd) {
    return new Promise((resolve) => {
      try { window.CrazyGames.SDK.game.gameplayStop(); } catch (_) {}
      try {
        window.CrazyGames.SDK.ad.requestAd("rewarded", {
          adStarted: () => { try { window.__adPause && window.__adPause(); } catch (_) {} },
          adFinished: () => {
            try { window.__adResume && window.__adResume(); } catch (_) {}
            try { window.CrazyGames.SDK.game.gameplayStart(); } catch (_) {}
            resolve(true);
          },
          adError: () => {
            try { window.__adResume && window.__adResume(); } catch (_) {}
            try { window.CrazyGames.SDK.game.gameplayStart(); } catch (_) {}
            resolve(true);
          },
        });
      } catch (_) {
        resolve(true);
      }
    });
  }
  if (window.__ysdk?.adv?.showRewardedVideo) {
    return new Promise((resolve) => {
      let rewarded = false;
      try {
        window.__ysdk.adv.showRewardedVideo({
          callbacks: {
            onOpen: () => { try { window.__adPause && window.__adPause(); } catch (_) {} },
            onRewarded: () => { rewarded = true; },
            onClose: () => {
              try { window.__adResume && window.__adResume(); } catch (_) {}
              resolve(rewarded);
            },
            onError: () => {
              try { window.__adResume && window.__adResume(); } catch (_) {}
              resolve(true);
            },
          },
        });
      } catch (_) {
        resolve(true);
      }
    });
  }
  const ready =
    (window.sdk && typeof window.sdk.showBanner === "function") ||
    typeof window.ShowAds === "function";
  if (!ready) return Promise.resolve(true);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener("gm-sdk-event", onEvt);
      resolve(ok);
    };
    const onEvt = (e) => {
      const name = e?.detail?.name;
      if (!name) return;
      if (
        name === "SDK_REWARDED_WATCH_COMPLETE" ||
        name === "SDK_REWARDED_FINISHED" ||
        name === "AD_REWARDED" ||
        name === "AD_FINISHED" ||
        name === "AD_COMPLETE" ||
        name === "AD_CANCELED" ||
        name === "AD_ERROR" ||
        name === "SDK_REWARDED_NOT_AVAILABLE" ||
        name === "SDK_GAME_START"
      ) {
        finish(true);
      } else if (name === "AD_SKIPPED") {
        finish(false);
      }
    };
    const timer = setTimeout(() => finish(true), 8000);
    window.addEventListener("gm-sdk-event", onEvt);
    try {
      if (window.sdk && typeof window.sdk.showBanner === "function") {
        window.sdk.showBanner();
      } else if (typeof window.ShowAds === "function") {
        window.ShowAds("rewarded");
      } else {
        finish(true);
      }
    } catch (_) {
      finish(true);
    }
  });
}
