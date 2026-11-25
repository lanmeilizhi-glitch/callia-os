/* =====================================================================
   Callia OS · themeUI.js
   全局 UI 主题持久化收口：把界面上所有可见的主题状态，从头到尾完整存在本机 localStorage 里，刷新、重进、杀进程后都按原样恢复。
   · 主状态仍然写在 COS.store.settings（随主存档 companion-os-v1 落盘），
     本文件再镜像一份到独立键 callia.ui_theme 作为双保险：
     主存档写失败 / 被清 / 旧存档缺字段时，主题照样回得来。
   · 覆盖范围：界面明暗、动效、主题皮肤、全局玻璃外观、桌面壁纸、
     壁纸遮罩、本机壁纸图、聊天背景、聊天背景遮罩、本机聊天背景图。
   · 气泡样式(bubble_style)、气泡材质(bubble_theme)、键盘模式(callia.kbmode)、
     自定义图标(icon_*)、头像等本来就各自存 localStorage，这里不重复搬运。
   · 只读写 localStorage 与 <html> 属性，不改动任何业务逻辑。
   ===================================================================== */
(function (global) {
  "use strict";

  var KEY = "callia.ui_theme";

  /* 需要完整持久化的 UI 主题字段：全部来自 COS.store.settings */
  var FIELDS = [
    "theme",
    "motion",
    "skin",
    "glass",
    "wallpaper",
    "bgDim",
    "bgImage",
    "chatBg",
    "chatBgDim",
    "chatBgImage"
  ];

  var DEFAULTS = {
    theme: "light",
    motion: true,
    skin: "mist",
    glass: "none",
    wallpaper: "",
    bgDim: 1,
    bgImage: "",
    chatBg: "none",
    chatBgDim: 1,
    chatBgImage: ""
  };

  var SKIN_IDS = ["mist", "dusk", "moss", "clay", "plum", "amber", "ink", "rose"];
  var GLASS_IDS = ["none", "pink", "green", "blue", "purple", "light", "dark"];
  var DIM_VALUES = [0, 1, 2];

  function cos() {
    return global.COS || null;
  }

  function settings() {
    var c = cos();
    return c && c.store && c.store.settings ? c.store.settings : null;
  }

  function readRaw() {
    try {
      return global.localStorage ? String(global.localStorage.getItem(KEY) || "") : "";
    } catch (err) {
      return "";
    }
  }

  function writeRaw(text) {
    try {
      if (global.localStorage) global.localStorage.setItem(KEY, text);
      return true;
    } catch (err) {
      /* 隐私模式或存储写满：本次会话仍然生效，不打断界面 */
      return false;
    }
  }

  function isImage(value) {
    return typeof value === "string" && value.indexOf("data:image") === 0;
  }

  /* 逐字段清洗：非法值回默认，绝不让脏数据污染界面属性 */
  function sanitize(pack) {
    var src = pack && typeof pack === "object" ? pack : {};
    var out = {};

    out.theme = src.theme === "dark" ? "dark" : "light";
    out.motion = src.motion !== false && src.motion !== "false";

    out.skin = SKIN_IDS.indexOf(src.skin) >= 0 ? src.skin : DEFAULTS.skin;
    out.glass = GLASS_IDS.indexOf(src.glass) >= 0 ? src.glass : DEFAULTS.glass;

    /* 壁纸：主题 /图片 / 内置预设 id，具体合法性由 theme.js 再校验 */
    out.wallpaper = typeof src.wallpaper === "string" ? src.wallpaper : "";

    var dim = Number(src.bgDim);
    out.bgDim = DIM_VALUES.indexOf(dim) >= 0 ? dim : DEFAULTS.bgDim;
    out.bgImage = isImage(src.bgImage) ? src.bgImage : "";

    out.chatBg = typeof src.chatBg === "string" && src.chatBg ? src.chatBg : DEFAULTS.chatBg;

    var cdim = Number(src.chatBgDim);
    out.chatBgDim = DIM_VALUES.indexOf(cdim) >= 0 ? cdim : DEFAULTS.chatBgDim;
    out.chatBgImage = isImage(src.chatBgImage) ? src.chatBgImage : "";

    return out;
  }

  function currentPack() {
    var st = settings();
    var pack = {};
    for (var i = 0; i < FIELDS.length; i += 1) {
      var key = FIELDS[i];
      pack[key] = st && st[key] !== undefined ? st[key] : DEFAULTS[key];
    }
    return sanitize(pack);
  }

  /* ---------- 落盘：把当前全部 UI 主题状态镜像进 localStorage ---------- */
  function snapshot() {
    var pack = currentPack();
    if (writeRaw(JSON.stringify(pack))) return true;
    /* 图片体积大：整包存不下时先丢图片，保住其余主题选择 */
    var light = {};
    for (var i = 0; i < FIELDS.length; i += 1) {
      var key = FIELDS[i];
      light[key] = key === "bgImage" || key === "chatBgImage" ? "" : pack[key];
    }
    return writeRaw(JSON.stringify(light));
  }

  /* ---------- 恢复：主存档缺字段时用镜像补齐，并立刻上屏 ---------- */
  function restore() {
    var raw = readRaw();
    if (!raw) return false;

    var pack;
    try {
      pack = JSON.parse(raw);
    } catch (err) {
      return false;
    }
    if (!pack || typeof pack !== "object") return false;

    var st = settings();
    if (!st) return false;

    var clean = sanitize(pack);
    var changed = false;

    for (var i = 0; i < FIELDS.length; i += 1) {
      var key = FIELDS[i];

      /* 壁纸与聊天背景允许空串（主题渐变 / 无背景），只在字段缺失时补 */
      if (key === "wallpaper" || key === "chatBg") {
        if (st[key] === undefined || st[key] === null) {
          st[key] = clean[key];
          changed = true;
        }
        continue;
      }
      if (key === "bgImage" || key === "chatBgImage") {
        if (!isImage(st[key]) && isImage(clean[key])) {
          st[key] = clean[key];
          changed = true;
        }
        continue;
      }
      if (st[key] === undefined || st[key] === null || st[key] === "") {
        st[key] = clean[key];
        changed = true;
      }
    }

    /* 皮肤与玻璃外观：主存档里已经是合法值时以主存档为准（用户刚选过的优先），
       主存档回到默认而镜像里另有选择时（旧存档升级）才用镜像补回来 */
    if (SKIN_IDS.indexOf(clean.skin) >= 0 && st.skin === DEFAULTS.skin && clean.skin !== DEFAULTS.skin) {
      st.skin = clean.skin;
      changed = true;
    }
    if (GLASS_IDS.indexOf(clean.glass) >= 0 && st.glass === DEFAULTS.glass && clean.glass !== DEFAULTS.glass) {
      st.glass = clean.glass;
      changed = true;
    }

    if (changed) applyAttrs();
    return changed;
  }

  /* ---------- 兜底上屏：theme.js 尚未接管时界面也不闪默认色 ---------- */
  function applyAttrs() {
    var root = document.documentElement;
    if (!root) return;
    var pack = currentPack();
    if (root.getAttribute("data-theme") !== pack.theme) root.setAttribute("data-theme", pack.theme);
    if (root.getAttribute("data-skin") !== pack.skin) root.setAttribute("data-skin", pack.skin);
    if (root.getAttribute("data-glass") !== pack.glass) root.setAttribute("data-glass", pack.glass);
    if (document.body) document.body.setAttribute("data-motion", pack.motion ? "on" : "off");
  }

  /* ---------- 跟随主存档：每次 COS.save 之后刷新镜像 ---------- */
  function hookStore() {
    var c = cos();
    if (!c || c.__themeUIHooked || typeof c.save !== "function") return;
    c.__themeUIHooked = true;
    var orig = c.save;
    c.save = function () {
      var ok = orig.apply(c, arguments);
      snapshot();
      return ok;
    };
    /* 恢复出厂设置：镜像一起回到默认主题 */
    if (typeof c.reset === "function" && !c.__themeUIResetHooked) {
      c.__themeUIResetHooked = true;
      var origReset = c.reset;
      c.reset = function () {
        var out = origReset.apply(c, arguments);
        snapshot();
        return out;
      };
    }
  }

  function boot() {
    hookStore();
    restore();
    applyAttrs();
    snapshot();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  global.CalliaThemeUI = {
    KEY: KEY,
    FIELDS: FIELDS,
    snapshot: snapshot,
    restore: restore,
    current: currentPack,
    apply: applyAttrs
  };
})(window);
