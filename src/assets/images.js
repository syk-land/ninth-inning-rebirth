// 이미지 로더 — 바이너리 이미지 + 폴백 + 비동기 디코딩/지연 로딩.
//
// createImage(key, { fallback }) 는 <img> 를 감싼 컨테이너를 반환하고,
// 파일 로드 실패(미존재 포함) 시 fallback() 의 노드로 즉시 대체한다.
// → 에셋이 아직 없어도 기존 SVG 등으로 게임이 그대로 보인다.

import { IMAGES } from "./manifest.js";

const preloadedCache = new Map();

export function createImage(key, opts = {}) {
  const {
    alt = "",
    fallback = null,
    className = "",
    style = "",
    imgStyle = "",
    onload = null,
    eager = false,
  } = opts;
  const wrap = document.createElement("div");
  if (className) wrap.className = className;
  if (style) wrap.style.cssText = style;

  const def = IMAGES[key];
  if (!def) {
    if (fallback) wrap.appendChild(fallback());
    return wrap;
  }

  const img = document.createElement("img");
  img.alt = alt;
  img.decoding = "async";
  img.loading = (eager || def.preload) ? "eager" : "lazy";
  // imgStyle: <img> 전용 추가 스타일 (예: transform:scaleX(-1) 손방향 반전). 폴백 노드엔 미적용.
  img.style.cssText = "display:block; width:100%; height:auto;" + imgStyle;
  img.addEventListener("error", () => {
    wrap.innerHTML = "";
    if (fallback) wrap.appendChild(fallback());
  });
  if (onload) img.addEventListener("load", () => onload(img, wrap));
  img.src = def.src;
  wrap.appendChild(img);
  return wrap;
}

// preload=true 인 핵심 이미지만 백그라운드로 미리 받아 캐시 (이벤트 일러스트는 lazy 유지).
export function preloadImages() {
  for (const k of Object.keys(IMAGES)) {
    const def = IMAGES[k];
    if (!def.preload || preloadedCache.has(def.src)) continue;
    const im = new Image();
    im.decoding = "async";
    im.src = def.src;
    preloadedCache.set(def.src, im);
  }
}
