/* ============================================================================
   Callia OS · learn.js
   人设书与世界书的学习层。

   上面一层（persona.js）解决「读到了什么」，这一层解决「记到几分、还记不记得」。
   · 每条设定都有掌握度 0—100：导入时算「刚读过一遍」，对话里被用到就巩固。
   · 长时间没被提到会按天遗忘；掉下生疏线会写进学习日志，伴侣会直接承认忘了。
   · 注入提示词时按掌握度分级：记得清的直说，没记牢的留余地，忘了的不编细节。
   · 所有记录写进 store.persona.learn，只存本机。

   规则：persona.js 缺席、还没导入任何设定、存储被写坏，都只能静默降级，不抛错。
   ========================================================================== */
(function (global) {
  "use strict";

  var S = global.COS;

  var DAY = 86400000;
  var MASTER = 80; // 已掌握
  var FAIR = 45; // 说得上口
  var FAINT = 20; // 只剩印象
  var BASE_KEYWORD = 30; // 刚导入的关键词条目：读过一遍
  var BASE_CONSTANT = 55; // 刚导入的常驻条目：当场就记住了大半
  var DECAY_KEYWORD = 6; // 每天遗忘
  var DECAY_CONSTANT = 2.5;
  var DECAY_CARD = 3;
  var COOLDOWN = 45000; // 同一条设定 45 秒内只巩固一次，避免重复计数
  var MAX_LOG = 8;
  var MAX_DUE = 4;

  /* ---------- 依赖与存储 ---------- */
  function persona() {
    return S && S.persona && typeof S.persona.recall === "function" ? S.persona : null;
  }

  function blank() {
    return { card: { m: 0, turns: 0, last: 0 }, entries: {}, log: [], day: "", streak: 0 };
  }

  function store() {
    var p = S.store && S.store.persona;
    if (!p || typeof p !== "object") return null;
    if (!p.learn || typeof p.learn !== "object") p.learn = blank();
    var L = p.learn;
    if (!L.card || typeof L.card !== "object") L.card = { m: 0, turns: 0, last: 0 };
    if (!L.entries || typeof L.entries !== "object") L.entries = {};
    if (!Array.isArray(L.log)) L.log = [];
    if (typeof L.day !== "string") L.day = "";
    if (!Number(L.streak)) L.streak = 0;
    return L;
  }

  /* ---------- 小工具 ---------- */
  function pct(v) {
    var n = Number(v);
    if (!isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function dayKey(ts) {
    var d = new Date(ts || Date.now());
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }

  function titleOf(entry) {
    return String((entry && entry.title) || "这条设定").replace(/\s+/g, " ").slice(0, 20);
  }

  function flat(text, n) {
    return String(text || "").replace(/\s+/g, " ").trim().slice(0, n || 200);
  }

  function tier(m) {
    var v = Number(m) || 0;
    if (v >= MASTER) return "master";
    if (v >= FAIR) return "fair";
    if (v >= FAINT) return "weak";
    return "fade";
  }

  function log(text, kind) {
    var L = store();
    if (!L) return;
    L.log.unshift({ ts: Date.now(), t: String(text).slice(0, 40), k: kind || "note" });
    if (L.log.length > MAX_LOG) L.log.length = MAX_LOG;
  }

  function touchDay() {
    var L = store();
    if (!L) return;
    var today = dayKey(Date.now());
    if (L.day === today) return;
    L.streak = L.day === dayKey(Date.now() - DAY) ? Math.min(999, (Number(L.streak) || 0) + 1) : 1;
    L.day = today;
  }

  /* ---------- 条目遍历与记录 ---------- */
  function eachEntry(fn) {
    var p = persona();
    if (!p || typeof p.state !== "function") return;
    var st;
    try {
      st = p.state() || {};
    } catch (err) {
      return;
    }
    var books = Array.isArray(st.books) ? st.books : [];
    for (var i = 0; i < books.length; i += 1) {
      var book = books[i];
      if (!book || !Array.isArray(book.entries)) continue;
      for (var j = 0; j < book.entries.length; j += 1) {
        var entry = book.entries[j];
        if (!entry || !entry.id || !flat(entry.content, 8)) continue;
        if (fn(book, entry) === false) return;
      }
    }
  }

  /* 取记录；第一次见到这条设定时按「刚读过一遍」建底 */
  function recFor(book, entry) {
    var L = store();
    var id = String((entry && entry.id) || "");
    if (!L || !id) return { m: 0, seen: 0, study: 0, first: Date.now(), recall: 0, touch: Date.now() };
    var r = L.entries[id];
    if (!r || typeof r !== "object") {
      r = {
        m: entry.constant ? BASE_CONSTANT : BASE_KEYWORD,
        seen: 0,
        study: 0,
        first: Date.now(),
        recall: 0,
        touch: Date.now()
      };
      L.entries[id] = r;
    }
    r.m = pct(r.m);
    r.seen = Math.max(0, Math.round(Number(r.seen) || 0));
    r.study = Math.max(0, Math.round(Number(r.study) || 0));
    r.first = Number(r.first) || Date.now();
    r.recall = Number(r.recall) || 0;
    r.touch = Number(r.touch) || 0;
    return r;
  }

  /* ---------- 遗忘：按天衰减，顺带清掉已删除设定的孤儿记录 ---------- */
  function decayAll() {
    var L = store();
    if (!L) return false;
    var now = Date.now();
    var live = {};
    var changed = false;

    eachEntry(function (book, entry) {
      var r = L.entries[entry.id];
      live[entry.id] = 1;
      if (!r) return;
      var base = Math.max(Number(r.recall) || 0, Number(r.touch) || 0, Number(r.first) || 0);
      var idle = base ? (now - base) / DAY : 0;
      if (idle < 1) return;
      var before = Number(r.m) || 0;
      r.touch = now - (idle % 1) * DAY;
      changed = true;
      if (before <= 0) return;
      var rate = entry.constant ? DECAY_CONSTANT : DECAY_KEYWORD;
      var after = Math.max(0, before - rate * Math.floor(idle));
      r.m = pct(after);
      if (before >= FAIR && after < FAIR) log("有点忘了「" + titleOf(entry) + "」", "fade");
    });

    Object.keys(L.entries).forEach(function (id) {
      if (live[id]) return;
      delete L.entries[id];
      changed = true;
    });

    var c = L.card;
    var idleCard = c.last ? (now - Number(c.last)) / DAY : 0;
    if (idleCard >= 1 && (Number(c.m) || 0) > 0) {
      var was = Number(c.m) || 0;
      c.m = pct(was - DECAY_CARD * Math.floor(idleCard));
      c.last = now - (idleCard % 1) * DAY;
      changed = true;
      if (was >= FAIR && c.m < FAIR) log("人设书有点生疏了", "fade");
    }

    if (changed) S.save();
    return changed;
  }

  /* ---------- 巩固 ---------- */
  function credit(r, entry, constant) {
    var now = Date.now();
    if (now - (Number(r.recall) || 0) < COOLDOWN) return;
    var before = Number(r.m) || 0;
    var after = Math.min(100, before + Math.max(4, (constant ? 9 : 12) - before * 0.12));
    r.m = pct(after);
    r.seen = (Number(r.seen) || 0) + 1;
    r.recall = now;
    r.touch = now;
    touchDay();
    if (before < FAIR && after >= FAIR) log("记住了「" + titleOf(entry) + "」", "up");
    else if (before < MASTER && after >= MASTER) log("彻底记住「" + titleOf(entry) + "」", "master");
  }

  function bumpCard() {
    var L = store();
    if (!L) return;
    var c = L.card;
    var now = Date.now();
    if (now - (Number(c.last) || 0) < COOLDOWN) return;
    var before = Number(c.m) || 0;
    var after = Math.min(100, before + Math.max(3, 8 - before * 0.1));
    c.m = pct(after);
    c.turns = (Number(c.turns) || 0) + 1;
    c.last = now;
    touchDay();
    var p = persona();
    var card = p && typeof p.card === "function" ? p.card() : null;
    var name = card && card.name ? card.name : "人设";
    if (before < FAIR && after >= FAIR) log("「" + name + "」说得上口了", "up");
    else if (before < MASTER && after >= MASTER) log("「" + name + "」已经像自己的人了", "master");
  }

  /* ---------- 分级注入：这一轮它到底记到几分 ---------- */
  function safeDigest(p, text) {
    try {
      return String(p.digest(text) || "");
    } catch (err) {
      return "";
    }
  }

  function digest(text) {
    var p = persona();
    if (!p) return "";
    var L = store();
    if (!L) return safeDigest(p, text);

    decayAll();

    var cardBlock = "";
    try {
      cardBlock = String(p.cardBlock() || "");
    } catch (err) {
      cardBlock = "";
    }
    if (cardBlock) bumpCard();

    var found = null;
    try {
      found = p.recall(text);
    } catch (err) {
      found = null;
    }
    var items = found && Array.isArray(found.items) ? found.items : [];

    var clear = [];
    var fuzzy = [];
    var fading = [];

    for (var i = 0; i < items.length; i += 1) {
      var hit = items[i];
      var entry = hit && hit.entry;
      if (!entry) continue;
      var r = recFor(hit.book || {}, entry);
      var knew = Number(r.m) || 0; // 按这一轮之前的掌握度说话，巩固算给下一轮
      credit(r, entry, !!hit.constant);
      if (knew >= MASTER) clear.push(entry);
      else if (knew >= FAINT) fuzzy.push(entry);
      else fading.push(entry);
    }

    var lines = [];
    if (cardBlock) lines.push(cardBlock);
    if (clear.length) {
      lines.push("【这些你记得很清楚，可以直接当成自己的经历说出来】");
      clear.forEach(function (e) {
        lines.push("· " + titleOf(e) + "：" + flat(e.content, 260));
      });
    }
    if (fuzzy.length) {
      lines.push("【这些还在记，大方向没错但细节可能说错，说的时候留点余地】");
      fuzzy.forEach(function (e) {
        lines.push("· " + titleOf(e) + "：" + flat(e.content, 200));
      });
    }
    if (fading.length) {
      lines.push("【这些好像听对方讲过，但已经记不清了：别编细节，被追问就承认忘了】");
      fading.slice(0, 3).forEach(function (e) {
        lines.push("· " + titleOf(e));
      });
    }

    S.save();
    if (!lines.length) return "";

    var head =
      "下面这些是你自己学过、正在一点点记牢的东西。自然地用出来，不要照抄原文，" +
      "也不要提这些文字是从哪里来的。";
    return [head].concat(lines).join("\n");
  }

  /* ---------- 复习 ---------- */
  function dueList() {
    var out = [];
    eachEntry(function (book, entry) {
      if (entry.enabled === false || book.enabled === false) return;
      var r = recFor(book, entry);
      if ((Number(r.m) || 0) >= MASTER) return;
      out.push({ book: book, entry: entry, r: r });
    });
    out.sort(function (a, b) {
      if (a.r.m !== b.r.m) return a.r.m - b.r.m;
      return (Number(a.r.recall) || 0) - (Number(b.r.recall) || 0);
    });
    return out;
  }

  function study(entryId) {
    var target = null;
    eachEntry(function (book, entry) {
      if (String(entry.id) === String(entryId)) {
        target = { book: book, entry: entry };
        return false;
      }
    });
    if (!target) return false;

    var r = recFor(target.book, target.entry);
    var before = Number(r.m) || 0;
    var after = Math.min(100, before + 14);
    r.m = pct(after);
    r.study = (Number(r.study) || 0) + 1;
    r.recall = Date.now();
    r.touch = Date.now();
    touchDay();
    if (before < MASTER && after >= MASTER) log("彻底记住「" + titleOf(target.entry) + "」", "master");
    else if (before < FAIR && after >= FAIR) log("读顺了「" + titleOf(target.entry) + "」", "up");
    else log("又读了一遍「" + titleOf(target.entry) + "」", "study");
    S.save();
    return true;
  }

  function studyAll() {
    var list = dueList();
    if (!list.length) return 0;
    var now = Date.now();
    list.forEach(function (d) {
      d.r.m = pct((Number(d.r.m) || 0) + 8);
      d.r.study = (Number(d.r.study) || 0) + 1;
      d.r.recall = now;
      d.r.touch = now;
    });
    touchDay();
    log("带着把 " + list.length + " 条又读了一遍", "study");
    S.save();
    return list.length;
  }

  /* 清空学习记录：设定还在，只是从零开始重新记 */
  function reset() {
    var L = store();
    if (!L) return false;
    Object.keys(L.entries).forEach(function (id) {
      var r = L.entries[id];
      if (!r || typeof r !== "object") return;
      r.m = 0;
      r.seen = 0;
      r.study = 0;
      r.recall = 0;
      r.touch = Date.now();
    });
    L.card = { m: 0, turns: 0, last: Date.now() };
    L.log = [];
    L.day = "";
    L.streak = 0;
    S.save();
    return true;
  }

  /* ---------- 报告 ---------- */
  function headline(overall, total) {
    if (!total) return "还没有要学的东西";
    if (overall >= 100) return "全都长在身上了";
    if (overall >= MASTER) return "基本都记住了";
    if (overall >= FAIR) return "正在慢慢吸收";
    if (overall >= BASE_KEYWORD) return "刚读完，还没消化";
    if (overall > 0) return "记得零零碎碎";
    return "还没开始记";
  }

  function report() {
    var L = store();
    var out = {
      total: 0,
      mastered: 0,
      fair: 0,
      weak: 0,
      faint: 0,
      overall: 0,
      cardOn: false,
      cardName: "",
      cardM: 0,
      due: [],
      dueCount: 0,
      log: [],
      streak: 0,
      headline: headline(0, 0)
    };
    if (!L) return out;

    decayAll();

    var sum = 0;
    eachEntry(function (book, entry) {
      if (entry.enabled === false || book.enabled === false) return;
      var r = recFor(book, entry);
      var m = Number(r.m) || 0;
      out.total += 1;
      sum += m;
      if (m >= MASTER) out.mastered += 1;
      else if (m >= FAIR) out.fair += 1;
      else if (m >= FAINT) out.weak += 1;
      else out.faint += 1;
    });

    out.overall = out.total ? Math.round(sum / out.total) : 0;

    var p = persona();
    var card = p && typeof p.card === "function" ? p.card() : null;
    if (card) {
      out.cardOn = true;
      out.cardName = String(card.name || "人设书").slice(0, 12);
      out.cardM = pct(L.card.m);
      out.overall = out.total ? Math.round((out.overall + out.cardM) / 2) : out.cardM;
    }

    var due = dueList();
    out.dueCount = due.length;
    out.due = due.slice(0, MAX_DUE);
    out.log = L.log.slice(0, 3);
    out.streak = Math.round(Number(L.streak) || 0);
    out.headline = headline(out.overall, out.total + (out.cardOn ? 1 : 0));
    return out;
  }

  /* ---------- 设定书视图里的学习面板 ---------- */
  function bar(value, extra) {
    return (
      '<span class="learn-bar' + (extra ? " " + extra : "") + '"><i style="width:' + pct(value) + '%"></i></span>'
    );
  }

  function panelMarkup() {
    if (!persona()) return "";
    var rep = report();
    var head =
      '<p class="sectitle"><span>学习进度</span><span>掌握 ' + rep.overall + "%</span></p>";
    var open = '<div class="set-group set-group--api"><div class="learn-panel">';
    var close = "</div></div>";

    if (!rep.total && !rep.cardOn) {
      return (
        head +
        open +
        '<p class="learn-empty">还没有要学的设定。导入人设书或世界书之后，这里会显示它读到哪一步、哪几条快忘了。</p>' +
        close
      );
    }

    var html = head + open;

    html +=
      '<div class="learn-top">' +
      '<span class="learn-ring" style="--p:' + rep.overall + '" aria-hidden="true"><b class="learn-ring__num">' +
      rep.overall + "</b></span>" +
      '<div class="learn-meta">' +
      '<p class="learn-meta__title">' + S.esc(rep.headline) + "</p>" +
      '<p class="learn-meta__sub">已掌握 ' + rep.mastered + " · 在记 " + (rep.fair + rep.weak) + " · 快忘了 " + rep.faint +
      (rep.streak > 1 ? " · 连续 " + rep.streak + " 天" : "") + "</p>" +
      bar(rep.overall) +
      "</div></div>";

    if (rep.cardOn) {
      html +=
        '<div class="learn-line">' +
        '<span class="learn-line__name">人设书《' + S.esc(rep.cardName) + "》</span>" +
        '<span class="learn-line__bar">' + bar(rep.cardM, "learn-bar--thin") + "</span>" +
        '<span class="learn-line__pct num">' + rep.cardM + "%</span>" +
        "</div>";
    }

    if (rep.due.length) {
      html +=
        '<div class="learn-due">' +
        '<div class="learn-head"><p class="learn-head__title">该复习了' +
        (rep.dueCount > rep.due.length ? " · 共 " + rep.dueCount + " 条" : "") +
        "</p>" +
        '<button class="learn-mini" type="button" data-p-action="learn-all">全部过一遍</button></div>';
      rep.due.forEach(function (d) {
        html +=
          '<div class="learn-item">' +
          '<span class="learn-item__name">' + S.esc(titleOf(d.entry)) + "</span>" +
          '<span class="learn-item__bar">' + bar(d.r.m, "learn-bar--thin") + "</span>" +
          '<button class="learn-mini learn-item__btn" type="button" data-p-action="learn-study" data-entry="' +
          S.esc(d.entry.id) + '">读一遍</button>' +
          "</div>";
      });
      html += "</div>";
    }

    if (rep.log.length) {
      html += '<div class="learn-log">';
      rep.log.forEach(function (item) {
        html +=
          '<p class="learn-log__row is-' + S.esc(item.k || "note") + '">' +
          '<i class="learn-log__dot" aria-hidden="true"></i>' +
          "<span>" + S.esc(item.t) + "</span>" +
          '<span class="learn-log__time">' + S.esc(S.fmt.ago(Number(item.ts) || Date.now())) + "</span></p>";
      });
      html += "</div>";
    }

    html +=
      '<div class="learn-foot">' +
      '<p class="learn-note">每说一次话，用到的设定就被记牢一点；长时间不提会慢慢生疏，真忘了它会直接承认。</p>' +
      '<button class="learn-reset" type="button" data-p-action="learn-reset">清空学习记录</button>' +
      "</div>";

    return html + close;
  }

  global.COS.learn = {
    digest: digest,
    report: report,
    panelMarkup: panelMarkup,
    study: study,
    studyAll: studyAll,
    reset: reset,
    tier: tier
  };
})(window);
