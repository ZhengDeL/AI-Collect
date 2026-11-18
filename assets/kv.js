/* KV 卸载全景图 —— 纯静态前端，无构建步骤（写法与 app.js 保持一致） */
(function () {
  'use strict';

  var state = {
    doc: null,
    line: '全部',      // 全部 | nvidia | ascend
    scenario: '全部',  // 全部 | S1..S6
    evidence: '全部',  // 全部 | A | B | C | D
    query: ''
  };

  var el = {
    overview: document.getElementById('kv-overview'),
    filters: document.getElementById('kv-filters'),
    search: document.getElementById('kv-search'),
    list: document.getElementById('kv-list'),
    empty: document.getElementById('kv-empty'),
    theme: document.getElementById('theme-toggle')
  };

  var SCENARIOS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'];
  var EVIDENCES = ['A', 'B', 'C', 'D'];
  var LINES = [
    ['全部', '全部'],
    ['nvidia', 'NVIDIA'],
    ['ascend', '昇腾']
  ];
  var PIT_LABELS = [
    ['hit', '命中'],
    ['consist', '一致'],
    ['block', '阻塞'],
    ['engine_change', '改引擎'],
    ['active', '活跃']
  ];

  // 代号释义：页面上 S1–S6 / L1–L5 / A–D 全部靠这三张表渲染，改口径只改这里
  var SCENARIO_INFO = {
    S1: ['单实例共置', '单实例里同时做 prefill 和 decode（PD 混合），把前缀 KV 从显存挪到本机内存或盘。'],
    S2: ['PD 分离传输', 'prefill 与 decode 拆到不同实例，KV 要跨机搬运——这是「传输」，不是「卸载」。'],
    S3: ['集群共享池', '多个实例共用一个远端 KV 池，谁命中谁少算，池子通常是内存 + SSD。'],
    S4: ['超长上下文', '128k+ 场景：只保留重要的 KV（稀疏），或按热度分层摆放。'],
    S5: ['多模态 encoder', '图像/视频 encoder 的输出复用，不是纯文本 KV。'],
    S6: ['RL/训推分离', 'rollout 与训练之间复用 KV / hidden-state，含权重热更新。']
  };

  var EVIDENCE_INFO = {
    A: ['官方/源码', '官方文档、源码或 release note 里写明的能力，可照做。'],
    B: ['一手实测', '有人真的跑过并给出数字（含本机实测）。'],
    C: ['论文自报', '论文里自报的数字，未独立复现。'],
    D: ['社区声称', '社区说好用，但没有可核的证据（未复现）。']
  };

  var LAYER_INFO = {
    L1: ['HBM', '加速卡显存。KV 本来就生成在这里，最快的一层。'],
    L2: ['主机 DRAM', '服务器内存。容量比显存大得多，带宽低一个量级。'],
    L3: ['本地 NVMe/SSD', '本机盘。容量最大，延迟最高。'],
    L4: ['远端内存/存储', '跨机经 RDMA/网络拿到的另一台机器的内存或盘。'],
    L5: ['集群共享池', '全局共享的前缀缓存服务，如 Mooncake Store、LMCache、Ascend Store。']
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function initTheme() {
    var saved = localStorage.getItem('theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    // 首页同时加载 app.js：主题按钮已由 app.js 绑定，两个 handler 会把主题切两次而互相抵消
    if (window.__themeClickBound) return;
    window.__themeClickBound = true;
    el.theme.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', cur);
      localStorage.setItem('theme', cur);
    });
  }

  function loadJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' → HTTP ' + r.status);
      return r.json();
    });
  }

  function items() { return (state.doc && state.doc.items) || []; }

  function countBy(fn) {
    var m = {};
    items().forEach(function (it) { var k = fn(it); m[k] = (m[k] || 0) + 1; });
    return m;
  }

  // ---------- 顶部统计（数字全部从数据算）----------
  function renderOverview() {
    var all = items();
    var lineCount = countBy(function (it) { return it.line; });
    var evCount = countBy(function (it) { return it.evidence; });
    var nv = lineCount.nvidia || 0, asc = lineCount.ascend || 0;

    var totals =
      '<div class="kv-totals">' +
        '<span class="kv-total">NVIDIA <b>' + nv + '</b></span>' +
        '<span class="kv-total">昇腾 <b>' + asc + '</b></span>' +
        '<span class="kv-total">共 <b>' + all.length + '</b></span>' +
      '</div>';

    var dist = '<div class="kv-dist"><span class="dist-label">证据分级</span>' +
      EVIDENCES.map(function (e) {
        var info = EVIDENCE_INFO[e] || [e, e];
        return '<span class="ev-dist-item" title="' + esc('证据 ' + e + '：' + info[0] + '——' + info[1]) + '">' +
          '<span class="ebadge ev-' + e + '">' + e + '</span>' +
          '<b>' + (evCount[e] || 0) + '</b></span>';
      }).join('') + '</div>' +
      '<p class="kv-evnote">A 官方/源码 · B 一手实测 · C 论文自报 · D 社区声称；只有 A/B 才写「建议上」，C/D 只作线索。</p>';

    var gen = state.doc && state.doc.generated_at
      ? '<p class="kv-sub">数据生成：' + esc(state.doc.generated_at) + '</p>' : '';
    el.overview.innerHTML =
      '<p class="kv-eyebrow">全景图 · KV CACHE OFFLOADING</p>' +
      '<h2>两条线 · 六个场景 · 五层缓存</h2>' + gen + totals + dist;
  }

  // ---------- 三组可叠加筛选（组间 AND，组内单选）----------
  function chip(cls, key, val, label, count, disabled, active, title) {
    return '<button class="chip' + (active ? ' active' : '') + (disabled ? ' kv-disabled' : '') +
      '" data-key="' + key + '" data-val="' + esc(val) + '" role="tab"' +
      (title ? ' title="' + esc(title) + '"' : '') +
      (disabled ? ' disabled aria-disabled="true"' : '') + '>' +
      esc(label) + (count != null ? '<span class="count">' + count + '</span>' : '') + '</button>';
  }

  function renderFilters() {
    var lineCount = countBy(function (it) { return it.line; });
    // 场景 chip 数字与筛选口径一致：条目 scenario 含该轴即计入（不是只看首个场景），
    // 否则 S3 这类「第二场景」会出现 chip 显示 18、点击却出 21 的自相矛盾。
    var scCount = {};
    items().forEach(function (it) {
      (it.scenario || []).forEach(function (s) { scCount[s] = (scCount[s] || 0) + 1; });
    });
    var evCount = countBy(function (it) { return it.evidence; });
    var all = items().length;

    // ① 线
    var lineRow = '<div class="filter-row"><span class="filter-label">线</span>' +
      LINES.map(function (p) {
        var c = p[0] === '全部' ? all : (lineCount[p[0]] || 0);
        return chip('', 'line', p[0], p[1], c, false, state.line === p[0]);
      }).join('') + '</div>';

    // ② 场景轴 S1–S6：chip 上直接带中文短名，不用回头对照图例
    var scRow = '<div class="filter-row"><span class="filter-label">场景轴</span>' +
      chip('', 'scenario', '全部', '全部', all, false, state.scenario === '全部') +
      SCENARIOS.map(function (s) {
        var info = SCENARIO_INFO[s] || [s, ''];
        return chip('', 'scenario', s, s + ' ' + info[0], scCount[s] || 0, false,
          state.scenario === s, s + ' ' + info[0] + '：' + info[1]);
      }).join('') + '</div>';

    // ③ 证据 A/B/C/D；C 档 0 条 → 显示 C 0 并禁用，点了也不出空白页
    var evRow = '<div class="filter-row"><span class="filter-label">证据</span>' +
      chip('', 'evidence', '全部', '全部', all, false, state.evidence === '全部') +
      EVIDENCES.map(function (e) {
        var c = evCount[e] || 0;
        var disabled = c === 0;
        var info = EVIDENCE_INFO[e] || [e, ''];
        // 若当前误选了空档，重置回全部，避免出现空白页
        if (disabled && state.evidence === e) state.evidence = '全部';
        return chip('', 'evidence', e, e + ' ' + info[0], c, disabled, state.evidence === e,
          '证据 ' + e + '（' + info[0] + '）：' + info[1]);
      }).join('') + '</div>';

    el.filters.innerHTML = lineRow + scRow + evRow;

    el.filters.querySelectorAll('.chip[data-key]').forEach(function (b) {
      if (b.disabled) return;
      b.addEventListener('click', function () {
        var key = b.getAttribute('data-key');
        var val = b.getAttribute('data-val');
        if (key === 'line') state.line = val;
        else if (key === 'scenario') state.scenario = val;
        else if (key === 'evidence') state.evidence = val;
        renderFilters();
        renderList();
      });
    });
  }

  // ---------- 单张卡片 ----------
  function lineBadge(line) {
    if (line === 'nvidia') return '<span class="badge badge-nvidia">NVIDIA</span>';
    if (line === 'ascend') return '<span class="badge badge-ascend">昇腾</span>';
    return '<span class="badge badge-other">' + esc(line || '其他') + '</span>';
  }

  function cardHTML(it) {
    var ev = it.evidence || 'D';
    var evInfo = EVIDENCE_INFO[ev] || [ev, ''];
    var ebadge = '<span class="ebadge ev-' + esc(ev) + '" title="' +
      esc('证据 ' + ev + '（' + evInfo[0] + '）：' + evInfo[1]) + '">' + esc(ev) + '</span>';

    var line = lineBadge(it.line);
    var id = it.id ? '<span class="kv-id">' + esc(it.id) + '</span>' : '';

    var tags = '';
    var scen = (it.scenario || []).map(function (s) {
      var info = SCENARIO_INFO[s] || [s, ''];
      return '<span class="tag" title="' + esc(s + ' ' + info[0] + '：' + info[1]) + '">' + esc(s) + '</span>';
    }).join('');
    var layers = (it.layers || []).map(function (l) {
      var info = LAYER_INFO[l] || [l, ''];
      return '<span class="tag" title="' + esc(l + ' ' + info[0] + '：' + info[1]) + '">' + esc(l) + '</span>';
    }).join('');
    if (scen || layers) tags = '<div class="kv-tags">' + scen + layers + '</div>';

    var gain = it.gain
      ? '<p class="kv-gain"><span class="gain-label">收益</span>' + esc(it.gain) + '</p>' : '';

    var p = it.pitfalls || {};
    var pitBody = PIT_LABELS.map(function (pair) {
      var v = p[pair[0]];
      if (v == null || v === '') return '';
      return '<div class="pit-row"><span class="pit-k">' + pair[1] + '</span>' +
        '<span class="pit-v">' + esc(v) + '</span></div>';
    }).join('');
    var pitfall = pitBody
      ? '<details class="pitfall"><summary>坑：命中 / 一致 / 阻塞 / 改引擎 / 活跃</summary>' +
          '<div class="pit-body">' + pitBody + '</div></details>' : '';

    var engine = it.engine ? '<span class="kv-engine">' + esc(it.engine) + '</span>' : '';
    var origin = it.url && /^https?:/.test(it.url)
      ? '<a class="origin" href="' + esc(it.url) + '" target="_blank" rel="noopener">原文 ↗</a>'
      : '<span class="origin origin-none">无链接</span>';

    return '<article class="card kv-card" data-id="' + esc(it.id || '') + '">' +
      '<div class="card-top">' + ebadge + line + id + engine + origin + '</div>' +
      '<h2>' + esc(it.name || '') + '</h2>' +
      tags + gain + pitfall +
      '</article>';
  }

  // ---------- 列表：先三组筛选叠加，再搜索 ----------
  function renderList() {
    var all = items();
    var q = state.query.trim().toLowerCase();

    var shown = all.filter(function (it) {
      if (state.line !== '全部' && it.line !== state.line) return false;
      if (state.scenario !== '全部' && (it.scenario || []).indexOf(state.scenario) === -1) return false;
      if (state.evidence !== '全部' && it.evidence !== state.evidence) return false;
      if (!q) return true;
      var p = it.pitfalls || {};
      var pitText = PIT_LABELS.map(function (pair) { return p[pair[0]] || ''; }).join(' ');
      var hay = [it.id, it.name, it.engine, it.gain, it.evidence, it.line, it.status, it.flag,
        (it.scenario || []).join(' '), (it.layers || []).join(' '), pitText, it.url]
        .join(' ').toLowerCase();
      return hay.indexOf(q) !== -1;
    });

    if (!shown.length) {
      el.list.innerHTML = '';
      el.empty.hidden = false;
      el.empty.querySelector('p').textContent = all.length ? '没有匹配的方案。' : '还没有 KV 数据。';
      return;
    }
    el.empty.hidden = true;
    el.list.innerHTML = shown.map(cardHTML).join('');
  }

  // ---------- 图例：S1–S6 / L1–L5 / A–D 逐条解释（代号都从上面三张表渲染）----------
  function legendRows(map, order) {
    return order.map(function (k) {
      var info = map[k] || [k, ''];
      return '<div class="leg-row"><dt><span class="leg-code">' + esc(k) + '</span>' +
        esc(info[0]) + '</dt><dd>' + esc(info[1]) + '</dd></div>';
    }).join('');
  }

  function renderLegend() {
    var host = el.filters && el.filters.closest ? el.filters.closest('.toolbar') : null;
    if (!host) return;
    if (document.getElementById('kv-legend')) return;
    host.insertAdjacentHTML('afterend',
      '<details class="kv-legend" id="kv-legend">' +
        '<summary>图例：S1–S6 场景轴、L1–L5 缓存层级、A–D 证据等级分别是什么意思</summary>' +
        '<div class="leg-body">' +
          '<section class="leg-sec"><h3>缓存层级：这份 KV 放在哪一级</h3>' +
            '<dl>' + legendRows(LAYER_INFO, ['L1', 'L2', 'L3', 'L4', 'L5']) + '</dl></section>' +
          '<section class="leg-sec"><h3>场景轴：这条方案解决哪种部署形态</h3>' +
            '<dl>' + legendRows(SCENARIO_INFO, SCENARIOS) + '</dl></section>' +
          '<section class="leg-sec"><h3>证据等级：这条说法有多硬</h3>' +
            '<dl>' + legendRows(EVIDENCE_INFO, EVIDENCES) + '</dl>' +
            '<p class="leg-note">只有 A / B 才写「建议上」；C 是论文自报、D 是社区声称，都只作线索。</p></section>' +
          '<section class="leg-sec"><h3>编号</h3>' +
            '<p class="leg-note">N1–N39 是 NVIDIA 线，A1–A35 是昇腾线。卡片左上角的彩色字母是<b>证据等级</b>，跟编号不是一回事。</p></section>' +
        '</div>' +
      '</details>');
  }

  function boot() {
    initTheme();
    renderLegend();
    el.search.addEventListener('input', function () {
      state.query = el.search.value;
      renderList();
    });

    loadJSON('data/kv.json').then(function (doc) {
      if (!doc || !Array.isArray(doc.items)) throw new Error('KV 数据格式错误');
      state.doc = doc;
      var jump = document.getElementById('kv-jump-count');
      if (jump) jump.textContent = items().length;   // 首页跳转提示的条数跟着数据走
      renderOverview();
      renderFilters();
      renderList();
    }).catch(function (e) {
      el.overview.innerHTML = '<p class="kv-eyebrow">KV 卸载全景图</p><h2>数据加载失败</h2>' +
        '<p class="kv-sub">' + esc(e.message) + '</p>';
      el.empty.hidden = false;
      el.empty.querySelector('p').textContent = '加载失败：' + e.message;
    });
  }

  boot();
})();
