(() => {
  "use strict";

  if (window.__linkedinFeedScrollerInstalled) return;
  window.__linkedinFeedScrollerInstalled = true;

  const shared = globalThis.__LI_FEED_SHARED__;
  if (!shared) throw new Error("Shared primitives must load before the feed scroller.");

  let session = null;
  let nextSessionId = 1;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const randomBetween = (min, max) => min + Math.random() * (max - min);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const scrollRoot = () => document.scrollingElement || document.documentElement;

  function sanitizeSettings(raw = {}) {
    return shared.sanitizeSettings(raw);
  }

  function isFeedPage() {
    return shared.parseLinkedInUrl(location.href).isFeed;
  }

  function elapsedMs(current) {
    if (!current) return 0;
    const now = current.state === "stopped" ? current.stoppedAt :
      current.state === "paused" ? current.pauseStartedAt : Date.now();
    return Math.max(0, now - current.startedAt - current.totalPausedMs);
  }

  function getStatus() {
    if (!session) {
      return { supported: true, isFeed: isFeedPage(), state: "stopped", reason: "", steps: 0, maxSteps: 0, elapsedMs: 0, maxMs: 0, mode: "" };
    }
    return {
      supported: true,
      isFeed: isFeedPage(),
      state: session.state,
      reason: session.reason || "",
      steps: session.steps,
      maxSteps: session.settings.maxSteps,
      elapsedMs: elapsedMs(session),
      maxMs: session.settings.maxMinutes * 60 * 1000,
      mode: session.settings.mode
    };
  }

  function isCurrent(id) {
    return Boolean(session && session.id === id && session.state !== "stopped");
  }

  function stopSession(reason) {
    if (!session || session.state === "stopped") return;
    const now = Date.now();
    if (session.state === "paused" && session.pauseStartedAt) session.totalPausedMs += now - session.pauseStartedAt;
    session.state = "stopped";
    session.reason = reason;
    session.stoppedAt = now;
    session.pauseStartedAt = null;
    if (session.cancelAnimation) {
      const cancel = session.cancelAnimation;
      session.cancelAnimation = null;
      cancel();
    }
  }

  function pauseSession(reason = "Paused by you.") {
    if (!session || session.state !== "running") return;
    session.state = "paused";
    session.reason = reason;
    session.pauseStartedAt = Date.now();
    if (session.cancelAnimation) {
      const cancel = session.cancelAnimation;
      session.cancelAnimation = null;
      cancel();
    }
  }

  function resumeSession() {
    if (!session || session.state !== "paused") return false;
    if (session.pauseStartedAt) session.totalPausedMs += Date.now() - session.pauseStartedAt;
    session.pauseStartedAt = null;
    session.state = "running";
    session.reason = "";
    return true;
  }

  function startSession(rawSettings) {
    if (!isFeedPage()) return { ok: false, error: "open_feed", message: "Open the LinkedIn feed before starting." };
    if (session && session.state === "running") return { ok: true, status: getStatus() };
    if (session && session.state === "paused") {
      resumeSession();
      return { ok: true, status: getStatus() };
    }

    const settings = sanitizeSettings(rawSettings);
    const root = scrollRoot();
    session = {
      id: nextSessionId++,
      state: "running",
      reason: "",
      settings,
      startedAt: Date.now(),
      stoppedAt: null,
      pauseStartedAt: null,
      totalPausedMs: 0,
      steps: 0,
      noMovementCount: 0,
      failedTargets: new Set(),
      lastPageHeight: Math.max(root.scrollHeight, document.body?.scrollHeight || 0),
      lastContentGrowthAt: 0,
      pacingTarget: null,
      lastTargetMaxScroll: null,
      recentProgress: [],
      nextBreakAt: null,
      cancelAnimation: null
    };
    void runSession(session.id);
    return { ok: true, status: getStatus() };
  }

  function profileFor(mode) {
    const profiles = {
      standard: {
        step: [0.62, 0.91], waitMs: [1850, 3000], motionMs: [620, 1020],
        breakChance: 0.18, breakEvery: [8, 12], pauseMs: [5200, 11200],
        loadCooldownMs: 2900, loadPauseMs: [900, 1700], maxViewportStep: 1.02
      },
      fast: {
        step: [0.86, 1.17], waitMs: [1120, 1920], motionMs: [440, 760],
        breakChance: 0.15, breakEvery: [10, 15], pauseMs: [4200, 8800],
        loadCooldownMs: 2250, loadPauseMs: [650, 1300], maxViewportStep: 1.28
      },
      super_fast: {
        step: [1.08, 1.43], waitMs: [720, 1320], motionMs: [300, 560],
        breakChance: 0.12, breakEvery: [12, 17], pauseMs: [3400, 7200],
        loadCooldownMs: 1650, loadPauseMs: [450, 950], maxViewportStep: 1.52
      }
    };
    return profiles[mode] || profiles.standard;
  }

  function documentHeight() {
    const root = scrollRoot();
    return Math.max(root.scrollHeight, root.clientHeight, document.body?.scrollHeight || 0);
  }

  function targetTop(target) {
    if (!target) return 0;
    if (target.kind === "document") return Math.max(0, window.scrollY || scrollRoot().scrollTop || document.body?.scrollTop || 0);
    return Math.max(0, target.element.scrollTop || 0);
  }

  function targetMaxScroll(target) {
    if (!target) return 0;
    if (target.kind === "document") return Math.max(0, documentHeight() - (window.innerHeight || scrollRoot().clientHeight));
    return Math.max(0, target.element.scrollHeight - target.element.clientHeight);
  }

  // LinkedIn renders its scroller inside a handful of structural wrappers. A selector pass is
  // far cheaper than scanning every element in the document (the old cap of 2200 nodes grew
  // linearly with comments and dialogs inserted ahead of the feed); the validated loop below
  // keeps the identical overflow/visibility scoring so results do not change.
  const SCROLL_CANDIDATE_SELECTOR = "[role='main'],[role='feed'],main,[data-test-id*='feed']," +
    "[data-test-id*='update'],[class*='feed'],[class*='scaffold'],[class*='scroll'],[class*='scroller']";

  function collectScrollCandidateElements() {
    const body = document.body;
    const seen = new Set();
    const list = [];
    let matches;
    try {
      matches = body ? body.querySelectorAll(SCROLL_CANDIDATE_SELECTOR) : [];
    } catch (_error) {
      matches = [];
    }
    for (const element of matches) {
      if (seen.has(element)) continue;
      seen.add(element);
      list.push(element);
    }
    // Unusual layouts get one bounded fallback scan; the selector pass usually covers them.
    if (list.length < 60 && body) {
      const all = body.querySelectorAll("*");
      const count = Math.min(all.length, 300);
      for (let index = 0; index < count; index += 1) {
        if (seen.has(all[index])) continue;
        seen.add(all[index]);
        list.push(all[index]);
      }
    }
    return list;
  }

  function findScrollTarget() {
    const root = scrollRoot();
    if (session) {
      const currentHeight = documentHeight();
      if (Math.abs(currentHeight - session.lastPageHeight) > 100) {
        if (currentHeight > session.lastPageHeight) session.lastContentGrowthAt = Date.now();
        session.failedTargets.clear();
        session.lastPageHeight = currentHeight;
      }
    }

    const candidates = [];
    const documentTarget = { kind: "document", element: root };
    if (targetMaxScroll(documentTarget) - targetTop(documentTarget) > 2 && (!session || !session.failedTargets.has(root))) {
      candidates.push({ target: documentTarget, score: 1e12 });
    }

    const body = document.body;
    if (body) {
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1024;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 768;

      for (const element of collectScrollCandidateElements()) {
        if (element === root || element === body || !element.isConnected) continue;
        if (session && session.failedTargets.has(element)) continue;
        const maxScroll = element.scrollHeight - element.clientHeight;
        if (maxScroll < 50 || element.clientHeight < 100 || maxScroll - element.scrollTop <= 2) continue;

        const style = window.getComputedStyle(element);
        const overflow = style.overflowY || "";
        const className = typeof element.className === "string" ? element.className.toLowerCase() : "";
        const role = (element.getAttribute("role") || "").toLowerCase();
        const semanticFeed = /feed|scaffold|update|finite-scroll/.test(className) || role === "feed" || role === "main" || element.tagName === "MAIN";
        const explicitlyScrollable = /auto|scroll|overlay/.test(overflow) || (overflow === "hidden" && semanticFeed);
        if (!explicitlyScrollable) continue;

        const rect = element.getBoundingClientRect();
        const visibleWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
        const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
        if (visibleWidth < Math.min(210, viewportWidth * 0.42) || visibleHeight < Math.min(150, viewportHeight * 0.3)) continue;
        const area = visibleWidth * visibleHeight;
        const centerDistance = Math.abs((rect.left + rect.width / 2) - viewportWidth / 2) / viewportWidth;
        const score = area + (semanticFeed ? 450000 : 0) - centerDistance * 130000;
        candidates.push({ target: { kind: "element", element }, score });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    if (candidates.length) return candidates[0].target;
    if (!session || !session.failedTargets.has(root)) return documentTarget;
    return null;
  }

  function viewportHeightFor(target) {
    return target?.kind === "element"
      ? Math.max(240, target.element.clientHeight || window.innerHeight || 768)
      : Math.max(320, window.innerHeight || 768);
  }

  function sampleVisibleContent(target, viewportHeight) {
    const queryRoot = target?.kind === "element" ? target.element : document.body;
    if (!queryRoot || typeof queryRoot.querySelectorAll !== "function") {
      return { visibleCards: 0, averageChars: 650, readingLoad: 1 };
    }
    let nodes;
    try {
      nodes = queryRoot.querySelectorAll("article, [role='article'], [role='listitem']");
    } catch (_error) {
      return { visibleCards: 0, averageChars: 650, readingLoad: 1 };
    }

    const seenSnippets = new Set();
    let visibleCards = 0;
    let totalChars = 0;
    const available = nodes.length || 0;
    const count = Math.min(available, 96);
    const maxStart = Math.max(0, available - count);
    const maxScroll = targetMaxScroll(target);
    const progress = maxScroll > 0 ? clamp(targetTop(target) / maxScroll, 0, 1) : 0;
    const start = Math.floor(maxStart * progress);
    for (let index = start; index < start + count && visibleCards < 6; index += 1) {
      const node = nodes[index];
      if (!node || node.isConnected === false || typeof node.getBoundingClientRect !== "function") continue;
      const rect = node.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.top >= (window.innerHeight || viewportHeight)) continue;
      const text = String(node.innerText || node.textContent || "").replace(/\s+/gu, " ").trim();
      if (text.length < 80) continue;
      const signature = text.slice(0, 120);
      if (seenSnippets.has(signature)) continue;
      seenSnippets.add(signature);
      visibleCards += 1;
      totalChars += Math.min(text.length, 1800);
    }
    const averageChars = visibleCards ? totalChars / visibleCards : 650;
    return {
      visibleCards,
      averageChars,
      readingLoad: clamp(averageChars / 700, 0.55, 1.65)
    };
  }

  function makeStepPlan(current, target) {
    const profile = profileFor(current.settings.mode);
    const viewportHeight = viewportHeightFor(target);
    const content = sampleVisibleContent(target, viewportHeight);
    const targetKey = target.kind === "document" ? scrollRoot() : target.element;
    const targetMax = targetMaxScroll(target);
    if (current.pacingTarget !== targetKey) {
      current.pacingTarget = targetKey;
      current.lastTargetMaxScroll = targetMax;
      current.recentProgress = [];
    } else if (Number.isFinite(current.lastTargetMaxScroll) && targetMax > current.lastTargetMaxScroll + Math.max(90, viewportHeight * 0.12)) {
      current.lastContentGrowthAt = Date.now();
      current.lastTargetMaxScroll = targetMax;
    } else {
      current.lastTargetMaxScroll = targetMax;
    }

    const now = Date.now();
    const loadingFreshContent = now - current.lastContentGrowthAt < profile.loadCooldownMs;
    const remaining = Math.max(0, targetMax - targetTop(target));
    const readingFactor = clamp(1.12 - (content.readingLoad - 0.7) * 0.17, 0.78, 1.08);
    const visibleCardFactor = content.visibleCards >= 5 ? 0.88 : content.visibleCards >= 3 ? 0.95 : 1.04;
    let distance = viewportHeight * randomBetween(profile.step[0], profile.step[1]) * readingFactor * visibleCardFactor;
    let waitMs = randomBetween(profile.waitMs[0], profile.waitMs[1]) * clamp(0.86 + content.readingLoad * 0.22, 0.92, 1.22);

    const recentProgress = current.recentProgress || [];
    const averageProgress = recentProgress.length
      ? recentProgress.reduce((sum, ratio) => sum + ratio, 0) / recentProgress.length
      : 1;
    if (averageProgress < 0.58) {
      distance *= 0.72;
      waitMs *= 1.28;
    } else if (averageProgress > 0.94 && !loadingFreshContent && content.readingLoad < 1.15 && content.visibleCards < 5) {
      distance *= 1.04;
    }

    if (loadingFreshContent) {
      distance *= 0.76;
      waitMs += randomBetween(profile.loadPauseMs[0], profile.loadPauseMs[1]);
    }
    if (remaining < viewportHeight * 1.25) {
      distance = Math.min(distance, remaining * 0.72);
      waitMs *= 1.28;
    }
    distance = Math.min(distance, viewportHeight * profile.maxViewportStep, remaining);

    if (current.nextBreakAt === null || current.nextBreakAt === undefined) {
      current.nextBreakAt = current.steps + Math.round(randomBetween(profile.breakEvery[0], profile.breakEvery[1]));
    }
    const scheduledBreak = current.steps > 0 && current.steps >= current.nextBreakAt;
    if (scheduledBreak) {
      waitMs += randomBetween(profile.pauseMs[0], profile.pauseMs[1]);
      current.nextBreakAt = current.steps + Math.round(randomBetween(profile.breakEvery[0], profile.breakEvery[1]));
    } else if (Math.random() < profile.breakChance) {
      waitMs += randomBetween(profile.pauseMs[0], profile.pauseMs[1]);
    }

    return {
      distance: Math.max(0, distance),
      motionMs: randomBetween(profile.motionMs[0], profile.motionMs[1]),
      waitMs,
      visibleCards: content.visibleCards,
      readingLoad: content.readingLoad,
      loadingFreshContent
    };
  }

  function setScrollTop(target, value) {
    if (target.kind === "document") {
      window.scrollTo(0, value);
      scrollRoot().scrollTop = value;
      if (document.body) document.body.scrollTop = value;
    } else if (target.element.isConnected) {
      target.element.scrollTop = value;
    }
  }

  function temporarilyDisableSmoothBehavior(target) {
    const affected = target.kind === "document"
      ? [document.documentElement, document.body].filter(Boolean)
      : [target.element];
    const saved = affected.map((element) => ({
      element,
      value: element.style.getPropertyValue("scroll-behavior"),
      priority: element.style.getPropertyPriority("scroll-behavior")
    }));
    for (const item of saved) item.element.style.setProperty("scroll-behavior", "auto", "important");
    return () => {
      for (const item of saved) {
        if (item.value) item.element.style.setProperty("scroll-behavior", item.value, item.priority);
        else item.element.style.removeProperty("scroll-behavior");
      }
    };
  }

  function smoothScrollBy(target, distance, durationMs, id) {
    return new Promise((resolve) => {
      let frameId = null;
      let frameKind = "";
      let finished = false;
      const startY = targetTop(target);
      const startTime = performance.now();
      const restoreBehavior = temporarilyDisableSmoothBehavior(target);

      const cancelScheduledFrame = () => {
        if (frameId === null) return;
        if (frameKind === "raf") cancelAnimationFrame(frameId);
        else clearTimeout(frameId);
        frameId = null;
        frameKind = "";
      };
      const finish = (completed) => {
        if (finished) return;
        finished = true;
        cancelScheduledFrame();
        document.removeEventListener("visibilitychange", onVisibilityChange);
        restoreBehavior();
        if (session && session.id === id) session.cancelAnimation = null;
        resolve(completed);
      };
      const cancel = () => finish(false);
      if (session && session.id === id) session.cancelAnimation = cancel;

      const frame = (now) => {
        frameId = null;
        frameKind = "";
        if (!isCurrent(id) || session.state !== "running") return finish(false);
        if (target.kind === "element" && !target.element.isConnected) return finish(false);
        const progress = clamp((now - startTime) / Math.max(1, durationMs), 0, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const endY = Math.min(startY + distance, targetMaxScroll(target));
        setScrollTop(target, startY + (endY - startY) * eased);
        if (progress >= 1) finish(true);
        else scheduleFrame();
      };
      const scheduleFrame = () => {
        if (finished) return;
        if (document.visibilityState === "visible" && typeof requestAnimationFrame === "function") {
          frameKind = "raf";
          frameId = requestAnimationFrame(frame);
        } else {
          // requestAnimationFrame is commonly suspended in background tabs; use a throttled timer fallback.
          frameKind = "timer";
          frameId = setTimeout(() => frame(performance.now()), 120);
        }
      };
      const onVisibilityChange = () => {
        const desiredKind = document.visibilityState === "visible" ? "raf" : "timer";
        if (frameKind && frameKind !== desiredKind) {
          cancelScheduledFrame();
          scheduleFrame();
        }
      };
      document.addEventListener("visibilitychange", onVisibilityChange);
      scheduleFrame();
    });
  }

  async function waitUntilRunning(id) {
    while (isCurrent(id) && session.state === "paused") await sleep(120);
    return isCurrent(id) && session.state === "running";
  }

  async function waitWhileActive(ms, id) {
    let remaining = ms;
    while (remaining > 0 && isCurrent(id)) {
      if (session.state === "paused") {
        await sleep(120);
        continue;
      }
      if (session.state !== "running") return false;
      const started = Date.now();
      await sleep(Math.min(200, remaining));
      if (!isCurrent(id)) return false;
      if (session.state === "running") remaining -= Date.now() - started;
    }
    return isCurrent(id);
  }

  async function runSession(id) {
    while (isCurrent(id)) {
      if (session.state === "paused" && !(await waitUntilRunning(id))) return;
      if (!isCurrent(id)) return;
      if (!isFeedPage()) {
        stopSession("Stopped because you left the LinkedIn feed.");
        return;
      }
      // Do not gate on document.visibilityState: the selected LinkedIn tab keeps scrolling
      // in the background. Chrome may throttle the page's animation frames and timers.
      const maxDurationMs = session.settings.maxMinutes * 60 * 1000;
      let timeRemaining = maxDurationMs - elapsedMs(session);
      if (timeRemaining <= 0) {
        stopSession("Finished: time limit reached.");
        return;
      }
      if (session.steps >= session.settings.maxSteps) {
        stopSession("Finished: scroll-step limit reached.");
        return;
      }

      const target = findScrollTarget();
      if (!target) {
        session.noMovementCount += 1;
        if (session.noMovementCount >= 4) {
          stopSession("Stopped: no scrollable feed area was found. Refresh LinkedIn and try again.");
          return;
        }
        await waitWhileActive(Math.min(900, timeRemaining), id);
        continue;
      }

      const plan = makeStepPlan(session, target);
      const beforeY = targetTop(target);
      const completed = await smoothScrollBy(target, plan.distance, Math.min(plan.motionMs, timeRemaining), id);
      if (!isCurrent(id)) return;
      if (!completed) {
        if (session.state === "paused" || session.state === "running") continue;
        return;
      }

      session.steps += 1;
      const moved = targetTop(target) - beforeY;
      const progressRatio = moved / Math.max(1, plan.distance);
      session.recentProgress.push(clamp(progressRatio, 0, 1.5));
      if (session.recentProgress.length > 5) session.recentProgress.shift();
      if (moved < 8) {
        session.noMovementCount += 1;
        session.failedTargets.add(target.element);
      } else {
        session.noMovementCount = 0;
        session.failedTargets.clear();
      }
      if (session.noMovementCount >= 4) {
        stopSession("Stopped: no feed movement was detected. You may be at the end, or LinkedIn may need a refresh.");
        return;
      }
      if (session.steps >= session.settings.maxSteps) {
        stopSession("Finished: scroll-step limit reached.");
        return;
      }
      timeRemaining = maxDurationMs - elapsedMs(session);
      if (timeRemaining <= 0) {
        stopSession("Finished: time limit reached.");
        return;
      }
      await waitWhileActive(Math.min(plan.waitMs, timeRemaining), id);
    }
  }

  // Only trusted user input may pause the session, and a lone modifier press
  // (Shift/Ctrl/Alt/Meta alone) does not scroll or type anything.
  window.addEventListener("wheel", (event) => {
    if (!event.isTrusted) return;
    if (session && session.state === "running" && session.settings.pauseOnInput) pauseSession("Paused for your input.");
  }, { capture: true, passive: true });
  window.addEventListener("touchstart", (event) => {
    if (!event.isTrusted) return;
    if (session && session.state === "running" && session.settings.pauseOnInput) pauseSession("Paused for your input.");
  }, { capture: true, passive: true });
  window.addEventListener("pointerdown", (event) => {
    if (!event.isTrusted) return;
    if (session && session.state === "running" && session.settings.pauseOnInput) pauseSession("Paused for your input.");
  }, { capture: true, passive: true });
  const MODIFIER_ONLY_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "NumLock", "ScrollLock"]);
  window.addEventListener("keydown", (event) => {
    if (!event.isTrusted || MODIFIER_ONLY_KEYS.has(event.key)) return;
    if (session && session.state === "running" && session.settings.pauseOnInput) pauseSession("Paused for your input.");
  }, { capture: true });
  window.addEventListener("beforeinput", (event) => {
    if (!event.isTrusted) return;
    if (session && session.state === "running" && session.settings.pauseOnInput) pauseSession("Paused for your input.");
  }, { capture: true });
  window.addEventListener("li-feed-auto-expand-start", () => {
    if (session && session.state === "running") pauseSession("Paused while a long post expands. Manual resume is required to continue.");
  });

  const scrollerApi = {
    sanitizeSettings,
    isFeedPage,
    getStatus,
    startSession,
    pauseSession,
    resumeSession,
    stopSession,
    runSession,
    profileFor,
    findScrollTarget,
    smoothScrollBy
  };
  globalThis.__LI_FEED_SCROLLER__ = scrollerApi;
  if (typeof module !== "undefined" && module.exports) module.exports = scrollerApi;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return false;
    switch (message.type) {
      case "GET_STATUS":
        sendResponse(getStatus());
        return false;
      case "START":
        sendResponse(startSession(message.settings));
        return false;
      case "PAUSE":
        pauseSession("Paused by you.");
        sendResponse({ ok: true, status: getStatus() });
        return false;
      case "RESUME":
        if (!isFeedPage()) {
          sendResponse({ ok: false, error: "open_feed", message: "Open the LinkedIn feed before resuming." });
          return false;
        }
        resumeSession();
        sendResponse({ ok: true, status: getStatus() });
        return false;
      case "STOP":
        stopSession("Stopped by you.");
        sendResponse({ ok: true, status: getStatus() });
        return false;
      default:
        return false;
    }
  });
})();
