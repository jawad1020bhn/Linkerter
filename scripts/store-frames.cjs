#!/usr/bin/env node
/* Chrome Web Store frames.
 *
 * The extension popup is a fixed 400x580 surface, so a raw popup screenshot cannot be a
 * 1280x800 store image. Each frame here composes the real popup (served by the preview
 * server) inside a marketing layout at an exact store size. Nothing in this directory
 * ships: scripts/ and store/ are never part of the runtime archive.
 *
 *   node scripts/build-store-assets.cjs        -> store/*.png
 *
 * Frames are plain HTML with no network access, no web fonts and no build step.
 */
"use strict";

const STORE_SIZES = Object.freeze({
  screenshot: { width: 1280, height: 800 },
  small: { width: 440, height: 280 },
  large: { width: 920, height: 680 },
  marquee: { width: 1400, height: 560 }
});

const COPY = Object.freeze({
  eyebrow: "LINKEDIN FEED TOOL",
  name: "Linkerter",
  title: "Scroll less.\nFind the jobs that matter.",
  lede: "Adaptive feed scrolling with a local hiring detector. A private pipeline, and exports that never leave your machine.",
  points: [
    "Detects openings, recruiter searches and job-seeker posts",
    "New since your last run, saved, and applied — one click each",
    "Exports to JSON, CSV, HTML and Markdown",
    "No AI service, no uploads, no telemetry"
  ],
  foot: "Local only · Runs in your browser · Chrome MV3",
  smallTitle: "Scroll less.\nFind the jobs.",
  smallLede: "Adaptive LinkedIn feed tool with local hiring detection.",
  marqueeTitle: "Your feed, triaged.",
  marqueeLede: "Adaptive scrolling, local hiring detection, and a private applied pipeline."
});

/* ── Frame CSS ─────────────────────────────────────────────────────────────
   Shared by every frame. Sizes come from the frame spec as custom properties, so one
   stylesheet covers 440x280 through 1400x560 without per-size duplication. */
const BASE_CSS = `
*,
*::before,
*::after { box-sizing: border-box; }

:root {
  --navy: #0d1a24;
  --ink: #16222e;
  --muted: #5a6a76;
  --paper: #f4f7f8;
  --surface: #ffffff;
  --teal: #0b7a63;
  --teal-deep: #096553;
  --teal-tint: #e3f4ef;
  --line: #dfe5e9;
  --shadow: 0 28px 70px rgba(13, 26, 36, 0.18), 0 4px 14px rgba(13, 26, 36, 0.08);
}

html, body { margin: 0; height: 100%; }

body {
  width: var(--frame-w);
  height: var(--frame-h);
  overflow: hidden;
  background: var(--paper);
  color: var(--ink);
  font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* Soft instrument-grid backdrop: reads as a product surface, not a slide template. */
body::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(1000px 620px at 88% -12%, rgba(11, 122, 99, 0.16), transparent 62%),
    radial-gradient(760px 520px at -8% 108%, rgba(16, 28, 38, 0.09), transparent 60%),
    linear-gradient(to right, rgba(13, 26, 36, 0.055) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(13, 26, 36, 0.055) 1px, transparent 1px);
  background-size: auto, auto, 48px 48px, 48px 48px;
  pointer-events: none;
}

.frame {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: var(--copy-w) var(--popup-w);
  align-items: center;
  gap: var(--gap);
  width: 100%;
  height: 100%;
  padding: var(--pad-y) var(--pad-x);
}

.copy { display: flex; flex-direction: column; gap: 18px; }

.brand { display: flex; align-items: center; gap: 10px; }

.brand img { width: 34px; height: 34px; border-radius: 9px; }

.brand span {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.eyebrow {
  margin: 0;
  color: var(--teal-deep);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.16em;
}

h1 {
  margin: 0;
  font-size: var(--title-size);
  line-height: 1.06;
  font-weight: 700;
  letter-spacing: -0.03em;
  white-space: pre-line;
  text-wrap: balance;
}

.lede {
  margin: 0;
  max-width: 34ch;
  color: var(--muted);
  font-size: var(--lede-size);
  line-height: 1.55;
}

.points {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.points li {
  position: relative;
  padding-left: 26px;
  font-size: 14.5px;
  line-height: 1.45;
  color: var(--ink);
}

.points li::before {
  content: "";
  position: absolute;
  left: 0;
  top: 4px;
  width: 15px;
  height: 15px;
  border-radius: 999px;
  background: var(--teal-tint);
  border: 1px solid var(--teal);
}

.points li::after {
  content: "";
  position: absolute;
  left: 5px;
  top: 8px;
  width: 5px;
  height: 3px;
  border-left: 1.6px solid var(--teal-deep);
  border-bottom: 1.6px solid var(--teal-deep);
  transform: rotate(-45deg);
}

.foot {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12.5px;
  letter-spacing: 0.01em;
}

.device {
  width: 400px;
  height: 580px;
  border-radius: 18px;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
}

.device iframe {
  display: block;
  width: 400px;
  height: 580px;
  border: 0;
  background: var(--surface);
}

/* ── Promo tiles ─────────────────────────────────────────────── */
.tile {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--tile-gap);
  height: 100%;
  padding: var(--tile-pad);
}

.tile-row { display: flex; align-items: center; gap: 14px; }

.tile-row img { width: var(--tile-icon); height: var(--tile-icon); border-radius: 12px; }

.tile-row strong { font-size: var(--tile-name); letter-spacing: -0.02em; }

.tile h1 {
  font-size: var(--tile-title);
  line-height: 1.1;
  max-width: var(--tile-title-w, 16ch);
}

.tile p { margin: 0; color: var(--muted); font-size: var(--tile-lede); line-height: 1.5; max-width: var(--tile-lede-w, 34ch); }

.tile-chips { display: flex; flex-wrap: wrap; gap: 8px; }

.tile-chips span {
  padding: 4px 11px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  font-size: 12.5px;
  font-weight: 600;
}

.wide { display: grid; grid-template-columns: 1.05fr 0.95fr; align-items: center; gap: 56px; }

.wide section { display: flex; flex-direction: column; gap: var(--tile-gap); }

.wide .points { gap: 11px; }
`;

/* ── Frame definitions ──────────────────────────────────────────────────── */

const POPUP_CONFIG = (config) => JSON.stringify(config);

const frames = [
  {
    id: "screenshot-1-pipeline",
    kind: "screenshot",
    title: "Hiring pipeline",
    copy: { title: COPY.title, lede: COPY.lede, points: COPY.points.slice(0, 3) },
    popup: { tab: "hiring", scroll: 610 }
  },
  {
    id: "screenshot-2-scroll",
    kind: "screenshot",
    title: "Adaptive scrolling",
    copy: {
      title: "Adaptive pace,\nhard limits.",
      lede: "Standard, fast, or super fast — with time and step caps, input pauses, and a stop that always works.",
      points: [
        "Reading pauses are automatic, not a fixed timer",
        "Session caps keep one run from running away",
        "Scrolling continues in the background tab"
      ]
    },
    popup: { tab: "scroll" }
  },
  {
    id: "screenshot-3-settings",
    kind: "screenshot",
    title: "Settings and shortcuts",
    copy: {
      title: "Every limit\nin one place.",
      lede: "Detection, history, exports and keyboard shortcuts — grouped instead of scattered.",
      points: [
        "Ctrl+Shift+L opens the popup",
        "Ctrl+Shift+M starts or stops the hiring monitor",
        "Ctrl+Shift+S starts or pauses feed scrolling"
      ]
    },
    popup: { tab: "hiring", settings: true, details: ["settingsCommandsTitle"], scroll: 110 }
  },
  {
    id: "promo-small",
    kind: "small",
    title: "Small promo tile"
  },
  {
    id: "promo-large",
    kind: "large",
    title: "Large promo tile",
    copy: {
      title: "Scroll less.\nFind the jobs that matter.",
      lede: "Adaptive feed scrolling with a local hiring detector, a private pipeline, and exports that never leave your machine.",
      points: COPY.points
    },
    popup: { tab: "hiring", scroll: 810 }
  },
  {
    id: "promo-marquee",
    kind: "marquee",
    title: "Marquee tile"
  }
];

function sizeFor(kind) {
  return STORE_SIZES[kind];
}

function layoutVars(kind) {
  if (kind === "screenshot") {
    return "--frame-w: 1280px; --frame-h: 800px; --copy-w: 560px; --popup-w: 400px; " +
      "--gap: 76px; --pad-x: 76px; --pad-y: 88px; --title-size: 46px; --lede-size: 17px;";
  }
  if (kind === "large") {
    return "--frame-w: 920px; --frame-h: 680px; --copy-w: 372px; --popup-w: 400px; " +
      "--gap: 36px; --pad-x: 56px; --pad-y: 50px; --title-size: 34px; --lede-size: 14.5px;";
  }
  if (kind === "marquee") {
    return "--frame-w: 1400px; --frame-h: 560px; " +
      "--tile-pad: 56px 84px; --tile-gap: 16px; --tile-icon: 40px; --tile-name: 21px; " +
      "--tile-title: 50px; --tile-lede: 17px; --tile-title-w: 13ch; --tile-lede-w: 36ch;";
  }
  return "--frame-w: 440px; --frame-h: 280px; --tile-pad: 30px 34px; --tile-gap: 12px; " +
    "--tile-icon: 34px; --tile-name: 19px; --tile-title: 30px; --tile-lede: 14px; " +
    "--tile-title-w: 16ch; --tile-lede-w: 34ch;";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
}

function pointsHtml(points = []) {
  if (!points.length) return "";
  return `<ul class="points">${points.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>`;
}

function screenshotBody(frame) {
  const copy = frame.copy;
  return `<main class="frame">
    <section class="copy">
      <div class="brand"><img src="/icons/icon-48.png" alt=""><span>${COPY.name}</span></div>
      <p class="eyebrow">${COPY.eyebrow}</p>
      <h1>${escapeHtml(copy.title)}</h1>
      <p class="lede">${escapeHtml(copy.lede)}</p>
      ${pointsHtml(copy.points)}
      <p class="foot">${COPY.foot}</p>
    </section>
    <div class="device">
      <iframe id="popup" title="Linkerter popup" src="/popup.html" data-config="${escapeHtml(POPUP_CONFIG(frame.popup))}"></iframe>
    </div>
  </main>`;
}

function promoBody(frame) {
  if (frame.kind === "small") {
    return `<main class="tile">
      <div class="tile-row"><img src="/icons/icon-48.png" alt=""><strong>${COPY.name}</strong></div>
      <h1>${escapeHtml(COPY.smallTitle)}</h1>
      <p>${escapeHtml(COPY.smallLede)}</p>
    </main>`;
  }
  return `<main class="tile wide">
    <section>
      <div class="tile-row"><img src="/icons/icon-48.png" alt=""><strong>${COPY.name}</strong></div>
      <h1>${escapeHtml(COPY.marqueeTitle)}</h1>
      <p>${escapeHtml(COPY.marqueeLede)}</p>
      <div class="tile-chips"><span>JSON</span><span>CSV</span><span>HTML</span><span>Markdown</span></div>
    </section>
    ${pointsHtml(COPY.points)}
  </main>`;
}

/* Drives the popup iframe, then marks the document ready so the screenshot tool can wait
   on a selector instead of a guessed timeout. */
const POPUP_DRIVER = `
(() => {
  const frame = document.getElementById("popup");
  if (!frame) { document.body.dataset.ready = "true"; return; }
  const config = JSON.parse(frame.dataset.config || "{}");
  const deadline = Date.now() + 15000;

  const apply = (doc) => {
    if (config.tab) doc.getElementById(config.tab === "scroll" ? "scrollTab" : "hiringTab")?.click();
    if (config.settings) doc.getElementById("settingsToggle")?.click();
    for (const id of config.details || []) {
      const summary = doc.getElementById(id)?.closest("details");
      if (summary) summary.open = true;
    }
    if (Number.isFinite(config.scroll)) {
      const workspace = doc.querySelector(".workspace");
      if (workspace) workspace.scrollTop = config.scroll;
    }
  };

  const tick = () => {
    let doc = null;
    try { doc = frame.contentDocument; } catch (_error) { doc = null; }
    const rendered = doc && doc.querySelectorAll("#matchList [data-post-id]").length > 0;
    if (!rendered && Date.now() < deadline) { setTimeout(tick, 60); return; }
    if (doc) apply(doc);
    requestAnimationFrame(() => requestAnimationFrame(() => { document.body.dataset.ready = "true"; }));
  };

  frame.addEventListener("load", () => setTimeout(tick, 40));
  setTimeout(tick, 60);
})();
`;

function renderFrame(id) {
  const frame = frames.find((entry) => entry.id === id);
  if (!frame) throw new Error(`Unknown store frame: ${id}`);
  const size = sizeFor(frame.kind);
  // Any frame that embeds the popup uses the two-column layout and the popup driver;
  // the pure-copy tiles just mark themselves ready immediately.
  const body = frame.popup ? screenshotBody(frame) : promoBody(frame);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(frame.title)} — Linkerter store frame</title>
<style>
:root { ${layoutVars(frame.kind)} }
${BASE_CSS}
</style>
</head>
<body data-ready="false">
${body}
<script>${frame.popup ? POPUP_DRIVER : 'document.body.dataset.ready = "true";'}</script>
</body>
</html>`;
}

module.exports = { frames, renderFrame, STORE_SIZES, COPY };
