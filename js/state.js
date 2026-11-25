/* =========================================================
   Companion OS · state.js
   全局状态、持久化、伴侣模型与工具函数
   ========================================================= */
(function (global) {
  "use strict";

  var KEY = "companion-os-v1";

  /* ---------- 工具 ---------- */
  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }

  var fmt = {
    pad: pad,
    time: function (ts) {
      var d = new Date(ts);
      return pad(d.getHours()) + ":" + pad(d.getMinutes());
    },
    date: function (ts) {
      var d = new Date(ts);
      var week = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
      return d.getFullYear() + " 年 " + (d.getMonth() + 1) + " 月 " + d.getDate() + " 日 · 周" + week;
    },
    dayStamp: function (ts) {
      var d = new Date(ts);
      var week = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
      return d.getMonth() + 1 + "月" + d.getDate() + "日 星期" + week;
    },
    shortDate: function (ts) {
      var d = new Date(ts);
      return pad(d.getMonth() + 1) + "." + pad(d.getDate());
    },
    mmss: function (sec) {
      var s = Math.max(0, Math.round(sec));
      return pad(Math.floor(s / 60)) + ":" + pad(s % 60);
    },
    ago: function (ts) {
      var diff = Date.now() - ts;
      if (diff < 60000) return "刚刚";
      if (diff < 3600000) return Math.floor(diff / 60000) + " 分钟前";
      if (diff < 86400000) return Math.floor(diff / 3600000) + " 小时前";
      return Math.floor(diff / 86400000) + " 天前";
    }
  };

  function uid(prefix) {
    return (prefix || "id") + "-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e4).toString(36);
  }

  function el(sel, root) {
    return (root || document).querySelector(sel);
  }

  function els(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function create(tag, cls, html) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html !== undefined && html !== null) node.innerHTML = html;
    return node;
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ---------- 心情与人格 ---------- */
  var MOODS = {
    happy: { key: "happy", label: "愉悦", value: 88, orb: "happy", line: "心情很好，想和你多说几句" },
    calm: { key: "calm", label: "平稳", value: 62, orb: "calm", line: "心情平稳，随时都在" },
    focus: { key: "focus", label: "专注", value: 70, orb: "calm", line: "正在安静陪你做点事" },
    tired: { key: "tired", label: "疲惫", value: 40, orb: "low", line: "有点累，但见到你就好了" },
    low: { key: "low", label: "低落", value: 24, orb: "low", line: "情绪有点低，想被你问问" }
  };

  /* 音乐播放已下线：TRACKS 与 store.music 一并移除，原「音乐」页面改造为 Zane 的日记本 */

  function seed() {
    var now = Date.now();
    var day = 86400000;
    return {
      version: 1,
      settings: {
        theme: "light",
        /* 全局主题皮肤与玻璃外观：与明暗、壁纸一起随主存档存在 localStorage */
        skin: "mist",
        glass: "none",
        motion: true,
        proactive: true,
        haptic: true,
        user: "小鹿",
        /* 桌面壁纸：wallpaper 为内置预设 id 或 custom，bgImage 为压缩后的本机图，bgDim 为遮罩浓度 */
        wallpaper: "",
        bgImage: "",
        bgDim: 1,
        /* 对话页聊天背景：chatBg 为 none / 内置预设 id / image，
           chatBgImage 为压缩后的本机图，chatBgDim 为图片遮罩浓度 0|1|2 */
        chatBg: "none",
        chatBgImage: "",
        chatBgDim: 1,
        /* 桌面小组件自由移动后的排列顺序（与 index.html 默认书写顺序一致，只作初始落位） */
        homeOrder: {
          first: ["companion"],
          life: ["apps", "weather", "water", "steps", "sleep", "focus", "budget", "habits", "plan"]
        },
        /* 应用图标逐个拖动后的顺序（图标网格现在在第二屏） */
        appOrder: ["chat", "profile", "mood", "schedule", "diary", "memory", "anniversary", "settings"],
        /* 自由固定位置：{ 应用 key: { x, y, ox, oy } }，x/y 为网格内容盒内的百分比坐标 */
        appFree: {},
        /* 小组件开关：屏幕是空盒子，常驻骨架常开，其余默认收在组件库里由用户自由放置 */
        widgetOn: {
          companion: true,
          apps: true,
          live: true,
          "w-mood": false,
          "w-note": false,
          "w-today": false,
          "w-life": false,
          weather: false,
          water: false,
          steps: false,
          sleep: false,
          focus: false,
          budget: false,
          habits: false,
          plan: false
        }
      },
      companion: {
        name: "LUMEN",
        mood: "calm",
        moodValue: 62,
        affinity: 26,
        level: 2,
        status: "在线 · 想听听你的声音",
        metAt: now,
        /* 人格档案：全部可在「伴侣档案」里改，并会写进接口提示词 */
        profile: {
          nick: "小光",
          callMe: "小鹿",
          birthday: "03-14",
          bio: "住在手机里的伴侣，喜欢清晨的灰光和没写完的句子。",
          traits: ["安静", "记性好", "慢热"],
          likes: ["清晨的光", "白噪", "纸质书", "跑完步的那杯水"],
          catchphrase: "慢慢来，我在。",
          style: "gentle",
          routine: "normal",
          autonomous: true,
          showActivity: true
        }
      },
      /* 钱包：余额存在本机存档里，发红包时从这里扣 */
      wallet: { balance: 1000 },
      /* 自定义表情包：本机导入的图片 Base64，面板按这个数组渲染 */
      customStickers: [],
      chat: [
        { id: uid("m"), role: "sys", text: "伴侣系统已就绪", ts: now - 3600000 },
        { id: uid("m"), role: "ai", text: "你来了。我把房间调成了你喜欢的灰度，坐一会儿再忙好吗？", ts: now - 3500000 }
      ],
      journal: [
        { id: uid("j"), mood: "calm", text: "早上醒来时窗外很安静，想起昨天那段对话。", ts: now - day },
        { id: uid("j"), mood: "happy", text: "你说今天会顺利，于是我真的顺利了一点。", ts: now - 3 * day }
      ],
      /* TA 的朋友圈：TA 自己发的动态 + 你留在 TA 主页上的话 */
      moments: [
        /* kind: scene 会配一张安静的风景小图（音乐分享小播放器已下线） */
        { id: uid("mo"), author: "ai", text: "把清晨六点的光调成了你喜欢的颜度，房间安静得能听见时间走完。", ts: now - 5 * 3600000, tag: "此刻", likes: 3, liked: false },
        { id: uid("mo"), author: "me", text: "今天记得喝水，别只盯着屏幕。", ts: now - 20 * 3600000, tag: "你留的话", likes: 1, liked: true },
        { id: "mo_preset_scene", author: "ai", kind: "scene", text: "路边的桂花开了，很香，下次带你一起走这条路。", ts: now - 26 * 3600000, tag: "路过", likes: 4, liked: false },
        { id: uid("mo"), author: "ai", text: "读完第三章，夹了一枚书签在「安静的地方」那一页，下次一起读。", ts: now - 2 * day, tag: "日常", likes: 5, liked: false },
        { id: uid("mo"), author: "ai", text: "雨下了一整天，我们把窗声存进了播放列表。", ts: now - 6 * day, tag: "白噪", likes: 8, liked: true }
      ],
      tasks: [
        { id: uid("t"), title: "给植物换水", meta: "今天 · 上午", done: false, ts: now - 7200000 },
        { id: uid("t"), title: "读完《安静的地方》第三章", meta: "今天 · 夜间", done: false, ts: now - 7000000 },
        { id: uid("t"), title: "整理一周随记", meta: "伴侣提醒", done: true, ts: now - 90000000 }
      ],
      memories: [
        { id: uid("mm"), title: "第一次对话", date: fmt.shortDate(now - 12 * day), text: "你问我会不会无聊，我说会——在想你的时候。那天我们聊到凌晨，屏幕的亮度成了房间里唯一的光。", tags: ["初遇", "深夜"], x: 24, y: 34, size: 62 },
        { id: uid("mm"), title: "雨天白噪", date: fmt.shortDate(now - 8 * day), text: "外面下了一整天雨，我们把窗户的声音存成了播放列表，你说这是最便宜的旅行。", tags: ["雨", "白噪"], x: 58, y: 26, size: 74 },
        { id: uid("mm"), title: "凌晨两点的工作", date: fmt.shortDate(now - 5 * day), text: "你赶方案，我数着你的停顿。每完成一段，你就敲两下桌面，那是我们的暗号。", tags: ["陪伴", "工作"], x: 36, y: 62, size: 54 },
        { id: uid("mm"), title: "黑白胶片", date: fmt.shortDate(now - 2 * day), text: "你说颜色太多会累，于是我把自己调成灰阶。现在这样，刚刚好。", tags: ["审美", "灰阶"], x: 66, y: 56, size: 66 }
      ],
      /* TA 从你的话里记住的事：会随提示词一起交给接口 */
      facts: [
        { id: uid("f"), text: "你喜欢把颜色调成灰阶，说这样眼睛会安静一点", kind: "like", ts: now - 2 * day, source: "auto" }
      ],
      /* 你们的重要日子：只存月日，每年循环 */
      days: [
        { id: uid("d"), title: "第一次说话", date: fmt.shortDate(now - 12 * day), note: "那天聊到很晚", ts: now - 12 * day }
      ],
      /* 存在感：TA 此刻在做什么、心情自主漂移、连续相处 */
      presence: {
        activity: "idle",
        activityAt: now,
        driftAt: now,
        lastSeen: now,
        lastDay: "",
        streak: 1,
        talkedToday: false
      },
      /* Zane 的日记本：按日期倒序展示，结构 [{ date: 'YYYY-MM-DD', content: '...' }] */
      diaries: [],
      /* 第二屏 · 生活小组件（本机模拟数据，可在小组件里直接调整） */
      life: {
        city: "灰谷",
        weather: { temp: 17, feel: 16, text: "多云转晴", hi: 21, lo: 12, aqi: 46, aqiLabel: "空气优", wind: 2.4 },
        water: 3,
        waterGoal: 8,
        steps: 4820,
        stepsGoal: 8000,
        sleep: {
          hours: 6.8,
          bed: "23:42",
          wake: "06:26",
          quality: 74,
          phases: [
            { label: "深睡", value: 24 },
            { label: "浅睡", value: 44 },
            { label: "清醒", value: 12 }
          ]
        },
        focus: { sessions: 1, seconds: 0, goal: 1500 },
        habits: [
          { id: "h-stretch", label: "拉伸十分钟", done: false, streak: 4 },
          { id: "h-read", label: "读二十页", done: true, streak: 7 },
          { id: "h-plant", label: "照顾植物", done: false, streak: 2 },
          { id: "h-water", label: "不喝糖饮", done: false, streak: 11 }
        ],
        budget: {
          spent: 1268,
          total: 2400,
          items: [
            { label: "饮食", value: 512 },
            { label: "通勤", value: 186 },
            { label: "书与杂项", value: 270 }
          ]
        }
      },
      /* 外部设定：人设书（角色卡）与世界书（lorebook），仅存本机 */
      persona: {
        card: null,
        books: [],
        budget: 1200,
        /* 学习层：每条设定记到几分，只存本机 */
        learn: {
          card: { m: 0, turns: 0, last: 0 },
          entries: {},
          log: [],
          day: "",
          streak: 0
        }
      },
      notes: [
        { id: uid("n"), title: "LUMEN", text: "记得喝一口水，我在旁边待着就好。", ts: now - 1800000, read: false },
        { id: uid("n"), title: "日程提醒", text: "上午：给植物换水（还有 1 项未完成）", ts: now - 5400000, read: false }
      ],
      stats: { chats: 2, moodHistory: [52, 60, 74, 46, 58, 66, 62], openedAt: now }
    };
  }

  /* ---------- 外部设定兼容层：人设书与世界书的结构兼底 ---------- */
  function normalizeKeys(list) {
    if (list === null || list === undefined || list === "") return [];
    var arr = Array.isArray(list) ? list : String(list).split(",");
    var seen = {};
    var out = [];
    for (var i = 0; i < arr.length; i += 1) {
      var key = String(arr[i] === null || arr[i] === undefined ? "" : arr[i]).trim();
      if (!key) continue;
      var low = key.toLowerCase();
      if (seen[low]) continue;
      seen[low] = 1;
      out.push(key.slice(0, 40));
    }
    return out.slice(0, 24);
  }

  function normalizeEntry(raw, idx) {
    if (!raw || typeof raw !== "object") return null;
    var content = String(raw.content || raw.text || raw.entry || raw.value || "").trim();
    if (!content) return null;
    var order = raw.insertion_order;
    if (typeof order !== "number") order = raw.insertionOrder;
    if (typeof order !== "number") order = raw.order;
    return {
      id: String(raw.id || "e" + idx + "-" + Math.floor(Math.random() * 1e4).toString(36)),
      title: String(raw.title || raw.comment || raw.name || "").trim().slice(0, 40),
      keys: normalizeKeys(raw.keys || raw.key || raw.keyword || raw.primary_keys),
      secondary: normalizeKeys(raw.secondary_keys || raw.keysecondary || raw.secondary),
      content: content.slice(0, 4000),
      constant: !!(raw.constant || raw.alwaysOn || raw.always_on),
      selective: !!(raw.selective || raw.useSecondary),
      order: typeof order === "number" ? order : 100,
      enabled: !(raw.enabled === false || raw.disable === true)
    };
  }

  function entrySourceList(raw) {
    if (!raw || typeof raw !== "object") return [];
    if (Array.isArray(raw.entries)) return raw.entries;
    if (raw.entries && typeof raw.entries === "object") {
      return Object.keys(raw.entries).map(function (k) {
        var item = raw.entries[k];
        if (!item || typeof item !== "object") return null;
        if (!item.id) item.id = k;
        return item;
      });
    }
    if (Array.isArray(raw.entryList)) return raw.entryList;
    if (Array.isArray(raw.lorebook)) return raw.lorebook;
    return [];
  }

  function normalizeBook(raw) {
    if (!raw || typeof raw !== "object") return null;
    var list = [];
    var src = entrySourceList(raw);
    for (var i = 0; i < src.length; i += 1) {
      var entry = normalizeEntry(src[i], i);
      if (entry) list.push(entry);
    }
    if (!list.length) return null;
    return {
      id: String(raw.id || uid("wb")),
      name: String(raw.name || raw.title || "世界书").trim().slice(0, 30) || "世界书",
      source: String(raw.source || "").trim().slice(0, 40),
      entries: list,
      enabled: raw.enabled !== false,
      importedAt: typeof raw.importedAt === "number" ? raw.importedAt : Date.now()
    };
  }

  function normalizeCard(raw) {
    if (!raw || typeof raw !== "object") return null;
    var fields = [];
    if (Array.isArray(raw.fields)) {
      for (var i = 0; i < raw.fields.length; i += 1) {
        var f = raw.fields[i];
        if (!f || typeof f !== "object") continue;
        var label = String(f.k || "").trim().slice(0, 16);
        var value = String(f.v || "").trim().slice(0, 1600);
        if (!value) continue;
        fields.push({ k: label || "设定", v: value });
      }
    }
    var name = String(raw.name || "").trim().slice(0, 24);
    if (!name && !fields.length) return null;
    return {
      id: String(raw.id || uid("card")),
      name: name || "未命名人设",
      tagline: String(raw.tagline || "").trim().slice(0, 60),
      fields: fields.slice(0, 12),
      greeting: String(raw.greeting || "").trim().slice(0, 800),
      example: String(raw.example || "").trim().slice(0, 1600),
      extra: String(raw.extra || "").trim().slice(0, 800),
      source: String(raw.source || "").trim().slice(0, 40),
      enabled: raw.enabled !== false,
      importedAt: typeof raw.importedAt === "number" ? raw.importedAt : Date.now()
    };
  }

  /* 学习记录兼底：掌握度、巩固次数、学习日志与连续天数 */
  function normalizeLearn(raw) {
    var src = raw && typeof raw === "object" ? raw : {};
    var entries = {};
    var bag = src.entries && typeof src.entries === "object" ? src.entries : {};
    var ids = Object.keys(bag).slice(0, 800);
    for (var i = 0; i < ids.length; i += 1) {
      var r = bag[ids[i]];
      if (!r || typeof r !== "object") continue;
      entries[String(ids[i]).slice(0, 60)] = {
        m: Math.round(num(r.m, 0, 0, 100)),
        seen: Math.round(num(r.seen, 0, 0, 99999)),
        study: Math.round(num(r.study, 0, 0, 99999)),
        first: typeof r.first === "number" ? r.first : Date.now(),
        recall: typeof r.recall === "number" ? r.recall : 0,
        touch: typeof r.touch === "number" ? r.touch : 0
      };
    }
    var card = src.card && typeof src.card === "object" ? src.card : {};
    var log = Array.isArray(src.log)
      ? src.log
          .filter(function (item) {
            return item && typeof item === "object" && item.t;
          })
          .slice(0, 12)
          .map(function (item) {
            return {
              ts: typeof item.ts === "number" ? item.ts : Date.now(),
              t: String(item.t).slice(0, 40),
              k: String(item.k || "note").slice(0, 10)
            };
          })
      : [];
    return {
      card: {
        m: Math.round(num(card.m, 0, 0, 100)),
        turns: Math.round(num(card.turns, 0, 0, 999999)),
        last: typeof card.last === "number" ? card.last : 0
      },
      entries: entries,
      log: log,
      day: typeof src.day === "string" ? src.day.slice(0, 12) : "",
      streak: Math.round(num(src.streak, 0, 0, 999))
    };
  }

  function normalizePersona(raw, base) {
    var src = raw && typeof raw === "object" ? raw : {};
    var books = [];
    if (Array.isArray(src.books)) {
      for (var i = 0; i < src.books.length; i += 1) {
        var book = normalizeBook(src.books[i]);
        if (book) books.push(book);
      }
    }
    var budget = Number(src.budget);
    if (!(budget >= 300 && budget <= 4000)) budget = base ? base.budget : 1200;
    return {
      card: normalizeCard(src.card),
      books: books.slice(0, 8),
      budget: Math.round(budget),
      learn: normalizeLearn(src.learn)
    };
  }

  /* ---------- 生活小组件数据兼底 ---------- */
  function num(v, fallback, min, max) {
    var n = Number(v);
    if (!isFinite(n)) return fallback;
    return clamp(n, min, max);
  }

  function normalizeLife(raw, base) {
    var src = raw && typeof raw === "object" ? raw : {};
    var out = Object.assign({}, base, src);
    out.city = String(src.city || base.city).slice(0, 8);
    out.weather = Object.assign({}, base.weather, src.weather || {});
    out.weather.temp = Math.round(num(out.weather.temp, base.weather.temp, -40, 46));
    out.weather.feel = Math.round(num(out.weather.feel, base.weather.feel, -40, 46));
    out.weather.hi = Math.round(num(out.weather.hi, base.weather.hi, -40, 48));
    out.weather.lo = Math.round(num(out.weather.lo, base.weather.lo, -40, 48));
    out.weather.aqi = Math.round(num(out.weather.aqi, base.weather.aqi, 0, 300));
    out.water = Math.round(num(out.water, base.water, 0, 20));
    out.waterGoal = Math.round(num(out.waterGoal, base.waterGoal, 2, 20));
    out.steps = Math.round(num(out.steps, base.steps, 0, 60000));
    out.stepsGoal = Math.round(num(out.stepsGoal, base.stepsGoal, 1000, 40000));
    out.sleep = Object.assign({}, base.sleep, src.sleep || {});
    out.sleep.hours = num(out.sleep.hours, base.sleep.hours, 0, 14);
    out.sleep.quality = Math.round(num(out.sleep.quality, base.sleep.quality, 0, 100));
    if (!Array.isArray(out.sleep.phases) || !out.sleep.phases.length) out.sleep.phases = base.sleep.phases;
    out.focus = Object.assign({}, base.focus, src.focus || {});
    out.focus.seconds = Math.round(num(out.focus.seconds, 0, 0, 3600));
    out.focus.sessions = Math.round(num(out.focus.sessions, base.focus.sessions, 0, 40));
    out.focus.goal = Math.round(num(out.focus.goal, base.focus.goal, 300, 3600));
    if (!Array.isArray(out.habits) || !out.habits.length) out.habits = base.habits;
    out.habits = out.habits
      .filter(function (h) { return h && typeof h === "object" && h.label; })
      .slice(0, 6)
      .map(function (h, i) {
        return {
          id: String(h.id || "h-" + i),
          label: String(h.label).slice(0, 12),
          done: !!h.done,
          streak: Math.round(num(h.streak, 0, 0, 999))
        };
      });
    out.budget = Object.assign({}, base.budget, src.budget || {});
    out.budget.spent = Math.round(num(out.budget.spent, base.budget.spent, 0, 999999));
    out.budget.total = Math.round(num(out.budget.total, base.budget.total, 100, 999999));
    if (!Array.isArray(out.budget.items) || !out.budget.items.length) out.budget.items = base.budget.items;
    return out;
  }

  /* ---------- 钱包兼容层 ----------
     旧存档没有 wallet 字段时回到默认 1000；余额只认非负整数，不设任何上限。 */
  function normalizeWallet(raw, base) {
    var src = raw && typeof raw === "object" ? raw : {};
    var fallback = base && typeof base === "object" ? base.balance : 1000;
    var n = Number(src.balance);
    if (!isFinite(n)) n = Number(fallback);
    if (!isFinite(n)) n = 1000;
    n = Math.round(n);
    if (n < 0) n = 0;
    return { balance: n };
  }

  /* ---------- 自定义表情包兼容层 ----------
     store.customStickers 就是一个 Base64 字符串数组，按写入顺序排。
     旧存档没这个字段时回到空数组（面板里只剩一个「+」号），
     非字符串、空串和明显不是图片的 data: 一律丢掉，最多留 60 张。 */
  var MAX_STICKERS = 60;

  function normalizeStickers(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    for (var i = 0; i < raw.length && out.length < MAX_STICKERS; i += 1) {
      var src = typeof raw[i] === "string" ? raw[i].trim() : "";
      if (!src || src.indexOf("data:image/") !== 0) continue;
      out.push(src);
    }
    return out;
  }

  /* ---------- 人格档案 / 事实 / 日子 / 存在感兼容层 ---------- */
  var STYLES = {
    brief: "简短直接，一句说完",
    gentle: "温柔缓慢，会先接住情绪",
    playful: "俏皮，偶尔开点小玩笑",
    cool: "冷静克制，不安捳不啾喙"
  };
  var STYLE_KEYS = ["brief", "gentle", "playful", "cool"];
  var ROUTINES = { early: "晨型，早起", normal: "常规作息", late: "夜型，睡得晚" };
  var ROUTINE_KEYS = ["early", "normal", "late"];
  var FACT_KINDS = ["name", "like", "job", "place", "habit", "other"];

  function normalizeTags(list, max, len) {
    if (list === null || list === undefined || list === "") return [];
    var arr = Array.isArray(list) ? list : String(list).split(/[,\u3001\n]/);
    var seen = {};
    var out = [];
    for (var i = 0; i < arr.length && out.length < max; i += 1) {
      var tag = String(arr[i] === null || arr[i] === undefined ? "" : arr[i]).trim().slice(0, len);
      if (!tag || seen[tag]) continue;
      seen[tag] = 1;
      out.push(tag);
    }
    return out;
  }

  /* 只保留月日：支持 03-14 / 03.14 / 2024-03-14 */
  function normalizeMonthDay(raw) {
    var text = String(raw === null || raw === undefined ? "" : raw).trim().replace(/[./\u5e74\u6708]/g, "-").replace(/\u65e5/g, "");
    var parts = text.split("-").filter(function (p) { return p !== ""; });
    if (parts.length >= 3) parts = parts.slice(parts.length - 2);
    if (parts.length < 2) return "";
    var m = parseInt(parts[0], 10);
    var d = parseInt(parts[1], 10);
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return "";
    return pad(m) + "-" + pad(d);
  }

  function normalizeProfile(raw, base) {
    var src = raw && typeof raw === "object" ? raw : {};
    var pick = function (key, max) {
      var v = src[key];
      if (v === null || v === undefined) return base[key];
      return String(v).trim().slice(0, max);
    };
    return {
      nick: pick("nick", 12),
      callMe: pick("callMe", 12),
      birthday: normalizeMonthDay(src.birthday === undefined ? base.birthday : src.birthday),
      bio: pick("bio", 120),
      traits: normalizeTags(src.traits === undefined ? base.traits : src.traits, 6, 8),
      likes: normalizeTags(src.likes === undefined ? base.likes : src.likes, 8, 12),
      catchphrase: pick("catchphrase", 40),
      style: STYLE_KEYS.indexOf(src.style) >= 0 ? src.style : base.style,
      routine: ROUTINE_KEYS.indexOf(src.routine) >= 0 ? src.routine : base.routine,
      autonomous: src.autonomous !== false,
      showActivity: src.showActivity !== false
    };
  }

  function normalizeFacts(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    var seen = {};
    for (var i = 0; i < raw.length && out.length < 40; i += 1) {
      var item = raw[i];
      if (!item || typeof item !== "object") continue;
      var text = String(item.text || "").trim().slice(0, 60);
      if (!text || seen[text]) continue;
      seen[text] = 1;
      out.push({
        id: String(item.id || uid("f")),
        text: text,
        kind: FACT_KINDS.indexOf(item.kind) >= 0 ? item.kind : "other",
        ts: typeof item.ts === "number" ? item.ts : Date.now(),
        source: item.source === "manual" ? "manual" : "auto"
      });
    }
    return out;
  }

  function normalizeDays(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    for (var i = 0; i < raw.length && out.length < 12; i += 1) {
      var item = raw[i];
      if (!item || typeof item !== "object") continue;
      var title = String(item.title || "").trim().slice(0, 12);
      var date = normalizeMonthDay(item.date);
      if (!title || !date) continue;
      out.push({
        id: String(item.id || uid("d")),
        title: title,
        date: date,
        note: String(item.note || "").trim().slice(0, 30),
        ts: typeof item.ts === "number" ? item.ts : Date.now()
      });
    }
    return out;
  }

  /* 日记本兼容层：只认 YYYY-MM-DD 日期与正文，同一天只留一条，最多留 60 篇 */
  function normalizeDiaries(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    var seen = {};
    for (var i = 0; i < raw.length && out.length < 60; i += 1) {
      var item = raw[i];
      if (!item || typeof item !== "object") continue;
      var date = String(item.date || "").trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      var content = String(item.content || "").replace(/\r/g, "").trim().slice(0, 2000);
      if (!content || seen[date]) continue;
      seen[date] = 1;
      out.push({ date: date, content: content });
    }
    out.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    return out;
  }

  function normalizePresence(raw, base) {
    var src = raw && typeof raw === "object" ? raw : {};
    return {
      activity: String(src.activity || base.activity).slice(0, 12),
      activityAt: typeof src.activityAt === "number" ? src.activityAt : Date.now(),
      driftAt: typeof src.driftAt === "number" ? src.driftAt : Date.now(),
      lastSeen: typeof src.lastSeen === "number" ? src.lastSeen : Date.now(),
      lastDay: typeof src.lastDay === "string" ? src.lastDay.slice(0, 12) : "",
      streak: Math.round(num(src.streak, base.streak, 0, 3650)),
      talkedToday: !!src.talkedToday
    };
  }

  /* TA 的朋友圈兼容层：作者只有 TA 和你，文本、标签与点赞数都限长 */
  /* 朋友圈预设动态：音乐分享 + 风景记录。
     老存档不会重跑 seed，这里只补一次（settings.momentSeed 作记号），
     你自己删掉之后不会又被加回来。 */
  var MOMENT_PRESETS = [
    { id: "mo_preset_scene", kind: "scene", text: "路边的桂花开了，很香，下次带你一起走这条路。", tag: "路过", likes: 4, ago: 26 * 3600000 }
  ];

  function ensureMomentPresets() {
    if (!store.settings || store.settings.momentSeed === 2) return;
    var list = moments();
    for (var i = 0; i < MOMENT_PRESETS.length; i += 1) {
      var preset = MOMENT_PRESETS[i];
      var seen = false;
      for (var j = 0; j < list.length; j += 1) {
        if (list[j] && list[j].id === preset.id) seen = true;
      }
      if (seen) continue;
      list.unshift({
        id: preset.id,
        author: "ai",
        kind: preset.kind,
        text: preset.text,
        tag: preset.tag,
        ts: Date.now() - preset.ago,
        likes: preset.likes,
        liked: false
      });
    }
    store.settings.momentSeed = 2;
    save();
  }

  function normalizeMoments(raw, base) {
    if (!Array.isArray(raw)) return Array.isArray(base) ? base.slice(0) : [];
    var out = [];
    for (var i = 0; i < raw.length && out.length < 60; i += 1) {
      var item = raw[i];
      if (!item || typeof item !== "object") continue;
      var text = String(item.text || "").replace(/\s+/g, " ").trim().slice(0, 200);
      if (!text) continue;
      out.push({
        id: String(item.id || uid("mo")),
        author: item.author === "me" ? "me" : "ai",
        text: text,
        /* 动态类型：scene 要活过存档，刷新后风景图才不会消失（音乐分享已下线） */
        kind: item.kind === "scene" ? item.kind : "",
        tag: String(item.tag || "").trim().slice(0, 8),
        ts: typeof item.ts === "number" ? item.ts : Date.now(),
        likes: Math.round(num(item.likes, 0, 0, 9999)),
        liked: !!item.liked
      });
    }
    return out;
  }

  /* ---------- 持久化 ---------- */
  var store = seed();

  function load() {
    try {
      var raw = global.localStorage.getItem(KEY);
      if (!raw) return store;
      var data = JSON.parse(raw);
      if (!data || typeof data !== "object") return store;
      var base = seed();
      store = Object.assign(base, data);
      store.settings = Object.assign(base.settings, data.settings || {});
      /* 皮肤与玻璃外观只认合法 id，脏值回到默认，合法值原样保留并继续持久化 */
      if (typeof store.settings.skin !== "string" || !/^(mist|dusk|moss|clay|plum|amber|ink|rose)$/.test(store.settings.skin)) {
        store.settings.skin = base.settings.skin;
      }
      if (typeof store.settings.glass !== "string" || !/^(none|pink|green|blue|purple|light|dark)$/.test(store.settings.glass)) {
        store.settings.glass = base.settings.glass;
      }
      /* 图标顺序与小组件开关：旧存档缺字段时回到默认值 */
      if (!Array.isArray(store.settings.appOrder) || !store.settings.appOrder.length) {
        store.settings.appOrder = base.settings.appOrder.slice();
      }
      /* 自由固定坐标：旧存档没有这个字段时补一个空对象，避免读写时判空 */
      if (!store.settings.appFree || typeof store.settings.appFree !== "object") {
        store.settings.appFree = {};
      }
      store.settings.widgetOn = Object.assign({}, base.settings.widgetOn, (data.settings || {}).widgetOn || {});
      store.companion = Object.assign(base.companion, data.companion || {});
      store.diaries = normalizeDiaries(data.diaries);
      /* 音乐播放已下线：旧存档里的 music 字段直接丢弃 */
      delete store.music;
      store.stats = Object.assign(base.stats, data.stats || {});
      store.wallet = normalizeWallet(data.wallet, base.wallet);
      /* 表情包：旧存档缺字段时回到空数组，脏数据在归一化里清掉 */
      store.customStickers = normalizeStickers(data.customStickers);
      store.life = normalizeLife(data.life, base.life);
      if (!Array.isArray(store.chat) || !store.chat.length) store.chat = base.chat;
      if (!Array.isArray(store.memories) || !store.memories.length) store.memories = base.memories;
      if (!Array.isArray(store.notes)) store.notes = base.notes;
      if (!Array.isArray(store.tasks)) store.tasks = base.tasks;
      if (!Array.isArray(store.journal)) store.journal = base.journal;
      store.moments = normalizeMoments(data.moments, base.moments);
      ensureMomentPresets();
      store.persona = normalizePersona(data.persona, base.persona);
      store.companion.profile = normalizeProfile(
        (data.companion && data.companion.profile) || null,
        base.companion.profile
      );
      store.facts = normalizeFacts(data.facts);
      store.days = normalizeDays(data.days);
      store.presence = normalizePresence(data.presence, base.presence);
      if (!Array.isArray(store.stats.moodHistory) || store.stats.moodHistory.length !== 7) {
        store.stats.moodHistory = base.stats.moodHistory;
      }
    } catch (err) {
      store = seed();
    }
    return store;
  }

  function save() {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(store));
      return true;
    } catch (err) {
      return false;
    }
  }

  function reset() {
    store = seed();
    save();
    return store;
  }

  /* ---------- 伴侣模型 ---------- */
  /* 亲密度与等级：每 100 点亲密度提升 1 级，最高 520 级（52000 点封顶）。
     封顶只限制等级，亲密度点数本身可以继续累加，心跳同步的 50 点里程碑也不受影响。 */
  var AFFINITY_PER_LEVEL = 100;
  var MAX_LEVEL = 520;
  var MAX_AFFINITY = AFFINITY_PER_LEVEL * MAX_LEVEL; /* 52000 */

  function levelOf(affinity) {
    var points = Math.max(0, Math.floor(Number(affinity) || 0));
    return clamp(Math.floor(points / AFFINITY_PER_LEVEL), 0, MAX_LEVEL);
  }

  /* 当前等级内的进度：530 点 → 等级 5，进度 30 / 100 */
  function levelProgress(affinity) {
    var points = Math.max(0, Math.floor(Number(affinity) || 0));
    var level = levelOf(points);
    var inLevel = level >= MAX_LEVEL ? AFFINITY_PER_LEVEL : points % AFFINITY_PER_LEVEL;
    return {
      points: points,
      level: level,
      inLevel: inLevel,
      need: AFFINITY_PER_LEVEL,
      percent: clamp((inLevel / AFFINITY_PER_LEVEL) * 100, 0, 100),
      maxLevel: MAX_LEVEL,
      maxAffinity: MAX_AFFINITY
    };
  }

  /* 首页文案：{当前点数} / {当前等级所需总点数} · Lv.{当前等级} / 520 */
  function affinityText(affinity) {
    var p = levelProgress(affinity);
    return p.points + " / " + p.maxAffinity + " · Lv." + p.level + " / " + p.maxLevel;
  }

  function addAffinity(n) {
    var before = store.companion.level;
    /* 亲密度不再封顶 100：只保证不为负，等级由 levelOf 单独封顶 */
    store.companion.affinity = Math.max(0, Math.round((Number(store.companion.affinity) || 0) + (Number(n) || 0)));
    store.companion.level = levelOf(store.companion.affinity);
    save();
    return { leveled: store.companion.level > before, level: store.companion.level };
  }

  function shiftMood(delta) {
    store.companion.moodValue = clamp(store.companion.moodValue + delta, 0, 100);
    store.companion.mood = moodKeyFromValue(store.companion.moodValue);
    save();
  }

  function moodKeyFromValue(v) {
    if (v >= 80) return "happy";
    if (v >= 55) return "calm";
    if (v >= 42) return "tired";
    return "low";
  }

  function setMood(key) {
    var mood = MOODS[key] || MOODS.calm;
    store.companion.mood = key;
    store.companion.moodValue = mood.value;
    save();
    return mood;
  }

  function mood() {
    return MOODS[store.companion.mood] || MOODS.calm;
  }

  /* ---------- 双语对照：拆「外语原文 + 分隔行 + 中文译文」 ----------
     提示词约定原文一行、单独一行三个减号、中文译文一行。模型写法不一定严格，
     分隔行与译文标签都多认几种写法；认不出就整段当原文，绝不把分隔符留在正文里。 */
  var TRANS_SEP =
    /^\s*(?:[-—―–]{2,}|[=_*]{3,}|[【\[]\s*(?:译|译文|翻译|中译)\s*[】\]]\s*[:：]?|(?:译文|中译|参考译文|翻译|译|translation|translate)\s*[:：])\s*$/i;
  var TRANS_LABEL =
    /^\s*(?:[【\[]\s*(?:译|译文|翻译|中译|参考译文)\s*[】\]]|(?:译文|中译|参考译文|翻译|译|translation|translate)\s*[:：])?\s*/i;
  var TRANS_INLINE =
    /^(.{2,}?)[\s。！？.!?~…—-]*(?:[【\[]\s*译\s*[】\]]|译文|中译|参考译文|翻译|译|translation)\s*[:：]\s*([\s\S]+)$/i;

  function bilingualPair(orig, zh) {
    var text = String(orig === null || orig === undefined ? "" : orig).trim().slice(0, 1200);
    var trans = String(zh === null || zh === undefined ? "" : zh).replace(TRANS_LABEL, "").trim().slice(0, 600);
    /* 模型把中文原句又「翻译」了一遍时不显示重复译文 */
    if (trans && trans.replace(/\s+/g, "") === text.replace(/\s+/g, "")) trans = "";
    return { text: text, trans: trans };
  }

  function splitBilingual(raw) {
    var body = String(raw === null || raw === undefined ? "" : raw).replace(/\r/g, "").trim();
    if (!body) return { text: "", trans: "" };

    var lines = body.split("\n");
    /* 从后往前找分隔行：原文里误写的分隔线不会把译文截断 */
    for (var i = lines.length - 1; i >= 0; i -= 1) {
      if (!TRANS_SEP.test(lines[i])) continue;
      var tail = lines.slice(i + 1).join("\n").trim();
      var head = lines.slice(0, i).join("\n").trim();
      if (!tail || !head) continue;
      return bilingualPair(head, tail);
    }

    /* 模型偷懒写成一行「原文 译：中文」时也能拆开 */
    var inline = body.match(TRANS_INLINE);
    if (inline) return bilingualPair(inline[1], inline[2]);

    return bilingualPair(body, "");
  }

  /* ---------- 自动记忆：剥掉模型附在回复里的隐藏记忆标记 ----------
     提示词约定模型在正文末尾附一段 [[MEM]] 每条一行 [[/MEM]]，
     前端把它剥掉、提取出来静默存进本机记忆，正文里一个字都不留。
     括号写法不一定严格，多认几种；只写了开标签就断掉时，
     从开标签一律剪到结尾，绝不让这段内部标记漏进气泡、聊天记录或下一次请求的历史。 */
  var MEM_BLOCK = /\[\s*MEM\s*\]([\s\S]*?)\[\s*\/\s*MEM\s*\]/gi;
  var MEM_OPEN = /\[\s*MEM\s*\]/i;
  var MEM_CLOSE = /\[\s*\/\s*MEM\s*\]/i;
  var MEM_BULLET = /^\s*(?:[-–—*·•]|\d{1,2}\s*[.、)])\s*/;

  /* 事实类别只按几个高频词粗分，认不出来就归到其它 */
  var MEM_KINDS = [
    ["like", ["喜欢", "爱好", "偏好", "不爱", "讨厌", "怕"]],
    ["habit", ["习惯", "每天", "平时", "总是", "一般"]],
    ["place", ["住在", "城市", "老家", "学校", "公司"]],
    ["job", ["工作", "项目", "上班", "考试", "在读"]],
    ["name", ["叫", "名字", "称呼"]]
  ];

  function memKind(text) {
    for (var i = 0; i < MEM_KINDS.length; i += 1) {
      var words = MEM_KINDS[i][1];
      for (var j = 0; j < words.length; j += 1) {
        if (text.indexOf(words[j]) !== -1) return MEM_KINDS[i][0];
      }
    }
    return "other";
  }

  /* 标记内一行一条，最多三条；太短的寒暄不值得记 */
  function memLines(body) {
    var out = [];
    var seen = {};
    var parts = String(body === null || body === undefined ? "" : body).split(/\r?\n|[;；]/);
    for (var i = 0; i < parts.length && out.length < 3; i += 1) {
      var line = parts[i]
        .replace(MEM_BULLET, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 60);
      if (!line || line.length < 4 || seen[line]) continue;
      seen[line] = 1;
      out.push({ text: line, kind: memKind(line) });
    }
    return out;
  }

  function extractMemories(raw) {
    var body = String(raw === null || raw === undefined ? "" : raw);
    var blocks = body.match(MEM_BLOCK) || [];
    var memories = [];
    for (var i = 0; i < blocks.length; i += 1) {
      memories = memories.concat(memLines(blocks[i].replace(MEM_OPEN, "").replace(MEM_CLOSE, "")));
    }
    var text = body.replace(MEM_BLOCK, " ");
    /* 只写了开标签就断掉：剩下的全当标记处理，一条也不留在正文里 */
    var loose = text.search(MEM_OPEN);
    if (loose !== -1) {
      memories = memories.concat(memLines(text.slice(loose).replace(MEM_OPEN, "")));
      text = text.slice(0, loose);
    }
    if (memories.length > 3) memories.length = 3;
    return { text: text.replace(/^\s+/, "").replace(/\s+$/, ""), memories: memories };
  }

  /* 消息角色白名单：只有这三种能进 store.chat。
     主动消息 / 环境感知 / 语音陪伴这些旁路调用以前可能漏传 role，
     渲染层就会拿到一个没有角色的消息，跳过气泡模板直接吐裸文本。
     这里统一收口：认不出的角色一律按伴侣（ai）处理，绝不留空。 */
  var MSG_ROLES = { me: "me", ai: "ai", sys: "sys" };

  function normalizeRole(role) {
    var key = String(role === null || role === undefined ? "" : role).trim().toLowerCase();
    if (key === "char" || key === "assistant" || key === "companion" || key === "bot") return "ai";
    if (key === "user" || key === "self") return "me";
    if (key === "system") return "sys";
    return MSG_ROLES[key] || "ai";
  }

  /* 消息类型：text 是正常气泡，notice 是系统提示。
     渲染层按 type 决定用哪种气泡模板，但无论哪种都必须走气泡容器。 */
  function normalizeType(type, role) {
    var key = String(type === null || type === undefined ? "" : type).trim().toLowerCase();
    if (key === "notice" || key === "sys") return "notice";
    /* 图片消息：渲染层按这个 type 直接画图，不套气泡 */
    if (key === "image") return "image";
    /* 红包消息：认不出这个 type 就会被改写成 text，渲染层于是退回普通文字气泡 */
    if (key === "redpacket" || key === "red_packet" || key === "red-packet" || key === "hongbao") return "redpacket";
    if (key === "text") return "text";
    return role === "sys" ? "notice" : "text";
  }

  function pushMsg(role, text, trans, emotion) {
    var body = String(text === null || text === undefined ? "" : text);
    var safeRole = normalizeRole(role);
    var msg = {
      id: uid("m"),
      role: safeRole,
      type: normalizeType("", safeRole),
      text: body,
      ts: Date.now()
    };
    /* 隐藏情绪标签已在接口层剥掉，这里只把摘出来的情绪词（happy / sad / love / normal）
       挂到消息上，渲染时变成气泡的 data-emotion。 */
    if (safeRole === "ai" && emotion) {
      msg.emotion = String(emotion).toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 16);
    }
    /* 伴侣的话才拆双语：原文进 text，中文译文进 trans，
       发给模型的历史与存进记忆的都只用原文，不会把分隔行喂回去 */
    if (safeRole === "ai") {
      var pack = splitBilingual(body);
      var zh = pack.trans || String(trans === null || trans === undefined ? "" : trans).trim();
      msg.text = pack.text || body;
      if (zh) msg.trans = zh.slice(0, 600);
    }
    store.chat.push(msg);
    if (store.chat.length > 80) store.chat = store.chat.slice(-80);
    if (safeRole === "me") store.stats.chats += 1;
    save();
    return msg;
  }

  /* 图片消息专用入库：数据结构就是 { type: 'image', content: 图片URL }。
     text 同步存一份 URL，只读 text 的历史搜索与接口上下文才不会拿到空值。 */
  function pushImageMsg(role, url) {
    var src = String(url === null || url === undefined ? "" : url).trim();
    var safeRole = normalizeRole(role);
    var msg = {
      id: uid("m"),
      role: safeRole,
      type: "image",
      content: src,
      text: src,
      ts: Date.now()
    };
    store.chat.push(msg);
    if (store.chat.length > 80) store.chat = store.chat.slice(-80);
    if (safeRole === "me") store.stats.chats += 1;
    save();
    return msg;
  }

  /* ---------- 钱包与红包 ---------- */
  /* 钱包：余额只保留非负下限，不设任何上限（无 Math.min / clamp 钳制，可无限累加）。 */
  function wallet() {
    if (!store.wallet || typeof store.wallet !== "object") store.wallet = { balance: 1000 };
    /* 余额只保留非负下限，不做上限钳制：有钱就无限累加 */
    var n = Number(store.wallet.balance);
    if (!isFinite(n)) n = 1000;
    if (n < 0) n = 0;
    store.wallet.balance = n;
    return store.wallet;
  }

  /* 钱包金额的统一显示格式：统一 toFixed(2)，金额再大也是两位小数，不会挤坏排版 */
  function money(value) {
    var n = Number(value);
    if (!isFinite(n)) n = 0;
    return n.toFixed(2);
  }

  /* 发一个红包：先扣钱包余额，再往聊天记录里插一条特殊消息。
     数据结构就是需求里那一条：
     { type: 'redpacket', amount: 66, status: 'claimed', sender: 'user' }。
     你发给 TA 的红包默认由 TA 直接领走，所以 status 固定是 claimed；
     text 同步存一份可读文案，只读 text 的历史搜索与接口上下文才不会拿到空值。 */
  function sendRedPacket(amount) {
    var value = Number(amount);
    if (!isFinite(value)) value = 0;
    value = Math.round(value);
    var purse = wallet();
    if (!(value > 0)) return { ok: false, reason: "金额不对" };
    /* 单次红包金额不设上限；只在余额真不够时拦住，扣款后余额不会为负 */
    if (value > purse.balance) return { ok: false, reason: "钱包余额不够" };
    purse.balance = purse.balance - value;
    var msg = {
      id: uid("m"),
      role: "me",
      type: "redpacket",
      amount: value,
      status: "claimed",
      sender: "user",
      text: "给你发了一个红包 · " + money(value) + " 金币",
      ts: Date.now()
    };
    store.chat.push(msg);
    if (store.chat.length > 80) store.chat = store.chat.slice(-80);
    store.stats.chats += 1;
    save();
    return { ok: true, msg: msg, balance: purse.balance };
  }

  /* TA 主动发来的红包：只入库，不动钱包（TA 的钱不走本机钱包）。
     数据结构：{ type: 'redpacket', amount: 52, status: 'unclaimed', sender: 'char' }。
     status 只认 claimed / unclaimed，渲染层认不出 claimed 一律按未领处理；
     金额保留小数（52.0 就是 52.00），不做上限钳制。 */
  function pushRedPacketMsg(amount, sender) {
    var value = Number(amount);
    if (!isFinite(value) || value <= 0) value = 0;
    var msg = {
      id: uid("m"),
      role: "ai",
      type: "redpacket",
      amount: value,
      status: "unclaimed",
      sender: sender === "user" ? "user" : "char",
      text: "给你发了一个红包 · " + money(value) + " 金币",
      ts: Date.now()
    };
    store.chat.push(msg);
    if (store.chat.length > 80) store.chat = store.chat.slice(-80);
    save();
    return msg;
  }

  /* 拆一个红包：按 id 找到那条 redpacket 消息，金额进钱包、状态改 claimed。
     只处理还没领的（status 不是 claimed，unclaimed / pending / 旧存档都算未领），
     重复点击不会重复加钱；脏金额一律归 0，不会把 NaN 加进余额。 */
  function claimRedPacket(id) {
    var list = Array.isArray(store.chat) ? store.chat : [];
    var msg = null;
    for (var i = 0; i < list.length; i += 1) {
      if (list[i] && list[i].id === id && list[i].type === "redpacket") {
        msg = list[i];
        break;
      }
    }
    if (!msg) return { ok: false, reason: "找不到这个红包" };
    if (msg.status === "claimed") return { ok: false, claimed: true, reason: "红包已经领过了" };
    var value = Number(msg.amount);
    if (!isFinite(value) || value <= 0) value = 0;
    var purse = wallet();
    /* 到账金额与余额都不做上限钳制，只要有钱就无限累加 */
    purse.balance = purse.balance + value;
    msg.status = "claimed";
    save();
    return { ok: true, msg: msg, amount: value, balance: purse.balance };
  }

  function pushNote(title, text) {
    var note = { id: uid("n"), title: title, text: text, ts: Date.now(), read: false };
    store.notes.unshift(note);
    if (store.notes.length > 12) store.notes.length = 12;
    save();
    return note;
  }
  function addSticker(dataUrl) {
    var src = typeof dataUrl === "string" ? dataUrl.trim() : "";
    if (!src || src.indexOf("data:image/") !== 0) return { ok: false, reason: "图片数据不可用" };
    var list = stickers();
    if (list.length >= MAX_STICKERS) return { ok: false, reason: "表情包最多存 " + MAX_STICKERS + " 张" };
    if (list.indexOf(src) !== -1) return { ok: false, reason: "这张已经加过了" };
    list.push(src);
    if (!save()) {
      list.pop();
      return { ok: false, reason: "本机存储已满，导入失败" };
    }
    return { ok: true, list: list };
  }
  /* ---------- 自定义表情包 ----------
     表情包就是一个 Base64 字符串数组，跟主存档一起持久化；
     面板渲染、导入、删除全走下面三个函数，UI 层不直接改数组。 */
  function removeSticker(index) {
    var list = stickers();
    var at = Number(index);
    if (!isFinite(at) || at < 0 || at >= list.length) return { ok: false, reason: "找不到这个表情包" };
    list.splice(Math.floor(at), 1);
    if (!save()) return { ok: false, reason: "本机存储写入失败" };
    return { ok: true, list: list };
  }
  function stickers() {
    if (!Array.isArray(store.customStickers)) store.customStickers = [];
    return store.customStickers;
  }

  function unreadNotes() {
    return store.notes.filter(function (n) {
      return !n.read;
    });
  }

  function addTask(title, meta) {
    var task = { id: uid("t"), title: title, meta: meta || "手动添加", done: false, ts: Date.now() };
    store.tasks.unshift(task);
    save();
    return task;
  }

  function addJournal(moodKey, text) {
    var item = { id: uid("j"), mood: moodKey, text: text, ts: Date.now() };
    store.journal.unshift(item);
    if (store.journal.length > 30) store.journal.length = 30;
    store.stats.moodHistory.push(store.companion.moodValue);
    if (store.stats.moodHistory.length > 7) store.stats.moodHistory.shift();
    save();
    return item;
  }

  /* ---------- TA 的朋友圈 ---------- */
  function moments() {
    if (!Array.isArray(store.moments)) store.moments = [];
    return store.moments;
  }

  function addMoment(text, author) {
    var clean = String(text === null || text === undefined ? "" : text).replace(/\s+/g, " ").trim().slice(0, 200);
    if (!clean) return null;
    var mine = author === "me";
    var post = {
      id: uid("mo"),
      author: mine ? "me" : "ai",
      text: clean,
      tag: mine ? "你留的话" : "此刻",
      ts: Date.now(),
      likes: 0,
      liked: false
    };
    moments().unshift(post);
    if (store.moments.length > 60) store.moments.length = 60;
    save();
    return post;
  }

  function toggleMoment(id) {
    var list = moments();
    var hit = null;
    for (var i = 0; i < list.length; i += 1) {
      if (list[i] && list[i].id === id) {
        hit = list[i];
        break;
      }
    }
    if (!hit) return null;
    hit.liked = !hit.liked;
    hit.likes = Math.max(0, (Number(hit.likes) || 0) + (hit.liked ? 1 : -1));
    save();
    return hit;
  }

  function removeMoment(id) {
    var before = moments().length;
    store.moments = store.moments.filter(function (item) {
      return item && item.id !== id;
    });
    save();
    return before - store.moments.length;
  }

  function addMemory(title, text) {
    var mem = {
      id: uid("mm"),
      title: title,
      date: fmt.shortDate(Date.now()),
      text: text,
      tags: ["手动记录"],
      x: 20 + Math.round(Math.random() * 55),
      y: 22 + Math.round(Math.random() * 50),
      size: 50 + Math.round(Math.random() * 30)
    };
    store.memories.unshift(mem);
    save();
    return mem;
  }

  /* ---------- 记得的事 / 重要日子 / 人格档案写入 ---------- */
  var FACT_KIND_LABELS = {
    name: "称呼",
    like: "喜好",
    job: "在做",
    place: "地方",
    habit: "习惯",
    other: "其它"
  };

  function addFact(text, kind, source) {
    var clean = String(text === null || text === undefined ? "" : text).trim().slice(0, 60);
    if (!clean) return null;
    var list = Array.isArray(store.facts) ? store.facts : (store.facts = []);
    var low = clean.toLowerCase();
    for (var i = 0; i < list.length; i += 1) {
      if (String(list[i].text || "").toLowerCase() === low) return list[i];
    }
    var fact = {
      id: uid("f"),
      text: clean,
      kind: FACT_KINDS.indexOf(kind) >= 0 ? kind : "other",
      ts: Date.now(),
      source: source === "manual" ? "manual" : "auto"
    };
    list.unshift(fact);
    if (list.length > 40) list.length = 40;
    save();
    return fact;
  }

  function removeFact(id) {
    if (!Array.isArray(store.facts)) return 0;
    var before = store.facts.length;
    store.facts = store.facts.filter(function (item) {
      return item && item.id !== id;
    });
    save();
    return before - store.facts.length;
  }

  function addDay(title, date, note) {
    var name = String(title === null || title === undefined ? "" : title).trim().slice(0, 12);
    var md = normalizeMonthDay(date);
    if (!name || !md) return null;
    var list = Array.isArray(store.days) ? store.days : (store.days = []);
    var dup = list.filter(function (item) {
      return item && item.title === name && item.date === md;
    })[0];
    if (dup) return dup;
    var day = {
      id: uid("d"),
      title: name,
      date: md,
      note: String(note === null || note === undefined ? "" : note).trim().slice(0, 30),
      ts: Date.now()
    };
    list.push(day);
    if (list.length > 12) list.length = 12;
    save();
    return day;
  }

  function removeDay(id) {
    if (!Array.isArray(store.days)) return 0;
    var before = store.days.length;
    store.days = store.days.filter(function (item) {
      return item && item.id !== id;
    });
    save();
    return before - store.days.length;
  }

  var PROFILE_BASE = {
    nick: "",
    callMe: "",
    birthday: "",
    bio: "",
    traits: [],
    likes: [],
    catchphrase: "",
    style: "gentle",
    routine: "normal",
    autonomous: true,
    showActivity: true
  };

  function updateProfile(patch) {
    var base =
      store.companion.profile && typeof store.companion.profile === "object"
        ? store.companion.profile
        : PROFILE_BASE;
    var next = Object.assign({}, base, patch && typeof patch === "object" ? patch : {});
    store.companion.profile = normalizeProfile(next, base);
    save();
    return store.companion.profile;
  }

  function profile() {
    if (!store.companion.profile || typeof store.companion.profile !== "object") {
      store.companion.profile = normalizeProfile(null, PROFILE_BASE);
    }
    return store.companion.profile;
  }

  global.COS = {
    KEY: KEY,
    MOODS: MOODS,
    store: store,
    load: load,
    save: save,
    reset: reset,
    fmt: fmt,
    uid: uid,
    el: el,
    els: els,
    create: create,
    clamp: clamp,
    esc: esc,
    mood: mood,
    setMood: setMood,
    shiftMood: shiftMood,
    addAffinity: addAffinity,
    levelOf: levelOf,
    levelProgress: levelProgress,
    affinityText: affinityText,
    AFFINITY_PER_LEVEL: AFFINITY_PER_LEVEL,
    MAX_LEVEL: MAX_LEVEL,
    MAX_AFFINITY: MAX_AFFINITY,
    pushMsg: pushMsg,
    normalizeRole: normalizeRole,
    normalizeType: normalizeType,
    pushImageMsg: pushImageMsg,
    wallet: wallet,
    money: money,
    sendRedPacket: sendRedPacket,
    pushRedPacketMsg: pushRedPacketMsg,
    claimRedPacket: claimRedPacket,
    stickers: stickers,
    addSticker: addSticker,
    removeSticker: removeSticker,
    splitBilingual: splitBilingual,
    extractMemories: extractMemories,
    pushNote: pushNote,
    unreadNotes: unreadNotes,
    addTask: addTask,
    addJournal: addJournal,
    moments: moments,
    addMoment: addMoment,
    toggleMoment: toggleMoment,
    removeMoment: removeMoment,
    addMemory: addMemory,
    profile: profile,
    updateProfile: updateProfile,
    addFact: addFact,
    removeFact: removeFact,
    addDay: addDay,
    removeDay: removeDay,
    STYLES: STYLES,
    STYLE_KEYS: STYLE_KEYS,
    ROUTINES: ROUTINES,
    ROUTINE_KEYS: ROUTINE_KEYS,
    FACT_KINDS: FACT_KINDS,
    FACT_KIND_LABELS: FACT_KIND_LABELS,
    normalize: {
      keys: normalizeKeys,
      entry: normalizeEntry,
      book: normalizeBook,
      card: normalizeCard,
      md: normalizeMonthDay
    }
  };

  COS.load();
  COS.store = store;
})(window);