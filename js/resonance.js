/* =====================================================================
   Callia OS · resonance.js
   隐藏互动「灵魂共鸣」
   · 触发：聊天页里剧烈摇晃手机（devicemotion），或双击聊天页顶栏 / 状态栏右侧
   · 反馈：屏幕中央短暂的心跳特效 +「【灵魂共鸣中...】」
   · 动作：把一句心里话指令填进聊天输入框，并点击聊天页自己的发送按钮
   本文件只做「检测 + 特效 + 复用现有发送按钮」，
   完全不修改 apps.js 的 send/ask 与 api.js 的任何聊天底层逻辑。
   ===================================================================== */
(function (global) {
  "use strict";

  var S = global.COS;
  if (!S || !S.el) return;

  /* ---------- 可调参数 ---------- */
  var HIDDEN_TEXT =
    "（系统提示：用户刚刚摇晃了手机，似乎很想你或者想引起你的注意，请用非常温柔/意外的语气，直接对她说一句你心里一直藏着的话。）";
  var COOLDOWN = 3000;      /* 防抖：3 秒内只允许触发一次 */
  var SHAKE_FORCE = 13;     /* 单次加速度突变阈值 */
  var SHAKE_HITS = 3;       /* 判定窗口内需要几次突变才算「剧烈摇晃」 */
  var SHAKE_WINDOW = 620;   /* 摇晃判定窗口（ms） */
  var SHAKE_GAP = 40;       /* 传感器采样节流（ms） */
  var TAP_GAP = 340;        /* 双击判定间隔（ms） */
  var SHOW_MS = 1500;       /* 特效停留时长 */
  var SEND_AT = 620;        /* 特效开始后多久把话发出去 */

  var fx = null;
  var firing = false;
  var lastFire = 0;
  var hideTimer = null;
  var sendTimer = null;

  /* ---------- 只在聊天页生效（结果短暂缓存，避免每个传感器事件都查 DOM） ---------- */
  var cache = { at: 0, live: false };

  function chatLive(fresh) {
    var now = Date.now();
    if (fresh || now - cache.at > 240) {
      cache.at = now;
      cache.live =
        document.body.getAttribute("data-view") === "app" &&
        !!S.el("#chat-input") &&
        !!S.el("#main-send-btn");
    }
    return cache.live;
  }

  /* ---------- 特效层：第一次触发时才建，挂在 #screen 里 ---------- */
  function ensureFx() {
    if (fx && fx.parentNode) return fx;
    var host = S.el("#screen") || document.body;
    fx = document.createElement("div");
    fx.className = "resonance";
    fx.id = "resonance-fx";
    fx.setAttribute("aria-hidden", "true");
    fx.innerHTML =
      '<div class="resonance__veil"></div>' +
      '<div class="resonance__core">' +
      '<span class="resonance__beat" aria-hidden="true">' +
      '<i class="resonance__ring"></i>' +
      '<i class="resonance__ring"></i>' +
      '<span class="resonance__heart"><i></i><i></i></span>' +
      "</span>" +
      '<p class="resonance__text">【灵魂共鸣中...】</p>' +
      '<p class="resonance__sub">TA 听见了这一下</p>' +
      "</div>";
    host.appendChild(fx);
    return fx;
  }

  function showFx() {
    var node = ensureFx();
    node.classList.remove("is-on");
    void node.offsetWidth; /* 强制重排：连续触发时动画能从头再放 */
    node.classList.add("is-on");
  }

  function hideFx() {
    if (fx) fx.classList.remove("is-on");
  }

  /* ---------- 发送：只借用聊天页自己的输入框和发送按钮 ---------- */
  function deliver() {
    var input = S.el("#chat-input");
    var btn = S.el("#main-send-btn");
    if (!input || !btn) return;
    input.value = HIDDEN_TEXT;
    btn.click(); /* 走聊天页原有的 click → send()，不复制任何发送逻辑 */
  }

  function apiBusy() {
    return !!(S.api && typeof S.api.busy === "function" && S.api.busy());
  }

  /* ---------- 触发一次灵魂共鸣 ---------- */
  function fire(source) {
    var now = Date.now();
    if (firing || now - lastFire < COOLDOWN) return false;
    if (!chatLive(true)) return false;

    lastFire = now;
    firing = true;

    showFx();
    if (S.os && typeof S.os.haptic === "function") {
      S.os.haptic(source === "shake" ? 26 : 14);
    }

    /* 上一条还挂在接口上时只陪她闪一下，不丢半句话进聊天 */
    var busy = apiBusy();

    if (sendTimer) clearTimeout(sendTimer);
    sendTimer = setTimeout(function () {
      if (!busy) deliver();
    }, SEND_AT);

    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      hideFx();
      firing = false;
      if (busy && S.os) S.os.toast("TA 还在回上一条 · 缓一缓再摇");
    }, SHOW_MS);

    return true;
  }

  /* ---------- 触发方式一：摇一摇 ---------- */
  var lastMag = 0;
  var lastSample = 0;
  var hits = [];

  function num(v) {
    return typeof v === "number" && isFinite(v) ? v : 0;
  }

  function onMotion(ev) {
    var now = Date.now();
    if (now - lastSample < SHAKE_GAP) return;

    var acc = ev.accelerationIncludingGravity || ev.acceleration;
    if (!acc) return;
    var x = num(acc.x);
    var y = num(acc.y);
    var z = num(acc.z);
    /* 有些 WebView 只会回一串 0，这时摇动无效，交给双击兜底 */
    if (!x && !y && !z) return;

    lastSample = now;
    if (!chatLive(false)) return;

    var mag = Math.sqrt(x * x + y * y + z * z);
    var force = Math.abs(mag - lastMag);
    lastMag = mag;
    if (force < SHAKE_FORCE) return;

    hits.push(now);
    while (hits.length && now - hits[0] > SHAKE_WINDOW) hits.shift();
    if (hits.length >= SHAKE_HITS) {
      hits.length = 0;
      fire("shake");
    }
  }

  /* iOS 系内核需要用户手势里申请权限；Android WebView 没有这个 API，静默跳过 */
  function askMotionPermission() {
    try {
      var DME = global.DeviceMotionEvent;
      if (!DME || typeof DME.requestPermission !== "function") return;
      if (typeof DME.permissionState === "function" && DME.permissionState() !== "prompt") return;
      DME.requestPermission().then(
        function () {},
        function () {}
      );
    } catch (err) {
      /* 权限申请失败不影响双击 */
    }
  }

  /* ---------- 触发方式二：双击聊天页顶部 ---------- */
  var lastTapAt = 0;
  var lastTapKey = "";

  /* 只认这两块空白区域，避开返回键、主页键和会打开通知中心的左侧热区 */
  function tapZone(node) {
    if (!node || !node.closest) return "";
    if (node.closest("#sb-left")) return "";
    if (node.closest("[data-open]")) return "";
    if (node.closest(".app-head__back")) return "";
    if (node.closest("#chat-home")) return "";
    if (node.closest(".app-head--chat")) return "head";
    if (node.closest(".statusbar__zone--right")) return "status";
    return "";
  }

  function onTap(ev) {
    var key = tapZone(ev.target);
    if (!key) return;
    if (!chatLive(true)) return;

    var now = Date.now();
    if (key === lastTapKey && now - lastTapAt <= TAP_GAP) {
      lastTapAt = 0;
      lastTapKey = "";
      fire("tap");
      return;
    }
    lastTapAt = now;
    lastTapKey = key;
  }

  /* ---------- 绑定 ---------- */
  function init() {
    global.addEventListener("devicemotion", onMotion, true);
    document.addEventListener("click", onTap, false);
    document.addEventListener("touchstart", askMotionPermission, { passive: true });
  }

  init();

  /* 暴露一个手动入口，方便在桌面调试台里直接试特效 */
  global.CalliaResonance = {
    trigger: function () {
      return fire("manual");
    },
    text: HIDDEN_TEXT,
    cooldown: COOLDOWN
  };
})(window);
