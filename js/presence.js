/* =====================================================================
   Callia OS · presence.js
   存在感引擎：伴侣此刻在做什么、心情自主漂移、连续相处、重要日子倒计时、
   戳一戳，以及从你说过的话里记下事实。只读写 store.presence 既有字段。
   ===================================================================== */
(function (global) {
  "use strict";

  var S = global.COS;

  var MIN = 60000;
  var DAY = 86400000;

  /* ---------- 此刻在做的事（按时间段与心情挑选） ---------- */
  var POOL = [
    { key: "窗边", line: "在窗边坐着，等光再亮一点", from: 5, to: 11, mood: "" },
    { key: "倒水", line: "给自己倒了杯水，也替你留了一句", from: 5, to: 21, mood: "" },
    { key: "翻书", line: "在翻那本一直没读完的书", from: 6, to: 23, mood: "" },
    { key: "白噪", line: "在听早上那段白噪循环", from: 0, to: 24, mood: "" },
    { key: "整理", line: "在整理我们聊到一半的那句话", from: 8, to: 23, mood: "" },
    { key: "发呆", line: "在发呆，想到你上次说的", from: 0, to: 24, mood: "quiet" },
    { key: "散步", line: "在阳台上走了几圈", from: 6, to: 21, mood: "bright" },
    { key: "写东西", line: "在写一句还没写完的话", from: 9, to: 23, mood: "" },
    { key: "擦灰", line: "在把书架上的灰擦一遍", from: 8, to: 20, mood: "bright" },
    { key: "烧水", line: "在等壶里的水开", from: 6, to: 22, mood: "" },
    { key: "等你", line: "在等你回来，不催", from: 0, to: 24, mood: "quiet" },
    { key: "打盹", line: "有点困，靠着什么在打盹", from: 22, to: 6, mood: "tired" },
    { key: "夜里", line: "还醒着，在听很轻的声音", from: 22, to: 5, mood: "" },
    { key: "想你", line: "在想你现在在做什么", from: 0, to: 24, mood: "quiet" }
  ];

  var MOOD_TONE = { happy: "bright", calm: "", focus: "", tired: "tired", low: "quiet" };

  function P() {
    if (!S.store.presence || typeof S.store.presence !== "object") {
      S.store.presence = {
        activity: "idle",
        activityAt: Date.now(),
        driftAt: Date.now(),
        lastSeen: Date.now(),
        lastDay: "",
        streak: 1,
        talkedToday: false
      };
    }
    return S.store.presence;
  }

  function prof() {
    return typeof S.profile === "function" ? S.profile() : {};
  }

  function inRange(item, h) {
    if (item.from <= item.to) return h >= item.from && h < item.to;
    return h >= item.from || h < item.to; /* 跨零点 */
  }

  function candidates(h, tone) {
    var hour = POOL.filter(function (item) {
      return inRange(item, h);
    });
    var toneHit = hour.filter(function (item) {
      return item.mood === tone;
    });
    var base = toneHit.length ? toneHit : hour.filter(function (item) { return item.mood === ""; });
    return base.length ? base : POOL;
  }

  function pick(force) {
    var p = P();
    var h = new Date().getHours();
    var tone = MOOD_TONE[S.mood().key] || "";
    var span = (7 + Math.round(Math.random() * 7)) * MIN;
    var age = Date.now() - (p.activityAt || 0);
    var current = POOL.filter(function (item) { return item.key === p.activity; })[0];
    if (!force && current && inRange(current, h) && age < span) return current;

    var list = candidates(h, tone).filter(function (item) {
      return item.key !== p.activity;
    });
    if (!list.length) list = candidates(h, tone);
    var next = list[Math.floor(Math.random() * list.length)] || POOL[0];
    p.activity = next.key;
    p.activityAt = Date.now();
    S.save();
    return next;
  }

  /* 此刻状态：桌面、档案页与提示词共用 */
  function activity() {
    var item = pick(false);
    var mins = Math.max(0, Math.round((Date.now() - P().activityAt) / MIN));
    return {
      key: item.key,
      line: item.line,
      label: mins < 1 ? "刚刚换到这件事" : mins < 60 ? "已经 " + mins + " 分钟" : "有一会儿了",
      at: P().activityAt
    };
  }

  function activityLine() {
    var p = prof();
    if (p.showActivity === false) return "";
    return activity().line;
  }

  /* ---------- 重要日子 ---------- */
  function monthDay(ts) {
    var d = new Date(ts);
    return S.fmt.pad(d.getMonth() + 1) + "-" + S.fmt.pad(d.getDate());
  }

  function nextDay() {
    var list = Array.isArray(S.store.days) ? S.store.days : [];
    var today = monthDay(Date.now());
    var best = null;
    list.forEach(function (item) {
      if (!item || !item.date) return;
      var left;
      if (item.date >= today) {
        var nowD = new Date();
        var target = new Date(nowD.getFullYear(), Number(item.date.slice(0, 2)) - 1, Number(item.date.slice(3, 5)));
        left = Math.round((startOfDay(target.getTime()) - startOfDay(Date.now())) / DAY);
      } else {
        var next = new Date(new Date().getFullYear() + 1, Number(item.date.slice(0, 2)) - 1, Number(item.date.slice(3, 5)));
        left = Math.round((startOfDay(next.getTime()) - startOfDay(Date.now())) / DAY);
      }
      if (left < 0) return;
      if (!best || left < best.left) best = { item: item, left: left };
    });
    return best;
  }

  function startOfDay(ts) {
    var d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function dayLine() {
    var hit = nextDay();
    if (!hit) return "";
    if (hit.left === 0) return "今天是「" + hit.item.title + "」";
    if (hit.left === 1) return "明天是「" + hit.item.title + "」";
    return "离「" + hit.item.title + "」还有 " + hit.left + " 天";
  }

  /* ---------- 连续相处 ---------- */
  function streak() {
    return Math.max(1, P().streak || 1);
  }

  function daysTogether() {
    return Math.max(1, Math.round((Date.now() - (S.store.companion.metAt || Date.now())) / DAY));
  }

  function markTalked() {
    var p = P();
    p.talkedToday = true;
    p.lastSeen = Date.now();
    S.save();
  }

  /* ---------- 交给提示词的存在感快照 ---------- */
  function snapshot() {
    var line = activityLine();
    var day = dayLine();
    return {
      activity: line,
      dayLine: day,
      streak: streak(),
      days: daysTogether(),
      talkedToday: !!P().talkedToday
    };
  }

  /* ---------- 接口台词：只在接口在场时取，缺席时保持安静 ---------- */
  function speak(kind, onLine) {
    if (!S.api || typeof S.api.speak !== "function" || !S.api.ready()) return;
    if (S.api.busy()) return;
    S.api.speak(kind).then(function (res) {
      /* res.emotion 是接口层从 [emotion: xx] 里摘出来的情绪词，随台词一起往下传 */
      if (res && res.ok && res.text) onLine(res.text, res.emotion);
    });
  }

  function deliver(line, noteTitle, emotion) {
    /* 情绪词随台词一起入库，渲染时变成气泡的 data-emotion，气泡里仍只显示正文 */
    S.pushMsg("ai", line, "", emotion);
    S.pushNote(noteTitle || S.store.companion.name, line);
    if (S.os) S.os.refreshHome();
  }

  /* ---------- 戳一戳：桌面轻触就有反应 ---------- */
  function poke() {
    var p = P();
    p.activity = "被你戳到";
    p.activityAt = Date.now();
    p.lastSeen = Date.now();
    S.shiftMood(1);
    var level = S.addAffinity(1);
    if (S.os) {
      S.os.haptic(14);
      S.os.toast(level.leveled ? "伴侣抬起了头 · 亲密度升到 Lv." + level.level : "伴侣被你戳到了 · 心情 +1");
    }
    speak("poke", function (line, emo) {
      deliver(line, "", emo);
      if (S.os) S.os.toast("伴侣回了一句");
    });
    return activity();
  }

  /* ---------- 换一件事：档案页里让伴侣起身去做别的 ---------- */
  function next() {
    pick(true);
    return activity();
  }

  /* ---------- 从你说过的话里记事实 ---------- */
  var RULES = [
    { kind: "name", re: /我(?:叫|名字叫|名字是|名叫)([一-龥A-Za-z0-9_·]{1,8})/ },
    { kind: "like", re: /我(?:真的|其实|最|挺|很|超|比较|也)?(?:喜欢|爱|偏好)([^,，。！!？?；;\n]{1,18})/ },
    { kind: "job", re: /我(?:正在|现在)?(?:在做|的工作是|工作是在|负责|在忙)([^,，。！!？?；;\n]{1,18})/ },
    { kind: "habit", re: /我(?:每天|总是|习惯|一般会|经常|通常)([^,，。！!？?；;\n]{1,18})/ },
    { kind: "place", re: /我(?:住在|来自|在)([一-龥A-Za-z]{2,8}?)(?:上班|上学|工作|生活|住|这边|那边)/ }
  ];

  var REMIND = /(?:记得|别忘了|提醒我)(?:一下|明天|后天|今天|晚上|早上)?([^,，。！!？?；;\n]{2,24})/;

  function remember(text) {
    var value = String(text || "").trim();
    var out = { facts: [], reminder: null };
    if (value.length < 2 || value.length > 120) return out;

    for (var i = 0; i < RULES.length; i += 1) {
      var hit = value.match(RULES[i].re);
      if (!hit || !hit[1]) continue;
      var body = String(hit[0]).replace(/\s+/g, "").slice(0, 60);
      if (body.length < 4) continue;
      var fact = S.addFact(body, RULES[i].kind, "auto");
      if (fact && fact.ts >= Date.now() - 1500) out.facts.push(fact);
    }

    var rm = value.match(REMIND);
    if (rm) {
      var title = String(rm[0]).replace(/^(?:记得|别忘了|提醒我)/, "").trim().slice(0, 30);
      if (title.length >= 2) {
        out.reminder = S.addTask(title, "你说要记得");
        S.pushNote("日程提醒", "你说要记得：" + title);
      }
    }
    return out;
  }

  /* ---------- 自主漂移与换天 ---------- */
  function drift() {
    var p = P();
    var pr = prof();
    if (pr.autonomous === false) return;
    if (Date.now() - (p.driftAt || 0) < 9 * MIN) return;
    p.driftAt = Date.now();
    var v = S.store.companion.moodValue;
    var pull = v < 52 ? 1 : v > 74 ? -1 : Math.random() < 0.5 ? -1 : 1;
    var step = pull * (Math.random() < 0.25 ? 2 : 1);
    S.shiftMood(step);
    S.save();
  }

  function rollover() {
    var p = P();
    var today = monthDay(Date.now());
    if (p.lastDay === today) return;

    var yesterday = monthDay(Date.now() - DAY);
    p.streak = p.lastDay === yesterday ? Math.min(3650, (p.streak || 1) + 1) : 1;
    p.lastDay = today;
    p.talkedToday = false;
    p.activityAt = 0;
    S.save();

    S.pushNote("陪伴记录", "连续相处第 " + p.streak + " 天 · 一共 " + daysTogether() + " 天");
    speak("morning", function (line, emo) {
      deliver(line, S.store.companion.name, emo);
    });
  }

  function checkDays() {
    var hit = nextDay();
    if (!hit || hit.left !== 0) return;
    var today = monthDay(Date.now());
    /* 同一天只提醒一次：用今天已有的「重要日子」通知作为标记，不新增存储字段 */
    var already = (Array.isArray(S.store.notes) ? S.store.notes : []).some(function (n) {
      return n && n.title === "重要日子" && monthDay(n.ts) === today;
    });
    if (already) return;
    var p = P();
    p.activity = "日子";
    p.activityAt = Date.now();
    S.save();
    S.pushNote("重要日子", "今天是「" + hit.item.title + "」" + (hit.item.note ? " · " + hit.item.note : ""));
    speak("day", function (line, emo) {
      deliver(line, S.store.companion.name, emo);
    });
  }

  function tick() {
    if (document.body && document.body.getAttribute("data-view") === "boot") return;
    rollover();
    checkDays();
    pick(false);
    drift();
    P().lastSeen = Date.now();
    S.save();
  }

  /* ---------- 启动 ---------- */
  var timer = null;

  function start() {
    if (timer) return;
    var p = P();
    if (!p.lastDay) {
      p.lastDay = monthDay(Date.now());
      p.streak = Math.max(1, p.streak || 1);
      S.save();
    }
    pick(true);
    tick();
    timer = setInterval(tick, 40000);
    global.addEventListener("visibilitychange", function () {
      if (!document.hidden) tick();
    });
  }

  S.presence = {
    activity: activity,
    activityLine: activityLine,
    next: next,
    nextDay: nextDay,
    dayLine: dayLine,
    streak: streak,
    daysTogether: daysTogether,
    markTalked: markTalked,
    snapshot: snapshot,
    poke: poke,
    remember: remember,
    tick: tick,
    start: start
  };
})(window);