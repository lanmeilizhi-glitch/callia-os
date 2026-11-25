/* ===================================================================
   Callia OS · docs.js
   文档格式解码层：把各种文档先转成「纯文本」或「标准世界书 JSON」，
   再交给 persona.js 的既有解析器。本层不认识人设，只负责把字节变成字。

   文本类：txt / md / markdown / text / log / json / jsonl / ndjson /
           csv / tsv / yaml / yml / ini / toml / properties / conf /
           html / htm / xml / srt / vtt / rtf
   压缩类：docx / odt / epub / zip / charx（需要 DecompressionStream）
   文档类：pdf（文字版尽力抽取，扫描件会明确失败）

   规则：任何失败都返回中文 message，不抛异常；不依赖任何外部库或网络。
   =================================================================== */
(function (global) {
  "use strict";

  var MAX_OUT = 300000;
  var MAX_ROWS = 400;
  var MAX_BYTES = 4 * 1024 * 1024;

  /* ---------- 结果包装 ---------- */
  function bad(message) {
    return { ok: false, text: "", format: "", label: "", chars: 0, message: message };
  }

  function pack(text, format, label, note) {
    return {
      ok: true,
      text: text,
      format: format,
      label: label,
      chars: text.length,
      message: note || ""
    };
  }

  function done(text, format, label, note) {
    var body = tidy(text);
    if (!body) return bad(label + "里没读出文字内容");
    if (body.length > MAX_OUT) body = body.slice(0, MAX_OUT);
    return pack(body, format, label, note);
  }

  function doneJson(obj, format, label, note) {
    var body = "";
    try {
      body = JSON.stringify(obj);
    } catch (err) {
      return bad(label + "转成设定失败，换成本地 .txt 再传");
    }
    if (!body || body.length > MAX_OUT) return bad(label + "内容太多，先拆成几份再传");
    return pack(body, format, label, note);
  }

  /* ---------- 基础工具 ---------- */
  function tidy(text) {
    return String(text === null || text === undefined ? "" : text)
      .replace(/\r\n?/g, "\n")
      .replace(/\u0000/g, "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim();
  }

  function latin1(bytes) {
    var out = "";
    var end = Math.min(bytes.length, MAX_BYTES);
    for (var i = 0; i < end; i += 1) out += String.fromCharCode(bytes[i]);
    return out;
  }

  /* 优先 UTF-8，失败退 GBK，最后按单字节读，保证不崩 */
  function decodeBytes(u8) {
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
    return latin1(u8);
  }

  function stem(name) {
    return String(name || "")
      .replace(/^.*[\\/]/, "")
      .replace(/\.[^.]+$/, "")
      .trim()
      .slice(0, 30);
  }

  var ENTITIES = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    middot: "·", mdash: "—", ndash: "–", hellip: "…", deg: "°",
    ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", copy: "©", times: "×"
  };

  function decodeEntities(src) {
    return String(src).replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|[a-zA-Z][a-zA-Z0-9]{1,7});/g,
      function (all, body) {
        if (body.charAt(0) === "#") {
          var code = body.charAt(1) === "x" || body.charAt(1) === "X"
            ? parseInt(body.slice(2), 16)
            : parseInt(body.slice(1), 10);
          if (!(code > 0) || code > 0x10ffff) return "";
          try {
            return String.fromCodePoint(code);
          } catch (err) {
            return "";
          }
        }
        var hit = ENTITIES[body.toLowerCase()];
        return hit === undefined ? all : hit;
      });
  }

  var KEY_SPLIT = /[,，、/|·;；]+/;

  function keysFrom(title) {
    var parts = String(title || "").split(KEY_SPLIT);
    var out = [];
    for (var i = 0; i < parts.length; i += 1) {
      var key = parts[i].trim();
      if (key && key.length <= 40) out.push(key);
    }
    return out.slice(0, 24);
  }

  function entryShape(title, content, index) {
    var keys = keysFrom(title);
    return {
      title: String(title || "").trim().slice(0, 40),
      keys: keys,
      content: String(content || "").trim().slice(0, 4000),
      constant: !keys.length,
      order: index + 1,
      enabled: true
    };
  }

  /* 逐条累加，超限就停，避免 JSON 被截断成非法串 */
  function packEntries(name, items) {
    var kept = [];
    var size = 48;
    for (var i = 0; i < items.length && kept.length < MAX_ROWS; i += 1) {
      var chunk = 0;
      try {
        chunk = JSON.stringify(items[i]).length + 2;
      } catch (err) {
        continue;
      }
      if (size + chunk > MAX_OUT) break;
      size += chunk;
      kept.push(items[i]);
    }
    return kept;
  }

  /* ---------- 纯文本 / Markdown / JSON ---------- */
  function plainText(u8, name, label) {
    return done(decodeBytes(u8), "text", label || "纯文本", "");
  }

  function jsonText(u8, name) {
    return done(decodeBytes(u8), "json", "JSON", "");
  }

  /* JSONL / NDJSON：一行一条，转成标准世界书结构 */
  function jsonlText(u8, name) {
    var lines = tidy(decodeBytes(u8)).split("\n");
    var items = [];
    for (var i = 0; i < lines.length; i += 1) {
      var line = lines[i].trim();
      if (!line) continue;
      var obj = null;
      try {
        obj = JSON.parse(line);
      } catch (err) {
        continue;
      }
      if (typeof obj === "string") {
        if (obj.trim()) items.push({ content: obj.trim() });
      } else if (obj && typeof obj === "object") {
        items.push(obj);
      }
      if (items.length >= MAX_ROWS) break;
    }
    if (!items.length) return bad("这份 JSONL 里没有一行能解析成 JSON");
    return doneJson({ name: stem(name) || "世界书", entries: packEntries(stem(name), items) },
      "jsonl", "JSONL 逐行", "");
  }

  /* ---------- 表格：CSV / TSV ---------- */
  var COL_TITLE = ["标题", "名称", "名字", "条目", "关键词", "触发词", "标签",
    "title", "name", "comment", "keys", "key", "keyword", "trigger", "tag"];
  var COL_BODY = ["内容", "正文", "描述", "设定", "说明", "介绍", "备注",
    "content", "text", "value", "desc", "description", "detail", "entry"];

  function splitRows(text, delim) {
    var rows = [];
    var row = [];
    var cell = "";
    var quoted = false;
    for (var i = 0; i < text.length; i += 1) {
      var c = text.charAt(i);
      if (quoted) {
        if (c === '"') {
          if (text.charAt(i + 1) === '"') {
            cell += '"';
            i += 1;
          } else {
            quoted = false;
          }
        } else {
          cell += c;
        }
        continue;
      }
      if (c === '"') { quoted = true; continue; }
      if (c === delim) { row.push(cell); cell = ""; continue; }
      if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
      if (c === "\r") continue;
      cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function colIndex(head, names) {
    for (var n = 0; n < names.length; n += 1) {
      for (var i = 0; i < head.length; i += 1) {
        var cell = String(head[i] || "").trim().toLowerCase();
        if (cell && cell === String(names[n]).toLowerCase()) return i;
      }
    }
    return -1;
  }

  function tableText(u8, name, delim, label) {
    var rows = splitRows(decodeBytes(u8), delim).filter(function (row) {
      for (var i = 0; i < row.length; i += 1) if (String(row[i]).trim()) return true;
      return false;
    });
    if (rows.length < 2) return plainText(u8, name, label);

    var head = rows[0];
    var ti = colIndex(head, COL_TITLE);
    var bi = colIndex(head, COL_BODY);
    var hasHead = ti >= 0 || bi >= 0;
    if (!hasHead) { ti = 0; bi = 1; }
    if (bi < 0 || bi === ti) bi = ti === 0 ? 1 : 0;
    if (ti < 0) ti = 0;

    var body = hasHead ? rows.slice(1) : rows;
    var items = [];
    for (var i = 0; i < body.length; i += 1) {
      var row = body[i];
      var title = String(row[ti] === undefined ? "" : row[ti]).trim();
      var rest = [];
      for (var j = 0; j < row.length; j += 1) {
        if (j === ti) continue;
        var cell = String(row[j] === undefined ? "" : row[j]).trim();
        if (cell) rest.push(cell);
      }
      var content = String(row[bi] === undefined ? "" : row[bi]).trim();
      if (!content) content = rest.join("；");
      if (content.length < 2) continue;
      items.push(entryShape(title, content, items.length));
      if (items.length >= MAX_ROWS) break;
    }

    if (items.length < 2) return plainText(u8, name, label);
    return doneJson({ name: stem(name) || "世界书", entries: packEntries(stem(name), items) },
      "table", label, "按表格拆成 " + items.length + " 条");
  }

  /* ---------- YAML / YML ---------- */
  var YAML_HEAD_RE = /^([^:：#]{1,60})[:：]\s*(.*)$/;

  function stripComment(line) {
    var out = "";
    var quote = "";
    for (var i = 0; i < line.length; i += 1) {
      var c = line.charAt(i);
      if (quote) {
        out += c;
        if (c === quote) quote = "";
        continue;
      }
      if (c === '"' || c === "'") { quote = c; out += c; continue; }
      if (c === "#" && (i === 0 || /\s/.test(line.charAt(i - 1)))) break;
      out += c;
    }
    return out.replace(/\s+$/, "");
  }

  function yamlToLines(src) {
    var raw = String(src || "").split(/\r?\n/);
    var lines = [];
    for (var i = 0; i < raw.length; i += 1) {
      var text = raw[i].replace(/\t/g, "  ");
      var trimmed = text.trim();
      if (!trimmed || trimmed === "---" || trimmed === "...") continue;
      if (trimmed.charAt(0) === "#") continue;
      text = stripComment(text);
      if (!text.trim()) continue;
      var indent = text.length - text.replace(/^ +/, "").length;
      var body = text.trim();
      var isList = body === "-" || body.charAt(0) === "-";
      if (isList) body = body.replace(/^-\s*/, "").trim();
      var pair = YAML_HEAD_RE.exec(body);
      lines.push({
        indent: indent,
        list: isList,
        key: pair ? pair[1].trim() : "",
        value: pair ? pair[2].trim().replace(/^["']|["']$/g, "") : (isList ? body : "")
      });
    }
    return lines;
  }

  function yamlToText(u8, name) {
    var lines = yamlToLines(decodeBytes(u8));
    if (!lines.length) return bad("这份 YAML 里没读到内容");

    /* 顶层列表 + 每项是键值对 → 当成世界书条目 */
    var base = -1;
    var i;
    for (i = 0; i < lines.length; i += 1) {
      if (lines[i].list) { base = lines[i].indent; break; }
    }
    if (base >= 0) {
      var items = [];
      var current = null;
      for (i = 0; i < lines.length; i += 1) {
        var ln = lines[i];
        if (ln.list && ln.indent === base) {
          if (current && current.content) items.push(current);
          current = { title: "", keys: [], content: "", constant: false, order: items.length + 1, enabled: true };
          if (ln.key) { current.title = ln.value; }
          else if (ln.value) current.content = ln.value;
          continue;
        }
        if (!current) continue;
        if (!ln.key) {
          if (ln.value) current.content += (current.content ? "\n" : "") + ln.value;
          continue;
        }
        var low = ln.key.toLowerCase();
        if (/title|name|comment|标题|名称|名字/.test(low)) current.title = ln.value;
        else if (/keys?|keyword|trigger|关键词|触发/.test(low)) current.keys = keysFrom(ln.value);
        else if (/content|text|value|desc|内容|正文|描述|设定/.test(low)) {
          current.content = ln.value;
        } else if (ln.value) {
          current.content += (current.content ? "\n" : "") + ln.key + "：" + ln.value;
        }
      }
      if (current && current.content) items.push(current);
      items = items.filter(function (e) {
        return e.content && e.content.length > 1;
      });
      if (items.length >= 2) {
        for (i = 0; i < items.length; i += 1) {
          if (!items[i].keys.length) items[i].keys = keysFrom(items[i].title);
          items[i].constant = !items[i].keys.length;
          items[i].order = i + 1;
        }
        return doneJson({ name: stem(name) || "世界书", entries: packEntries(stem(name), items) },
          "yaml", "YAML", "按列表拆成 " + items.length + " 条");
      }
    }

    /* 否则摊平成「标题 + 键：值」文本，交给人格层分节 */
    var out = [];
    for (i = 0; i < lines.length; i += 1) {
      var line = lines[i];
      if (line.list) {
        out.push("· " + (line.key ? line.key + "：" + line.value : line.value));
        continue;
      }
      if (!line.key) {
        if (line.value) out.push(line.value);
        continue;
      }
      if (line.value) out.push(line.key + "：" + line.value);
      else out.push((line.indent >= 2 ? "### " : "## ") + line.key);
    }
    return done(out.join("\n"), "yaml", "YAML", "");
  }

  /* ---------- INI / TOML / properties ---------- */
  function iniToText(u8, name) {
    var raw = decodeBytes(u8).split(/\r?\n/);
    var out = [];
    for (var i = 0; i < raw.length; i += 1) {
      var line = raw[i].trim();
      if (!line || /^[;#]/.test(line) || line === "---") continue;
      var section = /^\[\s*([^\]]+?)\s*\]$/.exec(line);
      if (section) {
        out.push("");
        out.push("## " + section[1]);
        continue;
      }
      var pair = /^([^=：:]{1,60})[=:：]\s*(.*)$/.exec(line);
      if (pair) {
        var value = pair[2].replace(/^["']|["']$/g, "").trim();
        out.push(pair[1].trim() + "：" + value);
        continue;
      }
      out.push(line);
    }
    return done(out.join("\n"), "ini", "配置文件", "");
  }

  /* ---------- 字幕 SRT / VTT ---------- */
  function subsToText(u8, name) {
    var raw = decodeBytes(u8).split(/\r?\n/);
    var out = [];
    var last = "";
    for (var i = 0; i < raw.length; i += 1) {
      var line = raw[i].replace(/^\uFEFF/, "").trim();
      if (!line || /^WEBVTT/i.test(line) || /^NOTE\b/.test(line)) continue;
      if (/^\d+$/.test(line)) continue;
      if (/-->\s/.test(line)) continue;
      var text = decodeEntities(line.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
      if (!text || text === last) continue;
      out.push(text);
      last = text;
    }
    return done(out.join("\n"), "subs", "字幕", "");
  }

  /* ---------- HTML / XML ---------- */
  function htmlToRaw(u8) {
    var s = String(decodeBytes(u8));
    s = s.replace(/<!--[\s\S]*?-->/g, " ");
    s = s.replace(/<script[\s\S]*?<\/script\s*>/gi, " ");
    s = s.replace(/<style[\s\S]*?<\/style\s*>/gi, " ");
    s = s.replace(/<noscript[\s\S]*?<\/noscript\s*>/gi, " ");
    s = s.replace(/<h([1-6])[^>]*>/gi, function (all, n) {
      return "\n\n" + new Array(Math.min(6, Number(n)) + 2).join("#") + " ";
    });
    s = s.replace(/<(br|hr)\s*\/?>/gi, "\n");
    s = s.replace(/<\/(p|div|li|tr|section|article|blockquote|table|ul|ol|header|footer|dd|dt)\s*>/gi, "\n");
    s = s.replace(/<li[^>]*>/gi, "\n· ");
    s = s.replace(/<\/(td|th)\s*>/gi, "　");
    s = s.replace(/<[^>]+>/g, "");
    s = decodeEntities(s);
    return s;
  }

  function htmlToText(u8, name) {
    return done(htmlToRaw(u8), "html", "网页", "");
  }

  /* ---------- RTF ---------- */
  var RTF_SKIP_RE = /^\{\\\*|^\{\\(fonttbl|colortbl|stylesheet|info|generator|listtable|listoverridetable|filetbl|pntext|nonshppict|themedata|datastore|xmlnstbl)/;
  var RTF_WORD_RE = /^\\([A-Za-z]{1,32})(-?\d{1,8})? ?/;
  var RTF_BREAK = { par: 1, line: 1, sect: 1, page: 1, pard: 1, row: 1, cell: 1, nestcell: 1 };

  function rtfToText(u8, name) {
    var src = latin1(u8);
    var out = "";
    var pending = [];
    var i = 0;

    function flush() {
      if (!pending.length) return;
      out += decodeBytes(new Uint8Array(pending));
      pending = [];
    }

    while (i < src.length) {
      var ch = src.charAt(i);

      if (ch === "{") {
        if (RTF_SKIP_RE.test(src.substr(i, 40))) {
          var depth = 0;
          var j = i;
          while (j < src.length) {
            if (src.charAt(j) === "{") depth += 1;
            else if (src.charAt(j) === "}") {
              depth -= 1;
              if (!depth) break;
            }
            j += 1;
          }
          i = Math.min(j + 1, src.length);
          continue;
        }
        i += 1;
        continue;
      }

      if (ch === "}") { flush(); i += 1; continue; }

      if (ch === "\\") {
        var next = src.charAt(i + 1);
        if (next === "{" || next === "}" || next === "\\") {
          flush();
          out += next;
          i += 2;
          continue;
        }
        if (next === "'") {
          var byte = parseInt(src.substr(i + 2, 2), 16);
          if (isNaN(byte)) { i += 2; continue; }
          pending.push(byte);
          i += 4;
          continue;
        }
        var word = RTF_WORD_RE.exec(src.substr(i));
        if (!word) { i += 1; continue; }
        var name2 = word[1].toLowerCase();
        var num = word[2] === undefined ? 0 : Number(word[2]);
        i += word[0].length;

        if (name2 === "pict") {
          while (i + 3 < src.length && src.charAt(i) === "\\" && src.charAt(i + 1) === "'") i += 4;
          continue;
        }
        if (RTF_BREAK[name2]) { flush(); out += "\n"; continue; }
        if (name2 === "tab") { flush(); out += "\t"; continue; }
        if (name2 === "u") {
          flush();
          if (num < 0) num += 65536;
          try {
            out += String.fromCodePoint(num);
          } catch (err) {
            /* 非法码位直接跳过 */
          }
          continue;
        }
        continue;
      }

      if (ch === "\r" || ch === "\n") { i += 1; continue; }
      pending.push(ch.charCodeAt(0));
      i += 1;
    }
    flush();
    return done(out, "rtf", "RTF 文档", "");
  }

  /* ---------- ZIP 家族：docx / odt / epub / zip ---------- */
  function u16(u8, p) {
    return u8[p] | (u8[p + 1] << 8);
  }

  function u32(u8, p) {
    return (u8[p] | (u8[p + 1] << 8) | (u8[p + 2] << 16) | (u8[p + 3] << 24)) >>> 0;
  }

  function findEocd(u8) {
    var floor = Math.max(0, u8.length - 66000);
    for (var p = u8.length - 22; p >= floor; p -= 1) {
      if (u8[p] === 0x50 && u8[p + 1] === 0x4b && u8[p + 2] === 0x05 && u8[p + 3] === 0x06) return p;
    }
    return -1;
  }

  function zipEntries(u8) {
    var eocd = findEocd(u8);
    if (eocd < 0) return null;
    var count = u16(u8, eocd + 10);
    var p = u32(u8, eocd + 16);
    var list = [];
    for (var i = 0; i < count && p + 46 <= u8.length; i += 1) {
      if (u32(u8, p) !== 0x02014b50) break;
      var nameLen = u16(u8, p + 28);
      var extraLen = u16(u8, p + 30);
      var commentLen = u16(u8, p + 32);
      var rawName = u8.subarray(p + 46, p + 46 + nameLen);
      var name = (u16(u8, p + 8) & 0x800) ? decodeBytes(rawName) : latin1(rawName);
      list.push({
        name: name,
        method: u16(u8, p + 10),
        csize: u32(u8, p + 20),
        offset: u32(u8, p + 42)
      });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return list;
  }

  function zipData(u8, entry) {
    var p = entry.offset;
    if (p < 0 || p + 30 > u8.length || u32(u8, p) !== 0x04034b50) return null;
    var start = p + 30 + u16(u8, p + 26) + u16(u8, p + 28);
    var size = Math.min(entry.csize, u8.length - start);
    if (!(size > 0)) return null;
    return u8.subarray(start, start + size);
  }

  function inflateRaw(bytes) {
    if (!global.DecompressionStream || !global.Blob || !global.Response) {
      return Promise.reject(new Error("no-inflate"));
    }
    try {
      var stream = new global.Blob([bytes]).stream()
        .pipeThrough(new global.DecompressionStream("deflate-raw"));
      return new global.Response(stream).arrayBuffer().then(function (buf) {
        return new Uint8Array(buf);
      });
    } catch (err) {
      return Promise.reject(err);
    }
  }

  function readZip(u8, want) {
    var list = zipEntries(u8);
    if (!list || !list.length) return Promise.resolve(null);
    var files = {};
    var chain = Promise.resolve();
    list.forEach(function (entry) {
      if (!entry.name || /\/$/.test(entry.name) || !want(entry.name)) return;
      chain = chain.then(function () {
        var data = zipData(u8, entry);
        if (!data) return null;
        if (entry.method === 0) {
          files[entry.name] = data;
          return null;
        }
        if (entry.method !== 8) return null;
        return inflateRaw(data).then(function (bytes) {
          files[entry.name] = bytes;
        }, function () {
          return null;
        });
      });
    });
    return chain.then(function () {
      return files;
    });
  }

  var NO_INFLATE = "这台设备解不开压缩文档，先在原文档里另存为 .txt 或 .md 再传";

  var DOCX_STYLE_RE = /<w:pStyle\b[^>]*w:val="([^"]{1,28})"/i;
  var DOCX_LIST_RE = /<w:numPr\b|<w:pStyle\b[^>]*w:val="[^"]*(?:list|列表|项目符号|编号)/i;
  var DOCX_BOLD_RE = /<w:b\b(?![^>]*w:val="(?:0|false|off|none)")[^>]*\/>/i;
  var DOCX_CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

  /* 段落样式名 → 标题层级，让 Word 的章节重新变成可分节的 # 标题 */
  function docxHeadLevel(styleName) {
    var v = String(styleName || "").trim();
    if (!v) return 0;
    if (/^(?:title|subtitle|标题|副标题)$/i.test(v)) return 1;
    var hit = /(?:heading|标题|heading\s*)\s*([1-6]|[一二三四五六])/i.exec(v);
    if (hit) return DOCX_CN_NUM[hit[1]] || Number(hit[1]) || 0;
    if (/^[1-6]$/.test(v)) return Number(v);
    if (/^(?:heading|标题)$/i.test(v)) return 1;
    return 0;
  }

  function docxParaText(chunk) {
    var s = chunk;
    s = s.replace(/<w:tab\b[^>]*\/>/g, "\t");
    s = s.replace(/<w:(br|cr)\b[^>]*\/>/g, "\n");
    s = s.replace(/<\/w:tc>/g, "　");
    s = s.replace(/<[^>]+>/g, "");
    return decodeEntities(s).trim();
  }

  /* Word 里很多人只用「加粗」不用标题样式：整段加粗的短行当小标题 */
  function docxBoldLabel(text, chunk) {
    if (!text || text.length > 24) return false;
    if (/[。！？!?；;，,]/.test(text)) return false;
    return DOCX_BOLD_RE.test(chunk);
  }

  /* 一个段落 → 一行：标题变 #，列表项加「·」，整段加粗的短行变小标题 */
  function docxParaLine(chunk) {
    var text = docxParaText(chunk);
    if (!text) return "";
    var style = DOCX_STYLE_RE.exec(chunk);
    var level = style ? docxHeadLevel(style[1]) : 0;
    if (level) return new Array(level + 1).join("#") + " " + text.slice(0, 60);
    if (DOCX_LIST_RE.test(chunk)) return "· " + text;
    if (docxBoldLabel(text, chunk)) return "### " + text.slice(0, 40);
    return text;
  }

  function docxPush(col, line) {
    if (!line) return;
    col.size += line.length + 2;
    col.out.push(line);
  }

  function docxParas(chunk, col) {
    var paras = chunk.split(/<\/w:p>/);
    for (var i = 0; i < paras.length && col.size < MAX_OUT; i += 1) {
      docxPush(col, docxParaLine(paras[i]));
    }
  }

  /* 表格行 → 一行：两列直接拼成「关键词：内容」，人设表能一格一条拆出来 */
  function docxRowText(rowXml) {
    var cells = rowXml.split(/<\/w:tc>/);
    var vals = [];
    for (var i = 0; i < cells.length && vals.length < 12; i += 1) {
      var paras = cells[i].split(/<\/w:p>/);
      var buf = [];
      for (var j = 0; j < paras.length; j += 1) {
        var text = docxParaText(paras[j]);
        if (text) buf.push(text);
      }
      var cell = buf.join(" ").replace(/\s+/g, " ").trim();
      if (cell) vals.push(cell.slice(0, 600));
    }
    if (!vals.length) return "";
    if (vals.length === 1) return vals[0];
    if (vals.length === 2) return vals[0] + "：" + vals[1];
    return vals.join("　");
  }

  function docxLastRowStart(seg) {
    var at = -1;
    var re = /<w:tr\b/g;
    var hit;
    while ((hit = re.exec(seg))) at = hit.index;
    return at;
  }

  function docxToText(xml) {
    var src = decodeBytes(xml);
    var body = src.indexOf("<w:body") >= 0 ? src.slice(src.indexOf("<w:body")) : src;
    var col = { out: [], size: 0 };
    /* 先按表格行切开：行内单元格拼成一行，行外的普通段落照旧逐段处理 */
    var segs = body.split(/<\/w:tr>/);
    for (var i = 0; i < segs.length && col.size < MAX_OUT; i += 1) {
      var rowAt = docxLastRowStart(segs[i]);
      if (rowAt < 0) {
        docxParas(segs[i], col);
        continue;
      }
      docxParas(segs[i].slice(0, rowAt), col);
      docxPush(col, docxRowText(segs[i].slice(rowAt)));
    }
    return col.out.join("\n\n");
  }

  function odfToText(xml) {
    var s = decodeBytes(xml);
    s = s.replace(/<\/text:h>/g, "\n");
    s = s.replace(/<\/text:p>/g, "\n");
    s = s.replace(/<text:(line-break|tab)\b[^>]*\/>/g, "\n");
    s = s.replace(/<[^>]+>/g, "");
    return decodeEntities(s);
  }

  function zipFamily(u8, filename) {
    var lower = String(filename || "").toLowerCase();
    var kind = /\.docx$/i.test(lower) || /\.docm$/i.test(lower) ? "docx" : /\.odt$/.test(lower) ? "odt"
      : /\.epub$/.test(lower) ? "epub" : "zip";
    var want;
    if (kind === "docx") want = function (n) { return n === "word/document.xml"; };
    else if (kind === "odt") want = function (n) { return n === "content.xml"; };
    else if (kind === "epub") want = function (n) {
      return /\.(xhtml|html?|xml)$/i.test(n) && !/toc|nav|guide|cover/i.test(n);
    };
    else want = function (n) { return /\.(json|jsonl|txt|md|markdown)$/i.test(n); };

    return readZip(u8, want).then(function (files) {
      if (!files) return bad("这个压缩包读不出目录，可能已损坏");
      var names = Object.keys(files);
      if (!names.length) {
        return bad(kind === "zip" ? "压缩包里没有人设书或世界书文件" : "这个文档里没有正文");
      }

      if (kind === "docx") {
        if (!files["word/document.xml"]) return bad("这个 .docx 里没有正文内容");
        return done(docxToText(files["word/document.xml"]), "docx", "Word 文档", "");
      }
      if (kind === "odt") {
        if (!files["content.xml"]) return bad("这个 .odt 里没有正文内容");
        return done(odfToText(files["content.xml"]), "odt", "OpenDocument", "");
      }
      if (kind === "epub") {
        names.sort();
        var body = "";
        for (var i = 0; i < names.length && body.length < MAX_OUT; i += 1) {
          if (!/\.(xhtml|html?)$/i.test(names[i])) continue;
          body += htmlToRaw(files[names[i]]) + "\n\n";
        }
        return done(body, "epub", "电子书", "");
      }

      names.sort(function (a, b) {
        var scoreA = /character\.json$/i.test(a) ? 3 : /\.json$/i.test(a) ? 2 : 1;
        var scoreB = /character\.json$/i.test(b) ? 3 : /\.json$/i.test(b) ? 2 : 1;
        if (scoreA !== scoreB) return scoreB - scoreA;
        return files[b].length - files[a].length;
      });
      var pick = names[0];
      var text = /\.json$/i.test(pick) ? decodeBytes(files[pick]) : tidy(decodeBytes(files[pick]));
      if (!tidy(text)) return bad("压缩包里的 " + pick + " 是空的");
      return pack(text.slice(0, MAX_OUT), "zip", "压缩包 · " + pick.slice(-24), "");
    }, function () {
      return bad(NO_INFLATE);
    });
  }

  /* ---------- PDF：尽力抽取文字层 ---------- */
  function pdfStringText(tok) {
    if (tok.charAt(0) === "(") {
      var body = tok.slice(1, -1);
      var out = "";
      for (var i = 0; i < body.length; i += 1) {
        var c = body.charAt(i);
        if (c !== "\\") { out += c; continue; }
        var n = body.charAt(++i);
        if (n === "n") out += "\n";
        else if (n === "r") out += "\r";
        else if (n === "t") out += "\t";
        else if (n === "\n") out += "";
        else if (n >= "0" && n <= "7") {
          var oct = n;
          while (oct.length < 3 && body.charAt(i + 1) >= "0" && body.charAt(i + 1) <= "7") oct += body.charAt(++i);
          out += String.fromCharCode(parseInt(oct, 8) & 0xff);
        } else if (n) out += n;
      }
      return out;
    }
    var hex = tok.slice(1, -1).replace(/[^0-9A-Fa-f]/g, "");
    if (/^feff/i.test(hex)) {
      var wide = "";
      for (var k = 4; k + 4 <= hex.length; k += 4) {
        var code = parseInt(hex.substr(k, 4), 16);
        if (!code) continue;
        try {
          wide += String.fromCodePoint(code);
        } catch (err) {
          /* 非法码位跳过 */
        }
      }
      return wide;
    }
    var bytes = new Uint8Array(Math.floor(hex.length / 2));
    for (var j = 0; j < bytes.length; j += 1) bytes[j] = parseInt(hex.substr(j * 2, 2), 16);
    return latin1(bytes);
  }

  var PDF_TOKEN_RE = /(\((?:\\[\s\S]|[^\\()])*\)|<[0-9A-Fa-f\s]+>)|(T\*)|(Td|TD|TL)/g;

  function pdfBlockText(body) {
    var out = "";
    var m;
    PDF_TOKEN_RE.lastIndex = 0;
    while ((m = PDF_TOKEN_RE.exec(body))) {
      if (m[1]) out += pdfStringText(m[1]);
      else if (m[2]) out += "\n";
      else if (out && out.charAt(out.length - 1) !== "\n") out += "\n";
    }
    return out;
  }

  function pdfStreamText(src) {
    var out = "";
    var block = /BT[\s\S]*?ET/g;
    var m;
    while ((m = block.exec(src))) out += pdfBlockText(m[0]) + "\n";
    if (!out && src.indexOf("Tj") >= 0) out = pdfBlockText(src);
    return out;
  }

  function readableCount(text) {
    var hits = String(text).match(/[\u4e00-\u9fa5A-Za-z0-9\u3000-\u303f\uff00-\uffef]/g);
    return hits ? hits.length : 0;
  }

  function pdfToText(u8) {
    var src = latin1(u8);
    if (src.slice(0, 5) !== "%PDF-") return Promise.resolve(bad("这不是一个有效的 PDF 文件"));

    var chunks = [];
    var cursor = 0;
    var guard = 0;
    var chain = Promise.resolve();

    while (guard < 800) {
      var s = src.indexOf("stream", cursor);
      if (s < 0) break;
      guard += 1;
      var e = src.indexOf("endstream", s);
      if (e < 0) break;
      var start = s + 6;
      if (src.charAt(start) === "\r") start += 1;
      if (src.charAt(start) === "\n") start += 1;
      var dict = src.slice(Math.max(0, s - 900), s);
      var raw = u8.subarray(start, e);
      if (raw.length > 2) {
        if (dict.indexOf("FlateDecode") >= 0) {
          chain = chain.then(function (bytes) {
            return inflateRaw(bytes).then(function (out) {
              chunks.push(out);
            }, function () {
              return null;
            });
          }.bind(null, raw));
        } else {
          chunks.push(raw);
        }
      }
      cursor = e + 9;
    }

    return chain.then(function () {
      var text = "";
      for (var i = 0; i < chunks.length && text.length < MAX_OUT; i += 1) {
        text += pdfStreamText(latin1(chunks[i])) + "\n";
      }
      var body = tidy(text);
      if (readableCount(body) < 40) {
        return bad("这份 PDF 抽不出文字，多半是扫描件或字体被嵌进去了；导出成 .txt 再传");
      }
      return done(body, "pdf", "PDF", "文字层是尽力抽出来的，排版可能会散");
    }, function () {
      return bad(NO_INFLATE);
    });
  }

  /* ---------- 老版 Word / WPS：二进制里尽力扫出文字流 ---------- */
  function legacyChar(code) {
    if (code === 0x0a || code === 0x0d) return "\n";
    if (code === 0x09) return " ";
    if (code >= 0x4e00 && code <= 0x9fa5) return String.fromCharCode(code);
    if (code >= 0x3000 && code <= 0x303f) return String.fromCharCode(code);
    if (code >= 0xff01 && code <= 0xff5e) return String.fromCharCode(code);
    if (code >= 0x2014 && code <= 0x2026) return "—";
    if (code >= 32 && code < 127) return String.fromCharCode(code);
    return "";
  }

  function legacyRunsAt(u8, offset) {
    var runs = [];
    var buf = "";
    var end = Math.min(u8.length - 1, MAX_BYTES);
    for (var i = offset; i < end; i += 2) {
      var ch = legacyChar(u8[i] | (u8[i + 1] << 8));
      if (ch) { buf += ch; continue; }
      if (buf.length >= 6) runs.push(buf);
      buf = "";
    }
    if (buf.length >= 6) runs.push(buf);
    return runs;
  }

  /* 只留下像正文的片段：含足够多汉字，或者确实是带空格的西文句子 */
  function legacyKeep(run) {
    var body = run.replace(/\s+/g, " ").trim();
    if (body.length < 6) return "";
    var cjk = body.match(/[\u4e00-\u9fa5]/g);
    if (cjk && cjk.length >= 3) return body;
    var letters = body.match(/[A-Za-z]/g);
    if (letters && letters.length >= 6 && /\s/.test(body)) return body;
    return "";
  }

  function legacyDocText(u8, label) {
    var best = "";
    for (var offset = 0; offset < 2; offset += 1) {
      var text = legacyRunsAt(u8, offset).map(legacyKeep).filter(Boolean).join("\n");
      if (readableCount(text) > readableCount(best)) best = text;
    }
    var body = tidy(best);
    if (readableCount(body) < 60) {
      return bad(label + " 是老版二进制文档，本机抽不出正文；请在 Word 或 WPS 里另存为 .docx 或 .txt 再传");
    }
    return done(body, "doc", label + " · 尽力抽取", "老版格式按文字流抽取，段落可能会散，导入后记得核对");
  }

  /* ---------- 格式登记 ---------- */
  var EXT_MAP = {
    json: "json", jsonl: "jsonl", ndjson: "jsonl",
    txt: "text", text: "text", log: "text", md: "text", markdown: "text", rst: "text", adoc: "text",
    csv: "csv", tsv: "tsv",
    yaml: "yaml", yml: "yaml",
    ini: "ini", toml: "ini", properties: "ini", conf: "ini", cfg: "ini",
    html: "html", htm: "html", xhtml: "html", xml: "html",
    srt: "subs", vtt: "subs",
    rtf: "rtf",
    docx: "zip", docm: "zip", odt: "zip", epub: "zip", zip: "zip", charx: "zip",
    doc: "legacy", wps: "legacy", wpt: "legacy",
    pdf: "pdf", png: "png"
  };

  var REJECT = {
    pages: "苹果 Pages 文档先导出成 .docx 或 .txt 再传",
    dot: "这是 Word 97 模板，在 Word / WPS 里另存成 .docx 或 .txt 再传",
    dotx: "这是 Word 模板，在 Word / WPS 里另存成 .docx 或 .txt 再传",
    key: "演示稿不是设定正文，导出成 .txt 再传",
    ppt: "演示稿不是设定正文，导出成 .txt 再传",
    pptx: "演示稿不是设定正文，导出成 .txt 再传",
    xls: "表格先另存成 .csv 再传",
    xlsx: "表格先另存成 .csv 再传",
    mobi: "Kindle 的 .mobi 解不开，换成 .epub 或 .txt 再传",
    azw: "Kindle 的电子书解不开，换成 .epub 或 .txt 再传",
    azw3: "Kindle 的电子书解不开，换成 .epub 或 .txt 再传",
    rar: "RAR 压缩格式解不开，换成普通 .zip 或 .txt 再传",
    "7z": "7Z 压缩格式解不开，换成普通 .zip 或 .txt 再传",
    epub3: "电子书解不开，换成 .txt 再传"
  };

  var ACCEPT_EXT = [
    ".docx", ".doc", ".wps", ".pdf", ".txt", ".md", ".markdown",
    ".json", ".jsonl", ".ndjson", ".log",
    ".csv", ".tsv", ".yaml", ".yml", ".ini", ".toml", ".properties",
    ".html", ".htm", ".xml", ".srt", ".vtt", ".rtf",
    ".docm", ".odt", ".epub", ".zip", ".charx", ".png"
  ];

  var ACCEPT_MIME = [
    "application/json", "text/plain", "text/markdown", "text/csv", "text/tab-separated-values",
    "text/html", "text/xml", "application/xml", "application/yaml", "application/x-yaml",
    "application/pdf", "application/rtf", "application/zip", "application/msword",
    "application/vnd.ms-works", "application/vnd.ms-word",
    "application/vnd.ms-word.template.macroEnabled.12",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
    "application/vnd.oasis.opendocument.text", "application/epub+zip",
    "image/png", "application/octet-stream"
  ];

  var TAGS = [
    "Word .docx", "老版 Word · WPS", "PDF 文字版", "TXT · Markdown",
    "角色卡 JSON", "PNG 内嵌卡", "OpenDocument",
    "CSV · TSV", "YAML · INI", "HTML · EPUB", "RTF · SRT", "ZIP · CHARX"
  ];

  function accept() {
    return ACCEPT_EXT.concat(ACCEPT_MIME).join(",");
  }

  function tags() {
    return TAGS.slice(0);
  }

  function extOf(name) {
    var m = /\.([A-Za-z0-9]{1,8})$/.exec(String(name || ""));
    return m ? m[1].toLowerCase() : "";
  }

  function labelOf(name) {
    var kind = EXT_MAP[extOf(name)];
    if (kind === "json") return "JSON";
    if (kind === "jsonl") return "JSONL";
    if (kind === "text") return "纯文本";
    if (kind === "csv") return "CSV";
    if (kind === "tsv") return "TSV";
    if (kind === "yaml") return "YAML";
    if (kind === "ini") return "配置文件";
    if (kind === "html") return "网页";
    if (kind === "subs") return "字幕";
    if (kind === "rtf") return "RTF";
    if (kind === "legacy") return extOf(name) === "doc" ? "老版 Word" : "WPS 文档";
    if (kind === "pdf") return "PDF";
    if (kind === "zip") return "压缩包文档";
    return "文档";
  }

  /* 没后缀时看文件头 */
  function sniff(u8) {
    if (u8.length > 4 && u8[0] === 0x50 && u8[1] === 0x4b) return "zip";
    if (u8.length > 5 && u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46) return "pdf";
    if (u8.length > 5 && u8[0] === 0x7b && u8[1] === 0x5c && u8[2] === 0x72 && u8[3] === 0x74) return "rtf";
    var head = latin1(u8.subarray(0, 96)).replace(/^\uFEFF/, "").replace(/^[\s\u0000]+/, "").toLowerCase();
    if (head.indexOf("<!doctype html") === 0 || head.indexOf("<html") === 0) return "html";
    if (head.indexOf("<?xml") === 0 || head.indexOf("<opf") === 0) return "html";
    return "text";
  }

  /* ---------- 统一入口 ---------- */
  function decode(file, buf) {
    var name = String((file && file.name) || "");
    var u8;
    try {
      u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf || 0);
    } catch (err) {
      return Promise.resolve(bad("读不出这个文件的内容"));
    }
    if (!u8.length) return Promise.resolve(bad("文件是空的"));

    var ext = extOf(name);
    if (REJECT[ext]) return Promise.resolve(bad(REJECT[ext]));

    var kind = EXT_MAP[ext] || sniff(u8);

    if (kind === "json") return Promise.resolve(jsonText(u8, name));
    if (kind === "jsonl") return Promise.resolve(jsonlText(u8, name));
    if (kind === "text") return Promise.resolve(plainText(u8, name, "纯文本"));
    if (kind === "csv") return Promise.resolve(tableText(u8, name, ",", "CSV"));
    if (kind === "tsv") return Promise.resolve(tableText(u8, name, "\t", "TSV"));
    if (kind === "yaml") return Promise.resolve(yamlToText(u8, name));
    if (kind === "ini") return Promise.resolve(iniToText(u8, name));
    if (kind === "html") return Promise.resolve(htmlToText(u8, name));
    if (kind === "subs") return Promise.resolve(subsToText(u8, name));
    if (kind === "rtf") return Promise.resolve(rtfToText(u8, name));
    if (kind === "legacy") {
      return Promise.resolve(legacyDocText(u8, ext === "doc" ? "老版 Word" : "WPS 文档"));
    }
    if (kind === "pdf") return pdfToText(u8);
    if (kind === "zip") return zipFamily(u8, name || "document.zip");
    if (kind === "png") {
      return Promise.resolve(bad("这张 PNG 里没有可读文字，角色卡请选带内嵌数据的图"));
    }
    return Promise.resolve(bad("还不认识 ." + (ext || "未知") + " 这种文件"));
  }

  global.COS = global.COS || {};
  global.COS.docs = {
    decode: decode,
    accept: accept,
    tags: tags,
    labelOf: labelOf
  };
})(window);