/* Web3 Sims — compatibility shims for older phones (iOS Safari < 16, Android WebView/Chrome < 99). Loaded first. */
(function () {
  'use strict';
  function roundRectPath(x, y, w, h, r) {
    if (w < 0) { x += w; w = -w; }
    if (h < 0) { y += h; h = -h; }
    if (typeof r === 'object' && r !== null) r = r.length ? r[0] : (r.x || 0);
    r = Math.max(0, Math.min(+r || 0, w / 2, h / 2));
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.arcTo(x + w, y, x + w, y + r, r);
    this.lineTo(x + w, y + h - r);
    this.arcTo(x + w, y + h, x + w - r, y + h, r);
    this.lineTo(x + r, y + h);
    this.arcTo(x, y + h, x, y + h - r, r);
    this.lineTo(x, y + r);
    this.arcTo(x, y, x + r, y, r);
    this.closePath();
  }
  try {
    if (window.CanvasRenderingContext2D && !CanvasRenderingContext2D.prototype.roundRect) CanvasRenderingContext2D.prototype.roundRect = roundRectPath;
    if (window.Path2D && !Path2D.prototype.roundRect) Path2D.prototype.roundRect = roundRectPath;
    if (window.CanvasRenderingContext2D && !CanvasRenderingContext2D.prototype.ellipse) {
      CanvasRenderingContext2D.prototype.ellipse = function (x, y, rx, ry, rot, a0, a1, ccw) {
        this.save(); this.translate(x, y); this.rotate(rot || 0); this.scale(rx || 1e-6, ry || 1e-6); this.arc(0, 0, 1, a0, a1, ccw); this.restore();
      };
    }
  } catch (e) {}
  if (window.Element && !Element.prototype.matches) Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
  if (window.Element && !Element.prototype.closest) Element.prototype.closest = function (s) { var el = this; while (el && el.nodeType === 1) { if (el.matches(s)) return el; el = el.parentElement; } return null; };
  if (window.Element && !Element.prototype.remove) Element.prototype.remove = function () { if (this.parentNode) this.parentNode.removeChild(this); };
  if (window.Element && !Element.prototype.prepend) Element.prototype.prepend = function (n) { this.insertBefore(n, this.firstChild); };
  if (!String.prototype.padStart) String.prototype.padStart = function (len, pad) { var s = String(this); pad = pad == null ? ' ' : String(pad); while (s.length < len) s = pad + s; return s.slice(-Math.max(len, String(this).length)); };
  if (!Object.entries) Object.entries = function (o) { return Object.keys(o).map(function (k) { return [k, o[k]]; }); };
  if (!Object.values) Object.values = function (o) { return Object.keys(o).map(function (k) { return o[k]; }); };
  if (!Math.hypot) Math.hypot = function (a, b) { return Math.sqrt(a * a + b * b); };
  if (window.NodeList && !NodeList.prototype.forEach) NodeList.prototype.forEach = Array.prototype.forEach;
  if (window.NodeList && typeof Symbol !== 'undefined' && Symbol.iterator && !NodeList.prototype[Symbol.iterator]) NodeList.prototype[Symbol.iterator] = Array.prototype[Symbol.iterator];
  if (window.HTMLCollection && typeof Symbol !== 'undefined' && Symbol.iterator && !HTMLCollection.prototype[Symbol.iterator]) HTMLCollection.prototype[Symbol.iterator] = Array.prototype[Symbol.iterator];
  if (!window.requestAnimationFrame) window.requestAnimationFrame = function (f) { return setTimeout(function () { f(Date.now()); }, 16); };
  if (!window.performance || !performance.now) { window.performance = window.performance || {}; var t0 = Date.now(); performance.now = function () { return Date.now() - t0; }; }
})();
