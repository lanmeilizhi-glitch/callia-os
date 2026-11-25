/* =================================================================
   Callia OS · photoWidget.js
   相册小组件：桌面独立照片卡片
   · 只读写本机 localStorage 的 photoWidgets 数组
   · 图片一律先经 canvas 压缩（宽上限 300px + JPEG 0.6）再落盘
   · 不参与主存档，也不碰伴侣卡片与其他小组件的渲染
   ================================================================= */
(function (global) {
  "use strict";

  var STORAGE_KEY = "photoWidgets";
  var MAX_PHOTOS = 9;
  var MAX_EDGE = 300;
  var JPEG_Q = 0.6;

  /* ---------- 工具 ---------- */
  function el(sel, root) {
    return (root || document).querySelector(sel);
  }

  function toast(text) {
    var S = global.COS;
    if (S && S.os && typeof S.os.toast === "function") {
      S.os.toast(text);
      return;
    }
    var node = document.getElementById("toast");
    if (!node) return;
    node.textContent = text;
    node.classList.add("is-on");
    setTimeout(function () { node.classList.remove("is-on"); }, 2000);
  }

  function buzz(ms) {
    try {
      var S = global.COS;
      if (S && S.store && S.store.settings && S.store.settings.haptic === false) return;
      if (global.navigator && typeof global.navigator.vibrate === "function") {
        global.navigator.vibrate(ms || 10);
      }
    } catch (err) { /* 静默 */ }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------- 数据读写 ---------- */
  function load() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (err) {
      return [];
    }
  }

  function save(list) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (err) {
      toast("存储空间不足，图片未能保存");
    }
  }

  /* ---------- 图片压缩 ---------- */
  function compress(file, cb) {
    if (typeof FileReader === "undefined") { cb(null); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var w = img.width;
        var h = img.height;
        if (w > MAX_EDGE || h > MAX_EDGE) {
          var ratio = Math.min(MAX_EDGE / w, MAX_EDGE / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        try {
          var canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          var data = canvas.toDataURL("image/jpeg", JPEG_Q);
          cb(data);
        } catch (err) {
          cb(null);
        }
      };
      img.onerror = function () { cb(null); };
      img.src = reader.result;
    };
    reader.onerror = function () { cb(null); };
    reader.readAsDataURL(file);
  }

  /* ---------- 找宿主容器 ---------- */
  function findHost() {
    /* 优先找第二屏 bento 后面 */
    var bento = el("#bento-life");
    if (bento && bento.parentNode) return { parent: bento.parentNode, after: bento };
    /* 兜底：第二屏 home__scroll */
    var page = el('#home .home__page--life .home__scroll');
    return page ? { parent: page, after: null } : null;
  }

  /* ---------- 渲染 ---------- */
  function render() {
    var widget = el("#widget-photo");
    var list = load();
    var host = findHost();

    /* 没有宿主就不渲染 */
    if (!host) return;

    /* 首次：创建容器 */
    if (!widget) {
      widget = document.createElement("section");
      widget.id = "widget-photo";
      widget.className = "card wgt wgt--photo";
      widget.setAttribute("data-widget", "photo");
      if (host.after) {
        host.after.parentNode.insertBefore(widget, host.after.nextSibling);
      } else {
        host.parent.appendChild(widget);
      }
    }

    var countText = list.length ? list.length + " 张" : "空";
    var gridClass = "pw-grid" + (list.length === 0 ? " is-empty" : "");
    var html =
      '<div class="pw__head">' +
        '<span class="pw__label">相册</span>' +
        '<span class="pw__tag">' + countText + '</span>' +
      '</div>' +
      '<div class="' + gridClass + '">';

    if (list.length === 0) {
      html +=
        '<button class="pw-add pw-add--block" type="button" data-pw-add aria-label="添加照片">' +
          '<i class="pw-add__plus">+</i>' +
          '<span class="pw-add__text">添加照片</span>' +
        '</button>';
    } else {
      for (var i = 0; i < list.length; i++) {
        var item = list[i];
        html +=
          '<div class="pw-card" data-pw-id="' + item.id + '">' +
            '<img class="pw-card__img" src="' + item.src + '" alt="照片" loading="lazy">' +
            '<button class="pw-card__rm" type="button" data-pw-rm="' + item.id + '" aria-label="删除">✕</button>' +
          '</div>';
      }
      /* 没满就显示添加按钮 */
      if (list.length < MAX_PHOTOS) {
        html +=
          '<button class="pw-add" type="button" data-pw-add aria-label="添加照片">' +
            '<i class="pw-add__plus">+</i>' +
            '<span class="pw-add__text">添加照片</span>' +
          '</button>';
      }
    }

    html += '</div>';

    /* 移除按钮（排列模式）*/
    html += '<button class="wgt__rm" type="button" data-wgt-rm="photo" aria-label="从桌面移除相册小组件">✕</button>';

    widget.innerHTML = html;
  }

  /* ---------- 添加图片 ---------- */
  function addPhoto() {
    var list = load();
    if (list.length >= MAX_PHOTOS) {
      toast("最多放 " + MAX_PHOTOS + " 张照片");
      return;
    }
    var input = el("#photo-widget-file");
    if (!input) return;
    input.value = "";
    input.click();
  }

  function handleFile(file) {
    if (!file || !file.type || file.type.indexOf("image") !== 0) {
      toast("请选择一张图片");
      return;
    }
    toast("正在处理…");
    compress(file, function (data) {
      if (!data) {
        toast("图片读取失败，换一张试试");
        return;
      }
      var list = load();
      list.push({ id: uid(), src: data, ts: Date.now() });
      save(list);
      render();
      buzz(12);
      toast("照片已添加");
    });
  }

  /* ---------- 删除 ---------- */
  function deletePhoto(id) {
    var list = load().filter(function (item) { return item.id !== id; });
    save(list);
    render();
    buzz(10);
    toast("已删除");
  }

  /* ---------- 事件 ---------- */
  function bind() {
    var fileInput = el("#photo-widget-file");
    if (fileInput) {
      fileInput.addEventListener("change", function () {
        if (fileInput.files && fileInput.files[0]) {
          handleFile(fileInput.files[0]);
        }
      });
    }

    document.addEventListener("click", function (ev) {
      var node = ev.target;
      if (!node || typeof node.closest !== "function") return;

      /* 添加 */
      if (node.closest("[data-pw-add]")) {
        ev.preventDefault();
        addPhoto();
        return;
      }

      /* 删除 */
      var rm = node.closest("[data-pw-rm]");
      if (rm) {
        ev.preventDefault();
        ev.stopPropagation();
        deletePhoto(rm.getAttribute("data-pw-rm"));
        return;
      }
    });
  }

  /* ---------- 启动 ---------- */
  function boot() {
    render();
    bind();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  global.CalliaPhoto = {
    render: render,
    add: addPhoto
  };
})(window);
