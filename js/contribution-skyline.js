/**
 * Contribution Skyline - Vanilla JS Implementation for JOKI.IN Workplace Admin
 * GitHub-style annual activity heat map that transforms into an isometric 3D skyline.
 * Converted faithfully from contribution-skyline.tsx
 */

(function (window) {
  'use strict';

  const DAY_MS = 86400000;

  const clamp01 = (v) => (v > 0 ? (v < 1 ? v : 1) : 0);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOutCubic = (x) => {
    const t = clamp01(x);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };
  const easeOutCubic = (x) => 1 - Math.pow(1 - clamp01(x), 3);
  const smoothstep = (a, b, x) => {
    const t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };

  const toKey = (ms) => new Date(ms).toISOString().slice(0, 10);

  const dayMs = (v) => {
    if (typeof v === 'number') return Math.floor(v / DAY_MS) * DAY_MS;
    if (typeof v === 'string') {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
      if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
      v = new Date(v);
    }
    return Date.UTC(v.getFullYear(), v.getMonth(), v.getDate());
  };

  // mulberry32 deterministic generator
  const rng = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const generateContributions = (endMs, seed = 7, days = 371) => {
    const r = rng(seed);
    const bursts = Array.from({ length: 4 }, () => ({
      at: r(),
      width: 0.035 + r() * 0.07,
      gain: 0.6 + r() * 1.1,
    }));
    const out = [];
    let mood = 0.5;
    for (let i = 0; i < days; i++) {
      const ms = endMs - (days - 1 - i) * DAY_MS;
      const x = i / Math.max(1, days - 1);
      const dow = new Date(ms).getUTCDay();
      const weekend = dow === 0 || dow === 6;
      let heat = 0.2;
      for (const b of bursts) heat += b.gain * Math.exp(-((x - b.at) ** 2) / (2 * b.width ** 2));
      mood = mood * 0.85 + r() * 0.15;
      heat *= 0.55 + mood * 0.9;
      const pActive = Math.min(0.94, (weekend ? 0.22 : 0.5) + heat * 0.4);
      let count = 0;
      if (r() < pActive) count = 1 + Math.floor(-Math.log(1 - r()) * (1.2 + heat * 7) * (weekend ? 0.5 : 1));
      if (r() < 0.01) count += 18 + Math.floor(r() * 24);
      out.push({ date: toKey(ms), count });
    }
    return out;
  };

  const levelOf = (count, busy) =>
    count <= 0 ? 0 : busy <= 0 ? 4 : 1 + Math.min(3, Math.floor((count / busy) * 4));

  const buildGrid = (data, endMs, weekStart = 0) => {
    const counts = new Map();
    for (const d of data) {
      if (!d || typeof d.date !== 'string') continue;
      const ms = dayMs(d.date);
      const c = Number(d.count);
      if (!Number.isFinite(ms) || !(c > 0) || !Number.isFinite(c)) continue;
      const k = toKey(ms);
      counts.set(k, (counts.get(k) ?? 0) + c);
    }
    let start = endMs - 364 * DAY_MS;
    start -= ((new Date(start).getUTCDay() - weekStart + 7) % 7) * DAY_MS;
    const cells = [];
    for (let ms = start, i = 0; ms <= endMs; ms += DAY_MS, i++) {
      const date = toKey(ms);
      cells.push({ date, count: counts.get(date) ?? 0, level: 0, week: Math.floor(i / 7), day: i % 7 });
    }
    const nz = cells.map((c) => c.count).filter((c) => c > 0).sort((a, b) => a - b);
    const busy = nz.length ? nz[Math.floor(0.95 * (nz.length - 1))] : 0;
    for (const c of cells) c.level = levelOf(c.count, busy);
    return {
      cells,
      weeks: cells.length ? cells[cells.length - 1].week + 1 : 0,
      max: nz.length ? nz[nz.length - 1] : 0,
    };
  };

  const computeStats = (cells) => {
    let total = 0;
    let best = 0;
    let bestDate = null;
    let run = 0;
    let runStart = null;
    let longest = { days: 0, start: null, end: null };
    for (const c of cells) {
      total += c.count;
      if (c.count > best) {
        best = c.count;
        bestDate = c.date;
      }
      if (c.count > 0) {
        if (run === 0) runStart = c.date;
        run++;
        if (run > longest.days) longest = { days: run, start: runStart, end: c.date };
      } else run = 0;
    }
    let j = cells.length - 1;
    if (j >= 0 && cells[j].count === 0) j--;
    const endAt = j;
    while (j >= 0 && cells[j].count > 0) j--;
    const days = endAt - j;
    const current = days > 0 ? { days, start: cells[j + 1].date, end: cells[endAt].date } : { days: 0, start: null, end: null };
    return {
      total,
      first: cells.length ? cells[0].date : null,
      last: cells.length ? cells[cells.length - 1].date : null,
      busiest: { count: best, date: bestDate },
      longest,
      current,
    };
  };

  const monthLabels = (cells, weeks, locale = 'id-ID') => {
    const fmt = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
    const out = [];
    let prev = -1;
    for (let w = 0; w < weeks; w++) {
      const c = cells[w * 7];
      if (!c) break;
      const m = +c.date.slice(5, 7);
      if (m !== prev) out.push({ week: w, label: fmt.format(dayMs(c.date)) });
      prev = m;
    }
    if (out.length > 1 && out[1].week - out[0].week < 3) out.shift();
    return out;
  };

  const barHeight = (count, max, scale = 1) =>
    count > 0 && max > 0 ? 0.4 + Math.pow(count / max, 0.85) * 7.2 * scale : 0.2;

  const WAVE = 0.42;

  const riseAt = (t, week, weeks, day) => {
    const d = (weeks > 1 ? week / (weeks - 1) : 0) * 0.36 + (day / 6) * 0.06;
    return easeOutCubic((t - d) / (1 - WAVE));
  };

  const YAW_3D = Math.PI / 4;
  const ELEV_3D = (34 * Math.PI) / 180;
  const YAW_RANGE = [(8 * Math.PI) / 180, (82 * Math.PI) / 180];
  const ELEV_RANGE = [(18 * Math.PI) / 180, (62 * Math.PI) / 180];

  const camera = (e, dYaw = 0, dElev = 0) => {
    const yaw = Math.min(YAW_RANGE[1], Math.max(0, lerp(0, YAW_3D + dYaw, e)));
    const elev = lerp(Math.PI / 2, Math.min(ELEV_RANGE[1], Math.max(ELEV_RANGE[0], ELEV_3D + dElev)), e);
    return { cs: Math.cos(yaw), sn: Math.sin(yaw), se: Math.sin(elev), ce: Math.cos(elev) };
  };

  const project = (c, x, y, z) => [
    x * c.cs - y * c.sn,
    (x * c.sn + y * c.cs) * c.se - z * c.ce,
  ];

  const mixRGB = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const luminance = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

  const PALETTES = {
    github: { light: ['#c6e48b', '#7bc96f', '#239a3b', '#196127'], dark: ['#0e4429', '#006d32', '#26a641', '#39d353'] },
    ocean: { light: ['#b8e3f5', '#6ec3eb', '#2a8fd1', '#0b4f8a'], dark: ['#0c2d4a', '#12508a', '#2a88d8', '#7cc7ff'] },
    emerald: { light: ['#a7f3d0', '#34d399', '#059669', '#047857'], dark: ['#064e3b', '#047857', '#10b981', '#6ee7b7'] },
  };

  const resolvePalette = (p, dark) => {
    const pick = PALETTES[p] ? PALETTES[p][dark ? 'dark' : 'light'] : PALETTES.github[dark ? 'dark' : 'light'];
    const base = PALETTES.github[dark ? 'dark' : 'light'];
    return [0, 1, 2, 3].map((i) => pick[i] ?? base[i]);
  };

  let probe = null;
  const toRGB = (color, fallback) => {
    if (!probe) {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      probe = c.getContext('2d', { willReadFrequently: true });
    }
    if (!probe) return fallback;
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = 'rgba(0,0,0,0)';
    probe.fillStyle = color;
    probe.fillRect(0, 0, 1, 1);
    const d = probe.getImageData(0, 0, 1, 1).data;
    if (d[3] < 8) return fallback;
    return [d[0], d[1], d[2]];
  };

  const rgbString = (r, g, b) => 'rgb(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ')';

  const pointInQuad = (p, o, x, y) => {
    let sign = 0;
    for (let k = 0; k < 4; k++) {
      const ax = p[o + k * 2];
      const ay = p[o + k * 2 + 1];
      const bx = p[o + ((k + 1) % 4) * 2];
      const by = p[o + ((k + 1) % 4) * 2 + 1];
      const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
      if (Math.abs(cross) < 1e-9) continue;
      const s = cross > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
    return sign !== 0;
  };

  const quadPath = (ctx, p, o, r) => {
    if (r < 0.3) {
      ctx.moveTo(p[o], p[o + 1]);
      ctx.lineTo(p[o + 2], p[o + 3]);
      ctx.lineTo(p[o + 4], p[o + 5]);
      ctx.lineTo(p[o + 6], p[o + 7]);
      ctx.closePath();
      return;
    }
    ctx.moveTo((p[o + 6] + p[o]) / 2, (p[o + 7] + p[o + 1]) / 2);
    for (let k = 0; k < 4; k++) {
      const b = (k + 1) % 4;
      ctx.arcTo(p[o + k * 2], p[o + k * 2 + 1], p[o + b * 2], p[o + b * 2 + 1], r);
    }
    ctx.closePath();
  };

  class SkylineController {
    constructor(mountEl, options = {}) {
      this.mountEl = mountEl;
      this.options = Object.assign(
        {
          view: '3d', // default view
          palette: 'emerald',
          title: 'Aktivitas Layanan & Order Tahunan',
          unit: 'order',
          unitPlural: 'order',
          duration: 1300,
          weekStart: 0,
          orbit: true,
          showStats: true,
          showLegend: true,
          locale: 'id-ID',
          data: null,
        },
        options
      );

      this.currentView = this.options.view;
      this.legendLevel = -1;
      this.activeIdx = -1;
      this.tipW = 0;
      this.initDOM();
      this.initEngine();
    }

    initDOM() {
      this.mountEl.innerHTML = `
        <section class="skyline-card">
          <header class="skyline-header">
            <div class="skyline-title-group">
              <h3 class="skyline-heading" id="skyline-header-title">
                ${this.options.title}
              </h3>
              <p class="skyline-subheading" id="skyline-subheading">Memuat statistik 3D heat map...</p>
            </div>
            <div class="skyline-toggle-group" role="group" aria-label="Tampilan grafik">
              <span class="skyline-toggle-indicator" id="skyline-toggle-ind"></span>
              <button type="button" class="skyline-toggle-btn" id="skyline-btn-2d" title="Tampilan 2D Heat Map" aria-label="Tampilan 2D Heat Map">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                  <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1"/>
                  <rect x="9" y="1.5" width="5.5" height="5.5" rx="1"/>
                  <rect x="1.5" y="9" width="5.5" height="5.5" rx="1"/>
                  <rect x="9" y="9" width="5.5" height="5.5" rx="1"/>
                </svg>
              </button>
              <button type="button" class="skyline-toggle-btn active" id="skyline-btn-3d" title="Tampilan 3D Skyline" aria-label="Tampilan 3D Skyline">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
                  <path d="M8 1.2 14.2 4.6v6.8L8 14.8 1.8 11.4V4.6Z"/>
                  <path d="M1.8 4.6 8 8l6.2-3.4M8 8v6.8"/>
                </svg>
              </button>
            </div>
          </header>

          <div class="skyline-stage-outer">
            <div class="skyline-stage" id="skyline-stage">
              <canvas class="skyline-canvas" id="skyline-canvas" tabindex="0"></canvas>
              
              <!-- Floating Corner Stats for 3D View -->
              <div class="skyline-corner-stats top-right" id="skyline-corner-tr"></div>
              <div class="skyline-corner-stats bottom-left" id="skyline-corner-bl"></div>

              <!-- Tooltip -->
              <div class="skyline-tooltip" id="skyline-tooltip">
                <span id="skyline-tip-content"></span>
                <span class="skyline-tip-arrow"></span>
              </div>
            </div>

            <!-- Stats Bar (shown in 2D or mobile) -->
            <div class="skyline-stats-row" id="skyline-stats-row"></div>

            <!-- Footer Toolbar -->
            <footer class="skyline-footer">
              <span class="skyline-hint" id="skyline-hint">Geser untuk memutar sudut 3D · Klik ganda untuk reset</span>
              <div class="skyline-legend" id="skyline-legend">
                <span class="skyline-legend-text">Sedikit</span>
                <div class="skyline-swatches" id="skyline-swatches"></div>
                <span class="skyline-legend-text">Banyak</span>
              </div>
            </footer>
          </div>
        </section>
      `;

      this.stage = this.mountEl.querySelector('#skyline-stage');
      this.canvas = this.mountEl.querySelector('#skyline-canvas');
      this.tooltip = this.mountEl.querySelector('#skyline-tooltip');
      this.tipContent = this.mountEl.querySelector('#skyline-tip-content');
      this.btn2D = this.mountEl.querySelector('#skyline-btn-2d');
      this.btn3D = this.mountEl.querySelector('#skyline-btn-3d');
      this.toggleInd = this.mountEl.querySelector('#skyline-toggle-ind');
      this.headerTitle = this.mountEl.querySelector('#skyline-header-title');
      this.subheading = this.mountEl.querySelector('#skyline-subheading');
      this.cornerTR = this.mountEl.querySelector('#skyline-corner-tr');
      this.cornerBL = this.mountEl.querySelector('#skyline-corner-bl');
      this.statsRow = this.mountEl.querySelector('#skyline-stats-row');
      this.hint = this.mountEl.querySelector('#skyline-hint');
      this.swatchesContainer = this.mountEl.querySelector('#skyline-swatches');

      this.btn2D.addEventListener('click', () => this.setView('2d'));
      this.btn3D.addEventListener('click', () => this.setView('3d'));
      this.updateToggleUI();
    }

    setView(view) {
      if (this.currentView === view) return;
      this.currentView = view;
      this.target = view === '3d' ? 1 : 0;
      this.updateToggleUI();
      if (this.target === 0) {
        this.yawGoal = 0;
        this.elevGoal = 0;
      }
      this.hint.textContent =
        this.currentView === '3d'
          ? 'Geser untuk memutar sudut 3D · Klik ganda untuk reset'
          : 'Arahkan kursor pada kotak untuk detail · Gunakan tombol panah untuk menjelajah';
      this.updateCornerStatsVisibility();
      this.kick();
    }

    updateToggleUI() {
      const is3D = this.currentView === '3d';
      this.btn2D.classList.toggle('active', !is3D);
      this.btn3D.classList.toggle('active', is3D);
      this.toggleInd.style.transform = is3D ? 'translateX(100%)' : 'translateX(0)';
      this.btn2D.style.color = !is3D ? '#ffffff' : 'var(--ink-secondary)';
      this.btn3D.style.color = is3D ? '#ffffff' : 'var(--ink-secondary)';
    }

    setData(data) {
      this.options.data = data;
      this.rebuildModel();
      this.load();
      this.retheme();
      this.relayout();
      this.kick();
    }

    rebuildModel() {
      const end = dayMs(new Date());
      const days = this.options.data && this.options.data.length ? this.options.data : generateContributions(end, 7);
      const grid = buildGrid(days, end, this.options.weekStart);
      this.model = Object.assign({}, grid, {
        stats: computeStats(grid.cells),
        months: monthLabels(grid.cells, grid.weeks, this.options.locale),
      });

      const nf = new Intl.NumberFormat(this.options.locale);
      const dfy = new Intl.DateTimeFormat(this.options.locale, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
      const stats = this.model.stats;

      this.headerTitle.innerHTML = `<span style="font-weight: 800; font-variant-numeric: tabular-nums;">${nf.format(stats.total)}</span> order & aktivitas dalam 1 tahun terakhir`;
      this.subheading.textContent = `Visualisasi isometric 3D skyline aktivitas transaksi sistem dan pengerjaan tim.`;

      this.renderStatCards(stats, nf, dfy);
    }

    renderStatCards(stats, nf, dfy) {
      const formatRange = (a, b) => {
        if (!a || !b) return '-';
        return `${dfy.format(dayMs(a))} - ${dfy.format(dayMs(b))}`;
      };

      const blocks = [
        { label: 'Total 1 Tahun', value: nf.format(stats.total), unit: 'order', sub: formatRange(stats.first, stats.last) },
        { label: 'Hari Tersibuk', value: nf.format(stats.busiest.count), unit: 'order', sub: stats.busiest.date ? dfy.format(dayMs(stats.busiest.date)) : '-' },
        { label: 'Rentetan Terpanjang', value: nf.format(stats.longest.days), unit: 'hari', sub: formatRange(stats.longest.start, stats.longest.end) },
        { label: 'Rentetan Saat Ini', value: nf.format(stats.current.days), unit: 'hari', sub: formatRange(stats.current.start, stats.current.end) },
      ];

      // Corner floating stats in 3D
      this.cornerTR.innerHTML = `
        <div class="skyline-stat-pill">
          <span class="skyline-stat-label">${blocks[0].label}</span>
          <div class="skyline-stat-num-row">
            <span class="skyline-stat-num">${blocks[0].value}</span>
            <span class="skyline-stat-unit">${blocks[0].unit}</span>
          </div>
          <span class="skyline-stat-sub">${blocks[0].sub}</span>
        </div>
        <div class="skyline-stat-pill">
          <span class="skyline-stat-label">${blocks[1].label}</span>
          <div class="skyline-stat-num-row">
            <span class="skyline-stat-num">${blocks[1].value}</span>
            <span class="skyline-stat-unit">${blocks[1].unit}</span>
          </div>
          <span class="skyline-stat-sub">${blocks[1].sub}</span>
        </div>
      `;

      this.cornerBL.innerHTML = `
        <div class="skyline-stat-pill">
          <span class="skyline-stat-label">${blocks[2].label}</span>
          <div class="skyline-stat-num-row">
            <span class="skyline-stat-num">${blocks[2].value}</span>
            <span class="skyline-stat-unit">${blocks[2].unit}</span>
          </div>
          <span class="skyline-stat-sub">${blocks[2].sub}</span>
        </div>
        <div class="skyline-stat-pill">
          <span class="skyline-stat-label">${blocks[3].label}</span>
          <div class="skyline-stat-num-row">
            <span class="skyline-stat-num">${blocks[3].value}</span>
            <span class="skyline-stat-unit">${blocks[3].unit}</span>
          </div>
          <span class="skyline-stat-sub">${blocks[3].sub}</span>
        </div>
      `;

      // Static stats row (for 2D view and compact view)
      this.statsRow.innerHTML = blocks
        .map(
          (b) => `
        <div class="skyline-stat-box">
          <span class="skyline-stat-label">${b.label}</span>
          <div class="skyline-stat-num-row">
            <span class="skyline-stat-num">${b.value}</span>
            <span class="skyline-stat-unit">${b.unit}</span>
          </div>
          <span class="skyline-stat-sub">${b.sub}</span>
        </div>
      `
        )
        .join('');
    }

    updateCornerStatsVisibility() {
      const is3D = this.currentView === '3d';
      const isWide = this.W >= 560;
      const showCorners = is3D && isWide;
      this.cornerTR.style.display = showCorners ? 'flex' : 'none';
      this.cornerBL.style.display = showCorners ? 'flex' : 'none';
      this.statsRow.style.display = showCorners ? 'none' : 'grid';
    }

    initEngine() {
      const ctx = this.canvas.getContext('2d');
      if (!ctx) return;
      this.ctx = ctx;

      this.t = 0;
      this.target = this.currentView === '3d' ? 1 : 0;
      this.entered = false;
      this.yaw = 0;
      this.elev = 0;
      this.yawGoal = 0;
      this.elevGoal = 0;

      this.W = 0;
      this.H2 = 0;
      this.H3 = 0;
      this.Hmax = 0;
      this.lastH = -1;
      this.dpr = 1;
      this.gutter = 30;
      this.labelW = 30;
      this.font = '10px Plus Jakarta Sans, sans-serif';

      this.col = new Float32Array(15);
      this.colGoal = new Float32Array(15);
      this.colReady = false;
      this.fg = [23, 23, 23];
      this.bg = [255, 255, 255];
      this.isDark = false;

      this.n = 0;
      this.weeks = 0;
      this.wk = new Float32Array(0);
      this.dy = new Float32Array(0);
      this.lv = new Uint8Array(0);
      this.hgt = new Float32Array(0);
      this.zs = new Float32Array(0);
      this.hover = new Float32Array(0);
      this.dim = new Float32Array(0);
      this.polys = new Float32Array(0);
      this.faces = new Uint8Array(0);
      this.order = [];
      this.months = [];
      this.weekdayRows = [];

      this.hovered = -1;
      this.pinned = -1;
      this.activeIdx = -1;
      this.tipW = 0;
      this.raf = 0;
      this.last = 0;

      this.rebuildModel();
      this.load();
      this.retheme();
      this.relayout();

      this.attachEvents();

      // Intersection Observer auto-rise
      if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver(
          (entries) => {
            if (entries.some((en) => en.isIntersecting)) {
              this.enter();
              io.disconnect();
            }
          },
          { threshold: 0.25 }
        );
        io.observe(this.stage);
      } else {
        this.enter();
      }

      // Resize Observer
      const ro = new ResizeObserver(() => {
        if (Math.round(this.stage.clientWidth) !== this.W) this.relayout();
      });
      ro.observe(this.stage);
    }

    enter() {
      if (this.entered) return;
      this.entered = true;
      this.target = this.currentView === '3d' ? 1 : 0;
      this.kick();
    }

    load() {
      const m = this.model;
      this.n = m.cells.length;
      this.weeks = m.weeks;
      if (this.wk.length !== this.n) {
        this.wk = new Float32Array(this.n);
        this.dy = new Float32Array(this.n);
        this.lv = new Uint8Array(this.n);
        this.hgt = new Float32Array(this.n);
        this.zs = new Float32Array(this.n);
        this.hover = new Float32Array(this.n);
        this.dim = new Float32Array(this.n);
        this.polys = new Float32Array(this.n * 24);
        this.faces = new Uint8Array(this.n);
        this.order = Array.from({ length: this.n }, (_, i) => i);
      }
      for (let i = 0; i < this.n; i++) {
        const c = m.cells[i];
        this.wk[i] = c.week;
        this.dy[i] = c.day;
        this.lv[i] = c.level;
        this.hgt[i] = barHeight(c.count, m.max, 1);
      }
      this.months = m.months;
      const wf = new Intl.DateTimeFormat(this.options.locale, { weekday: 'short', timeZone: 'UTC' });
      this.weekdayRows = [];
      for (let d = 0; d < 7 && d < this.n; d++) {
        const dow = new Date(dayMs(m.cells[d].date)).getUTCDay();
        if (dow === 1 || dow === 3 || dow === 5) {
          this.weekdayRows.push({ day: d, label: wf.format(dayMs(m.cells[d].date)) });
        }
      }
      if (this.hovered >= this.n) this.hovered = -1;
      if (this.pinned >= this.n) this.pinned = -1;
    }

    retheme() {
      const cs = getComputedStyle(this.mountEl);
      this.fg = toRGB(cs.color, [23, 23, 23]) || [23, 23, 23];
      const b = toRGB(cs.backgroundColor, null);
      this.bg = b || (luminance(this.fg) > 0.5 ? [10, 10, 10] : [255, 255, 255]);
      this.isDark = luminance(this.bg) < 0.45;
      this.font = '400 10px Plus Jakarta Sans, sans-serif';

      const pal = resolvePalette(this.options.palette, this.isDark);
      const empty = mixRGB(this.bg, this.fg, this.isDark ? 0.11 : 0.075);
      const all = [empty, ...pal.map((c) => toRGB(c, this.fg) || this.fg)];
      for (let k = 0; k < 5; k++) {
        for (let ch = 0; ch < 3; ch++) {
          this.colGoal[k * 3 + ch] = all[k][ch];
        }
      }
      if (!this.colReady) {
        this.col.set(this.colGoal);
        this.colReady = true;
      }
      this.ctx.font = this.font;
      this.labelW = Math.ceil(Math.max(20, ...this.weekdayRows.map((r) => this.ctx.measureText(r.label).width))) + 8;

      // Swatches in footer legend
      const sw = all.map((c) => rgbString(c[0], c[1], c[2]));
      this.swatchesContainer.innerHTML = sw
        .map(
          (color, idx) => `
        <button type="button" class="skyline-swatch-btn" data-level="${idx}" style="background-color: ${color};" title="Filter level ${idx}"></button>
      `
        )
        .join('');

      this.swatchesContainer.querySelectorAll('.skyline-swatch-btn').forEach((btn) => {
        const lvl = Number(btn.getAttribute('data-level'));
        btn.addEventListener('mouseenter', () => {
          this.legendLevel = lvl;
          this.kick();
        });
        btn.addEventListener('mouseleave', () => {
          this.legendLevel = -1;
          this.kick();
        });
        btn.addEventListener('click', () => {
          this.legendLevel = this.legendLevel === lvl ? -1 : lvl;
          this.kick();
        });
      });
    }

    extent(cam, e, full) {
      const w = lerp(0.78, 0.9, e);
      const off = (1 - w) / 2;
      let minx = Infinity,
        maxx = -Infinity,
        miny = Infinity,
        maxy = -Infinity;
      const add = (x, y, z) => {
        const p = project(cam, x, y, z);
        if (p[0] < minx) minx = p[0];
        if (p[0] > maxx) maxx = p[0];
        if (p[1] < miny) miny = p[1];
        if (p[1] > maxy) maxy = p[1];
      };
      for (let i = 0; i < this.n; i++) {
        const x0 = this.wk[i] + off;
        const y0 = this.dy[i] + off;
        const z = full ? this.hgt[i] * e : this.zs[i];
        add(x0, y0, z);
        add(x0 + w, y0, z);
        add(x0, y0 + w, z);
        add(x0 + w, y0 + w, 0);
        add(x0, y0 + w, 0);
        add(x0 + w, y0, 0);
      }
      add(0, 7 + 1.5 * e, 0);
      add(this.weeks, 7 + 1.5 * e, 0);
      return { minx, maxx, miny, maxy };
    }

    relayout() {
      const w = Math.round(this.stage.clientWidth);
      if (!w || !this.n) return;
      this.W = w;
      this.gutter = this.W < 520 ? 0 : this.labelW;
      this.dpr = Math.min(2, window.devicePixelRatio || 1);

      const b2 = this.extent(camera(0), 0, true);
      this.H2 = 20 + 4 + ((b2.maxy - b2.miny) / (b2.maxx - b2.minx)) * (this.W - this.gutter - 4);
      const b3 = this.extent(camera(1), 1, true);
      const natural = ((b3.maxy - b3.miny) / (b3.maxx - b3.minx)) * (this.W - 40) + 40;
      this.H3 = Math.max(Math.min(natural, this.W * 0.72, 620), Math.min(natural, 240));
      this.Hmax = Math.ceil(Math.max(this.H2, this.H3));

      this.canvas.width = Math.round(this.W * this.dpr);
      this.canvas.height = Math.round(this.Hmax * this.dpr);
      this.canvas.style.width = this.W + 'px';
      this.canvas.style.height = this.Hmax + 'px';
      this.lastH = -1;

      this.updateCornerStatsVisibility();
      this.draw();
    }

    draw() {
      if (!this.W || !this.n) return;
      const e = easeInOutCubic(this.t);
      const cam = camera(e, this.yaw, this.elev);
      const Hc = lerp(this.H2, this.H3, e);
      if (Math.abs(Hc - this.lastH) > 0.2) {
        this.stage.style.height = Hc.toFixed(1) + 'px';
        this.lastH = Hc;
      }
      for (let i = 0; i < this.n; i++) {
        this.zs[i] = riseAt(this.t, this.wk[i], this.weeks, this.dy[i]) * this.hgt[i];
      }
      const b = this.extent(cam, e, false);
      const pad = lerp(2, 20, e);
      const left = pad + this.gutter * (1 - e);
      const top = pad + 20 * (1 - e);
      const aw = this.W - left - pad;
      const ah = Hc - top - pad;
      const bw = Math.max(1e-6, b.maxx - b.minx);
      const bh = Math.max(1e-6, b.maxy - b.miny);
      const s = Math.min(aw / bw, ah / bh);
      const ox = left + (aw - bw * s) / 2 - b.minx * s;
      const oy = top + (ah - bh * s) / 2 - b.miny * s;
      const { cs, sn, se, ce } = cam;
      const px = (x, y) => ox + (x * cs - y * sn) * s;
      const py = (x, y, z) => oy + ((x * sn + y * cs) * se - z * ce) * s;

      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.W, this.Hmax);

      this.order.sort(
        (a, c) =>
          (this.wk[a] + 0.5) * sn + (this.dy[a] + 0.5) * cs - ((this.wk[c] + 0.5) * sn + (this.dy[c] + 0.5) * cs)
      );

      const w = lerp(0.78, 0.9, e);
      const off = (1 - w) / 2;
      const radius = lerp(0.17, 0.03, e) * s;
      const outline = (1 - e) * 0.07;
      const lift = 0.7 * e;
      const ex = this.col[0];
      const ey = this.col[1];
      const ez = this.col[2];

      for (let k = 0; k < this.n; k++) {
        const i = this.order[k];
        const x0 = this.wk[i] + off;
        const y0 = this.dy[i] + off;
        const x1 = x0 + w;
        const y1 = y0 + w;
        const z = this.zs[i] + this.hover[i] * lift;
        const o = i * 24;

        // top face
        this.polys[o] = px(x0, y0);
        this.polys[o + 1] = py(x0, y0, z);
        this.polys[o + 2] = px(x1, y0);
        this.polys[o + 3] = py(x1, y0, z);
        this.polys[o + 4] = px(x1, y1);
        this.polys[o + 5] = py(x1, y1, z);
        this.polys[o + 6] = px(x0, y1);
        this.polys[o + 7] = py(x0, y1, z);

        // left face (+y)
        this.polys[o + 8] = px(x0, y1);
        this.polys[o + 9] = py(x0, y1, 0);
        this.polys[o + 10] = px(x1, y1);
        this.polys[o + 11] = py(x1, y1, 0);
        this.polys[o + 12] = this.polys[o + 4];
        this.polys[o + 13] = this.polys[o + 5];
        this.polys[o + 14] = this.polys[o + 6];
        this.polys[o + 15] = this.polys[o + 7];

        // right face (+x)
        this.polys[o + 16] = px(x1, y0);
        this.polys[o + 17] = py(x1, y0, 0);
        this.polys[o + 18] = this.polys[o + 10];
        this.polys[o + 19] = this.polys[o + 11];
        this.polys[o + 20] = this.polys[o + 4];
        this.polys[o + 21] = this.polys[o + 5];
        this.polys[o + 22] = this.polys[o + 2];
        this.polys[o + 23] = this.polys[o + 3];

        const tall = z * ce * s;
        let f = 0;
        if (tall > 0.35 && w * cs * s > 0.35) f |= 1;
        if (tall > 0.35 && w * sn * s > 0.35) f |= 2;
        this.faces[i] = f;

        const L = this.lv[i] * 3;
        let r = this.col[L];
        let g = this.col[L + 1];
        let bl = this.col[L + 2];
        const d = this.dim[i];
        if (d > 0.002) {
          r += (ex - r) * 0.72 * d;
          g += (ey - g) * 0.72 * d;
          bl += (ez - bl) * 0.72 * d;
        }
        const hv = this.hover[i];
        if (hv > 0.002) {
          const m = 0.16 * hv;
          r += (this.fg[0] - r) * m;
          g += (this.fg[1] - g) * m;
          bl += (this.fg[2] - bl) * m;
        }

        if (f & 1) {
          ctx.beginPath();
          quadPath(ctx, this.polys, o + 8, 0);
          ctx.fillStyle = rgbString(r * 0.84, g * 0.84, bl * 0.84);
          ctx.fill();
        }
        if (f & 2) {
          ctx.beginPath();
          quadPath(ctx, this.polys, o + 16, 0);
          ctx.fillStyle = rgbString(r * 0.68, g * 0.68, bl * 0.68);
          ctx.fill();
        }

        ctx.beginPath();
        quadPath(ctx, this.polys, o, radius);
        ctx.fillStyle = rgbString(r, g, bl);
        ctx.fill();

        if (outline > 0.004) {
          ctx.strokeStyle = 'rgba(' + this.fg[0] + ',' + this.fg[1] + ',' + this.fg[2] + ',' + outline.toFixed(3) + ')';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        if (hv > 0.02) {
          ctx.strokeStyle = 'rgba(' + this.fg[0] + ',' + this.fg[1] + ',' + this.fg[2] + ',' + (0.85 * hv).toFixed(3) + ')';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      // Labels: month headers and weekday names
      const muted = mixRGB(this.bg, this.fg, 0.55);
      ctx.font = this.font;
      const a2 = 1 - smoothstep(0, 0.4, e);
      const a3 = smoothstep(0.62, 1, e);
      if (a2 > 0.004) {
        ctx.fillStyle = 'rgba(' + Math.round(muted[0]) + ',' + Math.round(muted[1]) + ',' + Math.round(muted[2]) + ',' + a2.toFixed(3) + ')';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        let edge = -Infinity;
        for (const m of this.months) {
          const x = px(m.week + off, -0.3);
          const tw = ctx.measureText(m.label).width;
          if (x < edge || x + tw > this.W) continue;
          ctx.fillText(m.label, x, py(m.week + off, -0.3, 0) - 3);
          edge = x + tw + 6;
        }
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        if (this.gutter > 0) {
          for (const r of this.weekdayRows) {
            ctx.fillText(r.label, px(0, r.day + 0.5) - 6, py(0, r.day + 0.5, 0));
          }
        }
      }
      if (a3 > 0.004) {
        ctx.fillStyle = 'rgba(' + Math.round(muted[0]) + ',' + Math.round(muted[1]) + ',' + Math.round(muted[2]) + ',' + a3.toFixed(3) + ')';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        let edge = -Infinity;
        for (const m of this.months) {
          const x = px(m.week + 0.5, 7.3);
          if (x < edge || x + ctx.measureText(m.label).width > this.W) continue;
          ctx.fillText(m.label, x, py(m.week + 0.5, 7.3, 0) + 2);
          edge = x + ctx.measureText(m.label).width + 10;
        }
      }

      // Position Tooltip
      if (this.activeIdx >= 0 && this.activeIdx < this.n) {
        const i = this.activeIdx;
        const z = this.zs[i] + this.hover[i] * lift;
        const tx = px(this.wk[i] + 0.5, this.dy[i] + 0.5);
        const ty = Math.min(
          py(this.wk[i] + off, this.dy[i] + off, z),
          py(this.wk[i] + off + w, this.dy[i] + off, z),
          py(this.wk[i] + off, this.dy[i] + off + w, z)
        );
        const half = this.tipW / 2;
        const cx = Math.min(this.W - half - 4, Math.max(half + 4, tx));
        this.tooltip.style.transform = `translate(${(cx - half).toFixed(1)}px, ${(ty - 10).toFixed(1)}px) translateY(-100%)`;
        this.tooltip.style.setProperty('--arrow', `${(tx - cx + half).toFixed(1)}px`);
      }
    }

    tick(now) {
      this.raf = 0;
      const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      let moving = false;

      if (this.t !== this.target) {
        const step = (dt * 1000) / Math.max(1, this.options.duration);
        this.t = this.target > this.t ? Math.min(this.target, this.t + step) : Math.max(this.target, this.t - step);
        moving = true;
      }

      const ko = 1 - Math.exp(-dt * 12);
      this.yaw += (this.yawGoal - this.yaw) * ko;
      this.elev += (this.elevGoal - this.elev) * ko;
      if (Math.abs(this.yawGoal - this.yaw) > 1e-4 || Math.abs(this.elevGoal - this.elev) > 1e-4) {
        moving = true;
      } else {
        this.yaw = this.yawGoal;
        this.elev = this.elevGoal;
      }

      const kc = 1 - Math.exp(-dt * 7);
      for (let k = 0; k < 15; k++) {
        const d = this.colGoal[k] - this.col[k];
        if (Math.abs(d) > 0.4) {
          this.col[k] += d * kc;
          moving = true;
        } else {
          this.col[k] = this.colGoal[k];
        }
      }

      const kh = 1 - Math.exp(-dt * 16);
      const kd = 1 - Math.exp(-dt * 10);
      const leg = this.legendLevel;
      for (let i = 0; i < this.n; i++) {
        const hg = i === this.activeIdx ? 1 : 0;
        const dg = leg >= 0 && this.lv[i] !== leg ? 1 : 0;
        const h = this.hover[i];
        const d = this.dim[i];
        if (h !== hg) {
          this.hover[i] = Math.abs(hg - h) < 0.003 ? hg : h + (hg - h) * kh;
          moving = true;
        }
        if (d !== dg) {
          this.dim[i] = Math.abs(dg - d) < 0.003 ? dg : d + (dg - d) * kd;
          moving = true;
        }
      }

      this.draw();
      if (moving) this.raf = requestAnimationFrame((n) => this.tick(n));
    }

    kick() {
      if (this.raf) return;
      this.last = performance.now();
      this.raf = requestAnimationFrame((n) => this.tick(n));
    }

    refreshActive() {
      const next = this.hovered >= 0 ? this.hovered : this.pinned;
      if (next === this.activeIdx) return;
      this.activeIdx = next;
      if (this.activeIdx >= 0 && this.model.cells[this.activeIdx]) {
        const c = this.model.cells[this.activeIdx];
        const count = c.count;
        const dfy = new Intl.DateTimeFormat(this.options.locale, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'UTC',
        });
        const dateStr = dfy.format(dayMs(c.date));
        this.tipContent.innerHTML = `<strong>${count ? `${count} ${this.options.unit}` : 'Tidak ada aktivitas'}</strong> · ${dateStr}`;
        this.tooltip.classList.add('visible');
        this.tipW = this.tooltip.offsetWidth;
      } else {
        this.tooltip.classList.remove('visible');
      }
      this.kick();
    }

    hit(x, y) {
      for (let k = this.n - 1; k >= 0; k--) {
        const i = this.order[k];
        const o = i * 24;
        if (pointInQuad(this.polys, o, x, y)) return i;
        if (this.faces[i] & 1 && pointInQuad(this.polys, o + 8, x, y)) return i;
        if (this.faces[i] & 2 && pointInQuad(this.polys, o + 16, x, y)) return i;
      }
      return -1;
    }

    local(ev) {
      const r = this.canvas.getBoundingClientRect();
      return [ev.clientX - r.left, ev.clientY - r.top];
    }

    attachEvents() {
      let drag = null;

      const onDown = (ev) => {
        if (ev.button !== 0) return;
        const can = this.options.orbit && this.target === 1;
        drag = {
          id: ev.pointerId,
          x: ev.clientX,
          y: ev.clientY,
          yaw: this.yawGoal,
          elev: this.elevGoal,
          moved: false,
          orbit: can,
          mouse: ev.pointerType === 'mouse',
        };
        if (can) {
          try {
            this.canvas.setPointerCapture(ev.pointerId);
          } catch (_) {}
        }
      };

      const onMove = (ev) => {
        if (drag && drag.orbit && ev.pointerId === drag.id) {
          const dx = ev.clientX - drag.x;
          const dyy = ev.clientY - drag.y;
          if (drag.moved || Math.hypot(dx, dyy) > 4) {
            drag.moved = true;
            this.yawGoal = Math.min(YAW_RANGE[1] - YAW_3D, Math.max(YAW_RANGE[0] - YAW_3D, drag.yaw + dx * 0.006));
            if (drag.mouse) {
              this.elevGoal = Math.min(ELEV_RANGE[1] - ELEV_3D, Math.max(ELEV_RANGE[0] - ELEV_3D, drag.elev + dyy * 0.004));
            }
            this.canvas.style.cursor = 'grabbing';
            this.hovered = -1;
            this.refreshActive();
            this.kick();
            return;
          }
        }
        if (ev.pointerType !== 'mouse') return;
        const [x, y] = this.local(ev);
        const i = this.hit(x, y);
        if (i !== this.hovered) {
          this.hovered = i;
          this.refreshActive();
        }
        this.canvas.style.cursor = this.options.orbit && this.target === 1 ? 'grab' : i >= 0 ? 'pointer' : 'default';
      };

      const onUp = (ev) => {
        if (!drag || ev.pointerId !== drag.id) return;
        const wasMoved = drag.moved;
        drag = null;
        if (this.canvas.hasPointerCapture(ev.pointerId)) this.canvas.releasePointerCapture(ev.pointerId);
        this.canvas.style.cursor = this.options.orbit && this.target === 1 ? 'grab' : 'default';
        if (wasMoved) return;
        const [x, y] = this.local(ev);
        const i = this.hit(x, y);
        this.pinned = i === this.pinned ? -1 : i;
        if (ev.pointerType !== 'mouse') this.hovered = -1;
        this.refreshActive();
      };

      const onLeave = () => {
        if (drag) return;
        this.hovered = -1;
        this.refreshActive();
      };

      const onDbl = () => {
        this.yawGoal = 0;
        this.elevGoal = 0;
        this.kick();
      };

      const onKey = (ev) => {
        const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Escape', 'Enter', ' '];
        if (!keys.includes(ev.key) || !this.n) return;
        ev.preventDefault();
        if (ev.key === 'Escape') {
          this.pinned = -1;
          this.hovered = -1;
          this.refreshActive();
          return;
        }
        let i = this.pinned >= 0 ? this.pinned : this.activeIdx >= 0 ? this.activeIdx : this.n - 1;
        if (this.pinned >= 0 || this.activeIdx >= 0) {
          if (ev.key === 'ArrowLeft') i -= 7;
          if (ev.key === 'ArrowRight') i += 7;
          if (ev.key === 'ArrowUp') i -= 1;
          if (ev.key === 'ArrowDown') i += 1;
          if (ev.key === 'Home') i = 0;
          if (ev.key === 'End') i = this.n - 1;
        }
        i = Math.max(0, Math.min(this.n - 1, i));
        this.pinned = i;
        this.hovered = -1;
        this.refreshActive();
      };

      this.canvas.addEventListener('pointerdown', onDown);
      this.canvas.addEventListener('pointermove', onMove);
      this.canvas.addEventListener('pointerup', onUp);
      this.canvas.addEventListener('pointercancel', () => (drag = null));
      this.canvas.addEventListener('pointerleave', onLeave);
      this.canvas.addEventListener('dblclick', onDbl);
      this.canvas.addEventListener('keydown', onKey);
      this.canvas.addEventListener('blur', () => {
        this.pinned = -1;
        this.refreshActive();
      });
    }
  }

  // Global helper
  window.ContributionSkyline = {
    init: function (container, options) {
      const el = typeof container === 'string' ? document.getElementById(container) : container;
      if (!el) return null;
      return new SkylineController(el, options);
    },
  };
})(window);
