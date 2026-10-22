#!/usr/bin/env node
/* Development-only preview server for the extension popup.
 *
 * Chrome caps extension popups at 800x600 CSS pixels, which is hard to judge from source.
 * This serves popup.html inside an 800x600 frame with a browser-side chrome.* stub
 * (scripts/preview-stub.js) and synthetic records, plus a side-by-side link that renders
 * the popup with the stylesheet from BEFORE_REF for comparison.
 *
 *   npm run preview:popup          -> http://localhost:4173
 *   PREVIEW_REF=main npm run preview:popup
 *
 * Nothing here ships in the packaged extension and nothing here contacts LinkedIn.
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const HOST = process.env.PREVIEW_HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || process.env.PREVIEW_PORT || 4173);
const BEFORE_REF = process.env.PREVIEW_REF || "60ab86a";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body), "utf8");
  res.writeHead(status, {
    "Content-Type": type,
    "Content-Length": payload.length,
    "Cache-Control": "no-store"
  });
  res.end(payload);
}

function beforeStylesheet() {
  try {
    return execFileSync("git", ["show", `${BEFORE_REF}:popup.css`], { cwd: ROOT, encoding: "utf8" });
  } catch (_error) {
    return `/* popup.css was not available at ${BEFORE_REF}. Pass PREVIEW_REF=<commit> to compare. */\n`;
  }
}

/** popup.html plus the preview stub, loaded before the popup's own scripts. */
function popupPage(useBeforeStylesheet) {
  const html = fs.readFileSync(path.join(ROOT, "popup.html"), "utf8");
  // No `window.module` shim here on purpose: without it background.js takes its extension
  // branch and registers the real history coordinator on the stub's runtime.onMessage, so
  // HISTORY_GET / LOCAL_DATA_CLEAR / GET_DIAGNOSTICS behave as they do in the packaged build.
  const injection = [
    '<script src="/preview/stub.js"></script>',
    '<script src="/linkedin-shared.js"></script>',
    '<script src="/background.js"></script>'
  ].join("\n  ");
  const withStub = html.includes("</head>")
    ? html.replace("</head>", `  ${injection}\n</head>`)
    : `${injection}\n${html}`;
  return useBeforeStylesheet
    ? withStub.replace('href="popup.css"', 'href="/popup.before.css"')
    : withStub;
}

function harnessPage(hasBefore) {
  const links = [
    '<a class="pill current" href="/popup.html" target="popupFrame">Current popup</a>',
    hasBefore ? '<a class="pill" href="/popup.html?before=1" target="popupFrame">Before this change</a>' : ""
  ].join("\n      ");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Linkerter popup preview</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; padding: 24px; background: #0d1520; color: #e6edf3;
      font: 14px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    h1 { margin: 0 0 6px; font-size: 20px; }
    p.note { margin: 0 0 18px; color: #9fb0c3; max-width: 76ch; }
    .bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
    .pill { display: inline-block; padding: 8px 14px; border-radius: 999px; border: 1px solid #2c3b4d;
      background: #16212e; color: #e6edf3; text-decoration: none; font-weight: 600; }
    .pill.current { border-color: #2f8f83; background: #143430; }
    .shell { width: 800px; height: 600px; padding: 0; border: 1px dashed #3d5165; border-radius: 10px;
      background: #fff; overflow: hidden; }
    iframe { display: block; width: 800px; height: 600px; border: 0; background: #fff; }
    code { background: #16212e; padding: 1px 5px; border-radius: 4px; }
    .caption { margin-top: 12px; color: #9fb0c3; max-width: 76ch; }
  </style>
</head>
<body>
  <h1>Linkerter popup — rendered at Chrome's real 800&times;600 limit</h1>
  <p class="note">The dashed box is the largest popup Chrome will show. Everything inside is the real
    <code>popup.html</code> and <code>popup.css</code>, driven by a synthetic <code>chrome.*</code> stub
    (<code>scripts/preview-stub.js</code>) — no LinkedIn tab, no live data.</p>
  <div class="bar">
      ${links}
  </div>
  <div class="shell">
    <iframe name="popupFrame" src="/popup.html" title="Linkerter popup preview"></iframe>
  </div>
  <p class="caption">Switch tabs (Scroll feed / Detected hiring) and resize your browser window: below
    720px the layout falls back to a single column. Reload after editing <code>popup.css</code>.</p>
</body>
</html>
`;
}

function safeStatic(urlPath) {
  const resolved = path.resolve(ROOT, `.${urlPath}`);
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) return null;
  if (!TYPES[path.extname(resolved).toLowerCase()]) return null;
  return fs.existsSync(resolved) && fs.statSync(resolved).isFile() ? resolved : null;
}

const server = http.createServer((req, res) => {
  let urlPath;
  let search;
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    urlPath = url.pathname === "/" ? "/" : url.pathname;
    search = url.searchParams;
  } catch (_error) {
    return send(res, 400, "Bad request");
  }

  if (urlPath === "/") return send(res, 200, harnessPage(Boolean(search.get("nobefore") !== "1")), TYPES[".html"]);
  if (urlPath === "/popup.html") return send(res, 200, popupPage(search.get("before") === "1"), TYPES[".html"]);
  if (urlPath === "/popup.before.css") return send(res, 200, beforeStylesheet(), TYPES[".css"]);
  if (urlPath === "/preview/stub.js") {
    return send(res, 200, fs.readFileSync(path.join(__dirname, "preview-stub.js"), "utf8"), TYPES[".js"]);
  }
  if (urlPath === "/healthz") return send(res, 200, JSON.stringify({ ok: true }), TYPES[".json"]);

  const file = safeStatic(urlPath);
  if (file) return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file).toLowerCase()]);
  return send(res, 404, `Not found: ${urlPath}`);
});

server.listen(PORT, HOST, () => {
  const shown = HOST === "0.0.0.0" ? "localhost" : HOST;
  process.stdout.write(`Linkerter popup preview on http://${shown}:${PORT}\n`);
  process.stdout.write(`Comparing against popup.css at ${BEFORE_REF} (override with PREVIEW_REF).\n`);
});
