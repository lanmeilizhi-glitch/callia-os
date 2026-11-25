/* ============================================================================
   Callia OS · chatBg.js
   对话页聊天背景引擎。
   · 状态存在 COS.store.settings：chatBg（none / 预设 id / image）、
     chatBgImage（压缩后的本机图 dataURL）、chatBgDim（遮罩浓度 0|1|2）
   · 状态写到 <html>：data-chat-bg / data-chat-bg-key / data-chat-dim，
     背景本体写成 --chat-bg-img 与 --chat-bg-base，由 chatbg.css 画在 #chat-log 上
   · 明暗仍由 <html data-theme> 决定，预设与遮罩都跟随浅色 / 深色自动换色
   · 选择入口在聊天页右上角「个人主页 · 聊天背景」分栏（charHome.js）
   ========================================================================== */
(function (global) {
  "use strict";

  var NONE = "none";
  var IMAGE = "image";

  var DEFAULT_DIM = 1;
  var DIM_VALUES = [0, 1, 2];
  var MAX_FILE_BYTES = 12 * 1024 * 1024;
  var MAX_DATA_CHARS = 900000;

  /* 压缩阶梯：从清晰到保守，本机存不下就自动往下一档重压 */
  var LADDER = [
    [1280, 0.8],
    [1080, 0.72],
    [960, 0.64],
    [840, 0.56],
    [720, 0.48]
  ];

  /* 内置聊天背景：每张都有浅色 / 深色两组取值，只画在消息区，气泡仍然可读。
     取值：[底色, 图层一, 图层二, 图层三]，图层全部用渐变，无需平铺尺寸 */
  var PRESETS = [
    {
      id: "paper",
      name: "纸纹",
      light: ["#f4f3f0", "radial-gradient(120% 60% at 50% 0%, rgba(255,255,255,0.9), transparent 70%)", "repeating-linear-gradient(45deg, rgba(22,24,27,0.028) 0 1px, transparent 1px 7px)"],
      dark: ["#1c1e21", "radial-gradient(120% 60% at 50% 0%, rgba(255,255,255,0.06), transparent 70%)", "repeating-linear-gradient(45deg, rgba(243,244,246,0.035) 0 1px, transparent 1px 7px)"]
    },
    {
      id: "linen",
      name: "织纹",
      light: ["#f1f0ec", "linear-gradient(180deg, rgba(255,255,255,0.75), rgba(208,206,201,0.4))", "repeating-linear-gradient(0deg, rgba(22,24,27,0.03) 0 1px, transparent 1px 9px)"],
      dark: ["#191b1e", "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.3))", "repeating-linear-gradient(0deg, rgba(243,244,246,0.04) 0 1px, transparent 1px 9px)"]
    },
    {
      id: "mist",
      name: "晨雾",
      light: ["#eef1f4", "radial-gradient(90% 55% at 18% 8%, rgba(255,255,255,0.95), transparent 62%)", "radial-gradient(80% 60% at 88% 92%, rgba(150,175,205,0.35), transparent 60%)", "linear-gradient(168deg, #f2f5f8, #dfe6ee)"],
      dark: ["#14171b", "radial-gradient(90% 55% at 18% 8%, rgba(150,180,220,0.14), transparent 62%)", "radial-gradient(80% 60% at 88% 92%, rgba(90,120,160,0.2), transparent 60%)", "linear-gradient(168deg, #1a1f26, #10131a)"]
    },
    {
      id: "grid",
      name: "方格",
      light: ["#f3f4f2", "repeating-linear-gradient(90deg, rgba(22,24,27,0.05) 0 1px, transparent 1px 26px)", "repeating-linear-gradient(0deg, rgba(22,24,27,0.05) 0 1px, transparent 1px 26px)"],
      dark: ["#17191c", "repeating-linear-gradient(90deg, rgba(243,244,246,0.055) 0 1px, transparent 1px 26px)", "repeating-linear-gradient(0deg, rgba(243,244,246,0.055) 0 1px, transparent 1px 26px)"]
    },
    {
      id: "dusk",
      name: "暮色",
      light: ["#f0e9e6", "radial-gradient(100% 70% at 80% 6%, rgba(255,214,190,0.55), transparent 60%)", "linear-gradient(172deg, #f6efe9, #e7d9d7, #d7c7cd)"],
      dark: ["#1a1620", "radial-gradient(100% 70% at 80% 6%, rgba(214,150,120,0.18), transparent 60%)", "linear-gradient(172deg, #241c26, #1a1520, #120f16)"]
    },
    {
      id: "night",
      name: "夜航",
      light: ["#e9edf2", "radial-gradient(70% 45% at 20% 12%, rgba(255,255,255,0.9), transparent 60%)", "repeating-linear-gradient(115deg, rgba(22,24,27,0.03) 0 1px, transparent 1px 42px)", "linear-gradient(180deg, #eef2f6, #d9e0ea)"],
      dark: ["#0f1319", "radial-gradient(70% 45% at 20% 12%, rgba(160,190,230,0.12), transparent 60%)", "repeating-linear-gradient(115deg, rgba(200,220,255,0.05) 0 1px, transparent 1px 42px)", "linear-gradient(180deg, #141a22, #0d1116)"]
    }
  ];

  /* 本机图片上的遮罩：浅色用白纱，深色用黑纱，保证气泡文字始终可读 */
  var VEIL = {
    light: ["rgba(247,247,245,0.16)", "rgba(247,247,245,0.42)", "rgba(247,247,245,0.68)"],
    dark: ["rgba(15,16,18,0.22)", "rgba(15,16,18,0.46)", "rgba(15,16,18,0.7)"]
  };
  var PHOTO_BASE = { light: "#f2f1ef", dark: "#131417" };

  var sessionImage = ""; /* 存储写不进去时，本次会话仍然显示这张图 */
  var pendingImage = null; /* 原图引用：存不下时按阶梯重压 */
  var painted = null;
  var working = false;
  var toastTimer = null;

  function cos() {
    return global.COS || null;
  }

  function settings() {
    var c = cos();
    return c && c.store && c.store.settings ? c.store.settings : null;
  }

  function findPreset(id) {
    for (var i = 0; i < PRESETS.length; i += 1) {
      if (PRESETS[i].id === id) return PRESETS[i];
    }
    return null;
  }

  function currentMode() {
    var st = settings();
    return st && st.theme === "dark" ? "dark" : "light";
  }

  function currentImage() {
    var st = settings();
    var v = st && typeof st.chatBgImage === "string" ? st.chatBgImage : "";
    if (v.indexOf("data:image") === 0) return v;
    return sessionImage.indexOf("data:image") === 0 ? sessionImage : "";
  }

  function currentDim() {
    var st = settings();
    var n = st ? Number(st.chatBgDim) : NaN;
    return DIM_VALUES.indexOf(n) >= 0 ? n : DEFAULT_DIM;
  }

  /* 当前生效的背景：none / 预设 id / image */
  function current() {
    var st = settings();
    var v = st && typeof st.chatBg === "string" ? st.chatBg : NONE;
    if (v === IMAGE) return currentImage() ? IMAGE : NONE;
    if (findPreset(v)) return v;
    return NONE;
  }

  function name() {
    var key = current();
    if (key === IMAGE) return "本机图片";
    var preset = findPreset(key);
    return preset ? preset.name : "没有背景";
  }

  function veilCSS(mode, dim) {
    var list = VEIL[mode] || VEIL.light;
    var c = list[dim] || list[DEFAULT_DIM];
    return "linear-gradient(" + c + ", " + c + ")";
  }

  /* 一个背景对应的 background-image 值；预设缩略图与真实背景共用同一份 */
  function css(key, mode) {
    var m = mode || currentMode();
    if (key === IMAGE) {
      var img = currentImage();
      if (!img) return "none";
      return veilCSS(m, currentDim()) + ',url("' + img + '")';
    }
    var preset = findPreset(key);
    if (!preset) return "none";
    var colors = (m === "dark" ? preset.dark : preset.light) || preset.light;
    return colors.slice(1).join(",");
  }

  function base(key, mode) {
    var m = mode || currentMode();
    if (key === IMAGE) return PHOTO_BASE[m] || PHOTO_BASE.light;
    var preset = findPreset(key);
    if (!preset) return "transparent";
    var colors = (m === "dark" ? preset.dark : preset.light) || preset.light;
    return colors[0];
  }

  /* ---------- 写状态到 <html>，CSS 只认这几个属性 ---------- */
  function setAttr(root, attr, value) {
    if (root.getAttribute(attr) !== value) root.setAttribute(attr, value);
  }

  /* 背景一旦上屏就广播一次，个人主页的「聊天背景」分栏靠它刷新预览与选中态 */
  function notify() {
    try {
      if (typeof global.CustomEvent === "function") {
        document.dispatchEvent(new global.CustomEvent("callia:chatbg"));
      }
    } catch (err) {
      /* 事件发不出去也不影响背景本身 */
    }
  }

  function paint() {
    var root = document.documentElement;
    if (!root) return;
    var mode = currentMode();
    var key = current();
    var value = css(key, mode);

    setAttr(root, "data-chat-bg", key === IMAGE ? "image" : key === NONE ? "none" : "preset");
    setAttr(root, "data-chat-bg-key", key);
    setAttr(root, "data-chat-dim", String(currentDim()));

    if (value !== painted) {
      painted = value;
      root.style.setProperty("--chat-bg-img", value);
    }
    root.style.setProperty("--chat-bg-base", base(key, mode));
    notify();
  }

  function persist(patch) {
    var st = settings();
    if (!st) return false;
    for (var key in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) st[key] = patch[key];
    }
    var c = cos();
    if (c && typeof c.save === "function") return !!c.save();
    return true;
  }

  function toast(text) {
    var node = document.getElementById("toast");
    if (!node) return;
    node.textContent = text;
    node.classList.add("is-on");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      node.classList.remove("is-on");
    }, 2000);
  }

  function buzz() {
    var st = settings();
    if (!st || !st.haptic || !navigator.vibrate) return;
    try {
      navigator.vibrate(9);
    } catch (err) {
      /* 设备不支持时静默降级 */
    }
  }

  /* ---------- 预设与遮罩 ---------- */
  function set(key) {
    if (key === IMAGE && !currentImage()) {
      pick();
      return false;
    }
    if (key !== NONE && key !== IMAGE && !findPreset(key)) return false;
    if (key === current()) {
      paint();
      return true;
    }
    persist({ chatBg: key });
    paint();
    buzz();
    toast(key === NONE ? "已去掉聊天背景" : "聊天背景已换成「" + name() + "」");
    return true;
  }

  function setDim(n) {
    if (DIM_VALUES.indexOf(n) < 0) return;
    persist({ chatBgDim: n });
    painted = null; /* 遮罩变了，背景值必须重新生成 */
    paint();
    buzz();
  }

  function clear() {
    if (current() === NONE) {
      toast("现在对话页还没有背景");
      return;
    }
    /* 本机图片留在面板里，下次点「本机图片」就能换回来 */
    set(NONE);
  }

  /* ---------- 压缩：等比缩到最长边，转 JPEG，存不下就降档 ---------- */
  function encodeAt(img, edge, quality) {
    var w = img.naturalWidth || img.width || 0;
    var h = img.naturalHeight || img.height || 0;
    if (!w || !h) return "";
    var scale = Math.min(1, edge / Math.max(w, h));
    var tw = Math.max(1, Math.round(w * scale));
    var th = Math.max(1, Math.round(h * scale));
    var canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    var ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.fillStyle = "#e9e9e7";
    ctx.fillRect(0, 0, tw, th);
    ctx.drawImage(img, 0, 0, w, h, 0, 0, tw, th);
    try {
      return canvas.toDataURL("image/jpeg", quality);
    } catch (err) {
      return "";
    }
  }

  function encodeBest(img) {
    for (var i = 0; i < LADDER.length; i += 1) {
      var out = encodeAt(img, LADDER[i][0], LADDER[i][1]);
      if (out && out.length <= MAX_DATA_CHARS) return { data: out, rung: i };
    }
    var last = LADDER.length - 1;
    var smallest = encodeAt(img, LADDER[last][0], LADDER[last][1]);
    return smallest ? { data: smallest, rung: last } : null;
  }

  function reEncode(fromRung) {
    if (!pendingImage) return null;
    for (var i = fromRung; i < LADDER.length; i += 1) {
      var out = encodeAt(pendingImage, LADDER[i][0], LADDER[i][1]);
      if (out) return { data: out, rung: i };
    }
    return null;
  }

  /* 先上屏再落盘：换图必须立刻看得见，存储失败也不让背景消失 */
  function applyImage(dataURL) {
    sessionImage = dataURL;
    persist({ chatBg: IMAGE });
    painted = null;
    paint();
  }

  function setImage(pack) {
    if (!pack || !pack.data) return false;
    var st = settings();
    var prev = st && typeof st.chatBgImage === "string" ? st.chatBgImage : "";
    var dataURL = pack.data;
    var rung = pack.rung;

    applyImage(dataURL);
    buzz();

    if (!st) {
      toast("背景已生效，但这次不会记住");
      return true;
    }

    for (;;) {
      st.chatBgImage = dataURL;
      if (persist({})) break;
      var next = reEncode(rung + 1);
      if (!next) {
        st.chatBgImage = prev.indexOf("data:image") === 0 ? prev : "";
        applyImage(dataURL);
        toast("本机存储已满，这张图只显示不保存");
        return true;
      }
      dataURL = next.data;
      rung = next.rung;
      applyImage(dataURL);
    }

    toast("聊天背景已换成这张图");
    return true;
  }

  /* ---------- 选图 ---------- */
  function pick() {
    if (working) return;
    var input = document.getElementById("cbg-file");
    if (!input || !global.FileReader) {
      toast("当前环境无法读取本机图片");
      return;
    }
    input.value = "";
    input.click();
  }

  function readImage(file) {
    if (!file) return;
    if (file.type && file.type.indexOf("image/") !== 0) {
      toast("请选择一张图片");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast("图片太大了，换一张小一点的");
      return;
    }
    working = true;
    toast("正在处理这张图…");
    var reader = new global.FileReader();
    reader.onerror = function () {
      working = false;
      toast("图片读取失败，换一张试试");
    };
    reader.onload = function () {
      var img = new global.Image();
      img.onerror = function () {
        working = false;
        toast("这张图片的格式暂不支持");
      };
      img.onload = function () {
        var pack = encodeBest(img);
        working = false;
        if (!pack) {
          toast("这张图片读不出来，换一张试试");
          return;
        }
        pendingImage = img;
        setImage(pack);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function onChange(ev) {
    var node = ev.target;
    if (!node || node.id !== "cbg-file") return;
    var file = node.files && node.files[0];
    node.value = "";
    readImage(file);
  }

  /* 任何一次写回本地存储后都重新对齐状态（含恢复出厂设置） */
  function hookStore() {
    var c = cos();
    if (!c || c.__chatBgHooked || typeof c.save !== "function") return;
    c.__chatBgHooked = true;
    var orig = c.save;
    c.save = function () {
      var ok = orig.apply(c, arguments);
      paint();
      return ok;
    };
    if (typeof c.reset === "function" && !c.__chatBgResetHooked) {
      c.__chatBgResetHooked = true;
      var origReset = c.reset;
      c.reset = function () {
        sessionImage = "";
        pendingImage = null;
        painted = null;
        var out = origReset.apply(c, arguments);
        paint();
        return out;
      };
    }
  }

  function boot() {
    hookStore();
    paint();
  }

  document.addEventListener("change", onChange, true);

  /* 明暗切换由 os.js 写 store，等它写完再重算一次跟随明暗的预设 */
  document.addEventListener(
    "click",
    function (ev) {
      var node = ev.target;
      if (!node || typeof node.closest !== "function") return;
      if (node.closest("[data-set-theme]")) setTimeout(paint, 0);
    },
    true
  );

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  global.CalliaChatBg = {
    NONE: NONE,
    IMAGE: IMAGE,
    presets: PRESETS,
    current: current,
    name: name,
    image: currentImage,
    dim: currentDim,
    mode: currentMode,
    css: css,
    base: base,
    set: set,
    pick: pick,
    clear: clear,
    setDim: setDim,
    paint: paint
  };
})(window);