// ==UserScript==
// @name         LinuxDo Trust Level Enhancer
// @namespace    https://linux.do/
// @version      0.2.0
// @description  Enhance trust level display on linux.do with colored level badges right next to post author names, lazily fetched from user cards.
// @match        https://linux.do/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const STYLE_ID = 'ld-tle-style';
  const POST_DONE = 'data-ld-tle-postdone';
  const BADGE_CLASS = 'ld-tle-badge';
  const CACHE_KEY = 'ld-tle-cache-v1';
  const CACHE_LONG_TTL = 7 * 24 * 60 * 60 * 1000;
  const CACHE_SHORT_TTL = 5 * 60 * 1000;
  const MAX_CONCURRENCY = 4;
  const FETCH_TIMEOUT = 12000;
  const TRUST_LEVELS = [
    { name: '新用户' },
    { name: '基本用户' },
    { name: '成员' },
    { name: '活跃' },
    { name: '领袖' },
  ];

  const cache = new Map(loadCache());
  const inflight = new Map();
  const jobs = new WeakMap();
  let active = 0;
  const queue = [];

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  function saveCache() {
    try {
      const entries = [...cache.entries()].slice(-2000);
      localStorage.setItem(CACHE_KEY, JSON.stringify(entries));
    } catch (e) {
      // ignore quota or serialization errors
    }
  }

  function cachedLevel(username) {
    const entry = cache.get(username);
    if (!entry) return null;
    const ttl = entry.tl >= 0 ? CACHE_LONG_TTL : CACHE_SHORT_TTL;
    if (Date.now() - entry.ts > ttl) return null;
    return entry.tl;
  }

  function enqueue(task) {
    return new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      pump();
    });
  }

  function pump() {
    while (active < MAX_CONCURRENCY && queue.length) {
      const { task, resolve, reject } = queue.shift();
      active += 1;
      Promise.resolve()
        .then(task)
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  }

  function fetchLevel(username) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    return fetch(`/u/${encodeURIComponent(username)}/card.json`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then((response) => {
        clearTimeout(timer);
        if (!response.ok) throw new Error(`card.json ${response.status}`);
        return response.json();
      })
      .then((data) => {
        const tl = data && data.user && data.user.trust_level;
        return typeof tl === 'number' ? tl : -1;
      })
      .catch((err) => {
        clearTimeout(timer);
        throw err;
      });
  }

  function ensureLevel(username) {
    const cached = cachedLevel(username);
    if (cached !== null) return Promise.resolve(cached);
    const existing = inflight.get(username);
    if (existing) return existing;
    const task = () =>
      fetchLevel(username)
        .then((tl) => {
          cache.set(username, { tl, ts: Date.now() });
          saveCache();
          return tl;
        })
        .catch(() => {
          cache.set(username, { tl: -1, ts: Date.now() });
          saveCache();
          return -1;
        });
    const promise = enqueue(task);
    inflight.set(username, promise);
    promise.finally(() => inflight.delete(username));
    return promise;
  }

  const observer = typeof IntersectionObserver === 'undefined'
    ? null
    : new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const el = entry.target;
            const job = jobs.get(el);
            if (job) {
              jobs.delete(el);
              ensureLevel(job.username).then(job.render);
            }
            observer.unobserve(el);
          }
        },
        { rootMargin: '300px' }
      );

  function watch(element, username, render) {
    if (!username) return;
    if (observer) {
      jobs.set(element, { username, render });
      observer.observe(element);
    } else {
      ensureLevel(username).then(render);
    }
  }

  function createBadge() {
    const badge = document.createElement('span');
    badge.className = `${BADGE_CLASS} ld-tle-badge--pending`;
    badge.textContent = 'Lv?';
    return badge;
  }

  function paintBadge(badge, level) {
    badge.classList.remove('ld-tle-badge--pending');
    if (level < 0 || level > 4) {
      badge.classList.add('ld-tle-badge--unknown');
      badge.textContent = 'Lv?';
      return;
    }
    badge.classList.add(`ld-tle-badge--${level}`);
    badge.textContent = `Lv${level} ${TRUST_LEVELS[level].name}`;
    badge.title = `信任等级 ${level} · ${TRUST_LEVELS[level].name}`;
  }

  function processPost(post) {
    if (post.hasAttribute(POST_DONE)) return;
    const names = post.querySelector('.names');
    const meta = post.querySelector('.topic-meta-data');
    const anchor = names
      ? names.querySelector('a[data-user-card]')
      : (meta && meta.querySelector('a[data-user-card]'))
        || [...post.querySelectorAll('a[data-user-card]')].find((a) => !a.querySelector('img'))
        || null;
    if (!anchor) return;
    const username = anchor.getAttribute('data-user-card') || '';
    if (!username) return;
    post.setAttribute(POST_DONE, '');

    const badge = createBadge();
    anchor.insertAdjacentElement('afterend', badge);
    watch(badge, username, (level) => paintBadge(badge, level));
  }

  function processPage() {
    addStyles();
    document.querySelectorAll('article[id^="post_"]:not([data-ld-tle-postdone])').forEach(processPost);
  }

  let processingScheduled = false;
  let retryTimer;

  function scheduleProcessing() {
    if (processingScheduled) return;
    processingScheduled = true;
    requestAnimationFrame(() => {
      processingScheduled = false;
      processPage();
    });
  }

  function processWithRetries() {
    clearTimeout(retryTimer);
    scheduleProcessing();
    const delays = [150, 600, 2000, 5000];
    let index = 0;
    const retry = () => {
      scheduleProcessing();
      if (index < delays.length) retryTimer = setTimeout(retry, delays[index++]);
    };
    retryTimer = setTimeout(retry, delays[index++]);
  }

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${BADGE_CLASS} {
        display: inline-flex;
        align-items: center;
        min-height: 20px;
        margin-left: 6px;
        padding: 0 7px;
        border: 1px solid;
        border-radius: 999px;
        font: 600 11px/18px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        letter-spacing: .02em;
        white-space: nowrap;
        vertical-align: middle;
      }
      .ld-tle-badge--pending,
      .ld-tle-badge--unknown { color: #57606a; background: #f6f8fa; border-color: #d0d7de; }
      .ld-tle-badge--0 { color: #57606a; background: #eff2f5; border-color: #afb8c1; }
      .ld-tle-badge--1 { color: #0969da; background: #ddf4ff; border-color: #54aeff; }
      .ld-tle-badge--2 { color: #1a7f37; background: #dafbe1; border-color: #4ac26b; }
      .ld-tle-badge--3 { color: #9a6700; background: #fff8c5; border-color: #d4a72c; }
      .ld-tle-badge--4 { color: #8250df; background: #fbefff; border-color: #d8b4fe; }
      @media (prefers-color-scheme: dark) {
        .ld-tle-badge--pending,
        .ld-tle-badge--unknown { color: #8b949e; background: #21262d; border-color: #30363d; }
        .ld-tle-badge--0 { color: #8b949e; background: #21262d; border-color: #6e7681; }
        .ld-tle-badge--1 { color: #79c0ff; background: #0d2847; border-color: #1f6feb; }
        .ld-tle-badge--2 { color: #7ee787; background: #173c24; border-color: #2ea043; }
        .ld-tle-badge--3 { color: #e3b341; background: #3d2e00; border-color: #9e6a03; }
        .ld-tle-badge--4 { color: #d2a8ff; background: #2d1f4e; border-color: #8957e5; }
      }
    `;
    document.head.append(style);
  }

  addStyles();
  processWithRetries();

  new MutationObserver(scheduleProcessing).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  window.addEventListener('popstate', scheduleProcessing);
})();
