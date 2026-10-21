/*!
 * MathSheet v1.0 — A4 练习纸核心库
 * 负责：按位数/题型随机出题 + 按 A4(210x297mm) 在 Canvas 上绘制排版
 * 浏览器: <script src="core.js"> 之后使用 window.MathSheet
 * 小程序: const core = require('../../utils/core.js')
 *
 * 注意：本文件是唯一核心实现，小程序目录里的副本由 `cp core.js miniprogram/utils/core.js` 同步
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MathSheet = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PAGE_W = 210; // mm
  var PAGE_H = 297; // mm
  var MM_PER_INCH = 25.4;

  var FONT_STACK = [
    '"PingFang SC"',
    '"Hiragino Sans GB"',
    '"Microsoft YaHei"',
    '"Noto Sans SC"',
    '"Source Han Sans SC"',
    '"Heiti SC"',
    'system-ui',
    'sans-serif'
  ].join(',');

  var OPS = {
    add: { sym: '+', name: '加法' },
    sub: { sym: '-', name: '减法' },
    mul: { sym: '×', name: '乘法' },
    div: { sym: '÷', name: '除法' }
  };

  /* ------------------------------------------------------------------ */
  /* 小工具                                                              */
  /* ------------------------------------------------------------------ */

  function ri(a, b) {
    return a + Math.floor(Math.random() * (b - a + 1));
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = ri(0, i);
      var t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function nd(n) {
    return String(Math.abs(Math.floor(n))).length;
  }

  function rangeOfDigits(d) {
    d = Math.max(1, d | 0);
    var lo = d <= 1 ? 1 : Math.pow(10, d - 1);
    var hi = Math.pow(10, d) - 1;
    return [lo, hi];
  }

  function hasCarryAdd(a, b) {
    while (a > 0 || b > 0) {
      if ((a % 10) + (b % 10) > 9) return true;
      a = Math.floor(a / 10);
      b = Math.floor(b / 10);
    }
    return false;
  }

  function hasBorrowSub(a, b) {
    while (b > 0) {
      if (a % 10 < b % 10) return true;
      a = Math.floor(a / 10);
      b = Math.floor(b / 10);
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* 出题                                                                */
  /* ------------------------------------------------------------------ */

  function makeAdd(cfg) {
    var A = rangeOfDigits(cfg.dA);
    var B = rangeOfDigits(cfg.dB);
    var a, b, i;
    for (i = 0; i < 800; i++) {
      a = ri(A[0], A[1]);
      b = ri(B[0], B[1]);
      if (!cfg.carry && hasCarryAdd(a, b)) continue;
      return { a: a, b: b, ans: a + b };
    }
    return { a: ri(A[0], A[1]), b: ri(B[0], B[1]), ans: 0, _fallback: true };
  }

  function makeSub(cfg) {
    var dA = cfg.dA;
    var dB = Math.min(cfg.dB, dA); // 减数位数不超过被减数
    var A = rangeOfDigits(dA);
    var B = rangeOfDigits(dB);
    var a, b, i;
    for (i = 0; i < 1200; i++) {
      a = ri(A[0], A[1]);
      b = ri(B[0], B[1]);
      if (a <= b) continue;
      if (!cfg.carry && hasBorrowSub(a, b)) continue;
      return { a: a, b: b, ans: a - b };
    }
    a = ri(Math.max(A[0], B[1] + 1), A[1]);
    b = ri(B[0], Math.min(B[1], a - 1));
    return { a: a, b: b, ans: a - b };
  }

  function makeMul(cfg) {
    var A = rangeOfDigits(cfg.dA);
    var B = rangeOfDigits(cfg.dB);
    var a = ri(cfg.dA === 1 ? Math.max(2, A[0]) : A[0], A[1]);
    var b = ri(cfg.dB === 1 ? Math.max(2, B[0]) : B[0], B[1]);
    return { a: a, b: b, ans: a * b };
  }

  function makeDiv(cfg) {
    var dB = Math.min(cfg.dB, cfg.dA);
    var B = rangeOfDigits(dB);
    var A = rangeOfDigits(cfg.dA);
    var bLo = dB === 1 ? 2 : B[0];
    var i, b, q0, q1, q, a, r;
    for (i = 0; i < 900; i++) {
      b = ri(bLo, B[1]);
      q0 = Math.max(2, Math.ceil(A[0] / b));
      q1 = Math.floor(A[1] / b);
      if (q1 < q0) continue;
      q = ri(q0, q1);
      r = 0;
      if (cfg.remainder) {
        r = ri(1, b - 1);
        a = b * q + r;
        if (nd(a) !== cfg.dA) continue;
      } else {
        a = b * q;
        if (nd(a) !== cfg.dA) continue;
      }
      return {
        a: a,
        b: b,
        q: q,
        r: r,
        ans: cfg.remainder ? q + '……' + r : q,
        _rem: cfg.remainder
      };
    }
    // 兜底：凑一个必定合法的整除题
    b = ri(Math.max(2, B[0]), B[1]);
    q = Math.max(2, Math.floor(A[1] / b));
    a = b * q;
    return { a: a, b: b, q: q, r: 0, ans: q };
  }

  function makeOne(op, cfg) {
    if (op === 'add') return makeAdd(cfg);
    if (op === 'sub') return makeSub(cfg);
    if (op === 'mul') return makeMul(cfg);
    if (op === 'div') return makeDiv(cfg);
    return makeAdd(cfg);
  }

  function formatQuestion(raw, op, no) {
    return {
      no: no,
      a: raw.a,
      b: raw.b,
      op: op,
      text: raw.a + ' ' + OPS[op].sym + ' ' + raw.b + ' =',
      answer: String(raw.ans)
    };
  }

  /** 生成题目列表：题型均匀轮转 + 去重 */
  function generate(cfg) {
    var ops = cfg.ops && cfg.ops.length ? cfg.ops : ['add'];
    var out = [];
    var seen = {};
    var queue = [];
    var guard = 0;
    var limit = Math.max(200, cfg.count * 120);

    while (out.length < cfg.count && guard < limit) {
      guard++;
      if (!queue.length) queue = shuffle(ops.slice());
      var op = queue.pop();
      var raw = makeOne(op, cfg);
      var key = raw.a + '|' + op + '|' + raw.b;
      if (seen[key]) continue;
      seen[key] = 1;
      out.push(formatQuestion(raw, op, out.length + 1));
    }
    // 极端情况下（位数组合导致可选空间很小）放宽去重
    var safety = 0;
    while (out.length < cfg.count && safety < cfg.count * 5) {
      safety++;
      var o = ops[ri(0, ops.length - 1)];
      out.push(formatQuestion(makeOne(o, cfg), o, out.length + 1));
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* 版式计算                                                            */
  /* ------------------------------------------------------------------ */

  function normalize(input) {
    var cfg = {
      gradeLabel: '',
      ops: ['add'],
      dA: 2,
      dB: 1,
      carry: true,
      remainder: false,
      count: 40,
      mode: 'horizontal',
      cols: 4,
      density: 1,
      showHeader: true,
      showGuide: true,
      title: '',
      answers: false
    };
    if (input) {
      for (var k in input) {
        if (Object.prototype.hasOwnProperty.call(input, k)) cfg[k] = input[k];
      }
    }
    var ops = [];
    (cfg.ops || []).forEach(function (o) {
      if (OPS[o]) ops.push(o);
    });
    cfg.ops = ops.length ? ops : ['add'];
    cfg.count = clamp(Math.round(cfg.count || 40), 1, 200);
    cfg.dA = clamp(Math.round(cfg.dA || 2), 1, 4);
    cfg.dB = clamp(Math.round(cfg.dB || 1), 1, 4);
    var maxCols = cfg.mode === 'vertical' ? 4 : 5;
    cfg.cols = clamp(Math.round(cfg.cols || 4), 1, maxCols);
    cfg.density = clamp(Number(cfg.density) || 1, 0.7, 1.6);
    return cfg;
  }

  function defaultTitle(cfg) {
    var prefix = cfg.gradeLabel ? cfg.gradeLabel + ' ' : '';
    return prefix + (cfg.mode === 'vertical' ? '竖式计算练习' : '口算练习');
  }

  function buildDoc(input) {
    var cfg = normalize(input);
    var questions = generate(cfg);

    var ml = 14;
    var mr = 14;
    var mt = 12;
    var mb = 12;
    var usableW = PAGE_W - ml - mr;
    var usableH = PAGE_H - mt - mb;
    var headerH = cfg.showHeader ? 28 : 3;
    var footerH = 8;
    var gridH = usableH - headerH - footerH;

    var isV = cfg.mode === 'vertical';
    var baseRowH = (isV ? 28 : 12.5) * cfg.density;
    var rowsPerPage = Math.max(1, Math.floor(gridH / baseRowH));
    var totalRows = Math.ceil(questions.length / cfg.cols);

    var pages = [];
    var pageCount = Math.max(1, Math.ceil(totalRows / rowsPerPage));
    for (var i = 0; i < pageCount; i++) {
      var rows = Math.min(rowsPerPage, totalRows - i * rowsPerPage);
      pages.push({
        type: 'questions',
        index: pages.length,
        startRow: i * rowsPerPage,
        rows: rows,
        cols: cfg.cols,
        rowH: Math.min(gridH / rows, baseRowH * 1.9)
      });
    }

    if (cfg.answers) {
      var aCols = 4;
      var aRowH = 9.5;
      var aRowsPerPage = Math.max(1, Math.floor(gridH / aRowH));
      var aTotalRows = Math.ceil(questions.length / aCols);
      var aPages = Math.max(1, Math.ceil(aTotalRows / aRowsPerPage));
      for (var j = 0; j < aPages; j++) {
        var aRows = Math.min(aRowsPerPage, aTotalRows - j * aRowsPerPage);
        pages.push({
          type: 'answers',
          index: pages.length,
          startRow: j * aRowsPerPage,
          rows: aRows,
          cols: aCols,
          rowH: Math.min(gridH / aRows, aRowH * 1.6)
        });
      }
    }

    return {
      cfg: cfg,
      questions: questions,
      pages: pages,
      metrics: {
        ml: ml,
        mr: mr,
        mt: mt,
        mb: mb,
        usableW: usableW,
        usableH: usableH,
        headerH: headerH,
        footerH: footerH,
        gridH: gridH,
        baseRowH: baseRowH
      }
    };
  }

  /** 按 DPI 返回 A4 画布像素尺寸 */
  function pixelSize(dpi) {
    var s = dpi / MM_PER_INCH;
    return { width: Math.round(PAGE_W * s), height: Math.round(PAGE_H * s), scale: s };
  }

  /* ------------------------------------------------------------------ */
  /* 绘制                                                                */
  /* ------------------------------------------------------------------ */

  function renderPage(ctx, doc, page, scale) {
    var cfg = doc.cfg;
    var m = doc.metrics;
    var S = scale;

    function mm(v) {
      return v * S;
    }
    function font(size, weight) {
      return (weight || 400) + ' ' + mm(size).toFixed(2) + 'px ' + FONT_STACK;
    }

    // 纸张
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, mm(PAGE_W), mm(PAGE_H));
    ctx.textBaseline = 'alphabetic';

    /* ---------------- 页眉 ---------------- */
    if (cfg.showHeader) {
      var title = page.type === 'answers' ? '参考答案' : cfg.title || defaultTitle(cfg);
      ctx.textAlign = 'left';
      ctx.font = font(6.4, 700);
      ctx.fillStyle = '#111827';
      ctx.fillText(title, mm(m.ml), mm(m.mt + 6.8));

      ctx.textAlign = 'right';
      ctx.font = font(3.9, 400);
      ctx.fillStyle = '#6b7280';
      ctx.fillText('共 ' + doc.questions.length + ' 题', mm(PAGE_W - m.mr), mm(m.mt + 6.4));

      if (page.type === 'questions') {
        // 姓名 / 日期 / 用时 / 得分
        var items = [
        { label: '姓名', w: 0.28 },
        { label: '日期', w: 0.3 },
        { label: '用时', w: 0.2 },
        { label: '得分', w: 0.22 }
      ];
      var gap = 3.2;
      var total = m.usableW - gap * (items.length - 1);
      var x = m.ml;
      var iy = m.mt + 18.4;

      ctx.font = font(3.7, 400);
      ctx.textAlign = 'left';
      for (var k = 0; k < items.length; k++) {
        var it = items[k];
        var w = total * it.w;
        ctx.fillStyle = '#4b5563';
        ctx.fillText(it.label, mm(x), mm(iy));
        var lw = ctx.measureText(it.label).width / S;
        var lineX = x + lw + 1.2;
        var lineW = Math.max(2, w - lw - 1.2);
        ctx.strokeStyle = '#c3cad6';
        ctx.lineWidth = mm(0.26);
        ctx.beginPath();
        ctx.moveTo(mm(lineX), mm(iy + 1));
        ctx.lineTo(mm(lineX + lineW), mm(iy + 1));
        ctx.stroke();
        x += w + gap;
      }
      }

      // 分隔线
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = mm(0.3);
      ctx.beginPath();
      ctx.moveTo(mm(m.ml), mm(m.mt + m.headerH - 2.6));
      ctx.lineTo(mm(PAGE_W - m.mr), mm(m.mt + m.headerH - 2.6));
      ctx.stroke();
    }

    /* ---------------- 题面 ---------------- */
    var gx = m.ml;
    var gy = m.mt + m.headerH;
    var colW = m.usableW / page.cols;
    var rowH = page.rowH;

    if (page.type === 'questions') {
      var isV = cfg.mode === 'vertical';
      var baseFont = isV
        ? clamp(rowH * 0.27, 4.4, 5.8)
        : clamp(rowH * 0.44, 3.8, 6.2);
      var padX = 4.2;

      for (var r = 0; r < page.rows; r++) {
        for (var c = 0; c < page.cols; c++) {
          var idx = (page.startRow + r) * page.cols + c;
          if (idx >= doc.questions.length) break;
          var q = doc.questions[idx];
          var cx = gx + c * colW;
          var cy = gy + r * rowH;

          var fz = baseFont;
          var numFz = fz * 0.58;
          var label = q.no + '.';

          ctx.font = font(numFz, 400);
          var labelW = ctx.measureText(label).width / S;
          ctx.font = font(fz, 500);
          var textW = ctx.measureText(q.text).width / S;
          var maxW = colW - padX * 2 - labelW - 2;
          while (textW > maxW && fz > 3.2) {
            fz -= 0.15;
            ctx.font = font(fz, 500);
            textW = ctx.measureText(q.text).width / S;
          }

          var ty = isV ? cy + rowH * 0.29 : cy + rowH * 0.63;
          if (ty < cy + fz) ty = cy + fz * 1.2;

          ctx.textAlign = 'left';
          ctx.fillStyle = '#b0b7c3';
          ctx.font = font(numFz, 400);
          ctx.fillText(label, mm(cx + padX), mm(ty));

          ctx.fillStyle = '#111827';
          ctx.font = font(fz, 500);
          ctx.fillText(q.text, mm(cx + padX + labelW + 2), mm(ty));

          // 竖式留白书写区
          if (isV && cfg.showGuide) {
            var top = cy + Math.max(rowH * 0.4, ty - cy + 4);
            var bottom = cy + rowH - 3.4;
            if (bottom - top > 6) {
              ctx.save();
              ctx.setLineDash([mm(1.7), mm(1.5)]);
              ctx.lineWidth = mm(0.22);
              ctx.strokeStyle = '#d6dbe4';
              ctx.strokeRect(
                mm(cx + padX),
                mm(top),
                mm(colW - padX * 2),
                mm(bottom - top)
              );
              ctx.restore();
            }
          }
        }
      }
    }

    if (page.type === 'answers') {
      for (var ar = 0; ar < page.rows; ar++) {
        for (var ac = 0; ac < page.cols; ac++) {
          var aidx = (page.startRow + ar) * page.cols + ac;
          if (aidx >= doc.questions.length) break;
          var aq = doc.questions[aidx];
          var ax = gx + ac * colW;
          var ay = gy + ar * rowH;
          ctx.textAlign = 'left';
          ctx.font = font(3.5, 400);
          ctx.fillStyle = '#9ca3af';
          var nw = ctx.measureText(aq.no + '.').width / S;
          ctx.fillText(aq.no + '.', mm(ax + 4), mm(ay + rowH * 0.62));
          ctx.font = font(4.1, 500);
          ctx.fillStyle = '#111827';
          ctx.fillText(aq.answer, mm(ax + 4 + nw + 1.6), mm(ay + rowH * 0.62));
        }
      }
    }

    /* ---------------- 页脚 ---------------- */
    if (doc.pages.length > 1) {
      ctx.textAlign = 'center';
      ctx.font = font(3.3, 400);
      ctx.fillStyle = '#9ca3af';
      ctx.fillText(
        '第 ' + (page.index + 1) + ' / ' + doc.pages.length + ' 页',
        mm(PAGE_W / 2),
        mm(PAGE_H - m.mb - 1.6)
      );
    }

    ctx.restore();
  }

  return {
    PAGE_W: PAGE_W,
    PAGE_H: PAGE_H,
    MM_PER_INCH: MM_PER_INCH,
    OPS: OPS,
    FONT_STACK: FONT_STACK,
    normalize: normalize,
    generate: generate,
    buildDoc: buildDoc,
    renderPage: renderPage,
    defaultTitle: defaultTitle,
    pixelSize: pixelSize,
    rangeOfDigits: rangeOfDigits
  };
});
