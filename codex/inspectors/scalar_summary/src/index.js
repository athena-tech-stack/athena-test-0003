(function () {
  'use strict';

  // ── Theme ──────────────────────────────────────────────────────────────
  var THEME = {
    bg: '#0D0D0F', surface: '#141417', elevated: '#1A1A1F',
    fg: '#FAFAF9', fgMuted: '#A1A1A1', fgSubtle: '#6B6B6B',
    line: '#2a2a30', grid: '#1A1A1F',
    accent: '#D4AF37', accentLight: '#F5D76E',
    runColors: ['#3b82f6','#ef4444','#10b981','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#f97316'],
    font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontMono: "'SF Mono', 'JetBrains Mono', 'Menlo', monospace",
    headerSize: '13px', headerWeight: '600', headerSpacing: '0.02em',
    bodySize: '12px', smallSize: '11px', tinySize: '10px',
    headerPad: '12px 16px 4px', statusPad: '2px 16px 8px', chartPad: '8px 16px 16px',
  };

  // ── Base styles ────────────────────────────────────────────────────────
  function injectBaseStyles() {
    var s = document.createElement('style');
    s.textContent = [
      '*, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }',
      'body {',
      '  background:' + THEME.bg + ';',
      '  color:' + THEME.fg + ';',
      '  font-family:' + THEME.font + ';',
      '  font-size:' + THEME.bodySize + ';',
      '  display:flex; flex-direction:column; height:100vh; overflow:hidden;',
      '}',
      '.header {',
      '  padding:' + THEME.headerPad + ';',
      '  font-size:' + THEME.headerSize + ';',
      '  font-weight:' + THEME.headerWeight + ';',
      '  letter-spacing:' + THEME.headerSpacing + ';',
      '  color:' + THEME.fgMuted + ';',
      '  border-bottom:1px solid ' + THEME.line + ';',
      '  flex-shrink:0;',
      '}',
      '.scroll-container {',
      '  flex:1; overflow-y:auto; overflow-x:hidden;',
      '}',
      '.scroll-container::-webkit-scrollbar { width:6px; }',
      '.scroll-container::-webkit-scrollbar-track { background:transparent; }',
      '.scroll-container::-webkit-scrollbar-thumb { background:' + THEME.line + '; border-radius:3px; }',
      '.scroll-container::-webkit-scrollbar-thumb:hover { background:' + THEME.fgSubtle + '; }',
      'select, button {',
      '  background:' + THEME.surface + '; color:' + THEME.fg + ';',
      '  border:1px solid ' + THEME.line + '; border-radius:4px;',
      '  font-family:' + THEME.font + '; font-size:' + THEME.smallSize + ';',
      '  padding:4px 8px; cursor:pointer; outline:none;',
      '}',
      'select:hover, button:hover { border-color:' + THEME.fgSubtle + '; }',

      /* Card styles */
      '.metric-card {',
      '  background:' + THEME.surface + ';',
      '  border:1px solid ' + THEME.line + ';',
      '  border-radius:6px; padding:12px;',
      '  transition: border-color 0.15s ease;',
      '}',
      '.metric-card:hover { border-color: rgba(212,175,55,0.4); }',
      '.card-name {',
      '  font-size:' + THEME.smallSize + ';',
      '  color:' + THEME.fgMuted + ';',
      '  font-weight:600;',
      '  margin-bottom:6px;',
      '  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;',
      '}',
      '.card-value {',
      '  font-size:20px; font-weight:700;',
      '  font-family:' + THEME.fontMono + ';',
      '  margin-bottom:2px;',
      '}',
      '.card-trend {',
      '  font-size:' + THEME.smallSize + ';',
      '  margin-bottom:6px;',
      '}',
      '.card-trend.up   { color:#10b981; }',
      '.card-trend.down { color:#ef4444; }',
      '.card-trend.flat { color:' + THEME.fgSubtle + '; }',
      '.card-stats {',
      '  font-size:' + THEME.tinySize + ';',
      '  color:' + THEME.fgSubtle + ';',
      '  margin-bottom:8px;',
      '  font-family:' + THEME.fontMono + ';',
      '}',
      '.card-sparkline { height:60px; }',
      '.card-sparkline canvas { display:block; width:100%; height:100%; }',

      '.empty-state {',
      '  text-align:center; color:' + THEME.fgSubtle + ';',
      '  padding:40px 16px; font-size:' + THEME.bodySize + ';',
      '}',
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── AthenaBridge ───────────────────────────────────────────────────────
  function AthenaBridge() {
    this._handlers = {};
    this._pending = {};
    this._subscriptions = {};
    this._reqId = 0;

    this.runs = [];
    this.artifactIds = [];
    this.labId = null;
    this.inspectorId = null;

    var self = this;
    window.addEventListener('message', function (e) {
      if (e.data && typeof e.data === 'object' && e.data.type) {
        self._dispatch(e.data);
      }
    });
  }

  AthenaBridge.prototype._dispatch = function (msg) {
    var type = msg.type;

    // Resolve pending promises (data responses)
    if (type === 'data' && msg.request_id && this._pending[msg.request_id]) {
      this._pending[msg.request_id].resolve(msg);
      delete this._pending[msg.request_id];
      return;
    }

    // Route subscription events
    if (type === 'event' && msg.subscription_id && this._subscriptions[msg.subscription_id]) {
      this._subscriptions[msg.subscription_id](msg.event);
      return;
    }

    // Init message
    if (type === 'init') {
      this.runs = (msg.run_ids || [msg.run_id]).map(function (id, i) {
        return {
          id: id,
          name: msg.run_names ? msg.run_names[i] : null,
          number: msg.run_numbers ? msg.run_numbers[i] : null,
        };
      });
      this.artifactIds = msg.artifact_ids || [];
      this.labId = msg.lab_id || null;
      this.inspectorId = msg.inspector_id || null;
    }

    // Fire registered handlers
    var handlers = this._handlers[type];
    if (handlers) {
      for (var i = 0; i < handlers.length; i++) {
        handlers[i](msg);
      }
    }
  };

  AthenaBridge.prototype.on = function (type, handler) {
    if (!this._handlers[type]) this._handlers[type] = [];
    this._handlers[type].push(handler);
  };

  AthenaBridge.prototype.ready = function () {
    window.parent.postMessage({ type: 'ready' }, '*');
  };

  AthenaBridge.prototype._request = function (msg) {
    var id = 'req-' + (++this._reqId);
    msg.request_id = id;
    var self = this;
    var p = new Promise(function (resolve, reject) {
      self._pending[id] = { resolve: resolve, reject: reject };
    });
    window.parent.postMessage(msg, '*');
    return p;
  };

  AthenaBridge.prototype.listMetrics = function (runId) {
    return this._request({
      type: 'query_events',
      run_id: runId,
      filter: { event_type: 'metric' },
    });
  };

  AthenaBridge.prototype.queryMetrics = function (runIds, metricNames) {
    var promises = [];
    for (var i = 0; i < runIds.length; i++) {
      promises.push(this._request({
        type: 'query_events',
        run_id: runIds[i],
        filter: { event_type: 'metric' },
      }));
    }
    return Promise.all(promises);
  };

  AthenaBridge.prototype.subscribeEvents = function (runId, filter, callback) {
    var subId = 'sub-' + runId + '-' + (++this._reqId);
    this._subscriptions[subId] = callback;
    window.parent.postMessage({
      type: 'subscribe_events',
      subscription_id: subId,
      run_id: runId,
      filter: filter,
    }, '*');
    return subId;
  };

  AthenaBridge.prototype.getRunIds = function () {
    return this.runs.map(function (r) { return r.id; });
  };

  AthenaBridge.prototype.getRunColor = function (runId) {
    var ids = this.getRunIds();
    var idx = ids.indexOf(runId);
    return THEME.runColors[idx >= 0 ? idx % THEME.runColors.length : 0];
  };

  AthenaBridge.prototype.getRunName = function (runId) {
    for (var i = 0; i < this.runs.length; i++) {
      if (this.runs[i].id === runId) {
        return this.runs[i].name || ('#' + (this.runs[i].number || runId.slice(0, 6)));
      }
    }
    return runId.slice(0, 6);
  };

  // ── Helpers ────────────────────────────────────────────────────────────
  function formatValue(v) {
    if (v === null || v === undefined) return '--';
    var n = Number(v);
    if (isNaN(n)) return String(v);
    var abs = Math.abs(n);
    if (abs >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return (n / 1e3).toFixed(2) + 'k';
    if (abs >= 1) return n.toFixed(3);
    if (abs >= 0.001) return n.toFixed(4);
    if (abs === 0) return '0';
    return n.toExponential(2);
  }

  function computeTrend(values) {
    if (!values || values.length < 2) return 'flat';
    var tail = values.slice(-5);
    if (tail.length < 2) return 'flat';
    var first = tail[0];
    var last = tail[tail.length - 1];
    var diff = last - first;
    var range = Math.max(Math.abs(first), Math.abs(last), 1e-9);
    var pct = diff / range;
    if (pct > 0.01) return 'up';
    if (pct < -0.01) return 'down';
    return 'flat';
  }

  function trendArrow(dir) {
    if (dir === 'up') return '\u2191';
    if (dir === 'down') return '\u2193';
    return '\u2192';
  }

  // ── Sparkline drawing ─────────────────────────────────────────────────
  function drawSparkline(canvas, values, color) {
    if (!values || values.length === 0) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    var min = Infinity, max = -Infinity;
    for (var i = 0; i < values.length; i++) {
      if (values[i] < min) min = values[i];
      if (values[i] > max) max = values[i];
    }
    var range = max - min || 1;
    var pad = 2;

    // Build path
    var step = w / Math.max(values.length - 1, 1);
    var points = [];
    for (var j = 0; j < values.length; j++) {
      var x = j * step;
      var y = h - ((values[j] - min) / range) * (h - pad * 2) - pad;
      points.push([x, y]);
    }

    // Area fill
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (var k = 1; k < points.length; k++) {
      ctx.lineTo(points[k][0], points[k][1]);
    }
    ctx.lineTo(points[points.length - 1][0], h);
    ctx.lineTo(points[0][0], h);
    ctx.closePath();
    ctx.fillStyle = color + '18'; // ~10% opacity
    ctx.fill();

    // Stroke
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (var m = 1; m < points.length; m++) {
      ctx.lineTo(points[m][0], points[m][1]);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // ── Inspector logic ────────────────────────────────────────────────────

  // State: { [metricName]: { [runId]: { values, current, min, max, sum, count } } }
  var metrics = {};
  var grid = document.getElementById('grid');
  var cardElements = {}; // { metricName: DOM node }

  function ensureMetric(metricName, runId) {
    if (!metrics[metricName]) metrics[metricName] = {};
    if (!metrics[metricName][runId]) {
      metrics[metricName][runId] = {
        values: [], current: 0, min: Infinity, max: -Infinity, sum: 0, count: 0,
      };
    }
    return metrics[metricName][runId];
  }

  function recordValue(metricName, runId, value) {
    var m = ensureMetric(metricName, runId);
    m.values.push(value);
    if (m.values.length > 100) m.values = m.values.slice(-100);
    m.current = value;
    if (value < m.min) m.min = value;
    if (value > m.max) m.max = value;
    m.sum += value;
    m.count += 1;
  }

  function getOrCreateCard(metricName) {
    if (cardElements[metricName]) return cardElements[metricName];

    var card = document.createElement('div');
    card.className = 'metric-card';

    var nameEl = document.createElement('div');
    nameEl.className = 'card-name';
    nameEl.textContent = metricName;
    nameEl.title = metricName;

    var valueEl = document.createElement('div');
    valueEl.className = 'card-value';
    valueEl.textContent = '--';

    var trendEl = document.createElement('div');
    trendEl.className = 'card-trend flat';
    trendEl.textContent = '\u2192 flat';

    var statsEl = document.createElement('div');
    statsEl.className = 'card-stats';
    statsEl.textContent = 'min -- / max -- / mean --';

    var sparkDiv = document.createElement('div');
    sparkDiv.className = 'card-sparkline';
    var canvas = document.createElement('canvas');
    sparkDiv.appendChild(canvas);

    card.appendChild(nameEl);
    card.appendChild(valueEl);
    card.appendChild(trendEl);
    card.appendChild(statsEl);
    card.appendChild(sparkDiv);

    grid.appendChild(card);
    cardElements[metricName] = {
      root: card, name: nameEl, value: valueEl,
      trend: trendEl, stats: statsEl, canvas: canvas,
    };
    return cardElements[metricName];
  }

  function updateCard(metricName, runId, color) {
    var card = getOrCreateCard(metricName);
    var data = metrics[metricName];

    // Use first run for the primary value display; merge all run values for sparkline
    var allValues = [];
    var primaryRunId = runId || Object.keys(data)[0];
    var primary = data[primaryRunId];
    if (!primary) return;

    // Aggregate all run values for multi-run sparkline
    var runIds = Object.keys(data);
    if (runIds.length === 1) {
      allValues = primary.values;
    } else {
      allValues = primary.values;
    }

    card.value.textContent = formatValue(primary.current);

    var trend = computeTrend(primary.values);
    card.trend.className = 'card-trend ' + trend;
    card.trend.textContent = trendArrow(trend) + ' ' + trend;

    var mean = primary.count > 0 ? primary.sum / primary.count : 0;
    card.stats.textContent =
      'min ' + formatValue(primary.min) +
      ' / max ' + formatValue(primary.max) +
      ' / mean ' + formatValue(mean);

    drawSparkline(card.canvas, allValues, color || THEME.runColors[0]);
  }

  function removeEmptyState() {
    var empty = document.getElementById('empty-state');
    if (empty) empty.parentNode.removeChild(empty);
  }

  function showEmptyState() {
    if (Object.keys(cardElements).length > 0) return;
    if (document.getElementById('empty-state')) return;
    var el = document.createElement('div');
    el.id = 'empty-state';
    el.className = 'empty-state';
    el.textContent = 'Waiting for metrics\u2026';
    grid.appendChild(el);
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────
  injectBaseStyles();
  showEmptyState();

  var bridge = new AthenaBridge();

  bridge.on('init', function (msg) {
    var runIds = bridge.getRunIds();

    // Backfill: query existing metric events for each run
    bridge.queryMetrics(runIds, []).then(function (responses) {
      for (var i = 0; i < responses.length; i++) {
        var resp = responses[i];
        var rid = runIds[i];
        var events = resp.events || [];
        for (var j = 0; j < events.length; j++) {
          var evt = events[j];
          if (evt.event_type === 'metric') {
            var name = evt.event_name;
            var val = evt.payload && evt.payload.value;
            if (name && val !== undefined) {
              removeEmptyState();
              recordValue(name, rid, val);
              updateCard(name, rid, bridge.getRunColor(rid));
            }
          }
        }
      }
    });

    // Subscribe to live metric events for each run
    for (var k = 0; k < runIds.length; k++) {
      (function (rid) {
        bridge.subscribeEvents(rid, { event_type: 'metric' }, function (event) {
          // CRITICAL: use event.event_name and event.payload.value
          var name = event.event_name;
          var val = event.payload && event.payload.value;
          if (!name || val === undefined) return;
          removeEmptyState();
          recordValue(name, rid, val);
          updateCard(name, rid, bridge.getRunColor(rid));
        });
      })(runIds[k]);
    }
  });

  bridge.ready();
})();
