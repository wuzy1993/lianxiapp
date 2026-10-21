/*!
 * PdfBuilder v1.0 — 极简 A4 PDF 生成器（无依赖）
 * 把每页的一张 JPEG 图封装成 A4 页面的 PDF（DCTDecode 直嵌，不重复压缩）
 *
 * 浏览器: <script src="pdf.js"> → window.PdfBuilder
 * 小程序: const PdfBuilder = require('../../utils/pdf.js')
 *
 * build([{ jpeg: Uint8Array, width, height }]) → Uint8Array(PDF 字节流)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PdfBuilder = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var A4_W = 595.28; // 210mm @72dpi
  var A4_H = 841.89; // 297mm @72dpi

  function latin1(str) {
    var out = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
    return out;
  }

  function concat(chunks, total) {
    var out = new Uint8Array(total);
    var pos = 0;
    for (var i = 0; i < chunks.length; i++) {
      out.set(chunks[i], pos);
      pos += chunks[i].length;
    }
    return out;
  }

  function pad10(n) {
    var s = String(n);
    while (s.length < 10) s = '0' + s;
    return s;
  }

  function build(pages) {
    if (!pages || !pages.length) throw new Error('没有可导出的页面');

    var chunks = [];
    var length = 0;
    var offsets = [];

    function put(data) {
      var bytes = typeof data === 'string' ? latin1(data) : data;
      chunks.push(bytes);
      length += bytes.length;
    }

    put('%PDF-1.4\n%\u00E2\u00E3\u00CF\u00D3\n');

    // 1: 目录
    offsets[1] = length;
    put('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    // 2: 页面树
    var kids = [];
    for (var i = 0; i < pages.length; i++) kids.push((3 + i * 3) + ' 0 R');
    offsets[2] = length;
    put('2 0 obj\n<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + pages.length + ' >>\nendobj\n');

    for (var j = 0; j < pages.length; j++) {
      var pageNum = 3 + j * 3;
      var imgNum = pageNum + 1;
      var contentNum = pageNum + 2;
      var pg = pages[j];

      offsets[pageNum] = length;
      put(pageNum + ' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + A4_W + ' ' + A4_H + '] ' +
        '/Resources << /XObject << /Im0 ' + imgNum + ' 0 R >> >> /Contents ' + contentNum + ' 0 R >>\nendobj\n');

      offsets[imgNum] = length;
      put(imgNum + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + pg.width + ' /Height ' + pg.height +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + pg.jpeg.length + ' >>\nstream\n');
      put(pg.jpeg);
      put('\nendstream\nendobj\n');

      var content = 'q\n' + A4_W + ' 0 0 ' + A4_H + ' 0 0 cm\n/Im0 Do\nQ\n';
      offsets[contentNum] = length;
      put(contentNum + ' 0 obj\n<< /Length ' + content.length + ' >>\nstream\n' + content + 'endstream\nendobj\n');
    }

    var total = 2 + pages.length * 3;
    var xrefPos = length;
    var xref = 'xref\n0 ' + (total + 1) + '\n0000000000 65535 f \n';
    for (var k = 1; k <= total; k++) {
      xref += pad10(offsets[k]) + ' 00000 n \n';
    }
    put(xref);
    put('trailer\n<< /Size ' + (total + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF\n');

    return concat(chunks, length);
  }

  /* ---------- 浏览器辅助 ---------- */

  /** Canvas → JPEG 字节 */
  function jpegBytesFromCanvas(canvas, quality) {
    var url = canvas.toDataURL('image/jpeg', quality || 0.92);
    var b64 = url.substring(url.indexOf(',') + 1);
    var bin = atob(b64);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  /** 触发下载 */
  function download(bytes, filename) {
    var blob = new Blob([bytes], { type: 'application/pdf' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 600);
  }

  return {
    A4_W: A4_W,
    A4_H: A4_H,
    build: build,
    jpegBytesFromCanvas: jpegBytesFromCanvas,
    download: download
  };
});
