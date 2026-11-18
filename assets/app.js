/* AI 情报站 —— 纯静态前端，无构建步骤 */
(function () {
  'use strict';

  var state = {
    index: null,
    date: null,
    day: null,
    source: '全部',
    tune: false,
    query: '',
    focus: null,        // 当前聚焦查看的条目 id（TOP 点击 / #card-<id> 分享）
    pendingFocus: null  // boot 阶段从 hash 解析出、待加载完当天后消费的聚焦 id
  };

  var el = {
    filters: document.getElementById('filters'),
    search: document.getElementById('search'),
    list: document.getElementById('list'),
    empty: document.getElementById('empty'),
    topbox: document.getElementById('topbox'),
    overview: document.getElementById('overview'),
    dateLabel: document.getElementById('current-date'),
    summary: document.getElementById('summary'),
    prev: document.getElementById('prev-day'),
    next: document.getElementById('next-day'),
    theme: document.getElementById('theme-toggle')
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtDate(d) {
    var p = String(d).split('-');
    return p.length === 3 ? (p[0] + ' 年 ' + Number(p[1]) + ' 月 ' + Number(p[2]) + ' 日') : d;
  }

  function verdictClass(v) {
    if (!v) return 'maybe';
    if (/^(是|值得|有用|有)/.test(v)) return 'yes';
    if (/^(否|不值得|没用|不)/.test(v)) return 'no';
    return 'maybe';
  }

  function initTheme() {
    var saved = localStorage.getItem('theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    el.theme.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', cur);
      localStorage.setItem('theme', cur);
    });
    window.__themeClickBound = true;   // 首页还加载 kv.js，用它避免重复绑定
  }

  function loadJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' → HTTP ' + r.status);
      return r.json();
    });
  }

  function sourcesOf(items) {
    var m = {};
    items.forEach(function (it) {
      var k = it.source || '其他';
      m[k] = (m[k] || 0) + 1;
    });
    return m;
  }

  // 「调优」是 tag 维度，与 source 正交：字面口径，含该 tag 即计入（含 source=创新）
  function hasTune(it) {
    return (it.tags || []).indexOf('业界调优') !== -1;
  }

  // ---- 去重 / 评分 / TOP：纯前端确定性计算，不改数据契约 ----

  // URL 归一化：小写、去协议、去 query/hash、去尾斜杠
  function normUrl(u) {
    return String(u || '').toLowerCase()
      .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
      .split('?')[0].split('#')[0]
      .replace(/\/+$/, '');
  }

  // 出刊日 = 当前展示的期号日期；返回 time 与出刊日相差的天数（取绝对值）
  function dayDiff(a, b) {
    var pa = String(a || '').split('-'), pb = String(b || '').split('-');
    if (pa.length !== 3 || pb.length !== 3) return 999;
    var da = Date.UTC(+pa[0], +pa[1] - 1, +pa[2]);
    var db = Date.UTC(+pb[0], +pb[1] - 1, +pb[2]);
    if (isNaN(da) || isNaN(db)) return 999;
    return Math.abs(da - db) / 86400000;
  }

  // 证据强度 30：按关键词表取最高命中，只计一次
  function evidenceScore(cred) {
    var s = String(cred || '');
    var rules = [
      ['官方实测', 27], ['官方', 30], ['论文', 24],
      ['社区实测', 18], ['实测', 18], ['中', 10]
    ];
    var best = 8; // 其他
    rules.forEach(function (r) {
      if (s.indexOf(r[0]) !== -1 && r[1] > best) best = r[1];
    });
    return best;
  }

  // 可复用性 25：points 拼接后数「量词」（数字/百分号/毫秒等），n≥4 记满，1 记 6，0 记 0，线性
  function reuseScore(points) {
    var s = (points || []).join(' ');
    var m = s.match(/\d+(?:\.\d+)?|[％%]|毫秒|微秒|纳秒/gi);
    var n = m ? m.length : 0;
    var v = n >= 4 ? 25 : n * 6;
    // 命令/参数样式额外 +5，上限 25
    if (/--|=|max_num_|TP|batch/i.test(s)) v = Math.min(25, v + 5);
    return v;
  }

  var IMPACT_WORDS = ['vLLM', 'vllm-ascend', 'CANN', 'HCCL', 'KV cache', 'MoE', '量化',
    '并行', '投机解码', '算子', '推理', '训练', '通信', 'tiling', 'A3', 'A2', '950', 'H800'];
  var VERDICT_SCORE = { '值得': 10, '观察': 6, '不值得': 2 };

  // 0–100 综合分，各分项上限 30/25/20/15/10
  function scoreOf(it) {
    var impactText = [it.title, (it.points || []).join(' '), (it.tags || []).join(' ')].join(' ').toLowerCase();
    var hits = 0;
    IMPACT_WORDS.forEach(function (w) {
      if (impactText.indexOf(w.toLowerCase()) !== -1) hits++;
    });
    var impact = Math.min(20, hits * 4);
    var dd = dayDiff(it.time, state.date);
    var fresh = dd === 0 ? 15 : dd === 1 ? 10 : dd === 2 ? 6 : 2;
    return evidenceScore(it.credibility) + reuseScore(it.points) + impact + fresh +
      (VERDICT_SCORE[it.verdict] || 0);
  }

  // 同分：time 倒序 → title 字典序，稳定
  function byScore(a, b) {
    var d = scoreOf(b) - scoreOf(a);
    if (d) return d;
    var t = String(b.time || '').localeCompare(String(a.time || ''));
    if (t) return t;
    return String(a.title || '').localeCompare(String(b.title || ''));
  }

  function cardDomId(it) {
    return 'card-' + String(it.id || normUrl(it.url) || Math.random().toString(36).slice(2));
  }

  // 折叠映射：创新条与同 URL 的非创新条重合时，创新条不单独成卡，挂到原卡底部
  function foldMapOf(items) {
    var byUrl = {};
    items.forEach(function (it) {
      if (it.source === '创新') return;
      var k = normUrl(it.url);
      if (k && !byUrl[k]) byUrl[k] = it;
    });
    var folded = {}, hidden = {};
    items.forEach(function (it) {
      if (it.source !== '创新') return;
      var orig = byUrl[normUrl(it.url)];
      if (!orig) return;
      var key = String(orig.id || normUrl(orig.url));
      (folded[key] = folded[key] || []).push(it);
      if (it.id) hidden[String(it.id)] = true;
    });
    return { folded: folded, hidden: hidden };
  }

  // ---- 聚焦查看（TOP 点击 / #card-<id> 分享）----

  // 按 id 在当前日期条目里找条目
  function focusItemById(id) {
    if (id == null) return null;
    var items = (state.day && state.day.items) || [];
    for (var i = 0; i < items.length; i++) {
      if (String(items[i].id) === String(id)) return items[i];
    }
    return null;
  }

  function focusItem() {
    return state.focus ? focusItemById(state.focus) : null;
  }

  // 该 id 在可见卡（去重后）按评分排序里的名次（1-based），找不到返回 0
  function focusRankOf(id, visible) {
    var sorted = visible.slice().sort(byScore);
    for (var i = 0; i < sorted.length; i++) {
      if (String(sorted[i].id) === String(id)) return i + 1;
    }
    return 0;
  }

  function setHashFocus(id) { history.replaceState(null, '', '#card-' + id); }
  function setHashDate() { history.replaceState(null, '', '#' + state.date); }

  // CSS 里 html{scroll-behavior:smooth} 会让程序化 scrollTo 变成动画，导致聚焦后
  // 目标卡首行短时间不在视口内；这里强制瞬时回到页首。
  function scrollTopInstant() {
    try { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }
    catch (e) { window.scrollTo(0, 0); }
  }

  // 进入聚焦：只显示目标卡，清空其它筛选态，写可分享 hash，回到页首
  function enterFocus(id) {
    var it = focusItemById(id);
    if (!it) return false;
    state.focus = String(id);
    state.source = '全部';
    state.tune = false;
    state.query = '';
    if (el.search) el.search.value = '';
    document.body.classList.add('focusing');
    setHashFocus(state.focus);
    renderFilters();
    renderList();
    scrollTopInstant();
    return true;
  }

  // 退出聚焦：恢复全部卡片与默认筛选，hash 回到日期
  function exitFocus() {
    if (!state.focus) return;
    state.focus = null;
    document.body.classList.remove('focusing');
    setHashDate();
    renderFilters();
    renderDay();
    scrollTopInstant();
  }

  // hash / 前进后退变化时同步聚焦态
  function syncFromHash() {
    var h = location.hash.replace('#', '');
    if (h.indexOf('card-') === 0) {
      var id = h.slice(5);
      if (!state.focus || state.focus !== id) {
        if (focusItemById(id)) enterFocus(id);
      }
    } else if (state.focus) {
      exitFocus();
    }
  }

  function renderFilters() {
    var items = (state.day && state.day.items) || [];
    var counts = sourcesOf(items);
    var names = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });

    var html = '<button class="chip' + (state.source === '全部' ? ' active' : '') +
      '" data-src="全部" role="tab">全部<span class="count">' + items.length + '</span></button>';

    names.forEach(function (n) {
      html += '<button class="chip' + (state.source === n ? ' active' : '') +
        '" data-src="' + esc(n) + '" role="tab">' + esc(n) +
        '<span class="count">' + counts[n] + '</span></button>';
    });

    // tag 维度的「调优」chip：与 source chip 同套样式同一行，数字为含该 tag 的条数
    var tuneCount = items.filter(hasTune).length;
    html += '<button class="chip' + (state.tune ? ' active' : '') +
      '" data-tune="1" role="tab">调优<span class="count">' + tuneCount + '</span></button>';

    el.filters.innerHTML = html;
    el.filters.querySelectorAll('.chip[data-src]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.source = b.getAttribute('data-src');
        state.tune = false; // 点任一 source chip 清掉调优筛选，避免两个维度叠加
        if (state.focus) { state.focus = null; setHashDate(); }
        document.body.classList.remove('focusing');
        renderFilters();
        renderList();
      });
    });
    var tuneBtn = el.filters.querySelector('.chip[data-tune]');
    if (tuneBtn) {
      tuneBtn.addEventListener('click', function () {
        state.tune = !state.tune;
        if (state.tune) state.source = '全部'; // 调优只与「全部」共存，不与具体来源叠加
        if (state.focus) { state.focus = null; setHashDate(); }
        document.body.classList.remove('focusing');
        renderFilters();
        renderList();
      });
    }
  }

  // 可信度按文本分级上色：高/官方→绿，低/传闻/未证实/未查到→红，其余→蓝
  function credClass(c) {
    var s = String(c || '');
    if (/低|传闻|未证实|未查到/.test(s)) return 'low';
    if (/高|官方/.test(s)) return 'high';
    return 'mid';
  }

  // 今日概览：基于当日全部条目（不随筛选/搜索重算），让人一进来就知道今天有什么
  function renderOverview(items) {
    if (!items || !items.length) { el.overview.hidden = true; el.overview.innerHTML = ''; return; }
    el.overview.hidden = false;
    var counts = sourcesOf(items);
    var order = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    var stats = order.map(function (n) {
      return '<span class="ov-stat" data-src="' + esc(n) + '"><span class="dot"></span>' +
        '<em>' + esc(n) + '</em> <b>' + counts[n] + '</b> 条</span>';
    }).join('');
    var picks = items.filter(function (it) { return verdictClass(it.verdict) === 'yes'; }).slice(0, 2);
    var picksHtml = picks.length ? picks.map(function (it, i) {
      return '<div class="ov-pick"><span class="rank">' + (i + 1) + '</span>' +
        '<span class="badge ' + esc(it.source || '其他') + '">' + esc(it.source || '其他') + '</span>' +
        '<a href="' + esc(it.url || '#') + '" target="_blank" rel="noopener">' + esc(it.title) + '</a></div>';
    }).join('') : '<div class="ov-pick"><span class="rank">—</span>本期暂无「值得」条目</div>';

    el.overview.innerHTML =
      '<p class="ov-eyebrow">今日概览 · DAILY BRIEF</p>' +
      '<div class="ov-top">' +
        '<h2 class="ov-date">' + esc(fmtDate(state.date)) + '</h2>' +
        '<div class="ov-total"><b>' + items.length + '</b><span>条情报 · 已分类整理</span></div>' +
      '</div>' +
      '<div class="ov-stats">' + stats + '</div>' +
      '<div class="ov-picks"><h3>今日最值得看</h3>' + picksHtml + '</div>';
  }

  // 单张卡片：首条要点常显，其余收进 <details>；verdict/可信度做成有色徽标；链接收成「原文 ↗」
  // rank: 组内 TOP 名次（1/2/3），0 表示不显示；folded: 折叠到本卡的创新判断条目数组
  // focused: 是否为聚焦查看的那张卡（命中则加 .focused 描边）
  function cardHTML(it, i, rank, folded, focused) {
    var src = it.source || '其他';
    var pts = it.points || [];
    var lead = pts.length ? '<div class="point-lead"><span class="pdot">①</span><span>' + esc(pts[0]) + '</span></div>' : '';
    var more = pts.length > 1
      ? '<details class="points-more"><summary>展开其余 ' + (pts.length - 1) + ' 条要点</summary>' +
          '<ul class="points">' + pts.slice(1).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') +
        '</ul></details>'
      : '';
    var tags = (it.tags || []).map(function (t) {
      return '<span class="tag' + (t === '业界调优' ? ' tag-tune' : '') + '">' + esc(t) + '</span>';
    }).join('');
    var time = it.time ? '<span>🕒 ' + esc(it.time) + '</span>' : '';
    var verdict = it.verdict
      ? '<span class="vbadge vbadge-' + verdictClass(it.verdict) + '">' + esc(it.verdict) + '</span>' : '';
    var cred = it.credibility
      ? '<span class="cbadge cbadge-' + credClass(it.credibility) + '">可信度 ' + esc(it.credibility) + '</span>' : '';
    var origin = '<a class="origin" href="' + esc(it.url || '#') + '" target="_blank" rel="noopener">原文 ↗</a>';
    var rankHtml = rank > 0
      ? '<span class="rankbadge' + (rank === 1 ? ' rank-1' : '') + '">#' + rank + '</span>' : '';

    // 创新判断带：左侧 3px accent 竖线 + verdict 徽章 + points[0]，默认折叠成一行
    var foldHtml = '';
    if (folded && folded.length) {
      foldHtml = folded.map(function (f) {
        var v = f.verdict
          ? '<span class="vbadge vbadge-' + verdictClass(f.verdict) + '">' + esc(f.verdict) + '</span>' : '';
        var p0 = (f.points && f.points.length) ? esc(f.points[0]) : '';
        return '<details class="innov-band">' +
          '<summary>创新判断 ' + v + '<span class="innov-peek">' + p0 + '</span></summary>' +
          '<div class="innov-body">' + p0 + '</div>' +
        '</details>';
      }).join('');
    }

    return '<article class="card' + (focused ? ' focused' : '') + '" id="' + esc(cardDomId(it)) + '" data-id="' + esc(it.id || '') + '" style="--i:' + i + '">' +
      '<div class="card-top">' +
        '<span class="badge ' + esc(src) + '">' + esc(src) + '</span>' +
        time + origin +
      '</div>' +
      '<h2>' + rankHtml + '<a href="' + esc(it.url || '#') + '" target="_blank" rel="noopener">' + esc(it.title) + '</a></h2>' +
      (lead || more ? '<div class="points-box">' + lead + more + '</div>' : '') +
      '<div class="card-foot">' + verdict + cred +
        (tags ? '<span class="tags">' + tags + '</span>' : '') +
      '</div>' +
      foldHtml +
    '</article>';
  }

  // 全局「今日 TOP 10」：只从可见卡（已去重、已排除折叠隐藏项）取，随 chip/搜索联动。
  // 点击不再用锚点瞬移到页尾，而是进入聚焦查看；href 保留 #card-<id> 供新标签/分享直达。
  function renderTop(visible) {
    if (!visible.length) { el.topbox.hidden = true; el.topbox.innerHTML = ''; return; }
    el.topbox.hidden = false;
    var top = visible.slice().sort(byScore).slice(0, 10);
    var html = '<p class="top-eyebrow">今日 TOP 10 · 按评分排序</p><ol class="top-list">' +
      top.map(function (it, i) {
        var sc = scoreOf(it);
        var src = it.source || '其他';
        return '<li class="top-item">' +
          '<a href="#' + esc(cardDomId(it)) + '" data-focus="' + esc(it.id || '') + '">' +
            '<span class="top-rank">' + (i + 1) + '</span>' +
            '<span class="top-title">' + esc(it.title) + '</span>' +
            '<span class="badge ' + esc(src) + '">' + esc(src) + '</span>' +
            '<span class="top-score">' + sc + '</span>' +
          '</a>' +
        '</li>';
      }).join('') + '</ol>';
    el.topbox.innerHTML = html;
    el.topbox.querySelectorAll('.top-item a[data-focus]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault(); // 阻止原生锚点瞬移
        enterFocus(a.getAttribute('data-focus'));
      });
    });
  }

  function renderList() {
    var items = (state.day && state.day.items) || [];

    // 聚焦查看：只渲染目标卡 + 顶部聚焦条，回到页首；概览/TOP/工具条/日期条由
    // body.focusing 的 CSS 统一隐藏，保证目标卡首行落在第一屏，不会跳到页尾。
    var fit = focusItem();
    if (fit) {
      var foldAll = foldMapOf(items);
      var allVisible = items.filter(function (it) {
        return !(it.id && foldAll.hidden[String(it.id)]);
      });
      var rank = focusRankOf(state.focus, allVisible);
      var title = String(fit.title || '');
      var bar = '<div class="focus-bar">' +
        '<span class="focus-label">正在查看' + (rank ? ' TOP #' + rank : '') + ' · ' +
          esc(title.slice(0, 30)) + (title.length > 30 ? '…' : '') + '</span>' +
        '<button type="button" class="focus-back" id="focus-back">返回全部</button>' +
      '</div>';
      var key = String(fit.id || normUrl(fit.url));
      el.list.innerHTML = bar + cardHTML(fit, 0, 0, foldAll.folded[key] || null, true);
      el.empty.hidden = true;
      el.topbox.hidden = true;
      el.summary.textContent = '正在查看 1 条 · 共 ' + items.length + ' 条';
      var back = document.getElementById('focus-back');
      if (back) back.addEventListener('click', exitFocus);
      return;
    }

    var q = state.query.trim().toLowerCase();

    var shown = items.filter(function (it) {
      if (state.tune) {
        if (!hasTune(it)) return false;
      } else if (state.source !== '全部' && (it.source || '其他') !== state.source) {
        return false;
      }
      if (!q) return true;
      var hay = [it.title, (it.points || []).join(' '), (it.tags || []).join(' '), it.verdict || '']
        .join(' ').toLowerCase();
      return hay.indexOf(q) !== -1;
    });

    // 折叠映射：创新条若与非创新条同 URL，则不单独成卡，挂到原卡底部
    var fold = foldMapOf(items);
    var visible = shown.filter(function (it) {
      return !(it.id && fold.hidden[String(it.id)]);
    });

    el.summary.textContent = '共 ' + items.length + ' 条' +
      (visible.length !== items.length ? '，显示 ' + visible.length + ' 条' : '');

    renderTop(visible);

    if (!visible.length) {
      el.list.innerHTML = '';
      el.empty.hidden = false;
      el.empty.querySelector('p').textContent = items.length ? '没有匹配的内容。' : '这一天还没有内容。';
      return;
    }
    el.empty.hidden = true;

    // 按来源分组：组顺序固定为「当日全部条目的来源计数降序」（与 chip 一致）。
    // 组内按 scoreOf 倒序（同分 time 倒序、再 title 字典序），前 3 名加 #1/#2/#3 徽章。
    // 折叠的创新判断带渲染到对应原卡底部，不单独占位。排序只作用于 filter 出的新数组，不改 state.day.items。
    var counts = sourcesOf(items);
    var order = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    var html = order.map(function (src) {
      var gi = visible.filter(function (it) { return (it.source || '其他') === src; });
      if (!gi.length) return '';
      gi.sort(byScore);
      var cards = gi.map(function (it, idx) {
        var key = String(it.id || normUrl(it.url));
        return cardHTML(it, idx, idx < 3 ? idx + 1 : 0, fold.folded[key] || null);
      }).join('');
      return '<section class="group">' +
        '<div class="group-head">' +
          '<span class="badge ' + esc(src) + '">' + esc(src) + '</span>' +
          '<span class="group-count">' + gi.length + ' 条</span>' +
          '<span class="group-line"></span>' +
        '</div>' +
        '<div class="group-cards">' + cards + '</div>' +
      '</section>';
    }).join('');
    el.list.innerHTML = html;
  }

  function renderDay() {
    el.dateLabel.textContent = fmtDate(state.date);
    var idx = state.index.dates.findIndex(function (d) { return d.date === state.date; });
    el.prev.disabled = idx >= state.index.dates.length - 1;
    el.next.disabled = idx <= 0;
    renderOverview((state.day && state.day.items) || []);
    renderFilters();
    renderList();
  }

  function goto(date) {
    if (date === state.date) return;
    state.date = date;
    state.focus = null; // 切期号退出聚焦
    el.list.innerHTML = '<p class="empty">加载中…</p>';
    loadJSON('data/' + date + '.json').then(function (day) {
      state.day = day;
      // chip 由当日数据动态生成：若上一天选中的来源在这一天不存在，沿用会让列表
      // 为空且没有任何 chip 高亮，用户无法判断为何空白。此时回退到「全部」；来源仍在则保持筛选。
      if (state.source !== '全部' && !sourcesOf(day.items || [])[state.source]) {
        state.source = '全部';
      }
      // boot 阶段从 #card-<id> 解析出的聚焦：当天确有该条才进入聚焦
      if (state.pendingFocus) {
        if ((day.items || []).some(function (it) { return String(it.id) === String(state.pendingFocus); })) {
          state.focus = state.pendingFocus;
          state.source = '全部';
          state.tune = false;
        }
        state.pendingFocus = null;
      }
      document.body.classList.toggle('focusing', !!state.focus);
      renderDay();
      history.replaceState(null, '', state.focus ? '#card-' + state.focus : '#' + date);
      if (state.focus) scrollTopInstant();
    }).catch(function (e) {
      el.list.innerHTML = '';
      el.empty.hidden = false;
      el.empty.querySelector('p').textContent = '加载失败：' + e.message;
    });
  }

  function boot() {
    initTheme();

    el.search.addEventListener('input', function () {
      state.query = el.search.value;
      if (state.focus) { state.focus = null; setHashDate(); document.body.classList.remove('focusing'); }
      renderList();
    });

    el.prev.addEventListener('click', function () {
      var i = state.index.dates.findIndex(function (d) { return d.date === state.date; });
      if (i < state.index.dates.length - 1) goto(state.index.dates[i + 1].date);
    });
    el.next.addEventListener('click', function () {
      var i = state.index.dates.findIndex(function (d) { return d.date === state.date; });
      if (i > 0) goto(state.index.dates[i - 1].date);
    });

    window.addEventListener('hashchange', syncFromHash);
    window.addEventListener('popstate', syncFromHash);

    loadJSON('data/index.json').then(function (index) {
      if (!index || !index.dates || !index.dates.length) throw new Error('还没有任何一期内容');
      state.index = index;
      var hash = location.hash.replace('#', '');
      var focusFromHash = null, start = null;
      if (hash.indexOf('card-') === 0) {
        focusFromHash = hash.slice(5);
        // id 形如 20261118-009 → 期号 2026-11-18；据此直接加载对应那天
        var m = focusFromHash.match(/^(\d{4})(\d{2})(\d{2})/);
        if (m) {
          var d = m[1] + '-' + m[2] + '-' + m[3];
          if (index.dates.some(function (x) { return x.date === d; })) start = d;
        }
      }
      if (!start) start = index.dates.some(function (d) { return d.date === hash; }) ? hash : index.dates[0].date;
      state.pendingFocus = focusFromHash;
      goto(start);
    }).catch(function (e) {
      el.dateLabel.textContent = '暂无内容';
      el.empty.hidden = false;
      el.empty.querySelector('p').textContent = e.message;
    });
  }

  boot();
})();
