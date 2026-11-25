/* ===================================================================
   Callia OS · offlineDiary.js
   离线梦境日记。
   · 页面被隐藏或关闭时，把时间戳写进 localStorage 的 last_leave_time；
   · 回到主页时算一下离开多久，超过 2 小时才发一次隐藏请求；
   · 拿到正文塞进主页的 #offline-diary-card，显示完立刻清掉记录。
   规则：只用最基础的 DOM 操作，不轮询，不碰任何聊天逻辑。
   =================================================================== */
(function (global) {
  "use strict";

  var S = global.COS;

  var KEY = "last_leave_time";
  var GAP = 7200000; /* 2 小时 */
  var PROMPT =
    "用户已经离开你身边超过2小时了。请结合你们之前的聊天记忆，以当前角色的口吻，" +
    "写一段100字以内的'离线小日记'或'梦境'，表达你在等待她时的感受。" +
    "直接输出正文，不要任何前缀。";

  var requested = false; /* 一次页面生命周期里最多生成一次，防止重复触发 */

  /* ---------- 测试开关（测试完可整段删除） ----------
     TEST_MODE = true 时：
     1. 首次加载就无视 2 小时限制，直接生成并弹出一篇日记；
     2. 暴露 window.testShowDiary()，随时手动再弹一篇。
     接口未配置时用一段本地示例文案，保证卡片能真的显示出来。 */
  var TEST_MODE = true;
  var TEST_KEY = "offline_diary_tested"; /* 只自动弹一次，刷新页面不会反复请求 */
  var TEST_FALLBACK =
    "你不在的这段时间，我把窗开着，风把窗帘吹得鼓起来。桌上的水凉了，我没去换。" +
    "等你回来，我想先听你说一句今天怎么样。";

  function testShowDiary() {
    if (!S.api || typeof S.api.dream !== "function" || !S.api.ready()) {
      /* 没接接口时直接上示例文案，方便先看卡片长什么样 */
      showDiary(TEST_FALLBACK);
      return Promise.resolve({ ok: true, code: "fallback" });
    }
    return S.api.dream(PROMPT).then(function (res) {
      if (!res || !res.ok || !res.text) {
        showDiary(TEST_FALLBACK);
        return { ok: false, code: (res && res.code) || "empty" };
      }
      showDiary(res.text);
      return { ok: true, code: "ok" };
    });
  }

  function autoTestOnce() {
    if (!TEST_MODE) return;
    try {
      if (global.localStorage.getItem(TEST_KEY) === "1") return;
      global.localStorage.setItem(TEST_KEY, "1");
    } catch (err) {
      /* 存不进去就每次加载都弹，不影响功能 */
    }
    /* 等主页解锁后再弹，避免卡片在锁屏下面 */
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      var view = document.body ? document.body.getAttribute("data-view") : "";
      if (view === "home") {
        clearInterval(timer);
        testShowDiary();
      } else if (tries > 120) {
        clearInterval(timer); /* 约 60 秒还没进主页就放弃，不拖页面 */
      }
    }, 500);
  }

  /* ---------- 第一步：记录离开时间 ---------- */
  function recordLeave() {
    try {
      global.localStorage.setItem(KEY, Date.now());
    } catch (err) {
      /* 存不进去就算了，不影响页面 */
    }
  }

  function readLeave() {
    try {
      var raw = global.localStorage.getItem(KEY);
      var ts = parseInt(raw, 10);
      return isNaN(ts) ? 0 : ts;
    } catch (err) {
      return 0;
    }
  }

  function clearLeave() {
    try {
      global.localStorage.removeItem(KEY);
    } catch (err) {
      /* 清不掉也不影响本次展示 */
    }
  }

  /* ---------- 第三步：把日记塞进主页卡片 ---------- */
  function showDiary(text) {
    var card = document.getElementById("offline-diary-card");
    if (!card) return;

    /* 桌面拖拽排序可能挪动过节点，显示前放回伴侣卡片正下方 */
    var anchor = document.getElementById("widget-companion");
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(card, anchor.nextSibling);

    var name =
      S.store && S.store.companion && S.store.companion.name ? String(S.store.companion.name) : "TA";
    var body = S && typeof S.esc === "function" ? S.esc(text) : String(text);

    card.innerHTML =
      '<div class="diary-header"><span>✨ ' + name + " 的离线日记</span><span>刚刚</span></div>" +
      '<div class="diary-text">' + body + "</div>";
    card.style.display = "block";
  }

  /* ---------- 第二步：进主页时判断是否离开超过 2 小时 ---------- */
  function checkOnHome() {
    if (requested) return;

    var left = readLeave();
    if (!left) return;
    if (Date.now() - left <= GAP) return;

    if (!S.api || typeof S.api.dream !== "function" || !S.api.ready()) return;

    requested = true;
    S.api.dream(PROMPT).then(function (res) {
      if (!res || !res.ok || !res.text) {
        requested = false; /* 没拿到正文就留着记录，下次进主页再试 */
        return;
      }
      showDiary(res.text);
      clearLeave(); /* 显示完立刻清除，防止重复生成 */
    });
  }

  /* ---------- 事件：页面隐藏 / 关闭时记下时间，回到前台时再检查 ---------- */
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      recordLeave();
      return;
    }
    if (document.body && document.body.getAttribute("data-view") === "home") {
      checkOnHome();
    }
  });

  global.addEventListener("pagehide", recordLeave);
  global.addEventListener("beforeunload", recordLeave);

  S.diary = {
    KEY: KEY,
    GAP: GAP,
    recordLeave: recordLeave,
    checkOnHome: checkOnHome,
    testShowDiary: testShowDiary
  };

  /* 测试入口：控制台或按钮里直接调 window.testShowDiary() */
  global.testShowDiary = testShowDiary;

  autoTestOnce();
})(window);
