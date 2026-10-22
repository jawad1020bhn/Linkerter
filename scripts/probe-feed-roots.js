"use strict";

// Feed-root duplication probe.
//
// The DOM suite exercises extraction and scanning on simplified cards
// (`<article data-urn><div class="feed-shared-text">…`), which produce exactly one
// post root. Real current-LinkedIn cards nest several `feed-shared-update-v2__*`
// children inside the card. This probe loads one realistic card plus the repo's own
// `tests/fixtures/dom/collapsed.html` and reports how many post roots, archive
// records, and per-category counts a single post actually produces.
//
// Expected once root selection is fixed: 1 post -> 1 root -> 1 archive record,
// counts.open_role === 1, and no extracted text containing a "see more" control label.
//
//   node scripts/probe-feed-roots.js           # report only
//   node scripts/probe-feed-roots.js --strict   # exit 1 while duplication remains

const fs = require("node:fs");
const path = require("node:path");
const { loadMonitor } = require("../tests/helpers/load-monitor.js");

const strict = process.argv.includes("--strict");
const fixtureDir = path.join(__dirname, "..", "tests", "fixtures", "dom");

// One post, shaped like current LinkedIn markup: an occludable-update wrapper, an
// article card carrying the activity URN, and the real child class names.
const REALISTIC_CARD = `<main><div class="scaffold-finite-scroll__content" role="main">
 <div class="occludable-update" data-urn="urn:li:activity:7250000000000000001">
  <article class="feed-shared-update-v2 update-components-actor occludable-update" data-urn="urn:li:activity:7250000000000000001">
    <div class="feed-shared-update-v2__actor update-components-actor"><span class="update-components-actor__name">Acme Algeria</span></div>
    <div class="feed-shared-update-v2__content"><div class="feed-shared-update-v2__description-wrapper">
      <span class="feed-shared-text">We are hiring a Senior Backend Engineer in Algiers. Apply now via our careers page.</span>
      <button class="update-components-text-v2__see-more" aria-label="see more">see more</button>
    </div></div>
    <div class="feed-shared-update-v2__control-menu"></div>
    <div class="feed-shared-update-v2__social-actions">
      <a href="https://www.linkedin.com/posts/acme_activity-7250000000000000001-abc">Permalink</a>
      <time datetime="1761000000">2h</time>
    </div>
  </article>
 </div>
</div></main>`;

async function probe(label, html, expectedPosts) {
  const { document, api } = loadMonitor(html);
  // Hidden-tab scanning inspects every card, matching background monitoring.
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  api.startMonitor({ autoExpand: false, historyMode: "off" });
  await api.scan();
  const status = api.getStatus({ filter: "all", sort: "newest", page: 1, pageSize: 100 });
  await api.stopMonitor();

  const duplicates = status.results
    .map((record) => record.snippet.trim().toLowerCase())
    .filter((snippet, index, all) => all.indexOf(snippet) !== index);
  const leakedControls = status.results.filter((record) => /\bsee more\b|\bvoir plus\b|\u0634\u0627\u0647\u062f \u0627\u0644\u0645\u0632\u064a\u062f/i.test(record.snippet));

  return {
    label,
    expectedPosts,
    postRootsFound: status.domHealth.postRootsFound,
    textSelectorMatches: status.domHealth.textSelectorMatches,
    textFallbacks: status.domHealth.textFallbacks,
    seeMoreControls: status.domHealth.seeMoreControls,
    archiveCount: status.archiveCount,
    duplicateMergedCount: status.duplicateMergedCount,
    counts: status.counts,
    records: status.results.map((record) => ({
      id: record.id, category: record.category, confidence: record.confidence, contentComplete: record.contentComplete
    })),
    duplicatedSnippets: [...new Set(duplicates)],
    controlLabelLeakage: leakedControls.map((record) => ({ id: record.id, snippet: record.snippet.slice(-40) }))
  };
}

(async () => {
  const results = [
    await probe("realistic current-LinkedIn card (1 post)", REALISTIC_CARD, 1),
    await probe("tests/fixtures/dom/collapsed.html (1 post)", fs.readFileSync(path.join(fixtureDir, "collapsed.html"), "utf8"), 1)
  ];

  let defective = false;
  for (const result of results) {
    const inflated = result.archiveCount !== result.expectedPosts || result.counts.open_role !== result.expectedPosts;
    const leaked = result.controlLabelLeakage.length > 0;
    defective = defective || inflated || leaked;
    console.log(`\n=== ${result.label} ===`);
    console.log(`post roots found: ${result.postRootsFound} (text selectors ${result.textSelectorMatches}, fallbacks ${result.textFallbacks}, see-more controls ${result.seeMoreControls})`);
    console.log(`archive records: ${result.archiveCount} | expected: ${result.expectedPosts} | counts.open_role: ${result.counts.open_role} | duplicateMergedCount: ${result.duplicateMergedCount}`);
    for (const record of result.records) {
      console.log(`  * ${record.category}/${record.confidence} complete=${record.contentComplete} id=${record.id.slice(0, 78)}`);
    }
    console.log(inflated ? "RESULT: DUPLICATED — one post produced multiple archive records and inflated counts" : "RESULT: one post -> one record");
    if (leaked) console.log(`RESULT: CONTROL-LABEL LEAKAGE — extracted text includes a see-more label: ${JSON.stringify(result.controlLabelLeakage)}`);
  }

  console.log(`\nprobe verdict: ${defective ? "feed-root duplication present" : "clean"}`);
  if (strict && defective) process.exitCode = 1;
})();
