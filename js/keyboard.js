/* =====================================================================
   Callia OS · keyboard.js
   键盘安全层：判断软键盘弹出时系统采取哪种方式，并让手机壳贴合可见区域。
   · resize 视口会自己变矮（CSS 已经跟随，只需标记 html[data-kb]）
   · pan    视口不变、系统把整页往上推（必须主动把壳层压到键盘上方）
   模式第一次探测后写入本地存档，之后每次聚焦都能提前处理，
   顶部导航栏与底部返回条不会再跟着整页一起上浮。
   只使用触摸事件与聚焦事件，不依赖任何实体键盘按键。
   ===================================================================== */
(function (global) {
  "use strict";

  var doc = document;
  var root = doc.documentElement;
  var KEY = "callia.kbmode";
  var JUMP = 60; /* 小于这个高度差不算键盘 */

  var mode = ""; /* "" 未知 | resize | pan */
  var baseH = 0; /* 键盘收起时的视口高度 */
  var focused = null;
  var timers = [];

  try {
    mode = global.localStorage.getItem(KEY) || "";
  } catch (err) {
    mode = "";
  }
  if (mode !== "resize" && mode !== "pan") mode = "";

  /* ---------- 小工具 ---------- */
  function store() {
    try {
      global.localStorage.setItem(KEY, mode);
    } catch (err) {
      /* 隐私模式写不进去也不影响本次会话 */
    }
  }

  function viewH() {
    return Math.round(global.innerHeight || root.clientHeight || 0);
  }

  function visibleH() {
    var vv = global.visualViewport;
    if (vv && vv.height) return Math.round(vv.height);
    return viewH();
  }

  function on(node, type, fn, opt) {
    if (node) node.addEventListener(type, fn, opt || false);
  }

  function clearTimers() {
    timers.forEach(function (t) {
      global.clearTimeout(t);
    });
    timers = [];
  }

  function later(fn, ms) {
    timers.push(global.setTimeout(fn, ms));
  }

  /* 可编辑元素：只有真正会唤起软键盘的控件才算 */
  function editable(node) {
    var el = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!el || typeof el.closest !== "function") return null;
    var box = el.closest("input, textarea, [contenteditable]");
    if (!box) return null;
    if (box.tagName === "INPUT") {
      var type = (box.getAttribute("type") || "text").toLowerCase();
      var kinds = ["text", "search", "email", "url", "tel", "number", "password"];
      if (kinds.indexOf(type) < 0) return null;
    } else if (box.tagName !== "TEXTAREA" && !box.isContentEditable) {
      return null;
    }
    if (box.disabled || box.readOnly) return null;
    return box;
  }

  /* 系统不给任何提示时的键盘高度估计：按屏幕比例取一个偏保守的值 */
  function liftH() {
    var h = baseH || viewH();
    if (!h) return 0;
    return Math.max(180, Math.min(430, Math.round(h * 0.42)));
  }

  /* ---------- 状态写入 ---------- */
  function setShell(px) {
    if (px > 0) root.style.setProperty("--kb-shell-h", px + "px");
    else root.style.removeProperty("--kb-shell-h");
  }

  function markPan(shellPx) {
    root.setAttribute("data-kb", "pan");
    setShell(Math.max(240, shellPx));
  }

  function markResize() {
    root.setAttribute("data-kb", "on");
    root.style.removeProperty("--kb-shell-h");
  }

  function release() {
    root.removeAttribute("data-kb");
    root.style.removeProperty("--kb-shell-h");
  }

  /* 兜底：万一文档还是被滚了一点，立刻按回去 */
  function resetScroll() {
    if (global.scrollY || global.scrollX) global.scrollTo(0, 0);
  }

  /* ---------- 模式判定 ---------- */
  function detect(finalRound) {
    if (!focused) return;
    var now = viewH();
    if (!baseH) baseH = now;

    if (baseH - now > JUMP) {
      mode = "resize";
      store();
      markResize();
      resetScroll();
      return;
    }

    var vis = visibleH();
    if (now - vis > JUMP) {
      mode = "pan";
      store();
      markPan(vis);
      resetScroll();
      return;
    }

    /* 键盘可能还没弹完，第一轮先不下结论 */
    if (!finalRound) return;

    if (mode !== "resize") {
      mode = "pan";
      store();
      markPan(now - liftH());
    }
    resetScroll();
  }

  /* 已知是平移模式时，在聚焦之前就把壳层压下去，系统便没有上推的理由 */
  function preLift() {
    if (mode !== "pan") return;
    markPan((baseH || viewH()) - liftH());
  }

  /* ---------- 事件 ---------- */
  function bind() {
    on(
      doc,
      "pointerdown",
      function (ev) {
        if (editable(ev.target)) preLift();
      },
      true
    );

    on(
      doc,
      "focusin",
      function (ev) {
        var box = editable(ev.target);
        if (!box) return;
        focused = box;
        clearTimers();
        preLift();
        later(function () {
          detect(false);
        }, 220);
        later(function () {
          detect(true);
        }, 560);
      },
      true
    );

    on(
      doc,
      "focusout",
      function (ev) {
        if (!focused || !editable(ev.target)) return;
        focused = null;
        clearTimers();
        later(function () {
          if (focused) return;
          if (editable(doc.activeElement)) return;
          release();
          baseH = viewH();
        }, 340);
      },
      true
    );

    on(global, "resize", function () {
      if (focused) return;
      baseH = viewH();
      release();
    });

    var vv = global.visualViewport;
    if (vv && typeof vv.addEventListener === "function") {
      vv.addEventListener("resize", function () {
        if (!focused) baseH = viewH();
        else detect(true);
      });
      vv.addEventListener("scroll", resetScroll);
    }

    on(global, "scroll", resetScroll);
  }

  function start() {
    baseH = viewH();
    bind();
  }

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  global.CalliaKeyboard = {
    mode: function () {
      return mode;
    },
    baseHeight: function () {
      return baseH;
    },
    visibleHeight: visibleH
  };
})(window);
