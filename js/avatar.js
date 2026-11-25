/* =====================================================================
   Callia OS · avatar.js
   伴侣头像：写死的预设 Emoji + 柔和底色，点头像按顺序切换，只存本机 localStorage
   ===================================================================== */
(function (global) {
  "use strict";

  var S = global.COS;
  var el = S.el;

  function on(node, type, fn) {
    if (node) node.addEventListener(type, fn, false);
  }

  /* 只存一个 Emoji 字符，刷新页面能读回来 */
  var STORE_KEY = "zane_avatar";

  /* ---------- 预设头像：写死的 Emoji + 柔和底色，不读本机文件 ---------- */
  var PRESETS = [
    { id: "galaxy", name: "星河", emoji: "🌌", bg: ["#2c3049", "#171a28"] },
    { id: "book", name: "书页", emoji: "📖", bg: ["#f4ece0", "#e0d2ba"] },
    { id: "coffee", name: "温咖啡", emoji: "☕", bg: ["#f7e9d7", "#e3c9a6"] },
    { id: "sparkle", name: "微光", emoji: "✨", bg: ["#eef1f8", "#d5dbee"] },
    { id: "leaf", name: "青叶", emoji: "🌿", bg: ["#eef4ec", "#d3e3d5"] },
    { id: "moon", name: "月亮", emoji: "🌙", bg: ["#f1ecf8", "#d8d1ec"] }
  ];

  /* Emoji 画进 SVG：桌面、锁屏、通话、聊天里的 <img class="avatar-face"> 都能直接用 */
  function presetSVG(spec) {
    if (!spec) return "";
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1">' +
      '<stop offset="0" stop-color="' + spec.bg[0] + '"/>' +
      '<stop offset="1" stop-color="' + spec.bg[1] + '"/>' +
      "</linearGradient></defs>" +
      '<rect width="120" height="120" fill="url(#g)"/>' +
      '<text x="60" y="80" font-size="62" text-anchor="middle">' + spec.emoji + "</text>" +
      "</svg>";
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function presetById(id) {
    var hit = PRESETS.filter(function (p) {
      return p.id === id;
    })[0];
    return hit || null;
  }

  /* ---------- 状态：localStorage 里只存一个 Emoji 字符 ---------- */
  function readEmoji() {
    var v = null;
    try {
      if (global.localStorage) v = global.localStorage.getItem(STORE_KEY);
    } catch (err) {
      v = null;
    }
    if (typeof v === "string") return v;
    /* 旧版本存在伴侣档案里，读一次当作初始值 */
    var c = S && S.store && S.store.companion ? S.store.companion : null;
    return c && c.avatar && typeof c.avatar.emoji === "string" ? c.avatar.emoji : "";
  }

  function writeEmoji(emoji) {
    try {
      if (global.localStorage) global.localStorage.setItem(STORE_KEY, emoji || "");
    } catch (err) {
      /* 隐私模式或存储写满时，本次打开仍然看得到 */
    }
    var c = S && S.store && S.store.companion ? S.store.companion : null;
    if (c) c.avatar = { kind: "emoji", emoji: emoji || "" };
  }

  function currentSpec() {
    var emoji = readEmoji();
    if (!emoji) return null;
    for (var i = 0; i < PRESETS.length; i += 1) {
      if (PRESETS[i].emoji === emoji) return PRESETS[i];
    }
    return null;
  }

  function current() {
    var spec = currentSpec();
    return spec ? presetSVG(spec) : "";
  }

  function currentEmoji() {
    var spec = currentSpec();
    return spec ? spec.emoji : "";
  }

  function isActive() {
    return !!currentSpec();
  }

  /* ---------- 绘制到桌面 / 锁屏 / 通话 ---------- */
  var TARGETS = [
    { orb: "#home-orb", face: "#home-avatar" },
    { orb: "#lock-orb", face: "#lock-avatar" },
    { orb: "#call-orb", face: "#call-avatar" }
  ];

  function paint() {
    var src = current();
    TARGETS.forEach(function (t) {
      var orb = el(t.orb);
      var face = el(t.face);
      if (!orb || !face) return;
      if (src) {
        if (face.getAttribute("src") !== src) face.setAttribute("src", src);
        face.removeAttribute("hidden");
      } else {
        face.setAttribute("hidden", "");
      }
      orb.classList.toggle("has-avatar", !!src);
    });
  }

  /* ---------- 写入 ---------- */
  function apply(spec, message) {
    writeEmoji(spec ? spec.emoji : "");
    paint();
    if (S.os) {
      if (typeof S.os.haptic === "function") S.os.haptic(8);
      if (typeof S.os.toast === "function") S.os.toast(message);
    }
    return true;
  }

  function setPreset(id) {
    var spec = presetById(id);
    if (!spec) return;
    apply(spec, "头像已换成「" + spec.name + "」");
  }

  /* 点一下换下一个：光球 → 🌌 → 📖 → ☕ → ✨ → 🌿 → 🌙 → 光球 */
  function cycle() {
    var now = currentEmoji();
    var idx = -1;
    for (var i = 0; i < PRESETS.length; i += 1) {
      if (PRESETS[i].emoji === now) {
        idx = i;
        break;
      }
    }
    if (idx >= PRESETS.length - 1) {
      apply(null, "已换回伴侣原本的光球形象");
      return;
    }
    var next = PRESETS[idx + 1];
    apply(next, "头像已换成「" + next.name + "」");
  }

  function resetAvatar() {
    if (!currentEmoji()) {
      if (S.os && typeof S.os.toast === "function") S.os.toast("现在就是伴侣原本的光球形象");
      return;
    }
    apply(null, "已恢复伴侣的光球形象");
  }

  /* ---------- 头像不再读本机文件：不裁图、不转码、不弹相册 ---------- */

  /* 预设头像只靠下面的 cycle 切换，不再接收任何文件输入 */

  /* ---------- 头像弹层已取消：点头像就是换下一个预设 ---------- */

  /* 保留旧调用点：open() 现在就是换下一个预设头像 */
  function isOpen() {
    return false;
  }

  function open() {
    cycle();
  }

  function close() {}

  /* 恢复出厂设置时连本机头像一起清掉 */
  function hookReset() {
    if (!S || S.__avatarResetHooked || typeof S.reset !== "function") return;
    S.__avatarResetHooked = true;
    var orig = S.reset;
    S.reset = function () {
      writeEmoji("");
      var out = orig.apply(S, arguments);
      paint();
      return out;
    };
  }

  /* 弹层没了，bind 只负责挂上恢复出厂的钩子 */
  function bind() {
    hookReset();
  }

  S.avatar = {
    presets: PRESETS,
    presetURL: presetSVG,
    current: current,
    isActive: isActive,
    isOpen: isOpen,
    paint: paint,
    open: open,
    close: close,
    bind: bind,
    reset: resetAvatar
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})(window);

/* ==========================================================================
   头像 Emoji 切换脚本已移除，仅保留下方一行本机缓存清理。
   ========================================================================== */

localStorage.removeItem('zane_avatar_idx');