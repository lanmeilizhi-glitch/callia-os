/* =====================================================================
   Callia OS · widgets.js
   第二屏 · Bento 生活小组件
   天气 / 饮水 / 步数 / 睡眠 / 专注 / 花销 / 今日习惯
   数据只读写 COS.store.life（本机 localStorage），不产生任何网络请求
   ===================================================================== */
(function (global) {
  "use strict";

  var S = global.COS;
  if (!S) return;

  var el = S.el;
  var esc = S.esc;
  var clamp = S.clamp;

  var focusTimer = null;
  var focusTicks = 0;
  var flashTimer = null;

  /* ---------- 固定假数据：小组件先用本地 mock 渲染，不接任何模型接口 ---------- */
  var mockCharData = {
    sleep: { hours: 7.5, quality: 88, sleepTime: "23:15", wakeTime: "06:45" },
    expense: { total: 850, budget: 2000, food: 300, transport: 150, misc: 400 },
    weather: { temp: 22, condition: "晴朗", air: "优", wind: "微风" },
    water: { current: 3, goal: 8 },
    steps: { current: 4500, goal: 8000 },
    focus: { time: "01:20", segments: 2 }
  };

  /* ---------- 角色今日生活数据：大模型生成 + 按天缓存 ----------
     缓存键：char_daily_data（JSON 字符串） / char_daily_date（生成日期）
     同一天只请求一次接口，省钱；解析失败或接口不可用时一律回退 mockCharData。 */
  var DAILY_DATA_KEY = "char_daily_data";
  var DAILY_DATE_KEY = "char_daily_date";
  var dailyData = null;
  var dailyPending = false;

  /* 需求指定的固定 Prompt，一字不改 */
  var DAILY_PROMPT =
    "请完全沉浸在你当前的角色设定中，生成你今天一天的生活数据。请严格返回纯 JSON 格式，绝对不要包含任何 Markdown 标记（如 ```json）和多余解释。格式如下：{\"sleep\":{\"hours\":7,\"quality\":80,\"sleepTime\":\"23:00\",\"wakeTime\":\"06:00\"},\"expense\":{\"total\":850,\"budget\":2000,\"food\":300,\"transport\":150,\"misc\":400},\"weather\":{\"temp\":22,\"condition\":\"晴朗\",\"air\":\"优\",\"wind\":\"微风\"},\"water\":{\"current\":3,\"goal\":8},\"steps\":{\"current\":4500,\"goal\":8000},\"focus\":{\"time\":\"01:20\",\"segments\":2}}";

  function readStore(key) {
    try {
      return global.localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function writeStore(key, value) {
    try {
      global.localStorage.setItem(key, value);
      return true;
    } catch (err) {
      return false;
    }
  }

  function num(value, fallback) {
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function str(value, fallback) {
    var s = value === null || value === undefined ? "" : String(value).trim();
    return s || fallback;
  }

  /* 模型偶尔仍会带 ```json 围栏或前后解释，这里先剥壳再交给 JSON.parse */
  function stripFence(text) {
    var body = String(text === null || text === undefined ? "" : text).trim();
    body = body.replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "").trim();
    var start = body.indexOf("{");
    var end = body.lastIndexOf("}");
    if (start !== -1 && end > start) body = body.slice(start, end + 1);
    return body;
  }

  /* 把模型返回的 JSON 归一化成 mockCharData 同结构，缺字段用兜底值补齐 */
  function normalizeDaily(raw) {
    var m = mockCharData;
    var d = raw && typeof raw === "object" ? raw : {};
    var sleep = d.sleep && typeof d.sleep === "object" ? d.sleep : {};
    var expense = d.expense && typeof d.expense === "object" ? d.expense : {};
    var weather = d.weather && typeof d.weather === "object" ? d.weather : {};
    var water = d.water && typeof d.water === "object" ? d.water : {};
    var steps = d.steps && typeof d.steps === "object" ? d.steps : {};
    var focus = d.focus && typeof d.focus === "object" ? d.focus : {};

    return {
      sleep: {
        hours: clamp(num(sleep.hours, m.sleep.hours), 0, 24),
        quality: clamp(num(sleep.quality, m.sleep.quality), 0, 100),
        sleepTime: str(sleep.sleepTime, m.sleep.sleepTime),
        wakeTime: str(sleep.wakeTime, m.sleep.wakeTime)
      },
      expense: {
        total: Math.max(0, num(expense.total, m.expense.total)),
        budget: Math.max(1, num(expense.budget, m.expense.budget)),
        food: Math.max(0, num(expense.food, m.expense.food)),
        transport: Math.max(0, num(expense.transport, m.expense.transport)),
        misc: Math.max(0, num(expense.misc, m.expense.misc))
      },
      weather: {
        temp: num(weather.temp, m.weather.temp),
        condition: str(weather.condition, m.weather.condition),
        air: str(weather.air, m.weather.air),
        wind: str(weather.wind, m.weather.wind)
      },
      water: {
        current: Math.max(0, num(water.current, m.water.current)),
        goal: Math.max(1, num(water.goal, m.water.goal))
      },
      steps: {
        current: Math.max(0, num(steps.current, m.steps.current)),
        goal: Math.max(1, num(steps.goal, m.steps.goal))
      },
      focus: {
        time: str(focus.time, m.focus.time),
        segments: Math.max(0, num(focus.segments, m.focus.segments))
      }
    };
  }

  /* 当前生效的角色生活数据：内存 → 本地缓存（仅当天）→ mockCharData */
  function charDailyData() {
    if (dailyData) return dailyData;
    if (readStore(DAILY_DATE_KEY) === todayKey()) {
      var cached = readStore(DAILY_DATA_KEY);
      if (cached) {
        try {
          dailyData = normalizeDaily(JSON.parse(cached));
          return dailyData;
        } catch (err) {
          /* 缓存损坏就当没有，继续用 mock 兜底 */
        }
      }
    }
    return mockCharData;
  }

  /* 把角色生活数据映射成小组件渲染用的 life 结构（只读，不写回 store） */
  function mockLife(source) {
    var m = source || charDailyData();
    var focusSec = 0;
    var parts = String(m.focus.time || "0:00").split(":");
    focusSec = (Number(parts[0]) || 0) * 60 + (Number(parts[1]) || 0);
    return {
      city: "灰谷",
      weather: {
        temp: m.weather.temp,
        feel: m.weather.temp,
        text: m.weather.condition,
        hi: m.weather.temp + 3,
        lo: m.weather.temp - 6,
        aqi: m.weather.air === "优" ? 30 : 80,
        aqiLabel: "空气" + m.weather.air,
        wind: m.weather.wind
      },
      water: m.water.current,
      waterGoal: m.water.goal,
      steps: m.steps.current,
      stepsGoal: m.steps.goal,
      sleep: {
        hours: m.sleep.hours,
        bed: m.sleep.sleepTime,
        wake: m.sleep.wakeTime,
        quality: m.sleep.quality,
        phases: [
          { label: "深睡", value: 26 },
          { label: "浅睡", value: 46 },
          { label: "清醒", value: 10 }
        ]
      },
      focus: { sessions: m.focus.segments, seconds: focusSec, goal: 1500 },
      budget: {
        spent: m.expense.total,
        total: m.expense.budget,
        items: [
          { label: "饮食", value: m.expense.food },
          { label: "通勤", value: m.expense.transport },
          { label: "杂项", value: m.expense.misc }
        ]
      }
    };
  }

  /* 小组件渲染统一走这里：优先用当天生成的角色生活数据，没有就回退 mock */
  function view() {
    return mockLife(charDailyData());
  }

  /* ---------- 生成角色今日生活数据 ----------
     1. char_daily_date 已是今天 → 直接读缓存，不请求接口；
     2. 否则用固定 Prompt 请求大模型，JSON.parse 用 try-catch 包住；
     3. 解析失败 / 接口不可用 → 继续使用 mockCharData 兜底；
     4. 成功后写入 char_daily_data 与当天日期，并刷新主页组件。 */
  function generateCharDailyData(force) {
    var key = todayKey();
    /* force=true 时跳过「今天已生成」的缓存判断，直接重新请求大模型 */
    if (!force && readStore(DAILY_DATE_KEY) === key) {
      var cached = readStore(DAILY_DATA_KEY);
      if (cached) {
        try {
          dailyData = normalizeDaily(JSON.parse(cached));
          renderAll();
          return Promise.resolve({ ok: true, cached: true, data: dailyData });
        } catch (err) {
          /* 缓存坏了就往下走，重新生成 */
        }
      }
    }

    if (dailyPending) return Promise.resolve({ ok: false, code: "busy", data: charDailyData() });
    if (!S.api || typeof S.api.short !== "function" || !S.api.ready()) {
      return Promise.resolve({ ok: false, code: "unconfigured", data: charDailyData() });
    }

    dailyPending = true;
    return S.api
      .short(DAILY_PROMPT)
      .then(function (res) {
        dailyPending = false;
        if (!res || !res.ok || !res.text) {
          return { ok: false, code: (res && res.code) || "empty", data: charDailyData() };
        }

        var parsed = null;
        try {
          parsed = JSON.parse(stripFence(res.text));
        } catch (err) {
          /* 解析失败：保持 mockCharData 兜底，不写缓存，下次再试 */
          return { ok: false, code: "bad-json", data: charDailyData() };
        }

        dailyData = normalizeDaily(parsed);
        writeStore(DAILY_DATA_KEY, JSON.stringify(dailyData));
        writeStore(DAILY_DATE_KEY, key);
        renderAll();
        return { ok: true, cached: false, data: dailyData };
      })
      .catch(function () {
        dailyPending = false;
        return { ok: false, code: "network", data: charDailyData() };
      });
  }

  /* ---------- 强制刷新今日数据：清缓存 → 重新调用大模型 ----------
     主页小刷新按钮 / 长按日期胶囊都走这里。
     1. 清掉 char_daily_data / char_daily_date 与内存缓存，避免继续吃旧数据；
     2. 立刻按 mock 兜底重绘，界面不会停在空白；
     3. 再强制请求一次大模型，成功就写回缓存并重绘。 */
  function forceRefreshDaily() {
    if (dailyPending) {
      flash("正在生成今日数据 · 稍等一下");
      return Promise.resolve({ ok: false, code: "busy", data: charDailyData() });
    }

    try {
      global.localStorage.removeItem(DAILY_DATA_KEY);
      global.localStorage.removeItem(DAILY_DATE_KEY);
    } catch (err) {
      /* 本机存储不可用时只清内存缓存 */
    }
    dailyData = null;
    renderAll();

    if (!S.api || typeof S.api.short !== "function" || !S.api.ready()) {
      flash("接口未连接 · 已清空今日缓存");
      return Promise.resolve({ ok: false, code: "unconfigured", data: charDailyData() });
    }

    flash("正在重新生成今日数据…");
    buzz(9);
    return generateCharDailyData(true).then(function (res) {
      if (res && res.ok) flash("今日数据已重新生成");
      else if (res && res.code === "bad-json") flash("模型返回格式不对 · 已用兜底数据");
      else if (res && res.code === "network") flash("网络没通 · 已用兜底数据");
      else if (res && res.code === "timeout") flash("接口超时 · 已用兜底数据");
      else if (res && res.code === "busy") flash("正在生成今日数据 · 稍等一下");
      else flash("生成失败 · 已用兜底数据");
      return res;
    });
  }

  /* ---------- 主页刷新入口：小刷新按钮 + 长按日期胶囊 ----------
     两者都调 forceRefreshDaily()，按钮在请求期间转圈并禁止重复点。 */
  function bindRefreshEntry() {
    var btn = el("#home-refresh");
    if (btn && !btn.getAttribute("data-bound")) {
      btn.setAttribute("data-bound", "1");
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        runRefresh(btn);
      });
    }

    /* 长按日期胶囊也能刷新：480ms 内不移动才算长按，避免和左右滑屏冲突 */
    var pill = el(".hero__pill");
    if (!pill || pill.getAttribute("data-bound")) return;
    pill.setAttribute("data-bound", "1");
    var timer = null;
    var startX = 0;
    var startY = 0;

    function clear() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    }

    pill.addEventListener("pointerdown", function (ev) {
      clear();
      startX = ev.clientX;
      startY = ev.clientY;
      timer = setTimeout(function () {
        timer = null;
        runRefresh(btn);
      }, 480);
    });
    pill.addEventListener("pointermove", function (ev) {
      if (timer === null) return;
      if (Math.abs(ev.clientX - startX) > 10 || Math.abs(ev.clientY - startY) > 10) clear();
    });
    pill.addEventListener("pointerup", clear);
    pill.addEventListener("pointercancel", clear);
    pill.addEventListener("pointerleave", clear);
  }

  function runRefresh(btn) {
    if (btn) btn.classList.add("is-busy");
    var done = function () {
      if (btn) btn.classList.remove("is-busy");
    };
    var task = forceRefreshDaily();
    if (task && typeof task.then === "function") task.then(done, done);
    else done();
  }

  /* ---------- 小组件内联反馈（复用桌面 #toast） ---------- */
  function flash(text) {
    var node = el("#toast");
    if (!node || !text) return;
    node.textContent = text;
    node.classList.add("is-on");
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(function () {
      node.classList.remove("is-on");
    }, 2000);
  }

  function buzz(ms) {
    try {
      if (S.store.settings && S.store.settings.haptic && navigator.vibrate) {
        navigator.vibrate(ms || 9);
      }
    } catch (err) {
      /* 设备不支持振动时静默降级 */
    }
  }

  function life() {
    return S.store && S.store.life ? S.store.life : null;
  }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }

  function group(n) {
    var s = String(Math.round(n));
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  /* ---------- 跨天滚动：新的一天从干净状态开始 ---------- */
  function rollDay() {
    var L = life();
    if (!L) return;
    var key = todayKey();
    if (!L.day) {
      L.day = key;
      S.save();
      return;
    }
    if (L.day === key) return;

    haltFocus();
    L.day = key;
    L.water = 0;
    L.steps = 0;
    if (L.focus) {
      L.focus.seconds = 0;
      L.focus.sessions = 0;
    }
    L.habits = (L.habits || []).map(function (h) {
      return { id: h.id, label: h.label, done: false, streak: h.done ? h.streak : 0 };
    });
    S.save();
  }

  /* ---------- 天气 ---------- */
  function aqiLabel(v) {
    if (v <= 50) return "空气优";
    if (v <= 100) return "空气良";
    if (v <= 150) return "轻度污染";
    return "中度污染";
  }

  function renderWeather() {
    var L = view();
    if (!L || !L.weather) return;
    var w = L.weather;
    w.aqiLabel = aqiLabel(Number(w.aqi) || 0);

    if (el("#life-city")) el("#life-city").textContent = L.city || "灰谷";
    if (el("#ui-weather-temp")) el("#ui-weather-temp").textContent = w.temp;
    if (el("#wx-temp")) el("#wx-temp").textContent = w.temp;
    if (el("#ui-weather-condition")) el("#ui-weather-condition").textContent = w.text || "多云";
    if (el("#wx-text")) el("#wx-text").textContent = w.text || "多云";
    if (el("#wx-hilo")) el("#wx-hilo").textContent = w.lo + "° — " + w.hi + "°";
    if (el("#wx-feel")) el("#wx-feel").textContent = "体感 " + w.feel + "°";
    if (el("#ui-weather-wind")) el("#ui-weather-wind").textContent = "风 " + w.wind;
    if (el("#wx-wind")) el("#wx-wind").textContent = "风 " + w.wind;
    if (el("#ui-weather-air")) el("#ui-weather-air").textContent = w.aqiLabel;
    if (el("#wx-aqi")) el("#wx-aqi").textContent = w.aqiLabel;

    var curve = el("#wx-curve");
    if (!curve) return;
    var span = Math.max(1, w.hi - w.lo);
    var shape = [0.3, 0.58, 1, 0.76, 0.46, 0.26];
    var hours = [8, 11, 14, 17, 20, 23];
    var html = "";
    for (var i = 0; i < shape.length; i += 1) {
      var t = Math.round(w.lo + span * shape[i]);
      var h = Math.round(20 + shape[i] * 72);
      html +=
        '<span class="wx__pt"><i style="--h:' + h + '%"></i><b>' + t + "°</b></span>";
    }
    curve.innerHTML = html;
    curve.setAttribute("aria-label", "今日 " + hours[0] + " 时至 " + hours[hours.length - 1] + " 时温度走势");
  }

  /* ---------- 饮水 ---------- */
  function renderWater() {
    var L = view();
    if (!L) return;
    var goal = L.waterGoal || 8;
    if (el("#ui-water-current")) el("#ui-water-current").textContent = L.water;
    if (el("#water-count")) el("#water-count").textContent = L.water;
    if (el("#ui-water-goal")) el("#ui-water-goal").textContent = "/ " + goal;
    if (el("#water-goal")) el("#water-goal").textContent = "/ " + goal;
    if (el("#water-bar")) el("#water-bar").style.width = clamp((L.water / goal) * 100, 0, 100) + "%";
  }

  function addWater() {
    var L = life();
    if (!L) return;
    var goal = L.waterGoal || 8;
    if (L.water >= goal * 2) {
      flash("今天已经喝得够多了");
      return;
    }
    L.water += 1;
    S.save();
    buzz(9);
    renderWater();
    flash(L.water >= goal ? "今日饮水达标 · " + L.water + " 杯" : "记下一杯水 · " + L.water + " / " + goal);
  }

  /* ---------- 步数 ---------- */
  function renderSteps() {
    var L = view();
    if (!L) return;
    var pct = L.stepsGoal ? (L.steps / L.stepsGoal) * 100 : 0;
    var text = L.steps >= 10000 ? (L.steps / 1000).toFixed(1) + "k" : L.steps;
    if (el("#ui-steps-current")) el("#ui-steps-current").textContent = text;
    if (el("#steps-value")) el("#steps-value").textContent = text;
    if (el("#ui-steps-goal")) el("#ui-steps-goal").textContent = "/ " + group(L.stepsGoal);
    if (el("#steps-ring")) el("#steps-ring").style.setProperty("--p", clamp(pct, 0, 100).toFixed(1));
  }

  function addSteps() {
    var L = life();
    if (!L) return;
    var before = L.steps;
    L.steps = clamp(L.steps + 600, 0, 60000);
    S.save();
    buzz(9);
    renderSteps();
    if (before < L.stepsGoal && L.steps >= L.stepsGoal) {
      S.shiftMood(2);
      flash("步数目标达成 · " + group(L.steps) + " 步");
    } else {
      flash("散步 +600 步 · " + group(L.steps) + " 步");
    }
  }

  /* ---------- 睡眠 ---------- */
  function renderSleep() {
    var L = view();
    if (!L || !L.sleep) return;
    var s = L.sleep;
    if (el("#ui-sleep-quality")) el("#ui-sleep-quality").textContent = "质量 " + s.quality;
    if (el("#sleep-quality")) el("#sleep-quality").textContent = "质量 " + s.quality;
    if (el("#ui-sleep-hours")) el("#ui-sleep-hours").textContent = (Number(s.hours) || 0).toFixed(1);
    if (el("#sleep-hours")) el("#sleep-hours").textContent = (Number(s.hours) || 0).toFixed(1);
    if (el("#ui-sleep-time")) el("#ui-sleep-time").textContent = s.bed + " 入睡 · " + s.wake + " 醒来";
    if (el("#sleep-time")) el("#sleep-time").textContent = s.bed + " 入睡 · " + s.wake + " 醒来";

    var bar = el("#sleep-phases");
    if (bar) {
      bar.innerHTML = (s.phases || [])
        .map(function (p) {
          return '<i class="sleep__seg" style="flex:' + Math.max(1, Number(p.value) || 1) + ' 1 0"></i>';
        })
        .join("");
    }
  }

  /* ---------- 专注 ---------- */
  function paintFocus() {
    var L = view();
    if (!L || !L.focus) return;
    var f = L.focus;
    if (el("#ui-focus-time")) el("#ui-focus-time").textContent = S.fmt.mmss(f.seconds);
    if (el("#focus-time")) el("#focus-time").textContent = S.fmt.mmss(f.seconds);
    if (el("#focus-bar")) el("#focus-bar").style.width = clamp((f.seconds / (f.goal || 1500)) * 100, 0, 100) + "%";
  }

  function renderFocus() {
    var L = view();
    if (!L || !L.focus) return;
    var f = L.focus;
    if (el("#ui-focus-segments")) el("#ui-focus-segments").textContent = f.sessions;
    if (el("#focus-sessions")) el("#focus-sessions").textContent = f.sessions;
    paintFocus();

    var btn = el("#focus-toggle");
    if (btn) {
      btn.textContent = focusTimer ? "暂停" : f.seconds > 0 ? "继续" : "开始";
    }
    var tile = document.querySelector(".tile--focus");
    if (tile) tile.classList.toggle("is-running", !!focusTimer);
  }

  function haltFocus() {
    if (!focusTimer) return false;
    clearInterval(focusTimer);
    focusTimer = null;
    focusTicks = 0;
    return true;
  }

  function startFocus() {
    if (focusTimer) return;
    focusTimer = setInterval(function () {
      var L = life();
      if (!L || !L.focus) {
        haltFocus();
        return;
      }
      var f = L.focus;
      f.seconds += 1;
      focusTicks += 1;

      if (f.seconds >= (f.goal || 1500)) {
        f.sessions += 1;
        f.seconds = 0;
        haltFocus();
        S.addAffinity(2);
        S.shiftMood(3);
        S.save();
        renderFocus();
        buzz([12, 40, 12]);
        flash("完成一段专注 · 亲密度 +2");
        return;
      }

      paintFocus();
      if (focusTicks % 5 === 0) S.save();
    }, 1000);
    renderFocus();
  }

  function toggleFocus() {
    var L = life();
    if (!L || !L.focus) return;
    if (haltFocus()) {
      S.save();
      renderFocus();
      flash("专注已暂停 · " + S.fmt.mmss(L.focus.seconds));
    } else {
      startFocus();
      buzz(9);
      flash("专注开始 · " + Math.round((L.focus.goal || 1500) / 60) + " 分钟一段");
    }
  }

  function resetFocus() {
    var L = life();
    if (!L || !L.focus) return;
    haltFocus();
    L.focus.seconds = 0;
    S.save();
    renderFocus();
    flash("专注计时已清空");
  }

  /* ---------- 花销 ---------- */
  function renderBudget() {
    var L = view();
    if (!L || !L.budget) return;
    var b = L.budget;
    var left = Math.max(0, b.total - b.spent);
    if (el("#ui-expense-total")) el("#ui-expense-total").textContent = group(b.spent);
    if (el("#budget-spent")) el("#budget-spent").textContent = group(b.spent);
    if (el("#ui-expense-budget")) el("#ui-expense-budget").textContent = "/ " + group(b.total);
    if (el("#budget-total")) el("#budget-total").textContent = "/ " + group(b.total);
    if (el("#ui-expense-left")) el("#ui-expense-left").textContent = "余 " + group(left);
    if (el("#budget-left")) el("#budget-left").textContent = "余 " + group(left);

    var list = el("#budget-items");
    if (!list) return;
    list.innerHTML = (b.items || [])
      .slice(0, 3)
      .map(function (it) {
        var w = b.total ? clamp((it.value / b.total) * 100, 0, 100) : 0;
        return (
          '<div class="budget__row"><span>' +
          esc(it.label) +
          "</span><b>" +
          group(it.value) +
          '</b><i style="--w:' +
          w.toFixed(1) +
          '%"></i></div>'
        );
      })
      .join("");
  }

  /* ---------- 今日习惯 ---------- */
  function renderHabits() {
    var L = life();
    if (!L) return;
    var habits = L.habits || [];
    var done = habits.filter(function (h) {
      return h.done;
    }).length;

    if (el("#habit-count")) el("#habit-count").textContent = done + " / " + habits.length;

    var list = el("#habit-list");
    if (!list) return;
    list.innerHTML = habits
      .map(function (h) {
        return (
          '<button class="habit' +
          (h.done ? " is-done" : "") +
          '" type="button" data-life="habit" data-id="' +
          esc(h.id) +
          '" aria-pressed="' +
          (h.done ? "true" : "false") +
          '">' +
          '<i class="habit__box" aria-hidden="true"></i>' +
          '<span class="habit__label">' +
          esc(h.label) +
          "</span>" +
          '<span class="habit__streak">' +
          h.streak +
          " 天</span></button>"
        );
      })
      .join("");
  }

  function toggleHabit(id) {
    var L = life();
    if (!L || !id) return;
    var hit = null;
    (L.habits || []).forEach(function (h) {
      if (h.id === id) hit = h;
    });
    if (!hit) return;

    hit.done = !hit.done;
    hit.streak = hit.done ? Math.min(999, hit.streak + 1) : Math.max(0, hit.streak - 1);

    var all =
      L.habits.length > 0 &&
      L.habits.every(function (h) {
        return h.done;
      });

    S.save();
    buzz(12);
    renderHabits();

    if (all) {
      S.addAffinity(3);
      flash("今日习惯全部完成 · 亲密度 +3");
    } else {
      flash(hit.done ? hit.label + " · 连续 " + hit.streak + " 天" : "已取消 " + hit.label);
    }
  }

  /* ---------- 全量渲染 ---------- */
  function renderAll() {
    if (!life()) return;
    rollDay();
    renderWeather();
    renderWater();
    renderSteps();
    renderSleep();
    renderFocus();
    renderBudget();
    renderHabits();
  }

  /* ---------- 触摸交互：单一点击委派 ---------- */
  function onClick(event) {
    var target = event.target;
    if (!target || typeof target.closest !== "function") return;
    var node = target.closest("[data-life]");
    if (!node) return;

    var action = node.getAttribute("data-life");
    /* 饮水卡片改为打开底部弹窗编辑杯数（js/drinkWidget.js），不再直接 +1 */
    if (action === "water-add") {
      if (typeof global.openDrinkModal === "function") global.openDrinkModal();
      else addWater();
    }
    /* 步数卡片改为打开底部弹窗编辑步数（js/stepsWidget.js），不再直接 +600 */
    else if (action === "steps-add") {
      if (typeof global.openStepsModal === "function") global.openStepsModal();
      else addSteps();
    }
    /* 睡眠 / 花销 / 天气 / 专注 / 习惯 / 安排 / 音乐：都改为打开各自的底部弹窗 */
    else if (action === "sleep-edit") {
      if (typeof global.openSleepModal === "function") global.openSleepModal();
    }
    else if (action === "budget-edit") {
      if (typeof global.openBudgetModal === "function") global.openBudgetModal();
    }
    else if (action === "weather-edit") {
      if (typeof global.openWeatherModal === "function") global.openWeatherModal();
    }
    else if (action === "focus-edit") {
      if (typeof global.openFocusModal === "function") global.openFocusModal();
    }
    else if (action === "habit-edit") {
      if (typeof global.openHabitModal === "function") global.openHabitModal();
    }
    else if (action === "plan-edit") {
      if (typeof global.openPlanModal === "function") global.openPlanModal();
    }
    else if (action === "music-edit") {
      if (typeof global.openMusicModal === "function") global.openMusicModal();
    }
    else if (action === "focus-toggle") toggleFocus();
    else if (action === "focus-reset") resetFocus();
    else if (action === "habit") toggleHabit(node.getAttribute("data-id"));
  }

  document.addEventListener("click", onClick);

  document.addEventListener("visibilitychange", function () {
    if (document.hidden && haltFocus()) {
      S.save();
      renderFocus();
    }
  });

  S.widgets = {
    render: renderAll,
    refresh: renderAll,
    generateCharDailyData: generateCharDailyData,
    forceRefreshDaily: forceRefreshDaily,
    charDailyData: charDailyData,
    pauseFocus: function () {
      if (haltFocus()) {
        S.save();
        renderFocus();
      }
    }
  };

  renderAll();
  bindRefreshEntry();

  /* 首屏先用缓存 / mock 渲染，再按天静默补一次角色生活数据 */
  generateCharDailyData();
})(window);