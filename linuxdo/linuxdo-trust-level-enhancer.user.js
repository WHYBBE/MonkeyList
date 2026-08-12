// ==UserScript==
// @name         LinuxDo Trust Level Enhancer
// @namespace    https://linux.do/
// @version      0.10.0
// @description  Strengthen trust level display on linux.do topic lists by turning the LvN portion of category badges into prominent colored chips, accenting rows by trust level, de-emphasizing promotional topics, surfacing the post creation date inside the activity column, highlighting the original poster's avatar, emphasizing the original poster (楼主) on topic pages, marking topics with no replies, and dimming topics older than a week.
// @match        https://linux.do/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const STYLE_ID = 'ld-tle-style';
  const CHIP_CLASS = 'ld-tle-chip';
  const ROW_CLASS = 'ld-tle-row';
  const PROMO_CLASS = 'ld-tle-promo';
  const LOTTERY_CLASS = 'ld-tle-lottery';
  const LONELY_CLASS = 'ld-tle-lonely';
  const STALE_CLASS = 'ld-tle-stale';
  const WELFARE_BADGE_CLASS = 'ld-tle-welfare';
  const TIME_CLASS = 'ld-tle-time';
  const TIME_DONE = 'data-ld-tle-timedone';
  const POSTERS_DONE = 'data-ld-tle-postersdone';
  const OP_POST_CLASS = 'ld-tle-op-post';
  const NAME_SEL = '.badge-category__name';
  const PROMO_TAGS = ['高级推广'];
  const LOTTERY_TAGS = ['抽奖'];

  let opUserId = null;
  let cachedTopicId = null;

  function parseLevel(text) {
    text = (text || '').trim();
    if (!text) return null;
    let m = text.match(/^(.+?)[,，]\s*Lv\s*(\d+)\s*$/i);
    if (m && m[1].trim()) return { name: m[1].trim(), level: Number(m[2]) };
    m = text.match(/\bLv\s*(\d+)\b/i);
    if (m) {
      const level = Number(m[1]);
      const name = text.replace(/\s*[,，]?\s*Lv\s*\d+\s*/i, '').trim();
      if (name && level >= 0 && level <= 4) return { name, level };
    }
    return null;
  }

  function enhanceBadge(nameEl) {
    const parsed = parseLevel(nameEl.textContent);
    const row = nameEl.closest('tr.topic-list-item');
    const td = row && row.querySelector('td.main-link');
    if (td && parsed) {
      td.classList.add(ROW_CLASS, `${ROW_CLASS}--${parsed.level}`);
    }
    const intact = nameEl.lastElementChild && nameEl.lastElementChild.classList.contains(CHIP_CLASS);
    if (intact || !parsed) return;

    const { name, level } = parsed;
    nameEl.textContent = name;
    const chip = document.createElement('span');
    chip.className = `${CHIP_CLASS} ${CHIP_CLASS}--${level}`;
    chip.textContent = `Lv${level}`;
    chip.title = `信任等级 ${level}`;
    nameEl.append(chip);
  }

  function enhanceWelfareBadge() {
    document.querySelectorAll('a.badge-category__wrapper[href*="/c/welfare/"]').forEach((wrapper) => {
      const badge = wrapper.querySelector('.badge-category');
      if (badge && !badge.classList.contains(WELFARE_BADGE_CLASS)) {
        badge.classList.add(WELFARE_BADGE_CLASS);
      }
    });
  }

  function weakenPromoRows() {
    document.querySelectorAll('tr.topic-list-item').forEach((row) => {
      const tagNames = [...row.querySelectorAll('a.discourse-tag[data-tag-name]')]
        .map((a) => a.getAttribute('data-tag-name'));
      const isPromo = PROMO_TAGS.some((t) => tagNames.includes(t));
      const isLottery = LOTTERY_TAGS.some((t) => tagNames.includes(t));
      row.classList.toggle(PROMO_CLASS, isPromo);
      row.classList.toggle(LOTTERY_CLASS, isLottery && !isPromo);
    });
  }

  function markLonelyTopics() {
    document.querySelectorAll('tr.topic-list-item').forEach((row) => {
      const postersTd = row.querySelector('td.posters');
      if (!postersTd) return;
      const usernames = [...postersTd.querySelectorAll('a[data-user-card]')]
        .map((a) => a.getAttribute('data-user-card'));
      const unique = [...new Set(usernames)].filter(Boolean);
      if (unique.length === 0) return;
      const isLonely = unique.length === 1;
      if (isLonely) {
        if (!row.classList.contains(LONELY_CLASS)) row.classList.add(LONELY_CLASS);
      } else {
        if (row.classList.contains(LONELY_CLASS)) row.classList.remove(LONELY_CLASS);
      }
    });
  }

  function markStaleTopics() {
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    document.querySelectorAll('tr.topic-list-item').forEach((row) => {
      const activityTd = row.querySelector('td.activity');
      if (!activityTd) return;
      const created = parseCreatedDate(activityTd.getAttribute('title') || '');
      if (!created) return;
      const m = created.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*(\d{1,2}):(\d{2}))?/);
      if (!m) return;
      const ts = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] ? Number(m[4]) : 0, m[5] ? Number(m[5]) : 0).getTime();
      if (isNaN(ts)) return;
      const isStale = now - ts > WEEK_MS;
      if (isStale) {
        if (!row.classList.contains(STALE_CLASS)) row.classList.add(STALE_CLASS);
      } else {
        if (row.classList.contains(STALE_CLASS)) row.classList.remove(STALE_CLASS);
      }
    });
  }

  function parseCreatedDate(title) {
    if (!title) return null;
    const m = title.match(/创建日期[：:]\s*(.+?)(?:\n|$)/);
    return m ? m[1].trim() : null;
  }

  function formatCreated(raw) {
    const m = raw.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*(\d{1,2}):(\d{2}))?/);
    if (!m) return { text: raw, tier: 'old' };
    const ts = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] ? Number(m[4]) : 0, m[5] ? Number(m[5]) : 0).getTime();
    if (isNaN(ts)) return { text: raw, tier: 'old' };
    const now = Date.now();
    const diff = now - ts;
    const DAY = 24 * 60 * 60 * 1000;
    const WEEK = 7 * DAY;
    if (diff < DAY) {
      const hours = Math.max(1, Math.floor(diff / (60 * 60 * 1000)));
      return { text: `${hours}小时内`, tier: 'fresh' };
    }
    if (diff < WEEK) {
      const days = Math.floor(diff / DAY);
      return { text: `${days}天内`, tier: 'week' };
    }
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    const md = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return d.getFullYear() === new Date().getFullYear()
      ? { text: md, tier: 'old' }
      : { text: `${d.getFullYear()}-${md}`, tier: 'old' };
  }

  function injectTimes() {
    document.querySelectorAll('tr.topic-list-item').forEach((row) => {
      if (row.hasAttribute(TIME_DONE)) return;
      const activityTd = row.querySelector('td.activity');
      if (!activityTd) return;
      const created = parseCreatedDate(activityTd.getAttribute('title') || '');
      if (!created) return;
      row.setAttribute(TIME_DONE, '');
      const link = activityTd.querySelector('.post-activity');
      if (!link) return;
      const { text, tier } = formatCreated(created);
      const chip = document.createElement('span');
      chip.className = tier === 'old' ? TIME_CLASS : `${TIME_CLASS} ${TIME_CLASS}--${tier}`;
      chip.textContent = text;
      chip.title = `发帖于 ${created}`;
      link.insertAdjacentElement('afterend', chip);
    });
  }

  function enhancePosters() {
    document.querySelectorAll('tr.topic-list-item').forEach((row) => {
      const postersTd = row.querySelector('td.posters');
      if (!postersTd || postersTd.hasAttribute(POSTERS_DONE)) return;
      postersTd.setAttribute(POSTERS_DONE, '');
      const imgs = [...postersTd.querySelectorAll('a > img.avatar')];
      if (!imgs.length) return;
      const opImg = imgs.find((img) => /原始发帖人/.test(img.getAttribute('title') || '')) || imgs[0];
      opImg.classList.add('ld-tle-op');
      imgs.forEach((img) => { if (img !== opImg) img.classList.add('ld-tle-other'); });
      const mainTd = row.querySelector('td.main-link');
      const levelClass = mainTd && [...mainTd.classList].find((c) => /^ld-tle-row--\d$/.test(c));
      if (levelClass) opImg.classList.add(levelClass.replace('ld-tle-row', 'ld-tle-op'));
    });
  }

  function currentTopicId() {
    const m = location.pathname.match(/^\/t\/[^/]+\/(\d+)/);
    return m ? m[1] : null;
  }

  function getOpUserId() {
    const tid = currentTopicId();
    if (tid !== null && tid === cachedTopicId && opUserId !== null) return opUserId;
    cachedTopicId = tid;
    opUserId = null;
    if (tid) {
      const preloaded = document.getElementById('data-preloaded');
      if (preloaded) {
        try {
          const data = JSON.parse(preloaded.textContent);
          const key = `topic_${tid}`;
          if (data[key]) {
            const t = JSON.parse(data[key]);
            if (t && t.user_id != null) { opUserId = String(t.user_id); return opUserId; }
          }
        } catch (e) { /* fall through */ }
      }
    }
    const post1 = document.querySelector('article#post_1[data-user-id]');
    if (post1) opUserId = post1.getAttribute('data-user-id');
    return opUserId;
  }

  function enhanceOpPosts() {
    const opId = getOpUserId();
    if (!opId) return;
    document.querySelectorAll('article[id^="post_"]').forEach((post) => {
      if (post.getAttribute('data-user-id') !== opId) return;
      post.classList.add(OP_POST_CLASS);
    });
  }

  function processPage() {
    addStyles();
    document.querySelectorAll(NAME_SEL).forEach(enhanceBadge);
    enhanceWelfareBadge();
    weakenPromoRows();
    markLonelyTopics();
    markStaleTopics();
    injectTimes();
    enhancePosters();
    enhanceOpPosts();
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
      .${CHIP_CLASS} {
        display: inline-flex;
        align-items: center;
        margin-left: 6px;
        padding: 0 6px;
        border-radius: 999px;
        font: 700 10px/16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        letter-spacing: .03em;
        vertical-align: 1px;
      }
      .${CHIP_CLASS}--0 { color: #fff; background: #8a9199; }
      .${CHIP_CLASS}--1 { color: #fff; background: #0969da; }
      .${CHIP_CLASS}--2 { color: #fff; background: #1a7f37; }
      .${CHIP_CLASS}--3 { color: #24292f; background: #d4a72c; }
      .${CHIP_CLASS}--4 { color: #fff; background: #8250df; }
      .${WELFARE_BADGE_CLASS} {
        box-shadow: 0 0 0 2px rgba(228,87,53,.55), 0 2px 6px rgba(228,87,53,.3) !important;
        background: rgba(228,87,53,.14) !important;
        font-weight: 700 !important;
      }
      td.${ROW_CLASS} { --ld-tle-lv: transparent; box-shadow: inset 3px 0 0 0 var(--ld-tle-lv) !important; }
      td.${ROW_CLASS}--0 { --ld-tle-lv: #8a9199; }
      td.${ROW_CLASS}--1 { --ld-tle-lv: #0969da; }
      td.${ROW_CLASS}--2 { --ld-tle-lv: #1a7f37; }
      td.${ROW_CLASS}--3 { --ld-tle-lv: #d4a72c; }
      td.${ROW_CLASS}--4 { --ld-tle-lv: #8250df; }
      tr.topic-list-item td {
        transition: opacity .15s ease, filter .15s ease, background .15s ease;
      }
      tr.${STALE_CLASS} td {
        opacity: .62;
        filter: grayscale(.35);
      }
      tr.${STALE_CLASS}:hover td {
        opacity: .92;
        filter: none;
      }
      tr.${PROMO_CLASS} td {
        opacity: .38;
        filter: grayscale(.7);
        background: rgba(178,186,197,.08);
      }
      tr.${PROMO_CLASS} td:first-child {
        box-shadow: inset 3px 0 0 #9aa4af !important;
      }
      tr.${PROMO_CLASS} .raw-topic-link {
        text-decoration: line-through;
        text-decoration-color: rgba(110,118,129,.6);
        text-decoration-thickness: 1.5px;
      }
      tr.${PROMO_CLASS}:hover td {
        opacity: .88;
        filter: none;
        background: transparent;
      }
      tr.${PROMO_CLASS}:hover .raw-topic-link { text-decoration: none; }
      tr.${LOTTERY_CLASS} td {
        opacity: .5;
        filter: grayscale(.5);
        background: rgba(130,80,223,.06);
      }
      tr.${LOTTERY_CLASS} td:first-child {
        box-shadow: inset 3px 0 0 #8250df !important;
      }
      tr.${LOTTERY_CLASS} .raw-topic-link {
        text-decoration: line-through;
        text-decoration-color: rgba(130,80,223,.5);
        text-decoration-thickness: 1.5px;
      }
      tr.${LOTTERY_CLASS}:hover td {
        opacity: .88;
        filter: none;
        background: transparent;
      }
      tr.${LOTTERY_CLASS}:hover .raw-topic-link { text-decoration: none; }
      img.ld-tle-op {
        box-shadow: 0 0 0 2px #8a9199 !important;
        transition: box-shadow .15s ease;
      }
      img.ld-tle-op.ld-tle-op--1 { box-shadow: 0 0 0 2px #0969da !important; }
      img.ld-tle-op.ld-tle-op--2 { box-shadow: 0 0 0 2px #1a7f37 !important; }
      img.ld-tle-op.ld-tle-op--3 { box-shadow: 0 0 0 2px #d4a72c !important; }
      img.ld-tle-op.ld-tle-op--4 { box-shadow: 0 0 0 2px #8250df !important; }
      img.ld-tle-other {
        opacity: .4 !important;
        filter: grayscale(.6) !important;
        transition: opacity .15s ease, filter .15s ease;
      }
      tr.topic-list-item:hover img.ld-tle-other {
        opacity: .85 !important;
        filter: none !important;
      }
      article.${OP_POST_CLASS} .post__body > .topic-meta-data .names .first::after {
        content: '楼主';
        display: inline-flex;
        align-items: center;
        margin: 0 0 0 6px;
        padding: 0 6px;
        border-radius: 3px;
        color: #fff;
        background: #8250df;
        font: 600 11px/18px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        vertical-align: middle;
      }
      article.${OP_POST_CLASS} {
        box-shadow: inset 2px 0 0 #8250df !important;
        padding-left: 6px !important;
      }
      tr.${LONELY_CLASS} td.main-link:not(.${ROW_CLASS}) {
        box-shadow: inset 3px 0 0 0 #bf8700 !important;
      }
      tr.${LONELY_CLASS} .raw-topic-link::after {
        content: '待回复';
        display: inline-flex;
        align-items: center;
        margin-left: 6px;
        padding: 0 6px;
        border-radius: 3px;
        color: #fff;
        background: #9a6700;
        font: 600 10px/16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        vertical-align: middle;
      }
      .${TIME_CLASS} {
        display: block;
        margin-top: 3px;
        padding: 1px 6px;
        border: 1px solid #d0d7de;
        border-radius: 5px;
        color: #57606a;
        background: #f6f8fa;
        font: 500 11px/16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        white-space: nowrap;
        text-align: center;
      }
      .${TIME_CLASS}--fresh {
        color: #fff;
        background: #1a7f37;
        border-color: #1a7f37;
        font-weight: 700;
      }
      .${TIME_CLASS}--week {
        color: #0969da;
        background: #ddf4ff;
        border-color: #54aeff;
        font-weight: 600;
      }
      tr.${PROMO_CLASS} .${TIME_CLASS} { opacity: .7; }
      @media (prefers-color-scheme: dark) {
        .${CHIP_CLASS}--0 { color: #f0f6fc; background: #6e7681; }
        .${CHIP_CLASS}--1 { color: #f0f6fc; background: #1f6feb; }
        .${CHIP_CLASS}--2 { color: #f0f6fc; background: #2ea043; }
        .${CHIP_CLASS}--3 { color: #3d2e00; background: #e3b341; }
        .${CHIP_CLASS}--4 { color: #f0f6fc; background: #8957e5; }
        .${WELFARE_BADGE_CLASS} {
          box-shadow: 0 0 0 2px rgba(228,87,53,.6), 0 2px 6px rgba(0,0,0,.4) !important;
          background: rgba(228,87,53,.18) !important;
        }
        td.${ROW_CLASS}--0 { --ld-tle-lv: #6e7681; }
        td.${ROW_CLASS}--1 { --ld-tle-lv: #1f6feb; }
        td.${ROW_CLASS}--2 { --ld-tle-lv: #2ea043; }
        td.${ROW_CLASS}--3 { --ld-tle-lv: #e3b341; }
        td.${ROW_CLASS}--4 { --ld-tle-lv: #8957e5; }
        .${TIME_CLASS} { color: #8b949e; background: #21262d; border-color: #30363d; }
        .${TIME_CLASS}--fresh { color: #f0f6fc; background: #2ea043; border-color: #2ea043; }
        .${TIME_CLASS}--week { color: #79c0ff; background: #0d2847; border-color: #1f6feb; }
        article.${OP_POST_CLASS} .post__body > .topic-meta-data .names .first::after { background: #8957e5; }
        tr.${LONELY_CLASS} td.main-link:not(.${ROW_CLASS}) {
          box-shadow: inset 3px 0 0 0 #9e6a03 !important;
        }
        tr.${LONELY_CLASS} .raw-topic-link::after { background: #9e6a03; }
        img.ld-tle-op { box-shadow: 0 0 0 2px #6e7681 !important; }
        img.ld-tle-op.ld-tle-op--1 { box-shadow: 0 0 0 2px #1f6feb !important; }
        img.ld-tle-op.ld-tle-op--2 { box-shadow: 0 0 0 2px #2ea043 !important; }
        img.ld-tle-op.ld-tle-op--3 { box-shadow: 0 0 0 2px #e3b341 !important; }
        img.ld-tle-op.ld-tle-op--4 { box-shadow: 0 0 0 2px #8957e5 !important; }
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
