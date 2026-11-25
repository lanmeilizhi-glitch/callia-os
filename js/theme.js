/* ===================================================================
   Callia OS · theme.js
   全局主题皮肤：背景 + 强调色 + 本机自定义背景图
   · 皮肤写在 <html data-skin="...">，明暗仍由 <html data-theme="..."> 控制
   · 背景图存在 COS.store.settings.bgImage，开启时写 <html data-bg="image">
     与 data-bg-dim="0|1|2"，壁纸本体写成 --wp-img 自定义属性（同时写 --bg-img 兼容旧样式）
   · 皮肤与背景图选择记在 COS.store.settings，跟随现有本地存储一起持久化
   · 设置页里的 [data-set-skin] 色板与 [data-bg-*] 背景图控件由本文件接管点击
   =================================================================== */
(function (global) {
  "use strict";

  var DEFAULT_SKIN = "mist";
  var SKIN_IDS = ["mist", "dusk", "moss", "clay", "plum", "amber", "ink", "rose"];

  /* ---------- 全局玻璃外观（莫兰迪色系） ----------
     只写 <html data-glass="...">，具体色值全部在 themes.css 里按明暗各给一组。
     与 data-skin（背景基调）互不影响：玻璃外观只染卡片 / 按钮 / 弹窗的底色与毛玻璃色调。 */
  var DEFAULT_GLASS = "none";
  var GLASSES = [
    { id: "none", name: "原色", a: "#f7f7f5", b: "#dcdcd8", desc: "保持原本的灰白玻璃" },
    { id: "pink", name: "莫兰迪粉", a: "#f3dfe2", b: "#d8b8bf", desc: "灰调玫瑰，柔和偏暖" },
    { id: "green", name: "莫兰迪绿", a: "#dfe8df", b: "#b6c8b8", desc: "雾感苔绿，安静清爽" },
    { id: "blue", name: "莫兰迪蓝", a: "#dde5ee", b: "#b3c2d4", desc: "灰蓝雾面，冷静克制" },
    { id: "purple", name: "莫兰迪紫", a: "#e6e0ec", b: "#c2b6d2", desc: "灰紫薄雾，温柔内敛" },
    { id: "light", name: "浅色", a: "#fbfbfa", b: "#e6e6e3", desc: "更亮的白玻璃" },
    { id: "dark", name: "深色", a: "#3a3c42", b: "#22242a", desc: "更沉的墨玻璃" }
  ];

  /* 自定义背景图：dataURL 存在 settings.bgImage，遮罩浓度 settings.bgDim */
  var DEFAULT_DIM = 1;
  var DIM_VALUES = [0, 1, 2];
  var MAX_FILE_BYTES = 12 * 1024 * 1024;
  /* 压缩阶梯：从清晰到保守，存不下就自动往下一档重压 */
  var LADDER = [
    [1280, 0.82],
    [1080, 0.74],
    [960, 0.66],
    [840, 0.58],
    [720, 0.5]
  ];
  var MAX_DATA_CHARS = 900000;

  /* 色板预览色与实际 CSS 令牌保持同一套命名，改色时两处一起改 */
  var SKINS = [
    { id: "mist", name: "灰雾", a: "#eceae7", b: "#a9abae" },
    { id: "dusk", name: "暮蓝", a: "#ccd7f2", b: "#3d55b8" },
    { id: "moss", name: "苔原", a: "#cfe2d2", b: "#2c6b4f" },
    { id: "clay", name: "陶土", a: "#f0dcc9", b: "#a94f2a" },
    { id: "plum", name: "紫李", a: "#ded0f0", b: "#6b3fa8" },
    { id: "amber", name: "琥珀", a: "#f2e2bd", b: "#96660f" },
    { id: "ink", name: "墨青", a: "#c9dfe2", b: "#1c5b68" },
    { id: "rose", name: "蔷薇", a: "#f4d5de", b: "#a63c60" }
  ];

  /* ---------- 内置桌面壁纸 ----------
     每张预设都有浅色 / 深色两组取值，随界面明暗自动切换：
     [顶部, 中部, 底部, 上方光晕, 下方光晕] */
  var WALL_SKIN = "skin";
  var WALL_CUSTOM = "custom";

  var PRESETS = [
    {
      id: "dawn",
      name: "破晓",
      light: ["#fdeee1", "#f7cfad", "#e79f86", "rgba(255,255,255,0.86)", "rgba(226,124,96,0.42)"],
      dark: ["#241820", "#4c2b2e", "#83463a", "rgba(255,176,140,0.22)", "rgba(20,10,16,0.58)"]
    },
    {
      id: "dusk",
      name: "暮潮",
      light: ["#e7ecfa", "#c4d1f0", "#93a8dc", "rgba(255,255,255,0.9)", "rgba(80,110,200,0.34)"],
      dark: ["#0f1524", "#1e2a4a", "#38477e", "rgba(140,170,255,0.2)", "rgba(6,10,20,0.6)"]
    },
    {
      id: "pine",
      name: "松雾",
      light: ["#e7f1e8", "#c3ddc9", "#94bda6", "rgba(255,255,255,0.86)", "rgba(70,130,96,0.32)"],
      dark: ["#101c18", "#1c3a2e", "#2f5d47", "rgba(120,210,170,0.18)", "rgba(6,16,12,0.6)"]
    },
    {
      id: "sakura",
      name: "樱雨",
      light: ["#fdeef3", "#f7d6df", "#e7adbf", "rgba(255,255,255,0.9)", "rgba(210,110,140,0.3)"],
      dark: ["#221419", "#3f2029", "#6b3446", "rgba(255,160,190,0.18)", "rgba(16,8,12,0.6)"]
    },
    {
      id: "linen",
      name: "亚麻",
      light: ["#f7f2e9", "#e9decd", "#d5c4ab", "rgba(255,255,255,0.92)", "rgba(170,140,100,0.26)"],
      dark: ["#191817", "#2a2724", "#423b33", "rgba(255,225,190,0.14)", "rgba(8,8,8,0.6)"]
    },
    {
      id: "graphite",
      name: "石墨",
      light: ["#f1f2f3", "#d9dcdf", "#b3b8bd", "rgba(255,255,255,0.92)", "rgba(90,100,110,0.24)"],
      dark: ["#121316", "#1f2226", "#343941", "rgba(200,215,235,0.14)", "rgba(4,5,6,0.62)"]
    }
  ];

  var toastTimer = null;

  function cos() {
    return global.COS || null;
  }

  function settings() {
    var c = cos();
    return c && c.store && c.store.settings ? c.store.settings : null;
  }

  function find(id) {
    for (var i = 0; i < SKINS.length; i += 1) {
      if (SKINS[i].id === id) return SKINS[i];
    }
    return null;
  }

  function currentSkin() {
    var st = settings();
    var id = st ? st.skin : null;
    return find(id) ? id : DEFAULT_SKIN;
  }

  function currentMode() {
    var st = settings();
    return st && st.theme === "dark" ? "dark" : "light";
  }

  function findGlass(id) {
    for (var i = 0; i < GLASSES.length; i += 1) {
      if (GLASSES[i].id === id) return GLASSES[i];
    }
    return null;
  }

  function currentGlass() {
    var st = settings();
    var id = st ? st.glass : null;
    return findGlass(id) ? id : DEFAULT_GLASS;
  }

  function glassName() {
    var g = findGlass(currentGlass());
    return g ? g.name : "原色";
  }

  /* 存储写不进去时，本次会话仍然显示这张图 */
  var sessionImage = "";

  function currentImage() {
    var st = settings();
    var v = st && typeof st.bgImage === "string" ? st.bgImage : "";
    if (v.indexOf("data:image") === 0) return v;
    return sessionImage.indexOf("data:image") === 0 ? sessionImage : "";
  }

  function currentDim() {
    var st = settings();
    var n = st ? Number(st.bgDim) : NaN;
    return DIM_VALUES.indexOf(n) >= 0 ? n : DEFAULT_DIM;
  }

  /* ---------- 壁纸状态：主题渐变 / 内置预设 / 本机图片 ---------- */
  function findPreset(id) {
    for (var i = 0; i < PRESETS.length; i += 1) {
      if (PRESETS[i].id === id) return PRESETS[i];
    }
    return null;
  }

  /* 预设用三层渐变拼出深度，与本机图片共用同一套 background-image 层 */
  function presetCSS(preset, mode) {
    var c = (mode === "dark" ? preset.dark : preset.light) || preset.light;
    return (
      "radial-gradient(120% 76% at 16% 6%, " + c[3] + ", transparent 60%)," +
      "radial-gradient(112% 88% at 86% 96%, " + c[4] + ", transparent 58%)," +
      "linear-gradient(168deg, " + c[0] + " 0%, " + c[1] + " 54%, " + c[2] + " 100%)"
    );
  }

  function currentWallpaper() {
    var st = settings();
    var v = st && typeof st.wallpaper === "string" ? st.wallpaper : "";
    if (v === WALL_CUSTOM) return currentImage() ? WALL_CUSTOM : WALL_SKIN;
    if (findPreset(v)) return v;
    /* 旧存档只有 bgImage：默认认为用的是本机图片 */
    if (!v && currentImage()) return WALL_CUSTOM;
    return WALL_SKIN;
  }

  function wallpaperName() {
    var wall = currentWallpaper();
    if (wall === WALL_CUSTOM) return "本机图片";
    var preset = findPreset(wall);
    return preset ? preset.name : "主题渐变";
  }

  /* ---------- 把状态写到 <html>，CSS 只认这几个属性 ---------- */
  var paintedImage = null;

  function setAttr(root, name, value) {
    if (root.getAttribute(name) !== value) root.setAttribute(name, value);
  }

  function paint() {
    var root = document.documentElement;
    if (!root) return;
    var mode = currentMode();
    var wall = currentWallpaper();
    var preset = findPreset(wall);
    var image = wall === WALL_CUSTOM ? currentImage() : "";

    setAttr(root, "data-skin", currentSkin());
    setAttr(root, "data-glass", currentGlass());
    setAttr(root, "data-theme", mode);
    setAttr(root, "data-bg", image || preset ? "image" : "skin");
    setAttr(root, "data-bg-kind", preset ? "preset" : "photo");
    setAttr(root, "data-bg-dim", String(currentDim()));

    /* 预设的取值跟明暗相关，切浅色 / 深色时会重新生成一次 */
    var value = image ? 'url("' + image + '")' : preset ? presetCSS(preset, mode) : "none";
    /* 变量名必须与 wallpaper.css 读取的 --wp-img 一致，否则壁纸层永远是 none */
    if (value !== paintedImage) {
      paintedImage = value;
      root.style.setProperty("--wp-img", value);
      root.style.setProperty("--bg-img", value);
    }

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", mode === "dark" ? "#191a1d" : "#e9eaec");
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

  /* 震动只在用户真实交互后可用：页面刚加载、还没点过任何东西时
     Chromium 会拦截 navigator.vibrate 并在控制台报 Blocked call。
     这里先记下「用户是否已经交互过」，没交互就静默跳过，
     既不影响触感反馈，也不会在启动阶段刷错误。 */
  var userTouched = false;
  function markTouched() {
    userTouched = true;
  }
  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("pointerdown", markTouched, true);
    document.addEventListener("touchstart", markTouched, true);
    document.addEventListener("keydown", markTouched, true);
  }

  function buzz() {
    var st = settings();
    if (!st || !st.haptic) return;
    if (!userTouched) return;
    if (!navigator.vibrate) return;
    try {
      navigator.vibrate(9);
    } catch (err) {
      /* 设备不支持时静默降级 */
    }
  }

  /* 设置页可能已经渲染好，直接同步色板选中态，避免整页重绘 */
  function syncSwatches() {
    var active = currentSkin();
    var list = document.querySelectorAll("[data-set-skin]");
    for (var i = 0; i < list.length; i += 1) {
      var on = list[i].getAttribute("data-set-skin") === active;
      list[i].classList.toggle("is-on", on);
      list[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  /* ---------- 壁纸面板：缩略图与实时状态 ---------- */
  function on(node, type, fn, opts) {
    if (!node || typeof node.addEventListener !== "function") return;
    node.addEventListener(type, fn, opts || false);
  }

  function raf(fn) {
    if (typeof global.requestAnimationFrame === "function") return global.requestAnimationFrame(fn);
    return setTimeout(fn, 16);
  }

  function tileHTML(id, name, styleCSS, extraClass) {
    return (
      '<button class="wp-tile" type="button" data-wp-set="' + id + '" aria-pressed="false">' +
      '<i class="wp-tile__fill' + (extraClass || "") + '" aria-hidden="true" style="' + styleCSS + '"></i>' +
      '<i class="wp-tile__dot" aria-hidden="true"></i>' +
      '<span class="wp-tile__name">' + name + "</span></button>"
    );
  }

  function renderGrid() {
    var grid = document.getElementById("wp-grid");
    if (!grid) return;
    var mode = currentMode();
    var skin = find(currentSkin()) || SKINS[0];
    var image = currentImage();
    var html =
      tileHTML(WALL_SKIN, "主题", "background:linear-gradient(150deg," + skin.a + " 0%," + skin.b + " 100%)");
    for (var i = 0; i < PRESETS.length; i += 1) {
      html += tileHTML(PRESETS[i].id, PRESETS[i].name, "background-image:" + presetCSS(PRESETS[i], mode));
    }
    html += tileHTML(
      WALL_CUSTOM,
      "本机图片",
      image ? "background-image:url('" + image + "')" : "",
      image ? "" : " is-empty"
    );
    grid.innerHTML = html;
  }

  /* 面板与设置页都只读这几个状态，重绘时不重建整页 */
  function syncCustom() {
    var wall = currentWallpaper();
    var image = currentImage();
    var dim = currentDim();
    var hasWall = wall !== WALL_SKIN;

    var current = document.getElementById("wp-current");
    if (current) current.textContent = wallpaperName();

    var tiles = document.querySelectorAll(".wp-tile[data-wp-set]");
    for (var i = 0; i < tiles.length; i += 1) {
      var on = tiles[i].getAttribute("data-wp-set") === wall;
      tiles[i].classList.toggle("is-on", on);
      tiles[i].setAttribute("aria-pressed", on ? "true" : "false");
    }

    var photo = document.querySelector('.wp-tile[data-wp-set="' + WALL_CUSTOM + '"] .wp-tile__fill');
    if (photo) {
      photo.style.backgroundImage = image ? "url('" + image + "')" : "";
      photo.classList.toggle("is-empty", !image);
    }

    var veil = document.getElementById("wp-veil");
    if (veil) veil.classList.toggle("is-off", !hasWall);

    var pick = document.querySelector("[data-bg-pick]");
    if (pick) pick.textContent = image ? "换一张图片" : "从相册选择";

    var note = document.getElementById("wp-note");
    if (note) {
      note.textContent =
        wall === WALL_CUSTOM
          ? "正在使用本机图片 · 压缩后只存在这台设备上"
          : hasWall
            ? "内置壁纸会跟随浅色 / 深色自动换深浅"
            : "桌面长按空白处，随时能再换一张。";
    }

    var seg = document.querySelectorAll("[data-bg-dim]");
    for (var j = 0; j < seg.length; j += 1) {
      var onDim = Number(seg[j].getAttribute("data-bg-dim")) === dim;
      seg[j].classList.toggle("is-on", onDim);
      seg[j].setAttribute("aria-pressed", onDim ? "true" : "false");
    }
  }

  function sheetOpen() {
    var sheet = document.getElementById("wallpaper-sheet");
    return !!sheet && sheet.classList.contains("is-on");
  }

  function openSheet() {
    var sheet = document.getElementById("wallpaper-sheet");
    if (!sheet || sheet.classList.contains("is-on")) return;
    renderGrid();
    syncCustom();
    sheet.hidden = false;
    /* 下一帧再加 class，进场动画才播得出来 */
    raf(function () {
      raf(function () {
        sheet.classList.add("is-on");
      });
    });
  }

  function closeSheet() {
    var sheet = document.getElementById("wallpaper-sheet");
    if (!sheet || sheet.hidden) return;
    sheet.classList.remove("is-on");
    setTimeout(function () {
      sheet.hidden = true;
    }, 320);
  }

  function setWallpaper(id) {
    var kind = "";
    if (id === WALL_SKIN || id === WALL_CUSTOM) kind = id;
    else if (findPreset(id)) kind = id;
    if (!kind) return false;

    /* 本机图片还没选过：直接走选图流程，不先把面板切到空状态 */
    if (kind === WALL_CUSTOM && !currentImage()) {
      pickFile();
      return false;
    }
    if (kind === currentWallpaper()) {
      syncCustom();
      return true;
    }
    persist({ wallpaper: kind });
    paint();
    syncCustom();
    buzz();
    return true;
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

  /* 存不下了就再压一档，压到底返回 null */
  function reEncode(fromRung) {
    if (!pendingImage) return null;
    for (var i = fromRung; i < LADDER.length; i += 1) {
      var out = encodeAt(pendingImage, LADDER[i][0], LADDER[i][1]);
      if (out) return { data: out, rung: i };
    }
    return null;
  }

  /* 先上屏再落盘：换图必须立刻看得见，存储失败也不让壁纸消失 */
  function applyImage(dataURL) {
    sessionImage = dataURL;
    persist({ wallpaper: WALL_CUSTOM });
    paint();
    renderGrid();
    syncCustom();
  }

  function setImage(pack) {
    if (!pack || !pack.data) return false;
    var st = settings();
    var prev = st && typeof st.bgImage === "string" ? st.bgImage : "";
    var dataURL = pack.data;
    var rung = pack.rung;

    applyImage(dataURL);
    buzz();

    if (!st) {
      toast("壁纸已生效，但这次不会记住");
      return true;
    }

    for (;;) {
      st.bgImage = dataURL;
      if (persist({})) break;
      var next = reEncode(rung + 1);
      if (!next) {
        st.bgImage = prev.indexOf("data:image") === 0 ? prev : "";
        applyImage(dataURL);
        toast("本机存储已满，这张图只显示不保存");
        return true;
      }
      dataURL = next.data;
      rung = next.rung;
      applyImage(dataURL);
    }

    toast("壁纸已换好");
    return true;
  }

  function clearImage() {
    if (currentWallpaper() === WALL_SKIN) {
      toast("现在用的就是主题渐变背景");
      return;
    }
    /* 本机图片仍留在面板里，下次点「本机图片」就能换回来 */
    setWallpaper(WALL_SKIN);
    toast("已换回主题背景");
  }

  function setDim(n) {
    if (DIM_VALUES.indexOf(n) < 0) return;
    persist({ bgDim: n });
    paint();
    syncCustom();
    buzz();
  }

  var working = false;
  var pendingImage = null; /* 原图引用：存不下时按阶梯重压 */

  function pickFile() {
    if (working) return;
    var input = document.getElementById("bg-file");
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

  function select(id) {
    var skin = find(id);
    if (!skin) return false;
    if (skin.id === currentSkin()) {
      paint();
      syncSwatches();
      return true;
    }
    persist({ skin: skin.id });
    paint();
    syncSwatches();
    buzz();
    toast("已换上「" + skin.name + "」背景");
    return true;
  }

  function resetSkin() {
    persist({ skin: DEFAULT_SKIN });
    paint();
    syncSwatches();
  }

  /* ---------- 全局玻璃外观：选中态同步 + 切换 ---------- */
  function syncGlass() {
    var active = currentGlass();
    var list = document.querySelectorAll("[data-set-glass]");
    for (var i = 0; i < list.length; i += 1) {
      var on = list[i].getAttribute("data-set-glass") === active;
      list[i].classList.toggle("is-on", on);
      list[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
    var label = document.getElementById("glass-current");
    if (label) label.textContent = glassName();
  }

  function selectGlass(id) {
    var g = findGlass(id);
    if (!g) return false;
    if (g.id === currentGlass()) {
      paint();
      syncGlass();
      return true;
    }
    persist({ glass: g.id });
    paint();
    syncGlass();
    buzz();
    toast("全局玻璃已换成「" + g.name + "」");
    return true;
  }

  /* ---------- 桌面长按：随时换壁纸 ---------- */
  var press = { id: null, timer: null, x: 0, y: 0, firedAt: 0 };

  function pressCancel() {
    if (press.timer) {
      clearTimeout(press.timer);
      press.timer = null;
    }
    press.id = null;
  }

  function bindHomePress() {
    var home = document.getElementById("home");
    if (!home) return;

    on(home, "pointerdown", function (ev) {
      if (document.body.getAttribute("data-view") !== "home") return;
      if (sheetOpen()) return;
      /* 排列模式与小组件上的长按交给桌面排列，不抢壁纸手势 */
      if (document.body.getAttribute("data-editing") === "1") return;
      var node = ev.target;
      /* 按在应用图标、卡片按钮、可拖动小组件上时不抢手势 */
      if (node && typeof node.closest === "function" &&
          node.closest("[data-widget], button, a, input, textarea, select, [data-open], [data-life], [data-action]")) return;

      pressCancel();
      press.id = ev.pointerId;
      press.x = ev.clientX;
      press.y = ev.clientY;
      press.timer = setTimeout(function () {
        press.timer = null;
        press.id = null;
        press.firedAt = Date.now();
        buzz();
        openSheet();
      }, 520);
    });

    /* 轻扫切主屏时取消长按 */
    on(document, "pointermove", function (ev) {
      if (press.timer === null || ev.pointerId !== press.id) return;
      if (Math.abs(ev.clientX - press.x) > 12 || Math.abs(ev.clientY - press.y) > 12) pressCancel();
    }, { passive: true });

    on(document, "pointerup", pressCancel);
    on(document, "pointercancel", pressCancel);

    on(home, "contextmenu", function (ev) {
      if (press.timer !== null || Date.now() - press.firedAt < 900) {
        ev.preventDefault();
        pressCancel();
      }
    });
  }

  /* ---------- 事件：色板 / 壁纸 / 明暗切换后同步 ---------- */
  function onClick(ev) {
    var node = ev.target;
    if (!node || typeof node.closest !== "function") return;

    /* 长按结束后系统还会补一次 click，别让它误关面板或误换壁纸 */
    var fresh = Date.now() - press.firedAt < 650;

    var tile = node.closest("[data-wp-set]");
    if (tile) {
      if (!fresh) setWallpaper(tile.getAttribute("data-wp-set"));
      return;
    }

    if (node.closest("[data-wp-close]")) {
      if (!fresh) closeSheet();
      return;
    }

    /* 设置页入口：先回到桌面，换壁纸时能直接看到效果 */
    if (node.closest("[data-wp-open]")) {
      var os = cos() && cos().os;
      if (os && typeof os.home === "function") os.home();
      else {
        /* 系层没暴露 home 时，退到页面上真实存在的返回桌面条 */
        var bar = document.getElementById("homebar");
        if (bar) bar.click();
      }
      buzz();
      setTimeout(openSheet, 280);
      return;
    }

    var swatch = node.closest("[data-set-skin]");
    if (swatch) {
      select(swatch.getAttribute("data-set-skin"));
      return;
    }

    var glassBtn = node.closest("[data-set-glass]");
    if (glassBtn) {
      selectGlass(glassBtn.getAttribute("data-set-glass"));
      return;
    }

    if (node.closest("[data-bg-pick]")) {
      pickFile();
      return;
    }

    if (node.closest("[data-bg-clear]")) {
      clearImage();
      return;
    }

    var dimBtn = node.closest("[data-bg-dim]");
    if (dimBtn) {
      setDim(Number(dimBtn.getAttribute("data-bg-dim")));
      return;
    }

    if (node.closest("[data-set-theme]")) {
      /* 明暗由 os.js 写 store，这里等它写完再同步属性 */
      setTimeout(paint, 0);
      return;
    }

    /* 设置页每次打开都会重绘整段 body，等它渲染完再同步一次行内状态 */
    if (node.closest("[data-open]")) {
      setTimeout(function () {
        paint();
        syncSwatches();
        syncGlass();
        syncCustom();
      }, 0);
    }
  }

  function onChange(ev) {
    var node = ev.target;
    if (!node || node.id !== "bg-file") return;
    var file = node.files && node.files[0];
    node.value = "";
    readImage(file);
  }

  /* 任何一次写回本地存储后，背景属性都重新跟 store 对齐（含恢复出厂设置） */
  function hookStore() {
    var c = cos();
    if (!c || c.__bgHooked || typeof c.save !== "function") return;
    c.__bgHooked = true;
    var orig = c.save;
    c.save = function () {
      var ok = orig.apply(c, arguments);
      paint();
      return ok;
    };
    /* 恢复出厂设置会清掉背景图，内存里那张也要一起清 */
    if (typeof c.reset === "function" && !c.__bgResetHooked) {
      c.__bgResetHooked = true;
      var origReset = c.reset;
      c.reset = function () {
        sessionImage = "";
        pendingImage = null;
        paintedImage = null;
        var out = origReset.apply(c, arguments);
        paint();
        syncCustom();
        return out;
      };
    }
  }

  function boot() {
    hookStore();
    paint();
    syncSwatches();
    syncGlass();
    syncCustom();
    bindHomePress();
  }

  document.addEventListener("click", onClick, true);
  document.addEventListener("change", onChange, true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  global.CalliaTheme = {
    skins: SKINS,
    ids: SKIN_IDS,
    defaultSkin: DEFAULT_SKIN,
    current: currentSkin,
    mode: currentMode,
    apply: select,
    reset: resetSkin,
    glasses: GLASSES,
    defaultGlass: DEFAULT_GLASS,
    glass: currentGlass,
    glassName: glassName,
    setGlass: selectGlass,
    syncGlass: syncGlass,
    paint: paint,
    find: find,
    image: currentImage,
    dim: currentDim,
    pick: pickFile,
    clear: clearImage,
    setDim: setDim,
    sync: syncCustom,
    presets: PRESETS,
    wallpaper: currentWallpaper,
    wallpaperName: wallpaperName,
    setWallpaper: setWallpaper,
    open: openSheet,
    close: closeSheet
  };
})(window);