(() => {
  // src/index.js
  (function() {
    "use strict";
    var THEME = {
      bg: "#0D0D0F",
      surface: "#141417",
      elevated: "#1A1A1F",
      fg: "#FAFAF9",
      fgMuted: "#A1A1A1",
      fgSubtle: "#6B6B6B",
      line: "#2a2a30",
      grid: "#1A1A1F",
      accent: "#D4AF37",
      accentLight: "#F5D76E",
      runColors: ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"],
      font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      fontMono: "'SF Mono', 'JetBrains Mono', 'Menlo', monospace",
      headerSize: "13px",
      headerWeight: "600",
      headerSpacing: "0.02em",
      bodySize: "12px",
      smallSize: "11px",
      tinySize: "10px",
      headerPad: "12px 16px 4px",
      statusPad: "2px 16px 8px"
    };
    function injectBaseStyles() {
      var css = [
        "*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }",
        "body { background:" + THEME.bg + "; color:" + THEME.fg + "; font-family:" + THEME.font + "; font-size:" + THEME.bodySize + "; overflow:hidden; height:100vh; display:flex; flex-direction:column; }",
        ".header { padding:" + THEME.headerPad + "; font-size:" + THEME.headerSize + "; font-weight:" + THEME.headerWeight + "; letter-spacing:" + THEME.headerSpacing + "; color:" + THEME.fgMuted + "; text-transform:uppercase; }",
        ".status { padding:" + THEME.statusPad + "; font-size:" + THEME.smallSize + "; color:" + THEME.fgSubtle + "; }",
        ".scroll-container { flex:1; overflow-y:auto; padding:0 16px 16px; }",
        ".scroll-container::-webkit-scrollbar { width:6px; }",
        ".scroll-container::-webkit-scrollbar-track { background:transparent; }",
        ".scroll-container::-webkit-scrollbar-thumb { background:" + THEME.line + "; border-radius:3px; }",
        ".scroll-container::-webkit-scrollbar-thumb:hover { background:" + THEME.fgSubtle + "; }",
        // Gallery grid
        ".gallery-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:10px; }",
        // Image card
        ".image-card { background:" + THEME.surface + "; border:1px solid " + THEME.line + "; border-radius:6px; overflow:hidden; cursor:pointer; transition:border-color 0.15s; }",
        ".image-card:hover { border-color:" + THEME.accent + "; }",
        ".image-card .thumb-container { aspect-ratio:1; overflow:hidden; background:" + THEME.bg + "; display:flex; align-items:center; justify-content:center; }",
        ".image-card .thumb-container img { width:100%; height:100%; object-fit:cover; }",
        ".image-card .card-info { padding:6px 8px; }",
        ".image-card .card-name { font-size:11px; color:" + THEME.fg + "; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }",
        ".image-card .card-meta { display:flex; align-items:center; gap:4px; margin-top:3px; }",
        ".node-badge { font-size:9px; font-weight:500; padding:1px 5px; border-radius:3px; background:rgba(212,175,55,0.2); color:" + THEME.accentLight + "; }",
        ".meta-label { font-size:" + THEME.tinySize + "; color:" + THEME.fgSubtle + "; }",
        // Lightbox
        ".lightbox { position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:1000; display:flex; align-items:center; justify-content:center; cursor:pointer; }",
        ".lightbox-img { max-width:90%; max-height:90%; object-fit:contain; border-radius:4px; }",
        // Loading placeholder
        ".thumb-placeholder { font-size:" + THEME.tinySize + "; color:" + THEME.fgSubtle + "; }"
      ].join("\n");
      var style = document.createElement("style");
      style.textContent = css;
      document.head.appendChild(style);
    }
    function AthenaBridge() {
      var self = this;
      self._handlers = {};
      self._pending = {};
      self._reqId = 0;
      self._runIds = [];
      self._runMeta = {};
      self._artifactIds = [];
      self._initData = null;
      self._readyResolve = null;
      self._readyPromise = new Promise(function(resolve) {
        self._readyResolve = resolve;
      });
      window.addEventListener("message", function(event) {
        var msg = event.data;
        if (!msg || !msg.type)
          return;
        if (msg.type === "init") {
          self._initData = msg;
          self._runIds = msg.run_ids || (msg.run_id ? [msg.run_id] : []);
          self._artifactIds = msg.artifact_ids || [];
          var runs = msg.runs || [];
          for (var i = 0; i < runs.length; i++) {
            self._runMeta[runs[i].id] = runs[i];
          }
          if (runs.length === 0) {
            for (var j = 0; j < self._runIds.length; j++) {
              var rid = self._runIds[j];
              self._runMeta[rid] = { id: rid, color: THEME.runColors[j % THEME.runColors.length], name: "Run " + (j + 1) };
            }
          }
          if (self._readyResolve) {
            self._readyResolve(msg);
            self._readyResolve = null;
          }
          self._emit("init", msg);
        } else if (msg.type === "artifact_data") {
          var cb = self._pending[msg.request_id];
          if (cb) {
            delete self._pending[msg.request_id];
            cb(null, msg);
          }
        } else if (msg.type === "artifact_meta") {
          var cb2 = self._pending[msg.request_id];
          if (cb2) {
            delete self._pending[msg.request_id];
            cb2(null, msg);
          }
        } else if (msg.type === "data") {
          var cb3 = self._pending[msg.request_id];
          if (cb3) {
            delete self._pending[msg.request_id];
            cb3(null, msg);
          }
        } else if (msg.type === "event") {
          self._emit("event:" + msg.subscription_id, msg.event);
        } else if (msg.type === "error") {
          var cb4 = self._pending[msg.request_id];
          if (cb4) {
            delete self._pending[msg.request_id];
            cb4(msg, null);
          }
        }
      });
    }
    AthenaBridge.prototype._nextId = function() {
      return "req_" + ++this._reqId;
    };
    AthenaBridge.prototype._emit = function(name, data) {
      var fns = this._handlers[name];
      if (fns) {
        for (var i = 0; i < fns.length; i++)
          fns[i](data);
      }
    };
    AthenaBridge.prototype.on = function(name, fn) {
      if (!this._handlers[name])
        this._handlers[name] = [];
      this._handlers[name].push(fn);
    };
    AthenaBridge.prototype.ready = function() {
      return this._readyPromise;
    };
    AthenaBridge.prototype.getRunIds = function() {
      return this._runIds;
    };
    AthenaBridge.prototype.getRunColor = function(runId) {
      var meta = this._runMeta[runId];
      if (meta)
        return meta.color;
      var idx = this._runIds.indexOf(runId);
      return THEME.runColors[(idx >= 0 ? idx : 0) % THEME.runColors.length];
    };
    AthenaBridge.prototype.getRunName = function(runId) {
      var meta = this._runMeta[runId];
      return meta && meta.name || runId.slice(0, 8);
    };
    AthenaBridge.prototype.fetchArtifact = function(artifactId, asJson) {
      var self = this;
      var id = self._nextId();
      return new Promise(function(resolve, reject) {
        self._pending[id] = function(err, data) {
          if (err)
            return reject(new Error(err.message || "fetch failed"));
          resolve(data);
        };
        window.parent.postMessage({
          type: "fetch_artifact",
          request_id: id,
          artifact_id: artifactId,
          as_json: !!asJson
        }, "*");
      });
    };
    AthenaBridge.prototype.getArtifactMeta = function(artifactId) {
      var self = this;
      var id = self._nextId();
      return new Promise(function(resolve, reject) {
        self._pending[id] = function(err, data) {
          if (err)
            return reject(new Error(err.message || "meta fetch failed"));
          resolve(data);
        };
        window.parent.postMessage({
          type: "get_artifact_meta",
          request_id: id,
          artifact_id: artifactId
        }, "*");
      });
    };
    AthenaBridge.prototype.searchArtifacts = function(filter) {
      var self = this;
      var id = self._nextId();
      return new Promise(function(resolve, reject) {
        self._pending[id] = function(err, data) {
          if (err)
            return reject(new Error(err.message || "search failed"));
          resolve(data);
        };
        window.parent.postMessage({
          type: "search_artifacts",
          request_id: id,
          filter
        }, "*");
      });
    };
    AthenaBridge.prototype.subscribeEvents = function(runId, filter, callback) {
      var subId = "sub_" + runId + "_" + ++this._reqId;
      this.on("event:" + subId, callback);
      window.parent.postMessage({
        type: "subscribe_events",
        subscription_id: subId,
        run_id: runId,
        filter
      }, "*");
      return subId;
    };
    var images = [];
    var pendingArtifacts = {};
    var bridge = new AthenaBridge();
    var statusEl = document.getElementById("status");
    var galleryEl = document.getElementById("gallery");
    var lightboxEl = document.getElementById("lightbox");
    var lightboxImg = document.getElementById("lightbox-img");
    lightboxEl.addEventListener("click", function() {
      lightboxEl.style.display = "none";
      lightboxImg.src = "";
    });
    function openLightbox(url) {
      lightboxImg.src = url;
      lightboxEl.style.display = "flex";
    }
    function tryAddArtifact(artifactId, runId) {
      if (!artifactId || pendingArtifacts[artifactId])
        return;
      pendingArtifacts[artifactId] = true;
      bridge.getArtifactMeta(artifactId).then(function(meta) {
        var ct = meta.content_type || "";
        var name = (meta.name || meta.storage_ref || "").toLowerCase();
        var schema = (meta.schema_type || "").toLowerCase();
        var imageExts = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"];
        var isImage = ct.indexOf("image/") === 0;
        if (!isImage) {
          for (var ei = 0; ei < imageExts.length; ei++) {
            if (name.indexOf(imageExts[ei]) !== -1) {
              isImage = true;
              break;
            }
          }
        }
        if (!isImage && (schema.indexOf("image") !== -1 || schema.indexOf("sample") !== -1)) {
          isImage = true;
        }
        if (!isImage) {
          delete pendingArtifacts[artifactId];
          return;
        }
        var entry = {
          artifactId,
          name: meta.name || artifactId.slice(0, 8),
          node_id: meta.node_id || null,
          tags: meta.tags || [],
          step: meta.metadata && meta.metadata.step || null,
          epoch: meta.metadata && meta.metadata.epoch || null,
          timestamp: meta.created_at || null,
          blobUrl: null,
          loaded: false,
          runId
        };
        images.push(entry);
        renderGallery();
        loadArtifactImage(artifactId);
      }).catch(function() {
        delete pendingArtifacts[artifactId];
      });
    }
    function loadArtifactImage(artifactId) {
      bridge.fetchArtifact(artifactId, false).then(function(resp) {
        var ct = resp.content_type || "image/png";
        var blob = new Blob([resp.data], { type: ct });
        var url = URL.createObjectURL(blob);
        for (var i = 0; i < images.length; i++) {
          if (images[i].artifactId === artifactId) {
            images[i].blobUrl = url;
            images[i].loaded = true;
            break;
          }
        }
        updateImageSrc(artifactId, url);
      }).catch(function() {
      });
    }
    function updateImageSrc(artifactId, url) {
      var img = document.querySelector('[data-artifact="' + artifactId + '"] img');
      if (img) {
        img.src = url;
      } else {
        renderGallery();
      }
    }
    function renderGallery() {
      if (images.length === 0) {
        statusEl.textContent = "Waiting for image artifacts...";
      } else {
        statusEl.textContent = images.length + " image" + (images.length !== 1 ? "s" : "");
      }
      galleryEl.innerHTML = "";
      for (var i = 0; i < images.length; i++) {
        var entry = images[i];
        var card = document.createElement("div");
        card.className = "image-card";
        card.setAttribute("data-artifact", entry.artifactId);
        var thumbContainer = document.createElement("div");
        thumbContainer.className = "thumb-container";
        if (entry.blobUrl) {
          var img = document.createElement("img");
          img.src = entry.blobUrl;
          img.alt = entry.name;
          thumbContainer.appendChild(img);
        } else {
          var placeholder = document.createElement("span");
          placeholder.className = "thumb-placeholder";
          placeholder.textContent = "Loading...";
          thumbContainer.appendChild(placeholder);
        }
        card.appendChild(thumbContainer);
        var info = document.createElement("div");
        info.className = "card-info";
        var nameEl = document.createElement("div");
        nameEl.className = "card-name";
        nameEl.textContent = entry.name;
        info.appendChild(nameEl);
        var metaRow = document.createElement("div");
        metaRow.className = "card-meta";
        if (entry.node_id) {
          var badge = document.createElement("span");
          badge.className = "node-badge";
          badge.textContent = entry.node_id;
          metaRow.appendChild(badge);
        }
        var parts = [];
        if (entry.step != null)
          parts.push("step " + entry.step);
        if (entry.epoch != null)
          parts.push("epoch " + entry.epoch);
        if (parts.length > 0) {
          var metaLabel = document.createElement("span");
          metaLabel.className = "meta-label";
          metaLabel.textContent = parts.join(" / ");
          metaRow.appendChild(metaLabel);
        }
        if (metaRow.childNodes.length > 0) {
          info.appendChild(metaRow);
        }
        card.appendChild(info);
        (function(e) {
          card.addEventListener("click", function() {
            if (e.blobUrl)
              openLightbox(e.blobUrl);
          });
        })(entry);
        galleryEl.appendChild(card);
      }
    }
    injectBaseStyles();
    window.parent.postMessage({ type: "ready" }, "*");
    bridge.ready().then(function(initData) {
      var runIds = bridge.getRunIds();
      for (var i = 0; i < runIds.length; i++) {
        (function(runId) {
          bridge.subscribeEvents(runId, { event_type: "artifact_written" }, function(evt) {
            var artifactId = evt.payload && evt.payload.artifact_id;
            if (artifactId)
              tryAddArtifact(artifactId, runId);
          });
        })(runIds[i]);
      }
      var artifactIds = bridge._artifactIds || [];
      for (var j = 0; j < artifactIds.length; j++) {
        tryAddArtifact(artifactIds[j], runIds[0] || "unknown");
      }
      for (var k = 0; k < runIds.length; k++) {
        (function(runId) {
          bridge.searchArtifacts({ run_id: runId }).then(function(resp) {
            var artifacts = resp.artifacts || [];
            for (var a = 0; a < artifacts.length; a++) {
              var art = artifacts[a];
              tryAddArtifact(art.id, runId);
            }
          }).catch(function() {
          });
        })(runIds[k]);
      }
    });
  })();
})();
