/* 投机解码专题页：读 data/spec.json，渲染统计 / 三组筛选 / 搜索 / 卡片
   数据契约见 D:\001_DSH\001_DSH_project\spec_decode\ 与 SOP §9 */
(function () {
  'use strict';

  var el = {
    overview: document.getElementById('spec-overview'),
    filters: document.getElementById('spec-filters'),
    search: document.getElementById('spec-search'),
    list: document.getElementById('spec-list'),
    empty: document.getElementById('spec-empty'),
    theme: document.getElementById('theme-toggle')
  };

  var state = { doc: null, line: '全部', family: '全部', evidence: '全部', query: '' };

  var LINES = [['全部', '全部'], ['nvidia', 'NVIDIA'], ['ascend', '昇腾']];

  // 技术路线：代码 → [短名, 说明]
  var FAMILY_INFO = {
    draft: ['draft 模型', '独立小模型做草稿，大模型批量验证：最通用、也最吃额外显存'],
    eagle: ['EAGLE 系', '特征层复用 + 树形草稿（EAGLE-2/3），当前吞吐收益最高的一类'],
    medusa: ['Medusa', '在目标模型上加多个解码头并行猜，免去独立 draft 模型'],
    lookahead: ['Lookahead', 'Jacobi 迭代式并行解码，免 draft、免训练，加速比温和'],
    ngram: ['n-gram 检索', 'prompt 内检索重复片段做草稿，零模型开销，适合长上下文模板化输出'],
    tree: ['树形验证', '一次前向验证多条候选路径，配合上述任一草稿方式使用'],
    batch: ['批量/调度', '与连续批处理、P/D 分离、CUDA Graph 的配合与冲突处理'],
    other: ['其他', '尚未归入上述类别的实现']
  };

  var EVIDENCE_INFO = {
    A: ['官方/源码', '官方文档、源码或 release note 写明的能力，可照做'],
    B: ['一手实测', '有可复现的实测数字（含本机实测）'],
    C: ['论文自报', '论文作者自报数字，未经第三方复现'],
    D: ['社区声称', '社区口径，未复现，只作线索']
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function items() {
    return (state.doc && Array.isArray(state.doc.items)) ? state.doc.items : [];
  }

  function isHttp(u) { return typeof u === 'string' && /^https?:\/\//i.test(u); }

  function familyLabel(f) { return (FAMILY_INFO[f] || FAMILY_INFO.other)[0]; }
  function evidenceLabel(e) { return (EVIDENCE_INFO[e] || EVIDENCE_INFO.D)[0]; }

  function filtered() {
    var q = state.query.trim().toLowerCase();
    return items().filter(function (it) {
      if (state.line !== '全部' && it.line !== state.line) return false;
      if (state.family !== '全部' && (it.family || 'other') !== state.family) return false;
      if (state.evidence !== '全部' && it.evidence !== state.evidence) return false;
      if (!q) return true;
      var hay = [
        it.name, it.mechanism, it.engine, it.versions, it.config, it.gain, it.cost,
        it.status, familyLabel(it.family), it.line === 'ascend' ? '昇腾' : 'nvidia',
        it.pitfalls && it.pitfalls.hit, it.pitfalls && it.pitfalls.fix
      ].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    }).sort(function (a, b) {
      var la = a.line === 'nvidia' ? 0 : 1, lb = b.line === 'nvidia' ? 0 : 1;
      if (la !== lb) return la - lb;
      /* 同一硬件线内按引擎归组：vLLM 系 → SGLang → TensorRT-LLM → 论文/其他，
         避免按拼音字母序把论文排到实现前面。 */
      function rank(x) {
        var e = String(x.engine || '');
        if (/^vllm-ascend/i.test(e)) return 0;
        if (/^vLLM/i.test(e)) return 1;
        if (/^SGLang/i.test(e)) return 2;
        if (/^TensorRT-LLM/i.test(e)) return 3;
        return 4;
      }
      var ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      var ea = 'ABCD'.indexOf(a.evidence), eb = 'ABCD'.indexOf(b.evidence);
      if (ea !== eb) return ea - eb;
      return String(a.name).localeCompare(String(b.name), 'zh');
    });
  }

  function chip(cls, key, val, label, count, disabled, active, title) {
    var c = document.createElement('button');
    c.type = 'button';
    c.className = 'chip ' + cls + (disabled ? ' is-disabled' : '') + (active ? ' is-active' : '');
    c.setAttribute('data-key', key);
    c.setAttribute('data-val', val);
    if (disabled) { c.disabled = true; c.setAttribute('aria-disabled', 'true'); }
    if (title) c.title = title;
    c.innerHTML = esc(label) + ' <b>' + count + '</b>';
    c.addEventListener('click', function () {
      if (disabled) return;
      state[key] = val;
      renderFilters();
      renderList();
    });
    return c;
  }

  function row(label) {
    var r = document.createElement('div');
    r.className = 'filter-row';
    var l = document.createElement('span');
    l.className = 'filter-label';
    l.textContent = label;
    r.appendChild(l);
    return r;
  }

  function renderFilters() {
    var all = items();
    el.filters.innerHTML = '';

    var rLine = row('线');
    LINES.forEach(function (p) {
      var n = p[0] === '全部' ? all.length : all.filter(function (i) { return i.line === p[0]; }).length;
      rLine.appendChild(chip('chip-line', 'line', p[0], p[1], n, false, state.line === p[0]));
    });
    el.filters.appendChild(rLine);

    var rFam = row('路线');
    var famKeys = Object.keys(FAMILY_INFO).filter(function (k) {
      return all.some(function (i) { return (i.family || 'other') === k; });
    });
    rFam.appendChild(chip('chip-fam', 'family', '全部', '全部', all.length, false, state.family === '全部'));
    famKeys.forEach(function (k) {
      var n = all.filter(function (i) { return (i.family || 'other') === k; }).length;
      rFam.appendChild(chip('chip-fam', 'family', k, familyLabel(k), n, false, state.family === k, FAMILY_INFO[k][1]));
    });
    el.filters.appendChild(rFam);

    var rEv = row('证据');
    rEv.appendChild(chip('chip-ev', 'evidence', '全部', '全部', all.length, false, state.evidence === '全部'));
    ['A', 'B', 'C', 'D'].forEach(function (k) {
      var n = all.filter(function (i) { return i.evidence === k; }).length;
      rEv.appendChild(chip('chip-ev', 'evidence', k, k + ' ' + evidenceLabel(k), n, n === 0, state.evidence === k, EVIDENCE_INFO[k][1]));
    });
    el.filters.appendChild(rEv);
  }

  function renderOverview() {
    var all = items();
    var nv = all.filter(function (i) { return i.line === 'nvidia'; }).length;
    var as = all.filter(function (i) { return i.line === 'ascend'; }).length;
    var ev = { A: 0, B: 0, C: 0, D: 0 };
    all.forEach(function (i) { if (ev[i.evidence] != null) ev[i.evidence] += 1; });
    var gen = state.doc && state.doc.date ? state.doc.date : '—';

    el.overview.innerHTML = ''
      + '<p class="sp-eyebrow">常驻专题 · SPECULATIVE DECODING</p>'
      + '<h2>投机解码全景图</h2>'
      + '<p class="sp-sub">用小模型先猜几个 token、再用大模型一次验完，换的是吞吐和延迟；这里收的是两条线上可照抄的实现、参数与实测，数据更新 ' + esc(gen) + '。</p>'
      + '<div class="sp-totals">'
      + '  <span class="sp-total"><b>' + nv + '</b><span>NVIDIA 条</span></span>'
      + '  <span class="sp-total"><b>' + as + '</b><span>昇腾条</span></span>'
      + '  <span class="sp-total"><b>' + all.length + '</b><span>条合计</span></span>'
      + '</div>'
      + '<div class="sp-dist">'
      + '  <span class="sp-dist-label">证据分级</span>'
      + '  <span class="ev-chip ev-A">A 官方/源码 <b>' + ev.A + '</b></span>'
      + '  <span class="ev-chip ev-B">B 一手实测 <b>' + ev.B + '</b></span>'
      + '  <span class="ev-chip ev-C">C 论文自报 <b>' + ev.C + '</b></span>'
      + '  <span class="ev-chip ev-D">D 社区声称 <b>' + ev.D + '</b></span>'
      + '</div>'
      + '<p class="sp-sub" style="margin-top:8px">只有证据 A/B 才写「建议上」，C/D 只作线索；NVIDIA 与昇腾分别取证，结论不互相套用。</p>';

    if (!all.length) return;
    var legend = document.createElement('details');
    legend.className = 'sp-legend';
    legend.innerHTML = '<summary>图例：证据分级 A–D、八条技术路线、字段都指什么</summary>'
      + '<div class="leg-body">'
      + '<div class="leg-sec"><h3>证据分级（卡片左上角那个字母）</h3>'
      + Object.keys(EVIDENCE_INFO).map(function (k) {
          return '<div class="leg-row"><span class="leg-code">' + k + ' ' + esc(EVIDENCE_INFO[k][0]) + '</span><span class="leg-note">' + esc(EVIDENCE_INFO[k][1]) + '</span></div>';
        }).join('')
      + '</div>'
      + '<div class="leg-sec"><h3>技术路线（筛选「路线」用的）</h3>'
      + Object.keys(FAMILY_INFO).map(function (k) {
          return '<div class="leg-row"><span class="leg-code">' + esc(FAMILY_INFO[k][0]) + '</span><span class="leg-note">' + esc(FAMILY_INFO[k][1]) + '</span></div>';
        }).join('')
      + '</div>'
      + '<div class="leg-sec"><h3>卡片字段</h3>'
      + '<div class="leg-row"><span class="leg-code">怎么配</span><span class="leg-note">可照抄的启动参数或源码位置，直接按这个改</span></div>'
      + '<div class="leg-row"><span class="leg-code">收益</span><span class="leg-note">接受率、tokens/s、TTFT/TPOT、显存；标「官方自报」「一手实测」区分来源</span></div>'
      + '<div class="leg-row"><span class="leg-code">代价</span><span class="leg-note">额外显存、额外算力、精度风险、维护成本</span></div>'
      + '<div class="leg-row"><span class="leg-code">坑</span><span class="leg-note">踩到的报错原文与修法，点开看</span></div>'
      + '</div>'
      + '</div>';
    el.overview.appendChild(legend);
  }

  function cardHTML(it) {
    var fam = it.family || 'other';
    var ev = it.evidence || 'D';
    var lineCls = it.line === 'ascend' ? 'line-ascend' : 'line-nvidia';
    var lineLabel = it.line === 'ascend' ? '昇腾' : 'NVIDIA';
    var pit = it.pitfalls || {};
    var hasPit = (pit.hit && pit.hit !== '未查到') || (pit.fix && pit.fix !== '未查到');

    return ''
      + '<article class="card spec-card">'
      + '<div class="sc-top">'
      + '  <span class="ebadge ev-' + esc(ev) + '" title="证据 ' + esc(ev) + '（' + esc(evidenceLabel(ev)) + '）：' + esc((EVIDENCE_INFO[ev] || EVIDENCE_INFO.D)[1]) + '">' + esc(ev) + '</span>'
      + '  <span class="badge-line ' + lineCls + '">' + lineLabel + '</span>'
      + '  <span class="badge-fam" title="' + esc(FAMILY_INFO[fam][1]) + '">' + esc(FAMILY_INFO[fam][0]) + '</span>'
      + '  <span class="sc-engine">' + esc(it.engine || '未查到') + (it.versions && it.versions !== '未查到' ? ' · ' + esc(it.versions) : '') + '</span>'
      + (it.status ? '  <span class="sc-status">' + esc(it.status) + '</span>' : '')
      + '</div>'
      + '<h3 class="sc-name">' + esc(it.name) + '</h3>'
      + '<p class="sc-mech">' + esc(it.mechanism) + '</p>'
      + '<div class="sc-config"><span class="sc-k">怎么配</span><code>' + esc(it.config) + '</code></div>'
      + '<div class="sc-gain"><span class="gain-label">收益</span>' + esc(it.gain) + '</div>'
      + '<div class="sc-cost"><span class="sc-k">代价</span>' + esc(it.cost) + '</div>'
      + (hasPit
          ? '<details class="pit"><summary>坑</summary><div class="pit-body">'
            + '<div class="pit-row"><span class="pit-k">遇到</span><span>' + esc(pit.hit) + '</span></div>'
            + '<div class="pit-row"><span class="pit-k">修法</span><span>' + esc(pit.fix) + '</span></div>'
            + '</div></details>'
          : '')
      + (isHttp(it.url)
          ? '<a class="sc-link" href="' + esc(it.url) + '" target="_blank" rel="noopener">原文 →</a>'
          : '<span class="sc-nolink">无直链</span>')
      + '</article>';
  }

  function renderList() {
    var rows = filtered();
    el.list.innerHTML = rows.map(cardHTML).join('');
    el.empty.hidden = rows.length > 0;
    if (!rows.length) {
      var all = items();
      el.empty.textContent = all.length
        ? '没有匹配的方案，换个关键词或点「全部」。'
        : '数据还没到位：今天的投机解码条目尚未生成，稍后刷新。';
    }
  }

  function loadJSON(url) {
    var sep = url.indexOf('?') >= 0 ? '&' : '?';
    return fetch(url + sep + 'v=' + Date.now(), { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function initTheme() {
    var saved = localStorage.getItem('theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    if (window.__themeClickBound || !el.theme) return;
    window.__themeClickBound = true;
    el.theme.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', cur);
      localStorage.setItem('theme', cur);
    });
  }

  function boot() {
    initTheme();
    el.search.addEventListener('input', function () {
      state.query = el.search.value;
      renderList();
    });
    loadJSON('data/spec.json').then(function (doc) {
      state.doc = doc;
      renderOverview();
      renderFilters();
      renderList();
    }).catch(function (err) {
      state.doc = { items: [] };
      renderOverview();
      renderFilters();
      renderList();
      el.empty.hidden = false;
      el.empty.textContent = '数据加载失败（' + err.message + '）：请检查 data/spec.json 是否存在，刷新重试。';
    });
  }

  boot();
})();
