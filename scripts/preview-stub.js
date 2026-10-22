/* Development-only preview harness.
 *
 * A browser-side chrome.* stub so popup.html can be opened in a normal tab and inspected
 * at its real size (see scripts/preview-popup.cjs). It is never loaded by the packaged
 * extension: the real popup runs against the extension APIs declared in manifest.json.
 *
 * Seeded data is synthetic and stays in memory. Nothing here talks to LinkedIn.
 */
(() => {
  "use strict";

  function createEvent() {
    const listeners = new Set();
    return {
      addListener(listener) { listeners.add(listener); },
      removeListener(listener) { listeners.delete(listener); },
      hasListener(listener) { return listeners.has(listener); },
      hasListeners() { return listeners.size > 0; },
      listeners() { return [...listeners]; }
    };
  }

  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const startedAt = Date.now();
  const at = (msAgo) => new Date(startedAt - msAgo).toISOString();

  function ageLabel(msAgo) {
    if (msAgo < HOUR) return `${Math.max(1, Math.round(msAgo / MINUTE))}m`;
    if (msAgo < DAY) return `${Math.round(msAgo / HOUR)}h`;
    return `${Math.round(msAgo / DAY)}d`;
  }

  function post(id, ageMs, overrides = {}) {
    const publishedAt = at(ageMs);
    return {
      id: `urn:li:activity:${id}`,
      category: "open_role",
      confidence: "strong",
      score: 6,
      evidence: ['Opening phrase: "hiring"'],
      snippet: "We are hiring a senior backend engineer in Lisbon. Hybrid, 4 days onsite.",
      fullText: "We are hiring a senior backend engineer in Lisbon. Hybrid, 4 days onsite. " +
        "Send your CV to careers@acme.example or apply through the link in the comments.",
      author: { name: "Acme Talent", profileUrl: "https://www.linkedin.com/in/acme-talent" },
      permalink: `https://www.linkedin.com/feed/update/urn:li:activity:${id}/`,
      firstSeenAt: publishedAt,
      lastSeenAt: publishedAt,
      contentComplete: true,
      extractionStatus: "complete",
      metrics: { reactions: 42, comments: 7, reposts: 3, views: 1830 },
      postAge: { label: ageLabel(ageMs), publishedAt, ageDaysApprox: Number((ageMs / DAY).toFixed(2)) },
      stale: false,
      ...overrides
    };
  }

  const posts = [
    post("7301", 3 * HOUR),
    post("7302", 9 * HOUR, {
      category: "open_role",
      snippet: "Nous recrutons un développeur React (H/F) à Lyon. CDI, télétravail 2 jours.",
      fullText: "Nous recrutons un développeur React (H/F) à Lyon. CDI, télétravail 2 jours par semaine. " +
        "Postulez via le formulaire sur notre page carrières.",
      evidence: ['Opening phrase: "nous recrutons"'],
      author: { name: "Studio Lyon", profileUrl: "https://www.linkedin.com/company/studio-lyon" },
      metrics: { reactions: 18, comments: 2, reposts: 1, views: 940 }
    }),
    post("7303", 26 * HOUR, {
      category: "recruiter_search",
      confidence: "medium",
      score: 4,
      snippet: "Looking for a QA automation engineer for a 6-month contract, remote in EMEA. DM me.",
      fullText: "Looking for a QA automation engineer for a 6-month contract, remote in EMEA. " +
        "DM me with your availability and day rate.",
      evidence: ["Recruiter search phrasing"],
      author: { name: "Dana Reeves", profileUrl: "https://www.linkedin.com/in/dana-reeves" },
      metrics: { reactions: 5, comments: 11, reposts: 0, views: 410 }
    }),
    post("7304", 2 * DAY, {
      category: "possible",
      confidence: "low",
      score: 3,
      snippet: "Join our team — we are growing fast and will share openings soon.",
      fullText: "Join our team — we are growing fast and will share openings soon. " +
        "Follow the page so you do not miss the announcement.",
      evidence: ["Intake phrasing without an explicit role"],
      author: { name: "Northwind Labs", profileUrl: "https://www.linkedin.com/company/northwind-labs" },
      metrics: { reactions: 63, comments: 4, reposts: 9, views: 5210 }
    }),
    post("7305", 3 * DAY, {
      category: "job_seeker",
      confidence: "strong",
      score: 5,
      snippet: "Open to work: data analyst, 4 years of experience, available from November.",
      fullText: "Open to work: data analyst, 4 years of experience, available from November. " +
        "SQL, Power BI, and a portfolio of dashboards in the featured section.",
      evidence: ["Job seeker self-presentation"],
      author: { name: "Yacine B.", profileUrl: "https://www.linkedin.com/in/yacine-b" },
      metrics: { reactions: 121, comments: 26, reposts: 14, views: 9870 }
    }),
    post("7306", 4 * DAY, {
      category: "hiring_discussion",
      confidence: "medium",
      score: 3,
      snippet: "Five things I wish candidates knew about hiring loops in 2026.",
      fullText: "Five things I wish candidates knew about hiring loops in 2026. " +
        "None of them are about the job itself, and all of them decide the outcome.",
      evidence: ["Advice about hiring, not an opening"],
      author: { name: "Marta Silva", profileUrl: "https://www.linkedin.com/in/marta-silva" },
      metrics: { reactions: 208, comments: 44, reposts: 31, views: 18400 }
    }),
    post("7307", 6 * DAY, {
      category: "closed",
      confidence: "strong",
      score: 4,
      snippet: "This role is now filled. Thank you to everyone who applied.",
      fullText: "This role is now filled. Thank you to everyone who applied — we reviewed over 400 profiles.",
      evidence: ["Closing statement"],
      author: { name: "Acme Talent", profileUrl: "https://www.linkedin.com/in/acme-talent" },
      metrics: { reactions: 33, comments: 6, reposts: 0, views: 2100 }
    }),
    post("7308", 8 * DAY, {
      category: "open_role",
      confidence: "strong",
      score: 6,
      snippet: "مطلوب محاسب للعمل في وهران، خبرة سنتين على الأقل. إرسال السيرة الذاتية على البريد.",
      fullText: "مطلوب محاسب للعمل في وهران، خبرة سنتين على الأقل. " +
        "إرسال السيرة الذاتية على البريد المذكور في التعليقات.",
      evidence: ['Opening frame: "مطلوب … للعمل"'],
      author: { name: "شركة الوهران", profileUrl: "https://www.linkedin.com/company/oran-co" },
      metrics: { reactions: 12, comments: 3, reposts: 2, views: 780 }
    })
  ];

  const RANK = ["open_role", "recruiter_search", "possible", "job_seeker", "hiring_discussion", "closed", "partial"];

  function counts() {
    const tally = {};
    for (const item of posts) tally[item.category] = (tally[item.category] || 0) + 1;
    return tally;
  }

  function applyQuery(query = {}) {
    const filter = typeof query.filter === "string" ? query.filter : "all";
    const search = String(query.search || "").trim().toLowerCase();
    const sort = ["relevance", "newest", "oldest"].includes(query.sort) ? query.sort : "relevance";
    const pageSize = Math.max(1, Number(query.pageSize) || 25);
    const page = Math.max(1, Number(query.page) || 1);

    let matched = posts.filter((item) => filter === "all" || item.category === filter);
    if (search) {
      matched = matched.filter((item) => [item.snippet, item.fullText, item.author?.name]
        .some((field) => String(field || "").toLowerCase().includes(search)));
    }
    matched = [...matched].sort((a, b) => {
      if (sort === "newest") return Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt);
      if (sort === "oldest") return Date.parse(a.lastSeenAt) - Date.parse(b.lastSeenAt);
      const rank = RANK.indexOf(a.category) - RANK.indexOf(b.category);
      if (rank !== 0) return rank;
      if (Boolean(a.stale) !== Boolean(b.stale)) return a.stale ? 1 : -1;
      return Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt);
    });

    const start = (page - 1) * pageSize;
    return {
      results: matched.slice(start, start + pageSize),
      total: matched.length,
      page,
      pageSize,
      hasMore: start + pageSize < matched.length
    };
  }

  let monitoring = true;

  function statusFor(query) {
    const paged = applyQuery(query);
    return {
      supported: true,
      isFeed: true,
      monitoring,
      autoExpand: true,
      matchesOnly: false,
      historyMode: "persistent",
      historyRetentionDays: 30,
      processedCount: 48,
      archiveCount: posts.length,
      duplicateMergedCount: 2,
      archiveLimitReached: false,
      domHealth: { level: "ok", message: "Feed structure recognised.", background: false },
      counts: counts(),
      ...paged
    };
  }

  const feedTab = {
    id: 1,
    windowId: 1,
    active: true,
    url: "https://www.linkedin.com/feed/",
    title: "LinkedIn — preview feed"
  };

  function createArea(seed) {
    const data = { ...seed };
    const event = createEvent();
    const publish = (changes) => {
      for (const listener of storageChanged.listeners()) listener(changes, areaNameOf(data));
    };
    return {
      data,
      event,
      async get(keys) {
        if (keys === null || keys === undefined) return { ...data };
        if (typeof keys === "string") return keys in data ? { [keys]: data[keys] } : {};
        if (Array.isArray(keys)) {
          const out = {};
          for (const key of keys) if (key in data) out[key] = data[key];
          return out;
        }
        if (typeof keys === "object") {
          const out = {};
          for (const [key, fallback] of Object.entries(keys)) out[key] = key in data ? data[key] : fallback;
          return out;
        }
        return {};
      },
      async set(values) {
        const changes = {};
        for (const [key, value] of Object.entries(values || {})) {
          changes[key] = { oldValue: data[key], newValue: value };
          data[key] = value;
        }
        publish(changes);
      },
      async remove(keys) {
        const list = Array.isArray(keys) ? keys : [keys];
        const changes = {};
        for (const key of list) {
          changes[key] = { oldValue: data[key], newValue: undefined };
          delete data[key];
        }
        publish(changes);
      },
      async clear() {
        for (const key of Object.keys(data)) delete data[key];
      }
    };
  }

  const storageChanged = createEvent();
  function areaNameOf(data) { return data === localArea.data ? "local" : "session"; }

  const localArea = createArea({
    hiringPreferences: {
      onboardingSeen: true,
      historyMode: "persistent",
      historyRetentionDays: 30,
      filter: "all",
      sort: "relevance",
      locale: "auto"
    },
    hiringPostHistory: posts.map((item) => ({
      id: item.id,
      fullText: item.fullText,
      contentComplete: item.contentComplete,
      firstSeenAt: item.firstSeenAt,
      lastSeenAt: item.lastSeenAt,
      category: item.category,
      confidence: item.confidence,
      author: item.author,
      permalink: item.permalink,
      stale: item.stale
    }))
  });
  const sessionArea = createArea({});

  const runtimeMessage = createEvent();

  async function dispatchRuntime(message) {
    const sender = { id: "linkerter-preview", url: globalThis.location?.href || "" };
    for (const listener of runtimeMessage.listeners()) {
      let responded = false;
      let resolveResponse;
      const response = new Promise((resolve) => { resolveResponse = resolve; });
      const sendResponse = (value) => { responded = true; resolveResponse(value); };
      const returned = listener(message, sender, sendResponse);
      if (returned === true) return await response;
      if (returned && typeof returned.then === "function") return await returned;
      if (returned !== undefined) return returned;
      if (responded) return await response;
    }
    return { ok: false, error: "no_handler", message: `Preview stub has no handler for ${message?.type}` };
  }

  async function handleTabMessage(message = {}) {
    switch (message.type) {
      case "GET_STATUS":
        return {
          supported: true, isFeed: true, state: monitoring ? "running" : "stopped",
          mode: "adaptive", steps: monitoring ? 12 : 0, maxSteps: 180
        };
      case "GET_HIRING_STATUS": return statusFor(message.query || {});
      case "GET_HIRING_POST": {
        const found = posts.find((item) => item.id === message.id);
        return found ? { ok: true, post: found } : { ok: false, error: "not_found" };
      }
      case "START_HIRING_MONITOR":
        monitoring = true;
        return { ok: true, supported: true, isFeed: true, status: statusFor(message.query || {}) };
      case "STOP_HIRING_MONITOR":
      case "STOP":
        monitoring = false;
        return { ok: true, supported: true, isFeed: true, status: statusFor({}) };
      case "SET_HIRING_OPTIONS":
      case "SET_HIRING_FILTER":
        return { ok: true, status: statusFor(message.query || {}) };
      case "EXPORT_HIRING_POSTS":
        return {
          schemaVersion: "2.0",
          posts,
          monitorRun: { id: "preview-run", startedAt: at(0) },
          extractionNotes: { content: "Preview data only — synthetic records." }
        };
      default:
        return { ok: true, supported: true, isFeed: true };
    }
  }

  globalThis.chrome = {
    runtime: {
      id: "linkerter-preview",
      lastError: null,
      getManifest: () => ({ version: "2.0.0", name: "Linkerter (preview)" }),
      getURL: (path) => `${globalThis.location?.origin || ""}/${String(path).replace(/^\//, "")}`,
      sendMessage: (message) => dispatchRuntime(message),
      onMessage: runtimeMessage,
      onMessageExternal: createEvent(),
      onInstalled: createEvent(),
      onStartup: createEvent()
    },
    storage: {
      local: localArea,
      session: sessionArea,
      sync: createArea({}),
      onChanged: storageChanged
    },
    tabs: {
      query: async () => [feedTab],
      get: async (tabId) => ({ ...feedTab, id: Number(tabId) || feedTab.id }),
      sendMessage: async (_tabId, message) => handleTabMessage(message),
      update: async (tabId) => ({ ...feedTab, id: Number(tabId) || feedTab.id }),
      reload: async () => undefined,
      highlight: async () => ({}),
      onActivated: createEvent(),
      onRemoved: createEvent(),
      onUpdated: createEvent(),
      onCreated: createEvent()
    },
    windows: { update: async () => ({}) },
    downloads: { download: async () => 1 },
    i18n: { getMessage: (key) => key, getUILanguage: () => "en" }
  };

  globalThis.__LINKERTER_PREVIEW__ = { posts, statusFor, monitoring: () => monitoring };
})();
