/* =================================================================
   Callia OS · photoWidget.js
   桌面图片卡片：独立添加 / 删除 / 爱心 / localStorage 持久化
   每张图片是一个单独的卡片，不包裹在相册网格里。
   ================================================================= */
(function (global) {
  "use strict";

  var STORAGE_KEY = "callia_photo_cards";
  var MAX_PHOTOS = 12;
  var MAX_SIZE = 200 * 1024;
  var MAX_EDGE = 600;

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
          var data = canvas.toDataURL("image/jpeg", 0.7);
          if (data.length > MAX_SIZE) {
            data = canvas.toDataURL("image/jpeg", 0.4);
          }
          if (data.length > MAX_SIZE) {
            canvas.width = Math.round(w / 2);
            canvas.height = Math.round(h / 2);
            ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            data = canvas.toDataURL("image/jpeg", 0.4);
          }
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

  function render() {
    var container = el("#photo-cards");
    if (!container) return;
    var list = load();
    var html = "";

    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var liked = item.liked ? " is-liked" : "";
      html +=
        '<div class="photo-card" data-photo-id="' + item.id + '">' +
          '<img class="photo-card__img" src="' + item.src + '" alt="' + (item.title || "照片") + '" loading="lazy">' +
          '<button class="photo-card__del" type="button" data-photo-del="' + item.id + '" aria-label="删除这张图片">✕</button>' +
          '<div class="photo-card__bar">' +
            '<span class="photo-card__title">' + (item.title || "") + '</span>' +
            '<button class="photo-card__heart' + liked + '" type="button" data-photo-heart="' + item.id + '" aria-label="喜欢">' +
              (item.liked ? "♥" : "♡") +
            '</button>' +
          '</div>' +
        '</div>';
    }

    if (list.length < MAX_PHOTOS) {
      html +=
        '<div class="photo-card photo-card--add" id="photo-add" role="button" tabindex="0" aria-label="添加图片">' +
          '<span class="photo-card__plus">+</span>' +
          '<span class="photo-card__hint">添加图片</span>' +
        '</div>';
    }

    container.innerHTML = html;
  }

  function addPhoto() {
    var list = load();
    if (list.length >= MAX_PHOTOS) {
      toast("最多放 " + MAX_PHOTOS + " 张图片");
      return;
    }
    var input = el("#photo-file-input");
    if (!input) return;
    input.value = "";
    input.click();
  }

  function handleFile(file) {
    if (!file || !file.type || file.type.indexOf("image") !== 0) {
      toast("请选择一张图片");
      return;
    }
    toast("正在处理图片…");
    compress(file, function (data) {
      if (!data) {
        toast("图片读取失败，换一张试试");
        return;
      }
      var list = load();
      list.push({
        id: uid(),
        src: data,
        title: "",
        liked: false,
        ts: Date.now()
      });
      save(list);
      render();
      buzz(12);
      toast("图片已添加");
    });
  }

  function deletePhoto(id) {
    var list = load().filter(function (item) { return item.id !== id; });
    save(list);
    render();
    buzz(10);
    toast("已删除");
  }

  function toggleHeart(id) {
    var list = load();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        list[i].liked = !list[i].liked;
        break;
      }
    }
    save(list);
    render();
    buzz(8);
  }

  function editTitle(id) {
    var list = load();
    var item = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) { item = list[i]; break; }
    }
    if (!item) return;
    var title = global.prompt("给这张图片起个名字", item.title || "");
    if (title === null) return;
    item.title = title.slice(0, 20);
    save(list);
    render();
  }

  var holdTimer = null;
  function clearHold() {
    if (holdTimer !== null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  }

  function bind() {
    var fileInput = el("#photo-file-input");
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

      if (node.closest("#photo-add")) {
        ev.preventDefault();
        addPhoto();
        return;
      }

      var del = node.closest("[data-photo-del]");
      if (del) {
        ev.preventDefault();
        ev.stopPropagation();
        deletePhoto(del.getAttribute("data-photo-del"));
        return;
      }

      var heart = node.closest("[data-photo-heart]");
      if (heart) {
        ev.preventDefault();
        ev.stopPropagation();
        toggleHeart(heart.getAttribute("data-photo-heart"));
        return;
      }

      var title = node.closest(".photo-card__title");
      if (title) {
        var card = title.closest(".photo-card");
        if (card && card.getAttribute("data-photo-id")) {
          ev.preventDefault();
          editTitle(card.getAttribute("data-photo-id"));
        }
        return;
      }
    });

    document.addEventListener("touchstart", function (ev) {
      var node = ev.target;
      if (!node || typeof node.closest !== "function") return;
      var card = node.closest(".photo-card[data-photo-id]");
      if (!card) return;
      clearHold();
      holdTimer = setTimeout(function () {
        holdTimer = null;
        card.classList.add("show-del");
        buzz(14);
        setTimeout(function () {
          card.classList.remove("show-del");
        }, 3000);
      }, 500);
    }, { passive: true });

    document.addEventListener("touchend", clearHold, { passive: true });
    document.addEventListener("touchcancel", clearHold, { passive: true });
    document.addEventListener("touchmove", clearHold, { passive: true });
  }

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
