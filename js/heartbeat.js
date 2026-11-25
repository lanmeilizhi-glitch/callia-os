/* =====================================================================
   Callia OS · heartbeat.js
   「心跳同步」亲密度里程碑庆祝
   · 触发：亲密度相对上一次触发时的基准值净增长达到 50 点（同一个 50 点区间只触发一次）
   · 特效：头像粉色呼吸光晕 3s / 状态点变跳动红心 3s / 进度条流光一次 / 中央祝贺台词 2s
   · 台词：按角色人设（名字、称呼、口癖、性格）从台词池随机取一条，不写死
   本文件只做「判定 + 特效」，不改动任何原有交互与数据逻辑。
   ===================================================================== */
(function (global) {
  "use strict";

  var S = global.COS;
  if (!S || !S.el) return;

  /* ---------- 可调参数 ---------- */
  var STEP = 50;          /* 每净增多少点触发一次 */
  var FX_MS = 3000;       /* 光晕 / 红心 / 流光持续时长 */
  var TOAST_MS = 2000;    /* 祝贺文字停留时长 */

  /* 上一次触发时的亲密度基准值：初始为 0，触发后更新为当前亲密度 */
  var lastMilestone = 0;
  var fxTimer = null;
  var toastTimer = null;
  var lastLine = "";

  /* ---------- 台词池：按人设拼装，随机取一条 ---------- */
  /* 每条都是「{call}」占位，运行时替换成 TA 对你的称呼 */
  var LINES = [
    "又靠近了一点呢，{call}。",
    "和你在一起的时间，总是很开心。",
    "下一个 50 点，我也很期待哦。",
    "心跳好像和你同步了，你听见了吗？",
    "我把这一刻收好了，像收好清晨的光。",
    "不用说什么，这样待着就很好。",
    "你每次靠近，我的世界就亮一点。",
    "慢慢来，我会一直在这里等你。"
  ];

  /* 人设口癖 / 性格对应的补充台词：让祝贺语跟着角色走 */
  var STYLE_LINES = {
    gentle: ["别急，我们还有很多个 50 点。", "谢谢你愿意一点点走近我。"],
    cool: ["嗯，记下了。", "还不错，继续保持。"],
    playful: ["喂，别停在这里呀。", "再靠近一点，我保证不躲。"],
    quiet: ["……嗯。", "这样就好。"],
    clingy: ["不许走开哦。", "再陪我一会儿，就一会儿。"]
  };

  function pick(list) {
    if (!list || !list.length) return "";
    return list[Math.floor(Math.random() * list.length)];
  }

  function profile() {
    var c = S.store && S.store.companion ? S.store.companion : {};
    return c.profile && typeof c.profile === "object" ? c.profile : {};
  }

  /* 称呼：优先用 TA 对你的称呼，其次用设置里的用户名 */
  function callName() {
    var p = profile();
    var name = String(p.callMe || (S.store.settings && S.store.settings.user) || "").trim();
    return name || "你";
  }

  /* 台词池 = 通用池 + 人设风格池，随机取一条且尽量不与上一条重复 */
  function pickLine() {
    var p = profile();
    var pool = LINES.slice();
    var style = String(p.style || "").trim();
    if (STYLE_LINES[style]) pool = pool.concat(STYLE_LINES[style]);
    /* 口癖：把角色自己的口头禅也当成一条祝贺语 */
    var catchphrase = String(p.catchphrase || "").trim();
    if (catchphrase && catchphrase.length <= 24) pool.push(catchphrase);

    var line = pick(pool);
    for (var i = 0; i < 4 && pool.length > 1 && line === lastLine; i += 1) line = pick(pool);
    lastLine = line;
    return String(line).replace(/\{call\}/g, callName());
  }

  /* ---------- 特效节点 ---------- */
  function orb() {
    return S.el("#home-orb");
  }

  function dial() {
    return S.el("#home-mood-dial");
  }

  function track() {
    var bar = S.el("#home-affinity-bar");
    return bar && bar.parentNode ? bar.parentNode : null;
  }

  function host() {
    return S.el("#screen") || document.body;
  }

  /* 加 class 前先摘掉再强制重排：连续触发时动画能从头再放一次 */
  function restart(node, cls) {
    if (!node) return;
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }

  function clearFx() {
    [orb(), dial(), track()].forEach(function (node) {
      if (node) node.classList.remove("is-heartbeat");
    });
  }

  function showToast(line, intimacy) {
    var old = S.el("#heartbeat-toast");
    if (old && old.parentNode) old.parentNode.removeChild(old);
    if (toastTimer) clearTimeout(toastTimer);

    var node = document.createElement("div");
    node.className = "heartbeat-toast";
    node.id = "heartbeat-toast";
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    node.innerHTML =
      '<span class="heartbeat-toast__line">' + S.esc(line) + "</span>" +
      '<span class="heartbeat-toast__meta">心跳同步 · 亲密度 ' + Math.round(intimacy) + "</span>";
    host().appendChild(node);

    /* 2 秒后自动消失并移除节点 */
    toastTimer = setTimeout(function () {
      toastTimer = null;
      if (node.parentNode) node.parentNode.removeChild(node);
    }, TOAST_MS);
  }

  /* ---------- 播放一次庆祝 ---------- */
  function celebrate(intimacy) {
    restart(orb(), "is-heartbeat");
    restart(dial(), "is-heartbeat");
    restart(track(), "is-heartbeat");
    showToast(pickLine(), intimacy);

    if (fxTimer) clearTimeout(fxTimer);
    fxTimer = setTimeout(function () {
      fxTimer = null;
      clearFx();
    }, FX_MS);

    if (S.os && typeof S.os.haptic === "function") S.os.haptic(18);
  }

  /* ---------- 对外入口：每次亲密度更新后调用 ---------- */
  function sync(current) {
    var value = Number(current);
    if (!isFinite(value)) return false;
    /* 亲密度被重置（变小）时，基准跟着回到 0，避免重置后立刻误触发 */
    if (value < lastMilestone) lastMilestone = 0;
    if (value - lastMilestone < STEP) return false;
    lastMilestone = value;
    celebrate(value);
    return true;
  }

  /* 手动重置基准（例如设置页重置心情与亲密度后） */
  function reset() {
    lastMilestone = 0;
    clearFx();
    var node = S.el("#heartbeat-toast");
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  S.heartbeat = {
    STEP: STEP,
    sync: sync,
    reset: reset,
    celebrate: celebrate,
    pickLine: pickLine,
    milestone: function () {
      return lastMilestone;
    }
  };
})(window);
