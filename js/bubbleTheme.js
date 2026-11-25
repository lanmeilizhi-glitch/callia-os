/* =====================================================================
   Callia OS · bubbleTheme.js
   聊天气泡材质自定义：纯前端 UI，不碰任何聊天记录读写接口。
   · 材质状态存 localStorage（键 bubble_theme），刷新或重进聊天页都会恢复
   · 顶栏调色盘按钮 → 半屏面板（复用 base.css 的 .sheet 组件）
   · 「我的气泡 / Ta的气泡」两个标签分别设置，材质 class 只加在对应角色的气泡上
   ===================================================================== */
(function (global) {
  "use strict";

  var S = global.COS || {};
  var KEY = "bubble_theme";

  var MATERIALS = [
    { key: "plain", name: "默认", hint: "系统原色" },
    { key: "glass", name: "毛玻璃", hint: "半透明 + 模糊" },
    { key: "gradient", name: "渐变", hint: "柔和渐变色" },
    { key: "paper", name: "纸张", hint: "微透 + 内阴影" },
    { key: "dark", name: "暗黑磨砂", hint: "深灰底白字" }
  ];

  var ROLES = [
    { key: "me", name: "我的气泡" },
    { key: "ai", name: "Ta的气泡" }
  ];

  var state = { me: "plain", ai: "plain" };
  var active = "me";

  /* ---------- 材质表 ---------- */
  function isMat(v) {
    for (var i = 0; i < MATERIALS.length; i += 1) {
      if (MATERIALS[i].key === v) return true;
    }
    return false;
  }

  function matName(key) {
    for (var i = 0; i < MATERIALS.length; i += 1) {
      if (MATERIALS[i].key === key) return MATERIALS[i].name;
    }
    return "默认";
  }

  function roleKey(v) {
    return v === "ai" ? "ai" : "me";
  }

  /* ---------- localStorage：读写都容错，隐私模式或禁用存储时不报错 ---------- */
  function load() {
    var raw = "";
    try {
      raw = global.localStorage ? String(global.localStorage.getItem(KEY) || "") : "";
    } catch (e) {
      raw = "";
    }
    if (!raw) return;
    if (raw.charAt(0) === "{") {
      try {
        var obj = JSON.parse(raw);
        if (obj && isMat(obj.me)) state.me = obj.me;
        if (obj && isMat(obj.ai)) state.ai = obj.ai;
      } catch (e2) {
        /* 存坏了就退回默认材质 */
      }
      return;
    }
    /* 兼容单值写法：localStorage.setItem("bubble_theme", "glass") */
    if (isMat(raw)) {
      state.me = raw;
      state.ai = raw;
    }
  }

  function save() {
    try {
      if (global.localStorage) global.localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      /* 存不进去也只是下次进来回到默认，不影响聊天 */
    }
  }

  /* ---------- 材质 class ---------- */
  /* 供 apps.js 拼气泡时调用：返回带前导空格的 class，默认材质返回空串 */
  function cls(role) {
    var key = state[roleKey(role)];
    return !key || key === "plain" ? "" : " bubble-" + key;
  }

  function setMat(el, key) {
    for (var i = 0; i < MATERIALS.length; i += 1) {
      if (MATERIALS[i].key !== "plain") el.classList.remove("bubble-" + MATERIALS[i].key);
    }
    if (key && key !== "plain") el.classList.add("bubble-" + key);
  }

  /* 只刷新消息区里对应角色的气泡，面板里的示例气泡不受影响 */
  function apply(root) {
    var log = root && root.querySelector ? root.querySelector("#chat-log") : S.el("#chat-log");
    if (!log) return;
    for (var r = 0; r < ROLES.length; r += 1) {
      var role = ROLES[r].key;
      var list = log.querySelectorAll(".msg--" + role + " .msg__bubble");
      for (var i = 0; i < list.length; i += 1) setMat(list[i], state[role]);
    }
  }

  /* ---------- 顶栏入口 ---------- */
  function entryHTML() {
    return (
      '<button class="chat__theme" type="button" id="chat-bubble-theme" aria-label="设置气泡材质" aria-haspopup="dialog">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 3.6a8.4 8.4 0 1 0 0 16.8c1.2 0 1.9-.8 1.9-1.7 0-.9-.7-1.5-.7-2.2 0-.8.7-1.4 1.6-1.4h1.6a3.9 3.9 0 0 0 3.9-3.9C20.3 6.4 16.6 3.6 12 3.6z"></path>' +
      '<circle cx="8.1" cy="9.4" r="1.05" fill="currentColor" stroke="none"></circle>' +
      '<circle cx="12" cy="7.4" r="1.05" fill="currentColor" stroke="none"></circle>' +
      '<circle cx="7.4" cy="13.4" r="1.05" fill="currentColor" stroke="none"></circle>' +
      "</svg>" +
      "</button>"
    );
  }

  /* ---------- 面板内容 ---------- */
  function demo(role, matKey, text) {
    var extra = matKey && matKey !== "plain" ? " bubble-" + matKey : "";
    /* 示例气泡用 span：面板里的示例要放进 button，span 才是合法内容 */
    return (
      '<span class="msg msg--' + role + '"><span class="msg__bubble' + extra + '">' + text + "</span></span>"
    );
  }

  function tabsHTML() {
    var out = "";
    for (var i = 0; i < ROLES.length; i += 1) {
      var r = ROLES[i];
      var on = r.key === active;
      out +=
        '<button class="btheme-tab' + (on ? " is-on" : "") + '" type="button" role="tab" data-bt-role="' +
        r.key + '" aria-selected="' + (on ? "true" : "false") + '">' + r.name + "</button>";
    }
    return '<div class="btheme-tabs" role="tablist" aria-label="选择要修改的气泡">' + out + "</div>";
  }

  function previewsHTML() {
    var mat = state[active];
    var role = active;
    return (
      '<div class="btheme-previews">' +
      '<div class="btheme-preview btheme-preview--light">' + demo(role, mat, "今天也一起过") +
      '<p class="btheme-preview__cap">浅色背景图</p></div>' +
      '<div class="btheme-preview btheme-preview--dark">' + demo(role, mat, "今天也一起过") +
      '<p class="btheme-preview__cap">深色背景图</p></div>' +
      "</div>"
    );
  }

  function gridHTML() {
    var out = "";
    for (var i = 0; i < MATERIALS.length; i += 1) {
      var m = MATERIALS[i];
      var on = state[active] === m.key;
      out +=
        '<button class="btheme-swatch' + (on ? " is-on" : "") + '" type="button" data-bt-mat="' + m.key +
        '" aria-pressed="' + (on ? "true" : "false") + '">' +
        '<i class="btheme-swatch__dot" aria-hidden="true"></i>' +
        '<span class="btheme-swatch__demo">' + demo(active, m.key, "Aa") + "</span>" +
        '<span class="btheme-swatch__name">' + m.name + "</span>" +
        '<span class="btheme-swatch__hint">' + m.hint + "</span>" +
        "</button>";
    }
    return '<div class="btheme-grid" role="group" aria-label="材质列表">' + out + "</div>";
  }

  function panelHTML() {
    return (
      '<div class="sheet btheme-sheet" id="bubble-sheet" hidden>' +
      '<div class="sheet__mask" data-bt-close="1"></div>' +
      '<div class="sheet__panel" role="dialog" aria-modal="true" aria-label="聊天气泡材质">' +
      '<div class="sheet__handle" aria-hidden="true"></div>' +
      '<div class="sheet__head"><p>气泡材质</p>' +
      '<button class="chip chip--ghost" type="button" data-bt-close="1">完成</button></div>' +
      '<p class="sheet__hint">分别给你和 Ta 挑一种气泡材质，选择记在本机，下次打开聊天页仍然生效。</p>' +
      '<div class="btheme-inner">' + tabsHTML() + previewsHTML() + gridHTML() + "</div>" +
      "</div></div>"
    );
  }

  /* ---------- 面板交互 ---------- */
  function paint(sheet) {
    var inner = sheet.querySelector(".btheme-inner");
    if (!inner) return;
    inner.innerHTML = tabsHTML() + previewsHTML() + gridHTML();
  }

  function open(root) {
    var sheet = root && root.querySelector ? root.querySelector("#bubble-sheet") : S.el("#bubble-sheet");
    if (!sheet) {
      if (S.os && S.os.toast) S.os.toast("材质面板暂时打不开");
      return;
    }
    paint(sheet);
    sheet.hidden = false;
  }

  function close(sheet) {
    if (sheet) sheet.hidden = true;
  }

  /* 聊天页每次重绘都会重建 root，这里按当前元素绑定一次即可 */
  function mount(root) {
    if (!root || !root.querySelector) return;
    apply(root);

    var sheet = root.querySelector("#bubble-sheet");
    if (!sheet) {
      root.insertAdjacentHTML("beforeend", panelHTML());
      sheet = root.querySelector("#bubble-sheet");
    }
    if (!sheet || sheet.getAttribute("data-bt-bound") === "1") return;
    sheet.setAttribute("data-bt-bound", "1");

    sheet.addEventListener("click", function (ev) {
      var target = ev.target;
      if (!target || !target.closest) return;

      if (target.closest("[data-bt-close]")) {
        close(sheet);
        return;
      }

      var tab = target.closest("[data-bt-role]");
      if (tab) {
        active = roleKey(tab.getAttribute("data-bt-role"));
        paint(sheet);
        return;
      }

      var swatch = target.closest("[data-bt-mat]");
      if (!swatch) return;
      var key = swatch.getAttribute("data-bt-mat");
      if (!isMat(key)) return;
      state[active] = key;
      save();
      apply(root);
      paint(sheet);
      if (S.os && S.os.toast) {
        S.os.toast((active === "ai" ? "Ta的气泡" : "我的气泡") + " · " + matName(key));
      }
    });
  }

  load();

  S.bubbleTheme = {
    MATERIALS: MATERIALS,
    cls: cls,
    apply: apply,
    entryHTML: entryHTML,
    mount: mount,
    open: open,
    close: close,
    current: function (role) {
      return state[roleKey(role)];
    }
  };
})(window);