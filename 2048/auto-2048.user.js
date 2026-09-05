// ==UserScript==
// @name         2048 自动玩（小众软件论坛）
// @namespace    https://meta.appinn.net/
// @version      1.4.0
// @description   自动游玩论坛内嵌的 2048 小游戏，目标合成 4096。由你手动点「运行工件」开始、游戏结束手动「再来一局」重试（自动接着玩）；自动确认 2048 弹窗继续；支持存档续玩.
// @match       https://meta.appinn.net/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

// 生成模型：DeepSeek-V4-Flash-0731（自动玩 2048 至 4096；手动开始/重试；存档续玩）

(function () {
  'use strict';

  var BOT_CODE = `
(function () {
  'use strict';
  var W = [
    [32768, 16384, 8192, 4096],
    [512, 1024, 2048, 4096],
    [256, 128,  64,  32],
    [2,  4,  8,  16],
  ];
  var moves =0, restarts =0, timer =null, watcher =null;
  function post(o) {
    var s = JSON.stringify(o);
    try { window.top.postMessage(s, '*'); } catch (e) {}
    try { window.parent.postMessage(s, '*'); } catch (e) {}
  }
  function startBot() {
    if (timer) return;
    timer = setInterval(tick, 150);
  }
  function startWatcher() {
    if (watcher) return;
    watcher = setInterval(function () {
      var ov = document.querySelector('#overlay');
      var tl = document.querySelectorAll('#tileLayer .tile');
      if (tl.length > 0 && (!ov || ov.classList.contains('hidden'))) {
        clearInterval(watcher);
        watcher = null;
        startBot();
        post({ type: 'z2048', status: '已检测到新对局，继续自动玩…', max:  0, moves: moves, restarts: restarts });
      }
    },  1200);
  }
  function evaluate(g) {
    var score =0, empty =0;
    for (var r =0; r <4; r++) {
      for (var c =0; c <4; c++) {
        var v = g[r][c];
        if (v ===0) empty++; else score += v * W[r][c];
      }
    }
    return score + empty * 4096;
  }
  function emptyCells(g) {
    var out =[];
    for (var r =0; r <4; r++) {
      for (var c =0; c <4; c++) {
        if (g[r][c] ===0) out.push([r, c]);
      }
    }
    return out;
  }
  function cloneGrid(g) {
    return g.map(function (row) { return row.slice(); });
  }
  function applySpawn(g, r, c, v) {
    var copy = cloneGrid(g);
    copy[r][c] = v;
    return copy;
  }
  function slideLine(line) {
    var arr = line.filter(function (v) { return v !== 0; });
    var out =[], gained =0;
    for (var i =0; i < arr.length; i++) {
      if (i + 1 < arr.length && arr[i] === arr[i + 1]) {
        out.push(arr[i] * 2);
        gained += arr[i] * 2;
        i++;
      } else {
        out.push(arr[i]);
      }
    }
    while (out.length < 4) out.push(0);
    return { line: out, gained: gained };
  }
  function simulate(grid, dir) {
    var g = grid.map(function (row) { return row.slice(); });
    var moved = false, gained =0;
    if (dir === 'left' || dir === 'right') {
      for (var r =0; r <4; r++) {
        var line = g[r].slice();
        if (dir === 'right') line.reverse();
        var res = slideLine(line);
        var out2 = dir === 'right' ? res.line.reverse() : res.line;
        for (var c =0; c <4; c++) {
          if (g[r][c] !== out2[c]) moved = true;
          g[r][c] = out2[c];
        }
        gained += res.gained;
      }
    } else {
      for (var c =0; c <4; c++) {
        var line = [g[0][c], g[1][c], g[2][c], g[3][c]];
        if (dir === 'down') line.reverse();
        var res = slideLine(line);
        var out2 = dir === 'down' ? res.line.reverse() : res.line;

        for (var r =0; r <4; r++) {
          if (g[r][c] !== out2[r]) moved = true;
          g[r][c] = out2[r];
        }
        gained += res.gained;
      }
    }
    return { grid: g, moved: moved, gained: gained };
  }
  function sampleEmpties(grid, limit) {
    var all = emptyCells(grid);
    if (all.length <= limit) return all;
    var out =[];
    for (var i =0; i < limit; i++) {
      var idx = Math.floor(Math.random() * all.length);
      out.push(all.splice(idx, 1)[0]);
    }
    return out;
  }
  function expect(grid, depth, dirs) {
    var empties = sampleEmpties(grid,  4);
    if (empties.length ===0) return evaluate(grid);
    var total =0;
    for (var k =0; k < empties.length; k++) {
      var cell = empties[k], r = cell[0], c = cell[1];
      var g2 = applySpawn(grid, r, c,  2);
      var g4 = applySpawn(grid, r, c, 4);
      total += 0.9 * nextBest(g2, depth, dirs) + 0.1 * nextBest(g4, depth, dirs);
    }
    return total / empties.length;
  }
  function nextBest(g, depth, dirs) {
    var tries =[];
    for (var i =0; i <4; i++) {
      var d = dirs[i], res = simulate(g, d);
      if (!res.moved) continue;
      tries.push({ d: d, res: res, v: evaluate(res.grid) });
    }
    if (!tries.length) return -Infinity;
    tries.sort(function (a, b) { return b.v - a.v; });
    var cut = tries.slice(0, Math.min(2, tries.length));
    var best = -Infinity;
    for (var i =0; i < cut.length; i++) {
      var t = cut[i];
      var v = depth <=0 ? t.v : expect(t.res.grid, depth -1, dirs);
      if (v > best) best = v;
    }
    return best;
  }
  function chooseMove(grid) {
    var dirs = ['up', 'down', 'left', 'right'];
    var keyMap = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
    var scored =[];
    for (var i =0; i <4; i++) {
      var d = dirs[i], res = simulate(grid, d);
      if (!res.moved) continue;
      scored.push({ d: d, sc: expect(res.grid,  2, dirs) });
    }
    if (!scored.length) return null;
    var bestScore = -Infinity;
    for (var i =0; i < scored.length; i++) {
      if (scored[i].sc > bestScore) bestScore = scored[i].sc;
    }
    var top =[];
    for (var i =0; i < scored.length; i++) {
      if (scored[i].sc >= bestScore -  0.01) top.push(scored[i]);
    }
    var pick = top[Math.floor(Math.random() * top.length)];
    return { d: pick.d, key: keyMap[pick.d] };
  }
  function pressKey(key) {
    var board = document.querySelector('#board');
    var code = key === 'ArrowUp' ? 38 : key === 'ArrowDown' ? 40 : key === 'ArrowLeft' ? 37 : 39;
    var opts = { key: key, code: key, keyCode: code, which: code, bubbles: true, cancelable: true };
    if (board) board.dispatchEvent(new KeyboardEvent('keydown', opts));
  }
  function parseGrid() {
    var g = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    var tiles = document.querySelectorAll('#tileLayer .tile');
    for (var i =0; i < tiles.length; i++) {
      var t = tiles[i], cls = t.className, m = cls.match(/tile-(\\d+)/);
      if (!m) continue;
      var v = parseInt(m[1], 10);
      var ts = t.style.getPropertyValue('--tile-top') || '', ls = t.style.getPropertyValue('--tile-left') || '';
      var tm = ts.match(/calc\\(\\s*(\\d+)/), lm = ls.match(/calc\\(\\s*(\\d+)/);
      var r = tm ? parseInt(tm[1], 10) : 0, c = lm ? parseInt(lm[1], 10) : 0;
      if (r >=0 && r <4 && c >=0 && c <4) g[r][c] = v;
    }
    return g;
  }
  function tick() {
    if (!document.querySelector('#board')) return;
    var tiles = document.querySelectorAll('#tileLayer .tile');
    var maxTile =0;
    for (var i =0; i < tiles.length; i++) {
      var m = tiles[i].className.match(/tile-(\\d+)/);
      if (m) maxTile = Math.max(maxTile, parseInt(m[1], 10));
    }
    var ov = document.querySelector('#overlay');
    if (ov && !ov.classList.contains('hidden')) {
      var ot = (document.querySelector('#overlayTitle') || {}).textContent || '';
      if (ot.indexOf('2048') !== -1) {
        var pb = document.querySelector('#overlayPrimary');
        if (pb) {
          pb.click();
          restarts++;
          post({ type: 'z2048', status: '2048 弹窗已自动确认，继续…', max: maxTile, moves: moves, restarts: restarts });
        }
        return;
      }
    }
    if (maxTile >=  4096) {
      if (timer) clearInterval(timer);
      timer = null;
      post({ type: 'z2048', status: '目标达成：已合成 4096！', max: maxTile, moves: moves, restarts: restarts, done: true });
      return;
    }
    var grid = parseGrid();
    var mv = chooseMove(grid);
    if (!mv) {
      if (timer) clearInterval(timer);
      timer = null;
      post({ type: 'z2048', status: '游戏结束，请手动点击「再来一局」重试…', max: maxTile, moves: moves, restarts: restarts });
      startWatcher();
      return;
    }
    moves++;
    pressKey(mv.key);
    if (moves % 5 ===0) post({ type: 'z2048', status: '运行中…', max: maxTile, moves: moves, restarts: restarts });
  }
  startBot();
  post({ type: 'z2048', status: '已注入，开始自动玩…', max:  0, moves:  0, restarts: 0 });
})();`;

  var panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;top:10px;right:10px;z-index:999999;background:rgba(20,20,30,0.92);color:#eee;font:13px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;padding:10px 12px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.35);min-width:200px;user-select:none;;';
  panel.innerHTML =
    '<div style="font-weight:600;margin-bottom:6px;">2048 自动玩</div>' +
    '<div id="z2048-status">状态：等待注入…</div>' +
    '<div>最大方块：<span id="z2048-max">-</span></div>' +
    '<div>移动次数：<span id="z2048-moves">0</span>　重开：<span id="z2048-restarts">0</span></div>' +
    '<div style="margin-top:8px;">' +
    '<button id="z2048-reinject" style="width:100%;border:0;border-radius:4px;padding:5px 8px;cursor:pointer;background:#2e7d32;color:#fff;">重开</button>' +
    '</div>';
  document.body.appendChild(panel);

  var $ = function (s) { return document.querySelector(s); };
  var statusEl = $('#z2048-status');
  var maxEl = $('#z2048-max');
  var movesEl = $('#z2048-moves');
  var restartsEl = $('#z2048-restarts');
  var reinjectBtn = $('#z2048-reinject');

  var setStatus = function (t) { statusEl.textContent = t; };
  var injected = false;
  var listening = false;

  var findOuter = function () {
    var frames = document.querySelectorAll('iframe');
    for (var i =0; i < frames.length; i++) {
      var f = frames[i];
      if (/discourse-ai\/ai-bot\/artifacts\//.test(f.src)) {
        try {
          var d = f.contentDocument || (f.contentWindow && f.contentWindow.document);
          if (d) return { frame: f, doc: d };
        } catch (e) {}
      }
    }
    return null;
  };

  var inject = function () {
    var outer = findOuter();
    if (!outer) return 'waiting';
if (!listening) {
      window.addEventListener('message', onBotMessage);
      if (outer.frame && outer.frame.contentWindow) {
        outer.frame.contentWindow.addEventListener('message', onBotMessage);
      }
      listening = true;
    }
    var game = outer.doc.querySelector('iframe[srcdoc]');
    if (!game) return 'waiting';
    var html = game.getAttribute('srcdoc') || '';
    if (!html) return 'waiting';
var marker = '<!--z2048-bot-->';
    html = html.replace(/<!--z2048-bot--><script>[\s\S]*?<\/script>/g, '');
    html = html.replace(/<!--z2048-bot-->/g, '');
    var injectHtml = marker + '<script>' + BOT_CODE + '</scr' + 'ipt>';
    if (html.indexOf('</body>') !== -1) html = html.replace('</body>', injectHtml + '</body>');
    else html += injectHtml;
    game.setAttribute('srcdoc', html);
    return 'injected';
  };

var pollTimer = setInterval(function () {
    if (injected) return;
    if (!document.querySelector('.ai-artifact__click-to-run') && !findOuter()) {
      setStatus('请点击「运行工件」开始游戏（自动玩到 4096）…');
      return;
    }
    var r = inject();
    if (r === 'injected' || r === 'already') {
      injected = true;
      clearInterval(pollTimer);
      setStatus('已注入自动玩脚本，等待反馈…');
    }
  },  800);

  reinjectBtn.addEventListener('click', function () {
    injected = false;
    movesEl.textContent = '0';
    restartsEl.textContent = '0';
    maxEl.textContent = '-';
    setStatus('重新注入中…');
    pollTimer = setInterval(function () {
      if (injected) return;
      var r = inject();
      if (r === 'injected' || r === 'already') {
        injected = true;
        clearInterval(pollTimer);
        setStatus('已注入自动玩脚本，等待反馈…');
      }
    }, 800);
  });

  var onBotMessage = function (e) {
    try {
      var d = JSON.parse(e.data);
      if (d && d.type === 'z2048') {
        setStatus(d.status || '');
        if (d.max) maxEl.textContent = d.max;
        movesEl.textContent = d.moves || 0;
        restartsEl.textContent = d.restarts ||  0;
      }
    } catch (e) {}
  };
})();