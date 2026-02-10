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
      statusPad: "2px 16px 8px",
      chartPad: "8px 16px 16px"
    };
    function injectBaseStyles() {
      var s = document.createElement("style");
      s.textContent = [
        "*, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }",
        "html, body { height:100%; overflow:hidden; background:" + THEME.bg + "; color:" + THEME.fg + "; font-family:" + THEME.font + "; font-size:" + THEME.bodySize + "; -webkit-font-smoothing:antialiased; }",
        ".header { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:" + THEME.headerPad + "; font-size:" + THEME.headerSize + "; font-weight:" + THEME.headerWeight + "; letter-spacing:" + THEME.headerSpacing + "; color:" + THEME.fgMuted + "; flex-shrink:0; }",
        ".header span { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }",
        ".status { padding:" + THEME.statusPad + "; font-size:" + THEME.smallSize + "; color:" + THEME.fgSubtle + "; flex-shrink:0; min-height:20px; }",
        ".chart-container { flex:1; position:relative; padding:" + THEME.chartPad + "; overflow:hidden; min-height:0; }",
        "canvas { display:block; width:100%; height:100%; }",
        "button { background:" + THEME.elevated + "; border:1px solid " + THEME.line + "; color:" + THEME.fgMuted + "; font-family:" + THEME.font + "; font-size:" + THEME.tinySize + "; padding:3px 8px; border-radius:4px; cursor:pointer; white-space:nowrap; transition:background .15s,color .15s,border-color .15s; }",
        "button:hover { background:" + THEME.surface + "; color:" + THEME.fg + "; border-color:" + THEME.fgSubtle + "; }",
        "button.active { background:" + THEME.accent + "; color:" + THEME.bg + "; border-color:" + THEME.accent + "; font-weight:600; }",
        "select { background:" + THEME.elevated + "; border:1px solid " + THEME.line + "; color:" + THEME.fgMuted + "; font-family:" + THEME.font + "; font-size:" + THEME.tinySize + "; padding:3px 8px; border-radius:4px; cursor:pointer; outline:none; max-width:200px; }",
        "select:hover { border-color:" + THEME.fgSubtle + "; color:" + THEME.fg + "; }",
        ".tooltip { position:absolute; pointer-events:none; background:" + THEME.elevated + "; border:1px solid " + THEME.line + "; border-radius:6px; padding:6px 10px; font-size:" + THEME.smallSize + "; color:" + THEME.fg + "; box-shadow:0 4px 12px rgba(0,0,0,0.4); z-index:10; white-space:nowrap; }",
        ".scroll-container { overflow-y:auto; flex:1; min-height:0; }",
        ".scroll-container::-webkit-scrollbar { width:4px; }",
        ".scroll-container::-webkit-scrollbar-track { background:transparent; }",
        ".scroll-container::-webkit-scrollbar-thumb { background:" + THEME.line + "; border-radius:2px; }"
      ].join("\n");
      document.head.appendChild(s);
    }
    function AthenaBridge() {
      this._pending = {};
      this._subs = {};
      this._initData = null;
      this._initResolve = null;
      this._initPromise = new Promise(function(resolve) {
        this._initResolve = resolve;
      }.bind(this));
      this._counter = 0;
      window.addEventListener("message", this._onMessage.bind(this));
      window.parent.postMessage({ type: "ready", inspector_name: "metric_line_chart" }, "*");
    }
    AthenaBridge.prototype._nextId = function(prefix) {
      return (prefix || "req") + "_" + ++this._counter;
    };
    AthenaBridge.prototype._onMessage = function(event) {
      var msg = event.data;
      if (!msg || !msg.type)
        return;
      switch (msg.type) {
        case "init":
          this._initData = msg;
          if (this._initResolve) {
            this._initResolve(msg);
            this._initResolve = null;
          }
          break;
        case "data":
          if (msg.request_id && this._pending[msg.request_id]) {
            this._pending[msg.request_id].resolve(msg);
            delete this._pending[msg.request_id];
          }
          break;
        case "metric_list":
          if (msg.request_id && this._pending[msg.request_id]) {
            this._pending[msg.request_id].resolve(msg);
            delete this._pending[msg.request_id];
          }
          break;
        case "artifact_data":
          if (msg.request_id && this._pending[msg.request_id]) {
            if (msg.error) {
              this._pending[msg.request_id].reject(new Error(msg.error));
            } else {
              this._pending[msg.request_id].resolve(msg);
            }
            delete this._pending[msg.request_id];
          }
          break;
        case "artifact_meta":
          if (msg.request_id && this._pending[msg.request_id]) {
            if (msg.error) {
              this._pending[msg.request_id].reject(new Error(msg.error));
            } else {
              this._pending[msg.request_id].resolve(msg);
            }
            delete this._pending[msg.request_id];
          }
          break;
        case "event":
          if (msg.subscription_id && this._subs[msg.subscription_id]) {
            this._subs[msg.subscription_id](msg.event);
          }
          break;
        case "error":
          if (msg.request_id && this._pending[msg.request_id]) {
            this._pending[msg.request_id].reject(new Error(msg.message || "Unknown error"));
            delete this._pending[msg.request_id];
          }
          break;
      }
    };
    AthenaBridge.prototype._request = function(msg) {
      var self = this;
      return new Promise(function(resolve, reject) {
        self._pending[msg.request_id] = { resolve, reject };
        window.parent.postMessage(msg, "*");
      });
    };
    AthenaBridge.prototype.waitInit = function() {
      return this._initPromise;
    };
    AthenaBridge.prototype.queryMetrics = function(runIds2, metricNames) {
      var id = this._nextId("qm");
      return this._request({
        type: "query_metrics",
        request_id: id,
        run_ids: runIds2,
        metric_names: metricNames
      });
    };
    AthenaBridge.prototype.listMetrics = function(runId) {
      var id = this._nextId("lm");
      return this._request({
        type: "list_metrics",
        request_id: id,
        run_id: runId
      });
    };
    AthenaBridge.prototype.queryEvents = function(runId, filter, limit) {
      var id = this._nextId("qe");
      return this._request({
        type: "query_events",
        request_id: id,
        run_id: runId,
        filter,
        limit
      });
    };
    AthenaBridge.prototype.fetchArtifact = function(artifactId, asJson) {
      var id = this._nextId("fa");
      return this._request({
        type: "fetch_artifact",
        request_id: id,
        artifact_id: artifactId,
        as_json: !!asJson
      });
    };
    AthenaBridge.prototype.searchArtifacts = function(filter) {
      var id = this._nextId("sa");
      return this._request({
        type: "search_artifacts",
        request_id: id,
        filter
      });
    };
    AthenaBridge.prototype.subscribeEvents = function(runId, filter, callback) {
      var subId = this._nextId("sub");
      this._subs[subId] = callback;
      window.parent.postMessage({
        type: "subscribe_events",
        subscription_id: subId,
        run_id: runId,
        filter
      }, "*");
      return subId;
    };
    AthenaBridge.prototype.unsubscribeEvents = function(subId) {
      delete this._subs[subId];
      window.parent.postMessage({ type: "unsubscribe_events", subscription_id: subId }, "*");
    };
    AthenaBridge.prototype.saveState = function(state) {
      window.parent.postMessage({ type: "save_state", state }, "*");
    };
    AthenaBridge.prototype.clearState = function() {
      window.parent.postMessage({ type: "clear_state" }, "*");
    };
    function setupCanvas(canvas2) {
      var dpr = window.devicePixelRatio || 1;
      var rect = canvas2.getBoundingClientRect();
      canvas2.width = rect.width * dpr;
      canvas2.height = rect.height * dpr;
      var ctx = canvas2.getContext("2d");
      ctx.scale(dpr, dpr);
      return { ctx, w: rect.width, h: rect.height };
    }
    function niceRange(min, max) {
      if (min === max) {
        return { min: min - 1, max: max + 1 };
      }
      var pad = (max - min) * 0.05;
      return { min: min - pad, max: max + pad };
    }
    function niceStep(range, maxTicks) {
      maxTicks = maxTicks || 6;
      var rough = range / maxTicks;
      var mag = Math.pow(10, Math.floor(Math.log10(rough)));
      var residual = rough / mag;
      var nice;
      if (residual <= 1.5)
        nice = 1;
      else if (residual <= 3)
        nice = 2;
      else if (residual <= 7)
        nice = 5;
      else
        nice = 10;
      return nice * mag;
    }
    function generateTicks(min, max, maxTicks) {
      maxTicks = maxTicks || 6;
      var range = max - min;
      if (range === 0)
        return [min];
      var step = niceStep(range, maxTicks);
      var start = Math.ceil(min / step) * step;
      var ticks = [];
      for (var v = start; v <= max + step * 1e-3; v += step) {
        ticks.push(v);
      }
      return ticks;
    }
    function formatValue(v) {
      if (v === 0)
        return "0";
      var abs = Math.abs(v);
      if (abs >= 1e6)
        return (v / 1e6).toFixed(1) + "M";
      if (abs >= 1e4)
        return (v / 1e3).toFixed(1) + "k";
      if (abs >= 100)
        return v.toFixed(0);
      if (abs >= 1)
        return v.toFixed(2);
      if (abs >= 0.01)
        return v.toFixed(3);
      if (abs >= 1e-3)
        return v.toFixed(4);
      return v.toExponential(1);
    }
    function drawGrid(ctx, pad, w, h, yTicks, toY) {
      ctx.save();
      ctx.strokeStyle = THEME.grid;
      ctx.lineWidth = 1;
      for (var i = 0; i < yTicks.length; i++) {
        var y = Math.round(toY(yTicks[i])) + 0.5;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();
      }
      ctx.restore();
    }
    function drawYAxis(ctx, pad, h, yTicks, toY) {
      ctx.save();
      ctx.fillStyle = THEME.fgSubtle;
      ctx.font = THEME.tinySize + " " + THEME.fontMono;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (var i = 0; i < yTicks.length; i++) {
        var y = toY(yTicks[i]);
        ctx.fillText(formatValue(yTicks[i]), pad.left - 6, y);
      }
      ctx.restore();
    }
    function drawXAxis(ctx, pad, w, h, labels, toX, axisLabel) {
      ctx.save();
      ctx.fillStyle = THEME.fgSubtle;
      ctx.font = THEME.tinySize + " " + THEME.fontMono;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      var y = h - pad.bottom + 8;
      for (var i = 0; i < labels.length; i++) {
        var x = toX(labels[i].value);
        ctx.fillText(labels[i].text, x, y);
      }
      if (axisLabel) {
        ctx.fillStyle = THEME.fgSubtle;
        ctx.font = THEME.tinySize + " " + THEME.font;
        ctx.textAlign = "center";
        ctx.fillText(axisLabel, pad.left + (w - pad.left - pad.right) / 2, h - 4);
      }
      ctx.restore();
    }
    function drawLine(ctx, points, toX, toY, color, lineWidth) {
      if (points.length < 1)
        return;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth || 1.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      for (var i = 0; i < points.length; i++) {
        var x = toX(points[i].x);
        var y = toY(points[i].y);
        if (i === 0)
          ctx.moveTo(x, y);
        else
          ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }
    function drawLegend(ctx, items, x, y) {
      ctx.save();
      ctx.font = THEME.tinySize + " " + THEME.font;
      ctx.textBaseline = "middle";
      var curX = x;
      for (var i = 0; i < items.length; i++) {
        ctx.fillStyle = items[i].color;
        ctx.fillRect(curX, y - 4, 10, 8);
        ctx.fillStyle = THEME.fgMuted;
        ctx.textAlign = "left";
        ctx.fillText(items[i].label, curX + 14, y);
        curX += 14 + ctx.measureText(items[i].label).width + 16;
      }
      ctx.restore();
    }
    function emaSmooth(values, alpha) {
      if (!values.length)
        return [];
      var result = [values[0]];
      for (var i = 1; i < values.length; i++) {
        result.push(alpha * values[i] + (1 - alpha) * result[i - 1]);
      }
      return result;
    }
    function findNearestPoint(mouseX, points, toX, threshold) {
      threshold = threshold || 20;
      var best = null;
      var bestDist = threshold;
      for (var i = 0; i < points.length; i++) {
        var px = toX(points[i].x);
        var dist = Math.abs(px - mouseX);
        if (dist < bestDist) {
          bestDist = dist;
          best = { index: i, point: points[i], screenX: px };
        }
      }
      return best;
    }
    function chartLayout(w, h, opts) {
      opts = opts || {};
      var top = opts.top || 12;
      var right = opts.right || 16;
      var bottom = opts.bottom || 32;
      var left = opts.left || 56;
      return {
        top,
        right,
        bottom,
        left,
        plotW: w - left - right,
        plotH: h - top - bottom
      };
    }
    function makeScaleX(pad, plotW, count) {
      return function(i) {
        if (count <= 1)
          return pad.left + plotW / 2;
        return pad.left + i / (count - 1) * plotW;
      };
    }
    function makeScaleY(pad, plotH, min, max) {
      var range = max - min;
      if (range === 0)
        range = 1;
      return function(v) {
        return pad.top + plotH - (v - min) / range * plotH;
      };
    }
    function MetricPicker(bridge2, options) {
      this.bridge = bridge2;
      this.label = options && options.label || "Metric";
      this.onChange = options && options.onChange || function() {
      };
      this.el = null;
      this.select = null;
    }
    MetricPicker.prototype.render = function(container) {
      this.el = document.createElement("div");
      this.el.style.cssText = "display:flex;align-items:center;gap:6px;";
      var label = document.createElement("span");
      label.textContent = this.label + ":";
      label.style.cssText = "font-size:" + THEME.tinySize + ";color:" + THEME.fgSubtle + ";";
      this.el.appendChild(label);
      this.select = document.createElement("select");
      var placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Loading...";
      placeholder.disabled = true;
      placeholder.selected = true;
      this.select.appendChild(placeholder);
      var self = this;
      this.select.addEventListener("change", function() {
        self.onChange(self.select.value);
      });
      this.el.appendChild(this.select);
      container.appendChild(this.el);
    };
    MetricPicker.prototype.load = function(runId) {
      var self = this;
      return this.bridge.listMetrics(runId).then(function(resp) {
        var metrics = resp.metrics || [];
        self.select.innerHTML = "";
        if (metrics.length === 0) {
          var empty = document.createElement("option");
          empty.value = "";
          empty.textContent = "No metrics found";
          empty.disabled = true;
          empty.selected = true;
          self.select.appendChild(empty);
          return metrics;
        }
        for (var i = 0; i < metrics.length; i++) {
          var opt = document.createElement("option");
          opt.value = metrics[i];
          opt.textContent = metrics[i];
          self.select.appendChild(opt);
        }
        self.select.value = metrics[0];
        self.onChange(metrics[0]);
        return metrics;
      }).catch(function() {
        self.select.innerHTML = "";
        var err = document.createElement("option");
        err.value = "";
        err.textContent = "Error loading metrics";
        err.disabled = true;
        err.selected = true;
        self.select.appendChild(err);
        return [];
      });
    };
    MetricPicker.prototype.setValue = function(value) {
      if (this.select)
        this.select.value = value;
    };
    injectBaseStyles();
    var bridge = new AthenaBridge();
    var canvas = document.getElementById("canvas");
    var tooltip = document.getElementById("tooltip");
    var header = document.getElementById("header");
    var status = document.getElementById("status");
    var chartContainer = document.getElementById("chartContainer");
    var selectedMetric = "";
    var runData = {};
    var smoothingAlpha = 0;
    var logScale = false;
    var runIds = [];
    var runContexts = [];
    var subscriptionIds = [];
    var controls = document.createElement("div");
    controls.style.cssText = "display:flex;align-items:center;gap:6px;flex-shrink:0;";
    var smoothBtn = document.createElement("button");
    smoothBtn.textContent = "Smooth";
    smoothBtn.title = "Toggle EMA smoothing";
    smoothBtn.addEventListener("click", function() {
      if (smoothingAlpha === 0) {
        smoothingAlpha = 0.6;
        smoothBtn.classList.add("active");
      } else {
        smoothingAlpha = 0;
        smoothBtn.classList.remove("active");
      }
      render();
    });
    controls.appendChild(smoothBtn);
    var scaleBtn = document.createElement("button");
    scaleBtn.textContent = "Linear";
    scaleBtn.title = "Toggle log/linear scale";
    scaleBtn.addEventListener("click", function() {
      logScale = !logScale;
      scaleBtn.textContent = logScale ? "Log" : "Linear";
      if (logScale)
        scaleBtn.classList.add("active");
      else
        scaleBtn.classList.remove("active");
      render();
    });
    controls.appendChild(scaleBtn);
    var picker = new MetricPicker(bridge, {
      label: "Metric",
      onChange: function(metric) {
        selectedMetric = metric;
        loadMetricData();
      }
    });
    picker.render(controls);
    header.appendChild(controls);
    function loadMetricData() {
      if (!selectedMetric || runIds.length === 0) {
        render();
        return;
      }
      status.textContent = "Loading " + selectedMetric + "...";
      bridge.queryMetrics(runIds, [selectedMetric]).then(function(resp) {
        var metricsMap = resp.metrics || {};
        for (var i = 0; i < runIds.length; i++) {
          var rid = runIds[i];
          var runMetrics = metricsMap[rid];
          if (!runMetrics)
            continue;
          var points = runMetrics[selectedMetric] || [];
          runData[rid] = runData[rid] || { values: [], labels: [], color: "", name: "" };
          runData[rid].values = [];
          runData[rid].labels = [];
          for (var j = 0; j < points.length; j++) {
            runData[rid].values.push(points[j].value);
            runData[rid].labels.push(points[j].step != null ? points[j].step : j);
          }
        }
        status.textContent = selectedMetric + " \xB7 " + totalPoints() + " points";
        render();
      }).catch(function(err) {
        status.textContent = "Error: " + (err.message || err);
        render();
      });
    }
    function totalPoints() {
      var n = 0;
      for (var k in runData) {
        if (runData.hasOwnProperty(k))
          n += runData[k].values.length;
      }
      return n;
    }
    function render() {
      var info = setupCanvas(canvas);
      var ctx = info.ctx;
      var w = info.w;
      var h = info.h;
      ctx.fillStyle = THEME.bg;
      ctx.fillRect(0, 0, w, h);
      var allValues = [];
      var allLabels = [];
      var series = [];
      for (var i = 0; i < runIds.length; i++) {
        var rid = runIds[i];
        var rd = runData[rid];
        if (!rd || !rd.values.length)
          continue;
        var vals = rd.values;
        if (smoothingAlpha > 0) {
          vals = emaSmooth(vals, smoothingAlpha);
        }
        var pts = [];
        for (var j = 0; j < vals.length; j++) {
          var yVal = vals[j];
          if (logScale && yVal > 0)
            yVal = Math.log10(yVal);
          else if (logScale && yVal <= 0)
            yVal = -10;
          pts.push({ x: j, y: yVal });
          allValues.push(yVal);
          allLabels.push(rd.labels[j]);
        }
        series.push({
          runId: rid,
          points: pts,
          color: rd.color || THEME.runColors[i % THEME.runColors.length],
          name: rd.name || "Run " + (i + 1)
        });
      }
      if (allValues.length === 0) {
        ctx.fillStyle = THEME.fgSubtle;
        ctx.font = "13px " + THEME.font;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(selectedMetric ? "Waiting for data..." : "Select a metric above", w / 2, h / 2);
        return;
      }
      var minY = Math.min.apply(null, allValues);
      var maxY = Math.max.apply(null, allValues);
      var range = niceRange(minY, maxY);
      minY = range.min;
      maxY = range.max;
      var maxX = 0;
      for (var s = 0; s < series.length; s++) {
        var last = series[s].points.length - 1;
        if (last > maxX)
          maxX = last;
      }
      var pad = chartLayout(w, h, { left: 60, bottom: 36, top: 16, right: 16 });
      var toX = makeScaleX(pad, pad.plotW, maxX + 1);
      var toY = makeScaleY(pad, pad.plotH, minY, maxY);
      var yTicks = generateTicks(minY, maxY, 5);
      drawGrid(ctx, pad, w, h, yTicks, toY);
      drawYAxis(ctx, pad, h, yTicks, toY);
      var xTickCount = Math.min(maxX + 1, 6);
      var xLabels = [];
      for (var xi = 0; xi < xTickCount; xi++) {
        var idx = Math.round(xi / (xTickCount - 1) * maxX);
        var labelVal = idx;
        for (var si = 0; si < series.length; si++) {
          if (series[si].points.length > idx) {
            labelVal = idx;
            break;
          }
        }
        xLabels.push({ value: idx, text: String(labelVal) });
      }
      drawXAxis(ctx, pad, w, h, xLabels, toX, logScale ? "Step (log scale)" : "Step");
      for (var li = 0; li < series.length; li++) {
        drawLine(ctx, series[li].points, toX, toY, series[li].color, 1.5);
      }
      if (series.length > 0) {
        var legendItems = [];
        for (var lgi = 0; lgi < series.length; lgi++) {
          legendItems.push({ color: series[lgi].color, label: series[lgi].name });
        }
        drawLegend(ctx, legendItems, pad.left, h - 4);
      }
      canvas._series = series;
      canvas._toX = toX;
      canvas._toY = toY;
      canvas._pad = pad;
      canvas._minY = minY;
      canvas._maxY = maxY;
    }
    canvas.addEventListener("mousemove", function(e) {
      if (!canvas._series || !canvas._series.length) {
        tooltip.style.display = "none";
        return;
      }
      var rect = canvas.getBoundingClientRect();
      var mouseX = e.clientX - rect.left;
      var mouseY = e.clientY - rect.top;
      var pad = canvas._pad;
      if (mouseX < pad.left || mouseX > rect.width - pad.right || mouseY < pad.top || mouseY > rect.height - pad.bottom) {
        tooltip.style.display = "none";
        return;
      }
      var hits = [];
      for (var i = 0; i < canvas._series.length; i++) {
        var nearest = findNearestPoint(mouseX, canvas._series[i].points, canvas._toX, 30);
        if (nearest) {
          hits.push({
            series: canvas._series[i],
            nearest
          });
        }
      }
      if (hits.length === 0) {
        tooltip.style.display = "none";
        return;
      }
      var lines = [];
      for (var hi = 0; hi < hits.length; hi++) {
        var h = hits[hi];
        var rawVal = h.nearest.point.y;
        if (logScale)
          rawVal = Math.pow(10, rawVal);
        var dot = '<span style="color:' + h.series.color + ';">\u25CF</span>';
        lines.push(dot + " " + h.series.name + ": " + formatValue(rawVal));
      }
      lines.push('<span style="color:' + THEME.fgSubtle + ';">step ' + hits[0].nearest.point.x + "</span>");
      tooltip.innerHTML = lines.join("<br>");
      tooltip.style.display = "block";
      var tipX = hits[0].nearest.screenX + 12;
      var tipY = mouseY - 10;
      var tipRect = tooltip.getBoundingClientRect();
      var containerRect = chartContainer.getBoundingClientRect();
      if (tipX + tipRect.width > containerRect.width - 8) {
        tipX = hits[0].nearest.screenX - tipRect.width - 12;
      }
      if (tipY + tipRect.height > containerRect.height - 8) {
        tipY = containerRect.height - tipRect.height - 8;
      }
      if (tipY < 4)
        tipY = 4;
      tooltip.style.left = tipX + "px";
      tooltip.style.top = tipY + "px";
    });
    canvas.addEventListener("mouseleave", function() {
      tooltip.style.display = "none";
    });
    var resizeTimer = null;
    window.addEventListener("resize", function() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(render, 50);
    });
    bridge.waitInit().then(function(init) {
      runContexts = init.runs || [];
      runIds = [];
      for (var i = 0; i < runContexts.length; i++) {
        var rid = runContexts[i].id;
        runIds.push(rid);
        runData[rid] = {
          values: [],
          labels: [],
          color: runContexts[i].color || THEME.runColors[i % THEME.runColors.length],
          name: runContexts[i].name || "Run " + (i + 1)
        };
      }
      if (runIds.length === 0 && (init.run_id || init.inputs && init.inputs.run_id)) {
        var singleId = init.run_id || init.inputs.run_id;
        runIds = [singleId];
        runData[singleId] = {
          values: [],
          labels: [],
          color: THEME.runColors[0],
          name: "Run"
        };
      }
      if (runIds.length === 0) {
        status.textContent = "No runs provided";
        return;
      }
      picker.load(runIds[0]).then(function() {
        if (init.saved_state && init.saved_state.selectedMetric) {
          selectedMetric = init.saved_state.selectedMetric;
          picker.setValue(selectedMetric);
          loadMetricData();
        }
      });
      for (var si = 0; si < runIds.length; si++) {
        (function(rid2) {
          var subId = bridge.subscribeEvents(rid2, { event_type: "metric" }, function(event) {
            var name = event.event_name;
            var payload = event.payload || {};
            if (!name || payload.value === void 0)
              return;
            if (name !== selectedMetric)
              return;
            var rd = runData[rid2];
            if (!rd)
              return;
            var yVal = payload.value;
            var step = payload.step != null ? payload.step : rd.values.length;
            rd.values.push(yVal);
            rd.labels.push(step);
            status.textContent = selectedMetric + " \xB7 " + totalPoints() + " points";
            render();
          });
          subscriptionIds.push(subId);
        })(runIds[si]);
      }
      render();
    });
  })();
})();
