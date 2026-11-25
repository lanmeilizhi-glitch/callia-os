/* ================================================================
   Callia OS · weatherWidget.js
   天气小组件的真实数据编辑：底部半屏弹窗 + 本机存档
   - 结构与 js/drinkWidget.js 完全一致，只用 display + transform 控制显隐
   - 不使用 alert / prompt，全部是页面内真实控件
   - 只读写天气这一项，不碰饮水、步数、睡眠、花销等其他小组件
   ================================================================ */
(function (global) {
  "use strict";

  var STORE_KEY = "user_weather";

  var MODAL = "weather-modal";
  var SHEET = "weather-sheet";
  var CITY = "weather-input-city";
  var TEMP = "weather-input-temp";
  var TEXT = "weather-input-text";
  var HI = "weather-input-hi";
  var LO = "weather-input-lo";

  var CITY_TEXT = "life-city";
  var TEMP_TEXT = "wx-temp";
  var TEXT_TEXT = "wx-text";
  var HILO_TEXT = "wx-hilo";
  var FEEL_TEXT = "wx-feel";
  var WIND_TEXT = "wx-wind";
  var AQI_TEXT = "wx-aqi";
  var CURVE = "wx-curve";

  var KINDS = ["晴", "多云", "多云转晴", "阴", "小雨", "阵雨", "雷阵雨", "雪", "雾"];

  function byId(id) {
    return document.getElementById(id);
  }

  function clampTemp(value, min, max) {
    var n = parseInt(value, 10);
    if (!isFinite(n)) n = 0;
    if (n < min) n = min;
    if (n > max) n = max;
    return n;
  }

  function life() {
    var S = global.COS;
    return S && S.store && S.store.life ? S.store.life : null;
  }

  function baseWeather() {
    return { temp: 17, feel: 16, text: "多云转晴", hi: 21, lo: 12, aqi: 46, aqiLabel: "空气优", wind: 2.4 };
  }

  /* 本机存档：默认与卡片初始值一致 */
  function readStored() {
    var raw = null;
    try {
      raw = global.localStorage.getItem(STORE_KEY);
    } catch (err) {
      raw = null;
    }
    if (!raw) return null;
    try {
      var data = JSON.parse(raw);
      return data && typeof data === "object" ? data : null;
    } catch (err) {
      return null;
    }
  }

  function writeStored(data) {
    try {
      global.localStorage.setItem(STORE_KEY, JSON.stringify(data));
    } catch (err) {
      /* 隐私模式下写不进去时，页面上的数字仍然会更新 */
    }
  }

  function aqiLabel(v) {
    if (v <= 50) return "空气优";
    if (v <= 100) return "空气良";
    if (v <= 150) return "轻度污染";
    return "中度污染";
  }

  function currentWeather() {
    var base = baseWeather();
    var L = life();
    var src = L && L.weather && typeof L.weather === "object" ? L.weather : null;
    var stored = readStored();
    var pick = src || stored || base;
    var hi = clampTemp(pick.hi === undefined ? base.hi : pick.hi, -40, 48);
    var lo = clampTemp(pick.lo === undefined ? base.lo : pick.lo, -40, 48);
    if (lo > hi) lo = hi;
    return {
      city: String((L && L.city) || (pick.city || "灰谷")).slice(0, 8),
      temp: clampTemp(pick.temp === undefined ? base.temp : pick.temp, -40, 46),
      text: String(pick.text || base.text).slice(0, 8),
      hi: hi,
      lo: lo,
      aqi: clampTemp(pick.aqi === undefined ? base.aqi : pick.aqi, 0, 300),
      wind: Number(pick.wind) >= 0 ? Number(pick.wind) : base.wind
    };
  }

  /* 体感按温度与天气粗算，改完温度后卡片上的体感不会自相矛盾 */
  function feelOf(temp, text) {
    var delta = text.indexOf("雨") >= 0 || text.indexOf("雪") >= 0 ? -2 : text.indexOf("晴") >= 0 ? 1 : 0;
    return clampTemp(temp + delta, -40, 46);
  }

  /* 把天气画到卡片上：城市、温度、天气、高低温、体感、风、空气、走势 */
  function paintCard(data) {
    var w = data || currentWeather();
    var feel = feelOf(w.temp, w.text);

    var city = byId(CITY_TEXT);
    if (city) city.textContent = w.city;

    var temp = byId(TEMP_TEXT);
    if (temp) temp.textContent = w.temp;

    var text = byId(TEXT_TEXT);
    if (text) text.textContent = w.text;

    var hilo = byId(HILO_TEXT);
    if (hilo) hilo.textContent = w.lo + "° — " + w.hi + "°";

    var feelNode = byId(FEEL_TEXT);
    if (feelNode) feelNode.textContent = "体感 " + feel + "°";

    var wind = byId(WIND_TEXT);
    if (wind) wind.textContent = "风 " + (Number(w.wind) || 0).toFixed(1) + " m/s";

    var aqi = byId(AQI_TEXT);
    if (aqi) aqi.textContent = aqiLabel(w.aqi);

    var curve = byId(CURVE);
    if (!curve) return;
    var span = Math.max(1, w.hi - w.lo);
    var shape = [0.3, 0.58, 1, 0.76, 0.46, 0.26];
    curve.innerHTML = shape
      .map(function (s) {
        var t = Math.round(w.lo + span * s);
        var h = Math.round(20 + s * 72);
        return '<span class="wx__pt"><i style="--h:' + h + '%"></i><b>' + t + "°</b></span>";
      })
      .join("");
    curve.setAttribute("aria-label", "今日 8 时至 23 时温度走势");
  }

  /* 同步到生活数据（S.store.life.weather / city），让其他读取天气的地方看到同一个值 */
  function syncStore(data) {
    var S = global.COS;
    if (!S || !S.store || !S.store.life) return;
    var L = S.store.life;
    L.city = data.city;
    L.weather = {
      temp: data.temp,
      feel: feelOf(data.temp, data.text),
      text: data.text,
      hi: data.hi,
      lo: data.lo,
      aqi: data.aqi,
      aqiLabel: aqiLabel(data.aqi),
      wind: data.wind
    };
    if (typeof S.save === "function") S.save();
  }

  /* ---------- 弹窗开关 ---------- */
  function openWeatherModal() {
    var modal = byId(MODAL);
    var sheet = byId(SHEET);
    if (!modal || !sheet) return;
    var w = currentWeather();
    if (byId(CITY)) byId(CITY).value = w.city;
    if (byId(TEMP)) byId(TEMP).value = w.temp;
    if (byId(TEXT)) byId(TEXT).value = w.text;
    if (byId(HI)) byId(HI).value = w.hi;
    if (byId(LO)) byId(LO).value = w.lo;

    modal.style.display = "flex";
    global.setTimeout(function () {
      sheet.style.transform = "translateY(0)";
    }, 10);
  }

  function closeWeatherModal() {
    var modal = byId(MODAL);
    var sheet = byId(SHEET);
    if (!modal || !sheet) return;
    sheet.style.transform = "translateY(100%)";
    global.setTimeout(function () {
      modal.style.display = "none";
    }, 300);
  }

  /* ---------- 加减与保存 ---------- */
  function updateWeather(field, step) {
    var delta = parseInt(step, 10) || 0;
    var node = byId(field === "hi" ? HI : field === "lo" ? LO : TEMP);
    if (!node) return;
    var next = clampTemp((parseInt(node.value, 10) || 0) + delta, -40, 48);
    node.value = next;
  }

  /* 天气文案在几个常用词之间轮换，省得每次都要打字 */
  function cycleWeatherText() {
    var node = byId(TEXT);
    if (!node) return;
    var idx = KINDS.indexOf(node.value);
    node.value = KINDS[(idx + 1) % KINDS.length];
  }

  function saveWeatherData() {
    var base = baseWeather();
    var prev = currentWeather();
    var hi = clampTemp(byId(HI) ? byId(HI).value : base.hi, -40, 48);
    var lo = clampTemp(byId(LO) ? byId(LO).value : base.lo, -40, 48);
    if (lo > hi) lo = hi;

    var data = {
      city: String((byId(CITY) ? byId(CITY).value : prev.city) || prev.city).trim().slice(0, 8) || prev.city,
      temp: clampTemp(byId(TEMP) ? byId(TEMP).value : base.temp, -40, 46),
      text: String((byId(TEXT) ? byId(TEXT).value : base.text) || base.text).trim().slice(0, 8) || base.text,
      hi: hi,
      lo: lo,
      aqi: prev.aqi,
      wind: prev.wind
    };

    if (byId(CITY)) byId(CITY).value = data.city;
    if (byId(TEMP)) byId(TEMP).value = data.temp;
    if (byId(TEXT)) byId(TEXT).value = data.text;
    if (byId(HI)) byId(HI).value = data.hi;
    if (byId(LO)) byId(LO).value = data.lo;

    writeStored(data);
    syncStore(data);
    paintCard(data);
    closeWeatherModal();

    var S = global.COS;
    if (S && S.os && typeof S.os.toast === "function") {
      S.os.toast("已更新天气 · " + data.city + " " + data.temp + "° " + data.text);
    }
  }

  /* 点遮罩关闭：只关弹窗，不保存 */
  function bindMask() {
    var modal = byId(MODAL);
    if (!modal) return;
    modal.addEventListener("click", function (ev) {
      if (ev.target === modal) closeWeatherModal();
    });
  }

  /* 输入框失焦时把越界值收回来，避免出现 99 度 */
  function bindInputs() {
    [TEMP, HI, LO].forEach(function (id) {
      var node = byId(id);
      if (!node) return;
      node.addEventListener("change", function () {
        node.value = clampTemp(node.value, -40, id === "weather-input-temp" ? 46 : 48);
      });
    });
  }

  function boot() {
    bindMask();
    bindInputs();
    paintCard(currentWeather());
  }

  global.openWeatherModal = openWeatherModal;
  global.closeWeatherModal = closeWeatherModal;
  global.updateWeather = updateWeather;
  global.cycleWeatherText = cycleWeatherText;
  global.saveWeatherData = saveWeatherData;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
