"use strict";

/*
 * A deliberately tiny DOM good enough for `linkedin-post-extract.js`.
 *
 * The extractor only needs: querySelector/querySelectorAll with a small subset of selectors,
 * class tokens, per-element layout numbers, and a `window.getComputedStyle`. A full DOM
 * implementation would be a dependency, and this project has none.
 *
 * Supported selector shapes:
 *   article, [role='article'], .class, [class*="text"], [data-test-id*="x"],
 *   "a, b" lists, and the descendant combinator "a b".
 */

function matchesSimple(element, selector) {
  const trimmed = selector.trim();
  if (!trimmed) return false;

  const attrStar = trimmed.match(/^\[([\w-]+)\*=["']?([^"'\]]*)["']?\]$/);
  if (attrStar) {
    const value = element.getAttribute(attrStar[1]);
    return typeof value === "string" && value.includes(attrStar[2]);
  }

  const attrExact = trimmed.match(/^\[([\w-]+)=["']([^"']*)["']\]$/);
  if (attrExact) return element.getAttribute(attrExact[1]) === attrExact[2];

  if (trimmed.startsWith(".")) return element.classList.contains(trimmed.slice(1));

  return element.tagName === trimmed.toUpperCase();
}

function matches(element, selector) {
  if (selector.includes(" ")) {
    const parts = selector.split(/\s+/);
    const last = parts.pop();
    if (!matchesSimple(element, last)) return false;
    // Every ancestor segment just has to exist somewhere above; the real selectors in the
    // extractor are shallow enough that this is faithful.
    let current = element.parentElement;
    for (const part of parts.reverse()) {
      let found = false;
      while (current) {
        if (matchesSimple(current, part)) {
          found = true;
          current = current.parentElement;
          break;
        }
        current = current.parentElement;
      }
      if (!found) return false;
    }
    return true;
  }
  return matchesSimple(element, selector);
}

class FakeElement {
  constructor(tagName, options = {}) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.attributes = {};
    this.ownText = options.text || "";
    this.innerText = options.innerText;
    this.classList = new Set((options.className || "").split(/\s+/).filter(Boolean));
    this.className = options.className || "";
    this.clientHeight = options.clientHeight || 0;
    this.scrollHeight = options.scrollHeight || 0;
    // A minimal CSSStyleDeclaration: the extractor reads properties, the monitor writes
    // filter/highlight styles and calls removeProperty when it restores a card.
    this.style = Object.assign(Object.create({
      setProperty(name, value) { this[name] = String(value); },
      removeProperty(name) { delete this[name]; },
      getPropertyValue(name) { return this[name] || ""; }
    }), options.style || {});
    this.disabled = options.disabled === true;
    if (options.attrs) {
      for (const [name, value] of Object.entries(options.attrs)) this.attributes[name] = String(value);
    }
  }

  get textContent() {
    return this.children.reduce((accumulated, child) => accumulated + child.textContent, this.ownText);
  }

  getAttribute(name) {
    // `class` is a real attribute in a browser even though it is also the className property;
    // the extractor queries on it, so the shim must expose it the same way.
    if (name === "class") return this.className || null;
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  hasAttribute(name) {
    return this.getAttribute(name) !== null;
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parentElement = this;
      this.children.push(node);
    }
    return this;
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (matches(current, selector)) return current;
      current = current.parentElement;
    }
    return null;
  }

  contains(node) {
    let current = node;
    while (current) {
      if (current === this) return true;
      current = current.parentElement;
    }
    return false;
  }

  descendants() {
    const all = [];
    for (const child of this.children) all.push(child, ...child.descendants());
    return all;
  }

  querySelectorAll(selector) {
    const parts = selector.split(",").map((part) => part.trim()).filter(Boolean);
    return this.descendants().filter((node) => parts.some((part) => matches(node, part)));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  cloneNode(deep) {
    const copy = new FakeElement(this.tagName.toLowerCase(), {
      text: this.ownText,
      className: this.className,
      attrs: this.attributes,
      clientHeight: this.clientHeight,
      scrollHeight: this.scrollHeight
    });
    copy.innerText = this.innerText;
    if (deep) {
      for (const child of this.children) copy.append(child.cloneNode(true));
    }
    return copy;
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
      this.parentElement = null;
    }
  }
}

/**
 * Install a `window` with a getComputedStyle that answers from each element's `style` object,
 * and clear `innerText` when `options.blankInnerText` is set (models offscreen cards rendered
 * with content-visibility, where innerText comes back empty).
 */
function installWindow(walkRoot, options = {}) {
  const windowObject = {
    getComputedStyle(element) {
      const style = element.style || {};
      return {
        webkitLineClamp: style.webkitLineClamp || style["-webkit-line-clamp"] || "",
        lineClamp: style.lineClamp || "",
        overflow: style.overflow || "",
        overflowY: style.overflowY || "",
        maxHeight: style.maxHeight || "none"
      };
    }
  };
  globalThis.window = windowObject;
  if (options.blankInnerText && walkRoot) {
    for (const node of [walkRoot, ...walkRoot.descendants()]) node.innerText = "";
  }
  return windowObject;
}

function clearWindow() {
  delete globalThis.window;
}

module.exports = { FakeElement, installWindow, clearWindow };
