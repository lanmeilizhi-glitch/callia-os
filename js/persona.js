/* =====================================================================
   Callia OS · persona.js
   人设书（角色卡）与世界书（lorebook）导入层。

   支持的人设书：chara_card_v2 / v3、角色卡 v1、SillyTavern 导出字段、
                 PNG 内嵌 tEXt(chara/ccv2)、纯文本 / Markdown / W++ 人设。
   支持的世界书：SillyTavern world info（entries 对象或数组）、
                 角色卡内嵌 character_book、{name,entries} 通用结构、
                 纯文本 / Markdown 分节世界书。

   规则：上传文件先交给 docs.js 解码成纯文本或标准 JSON，所以 Word / ODT /
         PDF / EPUB / CSV / YAML / HTML / RTF / ZIP 等也能导入。
   规则：人设书常驻注入；世界书条目按关键词命中注入，受字符预算限制。
   所有解析失败都返回中文原因，不抛异常。
   ===================================================================== */
(function (global) {
  "use strict";

  var S = global.COS;

  var MAX_TEXT = 2 * 1024 * 1024;
  var MAX_BIN = 8 * 1024 * 1024;
  var MAX_FIELDS = 12;
  var MAX_ENTRIES = 400;

  /* 单次注入预算：300 – 20000 字。上限是硬红线，不允许改成无限制 */
  var BUDGET_MIN = 300;
  var BUDGET_MAX = 20000;

  /* ---------- 基础工具 ---------- */
  function fail(message) {
    return { ok: false, message: message, kind: "", card: null, book: null };
  }

  function clean(v, max) {
    return String(v === null || v === undefined ? "" : v)
      .replace(/\r\n/g, "\n")
      .replace(/\t/g, "    ")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim()
      .slice(0, max || 1600);
  }

  function pick(obj, names) {
    for (var i = 0; i < names.length; i += 1) {
      var value = obj[names[i]];
      if (typeof value === "string" && value.trim()) return value;
      if (Array.isArray(value) && value.length) {
        var joined = value
          .map(function (item) {
            return typeof item === "string" ? item : "";
          })
          .join("\n")
          .trim();
        if (joined) return joined;
      }
    }
    return "";
  }

  function latin1(bytes) {
    var out = "";
    for (var i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
    return out;
  }

  function b64ToText(b64) {
    var bin = "";
    try {
      bin = global.atob(String(b64 || "").replace(/\s+/g, ""));
    } catch (err) {
      return "";
    }
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    if (global.TextDecoder) {
      try {
        return new global.TextDecoder("utf-8").decode(bytes);
      } catch (err) {
        /* 交给下面的兜底分支 */
      }
    }
    return bin;
  }

  /* 文本文件优先 UTF-8，失败退 GBK，最后按单字节读，保证不崩 */
  function decodeBuffer(buf) {
    var u8 = new Uint8Array(buf);
    if (global.TextDecoder) {
      try {
        return new global.TextDecoder("utf-8", { fatal: true }).decode(u8);
      } catch (err) {
        /* 不是合法 UTF-8，试 GBK */
      }
      try {
        return new global.TextDecoder("gbk").decode(u8);
      } catch (err) {
        /* 环境不认识 gbk 时按单字节兜底 */
      }
    }
    return latin1(u8.subarray(0, MAX_TEXT));
  }

  function stripBom(text) {
    return String(text || "").replace(/^\uFEFF/, "");
  }

  function readBuffer(file) {
    return new Promise(function (resolve, reject) {
      if (!global.FileReader) {
        reject(new Error("no-file-reader"));
        return;
      }
      var reader = new global.FileReader();
      reader.onerror = function () {
        reject(new Error("read-failed"));
      };
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function fileStem(name) {
    var base = String(name || "").replace(/^.*[\\/]/, "");
    return base.replace(/\.[^.]+$/, "").trim().slice(0, 30);
  }

  /* ---------- 纯文本 → 分节字段 ---------- */
  var HEAD_RE = /^#{1,5}\s+(\S.*)$/;
  var ONLY_RE = /^([^:：]{1,14})[:：]\s*$/;
  var INLINE_RE = /^([^:：]{1,12})[:：]\s*(\S.*)$/;

  function labelish(s) {
    var v = String(s || "").trim();
    return !!v && v.length <= 14 && !/[。！？!?；;]/.test(v);
  }

  function textToFields(text) {
    var raw = String(text || "").split("\n");
    var inlineCount = 0;
    var i;

    for (i = 0; i < raw.length; i += 1) {
      var probe = INLINE_RE.exec(raw[i].trim());
      if (probe && labelish(probe[1])) inlineCount += 1;
    }
    var useInline = inlineCount >= 2;

    var fields = [];
    var label = "人设";
    var buf = [];

    function flush() {
      var value = buf.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      buf = [];
      if (!value || fields.length >= MAX_FIELDS) return;
      fields.push({ k: label.slice(0, 16) || "设定", v: value.slice(0, 1600) });
    }

    for (i = 0; i < raw.length; i += 1) {
      var line = raw[i];
      var trimmed = line.trim();
      var hit = null;
      var head = HEAD_RE.exec(trimmed);
      var only = ONLY_RE.exec(trimmed);
      var pair = useInline ? INLINE_RE.exec(trimmed) : null;

      if (head && labelish(head[1])) hit = { k: head[1], v: "" };
      else if (only && labelish(only[1])) hit = { k: only[1], v: "" };
      else if (pair && labelish(pair[1])) hit = { k: pair[1], v: pair[2] };

      if (hit) {
        flush();
        label = hit.k.trim();
        if (hit.v) buf.push(hit.v);
        continue;
      }
      buf.push(line);
    }
    flush();

    if (!fields.length && String(text || "").trim()) {
      fields.push({ k: "人设", v: clean(text, 1600) });
    }
    return fields;
  }

  var NAME_PATTERNS = [
    /Character\(\s*["“”']([^"“”']{1,24})["“”']/i,
    /<\s*charset\s*[:：]\s*([^>\n]{1,24})>/i,
    /^\s*(?:名[字称]|角色名|人设名|Name|Char)\s*[:：]\s*(\S{1,24})/im,
    /\[\s*(?:Character|角色)\s*[:：]\s*([^\]\n]{1,24})\]/i
  ];

  /* Word / Markdown 文档常把角色名写成一级标题；纯通用词不能当名字 */
  var DOC_TITLE_RE = /^#\s+([^\n#]{1,30})[ \t]*$/m;
  var GENERIC_TITLE_RE =
    /^(?:角色|人设|人物|世界|设定|说明|文档|目录|模板|基本|背景|档案|简介|设定集|character|persona|world|lore|setting|template|book|card)/i;

  function nameFromTitle(title) {
    var v = String(title || "").replace(/[\s\u3000]+/g, " ").trim();
    if (!v || v.length > 24 || /[。！？!?；;]/.test(v)) return "";
    if (!GENERIC_TITLE_RE.test(v)) return v;
    /* 「林小满 · 人物设定」这类标题，取分隔符前面的名字 */
    var parts = v.split(/\s*[·|｜\-—、，,]\s*/);
    for (var i = 0; i < parts.length; i += 1) {
      var part = parts[i].trim();
      if (part && part.length <= 12 && !GENERIC_TITLE_RE.test(part)) return part;
    }
    return "";
  }

  function guessName(text, filename) {
    var body = String(text || "");
    for (var i = 0; i < NAME_PATTERNS.length; i += 1) {
      var m = NAME_PATTERNS[i].exec(body);
      if (m && m[1] && m[1].trim()) return m[1].trim().slice(0, 24);
    }
    var title = DOC_TITLE_RE.exec(body);
    if (title) {
      var named = nameFromTitle(title[1]);
      if (named) return named.slice(0, 24);
    }
    var stem = fileStem(filename);
    if (stem) return stem.slice(0, 24);
    return "未命名人设";
  }

  function textToCard(text, filename) {
    var body = clean(text, 24000);
    var fields = textToFields(body);
    var greeting = "";
    var example = "";
    var extra = "";
    var kept = [];

    for (var i = 0; i < fields.length; i += 1) {
      var k = fields[i].k;
      if (!greeting && /开场|问候|打招呼|greeting|first[_\s]?mes/i.test(k)) greeting = fields[i].v;
      else if (!example && /示例|例子|对话样例|example/i.test(k)) example = fields[i].v;
      else if (!extra && /额外|要求|规则|禁[止用]|system|instruction/i.test(k)) extra = fields[i].v;
      else kept.push(fields[i]);
    }

    return {
      name: guessName(body, filename),
      tagline: (kept[0] ? clean(kept[0].v.replace(/\n+/g, " "), 60) : ""),
      fields: kept,
      greeting: greeting,
      example: example,
      extra: extra,
      source: String(filename || "粘贴文本").slice(0, 40)
    };
  }

  /* ---------- 无结构长文档 → 按空行块拆条 ---------- */
  var LIST_MARK_RE = /^\s*(?:[·•\-*–—]|\d{1,2}\s*[.、)）]|[一二三四五六七八九十]{1,3}\s*[、.])\s*/;

  function stripMark(line) {
    return String(line || "").replace(LIST_MARK_RE, "").replace(/^#+\s*/, "").trim();
  }

  function meaty(text) {
    var hits = String(text || "").match(/[\u4e00-\u9fa5A-Za-z0-9]/g);
    return hits ? hits.length : 0;
  }

  /* 块首行能不能当标题：短、没句号、没间号 */
  function titleFrom(line) {
    var v = stripMark(line).replace(/[\u3000\s]+/g, " ").replace(/[:：]\s*$/, "").trim();
    if (!v || /[。！？!?;；]/.test(v)) return "";
    if (v.length <= 24) return v;
    var head = v.split(/[，,、；;（(\[]/)[0].trim();
    return head.length >= 2 && head.length <= 20 ? head : "";
  }

  function blocksToEntries(raw) {
    var blocks = [];
    var buf = [];
    var i;

    function push() {
      var body = buf.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      buf = [];
      if (!body) return;
      /* 零碎的短行归到上一块，不单独成条 */
      if (blocks.length && body.length < 24 && !/[:：]/.test(body)) {
        blocks[blocks.length - 1] += "\n" + body;
        return;
      }
      blocks.push(body);
    }

    for (i = 0; i < raw.length; i += 1) {
      if (String(raw[i]).trim()) { buf.push(raw[i]); continue; }
      push();
    }
    push();
    if (blocks.length < 3) return [];

    var out = [];
    for (i = 0; i < blocks.length && out.length < MAX_ENTRIES; i += 1) {
      var lines = String(blocks[i]).split("\n");
      var first = lines[0];
      var title = titleFrom(first);
      var content = title && lines.length > 1 ? lines.slice(1).join("\n").trim() : blocks[i];
      if (meaty(content) < 8) continue;
      var keys = keysFromTitle(title || first);
      out.push({
        id: S.uid("e"),
        title: (title || stripMark(first).slice(0, 18) || "设定 " + (out.length + 1)).slice(0, 40),
        keys: keys,
        content: content.slice(0, 4000),
        constant: !keys.length,
        order: out.length + 1,
        enabled: true
      });
    }
    return out.length >= 3 ? out : [];
  }

  /* ---------- 纯文本 → 世界书条目 ---------- */
  var KEY_SPLIT = /[,，、/|·;；]+/;
  var LORE_LINE_RE = /^([^:：]{1,40}?)\s*[:：]\s*(\S.{2,})$/;

  function keysFromTitle(title) {
    var parts = String(title || "").split(KEY_SPLIT);
    var out = [];
    for (var i = 0; i < parts.length; i += 1) {
      var key = parts[i].trim();
      if (key && key.length <= 40) out.push(key);
    }
    return out.slice(0, 24);
  }

  function textToBook(text, filename) {
    var raw = clean(text, 60000).split("\n");
    var entries = [];
    var title = "";
    var body = [];

    function flush() {
      var content = body.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      body = [];
      if (!content || entries.length >= MAX_ENTRIES) return;
      var keys = keysFromTitle(title);
      entries.push({
        id: S.uid("e"),
        title: (title || "条目 " + (entries.length + 1)).slice(0, 40),
        keys: keys,
        content: content.slice(0, 4000),
        constant: !keys.length,
        order: entries.length + 1,
        enabled: true
      });
    }

    for (var i = 0; i < raw.length; i += 1) {
      var line = raw[i];
      var trimmed = line.trim();
      var next = null;

      var head = HEAD_RE.exec(trimmed);
      if (head) next = head[1];
      else if (/^【[^】]{1,40}】$/.test(trimmed)) next = trimmed.replace(/^【|】$/g, "");
      else if (/^\[[^\]]{1,40}\]$/.test(trimmed)) next = trimmed.replace(/^\[|\]$/g, "");
      else if (ONLY_RE.test(trimmed)) next = trimmed.replace(/[:：]\s*$/, "");

      if (next && labelish(next)) {
        flush();
        title = next.trim();
        continue;
      }
      body.push(line);
    }
    flush();

    /* 没有分节标记时，按「关键词：内容」逐行拆条 */
    if (!entries.length) {
      for (i = 0; i < raw.length; i += 1) {
        var pair = LORE_LINE_RE.exec(raw[i].trim());
        if (!pair) continue;
        var keys = keysFromTitle(pair[1]);
        if (!keys.length) continue;
        entries.push({
          id: S.uid("e"),
          title: pair[1].trim().slice(0, 40),
          keys: keys,
          content: pair[2].trim().slice(0, 4000),
          constant: false,
          order: entries.length + 1,
          enabled: true
        });
        if (entries.length >= MAX_ENTRIES) break;
      }
    }

    /* 还是没结构：按空行分块，一份长文档也能拆成一条条设定 */
    if (!entries.length) entries = blocksToEntries(raw);

    /* 整段都没有结构时，作为常驻背景条目 */
    if (!entries.length && clean(text, 40000)) {
      entries.push({
        id: S.uid("e"),
        title: "背景设定",
        keys: [],
        content: clean(text, 4000),
        constant: true,
        order: 1,
        enabled: true
      });
    }

    return {
      name: fileStem(filename) || "世界书",
      entries: entries,
      source: String(filename || "粘贴文本").slice(0, 40)
    };
  }

  /* ---------- JSON → 人设书 ---------- */
  function cardFromObject(obj, source) {
    if (!obj || typeof obj !== "object") return null;
    var data = obj;
    var isSpec = obj.spec === "chara_card_v2" || obj.spec === "chara_card_v3" || obj.spec_version;
    if (isSpec && obj.data && typeof obj.data === "object") data = obj.data;

    var name = pick(data, ["name", "char_name", "character_name", "charName", "persona_name"]);
    var desc = pick(data, ["description", "char_persona", "persona_description", "char_description"]);
    var personality = pick(data, ["personality", "char_personality"]);
    var scenario = pick(data, ["scenario", "char_scenario"]);
    var greeting = pick(data, ["first_mes", "greeting", "char_greeting"]);
    var example = pick(data, ["mes_example", "example_dialogue", "char_mes_example"]);
    var extra = pick(data, ["system_prompt", "post_history_instructions"]);
    var tagline = pick(data, ["tagline", "title"]);

    if (data.depth_prompt && typeof data.depth_prompt === "object") {
      var depthText = clean(data.depth_prompt.content, 400);
      if (depthText) extra = (extra ? extra + "\n" : "") + depthText;
    }

    var fields = [];
    if (desc) fields.push({ k: "设定", v: clean(desc, 1600) });
    if (personality) fields.push({ k: "性格", v: clean(personality, 1200) });
    if (scenario) fields.push({ k: "场景", v: clean(scenario, 800) });
    if (!fields.length) {
      /* 只有自由文本时按纯文本规则再拆一次 */
      fields = textToFields(clean(desc || personality || name, 12000));
    }

    if (!name && !fields.length) return null;

    return {
      name: (name || fileStem(source) || "未命名人设").slice(0, 24),
      tagline: clean(tagline, 60),
      fields: fields.slice(0, MAX_FIELDS),
      greeting: clean(greeting, 800),
      example: clean(example, 1600),
      extra: clean(extra, 800),
      source: String(source || "粘贴文本").slice(0, 40)
    };
  }

  /* ---------- JSON → 世界书 ---------- */
  var BOOK_HOST_KEYS = [
    "worldbook", "worldBook", "world_book", "worldInfo", "world_info",
    "lorebook", "loreBook", "lore_book", "character_book", "characterBook",
    "data", "book", "result"
  ];

  function hasEntries(obj) {
    if (!obj || typeof obj !== "object") return false;
    return !!(obj.entries || obj.entryList || obj.lorebook || obj.worldEntries);
  }

  function findEntryHost(obj, depth) {
    if (!obj || typeof obj !== "object" || depth > 3) return null;
    if (hasEntries(obj)) return obj;
    var list = Array.isArray(obj) ? obj : BOOK_HOST_KEYS;
    for (var i = 0; i < list.length; i += 1) {
      var child = obj[list[i]];
      if (child && typeof child === "object") {
        var hit = findEntryHost(child, depth + 1);
        if (hit) return hit;
      }
    }
    return null;
  }

  function bookFromObject(obj, source) {
    if (!obj || typeof obj !== "object") return null;
    var host = findEntryHost(obj, 0);
    if (!host) return null;

    var name =
      pick(host, ["name", "comment", "title"]) ||
      pick(obj, ["name", "book_name", "world_book_name", "character_name", "comment"]) ||
      fileStem(source) ||
      "世界书";

    return {
      name: String(name).trim().slice(0, 30) || "世界书",
      entries: host.entries || host.entryList || host.lorebook || host.worldEntries,
      source: String(source || "粘贴文本").slice(0, 40)
    };
  }

  /* ---------- PNG 内嵌角色卡 ---------- */
  function pngChunks(buf) {
    var u8 = new Uint8Array(buf);
    var sig = [137, 80, 78, 71, 13, 10, 26, 10];
    for (var i = 0; i < 8; i += 1) if (u8[i] !== sig[i]) return null;

    var chunks = [];
    var p = 8;
    while (p + 8 <= u8.length) {
      var len = ((u8[p] << 24) >>> 0) + (u8[p + 1] << 16) + (u8[p + 2] << 8) + u8[p + 3];
      var type = String.fromCharCode(u8[p + 4], u8[p + 5], u8[p + 6], u8[p + 7]);
      if (!(len >= 0) || p + 12 + len > u8.length) break;
      chunks.push({ type: type, data: u8.subarray(p + 8, p + 8 + len) });
      p += 12 + len;
      if (type === "IEND") break;
    }
    return chunks;
  }

  function charaFromPng(buf, filename) {
    var chunks = pngChunks(buf);
    if (!chunks) return fail("这不是一个可解析的 PNG 角色卡");

    var wanted = ["chara", "ccv2", "chara_card_v2"];
    for (var i = 0; i < chunks.length; i += 1) {
      if (chunks[i].type !== "tEXt" && chunks[i].type !== "iTXt") continue;
      var data = chunks[i].data;
      var zero = data.indexOf(0);
      if (zero < 0) continue;
      var keyword = latin1(data.subarray(0, zero)).toLowerCase();
      if (wanted.indexOf(keyword) === -1) continue;
      var text = b64ToText(latin1(data.subarray(zero + 1)).replace(/^base64:/i, ""));
      if (!text) continue;
      return parseJsonText(text, filename);
    }
    return fail("这张 PNG 里没有内嵌角色卡，试试它的 .json 版本");
  }

  /* ---------- 统一入口：文本 / JSON ---------- */
  function parseJsonText(text, filename) {
    var data = null;
    try {
      data = JSON.parse(String(text || ""));
    } catch (err) {
      return fail("JSON 解析失败，检查是否被截断或带了注释");
    }

    var card = null;
    var book = null;
    try {
      card = S.normalize.card(cardFromObject(data, filename));
    } catch (err) {
      card = null;
    }
    try {
      book = S.normalize.book(bookFromObject(data, filename));
    } catch (err) {
      book = null;
    }

    if (!card && !book) return fail("这个 JSON 里既没有人设字段，也没有世界书条目");

    var message = "";
    if (card && book) message = "同时带入 " + book.entries.length + " 条内嵌世界书";
    return {
      ok: true,
      kind: card ? "card" : "book",
      card: card,
      book: book,
      message: message
    };
  }

  function parseText(text, filename, expect) {
    var body = stripBom(String(text || ""));
    if (!body.trim()) return fail("文件是空的");

    var head = body.replace(/^\s+/, "").slice(0, 1);
    if (head === "{" || head === "[") return parseJsonText(body, filename);

    var N = S.normalize;
    if (expect === "book") {
      var book = N.book(textToBook(body, filename));
      if (!book) return fail("这份文本里没拆出世界书条目");
      return { ok: true, kind: "book", card: null, book: book, message: "" };
    }

    var card = N.card(textToCard(body, filename));
    if (!card) return fail("这份文本太短，没认出人设内容");
    return { ok: true, kind: "card", card: card, book: null, message: "" };
  }

  /* ---------- 学习状态 ---------- */
  function state() {
    var p = S.store && S.store.persona;
    if (!p || typeof p !== "object") p = { card: null, books: [] };
    if (!Array.isArray(p.books)) p.books = [];
    if (!Number(p.budget)) p.budget = 1200;
    /* 旧存档里就算存了异常大的值，读出来也一律钳回 300 – 20000 */
    p.budget = S.clamp(Math.round(Number(p.budget)) || 1200, BUDGET_MIN, BUDGET_MAX);
    return p;
  }

  function card() {
    var c = state().card;
    return c && c.enabled !== false ? c : null;
  }

  function escRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  var LATIN_RE = /^[a-z0-9][a-z0-9 .'+#-]*$/i;

  /* 拉丁关键词按整词匹配，中文关键词按包含匹配 */
  function hitKey(key, lower) {
    var k = String(key || "").trim().toLowerCase();
    if (!k) return false;
    if (LATIN_RE.test(k)) {
      try {
        return new RegExp("(^|[^a-z0-9])" + escRe(k) + "([^a-z0-9]|$)", "i").test(lower);
      } catch (err) {
        return lower.indexOf(k) !== -1;
      }
    }
    return lower.indexOf(k) !== -1;
  }

  function eachEntry(fn) {
    var books = state().books;
    for (var i = 0; i < books.length; i += 1) {
      var book = books[i];
      if (!book || book.enabled === false || !Array.isArray(book.entries)) continue;
      for (var j = 0; j < book.entries.length; j += 1) {
        var entry = book.entries[j];
        if (!entry || entry.enabled === false || !String(entry.content || "").trim()) continue;
        if (fn(book, entry) === false) return;
      }
    }
  }

  /* ---------- 召回：常驻条目 + 关键词命中，按相关度排序并受字符预算限制 ---------- */
  function recall(text, budget) {
    var body = String(text || "").toLowerCase();
    var limit = Number(budget);
    if (!(limit > 0)) limit = Number(state().budget) || 1200;

    var hits = [];
    eachEntry(function (book, entry) {
      var keys = Array.isArray(entry.keys) ? entry.keys : [];
      var secondary = Array.isArray(entry.secondary) ? entry.secondary : [];
      var matched = [];
      var secHit = [];
      var i;
      for (i = 0; i < keys.length; i += 1) if (hitKey(keys[i], body)) matched.push(keys[i]);
      for (i = 0; i < secondary.length; i += 1) if (hitKey(secondary[i], body)) secHit.push(secondary[i]);

      var constant = !!entry.constant;
      var selective = !!entry.selective && secondary.length > 0;
      if (!constant && !(matched.length && (!selective || secHit.length))) return;

      var weight = 0;
      var all = matched.concat(secHit);
      for (i = 0; i < all.length; i += 1) weight += Math.min(8, String(all[i]).length);

      hits.push({
        book: book,
        entry: entry,
        keys: all,
        constant: constant,
        score: (constant ? 6 : 30) + weight + (secHit.length ? 4 : 0) - Number(entry.order || 100) / 1000,
        chars: String(entry.content || "").length
      });
    });

    hits.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return Number(a.entry.order || 100) - Number(b.entry.order || 100);
    });

    var used = 0;
    var picked = [];
    for (var i = 0; i < hits.length; i += 1) {
      if (picked.length && used + hits[i].chars > limit) break;
      used += hits[i].chars;
      picked.push(hits[i]);
    }

    return { items: picked, used: used, matched: hits.length, budget: limit };
  }

  /* ---------- 人设书常驻段 ---------- */
  function cardBlock() {
    var c = card();
    if (!c) return "";
    var lines = ["【人设书 · " + c.name + "】"];
    if (c.tagline) lines.push("一句话：" + c.tagline);
    (Array.isArray(c.fields) ? c.fields : []).forEach(function (f) {
      if (f && f.v) lines.push(f.k + "：" + String(f.v).replace(/\n+/g, " "));
    });
    if (c.extra) lines.push("额外要求：" + String(c.extra).replace(/\n+/g, " "));
    if (c.greeting) lines.push("开场口吻参考（只学语气，不要照抄）：" + String(c.greeting).slice(0, 200));
    if (c.example) lines.push("对话样例（只学说话方式，不要复述内容）：" + String(c.example).replace(/\n+/g, " ").slice(0, 320));
    return lines.join("\n");
  }

  /* ---------- 世界书命中段 ---------- */
  function loreBlock(found) {
    var got = found || recall("");
    var items = got.items.filter(function (h) {
      return h.keys.length || h.constant;
    });
    if (!items.length) return "";
    var lines = ["【世界书 · 你已学会并在此刻想起】"];
    items.forEach(function (h) {
      var why = h.constant ? "常驻" : h.keys.join("、");
      lines.push("· " + (h.entry.title || "设定") + "（" + why + "）：" + String(h.entry.content).replace(/\n+/g, " "));
    });
    return lines.join("\n");
  }

  /* 注入用的完整设定段；没有任何导入时返回空串 */
  function digest(text) {
    var head = cardBlock();
    var found = recall(text);
    var lore = loreBlock(found);
    if (!head && !lore) return "";
    var parts = ["你已读过并完全记住了下面这些设定，把它们当成你自己的经历与常识，自然地用出来，不要照抄原文，也不要提到「设定」「人设书」「世界书」这些词。"];
    if (head) parts.push(head);
    if (lore) parts.push(lore);
    return parts.join("\n");
  }

  /* 主动开口等短提示只需要人设摘要，避免挤占长度 */
  function brief() {
    var c = card();
    if (!c) return "";
    var bits = [c.name];
    var fields = Array.isArray(c.fields) ? c.fields : [];
    for (var i = 0; i < fields.length && bits.length < 4; i += 1) {
      if (fields[i] && fields[i].v) bits.push(String(fields[i].v).replace(/\n+/g, " ").slice(0, 40));
    }
    return "（人设书摘要：" + bits.join(" · ") + "）";
  }

  /* ---------- 自测与统计 ---------- */
  function probe(text) {
    return recall(text, 999999);
  }

  function stats() {
    var st = state();
    var entries = 0;
    var active = 0;
    var chars = 0;
    var keyMap = {};
    var keyCount = 0;
    for (var i = 0; i < st.books.length; i += 1) {
      var book = st.books[i];
      if (!book || !Array.isArray(book.entries)) continue;
      for (var j = 0; j < book.entries.length; j += 1) {
        var e = book.entries[j];
        if (!e) continue;
        entries += 1;
        if (e.enabled === false || book.enabled === false) continue;
        active += 1;
        chars += String(e.content || "").length;
        var keys = Array.isArray(e.keys) ? e.keys : [];
        for (var k = 0; k < keys.length; k += 1) {
          var low = String(keys[k]).toLowerCase();
          if (!low || keyMap[low]) continue;
          keyMap[low] = 1;
          keyCount += 1;
        }
      }
    }
    var fields = st.card && Array.isArray(st.card.fields) ? st.card.fields.length : 0;
    return {
      hasCard: !!st.card,
      cardOn: !!card(),
      cardName: st.card ? st.card.name : "",
      fields: fields,
      books: st.books.length,
      entries: entries,
      activeEntries: active,
      keys: keyCount,
      chars: chars,
      budget: Number(st.budget) || 1200
    };
  }

  /* 伴侣真正学到的关键词，按长度倒序取前几个做展示 */
  function keywords(limit) {
    var out = [];
    var seen = {};
    eachEntry(function (book, entry) {
      var keys = Array.isArray(entry.keys) ? entry.keys : [];
      for (var i = 0; i < keys.length; i += 1) {
        var key = String(keys[i] || "").trim();
        var low = key.toLowerCase();
        if (!key || seen[low]) continue;
        seen[low] = 1;
        out.push(key);
      }
    });
    out.sort(function (a, b) {
      return b.length - a.length || (a < b ? -1 : 1);
    });
    return out.slice(0, limit || 18);
  }

  /* ---------- 自动识别：纯文本像世界书就按世界书拆 ---------- */
  function looksLikeLore(text) {
    var raw = String(text || "").split("\n");
    var total = 0;
    var lore = 0;
    var listy = 0;
    var blocks = 0;
    var inBlock = false;
    for (var i = 0; i < raw.length; i += 1) {
      var line = raw[i].trim();
      if (!line) {
        inBlock = false;
        continue;
      }
      if (!inBlock) {
        blocks += 1;
        inBlock = true;
      }
      total += 1;
      if (LORE_LINE_RE.test(line) || HEAD_RE.test(line) || /^【[^】]{1,40}】$/.test(line)) lore += 1;
      if (LIST_MARK_RE.test(line)) listy += 1;
    }
    if (total >= 3 && lore / total >= 0.5) return true;
    return blocks >= 4 && total >= 8 && listy / total >= 0.25;
  }

  /* 带「姓名 / 性格 / 开场」这类人设字段名的，先当人设书 */
  var CARD_HINT_RE = /(?:^|\n)\s*(?:#{1,5}\s*)?(?:姓\s*名|角\s*色\s*名|角\s*色\s*设\s*定|角\s*色\s*卡|角\s*色\s*性\s*格|角\s*色\s*故\s*事|角\s*色\s*经\s*历|角\s*色\s*经\s*验|人\s*设|性\s*格|外貌|说话风格|开场白|开场|人物设定|角色设定|基\s*本\s*信\s*息|人\s*物\s*简\s*介|角\s*色\s*简\s*介|角\s*色\s*介\s*绍|性\s*格\s*特\s*点|外\s*貌\s*描\s*述|Character|Personality|Description|Greeting)\s*[:：]/;

  function looksLikeCard(text) {
    return CARD_HINT_RE.test(String(text || ""));
  }

  function parseAuto(text, filename) {
    var body = stripBom(String(text || ""));
    if (!body.trim()) return fail("内容是空的");
    var head = body.replace(/^\s+/, "").slice(0, 1);
    if (head === "{" || head === "[") return parseJsonText(body, filename);
    var asBook = !looksLikeCard(body) && looksLikeLore(body);
    return parseText(body, filename, asBook ? "book" : "card");
  }

  function parseAny(text, filename, expect) {
    if (!expect || expect === "auto") return parseAuto(text, filename);
    return parseText(text, filename, expect);
  }

  /* ---------- 文件与粘贴导入 ---------- */
  function parseFile(file, expect) {
    var name = String((file && file.name) || "");
    if (!name) return Promise.resolve(fail("没拿到文件，重新选一次"));
    if (typeof file.size === "number" && file.size > MAX_BIN) return Promise.resolve(fail("文件超过 8MB，先精简再导入"));

    return readBuffer(file)
      .then(function (buf) {
        if (/\.png$/i.test(name)) {
          var pngRes = charaFromPng(buf, name);
          if (pngRes && pngRes.ok) pngRes.format = "PNG 内嵌卡";
          return pngRes;
        }

        var docs = global.COS && global.COS.docs;
        if (docs && docs.decode) {
          return docs.decode(file, buf).then(function (r) {
            if (!r || !r.ok) return fail((r && r.message) || "这个文件读不出内容");
            if (r.text.length > MAX_TEXT) return fail("文本太长，取其中核心部分再导入");
            var res = parseAny(r.text, name, expect);
            if (res && res.ok && r.label) {
              res.format = String(r.label).slice(0, 16);
              var note = "从" + r.label + "里读了 " + r.chars + " 字";
              res.message = res.message ? res.message + " · " + note : note;
            }
            return res;
          });
        }

        var text = stripBom(decodeBuffer(buf));
        if (!text.trim()) return fail("文件是空的");
        if (text.length > MAX_TEXT) return fail("文本太长，取此中核心部分再导入");
        return parseAny(text, name, expect);
      })
      .catch(function () {
        return fail("读不出这个文件，换成本机的 .json / .txt / .md / .docx / .pdf 再试");
      });
  }

  function parsePaste(text, expect) {
    var body = stripBom(String(text || ""));
    if (!body.trim()) return fail("先粘一段内容进来");
    return parseAny(body, "粘贴文本", expect);
  }

  /* ---------- 写入本地存储 ---------- */
  function adopt(result) {
    var out = { card: false, book: false, message: "" };
    if (!result || !result.ok) return out;
    var st = state();

    if (result.card) {
      st.card = S.normalize.card(Object.assign({}, result.card, { importedAt: Date.now() }));
      out.card = !!st.card;
      if (out.card && result.format) st.card.format = String(result.format).slice(0, 16);
      if (out.card) {
        out.message = "人设书《" + st.card.name + "》已常驻生效" +
          (st.card.format ? " · 来自 " + st.card.format : "");
      }
    }

    if (result.book) {
      var book = S.normalize.book(Object.assign({}, result.book, { importedAt: Date.now() }));
      if (book) {
        if (result.format) book.format = String(result.format).slice(0, 16);
        var same = null;
        for (var i = 0; i < st.books.length; i += 1) {
          if (st.books[i] && st.books[i].name === book.name) same = st.books[i];
        }
        if (same) {
          book.id = same.id;
          st.books[st.books.indexOf(same)] = book;
        } else {
          st.books.unshift(book);
        }
        if (st.books.length > 8) st.books.length = 8;
        out.book = true;
        out.message = "世界书《" + book.name + "》已学会 " + book.entries.length + " 条" +
          (book.format ? " · 来自 " + book.format : "");
      }
    }

    if (!out.card && !out.book) out.message = "没认出可用内容";
    S.save();
    return out;
  }

  function findBook(id) {
    var books = state().books;
    for (var i = 0; i < books.length; i += 1) {
      if (books[i] && books[i].id === id) return books[i];
    }
    return null;
  }

  function dropCard() {
    state().card = null;
    S.save();
  }

  function dropBook(id) {
    var st = state();
    st.books = st.books.filter(function (b) {
      return b && b.id !== id;
    });
    S.save();
  }

  function toggleCard() {
    var st = state();
    if (!st.card) return false;
    st.card.enabled = st.card.enabled === false;
    S.save();
    return st.card.enabled;
  }

  function toggleBook(id) {
    var book = findBook(id);
    if (!book) return false;
    book.enabled = book.enabled === false;
    S.save();
    return book.enabled;
  }

  /* 删掉单条设定；一本书被删空时连书一起清掉，不留空壳 */
  function dropEntry(bookId, entryId) {
    var book = findBook(bookId);
    if (!book) return false;
    book.entries = book.entries.filter(function (e) {
      return e && e.id !== entryId;
    });
    if (!book.entries.length) {
      dropBook(bookId);
    } else {
      S.save();
    }
    return true;
  }

  function toggleEntry(bookId, entryId) {
    var book = findBook(bookId);
    if (!book) return false;
    for (var i = 0; i < book.entries.length; i += 1) {
      if (book.entries[i].id === entryId) {
        book.entries[i].enabled = book.entries[i].enabled === false;
        S.save();
        return book.entries[i].enabled;
      }
    }
    return false;
  }

  function setBudget(n) {
    var value = Math.round(Number(n));
    if (!(value > 0)) value = 1200;
    state().budget = S.clamp(value, BUDGET_MIN, BUDGET_MAX);
    S.save();
    return state().budget;
  }

  /* 把角色名变成伴侣名字，锁屏与对话同步 */
  function useCardName() {
    var c = state().card;
    if (!c || !c.name) return "";
    S.store.companion.name = String(c.name).slice(0, 8);
    S.save();
    return S.store.companion.name;
  }

  global.COS.persona = {
    parseFile: parseFile,
    parsePaste: parsePaste,
    adopt: adopt,
    dropCard: dropCard,
    dropBook: dropBook,
    toggleCard: toggleCard,
    toggleBook: toggleBook,
    toggleEntry: toggleEntry,
    dropEntry: dropEntry,
    setBudget: setBudget,
    useCardName: useCardName,
    state: state,
    card: card,
    stats: stats,
    keywords: keywords,
    recall: recall,
    probe: probe,
    digest: digest,
    brief: brief,
    cardBlock: cardBlock,
    loreBlock: loreBlock
  };
})(window);