const core = require('../../utils/core.js');
const PdfBuilder = require('../../utils/pdf.js');

const GRADE_NAMES = ['一年级', '二年级', '三年级', '四年级', '五年级', '自定义'];
const PRESETS = [
  { ops: ['add', 'sub'], dA: 1, dB: 1, count: 40, mode: 'horizontal', cols: 5 },
  { ops: ['add', 'sub', 'mul', 'div'], dA: 2, dB: 1, count: 48, mode: 'horizontal', cols: 4 },
  { ops: ['add', 'sub', 'mul', 'div'], dA: 3, dB: 2, count: 24, mode: 'vertical', cols: 4 },
  { ops: ['mul', 'div'], dA: 3, dB: 2, count: 20, mode: 'vertical', cols: 3 },
  { ops: ['mul', 'div'], dA: 4, dB: 2, count: 16, mode: 'vertical', cols: 2 },
  null
];

const OP_DEFS = [
  { key: 'add', name: '加法' },
  { key: 'sub', name: '减法' },
  { key: 'mul', name: '乘法' },
  { key: 'div', name: '除法' }
];

// 导出 DPI：300 更清晰但更耗内存，低端机可改 200
const EXPORT_DPI = 300;
// 预览 DPI
const PREVIEW_DPI = 96;

Page({
  data: {
    gradeNames: GRADE_NAMES,
    gradeIndex: 2,
    opList: OP_DEFS.map((o) => ({ ...o, on: true })),
    dA: 3,
    dB: 2,
    carry: true,
    remainder: false,
    counts: [20, 30, 40, 60, 100],
    count: 24,
    countInput: '',
    densityNames: ['紧凑', '标准', '宽松'],
    densityValues: [0.85, 1, 1.25],
    densityIndex: 1,
    title: '',
    mode: 'vertical',
    cols: 4,
    showHeader: true,
    showGuide: true,
    answers: false,
    pageCount: 0,
    questionCount: 0,
    previewUrl: '',
    previewPage: 0,
    files: [],
    busy: false,
    busyPdf: false,
    pdfPath: ''
  },

  onLoad() {
    this.doc = null;
    this._titleTimer = null;
    this.applyGrade(2);
  },

  onUnload() {
    if (this._titleTimer) clearTimeout(this._titleTimer);
  },

  /* -------------------- 配置 -------------------- */

  buildCfg() {
    const d = this.data;
    return {
      gradeLabel: GRADE_NAMES[d.gradeIndex] === '自定义' ? '' : GRADE_NAMES[d.gradeIndex],
      ops: d.opList.filter((o) => o.on).map((o) => o.key),
      dA: d.dA,
      dB: d.dB,
      carry: d.carry,
      remainder: d.remainder,
      count: d.count,
      mode: d.mode,
      cols: d.cols,
      density: d.densityValues[d.densityIndex],
      showHeader: d.showHeader,
      showGuide: d.showGuide,
      answers: d.answers,
      title: d.title
    };
  },

  // 选年级只是套用一套起始参数；之后改任何参数都不会把年级改回去
  applyGrade(idx) {
    const p = PRESETS[idx];
    if (!p) {
      // 显式选「自定义」：保留当前参数，只是不再显示年级前缀
      this.setData({ gradeIndex: idx });
      this.generate();
      return;
    }
    this.setData({
      gradeIndex: idx,
      opList: OP_DEFS.map((o) => ({ ...o, on: p.ops.indexOf(o.key) >= 0 })),
      dA: p.dA,
      dB: p.dB,
      count: p.count,
      countInput: '',
      mode: p.mode,
      cols: p.cols,
      densityIndex: 1
    });
    this.generate();
  },

  onGrade(e) {
    this.applyGrade(Number(e.detail.value));
  },

  toggleOp(e) {
    const key = e.currentTarget.dataset.key;
    const list = this.data.opList.map((o) => ({ ...o }));
    const target = list.find((o) => o.key === key);
    const onCount = list.filter((o) => o.on).length;
    if (target.on && onCount === 1) return; // 至少保留一种运算
    target.on = !target.on;
    this.setData({ opList: list });
    this.generate();
  },

  onDigitA(e) { this.setData({ dA: Number(e.detail.value) + 1 }); this.generate(); },
  onDigitB(e) { this.setData({ dB: Number(e.detail.value) + 1 }); this.generate(); },

  onCarry(e) { this.setData({ carry: e.detail.value }); this.generate(); },
  onRemainder(e) { this.setData({ remainder: e.detail.value }); this.generate(); },

  // picker 返回的是选中项索引，需映射为实际题量（改题量不影响已选年级）
  onCount(e) {
    const v = this.data.counts[Number(e.detail.value)];
    if (!v) return;
    this.setData({ count: v, countInput: '' });
    this.generate();
  },

  // 自定义题量输入（1–200），失焦/点确认时生效，避免每敲一个键就重排
  onCountInput(e) {
    const raw = parseInt(e.detail.value, 10);
    if (isNaN(raw)) return;
    const v = Math.max(1, Math.min(200, raw));
    this.setData({ count: v, countInput: String(v) });
    this.generate();
  },

  // 行间距：紧凑 / 标准 / 宽松
  onDensity(e) {
    const i = Number(e.detail.value);
    if (i === this.data.densityIndex) return;
    this.setData({ densityIndex: i });
    this.generate();
  },

  // 自定义标题（留空自动生成），输入防抖后重排
  onTitle(e) {
    const v = (e.detail.value || '').trim();
    this.setData({ title: v });
    if (this._titleTimer) clearTimeout(this._titleTimer);
    this._titleTimer = setTimeout(() => this.generate(), 400);
  },

  onMode(e) {
    const mode = e.currentTarget.dataset.v;
    const cols = mode === 'vertical' && this.data.cols > 4 ? 4 : this.data.cols;
    this.setData({ mode, cols });
    this.generate();
  },

  onCols(e) {
    const cols = Number(e.currentTarget.dataset.v);
    if (this.data.mode === 'vertical' && cols > 4) return;
    this.setData({ cols });
    this.generate();
  },

  onShowHeader(e) { this.setData({ showHeader: e.detail.value }); this.generate(); },
  onShowGuide(e) { this.setData({ showGuide: e.detail.value }); this.generate(); },
  onAnswers(e) { this.setData({ answers: e.detail.value }); this.generate(); },

  onSwitchPage(e) {
    const idx = Math.max(0, Math.min(this.doc.pages.length - 1, Number(e.currentTarget.dataset.i)));
    this.setData({ previewPage: idx });
    this.renderPreview(idx);
  },

  /* -------------------- 生成与绘制 -------------------- */

  generate() {
    try {
      this.doc = core.buildDoc(this.buildCfg());
      const qPages = this.doc.pages.filter((p) => p.type === 'questions').length;
      this.setData({
        pageCount: this.doc.pages.length,
        questionCount: this.doc.questions.length,
        previewPage: 0
      });
      this.renderPreview(0);
    } catch (err) {
      wx.showToast({ title: '生成失败：' + err.message, icon: 'none' });
    }
  },

  getCanvas() {
    return new Promise((resolve, reject) => {
      const q = wx.createSelectorQuery();
      q.select('#sheet')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (res && res[0] && res[0].node) resolve(res[0].node);
          else reject(new Error('canvas 未就绪'));
        });
    });
  },

  /** 把某一页画到导出画布并导出临时文件 */
  exportPage(pageIndex, dpi, fileType) {
    return this.getCanvas().then((canvas) => {
      const size = core.pixelSize(dpi);
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext('2d');
      core.renderPage(ctx, this.doc, this.doc.pages[pageIndex], size.scale);
      return new Promise((resolve, reject) => {
        wx.canvasToTempFilePath({
          canvas,
          x: 0,
          y: 0,
          width: size.width,
          height: size.height,
          destWidth: size.width,
          destHeight: size.height,
          fileType: fileType || 'png',
          quality: 90,
          success: (r) => resolve(r.tempFilePath),
          fail: reject
        }, this);
      });
    });
  },

  renderPreview(pageIndex) {
    this.exportPage(pageIndex, PREVIEW_DPI)
      .then((url) => this.setData({ previewUrl: url }))
      .catch(() => {
        // 个别机型 canvas 尺寸受限时降低预览精度重试
        this.exportPage(pageIndex, 72)
          .then((url) => this.setData({ previewUrl: url }))
          .catch(() => wx.showToast({ title: '预览失败', icon: 'none' }));
      });
  },

  /* -------------------- 输出 -------------------- */

  async saveToAlbum() {
    if (!this.doc || this.data.busy) return;
    this.setData({ busy: true });
    wx.showLoading({ title: '生成图片中…', mask: true });
    const files = [];
    try {
      for (let i = 0; i < this.doc.pages.length; i++) {
        const f = await this.exportPage(i, EXPORT_DPI);
        files.push(f);
      }
      const auth = await new Promise((resolve) => {
        wx.getSetting({
          success: (r) => resolve(r.authSetting['scope.writePhotosAlbum'] === false ? 'denied' : 'ok'),
          fail: () => resolve('ok')
        });
      });
      if (auth === 'denied') {
        await new Promise((resolve, reject) => {
          wx.authorize({ scope: 'scope.writePhotosAlbum', success: resolve, fail: reject });
        });
      }
      for (const f of files) {
        await new Promise((resolve, reject) => {
          wx.saveImageToPhotosAlbum({ filePath: f, success: resolve, fail: reject });
        });
      }
      this.setData({ files });
      wx.hideLoading();
      wx.showModal({
        title: '已保存到相册',
        content: '共 ' + files.length + ' 张 A4 图片（300DPI）。可在手机相册中查看，或用打印机厂商 App（HP Smart / Epson iPrint 等）选择同一 WiFi 打印机打印。',
        showCancel: false
      });
    } catch (err) {
      wx.hideLoading();
      const msg = err && err.errMsg ? err.errMsg : String(err);
      wx.showModal({
        title: '保存失败',
        content: msg.indexOf('auth') >= 0
          ? '需要在设置中允许「保存到相册」权限：右上角 … → 设置 → 保存到相册'
          : '部分手机导出大图可能内存不足，可把 utils/core.js 同目录 index.js 里的 EXPORT_DPI 改为 200 后重试。错误：' + msg,
        showCancel: false
      });
    } finally {
      this.setData({ busy: false });
    }
  },

  previewImages() {
    if (this.data.files.length) {
      wx.previewImage({ urls: this.data.files });
    } else if (this.data.previewUrl) {
      wx.previewImage({ urls: [this.data.previewUrl] });
    }
  },

  /** 导出多页 A4 PDF 并打开预览（预览里可"用其他应用打开"交给打印机 App） */
  async exportPdf() {
    if (!this.doc || this.data.busyPdf) return;
    this.setData({ busyPdf: true });
    wx.showLoading({ title: '生成 PDF 中…', mask: true });
    try {
      const fs = wx.getFileSystemManager();
      const pages = [];
      for (let i = 0; i < this.doc.pages.length; i++) {
        const tmp = await this.exportPage(i, EXPORT_DPI, 'jpg');
        const buf = fs.readFileSync(tmp);
        pages.push({
          jpeg: new Uint8Array(buf),
          width: Math.round(210 / 25.4 * EXPORT_DPI),
          height: Math.round(297 / 25.4 * EXPORT_DPI)
        });
      }
      const bytes = PdfBuilder.build(pages);
      const pdfPath = wx.env.USER_DATA_PATH + '/练习纸-' + this.doc.questions.length + '题.pdf';
      fs.writeFileSync(pdfPath, bytes.buffer, 'binary');
      this.setData({ pdfPath });
      wx.hideLoading();
      wx.openDocument({
        filePath: pdfPath,
        fileType: 'pdf',
        showMenu: true,
        fail: () => wx.showToast({ title: 'PDF 已生成，但预览失败', icon: 'none' })
      });
    } catch (err) {
      wx.hideLoading();
      const msg = err && err.errMsg ? err.errMsg : String(err);
      wx.showModal({
        title: 'PDF 生成失败',
        content: '部分手机导出大图可能内存不足，可把 index.js 里的 EXPORT_DPI 改为 200 后重试。错误：' + msg,
        showCancel: false
      });
    } finally {
      this.setData({ busyPdf: false });
    }
  },

  /** 把 PDF 通过微信会话发给朋友 / 文件传输助手（可在电脑端微信打开打印） */
  sharePdf() {
    const p = this.data.pdfPath;
    if (!p) return;
    wx.shareFileMessage({
      filePath: p,
      fileName: '练习纸-' + this.doc.questions.length + '题.pdf',
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') < 0) {
          wx.showToast({ title: '转发失败', icon: 'none' });
        }
      }
    });
  },

  showPrintHelp() {
    wx.showModal({
      title: '怎么连 WiFi 打印机',
      content:
        '小程序无法直接向打印机发送数据，推荐三条路：\n' +
        '1. 导出 PDF → 转发给「文件传输助手」，在电脑微信打开 → 直接打印到同 WiFi 打印机（推荐）；\n' +
        '2. 保存 A4 图片到相册，用打印机厂商 App（HP Smart、Epson iPrint 等）选同 WiFi 打印机打印；\n' +
        '3. 用手机/电脑浏览器打开 index.html，点「打印」直连 WiFi 打印机。',
      showCancel: false
    });
  }
});
