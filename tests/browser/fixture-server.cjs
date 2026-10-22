"use strict";

const fs = require("node:fs");
const path = require("node:path");

const template = fs.readFileSync(path.join(__dirname, "..", "fixtures", "browser-feed.html"), "utf8");

function safePostId(value) {
  const id = String(value || "fixture").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 48);
  return id || "fixture";
}

/**
 * Serve deterministic documents at real https://www.linkedin.com URLs through
 * Chrome request interception. Extension match patterns and isolated worlds are
 * therefore exercised without contacting LinkedIn or loading any third-party
 * resource. Requests to every other origin are blocked.
 */
async function installFixtures(page) {
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    let url;
    try { url = new URL(request.url()); } catch {
      void request.abort("blockedbyclient").catch(() => {});
      return;
    }

    if (url.protocol === "https:" && url.hostname === "www.linkedin.com") {
      if (url.pathname === "/favicon.ico") {
        void request.respond({ status: 204, body: "" }).catch(() => {});
        return;
      }
      if (url.pathname === "/" || url.pathname === "/feed" || url.pathname === "/feed/") {
        const body = template.replaceAll("{{POST_ID}}", safePostId(url.searchParams.get("fixture")));
        void request.respond({
          status: 200,
          contentType: "text/html; charset=utf-8",
          headers: {
            "Cache-Control": "no-store",
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; frame-ancestors 'none'"
          },
          body
        }).catch(() => {});
        return;
      }
      if (url.pathname === "/jobs/" || url.pathname === "/jobs") {
        void request.respond({
          status: 200,
          contentType: "text/html; charset=utf-8",
          headers: { "Cache-Control": "no-store" },
          body: "<!doctype html><html lang='en'><head><meta charset='utf-8'><title>Unsupported fixture route</title></head><body><main><h1>Jobs route</h1><p>No feed monitor should run here.</p></main></body></html>"
        }).catch(() => {});
        return;
      }
    }

    void request.abort("blockedbyclient").catch(() => {});
  });
}

module.exports = { installFixtures, safePostId };
