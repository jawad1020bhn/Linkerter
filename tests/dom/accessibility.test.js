"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const axe = require("axe-core");
const { loadPopup } = require("../helpers/load-popup.js");

const css = fs.readFileSync("popup.css", "utf8");

function luminance(hex) {
  const channels = hex.match(/[a-f0-9]{2}/gi).map((value) => parseInt(value, 16) / 255).map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

test("consolidated CSS enforces readable type, contrast, focus, reflow, RTL, and reduced motion", () => {
  const sizes = [...css.matchAll(/font-size:\s*([\d.]+)px/gi)].map((match) => Number(match[1]));
  assert.ok(sizes.length > 10);
  assert.equal(sizes.every((size) => size >= 12), true, `Too-small font sizes: ${sizes.filter((size) => size < 12)}`);
  assert.equal((css.match(/html, body\s*\{/g) || []).length <= 1, true);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\[dir=["']?rtl["']?\]/i);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  const tokens = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[a-f0-9]{6})\b/gi)].map((match) => [match[1], match[2]]));
  for (const [foreground, background] of [["ink", "paper"], ["muted", "surface"], ["surface", "teal"], ["surface", "navy"], ["danger", "surface"]]) {
    assert.ok(tokens[foreground] && tokens[background], `Missing token ${foreground}/${background}`);
    assert.ok(contrast(tokens[foreground], tokens[background]) >= 4.5,
      `${foreground}/${background} contrast ${contrast(tokens[foreground], tokens[background]).toFixed(2)}`);
  }
  for (const file of ["popup.html", "popup.js", "manifest.json", "README.md"]) {
    assert.equal(/human-like/i.test(fs.readFileSync(file, "utf8")), false, `${file} retains obsolete naming`);
  }
});

test("tabs use roving tabindex and Arrow/Home/End keyboard navigation", async () => {
  const popup = loadPopup();
  try {
    await popup.ready;
    const scroll = popup.document.querySelector("#scrollTab");
    const hiring = popup.document.querySelector("#hiringTab");
    assert.equal(scroll.tabIndex, 0);
    assert.equal(hiring.tabIndex, -1);
    scroll.focus();
    scroll.dispatchEvent(new popup.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    assert.equal(popup.document.activeElement, hiring);
    assert.equal(hiring.getAttribute("aria-selected"), "true");
    assert.equal(scroll.tabIndex, -1);
    assert.equal(hiring.tabIndex, 0);
    assert.equal(popup.document.querySelector("#hiringView").hidden, false);
    hiring.dispatchEvent(new popup.window.KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    assert.equal(popup.document.activeElement, scroll);
    scroll.dispatchEvent(new popup.window.KeyboardEvent("keydown", { key: "End", bubbles: true }));
    assert.equal(popup.document.activeElement, hiring);
    hiring.dispatchEvent(new popup.window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    assert.equal(popup.document.activeElement, scroll);
  } finally {
    popup.close();
  }
});

test("result lists are not replace-all live regions and the popup passes non-color axe rules", async () => {
  const popup = loadPopup({ currentPosts: [{ id: "urn:1", category: "open_role", snippet: "We are hiring", evidence: [] }] });
  try {
    await popup.ready;
    assert.equal(popup.document.querySelector("#matchList").hasAttribute("aria-live"), false);
    assert.equal(popup.document.querySelector(".status-card").hasAttribute("aria-live"), false);
    popup.window.eval(axe.source);
    const result = await popup.window.axe.run(popup.document, {
      iframes: false,
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
      rules: { "color-contrast": { enabled: false } }
    });
    assert.equal(result.violations.length, 0, JSON.stringify(result.violations.map((violation) => ({
      id: violation.id, nodes: violation.nodes.map((node) => node.target)
    }))));
  } finally {
    popup.close();
  }
});
