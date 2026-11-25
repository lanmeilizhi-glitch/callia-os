/* ============================================================
   聊天气泡样式：纯原生 DOM 交互
   · 弹窗结构是 index.html 里的静态标记，本文件不拼接任何 HTML
   · 只使用 document / localStorage / classList，不调用任何外部函数
   ============================================================ */
(function () {
  "use strict";

  var KEY = "bubble_style";
  var NAMES = {
    plain: "极简白",
    glass: "毛玻璃",
    gradient: "柔和渐变",
    dark: "暗黑质感"
  };

  function getModal() {
    return document.getElementById("bubble-modal");
  }

  function readStyle() {
    var v = "";
    try {
      v = window.localStorage.getItem(KEY) || "";
    } catch (e) {
      v = "";
    }
    if (!NAMES[v]) {
      v = "plain";
    }
    return v;
  }

  function writeStyle(id) {
    try {
      window.localStorage.setItem(KEY, id);
    } catch (e) {
      /* 本机存储不可用时静默降级，不阻断界面 */
    }
  }

  /* 弹窗里高亮当前样式 */
  function markSelected(id) {
    var m = getModal();
    if (!m) return;
    var opts = m.querySelectorAll("[data-style]");
    for (var i = 0; i < opts.length; i++) {
      var on = opts[i].getAttribute("data-style") === id;
      if (on) {
        opts[i].classList.add("is-on");
      } else {
        opts[i].classList.remove("is-on");
      }
      opts[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  /* 设置主页那一行右侧的当前样式名（与“桌面壁纸”行共用 set-row__value 排版） */
  function syncRowLabel() {
    var label = document.getElementById("current-bubble-label");
    if (!label) return;
    var text = NAMES[readStyle()];
    if (label.textContent !== text) {
      label.textContent = text;
    }
  }

  function openModal() {
    var m = getModal();
    if (!m) return;
    markSelected(readStyle());
    m.style.display = "flex";
  }

  function closeModal() {
    var m = getModal();
    if (!m) return;
    m.style.display = "none";
  }

  /* 设置页每次打开都会重建那一行，所以统一用事件委托 */
  document.addEventListener("click", function (ev) {
    var el = ev.target;
    if (!el || !el.closest) return;

    if (el.closest("[data-bubble-open]")) {
      openModal();
      return;
    }

    if (el.closest("[data-bubble-close]")) {
      closeModal();
      return;
    }

    var opt = el.closest("#bubble-modal [data-style]");
    if (opt) {
      var id = opt.getAttribute("data-style");
      if (!NAMES[id]) {
        id = "plain";
      }
      writeStyle(id);
      markSelected(id);
      syncRowLabel();
      closeModal();
    }
  });

  /* 设置页重渲染后把右侧文字同步成当前样式名 */
  function watchSettings() {
    var root = document.getElementById("app-root");
    if (!root || typeof MutationObserver !== "function") return;
    var ob = new MutationObserver(function () {
      syncRowLabel();
    });
    ob.observe(root, { childList: true, subtree: true });
  }

  syncRowLabel();
  watchSettings();
})();