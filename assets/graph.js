/* 推理技术知识图谱 v1 · P0 骨架
   纯静态 vanilla JS：零 CDN / 零构建 / 零框架。
   四视图共用一份数据；确定性布局 + 几何去重叠；viewBox 恒等于舞台像素（v0 教训）。 */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  /* ---------- 中文元数据：代号一律配中文名，不许裸奔 ---------- */
  var TYPE_META = {
    engine:    { name: '推理引擎', ico: '⚙', color: 'var(--accent)' },
    tech:      { name: '技术机制', ico: '◆', color: 'var(--green)' },
    impl:      { name: '引擎实现', ico: '⌘', color: 'var(--violet)' },
    system:    { name: '依赖系统', ico: '▣', color: 'var(--amber)' },
    hardware:  { name: '硬件代际', ico: '▤', color: 'var(--red)' },
    community: { name: '社区组织', ico: '♟', color: '#e07ab5' },
    case:      { name: '实战案例', ico: '★', color: '#c08a2e' },
    metric:    { name: '关键指标', ico: '◈', color: '#48c9d6' }
  };
  var EDGE_META = {
    implements:     { name: '引擎实现该技术' },
    runs_on:        { name: '实现在 / 承载于' },
    implemented_by: { name: '技术的具体实现' },
    depends_on:     { name: '依赖' },
    relieves:       { name: '缓解瓶颈' },
    compresses:     { name: '压缩' },
    tradeoff:       { name: '权衡 / 代价' },
    alternative:    { name: '同位置替代' },
    prerequisite:   { name: '前置条件' },
    asc_equivalent: { name: '双栈对照（同一问题，另一种做法；不是依赖）' },
    measured_on:    { name: '实测于' },
    maintained_by:  { name: '维护方' },
    supersedes:     { name: '演进替代' }
  };
  var MATURITY = { research: '研究中', experimental: '实验性', emerging: '新兴', mainstream: '主流', legacy: '逐步淘汰' };
  var EVIDENCE = { A: '官方源码/文档', B: '一手实测', C: '论文自报', D: '社区声称' };
  var STACKNAME = { nvidia: 'NVIDIA', ascend: '昇腾', cross: '跨平台', amd: 'AMD', cpu: 'CPU' };
  // 真数据里域 / 引擎是从数据并集动态生成的（adoptDocMeta），这里只给中文名的兜底表与初始占位
  var DOMAIN_CN = {
    'ascend-native': '昇腾原生', 'attention-kernel': '注意力内核', 'graph-compile': '图编译',
    'kv-cache': 'KV Cache', 'multimodal': '多模态', 'parallel': '并行',
    'prefix-cache': '前缀缓存', 'quantization': '量化', 'scheduling': '调度',
    'serving': '服务化', 'spec-decode': '投机解码', 'structured-output': '结构化输出'
  };
  var DOMAINS = Object.keys(DOMAIN_CN).map(function (k) { return [k, DOMAIN_CN[k]]; });
  var DOMAIN_NAME = {};
  DOMAINS.forEach(function (d) { DOMAIN_NAME[d[0]] = d[1]; });
  // 视图 key 与 data/graph.json 的 views 一致：engine / domain / stack / timeline
  var VIEWS = [
    ['browse', '目录'], ['map', '总览地图'], ['engine', '引擎视图'], ['domain', '技术域视图'], ['stack', '双栈对照'], ['timeline', '演进']
  ];
  var VIEW_NAME = {};
  VIEWS.forEach(function (v) { VIEW_NAME[v[0]] = v[1]; });
  var ENGINES = []; // 载入真数据后由 adoptDocMeta 用 12 个 engine/* 节点重建

  /* ---------- 数据加载：只读真数据 graph.json，失败则报错（由 boot 显示，不白屏） ----------
     真数据 schema 见 data/graph.json：nodes 字段比占位 fixture 多（module/symbols/config/
     defaults/version_seen/tech/engine/hardware_scope/papers/community 等）。这里保留全部字段，
     只补齐常用数组为空，避免面板/筛选到处判空。引擎与域列表从数据并集动态生成。 */
  function adoptDocMeta(doc) {
    var ens = doc.nodes.filter(function (n) { return n.type === 'engine'; })
      .sort(function (a, b) { return a.id.localeCompare(b.id); });
    ENGINES = ens.map(function (n) { return [n.id.replace(/^engine\//, ''), n.name, (n.stack || [])[0] || '']; });
    var dset = {};
    doc.nodes.forEach(function (n) { (n.domains || []).forEach(function (d) { dset[d] = 1; }); });
    DOMAINS = Object.keys(dset).sort().map(function (d) { return [d, DOMAIN_CN[d] || d]; });
    DOMAIN_NAME = {};
    DOMAINS.forEach(function (d) { DOMAIN_NAME[d[0]] = d[1]; });
  }
  var ARRAY_FIELDS = ['alias', 'stack', 'domains', 'engines', 'impls', 'symbols', 'config',
    'gain', 'cost', 'pitfalls', 'urls', 'papers', 'hardware_scope', 'tags', 'changelog'];
  function normalize(d) {
    if (!d || !d.schema_version || !Array.isArray(d.nodes)) return null;
    var nodes = d.nodes.map(function (n) {
      var o = {};
      Object.keys(n).forEach(function (k) { o[k] = n[k]; }); // 保留全部真数据字段
      ARRAY_FIELDS.forEach(function (k) { if (!Array.isArray(o[k])) o[k] = []; });
      o.name = n.name || n.id;
      return o;
    });
    var doc = {
      schema_version: d.schema_version, generated_at: d.generated_at || '',
      title: d.title || '推理技术知识图谱', subtitle: d.subtitle || '',
      counts: d.counts || { nodes: nodes.length, edges: (d.edges || []).length },
      views: d.views || [], nodes: nodes,
      edges: (d.edges || []).map(function (e) { return { from: e.from, to: e.to, type: e.type, note: e.note || '' }; }),
      _fixture: false
    };
    adoptDocMeta(doc);
    return doc;
  }
  function loadData() {
    return fetch('data/graph.json?v=' + Date.now(), { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('graph.json → HTTP ' + r.status); return r.json(); })
      .then(function (d) { var v = normalize(d); if (!v) throw new Error('graph.json 结构不符合 v1'); return v; });
  }

  /* ---------- 状态 ---------- */
  var state = {
    doc: null, view: 'browse', query: '',
    browseStack: null, browseDomain: null, b3idx: null,
    filters: { stack: '全部', engine: '全部', domain: '全部', maturity: '全部', evidence: '全部' },
    focusSet: null, selected: null, positions: {}, visible: {}, cardOpen: {},
    w: 1000, h: 620, tx: 0, ty: 0, k: 1, matrixCell: null, suppressHash: false
  };
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function typeMeta(t) { return TYPE_META[t] || { name: t, ico: '•', color: 'var(--ink-3)' }; }
  function nodeMap() { var m = {}; state.doc.nodes.forEach(function (n) { m[n.id] = n; }); return m; }
  function shortName(n, limit) { var L = limit || 9; return n.name.length > L ? n.name.slice(0, L) + '…' : n.name; }
  // 卡片内标签：impl/tech 的名字常是「模块 | 职责」结构，截前 9 字会得到一整列
  // 一模一样的「LLM Manag…」，等于没标签。取最后一个分隔符之后的差异部分。
  function cardName(n) {
    var s = String(n.name || '');
    var parts = s.split(/\s*[|｜·•]\s*/);
    if (parts.length > 1) { var tail = parts[parts.length - 1]; if (tail.length >= 3) s = tail; }
    return s.length > 11 ? s.slice(0, 11) + '…' : s;
  }

  /* ---------- 视口：viewBox 恒等于舞台像素（v0 教训二） ---------- */
  function fit() {
    var st = $('gstage'), svg = $('gsvg');
    var r = st.getBoundingClientRect();
    state.w = Math.max(320, Math.round(r.width || 1000));
    var baseH = Math.max(300, Math.round(r.height || 620));
    var h = baseH;
    var wantsTall = (state.view === 'engine' || state.view === 'domain') && state.needH;
    // 引擎卡片看板 / 技术域球阵：画布高度由 layout 算出的内容高度决定，页面纵向滚动
    if (wantsTall) {
      h = Math.max(baseH, state.needH);
    } else if (state.w < 700 && state.doc && state.doc.nodes.length) {
      // 窄屏（<700px）：画布改成「纵向长卷」——节点摊开在更高的画布里，页面纵向滚动去看，
      // 而不是把 170 个节点压进 360px 高的舞台（v1 窄屏 domain/timeline 重叠的根因）。
      // 标签仍是屏幕像素级大小，viewBox 与画布像素保持 1:1，不靠缩放蒙混。
      var per = Math.max(4, Math.floor((state.w - 92) / 28));
      var rows = Math.ceil(state.doc.nodes.length / per) + 6;
      h = Math.max(baseH, rows * 40 + 70);
      svg.style.height = h + 'px';
    } else if (svg.style.height) {
      svg.style.height = '';
    }
    h = Math.round(h);
    // 只在自己算的 h 与当前高度不同时才写 style.height：写高度会改变 #gstage 尺寸，
    // 触发 ResizeObserver → schedule → 又 fit，形成无限重排（用户看到的「一直闪」）。
    if ((wantsTall || state.w < 700) && svg.style.height !== h + 'px') {
      svg.style.height = h + 'px';
    }
    state.h = h;
    svg.setAttribute('viewBox', '0 0 ' + state.w + ' ' + h);
  }
  function radius(n) {
    if (state.view === 'domain') return state.w < 640 ? 4 : 4.5;
    if (n.type === 'engine') return state.w < 640 ? 12 : 15;
    if (n.type === 'tech') return state.w < 640 ? 8 : 9.5;
    if (n.type === 'case') return state.w < 640 ? 9 : 10.5;
    return state.w < 640 ? 7 : 8.5;
  }

  /* ---------- 四视图布局：共用一份数据，切换只重排 ---------- */
  function nodeStack(n) { return (n.stack || [])[0] || 'cross'; }
  /* impl 没有 domains / engines[]，靠 implements 边挂到 tech，再用 tech 的字段补齐 */
  function nodeEngines(n) {
    if (n.engines && n.engines.length) return n.engines;
    if (n.engine) return [n.engine];
    return [];
  }
  function nodeDomains(n) {
    if (n.domains && n.domains.length) return n.domains;
    if (n.type !== 'impl') return [];
    var nm = nodeMap();
    for (var i = 0; i < state.doc.edges.length; i++) {
      var e = state.doc.edges[i];
      if (e.type === 'implements' && e.from === n.id && nm[e.to]) {
        var d = nm[e.to].domains || [];
        if (d.length) return d;
      }
    }
    return [];
  }
  function layout(view) {
    var w = state.w, h = state.h, out = {}, nodes = state.doc.nodes, nm = nodeMap();
    var padL = (view === 'engine' && state.w >= 640) ? 112 : 74, padR = 18, padT = 34, padB = 22;
    state.needH = 0;
    if (view === 'engine') {
      // 卡片看板：每个引擎一张圆角卡片，卡片内节点排成整齐网格、标签水平排在圆点右侧。
      // 宽屏两列并排（一屏能看到 4–6 张卡），窄屏一列。
      var narrow = state.w < 640;
      var cardCols = narrow ? 1 : 2;
      var cardX = narrow ? 10 : 20;
      var cardGap = narrow ? 10 : 14;
      var cardW = (w - cardX * 2 - cardGap * (cardCols - 1)) / cardCols;
      var titleH = narrow ? 24 : 30;
      var cellH = narrow ? 30 : 32;
      var innerCols = narrow ? 2 : Math.max(2, Math.floor((cardW - 24) / 160));
      var cellW = (cardW - 24) / innerCols;
      var groups = {};
      ENGINES.forEach(function (en) { groups[en[0]] = []; });
      nodes.forEach(function (n) {
        var key = null;
        if (n.type === 'engine') key = n.id.replace(/^engine\//, '');
        else if (n.type === 'impl' && n.engine) key = n.engine;
        else if (n.engines && n.engines.length) key = n.engines[0];
        if (!groups[key]) key = ENGINES.length ? ENGINES[Math.abs(hash(n.id)) % ENGINES.length][0] : null;
        if (key) groups[key].push(n);
      });
      var cards = ENGINES.map(function (en, li) {
        var all = groups[en[0]];
        var g = all.filter(function (n) { return n.type !== 'engine'; });
        var rank = { tech: 0, impl: 1, case: 2, hardware: 3, community: 4 };
        g.sort(function (a, b) {
          var ra = rank[a.type] == null ? 9 : rank[a.type], rb = rank[b.type] == null ? 9 : rank[b.type];
          return ra - rb || (a.domains[0] || '').localeCompare(b.domains[0] || '') || a.name.localeCompare(b.name);
        });
        // 默认每张卡只摊 6 个节点：214 个节点全铺开就是一堵标签墙（用户原话「太密，看不清」）。
        // 其余折叠成「+N 个 · 点开看」，点一下就展开，搜索时自动全展开（否则命中项藏在折叠里）。
        var open = !!state.cardOpen[en[0]] || !!state.query.trim() || state.filters.engine !== '全部' || state.filters.domain !== '全部';
        var CAP = 6;
        var shown = open ? g : g.slice(0, CAP);
        return {
          en: en, li: li, all: all, g: g, shown: shown, more: g.length - shown.length, open: open,
          h: titleH + Math.max(1, Math.ceil(shown.length / innerCols)) * cellH + (g.length > shown.length ? 24 : 8)
        };
      });
      // 瀑布式两列：每张卡放进当前较矮的那一列，避免 23 节点的卡片旁边留一大片空白
      var colBags = [], colHeights = [];
      for (var ci = 0; ci < cardCols; ci++) { colBags.push([]); colHeights.push(40); }
      cards.forEach(function (cd) {
        var k = 0;
        for (var z = 1; z < cardCols; z++) if (colHeights[z] < colHeights[k]) k = z;
        colBags[k].push(cd);
        colHeights[k] += cd.h + cardGap;
      });
      var geom = [];
      colBags.forEach(function (bag, k) {
        var cx = cardX + k * (cardW + cardGap), cy = 40;
        bag.forEach(function (cd) {
          geom.push({ name: cd.en[1], key: cd.en[0], x: cx, y: cy, w: cardW, h: cd.h, n: cd.all.length, more: cd.more, open: cd.open });
          var engNode = cd.all.filter(function (n) { return n.type === 'engine'; })[0];
          if (engNode) out[engNode.id] = { x: cx + 22, y: cy + (narrow ? 15 : 18), lane: cd.li };
          cd.shown.forEach(function (n, j) {
            var r = Math.floor(j / innerCols), c = j % innerCols;
            out[n.id] = {
              x: cx + 12 + c * cellW + 10,
              y: cy + titleH + r * cellH + cellH / 2,
              lane: cd.li
            };
          });
          cy += cd.h + cardGap;
        });
      });
      state.laneGeom = geom;
      state.needH = Math.max.apply(null, colHeights) + 8;
    } else if (view === 'domain') {
      // 技术域 = 一组圆球：每个域一个球，球内节点按「中心 + 同心环」排，球半径随节点数长大。
      // 之前的 4 列方格更像表格，用户要的是「圆球状」。
      var buckets = {};
      DOMAINS.forEach(function (d) { buckets[d[0]] = []; });
      nodes.forEach(function (n) {
        var key = (n.domains || [])[0];
        if (!key && n.type === 'impl') {
          // impl 没 domains：找它 implements 的 tech 取域
          for (var i = 0; i < state.doc.edges.length; i++) {
            var e = state.doc.edges[i];
            if (e.type === 'implements' && e.from === n.id && nm[e.to] && (nm[e.to].domains || []).length) { key = nm[e.to].domains[0]; break; }
          }
        }
        if (!key && DOMAINS.length) key = DOMAINS[Math.abs(hash(n.id)) % DOMAINS.length][0];
        if (key) (buckets[key] = buckets[key] || []).push(n);
      });
      var narrowD = w < 700;
      var colsD = narrowD ? 1 : 3;
      var BALL_R = narrowD ? 58 : 54;   // 每球固定大小：球里只放 4 个代表节点（引擎 + 主要技术），其余点开看
      var SHOW = 4;
      var balls = DOMAINS.map(function (d, di) {
        var g = buckets[d[0]] || [];
        var orank = { engine: 0, tech: 1, case: 2, impl: 3, hardware: 4, community: 5 };
        g.sort(function (a, b) { return (orank[a.type] == null ? 9 : orank[a.type]) - (orank[b.type] == null ? 9 : orank[b.type]); });
        return { key: d[0], name: d[1], g: g, shown: g.slice(0, SHOW), R: BALL_R, di: di };
      });
      var cellW = (w - padL - padR) / colsD;
      var cellH = BALL_R * 2 + (narrowD ? 44 : 34);
      balls.forEach(function (it, i) {
        var ccx = padL + (i % colsD) * cellW + cellW / 2;
        var ccy = padT + Math.floor(i / colsD) * cellH + BALL_R + 14;
        it.cx = Math.round(ccx); it.cy = Math.round(ccy);
        // 球内竖排 4 行（点 + 标签），一行一个节点：比圆点阵看得懂，也不会互相压
        it.shown.forEach(function (n, j) {
          out[n.id] = { x: it.cx - BALL_R + 14, y: it.cy - 24 + j * 16 };
        });
      });
      state.ballGeom = balls;
      state.needH = padT + Math.ceil(balls.length / colsD) * cellH + padB;
    } else if (view === 'stack') {
      // 双栈对照：stack 含 nvidia / 含 ascend 分两列，cross 走中间。asc_equivalent 边跨列连线
      var cols2 = { nvidia: [], ascend: [], cross: [] };
      nodes.forEach(function (n) {
        var s = nodeStack(n);
        if (s === 'ascend') cols2.ascend.push(n);
        else if (s === 'nvidia') cols2.nvidia.push(n);
        else cols2.cross.push(n);
      });
      // 三个列带按节点数动态分配宽度：每列先算需要几个子列（rowsMax = 可用高度/最小间距），
      // 再按子列数比例分宽，保证任何一列塞满时都不会把节点压到画布底边重合。
      var gap = state.w < 640 ? 28 : 34;
      var rowsMax = Math.max(1, Math.floor((h - padT - padB) / gap));
      var order = ['nvidia', 'cross', 'ascend'];
      var need = {}, sumNeed = 0;
      order.forEach(function (k) {
        need[k] = Math.max(1, Math.ceil(cols2[k].length / rowsMax));
        sumNeed += need[k];
      });
      var avail = Math.max(120, w - padL - padR);
      var cur = padL;
      order.forEach(function (k) {
        var cw = avail * need[k] / sumNeed;
        packStacked(cols2[k], cur, cur + cw, padT, h - padB, out, gap);
        cur += cw;
      });
    } else { // timeline：按 maturity 五段（research→experimental→emerging→mainstream→legacy），段内按 updated_at
      var matOrder = ['research', 'experimental', 'emerging', 'mainstream', 'legacy'];
      var cells = {};
      nodes.forEach(function (n) {
        var mi = matOrder.indexOf(n.maturity); if (mi < 0) mi = 2; // 无 maturity 归入 emerging
        var key = 'm' + mi;
        (cells[key] = cells[key] || []).push(n);
      });
      cells && Object.keys(cells).forEach(function (k) {
        cells[k].sort(function (a, b) { return (a.updated_at || '').localeCompare(b.updated_at || ''); });
      });
      if (w < 700) {
        // 窄屏：五个成熟度段改成纵向五条带，每条带内用 packBox 铺格子
        var bandH = (h - padT - padB) / 5;
        Object.keys(cells).forEach(function (key) {
          var mi = +key.slice(1);
          var y0 = padT + mi * bandH;
          packBox(cells[key], padL, w - padR, y0, y0 + bandH - 4, out);
        });
      } else {
        var cw = (w - padL - padR) / 5;
        Object.keys(cells).forEach(function (key) {
          var mi = +key.slice(1);
          var x0 = padL + mi * cw;
          packStacked(cells[key], x0 + 4, x0 + cw - 4, padT, h - padB, out, 40);
        });
      }
    }
    // 引擎卡片看板用整齐网格排版，不能再做全局推开（会把行列推歪）
    if (view !== 'engine') relax(out, nodes);
    return out;
  }
  /* 在一块矩形区域内把一组节点铺成二维网格（列数按可用宽度算），确定性、不抖动 */
  function packBox(list, x0, x1, y0, y1, out) {
    if (!list.length) return;
    var bw = Math.max(30, x1 - x0), bh = Math.max(24, y1 - y0);
    var step = state.w < 640 ? 28 : 36;
    var cols = Math.max(1, Math.floor(bw / step));
    var rows = Math.ceil(list.length / cols);
    var dx = bw / cols, dy = Math.max(step, bh / Math.max(1, rows));
    list.forEach(function (n, i) {
      var c = i % cols, r = Math.floor(i / cols);
      out[n.id] = {
        x: Math.min(state.w - 12, Math.max(12, x0 + dx * (c + 0.5))),
        y: Math.min(state.h - 12, Math.max(padTopSafe(), y0 + dy * (r + 0.5)))
      };
    });
  }
  function padTopSafe() { return 12; }
  /* 高度不够时先沿横向拆子列再纵向排：保证垂直间距 ≥ gap，绝不把节点压进同一格。
     用在 timeline 的成熟度列与其它「一列塞不下就换列」的场景。 */
  function packStacked(list, x0, x1, y0, y1, out, gap) {
    if (!list.length) return;
    var bw = Math.max(40, x1 - x0), bh = Math.max(40, y1 - y0);
    var rowsMax = Math.max(1, Math.floor(bh / gap));
    var subCols = Math.max(1, Math.ceil(list.length / rowsMax));
    var subW = bw / subCols;
    for (var s = 0; s < subCols; s++) {
      var part = list.slice(s * rowsMax, (s + 1) * rowsMax);
      for (var r = 0; r < part.length; r++) {
        var nn = part[r];
        out[nn.id] = { x: x0 + subW * (s + 0.5), y: y0 + Math.min(bh - gap / 2, gap * (r + 0.5)) };
      }
    }
  }
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
  /* 确定性去重叠：只推挤相互压住的圆，多轮后夹回画布内。不是物理仿真，无抖动。
     同一泳道内节点常共线（dy≈0），单独靠水平推挤需要很多轮才能沿链传播，
     故对近共线的对子加一个确定性的微小垂直错位，让它们往二维散开，收敛更快。 */
  function relax(pos, nodes) {
    var w = state.w, h = state.h, pad = 5, cell = 44, n = nodes.length;
    // 空间网格把每轮两两检测从 O(n²) 降到近 O(n)（只查 3×3 相邻格）。
    // cell=44 > 最大分离距离 (15+5)*2=40，3×3 邻域必覆盖所有可能相压的对子。
    // 半径/夹边界预计算到数组：原来每轮每对都重算 radius()，是 340 轮里的主要开销。
    // 网格用 Map + 整数 key（原字符串拼接 key 在窄屏 340 轮下明显偏慢）。
    var rounds = Math.min(240, Math.max(140, Math.round(nodes.length * 1.3)));
    var rad = new Array(n), cl = new Array(n), q;
    for (q = 0; q < n; q++) { var rr = radius(nodes[q]); rad[q] = rr + pad; cl[q] = rr + 4; }
    for (var it = 0; it < rounds; it++) {
      var moved = 0, grid = new Map();
      for (var k = 0; k < n; k++) {
        var pk = pos[nodes[k].id]; if (!pk) continue;
        var gk = (Math.floor(pk.x / cell) + 1024) * 4096 + (Math.floor(pk.y / cell) + 1024);
        var arr = grid.get(gk); if (!arr) { arr = []; grid.set(gk, arr); }
        arr.push(k);
      }
      for (var i = 0; i < n; i++) {
        var a = pos[nodes[i].id]; if (!a) continue;
        var ra = rad[i];
        var agx = Math.floor(a.x / cell) + 1024, agy = Math.floor(a.y / cell) + 1024;
        for (var ox = -1; ox <= 1; ox++) for (var oy = -1; oy <= 1; oy++) {
          var bucket = grid.get((agx + ox) * 4096 + (agy + oy)); if (!bucket) continue;
          for (var bi = 0; bi < bucket.length; bi++) {
            var j = bucket[bi]; if (j <= i) continue;
            var b = pos[nodes[j].id]; if (!b) continue;
            var rb = rad[j];
            var dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, need = ra + rb;
            if (d2 >= need * need) continue;
            var d = Math.sqrt(d2);
            // 近共线：按 id 哈希给固定上下错位，打破一维死结（确定性、可复现）
            if (Math.abs(dy) < 1.5) {
              dy = ((hash(nodes[i].id) + hash(nodes[j].id)) % 2 ? 1 : -1) * 1.2;
              d = Math.sqrt(dx * dx + dy * dy);
            }
            if (d < 0.001) { dx = 0.7; dy = 0.7; d = 1; }
            var push = (need - d) / 2 / d * 1.2;
            a.x -= dx * push; a.y -= dy * push; b.x += dx * push; b.y += dy * push;
            moved++;
          }
        }
      }
      for (var m = 0; m < n; m++) {
        var p = pos[nodes[m].id]; if (!p) continue;
        var r = cl[m];
        p.x = Math.max(r + 4, Math.min(w - r - 4, p.x));
        p.y = Math.max(r + 4, Math.min(h - r - 12, p.y));
      }
      if (!moved) break;
    }
  }

  /* ---------- 场景渲染：字符串拼接 + 事件委托，350 节点也能秒渲染 ---------- */
  // 泳道名用短名：全名（Text Generation Inference）会把左侧标签区撑到 150px 以上，
  // 压住引擎节点；短名控制在 ~14 字符，配合加宽的引擎视图左留白（112px）。
  var LANE_SHORT = {
    'NVIDIA Dynamo': 'Dynamo',
    'TensorRT-LLM': 'TensorRT-LLM',
    'Triton Inference Server': 'Triton',
    'Text Generation Inference': 'TGI',
    'MindSpore Lite': 'MindSpore'
  };
  // 窄屏（<640）左侧只留 74px，泳道名必须再短一档，否则会压住引擎图标
  var LANE_SHORT_NARROW = {
    'NVIDIA Dynamo': 'Dynamo',
    'TensorRT-LLM': 'TRT-LLM',
    'Triton Inference Server': 'Triton',
    'Text Generation Inference': 'TGI',
    'MindSpore Lite': 'MindSpore',
    'llama.cpp': 'llama',
    'vLLM-Ascend': 'vLLM-Asc'
  };
  function laneDecor() {
    if (state.view !== 'engine') return '';
    var geom = state.laneGeom || [];
    if (!geom.length) return '';
    var narrow = state.w < 640;
    var s = '';
    geom.forEach(function (ln) {
      var x = ln.x, wd = ln.w;
      s += '<rect class="g-card-bg" x="' + x.toFixed(1) + '" y="' + ln.y.toFixed(1) + '" width="' + wd.toFixed(1) + '" height="' + ln.h.toFixed(1) + '" rx="12"/>';
      var nm = (narrow ? LANE_SHORT_NARROW[ln.name] : LANE_SHORT[ln.name]) || ln.name;
      s += '<text class="g-card-title" x="' + (x + 44) + '" y="' + (ln.y + (narrow ? 17 : 20)).toFixed(1) + '">' + esc(nm) + '</text>';
      s += '<text class="g-card-count" x="' + (x + wd - 14) + '" y="' + (ln.y + (narrow ? 17 : 20)).toFixed(1) + '" text-anchor="end">' + ln.n + ' 个节点</text>';
      if (ln.more > 0) {
        s += '<text class="g-card-more" data-card-more="' + esc(ln.key) + '" x="' + (x + 14) + '" y="' + (ln.y + ln.h - 7).toFixed(1) + '">＋' + ln.more + ' 个 · 点开看</text>';
      } else if (ln.open && ln.n > 6) {
        s += '<text class="g-card-more" data-card-more="' + esc(ln.key) + '" x="' + (x + 14) + '" y="' + (ln.y + ln.h - 7).toFixed(1) + '">收起</text>';
      }
    });
    return s;
  }
  function domainDecor() {
    if (state.view !== 'domain') return '';
    var balls = state.ballGeom || [];
    var s = '';
    balls.forEach(function (b) {
      var more = b.g.length - b.shown.length;
      s += '<circle class="g-ball" cx="' + b.cx + '" cy="' + b.cy + '" r="' + b.R + '" data-ball="' + esc(b.key) + '"/>';
      s += '<text class="g-ball-name" x="' + b.cx + '" y="' + (b.cy - b.R - 8) + '" text-anchor="middle">' + esc(b.name) + ' · ' + b.g.length + '</text>';
      if (more > 0) {
        s += '<text class="g-ball-more" data-ball="' + esc(b.key) + '" x="' + b.cx + '" y="' + (b.cy + b.R - 10) + '" text-anchor="middle">+' + more + ' 个 · 点开看</text>';
      }
    });
    return s;
  }
  function dualDecor() {
    if (state.view !== 'stack') return '';
    return '<line class="g-lane-rule" x1="' + (state.w * 0.5).toFixed(1) + '" y1="24" x2="' + (state.w * 0.5).toFixed(1) + '" y2="' + (state.h - 12) + '"/>' +
      '<text class="g-lane-label" x="' + (state.w * 0.26 - 30) + '" y="22">NVIDIA 栈</text>' +
      '<text class="g-lane-label" x="' + (state.w * 0.74 - 26) + '" y="22">昇腾栈</text>';
  }
  function evoDecor() {
    if (state.view !== 'timeline') return '';
    var s = '', padL = 74, padR = 18;
    var mats = [['research', '研究中'], ['experimental', '实验性'], ['emerging', '新兴'], ['mainstream', '主流'], ['legacy', '逐步淘汰']];
    var cw = (state.w - padL - padR) / 5;
    mats.forEach(function (m, i) {
      var x = padL + i * cw;
      s += '<line class="g-lane-rule" x1="' + x.toFixed(1) + '" y1="24" x2="' + x.toFixed(1) + '" y2="' + (state.h - 12) + '"/>';
      s += '<text class="g-axis-label" x="' + (x + 6) + '" y="18">' + esc(m[1]) + '</text>';
    });
    return s;
  }
  function buildScene() {
    var t0 = performance.now();
    var doc = state.doc, nm = nodeMap();
    state.positions = layout(state.view);
    // 引擎卡片看板的总高由内容决定（12 张卡片纵排），画布跟着长高、页面滚动；
    // 不把 12 张卡硬压进一屏，那正是之前「一堆点」的来源。
    if (state.needH) {
      var needH = Math.round(state.needH);
      if (needH !== state.h) {
        state.h = needH;
        var svgEl = $('gsvg');
        if (svgEl) {
          svgEl.setAttribute('viewBox', '0 0 ' + state.w + ' ' + state.h);
          if (svgEl.style.height !== needH + 'px') svgEl.style.height = needH + 'px';
        }
      }
    }
    var t1 = performance.now();
    var edgesS = laneDecor() + dualDecor() + evoDecor() + domainDecor();
    // 卡片看板不画关系线：节点已按引擎归位，跨卡片的长斜线只会变成噪声；
    // 关系在「技术域/双栈对照」视图和详情面板的「关系」分区里看。
    if (state.view !== 'engine') doc.edges.forEach(function (e) {
      var a = state.positions[e.from], b = state.positions[e.to];
      if (!a || !b) return;
      edgesS += '<line class="edge edge-' + esc(e.type) + '" data-from="' + esc(e.from) + '" data-to="' + esc(e.to) +
        '" x1="' + a.x.toFixed(1) + '" y1="' + a.y.toFixed(1) + '" x2="' + b.x.toFixed(1) + '" y2="' + b.y.toFixed(1) + '"/>';
    });
    $('gedges').innerHTML = edgesS;

    var nodesS = '', map = {};
    doc.nodes.forEach(function (n) {
      var p = state.positions[n.id]; if (!p) return;
      var tm = typeMeta(n.type), r = radius(n);
      var ico = tm.ico;
      // 引擎视图里泳道名已经写在左上角，engine 节点再挂一个同名标签就是重复；
      // 只保留鼠标悬停/选中时才出现的标签（CSS .node.hov .node-label）。
      // 引擎卡片视图：标签水平排在圆点右侧，一行一个节点（卡片网格的行高刚好容下一行）
      var horiz = (state.view === 'engine' || state.view === 'domain');
      var label = (state.view === 'engine' && n.type === 'engine') ? '' : (horiz ? cardName(n) : shortName(n, 9));
      var isAsc = nodeStack(n) === 'ascend';
      nodesS += '<g class="node t-' + esc(n.type) + (isAsc ? ' s-ascend' : '') + (state.selected === n.id ? ' selected' : '') + '" data-id="' + esc(n.id) +
        '" transform="translate(' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ')">' +
        '<circle class="node-circle" r="' + r + '" cx="0" cy="0"/>' +
        (isAsc && !horiz && r >= 8 ? '<text class="asc-flag" x="0" y="' + (-(r + 5)) + '" text-anchor="middle">昇</text>' : '') +
        '<text class="node-ico" x="0" y="' + (r > 11 ? 4 : 3) + '">' + esc(ico) + '</text>' +
        '<text class="node-label" x="' + (horiz ? (r + 6) : 0) + '" y="' + (horiz ? 4 : (r + 14)) + '"' + (horiz ? '' : ' text-anchor="middle"') + '>' + esc(label) + '</text></g>';
      map[n.id] = true;
    });
    $('gnodes').innerHTML = nodesS;
    state.visible = map;
    var t2 = performance.now();
    applyVisibility();
    applyVP();
    var t3 = performance.now();
    window.__gScene = { nodes: doc.nodes.length, layout: Math.round(t1 - t0), draw: Math.round(t2 - t1), visLabels: Math.round(t3 - t2) };
    if (!window.__gSceneFirst) window.__gSceneFirst = window.__gScene;
  }
  function applyVP() { $('vp').setAttribute('transform', 'translate(' + state.tx.toFixed(1) + ',' + state.ty.toFixed(1) + ') scale(' + state.k.toFixed(3) + ')'); }

  /* ---------- 筛选 / 搜索 / 邻域 ---------- */
  function passes(n) {
    var f = state.filters, q = state.query.trim().toLowerCase();
    if (f.stack !== '全部' && (n.stack || []).indexOf(f.stack) < 0) return false;
    if (f.engine !== '全部' && nodeEngines(n).indexOf(f.engine) < 0 && ('engine/' + f.engine) !== n.id) return false;
    if (f.domain !== '全部' && nodeDomains(n).indexOf(f.domain) < 0) return false;
    if (f.maturity !== '全部' && n.maturity !== f.maturity) return false;
    if (f.evidence !== '全部' && n.evidence !== f.evidence) return false;
    if (state.focusSet && !state.focusSet[n.id]) return false;
    if (q) {
      var hay = [n.name, n.id].concat(n.alias || [], n.one_line ? [n.one_line] : [],
        (n.module ? [n.module] : []), n.symbols || [], n.config || []).join(' ').toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  }
  function applyVisibility() {
    /* 一次遍历 gnodes.children 取代 per-node querySelector（原来 170 次全树查询 = O(n²)） */
    var nm = nodeMap(), ok = {}, hit = 0, q = state.query.trim().toLowerCase();
    Array.prototype.forEach.call($('gnodes').children, function (g) {
      if (!g.classList || !g.classList.contains('node')) return;
      var nid = g.getAttribute('data-id'), n = nm[nid];
      if (!n) return;
      var pass = passes(n);
      ok[nid] = pass;
      g.style.display = pass ? '' : 'none';
      g.classList.remove('search-hit');
      if (pass && q) {
        var hay = [n.name, n.id].concat(n.alias || [], n.module ? [n.module] : [], n.symbols || [], n.config || []).join(' ').toLowerCase();
        if (hay.indexOf(q) >= 0) { g.classList.add('search-hit'); hit++; }
      }
    });
    Array.prototype.forEach.call($('gedges').children, function (l) {
      if (l.classList.contains('edge') === false) return;
      l.style.display = (ok[l.getAttribute('data-from')] && ok[l.getAttribute('data-to')]) ? '' : 'none';
    });
    $('gempty').hidden = !(q && hit === 0);
    layoutLabels();
  }
  function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }

  /* ---------- 标签密度控制：可见 label 两两不相交（优先级 selected > 搜索命中 > engine > tech > impl > 其它） ---------- */
  function labelElOf(nid) {
    var g = $('gnodes').querySelector('[data-id="' + cssEsc(nid) + '"]');
    return g ? { g: g, t: g.querySelector('.node-label') } : null;
  }
  function labelBox(nid) {
    var o = labelElOf(nid); if (!o || !o.t) return null;
    var m = /translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(o.g.getAttribute('transform') || '');
    if (!m) return null;
    var bb = o.t.getBBox();
    var ox = parseFloat(m[1]), oy = parseFloat(m[2]);
    return { x1: bb.x + ox, y1: bb.y + oy, x2: bb.x + bb.width + ox, y2: bb.y + bb.height + oy };
  }
  function labelPriority(n) {
    if (state.selected === n.id) return 0;
    if (state.query.trim()) return 1;
    if (n.type === 'engine') return 2;
    if (n.type === 'tech') return 3;
    if (n.type === 'impl') return 4;
    return 5;
  }
  function layoutLabels() {
    var els = [];
    Array.prototype.forEach.call($('gnodes').children, function (g) {
      if (!g.classList || !g.classList.contains('node')) return;
      if (g.style.display === 'none') return;
      var t = g.querySelector('.node-label');
      if (t && t.textContent) els.push({ g: g, t: t, id: g.getAttribute('data-id') });
    });
    /* 第一遍纯写：全部恢复可见。不要与下面的 getBBox 交替，否则每次读都触发强制重排 */
    els.forEach(function (it) { it.t.classList.remove('lo'); it.t.style.visibility = ''; });
    /* 第二遍纯读：一次性取全部 bbox，本段不再写 DOM */
    var nm = nodeMap(), list = [];
    els.forEach(function (it) {
      var n = nm[it.id]; if (!n) return;
      var m = /translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(it.g.getAttribute('transform') || '');
      if (!m) return;
      var bb = it.t.getBBox(), ox = parseFloat(m[1]), oy = parseFloat(m[2]);
      list.push({
        id: it.id, el: it.t, p: labelPriority(n),
        b: { x1: bb.x + ox, y1: bb.y + oy, x2: bb.x + bb.width + ox, y2: bb.y + bb.height + oy }
      });
    });
    list.sort(function (a, b) {
      return a.p - b.p || (a.b.y1 - b.b.y1) || (a.b.x1 - b.b.x1) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
    // 卡片看板里每个节点一格、标签水平排，不会互相压，因此全显示；散点视图才需要上限
    var kept = [], pad = 4, MAXLBL = state.view === 'engine' ? 9999 : (state.w < 640 ? 30 : 55);
    list.forEach(function (it) {
      // 标签上限：超过就一律隐藏，鼠标悬停/选中时 CSS 会强制显示，避免满屏小字
      if (kept.length >= MAXLBL) { it.el.classList.add('lo'); it.el.style.visibility = 'hidden'; return; }
      var hit = false;
      for (var i = 0; i < kept.length; i++) {
        var k = kept[i].b;
        if (!(it.b.x2 + pad < k.x1 || it.b.x1 - pad > k.x2 || it.b.y2 + pad < k.y1 || it.b.y1 - pad > k.y2)) { hit = true; break; }
      }
      if (hit) { it.el.classList.add('lo'); it.el.style.visibility = 'hidden'; }
      else kept.push(it);
    });
    state.labelKept = kept.length;
  }

  function neighbors(id) {
    var ids = { }; ids[id] = true; var edges = [];
    state.doc.edges.forEach(function (e) {
      if (e.from === id) { ids[e.to] = true; edges.push(e); }
      else if (e.to === id) { ids[e.from] = true; edges.push(e); }
    });
    return { ids: ids, edges: edges };
  }
  function highlight(id) {
    var nb = neighbors(id);
    Array.prototype.forEach.call($('gnodes').children, function (g) {
      if (!g.classList || !g.classList.contains('node')) return;
      g.classList.remove('hi', 'dimmed', 'hov');
      var nid = g.getAttribute('data-id');
      if (nb.ids[nid]) g.classList.add('hi'); else g.classList.add('dimmed');
      if (nid === id) g.classList.add('hov');
    });
    Array.prototype.forEach.call($('gedges').children, function (l) {
      if (!l.classList || !l.classList.contains('edge')) return;
      var on = nb.edges.some(function (e) {
        return e.from === l.getAttribute('data-from') && e.to === l.getAttribute('data-to');
      });
      l.classList.remove('hi', 'dimmed'); l.classList.add(on ? 'hi' : 'dimmed');
    });
  }
  function clearHighlight() {
    Array.prototype.forEach.call($('gnodes').children, function (g) {
      if (g.classList) g.classList.remove('hi', 'dimmed', 'hov');
    });
    Array.prototype.forEach.call($('gedges').children, function (l) {
      if (l.classList) l.classList.remove('hi', 'dimmed');
    });
  }

  /* ---------- 九分区详情面板 ---------- */
  function val(v) { return (v == null || v === '' || (Array.isArray(v) && !v.length)) ? '<span class="gp-none">未查到</span>' : esc(v); }
  function badges(n) {
    var s = '<span class="gp-badge b-type">' + esc(typeMeta(n.type).name) + '</span>';
    (n.stack || []).forEach(function (x) { s += '<span class="gp-badge">' + esc(STACKNAME[x] || x) + '</span>'; });
    if (n.maturity) s += '<span class="gp-badge">' + esc(MATURITY[n.maturity] || n.maturity) + '</span>';
    if (n.evidence) s += '<span class="gp-badge">证据 ' + esc(n.evidence) + ' · ' + esc(EVIDENCE[n.evidence] || '未查到') + '</span>';
    return s;
  }
  function sec(i, title, body) {
    return '<section class="gp-sec" data-sec="' + i + '"><h4>' + i + '. ' + esc(title) + '</h4>' + body + '</section>';
  }
  function renderPanel(n) {
    var nm = nodeMap(), tm = typeMeta(n.type);
    var html = '';
    // 1 头部
    html += '<div class="gp-top"><span class="gp-ico" style="background:' + tm.color + '">' + esc(tm.ico) + '</span>' +
      '<div class="gp-title-wrap"><h3 class="gp-name">' + esc(n.name) + '</h3><div class="gp-badges">' + badges(n) + '</div>' +
      '<div class="gp-impl-meta">更新：' + val(n.updated_at) + ' · ' + val(n.updated_by) + '</div></div>' +
      '<button class="gp-close" id="gp-close" aria-label="关闭详情">×</button></div>';
    // 2 一句话 + 为什么
    html += sec(2, '一句话 · 为什么需要', '<p class="gp-oneline">' + val(n.one_line) + '</p><p class="gp-why">为什么：' + val(n.why) + '</p>');
    // 3 原理
    html += sec(3, '原理', '<p class="gp-body">' + val(n.principle) + '</p>' +
      (n.formula ? '<pre class="gp-formula">' + esc(n.formula) + '</pre>' : ''));
    // 4 引擎实现
    var impls = (n.impls || []).map(function (iid) { return nm[iid]; }).filter(Boolean);
    if (n.module) impls.unshift(n);
    var engHtml = '';
    if (n.type === 'case') {
      engHtml = nodeEngines(n).map(function (eid) {
        var eo = nm['engine/' + eid];
        return eo ? '<div class="gp-impl"><div class="gp-impl-name"><span class="gp-rel-link" data-goto="engine/' + esc(eid) + '">' + esc(eo.name) + '</span></div><div class="gp-impl-meta">' + val(eo.one_line) + '</div><div class="gp-impl-meta">实现细节点开该引擎节点的第 4 分区</div></div>' : '';
      }).join('');
    }
    var implHtml = impls.length ? impls.map(function (im) {
      var defs = im.defaults && Object.keys(im.defaults).length
        ? Object.keys(im.defaults).map(function (k) { return k + '=' + im.defaults[k]; }).join('、') : '';
      return '<div class="gp-impl"><div class="gp-impl-name">' + esc(im.name) + '</div>' +
        '<div class="gp-impl-path">' + val(im.module) + '</div>' +
        '<div class="gp-impl-meta">符号：' + val((im.symbols || []).join('、')) + '</div>' +
        '<div class="gp-impl-meta">参数：' + val((im.config || []).join('、')) + '</div>' +
        '<div class="gp-impl-meta">默认值：' + val(defs) + '</div>' +
        '<div class="gp-impl-meta">版本快照：' + val(im.version_seen) + '</div>' +
        (im.notes ? '<div class="gp-impl-meta">' + esc(im.notes) + '</div>' : '') + '</div>';
    }).join('') : (engHtml || (n.engine_note ? '<div class="gp-impl-meta">未走推理引擎：' + esc(n.engine_note) + '</div>' : '<p class="gp-none">未查到</p>'));
    // 社区节点没有实现层：改为列出本社区维护的引擎（点开即跳到该引擎面板）
    if (n.type === 'community' && !impls.length) {
      var owned = state.doc.edges.filter(function (e) { return e.type === 'maintained_by' && e.to === n.id && nm[e.from]; });
      if (owned.length) {
        implHtml = '<div class="gp-impl-meta">本社区维护的引擎（点引擎名跳转，看它的实现层与发版情况）：</div>' +
          owned.map(function (e) {
            var en = nm[e.from];
            return '<div class="gp-impl"><div class="gp-impl-name gp-rel-link" data-goto="' + esc(en.id) + '">' + esc(en.name) + '</div>' +
              '<div class="gp-impl-meta">' + esc(en.one_line || '') + '</div></div>';
          }).join('');
      }
    }
    html += sec(4, '在哪些引擎里 · 怎么实现', implHtml);
    // 5 实测收益
    var g = n.gain || [];
    // 引擎/硬件节点自身不收录基准时，聚合挂在该引擎下的技术节点实测数字（如实标注，不冒充引擎级基准）
    var gNote = '';
    if (!g.length && (n.type === 'engine' || n.type === 'hardware')) {
      var eshort = String(n.id || '').split('/')[1] || '';
      var agg = [];
      state.doc.nodes.forEach(function (t) {
        if (t.type !== 'tech' || !t.gain || !t.gain.length) return;
        var eng = t.engines || [];
        var hit = eng.some(function (x) { x = String(x); return x === n.id || x === eshort || x === 'engine/' + eshort; });
        if (!hit) return;
        t.gain.forEach(function (x) { agg.push({ tn: t.name || t.id, g: x }); });
      });
      if (agg.length) {
        g = agg.slice(0, 6).map(function (a) {
          return { metric: '〔' + a.tn + '〕' + (a.g.metric || ''), value: a.g.value, source: a.g.source, evidence: a.g.evidence };
        });
        gNote = '<p class="gp-impl-meta">引擎级基准本图未单独收录；下表是本引擎相关技术节点已收录的实测数字，注明技术名以便追溯。</p>';
      }
    }
    var gtab = g.length ? gNote + '<table class="gp-table"><tr><th>指标</th><th>数值</th><th>来源</th><th>证据</th></tr>' +
      g.map(function (x) { return '<tr><td>' + esc(x.metric || '') + '</td><td>' + esc(x.value || '') + '</td><td>' + val(x.source) + '</td><td>' + esc(x.evidence || '') + '</td></tr>'; }).join('') + '</table>'
      : '<p class="gp-none">未查到</p>';
    html += sec(5, '实测收益', gtab);
    // 6 代价与坑
    var cHtml = '<ul class="gp-list">' + ((n.cost || []).length ? (n.cost || []).map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') : '<li class="gp-none">未查到</li>') + '</ul>';
    var pf = n.pitfalls || [];
    // 引擎/硬件节点同理：聚合挂在它下面的技术节点的代价与坑，注明来源技术
    if (!(n.cost || []).length && !pf.length && (n.type === 'engine' || n.type === 'hardware')) {
      var es2 = String(n.id || '').split('/')[1] || '';
      var costAgg = [], pfAgg = [];
      state.doc.nodes.forEach(function (t) {
        if (t.type !== 'tech') return;
        var eng = t.engines || [];
        var hit = eng.some(function (x) { x = String(x); return x === n.id || x === es2 || x === 'engine/' + es2; });
        if (!hit) return;
        (t.cost || []).forEach(function (c) { costAgg.push({ tn: t.name || t.id, c: c }); });
        (t.pitfalls || []).forEach(function (p) { pfAgg.push({ tn: t.name || t.id, p: p }); });
      });
      if (costAgg.length || pfAgg.length) {
        cHtml = '<p class="gp-impl-meta">引擎级代价本图未单独收录；以下是本引擎相关技术节点的代价与坑，注明技术名以便追溯。</p><ul class="gp-list">' +
          costAgg.slice(0, 5).map(function (a) { return '<li>〔' + esc(a.tn) + '〕' + esc(a.c) + '</li>'; }).join('') + '</ul>' +
          pfAgg.slice(0, 5).map(function (a) { return '<div class="gp-pit"><b>坑</b> 〔' + esc(a.tn) + '〕' + esc(a.p.hit || '') + '<br><b>修法</b> ' + esc(a.p.fix || '') + '</div>'; }).join('');
      }
    } else if (pf.length) {
      cHtml += pf.map(function (p) { return '<div class="gp-pit"><b>坑</b> ' + esc(p.hit || '') + '<br><b>修法</b> ' + esc(p.fix || '') + '</div>'; }).join('');
    }
    html += sec(6, '代价与坑', cHtml);
    // 7 关系（按边类型分组，每条 note，可点击）
    var rels = state.doc.edges.filter(function (e) { return e.from === n.id || e.to === n.id; });
    var groups = {};
    rels.forEach(function (e) { (groups[e.type] = groups[e.type] || []).push(e); });
    var relHtml = Object.keys(groups).map(function (t) {
      var rows = groups[t].map(function (e) {
        var out = e.from === n.id, oid = out ? e.to : e.from, o = nm[oid];
        return '<div class="gp-rel-row"><span class="gp-rel-arrow">' + (out ? '→' : '←') + '</span>' +
          '<span class="gp-rel-link" data-goto="' + esc(oid) + '">' + esc(o ? o.name : oid) + '</span>' +
          '<span class="gp-rel-note">' + val(e.note) + '</span></div>';
      }).join('');
      return '<div class="gp-rel-group"><div class="gp-rel-gtitle">' + esc((EDGE_META[t] || {}).name || t) + '（' + groups[t].length + '）</div>' + rows + '</div>';
    }).join('') || '<p class="gp-none">未查到</p>';
    html += sec(7, '关系（按类型分组）', relHtml);
    // 8 社区与维护者
    // 优先用节点自身的社区字段；engine 节点经 maintained_by 边找维护社区
    var cm = (n.type === 'community') ? n : n.community;
    if (!cm) {
      for (var ci = 0; ci < state.doc.edges.length; ci++) {
        var ce = state.doc.edges[ci];
        if (ce.type === 'maintained_by' && ce.from === n.id && nm[ce.to]) { cm = nm[ce.to]; break; }
      }
    }
    var govLink = cm && cm.governance_url
      ? ' <a class="gp-url" href="' + esc(cm.governance_url) + '" target="_blank" rel="noopener">治理说明 ↗</a>' : '';
    // 真实规模与维护者（由 enrich_community.py 从 GitHub REST API 抓取；缺失就整行不显示，不填空话）
    function num(v) { return (v === null || v === undefined || v === '') ? '' : String(v); }
    var reposTxt = cm && cm.repos ? (Array.isArray(cm.repos) ? cm.repos.join('、') : String(cm.repos)) : '';
    var scaleBits = [];
    if (cm && cm.stars !== null && cm.stars !== undefined) scaleBits.push('★ ' + Number(cm.stars).toLocaleString());
    if (cm && cm.contributors) scaleBits.push('贡献者 ' + cm.contributors);
    if (cm && cm.last_push) scaleBits.push('最近提交 ' + cm.last_push);
    var maintTxt = '';
    if (cm && cm.top_maintainers && cm.top_maintainers.length) {
      maintTxt = cm.top_maintainers.map(function (m) {
        return esc(m.login) + (m.contributions ? ' <span class="gp-impl-meta">(' + m.contributions + ')</span>' : '');
      }).join('、') + '<div class="gp-impl-meta">按公开 commit 数排序的前 ' + cm.top_maintainers.length + ' 位，来源 GitHub contributors API</div>';
    }
    var cadTxt = '';
    if (cm && (cm.release_cadence_days !== null && cm.release_cadence_days !== undefined)) {
      cadTxt = '平均 ' + cm.release_cadence_days + ' 天/版';
      if (cm.latest_release && cm.latest_release.tag) cadTxt += '；最新 ' + esc(cm.latest_release.tag) + (cm.latest_release.date ? '（' + esc(cm.latest_release.date) + '）' : '');
    }
    var cmHtml = cm ?
      '<dl class="gp-comm"><dt>组织</dt><dd>' + val(cm.org) + '</dd><dt>治理模式</dt><dd>' + val(cm.governance) + govLink + '</dd>' +
      '<dt>仓库</dt><dd>' + val(reposTxt) + '</dd>' +
      '<dt>License</dt><dd>' + val(cm.license) + '</dd>' +
      (scaleBits.length ? '<dt>规模</dt><dd>' + esc(scaleBits.join(' · ')) + '</dd>' : '') +
      (maintTxt ? '<dt>核心维护者</dt><dd>' + maintTxt + '</dd>' : '') +
      (cadTxt ? '<dt>发版节奏</dt><dd>' + cadTxt + '</dd>' : '') + '</dl>'
      : '<p class="gp-none">未查到</p>';
    html += sec(8, '社区与维护者', cmHtml);
    // 9 出处与变更
    var u = n.urls || [];
    var uHtml = u.length ? u.map(function (x) { return '<a class="gp-url" href="' + esc(x) + '" target="_blank" rel="noopener">' + esc(x) + ' ↗</a>'; }).join('') : '<p class="gp-none">未查到</p>';
    var cl = n.changelog || [];
    uHtml += '<p class="gp-impl-meta">变更：' + (cl.length ? cl.map(function (c) { return esc(c.date || '') + ' ' + esc(c.change || ''); }).join('；') : '未查到') + '</p>';
    html += sec(9, '出处与变更', uHtml);
    // 底部动作
    html += '<div class="gp-actions"><button class="gp-act primary" id="gp-neighbors">' + (state.focusSet ? '✕ 清除邻域' : '◎ 看它的邻居') + '</button>' +
      '<button class="gp-act" id="gp-copy">🔗 复制深链</button></div>';
    $('gpanel').innerHTML = html;

    $('gp-close').addEventListener('click', closePanel);
    $('gp-neighbors').addEventListener('click', function () {
      if (state.focusSet) { state.focusSet = null; }
      else { state.focusSet = neighbors(n.id).ids; }
      applyVisibility(); renderPanel(n); toast(state.focusSet ? '已聚焦邻域（' + Object.keys(state.focusSet).length + ' 个节点）' : '已清除邻域');
    });
    $('gp-copy').addEventListener('click', function () {
      var url = location.href.split('#')[0] + '#node/' + encodeURIComponent(n.id);
      copyText(url); toast('深链已复制');
    });
    Array.prototype.forEach.call($('gpanel').querySelectorAll('[data-goto]'), function (a) {
      a.addEventListener('click', function () { selectNode(a.getAttribute('data-goto'), true); });
    });
  }
  // 通用列表抽屉：技术域 / 引擎 / 任意一组节点都走这里 —— v2 三层交互的「列表层」
  function showGroupPanel(title, list, note) {
    var order = ['engine', 'tech', 'impl', 'case', 'hardware', 'community'];
    var groups = {};
    list.forEach(function (n) { (groups[n.type] = groups[n.type] || []).push(n); });
    var html = '<div class="gp-top"><span class="gp-ico" style="background:var(--accent,#2563eb)">◎</span>' +
      '<div class="gp-title-wrap"><h3 class="gp-name">' + esc(title) + '</h3>' +
      '<div class="gp-badges"><span class="gp-badge b-type">' + list.length + ' 个节点</span></div>' +
      (note ? '<div class="gp-impl-meta">' + esc(note) + '</div>' : '') + '</div>' +
      '<button class="gp-close" id="gp-close" aria-label="关闭详情">×</button></div>';
    order.forEach(function (t) {
      var arr = groups[t] || []; if (!arr.length) return;
      html += sec(order.indexOf(t) + 2, typeMeta(t).name + '（' + arr.length + '）',
        '<ul class="gp-links">' + arr.map(function (n) {
          return '<li><a class="gp-rel-link" data-goto="' + esc(n.id) + '">' + esc(n.name) + '</a></li>';
        }).join('') + '</ul>');
    });
    $('gpanel').innerHTML = html;
    $('gpanel').hidden = false;
    $('ggrid').classList.add('has-panel');
    $('gp-close').addEventListener('click', closePanel);
    Array.prototype.forEach.call($('gpanel').querySelectorAll('[data-goto]'), function (a) {
      a.addEventListener('click', function () { selectNode(a.getAttribute('data-goto'), true); });
    });
  }
  // 点技术域的球：列出该域全部节点（按类型分组），点条目直接跳节点面板。
  function showDomainPanel(key) {
    var d = DOMAINS.filter(function (x) { return x[0] === key; })[0] || [key, key];
    var list = state.doc.nodes.filter(function (n) { return (n.domains || []).indexOf(key) >= 0; });
    showGroupPanel(d[1], list, '技术域 · 按类型分组，点条目看九分区详情');
  }

  /* ---------- 总览地图（v2 首屏）：HTML 承载入口，点击目标大 ---------- */
  var MAP_DOMAIN_GROUPS = [
    ['服务与输入输出', ['serving', 'multimodal', 'structured-output']],
    ['计算与并行', ['attention-kernel', 'quantization', 'parallel']],
    ['调度与缓存', ['scheduling', 'kv-cache', 'prefix-cache']],
    ['图与解码', ['graph-compile', 'spec-decode', 'ascend-native']]
  ];
  function engineShort(eid) { return String(eid || '').split('/')[1] || ''; }
  function engineNode(short) {
    return state.doc.nodes.filter(function (n) { return n.type === 'engine' && engineShort(n.id) === short; })[0];
  }
  function nodesOfEngine(short) {
    return state.doc.nodes.filter(function (n) {
      if (n.type === 'engine') return engineShort(n.id) === short;
      if ((n.engines || []).indexOf(short) >= 0) return true;
      return n.engine === short;
    });
  }
  function openEnginePanel(short) {
    var eng = state.doc.nodes.filter(function (n) { return n.type === 'engine' && engineShort(n.id) === short; })[0];
    showGroupPanel(eng ? eng.name : short, nodesOfEngine(short), '推理引擎 · 实现、相关技术与案例，点条目看九分区');
  }
  function matchNode(n, q) {
    if (!q) return false;
    var hay = [n.name, (n.alias || []).join(' '), n.one_line || '', n.module || '',
      (n.symbols || []).join(' '), n.config || '', n.engine || '',
      (n.engines || []).join(' '), (n.domains || []).join(' ')].join(' ').toLowerCase();
    return hay.indexOf(q) >= 0;
  }
  function filterMap() {
    var q = state.query.trim().toLowerCase();
    Array.prototype.forEach.call(document.querySelectorAll('#gmap [data-engine]'), function (b) {
      var k = b.getAttribute('data-engine');
      var hit = !q || k.toLowerCase().indexOf(q) >= 0 || (b.textContent || '').toLowerCase().indexOf(q) >= 0;
      b.style.display = hit ? '' : 'none';
    });
    Array.prototype.forEach.call(document.querySelectorAll('#gmap [data-ball-item]'), function (b) {
      var k = b.getAttribute('data-domain');
      var hit = !q || (DOMAIN_NAME[k] || '').toLowerCase().indexOf(q) >= 0 ||
        state.doc.nodes.some(function (n) {
          return (n.domains || []).indexOf(k) >= 0 && (n.name || '').toLowerCase().indexOf(q) >= 0;
        });
      b.style.display = hit ? '' : 'none';
    });
  }
  function buildMap() {
    if (!state.doc) return;
    var stEl = $('gmapstacks'), dmEl = $('gmapdomains'), ftEl = $('gmapfoot');
    if (!stEl || !dmEl) return;
    var groups = { nvidia: [], ascend: [], other: [] };
    ENGINES.forEach(function (e) {
      var k = e[2] === 'ascend' ? 'ascend' : (e[2] === 'nvidia' ? 'nvidia' : 'other');
      groups[k].push(e);
    });
    var stackDefs = [['nvidia', 'NVIDIA · GPU 栈'], ['ascend', '昇腾 · NPU 栈'], ['other', '跨栈 · 其它引擎']];
    stEl.innerHTML = stackDefs.filter(function (s) { return groups[s[0]].length; }).map(function (s) {
      var list = groups[s[0]];
      return '<div class="g-stack ' + s[0] + '"><div class="g-stack-head"><span class="g-stack-name">' + s[1] +
        '</span><span class="g-stack-sub">' + list.length + ' 个引擎 · 点开看它的实现层</span></div><div class="g-engines">' +
        list.map(function (e) {
          var n = nodesOfEngine(e[0]).length;
          var en = engineNode(e[0]);
          var desc = en && en.one_line ? String(en.one_line) : '';
          if (desc.length > 46) desc = desc.slice(0, 46) + '…';
          return '<button class="g-engine" data-engine="' + esc(e[0]) + '"><span class="g-engine-name">' + esc(e[1]) +
            '</span>' + (desc ? '<span class="g-engine-desc">' + esc(desc) + '</span>' : '') +
            '<span class="g-engine-meta">' + n + ' 项内容</span></button>';
        }).join('') + '</div></div>';
    }).join('');
    dmEl.innerHTML = MAP_DOMAIN_GROUPS.map(function (g) {
      var balls = g[1].filter(function (k) { return DOMAIN_NAME[k]; }).map(function (k) {
        var n = state.doc.nodes.filter(function (x) { return (x.domains || []).indexOf(k) >= 0; }).length;
        return '<button class="g-ball-item" data-ball-item data-domain="' + esc(k) + '"><span class="g-ball-circle"><span class="g-ball-n">' + n +
          '</span><span class="g-ball-unit">条</span></span><span class="g-ball-name">' + esc(DOMAIN_NAME[k]) + '</span></button>';
      }).join('');
      return '<div class="g-dgroup"><div class="g-dgroup-head">' + g[0] + '</div><div class="g-balls">' + balls + '</div></div>';
    }).join('');
    if (ftEl) {
      ftEl.textContent = '数据 ' + state.doc.nodes.length + ' 节点 · ' + state.doc.edges.length + ' 条关系 · 生成于 ' +
        String(state.doc.generated_at || '—').slice(0, 16).replace('T', ' ');
    }
    filterMap();
  }
  /* ---------- v3 主浏览路径：两条栈 → 12 个技术域 → 本栈技术 / 案例 ----------
     设计稿：graph/DESIGN-v3.md（2026-11-24）。四条硬规则：
     ① 每个 ID 只有一个主归档位置（技术按主域、实现按引擎、案例按运行栈）；
     ② 栈归属由「它运行在哪个引擎上」决定，不信节点自报的 stack；
     ③ 引擎只作为「实现者」出现在域里，不与域并列；
     ④ 一个技术两条栈都有实现时，两栈各见一次同一 ID，详情按当前栈收敛。 */
  var V3_STACKS = [['nvidia', 'NVIDIA', 'GPU 栈'], ['ascend', '昇腾', 'NPU 栈']];
  var V3_ENGINE_STACK = {
    'vllm': 'nvidia', 'sglang': 'nvidia', 'tensorrt-llm': 'nvidia', 'lmdeploy': 'nvidia',
    'llama.cpp': 'nvidia', 'tgi': 'nvidia', 'dynamo': 'nvidia', 'triton': 'nvidia', 'ollama': 'nvidia',
    'vllm-ascend': 'ascend', 'mindie': 'ascend', 'mindspore-lite': 'ascend',
    'atb': 'ascend', 'cann': 'ascend', 'msmodelslim': 'ascend', 'torchair': 'ascend'
  };
  var V3_DOMAIN_ORDER = ['serving', 'scheduling', 'kv-cache', 'prefix-cache', 'attention-kernel',
    'quantization', 'parallel', 'graph-compile', 'spec-decode', 'structured-output', 'multimodal', 'ascend-native'];
  // 多域条目的主域（设计稿 4.3 的显式表；主域必须在该节点声明的 domains 内，否则回落到 domains[0]）
  var V3_PRIMARY_OVERRIDE = {
    'tech/ascend-hccl-collectives': 'parallel',
    'tech/ascend-aoe-autotuning': 'ascend-native',
    'tech/ascend-profiling-timeline': 'ascend-native',
    'tech/ascend-fia-tnd-query-limit': 'attention-kernel',
    'tech/ascend-msmodelslim-calibration': 'quantization',
    'tech/ascend-aclgraph-replay': 'graph-compile',
    'tech/paged-attention': 'kv-cache',
    'tech/fp8-kv-cache': 'kv-cache',
    'tech/kv-aware-request-routing': 'prefix-cache',
    'tech/prefill-decode-disaggregation': 'serving',
    'tech/model-backend': 'serving',
    'case/20261118-01': 'serving', 'case/20261122-01': 'serving',
    'case/20261118-03': 'multimodal', 'case/20261122-03': 'multimodal',
    'case/20261118-04': 'quantization'
  };
  var V3_TOOLCHAIN = { atb: 1, cann: 1, msmodelslim: 1, torchair: 1 };
  var V3_STACK_NAME = { nvidia: 'NVIDIA', ascend: '昇腾' };
  function v3EngineStack(e) { return V3_ENGINE_STACK[String(e || '').split('/').pop()] || null; }
  function v3PrimaryDomain(n) {
    var ds = n.domains || [];
    var ov = V3_PRIMARY_OVERRIDE[n.id];
    if (ov && ds.indexOf(ov) >= 0) return ov;
    return ds[0] || null;
  }
  // 一次性建索引：每个节点只归一个栈 / 一个主域，之后渲染全部读缓存，不再算。
  function v3Index() {
    if (state.b3idx) return state.b3idx;
    var m = nodeMap();
    var idx = { stackOf: {}, techStack: {}, implOfTech: {}, allByDomain: {}, domainOf: {} };
    state.doc.nodes.forEach(function (n) {
      if (n.type === 'engine') { var se = v3EngineStack(engineShort(n.id)); if (se) idx.stackOf[n.id] = se; }
      if (n.type === 'impl') { var s = v3EngineStack(n.engine); if (s) idx.stackOf[n.id] = s; }
    });
    state.doc.edges.forEach(function (e) {
      if (e.type !== 'runs_on') return;
      var src = m[e.from]; if (!src) return;
      var s = v3EngineStack(engineShort(e.to) || e.to); if (!s) return;
      if (src.type === 'impl' && !idx.stackOf[e.from]) idx.stackOf[e.from] = s;
      if (src.type === 'case') idx.stackOf[e.from] = s;
    });
    state.doc.edges.forEach(function (e) {
      if (e.type !== 'implements') return;
      var s = idx.stackOf[e.from]; if (!s) return;
      (idx.techStack[e.to] = idx.techStack[e.to] || {})[s] = 1;
      (idx.implOfTech[e.to] = idx.implOfTech[e.to] || []).push(e.from);
    });
    state.doc.nodes.forEach(function (n) {
      var d = v3PrimaryDomain(n);
      if (!d) return;
      idx.domainOf[n.id] = d;
      (idx.allByDomain[d] = idx.allByDomain[d] || []).push(n.id);
    });
    state.b3idx = idx;
    return idx;
  }
  function v3TechStack(id) { return Object.keys(v3Index().techStack[id] || {}); }
  function v3StackOf(id) { return v3Index().stackOf[id] || null; }
  function v3DomainName(k) { return DOMAIN_NAME[k] || k; }
  function v3TechsIn(stack, domain) {
    var idx = v3Index(), m = nodeMap(), out = [];
    (idx.allByDomain[domain] || []).forEach(function (id) {
      var n = m[id]; if (!n || n.type !== 'tech') return;
      if ((idx.techStack[id] || {})[stack]) out.push(n);
    });
    return out.sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'zh'); });
  }
  function v3AllTechsIn(domain) {
    var idx = v3Index(), m = nodeMap();
    return (idx.allByDomain[domain] || []).map(function (id) { return m[id]; })
      .filter(function (n) { return n && n.type === 'tech'; })
      .sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'zh'); });
  }
  function v3CasesIn(stack, domain) {
    var idx = v3Index(), m = nodeMap(), out = [];
    (idx.allByDomain[domain] || []).forEach(function (id) {
      var n = m[id]; if (!n || n.type !== 'case') return;
      if (idx.stackOf[id] === stack) out.push(n);
    });
    return out;
  }
  function v3ImplsOf(stack, techId) {
    var idx = v3Index(), m = nodeMap();
    return (idx.implOfTech[techId] || []).map(function (id) { return m[id]; })
      .filter(function (n) { return n && idx.stackOf[n.id] === stack; });
  }
  function v3EngineNames(stack, techId) {
    var idx = v3Index(), m = nodeMap();
    var seen = {}, out = [];
    (idx.implOfTech[techId] || []).forEach(function (id) {
      var n = m[id]; if (!n || idx.stackOf[id] !== stack) return;
      var e = n.engine || ''; if (!e || seen[e]) return;
      seen[e] = 1; out.push(e);
    });
    return out;
  }
  function v3CountFor(stack) {
    var idx = v3Index(), n = 0;
    Object.keys(idx.techStack).forEach(function (id) { if (idx.techStack[id][stack]) n++; });
    return n;
  }
  function v3StackCardHTML(s) {
    var stack = s[0], techN = v3CountFor(stack);
    var all = Object.keys(V3_ENGINE_STACK).filter(function (e) { return V3_ENGINE_STACK[e] === stack; });
    var engs = all.filter(function (e) { return !V3_TOOLCHAIN[e]; });
    var tools = all.filter(function (e) { return V3_TOOLCHAIN[e]; });
    var domains = V3_DOMAIN_ORDER.filter(function (d) { return v3TechsIn(stack, d).length || v3AllTechsIn(d).length; });
    var caseN = 0;
    state.doc.nodes.forEach(function (n) { if (n.type === 'case' && v3StackOf(n.id) === stack) caseN++; });
    return '<button class="g-v3-stack ' + stack + '" data-browse-stack="' + stack + '">' +
      '<span class="g-v3-stack-head"><b>' + esc(s[1]) + '</b><i>' + esc(s[2]) + '</i></span>' +
      '<span class="g-v3-stack-num">' + techN + '<em>项技术</em></span>' +
      '<span class="g-v3-stack-meta">' + domains.length + ' 个技术域 · ' + engs.length + ' 个推理引擎' +
      (tools.length ? ' · ' + tools.length + ' 个工具链' : '') + (caseN ? ' · ' + caseN + ' 个实战案例' : '') + '</span>' +
      '<span class="g-v3-stack-eng">' + engs.map(function (e) { return '<i>' + esc(e) + '</i>'; }).join('') + '</span>' +
      '<span class="g-v3-stack-go">进去看 →</span></button>';
  }
  function v3StacksHTML() {
    return '<div class="g-v3-lede"><h3>先选一条硬件栈</h3>' +
      '<p>同一个技术概念，NVIDIA 和昇腾各有各的实现。选一条栈进去，看到的是这条栈上真实存在的做法、数字和坑。' +
      '想看两边差别，在任意条目的详情里点「双栈对照」。</p></div>' +
      '<div class="g-v3-stacks">' + V3_STACKS.map(v3StackCardHTML).join('') + '</div>' +
      '<div class="g-v3-alt">也可以从别的角度看：' +
      '<a href="#view/map">总览地图</a><i>·</i><a href="#view/engine">引擎视图</a><i>·</i>' +
      '<a href="#view/timeline">演进时间线</a><i>·</i><a href="#view/stack">双栈对照索引</a></div>' +
      '<div class="g-v3-foot">共 ' + state.doc.nodes.length + ' 个条目 · ' + state.doc.edges.length + ' 条关系 · 12 个技术域 · 2 条硬件栈</div>';
  }
  function v3CrumbHTML(stack, domain) {
    var a = '<a class="g-v3-crumb-a" href="#browse">全部栈</a>';
    if (!stack) return '';
    var b = '<a class="g-v3-crumb-a" href="#browse/' + stack + '">' + esc(V3_STACK_NAME[stack] || stack) + '</a>';
    if (!domain) return a + ' <i>/</i> ' + b;
    return a + ' <i>/</i> ' + b + ' <i>/</i> <b>' + esc(v3DomainName(domain)) + '</b>';
  }
  function v3DomainsHTML(stack) {
    var cards = V3_DOMAIN_ORDER.map(function (d) {
      var mine = v3TechsIn(stack, d), all = v3AllTechsIn(d), cs = v3CasesIn(stack, d);
      var extra = '';
      if (!mine.length && all.length) extra = '<span class="g-v3-dcard-warn">这条栈还没有实现记录</span>';
      if (d === 'ascend-native' && stack === 'nvidia') extra = '<span class="g-v3-dcard-warn">此域只适用于昇腾</span>';
      return '<button class="g-v3-dcard" data-browse-domain="' + d + '">' +
        '<span class="g-v3-dcard-name">' + esc(v3DomainName(d)) + '</span>' +
        '<span class="g-v3-dcard-num">' + mine.length + '<em>项技术</em></span>' +
        '<span class="g-v3-dcard-meta">' + (cs.length ? cs.length + ' 个案例 · ' : '') + '全域 ' + all.length + ' 项</span>' +
        extra + '</button>';
    }).join('');
    return '<div class="g-v3-lede"><h3>这条栈有 ' + V3_DOMAIN_ORDER.length + ' 个技术方向</h3>' +
      '<p>每个技术只归一个主域。数字是这条栈上有真实实现记录的技术条数，点开看是哪几个引擎做的、怎么做的。</p></div>' +
      '<div class="g-v3-dgrid">' + cards + '</div>';
  }
  function v3TechListHTML(stack, domain) {
    var mine = v3TechsIn(stack, domain), all = v3AllTechsIn(domain), cs = v3CasesIn(stack, domain);
    var rows = mine.map(function (n) {
      var engs = v3EngineNames(stack, n.id);
      var implN = v3ImplsOf(stack, n.id).length;
      return '<li class="g-v3-row"><button class="g-v3-rowbtn" data-goto="' + esc(n.id) + '">' +
        '<span class="g-v3-rowname">' + esc(n.name) + '</span>' +
        '<span class="g-v3-roweng">' + (engs.length ? engs.map(function (e) { return '<i>' + esc(e) + '</i>'; }).join('') : '<i>未记录引擎</i>') + '</span>' +
        '<span class="g-v3-rownum">' + implN + ' 条实现</span></button></li>';
    }).join('');
    var miss = all.filter(function (n) { return mine.indexOf(n) < 0; });
    var missHTML = miss.length ? '<div class="g-v3-miss"><b>这条栈还没有实现记录的 ' + miss.length + ' 项</b>' +
      '<ul>' + miss.map(function (n) { return '<li><button class="g-v3-link" data-goto="' + esc(n.id) + '">' + esc(n.name) + '</button></li>'; }).join('') + '</ul></div>' : '';
    var caseHTML = cs.length ? '<div class="g-v3-cases"><h4>本栈实战案例（' + cs.length + '）</h4><ul>' + cs.map(function (n) {
      return '<li><button class="g-v3-rowbtn" data-goto="' + esc(n.id) + '"><span class="g-v3-rowname">' + esc(n.name) + '</span>' +
        '<span class="g-v3-rownum">案例</span></button></li>';
    }).join('') + '</ul></div>' : '';
    return '<div class="g-v3-lede"><h3>' + esc(v3DomainName(domain)) + ' · ' + esc(V3_STACK_NAME[stack]) + '</h3>' +
      '<p>这条栈上有 ' + mine.length + ' 项技术有实现记录。点任意一行看九个分区：原理、引擎里怎么实现（文件+参数）、实测数字、踩过的坑。</p></div>' +
      (rows ? '<ul class="g-v3-list">' + rows + '</ul>' : '<p class="g-v3-empty">这条栈在这个域还没有实现记录。</p>') +
      caseHTML + missHTML +
      '<div class="g-v3-back"><a class="g-v3-crumb-a" href="#browse/' + stack + '">← 回 ' + esc(V3_STACK_NAME[stack]) + ' 的技术方向</a></div>';
  }
  function renderBrowse() {
    var body = $('gbrowsebody'), crumb = $('gbcrumb');
    if (!body) return;
    var st = state.browseStack, dm = state.browseDomain;
    if (!st) { crumb.innerHTML = ''; body.innerHTML = v3StacksHTML(); return; }
    if (!dm) { crumb.innerHTML = v3CrumbHTML(st); body.innerHTML = v3DomainsHTML(st); return; }
    crumb.innerHTML = v3CrumbHTML(st, dm); body.innerHTML = v3TechListHTML(st, dm);
  }
  function goBrowse(stack, domain, pushHash) {
    state.browseStack = stack || null;
    state.browseDomain = domain || null;
    closePanelSilent();
    if (state.view !== 'browse') setView('browse', false);
    renderBrowse();
    if (pushHash !== false) {
      var h = '#' + (stack ? ('browse/' + stack + (domain ? '/' + domain : '')) : 'browse');
      state.suppressHash = true;
      history.replaceState(null, '', h);
      setTimeout(function () { state.suppressHash = false; }, 0);
    }
  }

  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).catch(function () { fallbackCopy(t); });
    } else fallbackCopy(t);
  }
  function fallbackCopy(t) {
    var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta);
    ta.select(); try { document.execCommand('copy'); } catch (e) { /* 忽略 */ }
    document.body.removeChild(ta);
  }
  function toast(msg) {
    var d = document.createElement('div'); d.className = 'gp-toast'; d.textContent = msg;
    document.body.appendChild(d); setTimeout(function () { d.remove(); }, 1800);
  }
  function selectNode(id, pushHash) {
    var n = nodeMap()[id]; if (!n) return;
    state.selected = id;
    Array.prototype.forEach.call($('gnodes').children, function (g) {
      if (g.classList) g.classList.toggle('selected', g.getAttribute('data-id') === id);
    });
    renderPanel(n);
    $('ggrid').classList.add('has-panel');
    $('gpanel').hidden = false;
    if (pushHash !== false) {
      state.suppressHash = true;
      history.replaceState(null, '', '#node/' + encodeURIComponent(id));
      setTimeout(function () { state.suppressHash = false; }, 0);
    }
  }
  function closePanel() {
    state.selected = null; state.focusSet = null;
    $('gpanel').hidden = true; $('ggrid').classList.remove('has-panel');
    applyVisibility();
    if (!state.suppressHash) { state.suppressHash = true; history.replaceState(null, '', '#view/' + state.view); setTimeout(function () { state.suppressHash = false; }, 0); }
  }

  /* ---------- 左栏：视图 / 筛选 / 矩阵 / 图例 ---------- */
  function renderViews() {
    $('gviews').innerHTML = VIEWS.map(function (v) {
      return '<button class="g-view-btn' + (state.view === v[0] ? ' active' : '') + '" data-view="' + v[0] + '" role="tab">' + esc(v[1]) + '</button>';
    }).join('');
    Array.prototype.forEach.call($('gviews').querySelectorAll('[data-view]'), function (b) {
      b.addEventListener('click', function () { setView(b.getAttribute('data-view'), true); });
    });
    $('gviewbadge').textContent = VIEW_NAME[state.view] + ' · ' + state.doc.nodes.length + ' 节点';
  }
  function filterVals() {
    var d = state.doc;
    return [
      ['stack', '栈', ['全部'].concat(uniq(flat(d.nodes, 'stack')))],
      ['engine', '引擎', ['全部'].concat(ENGINES.map(function (e) { return e[0]; }))],
      ['domain', '技术域', ['全部'].concat(DOMAINS.map(function (x) { return x[0]; }))],
      ['maturity', '成熟度', ['全部'].concat(uniq(map(d.nodes, 'maturity')))],
      ['evidence', '证据', ['全部'].concat(uniq(map(d.nodes, 'evidence')))]
    ];
  }
  function flat(arr, k) { var o = []; arr.forEach(function (x) { (x[k] || []).forEach(function (v) { o.push(v); }); }); return o; }
  function map(arr, k) { return arr.map(function (x) { return x[k]; }).filter(Boolean); }
  function uniq(a) { var s = {}, o = []; a.forEach(function (x) { if (!s[x]) { s[x] = 1; o.push(x); } }); return o.sort(); }
  function fname(k, v) {
    if (k === 'stack') return STACKNAME[v] || v;
    if (k === 'domain') return DOMAIN_NAME[v] || v;
    if (k === 'maturity') return MATURITY[v] || v;
    if (k === 'evidence') return '证据 ' + v + '（' + (EVIDENCE[v] || '未查到') + '）';
    if (k === 'engine') { var e = ENGINES.filter(function (x) { return x[0] === v; })[0]; return e ? e[1] : v; }
    return v;
  }
  function renderFilters() {
    var rows = filterVals().map(function (r) {
      var k = r[0], label = r[1], vals = r[2];
      var chips = vals.map(function (v) {
        var cnt = v === '全部' ? state.doc.nodes.length : countFor(k, v);
        var dis = v !== '全部' && cnt === 0;
        if (dis && state.filters[k] === v) state.filters[k] = '全部';
        return '<button class="g-fchip' + (state.filters[k] === v ? ' active' : '') + '" data-k="' + k + '" data-v="' + esc(v) + '"' +
          (dis ? ' disabled' : '') + ' title="' + esc(fname(k, v)) + '">' + esc(fname(k, v)) + '<span class="cnt">' + cnt + '</span></button>';
      }).join('');
      return '<div class="g-filter-row"><span class="g-filter-label">' + esc(label) + '</span><div class="g-filter-chips">' + chips + '</div></div>';
    }).join('');
    $('gfilters').innerHTML = rows;
    Array.prototype.forEach.call($('gfilters').querySelectorAll('[data-k]'), function (b) {
      if (b.disabled) return;
      b.addEventListener('click', function () {
        state.filters[b.getAttribute('data-k')] = b.getAttribute('data-v');
        renderFilters(); applyVisibility();
      });
    });
  }
  function countFor(k, v) {
    return state.doc.nodes.filter(function (n) {
      if (k === 'stack') return (n.stack || []).indexOf(v) >= 0;
      if (k === 'engine') return nodeEngines(n).indexOf(v) >= 0 || n.id === 'engine/' + v;
      if (k === 'domain') return nodeDomains(n).indexOf(v) >= 0;
      return n[k] === v;
    }).length;
  }
  function renderMatrix() {
    var nm = nodeMap(), rows = ENGINES, cols = DOMAINS;
    var html = '<thead><tr><th class="gm-rowhead">引擎＼域</th>' + cols.map(function (c) { return '<th title="' + esc(c[1]) + '">' + esc(c[1].slice(0, 2)) + '</th>'; }).join('') + '</tr></thead><tbody>';
    rows.forEach(function (en) {
      html += '<tr><th class="gm-rowhead">' + esc(en[1]) + '</th>';
      cols.forEach(function (d) {
        var cnt = state.doc.nodes.filter(function (n) {
          return (nodeEngines(n).indexOf(en[0]) >= 0 || n.id === 'engine/' + en[0]) && nodeDomains(n).indexOf(d[0]) >= 0;
        }).length;
        var on = state.matrixCell && state.matrixCell.e === en[0] && state.matrixCell.d === d[0];
        html += '<td class="gm-cell' + (cnt ? '' : ' gm-zero') + (on ? ' on' : '') + '" data-e="' + en[0] + '" data-d="' + d[0] + '" title="' + esc(en[1] + ' × ' + d[1]) + '">' + cnt + '</td>';
      });
      html += '</tr>';
    });
    $('gmatrix').innerHTML = html + '</tbody>';
    Array.prototype.forEach.call($('gmatrix').querySelectorAll('.gm-cell:not(.gm-zero)'), function (td) {
      td.addEventListener('click', function () {
        var e = td.getAttribute('data-e'), d = td.getAttribute('data-d');
        state.matrixCell = { e: e, d: d };
        state.filters.engine = e; state.filters.domain = d;
        renderFilters(); renderMatrix(); applyVisibility();
        $('gmatrix-clear').hidden = false;
        toast('已交叉筛选：' + fname('engine', e) + ' × ' + fname('domain', d));
      });
    });
    $('gmatrix-clear').hidden = !state.matrixCell;
  }
  function renderLegends() {
    var nt = Object.keys(TYPE_META).map(function (t) {
      var m = TYPE_META[t];
      return '<div class="g-leg-item"><span class="g-leg-ico" style="background:' + m.color + '">' + esc(m.ico) + '</span>' +
        '<span><b>' + esc(m.name) + '</b><small>节点类型：' + esc(t) + '</small></span></div>';
    }).join('');
    var et = Object.keys(EDGE_META).map(function (t) {
      return '<div class="g-leg-item"><span class="g-leg-line l-' + esc(t) + '"></span>' +
        '<span><b>' + esc(EDGE_META[t].name) + '</b><small>边类型：' + esc(t) + '</small></span></div>';
    }).join('');
    $('glegendbody').innerHTML = '<section class="g-leg-sec"><h4>节点颜色 / 图标 = 类型（' + Object.keys(TYPE_META).length + ' 类）</h4>' + nt + '</section>' +
      '<section class="g-leg-sec"><h4>边的颜色 / 线型 = 关系（' + Object.keys(EDGE_META).length + ' 类）</h4>' + et + '</section>' +
      '<section class="g-leg-sec"><h4>其他代号</h4>' +
      Object.keys(EVIDENCE).map(function (e) { return '<div class="g-leg-item"><b>证据 ' + e + '</b><small>' + esc(EVIDENCE[e]) + '</small></div>'; }).join('') +
      Object.keys(MATURITY).map(function (m) { return '<div class="g-leg-item"><b>' + esc(m) + '</b><small>' + esc(MATURITY[m]) + '</small></div>'; }).join('') + '</section>';
    $('glegend-short').innerHTML = Object.keys(TYPE_META).map(function (t) {
      var m = TYPE_META[t];
      return '<span class="g-ls-item"><span class="g-ls-ico" style="background:' + m.color + '">' + esc(m.ico) + '</span>' + esc(m.name) + '</span>';
    }).join('');
  }

  /* ---------- 平移 / 缩放 ---------- */
  function svgPoint(e) {
    var r = $('gsvg').getBoundingClientRect();
    return { x: (e.clientX - r.left) * (state.w / r.width), y: (e.clientY - r.top) * (state.h / r.height) };
  }
  function zoomAt(f, cx, cy) {
    var k2 = Math.max(0.45, Math.min(3.2, state.k * f));
    var wx = (cx - state.tx) / state.k, wy = (cy - state.ty) / state.k;
    state.tx = cx - wx * k2; state.ty = cy - wy * k2; state.k = k2; applyVP();
  }
  function bindViewport() {
    var svg = $('gsvg');
    svg.addEventListener('wheel', function (e) {
      e.preventDefault(); var p = svgPoint(e); zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, p.x, p.y);
    }, { passive: false });
    var drag = null, suppress = false;
    function start(e) {
      if (e.target.closest && e.target.closest('.node')) return;
      drag = { sx: e.clientX, sy: e.clientY, tx: state.tx, ty: state.ty, moved: false };
    }
    function move(e) {
      if (!drag) return;
      var r = svg.getBoundingClientRect();
      var dx = (e.clientX - drag.sx) * (state.w / r.width), dy = (e.clientY - drag.sy) * (state.h / r.height);
      if (Math.abs(e.clientX - drag.sx) > 3 || Math.abs(e.clientY - drag.sy) > 3) { drag.moved = true; svg.classList.add('dragging'); }
      state.tx = drag.tx + dx; state.ty = drag.ty + dy; applyVP();
    }
    function end() { if (drag && drag.moved) suppress = true; drag = null; svg.classList.remove('dragging'); }
    svg.addEventListener('mousedown', start);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    svg.addEventListener('touchstart', function (e) { if (e.touches.length === 1) start(e.touches[0]); }, { passive: true });
    svg.addEventListener('touchmove', function (e) { if (e.touches.length === 1) move(e.touches[0]); }, { passive: true });
    window.addEventListener('touchend', end);
    svg.addEventListener('click', function (e) {
      if (suppress) { suppress = false; return; }
      if (!(e.target.closest && e.target.closest('.node'))) closePanel();
    });
    svg.addEventListener('dblclick', function () { resetVP(); });
    $('zin').addEventListener('click', function () { zoomAt(1.2, state.w / 2, state.h / 2); });
    $('zout').addEventListener('click', function () { zoomAt(1 / 1.2, state.w / 2, state.h / 2); });
    $('zreset').addEventListener('click', resetVP);
    $('zfit').addEventListener('click', function () { state.tx = 0; state.ty = 0; state.k = 1; fit(); buildScene(); });
  }
  function resetVP() { state.tx = 0; state.ty = 0; state.k = 1; applyVP(); }

  /* ---------- 深链 ---------- */
  function setView(mode, pushHash) {
    if (!VIEW_NAME[mode]) mode = 'browse';
    state.view = mode;
    var mapEl = $('gmap'), stEl = $('gstage'), brEl = $('gbrowse');
    if (brEl) brEl.hidden = mode !== 'browse';
    if (mapEl) mapEl.hidden = mode !== 'map';
    if (stEl) stEl.hidden = (mode === 'map' || mode === 'browse');
    if (pushHash !== false) {
      state.suppressHash = true;
      history.replaceState(null, '', '#view/' + mode);
      setTimeout(function () { state.suppressHash = false; }, 0);
    }
    renderViews();
    if (mode === 'browse') { renderBrowse(); return; }
    if (mode === 'map') return;
    fit(); buildScene();
  }
  function applyHash() {
    if (!state.doc) return;
    var h = location.hash;
    var m = h.match(/^#browse(?:\/([a-z]+))?(?:\/([a-z0-9-]+))?$/);
    if (m && (!m[1] || V3_STACK_NAME[m[1]])) { goBrowse(m[1] || null, m[2] || null, false); return; }
    m = h.match(/^#node\/(.+)$/);
    if (m) {
      if (state.view === 'map') setView('engine', false);
      selectNode(decodeURIComponent(m[1]), false); return;
    }
    m = h.match(/^#view\/([a-z]+)$/);
    if (m) { closePanelSilent(); setView(m[1], false); return; }
    closePanelSilent();
  }
  function closePanelSilent() {
    state.selected = null; state.focusSet = null;
    $('gpanel').hidden = true; $('ggrid').classList.remove('has-panel');
  }
  function bindHash() {
    window.addEventListener('hashchange', function () {
      if (state.suppressHash) return;
      applyHash();
    });
  }

  /* ---------- 主题：沿用 window.__themeClickBound 单绑 ---------- */
  function initTheme() {
    var saved = localStorage.getItem('theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    if (window.__themeClickBound) return;
    window.__themeClickBound = true;
    var t = $('theme-toggle'); if (!t) return;
    t.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', cur);
      localStorage.setItem('theme', cur);
    });
  }

  /* ---------- 几何自检钩子：正德的验收口径，暴露给浏览器直接断言 ---------- */
  function geometryReport() {
    var nodes = state.doc.nodes, pos = state.positions, bad = [], off = [], minFont = 999;
    nodes.forEach(function (n) {
      var p = pos[n.id]; if (!p) return;
      var r = radius(n);
      if (p.x - r < 0 || p.y - r < 0 || p.x + r > state.w || p.y + r > state.h) off.push(n.id);
    });
    for (var i = 0; i < nodes.length; i++) {
      for (var j = i + 1; j < nodes.length; j++) {
        var a = pos[nodes[i].id], b = pos[nodes[j].id]; if (!a || !b) continue;
        var dx = a.x - b.x, dy = a.y - b.y, d = Math.sqrt(dx * dx + dy * dy);
        var need = radius(nodes[i]) + radius(nodes[j]);
        if (d < need - 0.5) bad.push([nodes[i].id, nodes[j].id, +d.toFixed(1), need]);
      }
    }
    var label = $('gnodes').querySelector('.node-label');
    if (label) minFont = parseFloat(getComputedStyle(label).fontSize);
    var svg = $('gsvg'), vb = svg.getAttribute('viewBox').split(' ').map(Number);
    /* 可见 label 的 bbox 相交对（用户硬指标：必须为 0） */
    var labels = [], lp = [];
    nodes.forEach(function (n) {
      var o = labelElOf(n.id); if (!o || !o.t) return;
      if (o.g.style.display === 'none') return;
      if (o.t.style.visibility === 'hidden') return;
      var b = labelBox(n.id); if (b) labels.push({ id: n.id, b: b });
    });
    for (var a = 0; a < labels.length; a++) {
      for (var c = a + 1; c < labels.length; c++) {
        var A = labels[a].b, B = labels[c].b;
        if (!(A.x2 < B.x1 || A.x1 > B.x2 || A.y2 < B.y1 || A.y1 > B.y2)) lp.push([labels[a].id, labels[c].id]);
      }
    }
    return {
      nodes: nodes.length, edges: state.doc.edges.length, view: state.view,
      viewBox: vb, stage: [state.w, state.h],
      viewportOK: vb[2] === state.w && vb[3] === state.h,
      overlaps: bad, outside: off, overlapCount: bad.length, outsideCount: off.length,
      labelScreenPx: minFont, labelOK: minFont >= 11,
      labelVisibleCount: labels.length, labelOverlapPairs: lp.length, labelOverlaps: lp.slice(0, 8)
    };
  }
  window.__gprobe = {
    report: geometryReport,
    state: function () { return { view: state.view, selected: state.selected, query: state.query, filters: state.filters, fixture: state.doc._fixture }; },
    nodeIds: function () { return state.doc.nodes.map(function (n) { return n.id; }); },
    positions: function () { return state.positions; }
  };

  /* ---------- 节点事件委托：innerHTML 重建后不必逐个重绑 ---------- */
  function bindNodes() {
    var host = $('gnodes');
    host.addEventListener('click', function (e) {
      var g = e.target.closest ? e.target.closest('.node') : null;
      if (!g) return;
      e.stopPropagation();
      selectNode(g.getAttribute('data-id'), true);
    });
    host.addEventListener('mouseover', function (e) {
      var g = e.target.closest ? e.target.closest('.node') : null;
      if (g) highlight(g.getAttribute('data-id'));
    });
    host.addEventListener('mouseout', function (e) {
      var g = e.target.closest ? e.target.closest('.node') : null;
      if (g) clearHighlight();
    });
    // 卡片底部的「+N 个 · 点开看」/「收起」：展开/折叠该引擎卡片（只改布局，不动数据）
    $('gstage').addEventListener('click', function (e) {
      var t = e.target;
      // 技术域视图：整颗球都是点击区（不必精确点中 4px 的小圆点）
      var ball = t && t.getAttribute ? t.getAttribute('data-ball') : null;
      if (ball) { e.preventDefault(); e.stopPropagation(); showDomainPanel(ball); return; }
      var key = t && t.getAttribute ? t.getAttribute('data-card-more') : null;
      if (!key) return;
      e.preventDefault();
      e.stopPropagation();
      state.cardOpen[key] = !state.cardOpen[key];
      buildScene();
    });
  }

  /* 侧栏抽屉 / 全屏：把整屏留给画布 */
  function bindChrome() {
    var side = $('gside'), tg = $('gside-toggle');
    if (!side || !tg) return;
    var set = function (open) {
      side.classList.toggle('is-open', open);
      tg.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    tg.addEventListener('click', function (e) {
      e.stopPropagation();
      set(!side.classList.contains('is-open'));
    });
    // 点画布空白处收起侧栏（点节点/球/卡片不收起，避免误关）
    $('gstage').addEventListener('click', function (e) {
      if (!side.classList.contains('is-open')) return;
      var t = e.target;
      if (t.closest && t.closest('.node,.g-ball,.g-card-more')) return;
      set(false);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
    var fs = $('gfs');
    if (fs) fs.addEventListener('click', function () {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
    });
    // 总览地图：点引擎卡 → 该引擎全部内容；点域球 → 该域全部内容；整卡/整球都是点击区
    var map = $('gmap');
    if (map) map.addEventListener('click', function (e) {
      var t = e.target;
      var eb = t.closest && t.closest('[data-engine]');
      if (eb) { openEnginePanel(eb.getAttribute('data-engine')); return; }
      var db = t.closest && t.closest('[data-ball-item]');
      if (db) { showDomainPanel(db.getAttribute('data-domain')); return; }
    });
    // v3 目录：点栈卡 → 该栈 12 个技术域；点域卡 → 本栈技术列表；点技术行 → 九分区详情
    var br = $('gbrowse');
    if (br) br.addEventListener('click', function (e) {
      var t = e.target;
      var sb = t.closest && t.closest('[data-browse-stack]');
      if (sb) { goBrowse(sb.getAttribute('data-browse-stack'), null, true); return; }
      var db2 = t.closest && t.closest('[data-browse-domain]');
      if (db2) { goBrowse(state.browseStack, db2.getAttribute('data-browse-domain'), true); return; }
      var gb = t.closest && t.closest('[data-goto]');
      if (gb) { e.preventDefault(); selectNode(gb.getAttribute('data-goto'), true); return; }
    });
    var tr = $('gtorelations');
    if (tr) tr.addEventListener('click', function () { setView('engine'); });
    var dm = $('gdemo');
    if (dm) dm.addEventListener('click', function () {
      setView('engine');
      var demo = state.doc.nodes.filter(function (n) { return n.id === 'engine/vllm'; })[0] ||
        state.doc.nodes.filter(function (n) { return n.type === 'tech' && n.gain && n.gain.length; })[0] ||
        state.doc.nodes[0];
      if (demo) selectNode(demo.id, true);
    });
    var ms = $('gmapsearch');
    if (ms) {
      ms.addEventListener('input', function () { state.query = ms.value; filterMap(); });
      ms.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        var q = (ms.value || '').trim().toLowerCase(); if (!q) return;
        var hit = state.doc.nodes.filter(function (n) { return passes(n) && matchNode(n, q); })[0];
        if (hit) selectNode(hit.id, true);
      });
    }
  }

  /* ---------- boot ---------- */
  function boot() {
    var tBoot = performance.now();
    initTheme(); bindViewport(); bindHash(); bindNodes(); bindChrome();
    var s = $('gsearch');
    s.addEventListener('input', function () { state.query = s.value; applyVisibility(); });
    s.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var q = state.query.trim().toLowerCase(); if (!q) return;
      var hit = state.doc.nodes.filter(function (n) {
        return passes(n) && (n.name.toLowerCase().indexOf(q) >= 0 || n.alias.join(' ').toLowerCase().indexOf(q) >= 0);
      })[0];
      if (hit) selectNode(hit.id, true);
    });
    $('gmatrix-clear').addEventListener('click', function () {
      state.matrixCell = null; state.filters.engine = '全部'; state.filters.domain = '全部';
      renderFilters(); renderMatrix(); applyVisibility();
    });
    loadData().then(function (doc) {
      var tData = performance.now();
      state.doc = doc;
      var verEl = $('gver'); if (verEl) verEl.textContent = 'v3 · ' + (doc.schema_version || '');
      $('gmeta').textContent = 'v3 · 目录 · ' + (doc.generated_at ? '数据更新 ' + doc.generated_at.replace('T', ' ').slice(0, 16) : '') + ' · 每个条目点开有九个分区';
      $('gstatline').innerHTML =
        '<span class="g-stat">节点 <b>' + doc.nodes.length + '</b></span>' +
        '<span class="g-stat">关系 <b>' + doc.edges.length + '</b></span>' +
        '<span class="g-stat">引擎 <b>' + ENGINES.length + '</b></span>' +
        '<span class="g-stat">技术域 <b>' + DOMAINS.length + '</b></span>';
      $('gloading').hidden = true;
      renderViews(); renderFilters(); renderMatrix(); renderLegends(); buildMap();
      var h = location.hash.match(/^#view\/([a-z]+)$/);
      state.view = h && VIEW_NAME[h[1]] ? h[1] : 'browse';
      var isBrowse = state.view === 'browse';
      var isMap = state.view === 'map';
      if ($('gbrowse')) $('gbrowse').hidden = !isBrowse;
      $('gmap').hidden = !isMap;
      $('gstage').hidden = (isMap || isBrowse);
      var tDraw = performance.now();
      if (isBrowse) { renderBrowse(); }
      else if (!isMap) { fit(); buildScene(); }
      applyHash();
      var renderMs = Math.round(performance.now() - tDraw);
      var totalMs = Math.round(performance.now() - tBoot);
      window.__gPerf = { nodes: doc.nodes.length, edges: doc.edges.length, loadMs: Math.round(tData - tBoot), renderMs: renderMs, totalMs: totalMs };
      console.log('[graph] 首渲染 ' + doc.nodes.length + ' 节点 / ' + doc.edges.length + ' 边：总计 ' + totalMs + 'ms（取数 ' + Math.round(tData - tBoot) + 'ms + 布局渲染 ' + renderMs + 'ms），目标 <400ms');
      console.log('[graph] 350 节点估算依据：布局用空间网格把去重叠降到近 O(n)，轮数上限 240；实测入口 ?bench=350（临时补假节点跑同一条链路并打印耗时），默认不计入首渲染。');
      if (/[?&]bench=350\b/.test(location.search)) {
        try {
          var keepNodes = state.doc.nodes, pad = [];
          for (var bi = 0; keepNodes.length + pad.length < 350; bi++) {
            var bs = keepNodes[bi % keepNodes.length], bc = {};
            for (var bk in bs) if (Object.prototype.hasOwnProperty.call(bs, bk)) bc[bk] = bs[bk];
            bc.id = 'bench/' + bi; bc.name = bs.name + ' #' + bi; bc.type = 'tech';
            pad.push(bc);
          }
          state.doc.nodes = keepNodes.concat(pad);
          var tb = performance.now();
          buildScene();
          var benchMs = Math.round(performance.now() - tb);
          state.doc.nodes = keepNodes;
          buildScene();
          window.__gPerf350 = benchMs;
          console.log('[graph] 350 节点实测：临时补 ' + pad.length + ' 个假节点，跑同一条布局链路 ' + benchMs + 'ms（目标 <400ms）');
        } catch (e) { console.warn('[graph] 350 节点基准失败', e); }
      }
      var rt = null;
      function schedule() {
        clearTimeout(rt);
        rt = setTimeout(function () {
          if (!state.doc) return;
          // 只在「宽度」变化时重排。高度变化是本视图自己写 svg.style.height 造成的，
          // 若也触发重排就会 fit→写高度→ResizeObserver→fit 无限循环（页面一直闪）。
          var w = Math.round($('gstage').getBoundingClientRect().width || 0);
          if (w === state.w) return;
          var keep = state.selected;
          fit(); buildScene(); if (keep && nodeMap()[keep]) selectNode(keep, false);
        }, 140);
      }
      if (window.ResizeObserver) new ResizeObserver(schedule).observe($('gstage'));
      else window.addEventListener('resize', schedule);
    }).catch(function (err) {
      $('gloading').innerHTML = '<div><b>图谱加载失败</b><p>' + esc(err.message) + '</p><p>请刷新重试。</p></div>';
    });
  }
  boot();
})();
