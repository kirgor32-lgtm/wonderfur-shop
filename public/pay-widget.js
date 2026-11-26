/*! pay-widget v1.0.0 | embeddable payment widget (SBP + cards) | built 2026-11-26 */
(function (global) {
'use strict';
// ---- src/qr.js ----
/* ---------------------------------------------------------------------------
 * Built-in QR code generator (byte mode, error correction level M).
 * No external APIs: the payment link never leaves the browser.
 * ------------------------------------------------------------------------- */
var QR = (function () {
  // Error correction level M tables, index = version (1..40)
  var ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
    26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
  var NUM_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16,
    17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
  var FORMAT_BITS_M = 0;

  function utf8Bytes(str) {
    var s = unescape(encodeURIComponent(str));
    var out = [];
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  function numRawDataModules(ver) {
    var result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }

  function numDataCodewords(ver) {
    return Math.floor(numRawDataModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];
  }

  function rsMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xff;
  }

  function rsDivisor(degree) {
    var result = [];
    for (var i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    var root = 1;
    for (var k = 0; k < degree; k++) {
      for (var j = 0; j < result.length; j++) {
        result[j] = rsMul(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = rsMul(root, 2);
    }
    return result;
  }

  function rsRemainder(data, divisor) {
    var result = divisor.map(function () { return 0; });
    for (var i = 0; i < data.length; i++) {
      var factor = data[i] ^ result.shift();
      result.push(0);
      for (var j = 0; j < divisor.length; j++) result[j] ^= rsMul(divisor[j], factor);
    }
    return result;
  }

  function addEccAndInterleave(data, ver) {
    var numBlocks = NUM_BLOCKS[ver];
    var blockEccLen = ECC_PER_BLOCK[ver];
    var rawCodewords = Math.floor(numRawDataModules(ver) / 8);
    var numShortBlocks = numBlocks - (rawCodewords % numBlocks);
    var shortBlockLen = Math.floor(rawCodewords / numBlocks);
    var blocks = [];
    var divisor = rsDivisor(blockEccLen);
    for (var i = 0, k = 0; i < numBlocks; i++) {
      var dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
      k += dat.length;
      var ecc = rsRemainder(dat, divisor);
      if (i < numShortBlocks) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var result = [];
    for (var c = 0; c < blocks[0].length; c++) {
      for (var b = 0; b < blocks.length; b++) {
        if (c !== shortBlockLen - blockEccLen || b >= numShortBlocks) result.push(blocks[b][c]);
      }
    }
    return result;
  }

  function alignmentPositions(ver, size) {
    if (ver === 1) return [];
    var numAlign = Math.floor(ver / 7) + 2;
    var step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
    var result = [6];
    for (var pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  function maskBit(mask, x, y) {
    switch (mask) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
      case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
      default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    }
  }

  function penalty(m, size) {
    var result = 0, x, y, run, color, dark = 0;
    var rows = [];
    for (y = 0; y < size; y++) {
      var row = '', col = '';
      for (x = 0; x < size; x++) {
        row += m[y][x] ? '1' : '0';
        col += m[x][y] ? '1' : '0';
        if (m[y][x]) dark++;
      }
      rows.push(row, col);
    }
    // Rule 1: runs of 5+ same-colored modules; Rule 3: finder-like patterns
    for (var i = 0; i < rows.length; i++) {
      var line = rows[i];
      run = 1; color = line[0];
      for (x = 1; x <= size; x++) {
        if (x < size && line[x] === color) { run++; continue; }
        if (run >= 5) result += 3 + (run - 5);
        color = line[x]; run = 1;
      }
      var idx = -1;
      while ((idx = line.indexOf('10111010000', idx + 1)) !== -1) result += 40;
      idx = -1;
      while ((idx = line.indexOf('00001011101', idx + 1)) !== -1) result += 40;
    }
    // Rule 2: 2x2 blocks of one color
    for (y = 0; y < size - 1; y++) {
      for (x = 0; x < size - 1; x++) {
        var c = m[y][x];
        if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) result += 3;
      }
    }
    // Rule 4: dark/light balance
    var total = size * size;
    var k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += Math.max(k, 0) * 10;
    return result;
  }

  /** Returns { size, modules: boolean[][] } (modules[y][x] === true means dark). */
  function encode(text) {
    var bytes = utf8Bytes(text);
    var ver, capacityBits = 0;
    for (ver = 1; ver <= 40; ver++) {
      capacityBits = numDataCodewords(ver) * 8;
      var needed = 4 + (ver < 10 ? 8 : 16) + bytes.length * 8;
      if (needed <= capacityBits) break;
    }
    if (ver > 40) throw new Error('QR: data too long');

    var bits = [];
    function push(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    push(4, 4); // byte mode
    push(bytes.length, ver < 10 ? 8 : 16);
    for (var b = 0; b < bytes.length; b++) push(bytes[b], 8);
    push(0, Math.min(4, capacityBits - bits.length));
    push(0, (8 - (bits.length % 8)) % 8);
    for (var pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) push(pad, 8);

    var dataCodewords = [];
    for (var i = 0; i < bits.length; i += 8) {
      var v = 0;
      for (var j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
      dataCodewords.push(v);
    }
    var all = addEccAndInterleave(dataCodewords, ver);

    var size = ver * 4 + 17;
    var modules = [], isFn = [];
    for (var y = 0; y < size; y++) {
      modules.push(new Array(size).fill(false));
      isFn.push(new Array(size).fill(false));
    }
    function setFn(x, y, dark) { modules[y][x] = !!dark; isFn[y][x] = true; }

    function drawFinder(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) {
        for (var dx = -4; dx <= 4; dx++) {
          var dist = Math.max(Math.abs(dx), Math.abs(dy));
          var xx = cx + dx, yy = cy + dy;
          if (xx >= 0 && xx < size && yy >= 0 && yy < size) setFn(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
    function drawAlignment(cx, cy) {
      for (var dy = -2; dy <= 2; dy++) {
        for (var dx = -2; dx <= 2; dx++) setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
    function drawFormat(mask) {
      var data = (FORMAT_BITS_M << 3) | mask;
      var rem = data;
      for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var fb = ((data << 10) | rem) ^ 0x5412;
      function bit(n) { return ((fb >>> n) & 1) !== 0; }
      for (i = 0; i <= 5; i++) setFn(8, i, bit(i));
      setFn(8, 7, bit(6));
      setFn(8, 8, bit(7));
      setFn(7, 8, bit(8));
      for (i = 9; i < 15; i++) setFn(14 - i, 8, bit(i));
      for (i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(i));
      for (i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(i));
      setFn(8, size - 8, true);
    }
    function drawVersion() {
      if (ver < 7) return;
      var rem = ver;
      for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      var vb = (ver << 12) | rem;
      for (i = 0; i < 18; i++) {
        var dark = ((vb >>> i) & 1) !== 0;
        var a = size - 11 + (i % 3), bb = Math.floor(i / 3);
        setFn(a, bb, dark);
        setFn(bb, a, dark);
      }
    }

    // Function patterns
    for (i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
    drawFinder(3, 3); drawFinder(size - 4, 3); drawFinder(3, size - 4);
    var ap = alignmentPositions(ver, size), n = ap.length;
    for (i = 0; i < n; i++) {
      for (j = 0; j < n; j++) {
        if (!((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0))) drawAlignment(ap[i], ap[j]);
      }
    }
    drawFormat(0);
    drawVersion();

    // Data codewords in zigzag order
    var bitIdx = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (j = 0; j < 2; j++) {
          var x = right - j;
          var upward = ((right + 1) & 2) === 0;
          var yy = upward ? size - 1 - vert : vert;
          if (!isFn[yy][x] && bitIdx < all.length * 8) {
            modules[yy][x] = ((all[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) !== 0;
            bitIdx++;
          }
        }
      }
    }

    function applyMask(mask) {
      for (var y = 0; y < size; y++) {
        for (var x = 0; x < size; x++) {
          if (!isFn[y][x] && maskBit(mask, x, y)) modules[y][x] = !modules[y][x];
        }
      }
    }

    var best = 0, bestScore = Infinity;
    for (var mask = 0; mask < 8; mask++) {
      applyMask(mask);
      drawFormat(mask);
      var score = penalty(modules, size);
      if (score < bestScore) { bestScore = score; best = mask; }
      applyMask(mask); // undo (XOR)
    }
    applyMask(best);
    drawFormat(best);

    return { size: size, version: ver, modules: modules };
  }

  /** Renders the code as a crisp inline SVG string. */
  function toSvg(text, opts) {
    opts = opts || {};
    var qr = encode(text);
    var quiet = opts.quiet == null ? 4 : opts.quiet;
    var dim = qr.size + quiet * 2;
    var d = '';
    for (var y = 0; y < qr.size; y++) {
      var x = 0;
      while (x < qr.size) {
        if (!qr.modules[y][x]) { x++; continue; }
        var start = x;
        while (x < qr.size && qr.modules[y][x]) x++;
        d += 'M' + (start + quiet) + ' ' + (y + quiet) + 'h' + (x - start) + 'v1h-' + (x - start) + 'z';
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + ' ' + dim + '" shape-rendering="crispEdges" role="img" aria-label="QR-код для оплаты">' +
      '<rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }

  return { encode: encode, toSvg: toSvg };
})();

// ---- src/util.js ----
/* ---------------------------------------------------------------------------
 * Small helpers: formatting, device detection, card checks.
 * ------------------------------------------------------------------------- */
var NBSP = '\u00A0';
var CURRENCY_SIGNS = { RUB: '₽', USD: '$', EUR: '€' };

/** 1065 -> "1 065 ₽", 1065.5 -> "1 065,50 ₽" (non-breaking spaces between digit groups). */
function formatAmount(amount, currency) {
  var kopecks = Math.round(Number(amount) * 100);
  if (!isFinite(kopecks)) kopecks = 0;
  var rub = Math.floor(kopecks / 100);
  var kop = kopecks % 100;
  var s = String(rub).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  if (kop) s += ',' + (kop < 10 ? '0' : '') + kop;
  return s + NBSP + (CURRENCY_SIGNS[currency || 'RUB'] || currency);
}

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  var a = new Uint8Array(16);
  (window.crypto || window.msCrypto).getRandomValues(a);
  a[6] = (a[6] & 0x0f) | 0x40;
  a[8] = (a[8] & 0x3f) | 0x80;
  var h = Array.prototype.map.call(a, function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
}

/**
 * Phone or computer? Uses userAgent + touch support + screen width.
 * We never try to detect which bank apps are installed: a web page cannot know that.
 */
function detectDevice() {
  var ua = navigator.userAgent || '';
  var touch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
  var narrow = Math.min(window.innerWidth || 9999, (window.screen && screen.width) || 9999) <= 820;
  var mobileUa = /Android|iPhone|iPod|iPad|Windows Phone|Mobile|HarmonyOS/i.test(ua);
  var iPadDesktopUa = /Macintosh/i.test(ua) && touch; // iPadOS pretends to be a Mac
  if (mobileUa || iPadDesktopUa) return 'mobile';
  if (touch && narrow) return 'mobile';
  return 'desktop';
}

function onlyDigits(s) { return String(s || '').replace(/\D/g, ''); }

function luhnValid(number) {
  var digits = onlyDigits(number);
  if (digits.length < 13 || digits.length > 19) return false;
  var sum = 0, dbl = false;
  for (var i = digits.length - 1; i >= 0; i--) {
    var d = digits.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

/** Returns 'mir' | 'visa' | 'mastercard' | '' by the first digits. */
function cardBrand(number) {
  var d = onlyDigits(number);
  if (!d) return '';
  var p4 = parseInt(d.slice(0, 4), 10);
  var p2 = parseInt(d.slice(0, 2), 10);
  if (d.length >= 4 && p4 >= 2200 && p4 <= 2204) return 'mir';
  if (d.charAt(0) === '4') return 'visa';
  if (p2 >= 51 && p2 <= 55) return 'mastercard';
  if (d.length >= 4 && p4 >= 2221 && p4 <= 2720) return 'mastercard';
  return '';
}

var BRAND_NAMES = { mir: 'Мир', visa: 'Visa', mastercard: 'Mastercard' };
function brandName(brand) { return BRAND_NAMES[brand] || 'Карта'; }

function formatCardNumber(value) {
  return onlyDigits(value).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');
}

function formatExpiry(value) {
  var d = onlyDigits(value).slice(0, 4);
  if (d.length === 1 && d > '1') d = '0' + d;
  return d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d;
}

/** Validates "MM/YY"; returns { month, year } or null. */
function parseExpiry(value) {
  var d = onlyDigits(value);
  if (d.length !== 4) return null;
  var month = parseInt(d.slice(0, 2), 10);
  var year = parseInt(d.slice(2), 10);
  if (month < 1 || month > 12) return null;
  var now = new Date();
  var curYear = now.getFullYear() % 100, curMonth = now.getMonth() + 1;
  if (year < curYear || (year === curYear && month < curMonth)) return null;
  return { month: d.slice(0, 2), year: d.slice(2) };
}

function formatTimer(ms) {
  var total = Math.max(0, Math.ceil(ms / 1000));
  var h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  var mm = (m < 10 ? '0' : '') + m, ss = (s < 10 ? '0' : '') + s;
  return h ? h + ':' + mm + ':' + ss : mm + ':' + ss;
}

function storageGet(key) {
  try { return window.localStorage.getItem(key); } catch (e) { return null; }
}
function storageSet(key, value) {
  try { window.localStorage.setItem(key, value); } catch (e) { /* private mode */ }
}

// ---- src/icons.js ----
/* ---------------------------------------------------------------------------
 * Inline SVG icons. The SBP mark is the official one, taken as is from
 * https://sbp.nspk.ru/favicon.svg (copy in docs/brand/). Do not redraw or recolor it.
 * ------------------------------------------------------------------------- */
var ICONS = {
  sbp: '<svg viewBox="0 0 283 326" width="24" height="28" fill="none" aria-hidden="true">' +
    '<path d="M82.0718 157.97L39.5004 182.506L0 250.881L161.133 157.97H82.0718Z" fill="#874691"/>' +
    '<path d="M203.704 92.9109L161.133 117.447L121.632 185.822L282.705 92.9109H203.704Z" fill="#DA1844"/>' +
    '<path d="M161.133 68.3752L121.632 0V140.178V185.822V326L161.133 257.625V68.3752Z" fill="#F9B229"/>' +
    '<path d="M121.632 0L161.133 68.3752L203.704 92.9109H282.705L121.632 0Z" fill="#F07F1A"/>' +
    '<path d="M121.632 140.178V326L161.133 257.625V208.493L121.632 140.178Z" fill="#72B22C"/>' +
    '<path d="M203.704 233.089L161.133 257.625L121.632 326L282.705 233.089H203.704Z" fill="#00743E"/>' +
    '<path d="M0 70.059V255.881L39.5004 187.506V138.434L0 70.059Z" fill="#5F5A94"/>' +
    '<path d="M121.632 140.178V140.238L0 70.059L39.5004 138.434L203.704 233.089H282.705L121.632 140.178Z" fill="#0D90CD"/>' +
    '</svg>',
  card: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l.8 12.5h9.4L17.5 7M10 11v5M14 11v5"/></svg>',
  search: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  lock: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>',
  success: '<svg class="pw-mark pw-mark-ok" viewBox="0 0 72 72" width="72" height="72" aria-hidden="true"><circle cx="36" cy="36" r="33" fill="none" stroke="currentColor" stroke-width="4"/><path d="M22 37.5l10 10 19-21" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  fail: '<svg class="pw-mark pw-mark-fail" viewBox="0 0 72 72" width="72" height="72" aria-hidden="true"><circle cx="36" cy="36" r="33" fill="none" stroke="currentColor" stroke-width="4"/><path d="M26 26l20 20M46 26L26 46" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>',
  clock: '<svg class="pw-mark pw-mark-warn" viewBox="0 0 72 72" width="72" height="72" aria-hidden="true"><circle cx="36" cy="36" r="33" fill="none" stroke="currentColor" stroke-width="4"/><path d="M36 19v18l11 8" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  brand: {
    mir: '<svg viewBox="0 0 40 26" width="40" height="26" aria-hidden="true"><rect width="40" height="26" rx="4" fill="#0F754E"/><text x="20" y="17.5" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" font-weight="700" fill="#fff">МИР</text></svg>',
    visa: '<svg viewBox="0 0 40 26" width="40" height="26" aria-hidden="true"><rect width="40" height="26" rx="4" fill="#1A1F71"/><text x="20" y="17.5" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" font-weight="700" font-style="italic" fill="#fff">VISA</text></svg>',
    mastercard: '<svg viewBox="0 0 40 26" width="40" height="26" aria-hidden="true"><rect width="40" height="26" rx="4" fill="#1B1B1B"/><circle cx="16" cy="13" r="7" fill="#EB001B"/><circle cx="24" cy="13" r="7" fill="#F79E1B" fill-opacity=".9"/></svg>',
    unknown: '<svg viewBox="0 0 40 26" width="40" height="26" aria-hidden="true"><rect x=".75" y=".75" width="38.5" height="24.5" rx="4" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="1.5"/><path d="M1 8.5h38" stroke="currentColor" stroke-opacity=".35" stroke-width="3"/></svg>'
  }
};

function brandIcon(brand) { return ICONS.brand[brand] || ICONS.brand.unknown; }

// ---- src/styles.js ----
/* ---------------------------------------------------------------------------
 * Styles live inside the Shadow DOM, so the host site cannot break them.
 * Theme: set CSS variables on the page (e.g. :root { --pw-primary: #7a1fa2 })
 * or pass `theme: { primary, radius, font, ... }` to PayWidget.open().
 * ------------------------------------------------------------------------- */
var STYLES = [
':host{',
'  --_primary:var(--pw-primary,#0B2A6B);',
'  --_primary-hover:var(--pw-primary-hover,#12398C);',
'  --_on-primary:var(--pw-on-primary,#fff);',
'  --_bg:var(--pw-bg,#fff);',
'  --_surface:var(--pw-surface,#F3F5F9);',
'  --_text:var(--pw-text,#131A29);',
'  --_muted:var(--pw-muted,#6B7385);',
'  --_border:var(--pw-border,#DDE1EA);',
'  --_success:var(--pw-success,#1E9E57);',
'  --_danger:var(--pw-danger,#D93636);',
'  --_warn:var(--pw-warn,#C9861A);',
'  --_radius:var(--pw-radius,16px);',
'  --_radius-sm:calc(var(--_radius) * .75);',
'  --_font:var(--pw-font,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif);',
'  all:initial;display:block;font-family:var(--_font);color:var(--_text);font-size:16px;line-height:1.35;',
'  -webkit-text-size-adjust:100%;',
'}',
'*,*::before,*::after{box-sizing:border-box}',
'[hidden]{display:none!important}',
'button{font:inherit;color:inherit;cursor:pointer;border:0;background:none;padding:0;margin:0;-webkit-tap-highlight-color:transparent}',
'input{font:inherit;color:inherit}',
'svg{display:block;flex:none}',

/* overlay + sheet */
'.pw-overlay{position:fixed;inset:0;z-index:var(--pw-z,2147483000);display:flex;align-items:flex-end;justify-content:center;',
'  background:rgba(12,18,32,.55);animation:pw-fade .2s ease-out}',
'.pw-sheet{position:relative;width:100%;max-width:520px;max-height:92vh;max-height:92dvh;display:flex;flex-direction:column;',
'  background:var(--_bg);border-radius:calc(var(--_radius) * 1.4) calc(var(--_radius) * 1.4) 0 0;',
'  box-shadow:0 -8px 40px rgba(10,20,50,.22);animation:pw-up .28s cubic-bezier(.2,.8,.2,1);overflow:hidden}',
'.pw-sheet::before{content:"";display:block;width:40px;height:4px;border-radius:2px;background:var(--_border);margin:8px auto 0;flex:none}',
'@media (min-width:640px){',
'  .pw-overlay{align-items:center;padding:24px}',
'  .pw-sheet{max-width:440px;max-height:min(92vh,760px);border-radius:calc(var(--_radius) * 1.4);animation:pw-pop .22s ease-out;box-shadow:0 20px 60px rgba(10,20,50,.3)}',
'  .pw-sheet::before{display:none}',
'}',
'.pw-inline .pw-sheet{max-width:none;max-height:none;border-radius:calc(var(--_radius) * 1.2);box-shadow:none;border:1px solid var(--_border);animation:none}',
'.pw-inline .pw-sheet::before{display:none}',
'@keyframes pw-fade{from{opacity:0}}',
'@keyframes pw-up{from{transform:translateY(100%)}}',
'@keyframes pw-pop{from{opacity:0;transform:scale(.96) translateY(8px)}}',

/* header */
'.pw-head{display:flex;align-items:center;gap:8px;padding:14px 16px 6px;flex:none;min-height:56px}',
'.pw-title{flex:1;margin:0;font-size:20px;font-weight:700;letter-spacing:-.01em}',
'.pw-icon-btn{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;color:var(--_muted);background:var(--_surface);flex:none}',
'.pw-icon-btn:hover{color:var(--_text)}',
'.pw-icon-btn.pw-ghost{background:none;margin-left:-8px}',
'.pw-body{padding:8px 16px calc(18px + env(safe-area-inset-bottom,0px));overflow-y:auto;-webkit-overflow-scrolling:touch;flex:1;min-height:0}',
'@media (min-width:640px){.pw-head{padding:18px 22px 6px}.pw-body{padding:8px 22px 22px}}',

/* total */
'.pw-total{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:14px 16px;border-radius:var(--_radius);background:var(--_surface);margin-bottom:14px}',
'.pw-total-label{color:var(--_muted);font-size:15px}',
'.pw-total-sum{font-size:22px;font-weight:700;white-space:nowrap;letter-spacing:-.01em}',
'.pw-desc{color:var(--_muted);font-size:14px;margin:-6px 2px 14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',

/* buttons */
'.pw-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:52px;padding:10px 18px;border-radius:var(--_radius);',
'  font-size:16px;font-weight:600;text-align:center;transition:background .15s,border-color .15s,transform .05s}',
'.pw-btn:active{transform:scale(.985)}',
'.pw-btn[disabled]{opacity:.55;cursor:default}',
'.pw-btn-primary{min-height:60px;font-size:18px;background:var(--_primary);color:var(--_on-primary);box-shadow:0 6px 18px rgba(11,42,107,.28)}',
'.pw-btn-primary:hover{background:var(--_primary-hover)}',
'.pw-btn-outline{border:1.5px solid var(--_border);background:var(--_bg);color:var(--_text)}',
'.pw-btn-outline:hover{border-color:var(--_muted)}',
'.pw-btn-soft{background:var(--_surface);color:var(--_text)}',
'.pw-btn-link{min-height:44px;color:var(--_primary);font-weight:600;font-size:15px}',
'.pw-sbp-badge{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:#fff;flex:none}',
'.pw-stack{display:flex;flex-direction:column;gap:10px}',
'.pw-hint{margin:14px 2px 0;color:var(--_muted);font-size:13px;text-align:center}',
'.pw-secure{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:10px;color:var(--_muted);font-size:12px}',

/* saved cards */
'.pw-section{margin:0 2px 8px;color:var(--_muted);font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.04em}',
'.pw-cards{display:flex;flex-direction:column;gap:8px;margin-bottom:14px}',
'.pw-card-row{display:flex;align-items:stretch;border:1.5px solid var(--_border);border-radius:var(--_radius);overflow:hidden;background:var(--_bg)}',
'.pw-card-pay{flex:1;display:flex;align-items:center;gap:12px;min-height:56px;padding:8px 12px;text-align:left;min-width:0}',
'.pw-card-pay:hover{background:var(--_surface)}',
'.pw-card-name{flex:1;font-weight:600;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
'.pw-card-exp{display:block;color:var(--_muted);font-size:12px;font-weight:400}',
'.pw-card-go{display:flex;align-items:center;gap:2px;color:var(--_primary);font-weight:600;font-size:14px;white-space:nowrap}',
'.pw-card-del{width:48px;display:grid;place-items:center;color:var(--_muted);border-left:1.5px solid var(--_border)}',
'.pw-card-del:hover{color:var(--_danger);background:var(--_surface)}',
'.pw-confirm{display:flex;align-items:center;gap:8px;padding:8px 12px;min-height:56px;flex:1;font-size:14px}',
'.pw-confirm span{flex:1}',
'.pw-chip{min-height:36px;padding:0 14px;border-radius:999px;font-weight:600;font-size:14px;background:var(--_surface)}',
'.pw-chip-danger{background:var(--_danger);color:#fff}',

/* states */
'.pw-state{display:flex;flex-direction:column;align-items:center;text-align:center;padding:18px 4px 6px;gap:6px}',
'.pw-state h3{margin:10px 0 0;font-size:20px;font-weight:700}',
'.pw-state p{margin:0;color:var(--_muted);font-size:15px;max-width:320px}',
'.pw-state .pw-btn{margin-top:16px}',
'.pw-mark-ok{color:var(--_success)}.pw-mark-fail{color:var(--_danger)}.pw-mark-warn{color:var(--_warn)}',
'.pw-mark circle{stroke-dasharray:208;stroke-dashoffset:208;animation:pw-draw .5s ease-out forwards}',
'.pw-mark path{stroke-dasharray:60;stroke-dashoffset:60;animation:pw-draw .35s .4s ease-out forwards}',
'@keyframes pw-draw{to{stroke-dashoffset:0}}',
'.pw-spinner{width:44px;height:44px;border-radius:50%;border:4px solid var(--_surface);border-top-color:var(--_primary);animation:pw-spin .8s linear infinite}',
'.pw-spinner-sm{width:18px;height:18px;border-width:2.5px;flex:none}',
'@keyframes pw-spin{to{transform:rotate(360deg)}}',
'.pw-waiting{display:flex;align-items:center;justify-content:center;gap:10px;color:var(--_muted);font-size:14px;margin-top:12px}',
'.pw-skeleton{height:56px;border-radius:var(--_radius);background:linear-gradient(90deg,var(--_surface) 25%,var(--_border) 50%,var(--_surface) 75%);background-size:200% 100%;animation:pw-shimmer 1.2s linear infinite;margin-bottom:14px}',
'@keyframes pw-shimmer{to{background-position:-200% 0}}',

/* QR */
'.pw-qr-wrap{display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px}',
'.pw-qr{width:min(240px,62vw);aspect-ratio:1;padding:8px;border-radius:var(--_radius);background:#fff;border:1.5px solid var(--_border)}',
'.pw-qr svg{width:100%;height:100%}',
'.pw-qr-text{margin:0;font-size:15px;max-width:300px}',
'.pw-timer{font-variant-numeric:tabular-nums;color:var(--_muted);font-size:14px}',
'.pw-timer b{color:var(--_text)}',
'.pw-note{padding:12px 14px;border-radius:var(--_radius-sm);background:var(--_surface);font-size:14px;text-align:left;margin:4px 0 12px}',
'.pw-note b{display:block;margin-bottom:2px}',

/* banks */
'.pw-popular{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}',
'.pw-bank-tile{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 4px;border-radius:var(--_radius-sm);background:var(--_surface);font-size:12px;font-weight:600;min-height:76px;min-width:0}',
'.pw-bank-tile span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
'.pw-bank-logo{width:36px;height:36px;border-radius:10px;object-fit:contain;background:#fff;flex:none}',
'.pw-bank-letter{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:var(--_border);font-weight:700;flex:none}',
'.pw-search{position:relative;margin-bottom:6px}',
'.pw-search svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--_muted)}',
'.pw-input{width:100%;height:50px;padding:0 14px;border:1.5px solid var(--_border);border-radius:var(--_radius-sm);background:var(--_bg);font-size:16px;outline:none;transition:border-color .15s}',
'.pw-input:focus{border-color:var(--_primary)}',
'.pw-input.pw-invalid{border-color:var(--_danger)}',
'.pw-search .pw-input{padding-left:42px}',
'.pw-bank-list{display:flex;flex-direction:column}',
'.pw-bank-row{display:flex;align-items:center;gap:12px;min-height:56px;padding:8px 4px;text-align:left;border-bottom:1px solid var(--_surface);font-size:15px}',
'.pw-bank-row span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
'.pw-bank-row svg{color:var(--_muted)}',
'.pw-empty{padding:18px 4px;color:var(--_muted);text-align:center;font-size:14px}',

/* card form */
'.pw-field{margin-bottom:12px}',
'.pw-label{display:block;margin:0 2px 6px;font-size:13px;color:var(--_muted);font-weight:600}',
'.pw-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}',
'.pw-number{position:relative}',
'.pw-number .pw-input{padding-right:62px;letter-spacing:.04em}',
'.pw-number .pw-brand{position:absolute;right:12px;top:50%;transform:translateY(-50%);color:var(--_muted)}',
'.pw-cvc{-webkit-text-security:disc}',
'.pw-err{min-height:18px;margin:4px 2px 0;color:var(--_danger);font-size:13px}',
'.pw-check{display:flex;align-items:center;gap:10px;min-height:44px;margin:0 2px 12px;font-size:15px;cursor:pointer;user-select:none}',
'.pw-check input{width:22px;height:22px;accent-color:var(--_primary);margin:0;flex:none}',
'.pw-frame{display:block;margin-bottom:14px;width:100%;height:min(400px,52vh);border:1.5px solid var(--_border);border-radius:var(--_radius-sm);background:#fff}',
'.pw-toast{position:absolute;left:16px;right:16px;bottom:16px;padding:12px 14px;border-radius:var(--_radius-sm);background:#131A29;color:#fff;font-size:14px;text-align:center;animation:pw-pop .2s ease-out;z-index:2}',
'@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition:none!important}}'
].join('\n');

// ---- src/api.js ----
/* ---------------------------------------------------------------------------
 * Backend client + card tokenization adapters.
 *
 * PCI DSS rule: the card number and CVC are NEVER sent to backendUrl. They go
 * from the browser straight to the acquirer's own SDK, which returns a token
 * (or cryptogram). Only that token reaches our server.
 * ------------------------------------------------------------------------- */
function createApi(opts) {
  var base = String(opts.backendUrl || '').replace(/\/+$/, '');

  function request(method, path, body, extraHeaders) {
    var headers = { Accept: 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    if (opts.customerToken) headers['X-Customer-Token'] = opts.customerToken;
    for (var k in extraHeaders || {}) headers[k] = extraHeaders[k];
    return fetch(base + path, {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { /* not JSON */ }
        if (!res.ok) {
          var err = new Error((data && data.error && data.error.message) || 'HTTP ' + res.status);
          err.code = (data && data.error && data.error.code) || 'http_' + res.status;
          err.status = res.status;
          throw err;
        }
        return data;
      });
    }, function () {
      var err = new Error('network');
      err.code = 'network';
      throw err;
    });
  }

  return {
    config: function () { return request('GET', '/config'); },
    /** Idempotence-Key lets us safely repeat the request after a network glitch. */
    createPayment: function (payload, idempotenceKey) {
      var headers = { 'Idempotence-Key': idempotenceKey };
      return request('POST', '/payments', payload, headers).catch(function (err) {
        if (err.code !== 'network') throw err;
        return new Promise(function (resolve) { setTimeout(resolve, 1200); }).then(function () {
          return request('POST', '/payments', payload, headers);
        });
      });
    },
    status: function (id) { return request('GET', '/payments/' + encodeURIComponent(id) + '/status'); },
    cards: function (customerId) { return request('GET', '/customers/' + encodeURIComponent(customerId) + '/cards'); },
    deleteCard: function (customerId, cardId) {
      return request('DELETE', '/customers/' + encodeURIComponent(customerId) + '/cards/' + encodeURIComponent(cardId));
    }
  };
}

var loadedScripts = {};
function loadScript(src) {
  if (!loadedScripts[src]) {
    loadedScripts[src] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = function () { delete loadedScripts[src]; reject(new Error('script_load_failed')); };
      document.head.appendChild(s);
    });
  }
  return loadedScripts[src];
}

/**
 * Adapter contract:
 *   mode: 'fields'  -> the widget shows its own card fields and calls tokenize()
 *   mode: 'hosted'  -> the acquirer shows its own payment page (no card fields in the widget)
 *   tokenize(card, config) -> Promise<string token>; card = { number, month, year, cvc }
 */
var CARD_ADAPTERS = {
  // Test mode. The "token" only carries the mask and brand, never the full number.
  mock: {
    mode: 'fields',
    tokenize: function (card) {
      var behavior = 'ok';
      if (card.number === '4000000000000002') behavior = 'decline';
      else if (card.number === '2200000000000004') behavior = '3ds';
      var meta = { last4: card.number.slice(-4), brand: cardBrand(card.number), expMonth: card.month, expYear: card.year, behavior: behavior };
      return new Promise(function (resolve) {
        setTimeout(function () { resolve('mocktok_' + btoa(JSON.stringify(meta))); }, 500);
      });
    }
  },

  // YooKassa Checkout.js: https://yookassa.ru/developers/payment-acceptance/integration-scenarios/checkout-js/basics
  yookassa: {
    mode: 'fields',
    tokenize: function (card, config) {
      return loadScript('https://static.yoomoney.ru/checkout-js/v1/checkout.js').then(function () {
        var checkout = window.YooMoneyCheckout(config.shopId);
        return checkout.tokenize({ number: card.number, cvc: card.cvc, month: card.month, year: card.year });
      }).then(function (res) {
        if (res && res.status === 'success') return res.data.response.paymentToken;
        var err = new Error('tokenize_failed');
        err.code = 'card_invalid';
        throw err;
      });
    }
  },

  // CloudPayments checkout script: https://developers.cloudpayments.ru/#skript-checkout
  cloudpayments: {
    mode: 'fields',
    tokenize: function (card, config) {
      return loadScript('https://checkout.cloudpayments.ru/checkout.js').then(function () {
        var checkout = new window.cp.Checkout({ publicId: config.publicId });
        return checkout.createPaymentCryptogram({
          cvv: card.cvc, cardNumber: card.number, expDateMonth: card.month, expDateYear: card.year
        });
      }).catch(function (e) {
        if (e && e.message === 'script_load_failed') throw e;
        var err = new Error('tokenize_failed');
        err.code = 'card_invalid';
        throw err;
      });
    }
  },

  // T-Bank / Tochka: card data is entered on the bank's own hosted payment page.
  tbank: { mode: 'hosted' },
  tochka: { mode: 'hosted' }
};

/** Sites can plug in their own acquirer: PayWidget.registerCardAdapter('name', { mode, tokenize }). */
function registerCardAdapter(name, adapter) { CARD_ADAPTERS[name] = adapter; }

// ---- src/widget.js ----
/* ---------------------------------------------------------------------------
 * The widget itself: screens, SBP flow (banks / QR), card flow, status polling.
 * All UI text is Russian; identifiers are English.
 * ------------------------------------------------------------------------- */
var NSPK_BANKS_URL = 'https://qr.nspk.ru/proxyapp/c2bmembers.json';
var LAST_BANK_KEY = 'pw:lastBank';
var BANKS_CACHE_KEY = 'pw:banks:v1';
var BANKS_CACHE_MS = 24 * 3600 * 1000;
var POLL_MS = 3000;
var DEEPLINK_WAIT_MS = 2000;

// Shown first. Schemas are taken from the official NSPK registry (c2bmembers.json);
// the list also works as a fallback if the registry cannot be loaded.
var POPULAR_BANKS = [
  { schema: 'bank100000000111', name: 'Сбербанк', short: 'Сбер' },
  { schema: 'bank100000000004', name: 'Т-Банк', short: 'Т-Банк' },
  { schema: 'bank110000000005', name: 'Банк ВТБ', short: 'ВТБ' },
  { schema: 'bank100000000008', name: 'АЛЬФА-БАНК', short: 'Альфа' }
];

var FAIL_TEXT = {
  declined: 'Банк отклонил оплату. Проверьте данные карты или выберите другой способ.',
  insufficient_funds: 'Недостаточно средств. Попробуйте другую карту или СБП.',
  canceled: 'Оплата отменена.',
  card_invalid: 'Не получилось принять карту. Проверьте номер, срок и код.',
  network: 'Нет связи с сервером оплаты. Проверьте интернет и попробуйте снова.',
  script_load_failed: 'Не загрузилась форма банка. Отключите VPN или блокировщик рекламы и попробуйте снова.',
  forbidden: 'Оплата недоступна для этого сайта. Сообщите в поддержку магазина.',
  default: 'Оплата не прошла. Попробуйте ещё раз или выберите другой способ.'
};

var banksPromise = null;

function parseBanks(data) {
  var list = ((data && data.dictionary) || []).filter(function (b) { return b && b.schema && b.bankName; }).map(function (b) {
    return { name: String(b.bankName), schema: String(b.schema), logo: String(b.logoURL || '') };
  });
  if (!list.length) throw new Error('banks');
  return list;
}

function fetchBanks(url) {
  var ctrl = window.AbortController ? new AbortController() : null;
  var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 7000);
  return fetch(url, ctrl ? { signal: ctrl.signal } : undefined)
    .then(function (r) { if (!r.ok) throw new Error('banks'); return r.json(); })
    .then(function (data) { clearTimeout(timer); return parseBanks(data); }, function (e) { clearTimeout(timer); throw e; });
}

// Order: official NSPK registry -> copy kept by our backend -> four popular banks.
function loadBanks(url, backupUrl) {
  if (banksPromise) return banksPromise;
  var cached = null;
  try { cached = JSON.parse(storageGet(BANKS_CACHE_KEY) || 'null'); } catch (e) { /* ignore */ }
  if (cached && cached.url === url && Date.now() - cached.t < BANKS_CACHE_MS && cached.list && cached.list.length) {
    banksPromise = Promise.resolve({ list: cached.list, fallback: false });
    return banksPromise;
  }
  banksPromise = fetchBanks(url)
    .catch(function (e) { if (!backupUrl) throw e; return fetchBanks(backupUrl); })
    .then(function (list) {
      storageSet(BANKS_CACHE_KEY, JSON.stringify({ t: Date.now(), url: url, list: list }));
      return { list: list, fallback: false };
    })
    .catch(function () {
      banksPromise = null; // allow a retry next time
      return {
        fallback: true,
        list: POPULAR_BANKS.map(function (b) {
          return { name: b.name, schema: b.schema, logo: 'https://qr.nspk.ru/proxyapp/logo/' + b.schema + '.png' };
        })
      };
    });
  return banksPromise;
}

function createWidget(options, mountTarget) {
  var opts = options || {};
  var inline = !!mountTarget;
  var api = createApi(opts);
  var currency = opts.currency || 'RUB';
  var sumText = formatAmount(opts.amount, currency);
  var banksBackup = String(opts.backendUrl).replace(/\/+$/, '') + '/banks';
  var device = opts.device === 'mobile' || opts.device === 'desktop' ? opts.device : detectDevice();

  var st = {
    screen: 'methods', config: null, cards: null, payment: null, banks: null, banksFallback: false,
    bank: null, failCode: null, failText: '', confirmDelete: null, qrFromMobile: false, result: 'pending'
  };
  var pollTimer = null, tickTimer = null, deeplinkTimer = null, toastTimer = null;
  var checking = false, destroyed = false, localExpiredAt = 0, prevOverflow = null;

  // ---- DOM skeleton (Shadow DOM isolates styles both ways) ------------------
  var host = document.createElement('div');
  host.setAttribute('data-pay-widget', '');
  var root = host.attachShadow({ mode: 'open' });
  var theme = opts.theme || {};
  var themeMap = { primary: '--pw-primary', primaryHover: '--pw-primary-hover', onPrimary: '--pw-on-primary', radius: '--pw-radius', font: '--pw-font', bg: '--pw-bg', text: '--pw-text', surface: '--pw-surface', border: '--pw-border', muted: '--pw-muted' };
  for (var tk in themeMap) if (theme[tk]) host.style.setProperty(themeMap[tk], theme[tk]);
  if (opts.zIndex) host.style.setProperty('--pw-z', String(opts.zIndex));

  root.innerHTML = '<style>' + STYLES + '</style>' +
    '<div class="' + (inline ? 'pw-inline' : 'pw-overlay') + '" data-overlay>' +
    '<div class="pw-sheet" role="dialog" aria-modal="' + (inline ? 'false' : 'true') + '" aria-label="Оплата заказа" tabindex="-1">' +
    '<div class="pw-head"></div><div class="pw-body"></div></div></div>';
  var overlay = root.querySelector('[data-overlay]');
  var sheet = root.querySelector('.pw-sheet');
  var head = root.querySelector('.pw-head');
  var body = root.querySelector('.pw-body');

  // ---- helpers ---------------------------------------------------------------
  function $(sel) { return root.querySelector(sel); }
  function pending() { return st.payment && (st.payment.status === 'pending' || st.payment.status === 'requires_action'); }
  function sbpAlive() {
    return pending() && st.payment.method === 'sbp' && st.payment.sbp &&
      (!st.payment.sbp.expiresAt || new Date(st.payment.sbp.expiresAt).getTime() > Date.now() + 5000);
  }
  function bankLogo(bank) {
    var letter = '<span class="pw-bank-letter">' + esc(bank.name.replace(/^(банк|ао|пао|ооо)\s+/i, '').charAt(0).toUpperCase()) + '</span>';
    if (!bank.logo) return letter;
    return '<img class="pw-bank-logo" loading="lazy" alt="" src="' + esc(bank.logo) + '" data-letter="' + esc(bank.name.charAt(0)) + '">';
  }
  function findBank(schema) {
    var list = st.banks || [];
    for (var i = 0; i < list.length; i++) if (list[i].schema === schema) return list[i];
    return null;
  }
  function deeplinkFor(bank) {
    // NSPK scheme: the same payment link, but "https" is replaced with the bank's own scheme.
    return st.payment.sbp.payload.replace(/^https?:/i, bank.schema + ':');
  }
  function toast(text) {
    var old = $('.pw-toast');
    if (old) old.remove();
    var el = document.createElement('div');
    el.className = 'pw-toast';
    el.setAttribute('role', 'status');
    el.textContent = text;
    sheet.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.remove(); }, 3500);
  }

  // ---- screens ---------------------------------------------------------------
  var TITLES = {
    methods: 'Способ оплаты', loading: 'Способ оплаты', banks: 'Выберите банк', bankwait: 'Оплата через СБП',
    qr: 'Оплата через СБП', card: 'Оплата картой', processing: 'Оплата', confirm: 'Подтверждение',
    success: 'Оплата', error: 'Оплата', expired: 'Оплата'
  };
  var BACK_TO = { banks: 'methods', bankwait: 'banks', qr: 'methods', card: 'methods', confirm: 'methods' };

  function totalBlock() {
    return '<div class="pw-total"><span class="pw-total-label">Итого</span><span class="pw-total-sum">' + sumText + '</span></div>';
  }
  function waitingLine(text) {
    return '<div class="pw-waiting" role="status"><span class="pw-spinner pw-spinner-sm"></span>' + text + '</div>';
  }
  function timerLine() {
    if (!st.payment || !st.payment.sbp || !st.payment.sbp.expiresAt) return '';
    return '<div class="pw-timer">Код действует ещё <b data-timer>' + formatTimer(new Date(st.payment.sbp.expiresAt).getTime() - Date.now()) + '</b></div>';
  }
  function qrBlock() {
    return '<div class="pw-qr">' + QR.toSvg(st.payment.sbp.payload) + '</div>';
  }

  function cardsBlock() {
    if (!opts.customerId) return '';
    if (st.cards === null) return '<div class="pw-skeleton" aria-hidden="true"></div>';
    if (!st.cards.length) return '';
    var rows = st.cards.map(function (c) {
      var label = brandName(c.brand) + ' •• ' + esc(c.last4);
      if (st.confirmDelete === c.id) {
        return '<div class="pw-card-row"><div class="pw-confirm"><span>Удалить карту •• ' + esc(c.last4) + '?</span>' +
          '<button class="pw-chip pw-chip-danger" data-action="do-delete" data-id="' + esc(c.id) + '">Удалить</button>' +
          '<button class="pw-chip" data-action="cancel-delete">Отмена</button></div></div>';
      }
      var exp = c.expMonth && c.expYear ? '<span class="pw-card-exp">до ' + esc(c.expMonth) + '/' + esc(c.expYear) + '</span>' : '';
      return '<div class="pw-card-row">' +
        '<button class="pw-card-pay" data-action="pay-saved" data-id="' + esc(c.id) + '" aria-label="Оплатить картой ' + label + '">' +
        brandIcon(c.brand) + '<span class="pw-card-name">' + label + exp + '</span>' +
        '<span class="pw-card-go">Оплатить' + ICONS.chevron + '</span></button>' +
        '<button class="pw-card-del" data-action="ask-delete" data-id="' + esc(c.id) + '" aria-label="Удалить карту ' + label + '" title="Удалить карту">' + ICONS.trash + '</button>' +
        '</div>';
    }).join('');
    return '<div class="pw-section">Сохранённая карта</div><div class="pw-cards">' + rows + '</div>';
  }

  var SCREENS = {
    methods: function () {
      var hasCards = st.cards && st.cards.length;
      return totalBlock() +
        (opts.description ? '<div class="pw-desc">' + esc(opts.description) + '</div>' : '') +
        '<div data-cards>' + cardsBlock() + '</div>' +
        '<div class="pw-stack">' +
        '<button class="pw-btn pw-btn-primary" data-action="pay-sbp"><span class="pw-sbp-badge">' + ICONS.sbp + '</span>Оплатить СБП</button>' +
        '<button class="pw-btn pw-btn-outline" data-action="pay-card">' + ICONS.card + (hasCards ? 'Оплатить новой картой' : 'Оплатить картой') + '</button>' +
        '</div>' +
        '<p class="pw-hint">Если оплата не проходит, отключите VPN</p>';
    },

    loading: function () {
      return '<div class="pw-state"><div class="pw-spinner"></div><h3>' + esc(st.loadingText || 'Загрузка…') + '</h3></div>';
    },

    banks: function () {
      var last = findBank(storageGet(LAST_BANK_KEY));
      var html = '';
      if (last) {
        html += '<button class="pw-btn pw-btn-primary" data-action="bank" data-schema="' + esc(last.schema) + '">' +
          bankLogo(last) + '<span>Оплатить в ' + esc(last.name) + '</span></button>';
      }
      var popular = POPULAR_BANKS.map(function (p) {
        var b = findBank(p.schema);
        return b ? { bank: b, short: p.short } : null;
      }).filter(function (x) { return x && !(last && x.bank.schema === last.schema); });
      if (popular.length) {
        html += '<div class="pw-popular">' + popular.map(function (x) {
          return '<button class="pw-bank-tile" data-action="bank" data-schema="' + esc(x.bank.schema) + '">' + bankLogo(x.bank) + '<span>' + esc(x.short) + '</span></button>';
        }).join('') + '</div>';
      }
      if (st.banksFallback) {
        html += '<div class="pw-note">Не удалось загрузить полный список банков. Если вашего банка нет, оплатите по QR-коду.</div>';
      } else {
        html += '<div class="pw-search">' + ICONS.search +
          '<input class="pw-input" type="search" data-bank-search placeholder="Поиск банка" autocomplete="off" aria-label="Поиск банка"></div>' +
          '<div class="pw-bank-list">' + st.banks.map(function (b) {
            return '<button class="pw-bank-row" data-action="bank" data-schema="' + esc(b.schema) + '" data-name="' + esc(b.name.toLowerCase()) + '">' +
              bankLogo(b) + '<span>' + esc(b.name) + '</span>' + ICONS.chevron + '</button>';
          }).join('') + '</div><div class="pw-empty" data-empty hidden>Банк не найден. Проверьте название или оплатите по QR-коду.</div>';
      }
      html += '<button class="pw-btn pw-btn-link" data-action="show-qr">Показать QR-код</button>';
      return html;
    },

    bankwait: function () {
      return '<div class="pw-state" style="padding-top:6px">' + bankLogo(st.bank) +
        '<h3>' + esc(st.bank.name) + '</h3>' +
        '<p>Подтвердите оплату ' + sumText + ' в приложении банка и вернитесь на эту страницу.</p></div>' +
        waitingLine('Ожидаем оплату…') +
        '<div data-fallback hidden style="margin-top:16px">' +
        '<div class="pw-note"><b>Приложение не открылось?</b>Возможно, оно не установлено. Выберите другой банк или отсканируйте QR-код с другого устройства.</div>' +
        '<div class="pw-qr-wrap">' + qrBlock() + timerLine() + '</div>' +
        '</div>' +
        '<div class="pw-stack" style="margin-top:16px">' +
        '<button class="pw-btn pw-btn-soft" data-action="reopen-bank">Открыть приложение ещё раз</button>' +
        '<button class="pw-btn pw-btn-outline" data-action="other-bank">Выбрать другой банк</button>' +
        '</div>';
    },

    qr: function () {
      return '<div class="pw-qr-wrap">' +
        '<div class="pw-total" style="width:100%;margin-bottom:4px"><span class="pw-total-label">К оплате</span><span class="pw-total-sum">' + sumText + '</span></div>' +
        qrBlock() +
        '<p class="pw-qr-text">Отсканируйте камерой телефона или в приложении банка</p>' +
        timerLine() + '</div>' +
        waitingLine('Ожидаем оплату…') +
        (st.qrFromMobile ? '<button class="pw-btn pw-btn-outline" style="margin-top:14px" data-action="other-bank">Выбрать банк из списка</button>' : '');
    },

    card: function () {
      return '<form data-card-form novalidate autocomplete="on">' + totalBlock() +
        '<div class="pw-field"><label class="pw-label" for="pw-number">Номер карты</label>' +
        '<div class="pw-number"><input class="pw-input" id="pw-number" data-mask="number" inputmode="numeric" autocomplete="cc-number" placeholder="0000 0000 0000 0000" maxlength="23">' +
        '<span class="pw-brand" data-brand>' + brandIcon('') + '</span></div>' +
        '<div class="pw-err" data-err="number"></div></div>' +
        '<div class="pw-row">' +
        '<div class="pw-field"><label class="pw-label" for="pw-expiry">Срок действия</label>' +
        '<input class="pw-input" id="pw-expiry" data-mask="expiry" inputmode="numeric" autocomplete="cc-exp" placeholder="ММ/ГГ" maxlength="5">' +
        '<div class="pw-err" data-err="expiry"></div></div>' +
        '<div class="pw-field"><label class="pw-label" for="pw-cvc">Код CVC</label>' +
        '<input class="pw-input pw-cvc" id="pw-cvc" data-mask="cvc" inputmode="numeric" autocomplete="cc-csc" placeholder="•••" maxlength="3">' +
        '<div class="pw-err" data-err="cvc"></div></div>' +
        '</div>' +
        (opts.customerId ? '<label class="pw-check"><input type="checkbox" data-save checked>Запомнить карту</label>' : '') +
        '<button class="pw-btn pw-btn-primary" type="submit">Оплатить ' + sumText + '</button>' +
        '<div class="pw-secure">' + ICONS.lock + 'Данные карты передаются напрямую в банк</div>' +
        '</form>';
    },

    processing: function () {
      return '<div class="pw-state"><div class="pw-spinner"></div><h3>Проводим оплату…</h3><p>Не закрывайте окно, это займёт несколько секунд.</p></div>';
    },

    confirm: function () {
      var c = st.payment.confirmation || {};
      if (c.embeddable) {
        return '<iframe class="pw-frame" title="Подтверждение оплаты" src="' + esc(c.url) + '"></iframe>' + waitingLine('Ожидаем подтверждение…');
      }
      return '<div class="pw-state"><h3>Подтвердите оплату</h3>' +
        '<p>Страница банка откроется в новой вкладке. После подтверждения вернитесь сюда.</p>' +
        '<a class="pw-btn pw-btn-primary" style="text-decoration:none" target="_blank" rel="noopener" href="' + esc(c.url) + '">Перейти на страницу банка</a></div>' +
        waitingLine('Ожидаем подтверждение…');
    },

    success: function () {
      return '<div class="pw-state">' + ICONS.success + '<h3>Оплата прошла</h3><p>' + sumText + ' · заказ ' + esc(opts.orderId) + '</p>' +
        '<button class="pw-btn pw-btn-primary" data-action="done">Готово</button></div>';
    },

    error: function () {
      return '<div class="pw-state">' + ICONS.fail + '<h3>Оплата не прошла</h3><p>' + esc(st.failText) + '</p>' +
        '<button class="pw-btn pw-btn-primary" data-action="retry">Попробовать снова</button>' +
        '<p class="pw-hint">Если оплата не проходит, отключите VPN</p></div>';
    },

    expired: function () {
      return '<div class="pw-state">' + ICONS.clock + '<h3>Время на оплату истекло</h3><p>QR-код и ссылка больше не действуют. Деньги не списаны.</p>' +
        '<button class="pw-btn pw-btn-primary" data-action="new-sbp">Получить новый код</button>' +
        '<button class="pw-btn pw-btn-outline" data-action="retry" style="margin-top:10px">Выбрать другой способ</button></div>';
    }
  };

  function show(screen) {
    if (destroyed) return;
    st.screen = screen;
    clearTimeout(deeplinkTimer);
    var back = BACK_TO[screen];
    head.innerHTML =
      (back ? '<button class="pw-icon-btn pw-ghost" data-action="back" aria-label="Назад">' + ICONS.back + '</button>' : '') +
      '<h2 class="pw-title">' + TITLES[screen] + '</h2>' +
      (inline ? '' : '<button class="pw-icon-btn" data-action="close" aria-label="Закрыть">' + ICONS.close + '</button>');
    body.setAttribute('data-screen', screen);
    body.innerHTML = SCREENS[screen]();
    body.scrollTop = 0;
    if (screen === 'card' && device === 'desktop') {
      var first = $('#pw-number');
      if (first) first.focus();
    }
    tick();
  }

  function refreshCards() {
    var el = $('[data-cards]');
    if (st.screen === 'methods' && el) show('methods');
  }

  function fail(code, text) {
    st.failCode = code || 'default';
    st.failText = text || FAIL_TEXT[st.failCode] || FAIL_TEXT.default;
    show('error');
  }

  // ---- status handling -------------------------------------------------------
  function finish(status, payment) {
    stopPolling();
    st.result = status;
    var info = {
      paymentId: payment && payment.id, orderId: opts.orderId, amount: opts.amount, currency: currency,
      method: payment && payment.method, status: status, reason: payment && payment.failReason
    };
    if (status === 'success') {
      show('success');
      safeCall(opts.onSuccess, info);
    } else if (status === 'expired') {
      show('expired');
      safeCall(opts.onFail, info);
    } else {
      var reason = payment && payment.failReason;
      if (payment && payment.method === 'sbp' && (!reason || reason === 'declined')) {
        fail('declined', 'Банк не подтвердил оплату. Попробуйте ещё раз или выберите другой способ.');
      } else {
        fail(reason);
      }
      safeCall(opts.onFail, info);
    }
    st.payment = null;
  }

  function safeCall(fn, arg) {
    if (typeof fn !== 'function') return;
    try { fn(arg); } catch (e) { if (window.console) console.error('[PayWidget] callback error', e); }
  }

  function handlePayment(p) {
    if (destroyed || !p) return;
    if (st.payment && st.payment.id !== p.id) return; // a stale answer for an older payment
    st.payment = p;
    if (p.status === 'success' || p.status === 'fail' || p.status === 'expired') return finish(p.status, p);
    if (p.status === 'requires_action' && p.confirmation && st.screen !== 'confirm') show('confirm');
  }

  function check() {
    if (!pending() || checking) return;
    checking = true;
    var id = st.payment.id;
    api.status(id).then(function (p) {
      checking = false;
      if (st.payment && st.payment.id === id) handlePayment(p);
    }, function () { checking = false; });
  }
  function startPolling() { stopPolling(); pollTimer = setInterval(check, POLL_MS); }
  function stopPolling() { clearInterval(pollTimer); pollTimer = null; }

  // Runs every second: updates the countdown and catches local expiry.
  function tick() {
    var el = $('[data-timer]');
    if (!pending() || st.payment.method !== 'sbp' || !st.payment.sbp || !st.payment.sbp.expiresAt) return;
    var left = new Date(st.payment.sbp.expiresAt).getTime() - Date.now();
    if (el) el.textContent = formatTimer(left);
    if (left <= 0) {
      if (!localExpiredAt) { localExpiredAt = Date.now(); check(); }
      // The server is the source of truth, but do not keep a dead QR on screen for long.
      else if (Date.now() - localExpiredAt > 8000) { localExpiredAt = 0; finish('expired', st.payment); }
    }
  }

  function onVisibility() {
    if (!document.hidden) { check(); tick(); }
  }

  // ---- payments --------------------------------------------------------------
  function createPayment(extra) {
    var payload = {
      orderId: opts.orderId, amount: opts.amount, currency: currency, description: opts.description,
      customerId: opts.customerId, signature: opts.signature, device: device, pageUrl: location.href
    };
    if (opts.mock) payload.mock = opts.mock;
    for (var k in extra) payload[k] = extra[k];
    st.payment = null;
    localExpiredAt = 0;
    return api.createPayment(payload, uuid()).then(function (p) {
      if (destroyed) return null;
      st.payment = p;
      startPolling();
      return p;
    });
  }

  function onCreateError(err) {
    if (destroyed) return;
    var code = err && err.code;
    fail(FAIL_TEXT[code] ? code : (err && err.status === 403 ? 'forbidden' : 'network'));
    safeCall(opts.onFail, { orderId: opts.orderId, amount: opts.amount, currency: currency, status: 'fail', reason: code || 'network' });
  }

  function showSbp() {
    if (device === 'mobile') {
      st.loadingText = 'Загружаем список банков…';
      if (!st.banks) show('loading');
      loadBanks(opts.banksUrl || NSPK_BANKS_URL, banksBackup).then(function (res) {
        if (destroyed || !sbpAlive()) return;
        st.banks = res.list;
        st.banksFallback = res.fallback;
        if (st.screen === 'loading' || st.screen === 'methods') show('banks');
      });
    } else {
      st.qrFromMobile = false;
      show('qr');
    }
  }

  function paySbp() {
    if (sbpAlive()) return showSbp(); // reuse the link we already have
    st.loadingText = 'Создаём платёж…';
    show('loading');
    createPayment({ method: 'sbp' }).then(function (p) {
      if (!p) return;
      if (p.status !== 'pending' || !p.sbp || !p.sbp.payload) return handlePayment(p);
      showSbp();
    }, onCreateError);
  }

  function openBank(bank) {
    st.bank = bank;
    storageSet(LAST_BANK_KEY, bank.schema);
    show('bankwait');
    launchDeeplink();
  }

  function launchDeeplink() {
    var link = deeplinkFor(st.bank);
    var handled = false;
    if (typeof opts.onDeeplink === 'function') {
      try { handled = opts.onDeeplink(link, st.bank) === false; } catch (e) { /* ignore */ }
    }
    if (!handled) {
      try { window.location.href = link; } catch (e) { /* unknown scheme */ }
    }
    // A page cannot tell whether the app is installed. If we are still visible
    // after ~2 s, the app most likely did not open: offer the QR as a fallback.
    clearTimeout(deeplinkTimer);
    deeplinkTimer = setTimeout(function () {
      if (destroyed || st.screen !== 'bankwait' || document.hidden) return;
      var fb = $('[data-fallback]');
      if (fb) fb.hidden = false;
    }, DEEPLINK_WAIT_MS);
  }

  function adapter() {
    var name = (st.config && st.config.card && st.config.card.adapter) || 'mock';
    return CARD_ADAPTERS[name] || null;
  }

  function payCard() {
    var a = adapter();
    if (!a) return fail('default', 'Оплата картой сейчас недоступна. Оплатите через СБП.');
    if (a.mode === 'hosted') {
      show('processing');
      createPayment({ method: 'card', saveCard: !!opts.customerId }).then(handlePayment, onCreateError);
    } else {
      show('card');
    }
  }

  function paySaved(cardId) {
    show('processing');
    createPayment({ method: 'card', savedCardId: cardId }).then(handlePayment, onCreateError);
  }

  function setErr(name, text) {
    var el = $('[data-err="' + name + '"]');
    var input = $('[data-mask="' + name + '"]');
    if (el) el.textContent = text || '';
    if (input) input.classList.toggle('pw-invalid', !!text);
    return !text;
  }

  function submitCard() {
    var numberEl = $('[data-mask="number"]'), expEl = $('[data-mask="expiry"]'), cvcEl = $('[data-mask="cvc"]');
    var number = onlyDigits(numberEl.value), exp = parseExpiry(expEl.value), cvc = onlyDigits(cvcEl.value);
    var ok = true;
    ok = setErr('number', number.length < 13 ? 'Введите номер карты' : (luhnValid(number) ? '' : 'Проверьте номер карты')) && ok;
    ok = setErr('expiry', exp ? '' : 'Проверьте срок') && ok;
    ok = setErr('cvc', cvc.length === 3 ? '' : 'Введите 3 цифры с обратной стороны карты') && ok;
    if (!ok) return;
    var saveEl = $('[data-save]');
    var saveCard = !!(saveEl && saveEl.checked && opts.customerId);
    var card = { number: number, month: exp.month, year: exp.year, cvc: cvc };
    // Wipe the fields at once: card data must not linger in the page.
    numberEl.value = expEl.value = cvcEl.value = '';
    show('processing');
    adapter().tokenize(card, (st.config && st.config.card) || {}).then(function (token) {
      card = null;
      if (destroyed) return;
      return createPayment({ method: 'card', cardToken: token, saveCard: saveCard }).then(handlePayment);
    }).catch(function (err) {
      card = null;
      onCreateError(err && err.message === 'script_load_failed' ? { code: 'script_load_failed' } : err);
    });
  }

  function loadCards() {
    if (!opts.customerId) { st.cards = []; return; }
    api.cards(opts.customerId).then(function (res) { st.cards = (res && res.cards) || []; }, function () { st.cards = []; })
      .then(function () { if (!destroyed) refreshCards(); });
  }

  // ---- events ----------------------------------------------------------------
  var ACTIONS = {
    close: function () { close(); },
    done: function () { close(); },
    back: function () {
      if (st.screen === 'qr' && st.qrFromMobile) return show('banks');
      show(BACK_TO[st.screen] || 'methods');
    },
    'pay-sbp': paySbp,
    'pay-card': payCard,
    'pay-saved': function (el) { paySaved(el.getAttribute('data-id')); },
    'ask-delete': function (el) { st.confirmDelete = el.getAttribute('data-id'); show('methods'); },
    'cancel-delete': function () { st.confirmDelete = null; show('methods'); },
    'do-delete': function (el) {
      var id = el.getAttribute('data-id');
      el.disabled = true;
      api.deleteCard(opts.customerId, id).then(function () {
        st.cards = (st.cards || []).filter(function (c) { return c.id !== id; });
        st.confirmDelete = null;
        show('methods');
        toast('Карта удалена');
      }, function () {
        st.confirmDelete = null;
        show('methods');
        toast('Не получилось удалить карту. Попробуйте ещё раз.');
      });
    },
    bank: function (el) {
      var bank = findBank(el.getAttribute('data-schema'));
      if (bank && sbpAlive()) openBank(bank); else if (bank) paySbp();
    },
    'reopen-bank': function () { if (sbpAlive()) launchDeeplink(); },
    'other-bank': function () { show('banks'); },
    'show-qr': function () { st.qrFromMobile = true; show('qr'); },
    retry: function () { st.confirmDelete = null; show('methods'); loadCards(); },
    'new-sbp': paySbp
  };

  // клик по подложке закрывает окно, только если и нажатие было на подложке (не выделение текста из поля)
  var downOut = false;
  function onClick(e) {
    if (!inline && e.target === overlay) { var d = downOut; downOut = false; if (d) close(); return; }
    var el = e.target.closest ? e.target.closest('[data-action]') : null;
    if (!el || el.disabled) return;
    var fn = ACTIONS[el.getAttribute('data-action')];
    if (fn) fn(el);
  }

  function onInput(e) {
    var el = e.target;
    if (el.hasAttribute('data-bank-search')) {
      var q = el.value.trim().toLowerCase();
      var rows = root.querySelectorAll('.pw-bank-row');
      var shown = 0;
      for (var i = 0; i < rows.length; i++) {
        var match = !q || rows[i].getAttribute('data-name').indexOf(q) !== -1;
        rows[i].hidden = !match;
        if (match) shown++;
      }
      var empty = $('[data-empty]');
      if (empty) empty.hidden = shown > 0;
      return;
    }
    var mask = el.getAttribute('data-mask');
    if (!mask) return;
    if (mask === 'number') {
      // keep the caret in place while re-inserting spaces
      var digitsBefore = onlyDigits(el.value.slice(0, el.selectionStart)).length;
      el.value = formatCardNumber(el.value);
      var pos = 0, seen = 0;
      while (pos < el.value.length && seen < digitsBefore) { if (/\d/.test(el.value.charAt(pos))) seen++; pos++; }
      try { el.setSelectionRange(pos, pos); } catch (err) { /* not focusable */ }
      var digits = onlyDigits(el.value);
      $('[data-brand]').innerHTML = brandIcon(cardBrand(digits));
      setErr('number', '');
      if (digits.length >= 16 && luhnValid(digits) && pos === el.value.length) $('[data-mask="expiry"]').focus();
    } else if (mask === 'expiry') {
      var deleting = e.inputType && e.inputType.indexOf('delete') === 0;
      if (!deleting) el.value = formatExpiry(el.value);
      setErr('expiry', '');
      if (el.value.length === 5 && parseExpiry(el.value)) $('[data-mask="cvc"]').focus();
    } else if (mask === 'cvc') {
      el.value = onlyDigits(el.value).slice(0, 3); // Mir, Visa and Mastercard all use 3 digits
      setErr('cvc', '');
    }
  }

  function onSubmit(e) {
    if (e.target.hasAttribute('data-card-form')) { e.preventDefault(); submitCard(); }
  }

  function onImgError(e) {
    var img = e.target;
    if (!img || img.tagName !== 'IMG' || !img.classList.contains('pw-bank-logo')) return;
    var span = document.createElement('span');
    span.className = 'pw-bank-letter';
    span.textContent = (img.getAttribute('data-letter') || '?').toUpperCase();
    if (img.parentNode) img.parentNode.replaceChild(span, img);
  }

  function onKey(e) {
    if (e.key === 'Escape' && !inline) close();
  }

  // ---- lifecycle -------------------------------------------------------------
  function close() {
    if (destroyed) return;
    var status = st.result === 'pending' && !pending() ? 'closed' : st.result;
    destroy();
    safeCall(opts.onClose, { orderId: opts.orderId, status: status });
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stopPolling();
    clearInterval(tickTimer);
    clearTimeout(deeplinkTimer);
    clearTimeout(toastTimer);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('keydown', onKey);
    if (!inline && prevOverflow !== null) document.documentElement.style.overflow = prevOverflow;
    if (host.parentNode) host.parentNode.removeChild(host);
  }

  root.addEventListener('pointerdown', function (e) { downOut = e.target === overlay; });
  root.addEventListener('click', onClick);
  root.addEventListener('input', onInput);
  root.addEventListener('submit', onSubmit);
  root.addEventListener('error', onImgError, true);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('keydown', onKey);
  tickTimer = setInterval(tick, 1000);

  if (inline) {
    mountTarget.appendChild(host);
  } else {
    document.body.appendChild(host);
    prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
  }

  show('methods');
  if (!inline) sheet.focus({ preventScroll: true });
  api.config().then(function (cfg) { st.config = cfg || {}; }, function () { st.config = {}; });
  loadCards();
  if (device === 'mobile') loadBanks(opts.banksUrl || NSPK_BANKS_URL, banksBackup); // warm up the bank list

  return {
    close: close,
    destroy: destroy,
    element: host,
    getState: function () { return { screen: st.screen, device: device, payment: st.payment, result: st.result }; }
  };
}

// ---- src/index.js ----
/* ---------------------------------------------------------------------------
 * Public API: PayWidget.open(options) and PayWidget.mount(selector, options).
 * ------------------------------------------------------------------------- */
var current = null;

function validate(options) {
  if (!options || typeof options !== 'object') throw new Error('PayWidget: options are required');
  if (!options.backendUrl) throw new Error('PayWidget: backendUrl is required');
  if (options.orderId == null || options.orderId === '') throw new Error('PayWidget: orderId is required');
  var amount = Number(options.amount);
  if (!isFinite(amount) || amount <= 0) throw new Error('PayWidget: amount must be a positive number (in rubles)');
  if (!document.body) throw new Error('PayWidget: call after the page <body> is available');
}

var PayWidget = {
  version: '1.0.0',

  /** Opens the payment sheet (bottom sheet on phones, centered modal on desktop). */
  open: function (options) {
    validate(options);
    if (current) current.destroy();
    var userClose = options.onClose;
    var opts = {};
    for (var k in options) opts[k] = options[k];
    var instance;
    opts.onClose = function (info) {
      if (current === instance) current = null;
      if (typeof userClose === 'function') userClose(info);
    };
    instance = createWidget(opts, null);
    current = instance;
    return instance;
  },

  /** Renders the widget inside a container instead of a modal. */
  mount: function (target, options) {
    validate(options);
    var el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) throw new Error('PayWidget: container not found: ' + target);
    var instance = createWidget(options, el);
    return { unmount: instance.destroy, element: instance.element, getState: instance.getState };
  },

  close: function () { if (current) current.close(); },

  registerCardAdapter: registerCardAdapter,

  // exposed for tests and for reuse on the host site
  utils: {
    formatAmount: formatAmount, luhnValid: luhnValid, cardBrand: cardBrand, detectDevice: detectDevice,
    qrSvg: QR.toSvg, qrEncode: QR.encode
  }
};

PayWidget.version = "1.0.0";
if (typeof module === 'object' && module.exports) module.exports = PayWidget;
global.PayWidget = PayWidget;
})(typeof window !== 'undefined' ? window : this);
