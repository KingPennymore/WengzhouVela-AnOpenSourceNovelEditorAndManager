import { csvColumnName } from './csv-view.mjs';
import { bindPlane } from './gestures.mjs';
import { fitPlanningPlane } from './planning-viewport.mjs';
import { reducedMotion } from './motion.mjs';
import { t } from './i18n.mjs';

export const CSV_GUTTER = 48, CSV_HEADING = 34;
export function prefixSizes(sizes) { const prefix = [0]; for (const size of sizes) prefix.push(prefix.at(-1) + size); return prefix; }
export function csvAxisAt(prefix, value) {
  let lo = 0, hi = prefix.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (prefix[mid] <= value) lo = mid; else hi = mid - 1; }
  return Math.max(0, Math.min(prefix.length - 2, lo));
}
export function csvVisibleRange(prefix, offset, size, scale, buffer = 2) {
  return [Math.max(0, csvAxisAt(prefix, -offset / scale) - buffer), Math.min(prefix.length - 1, csvAxisAt(prefix, (size - offset) / scale) + buffer + 1)];
}
export function csvMetrics(rows, columns, widths = [], order = rows.map((_, r) => r)) {
  const sizes = Array.from({ length: columns }, (_, c) => widths[c] || Math.min(320, Math.max(96, 28 + rows.slice(0, 80).reduce((n, row) => Math.max(n, ...String(row[c] || '').split(/\r\n|\r|\n/).map(s => [...s.slice(0, 80)].reduce((sum, ch) => sum + (ch.charCodeAt(0) > 255 ? 14 : 8), 0))), 0))));
  const heights = order.map(r => 20 + 24 * Math.min(3, rows[r].reduce((n, value) => Math.max(n, String(value).split(/\r\n|\r|\n/).length), 1)));
  return { widths: sizes, heights, x: prefixSizes(sizes), y: prefixSizes(heights) };
}

/** One grid engine: editor canvas and reader native scrolling share layout and cells. */
export class CsvGrid {
  constructor(root, { model, state = {}, readOnly = false, header = false, order, onView = () => {}, onPaint = () => {}, canPan = () => true, onPinch = () => {}, onOverview = () => {} }) {
    Object.assign(this, { root, model, state, readOnly, header, onView, onPaint, onOverview });
    this.order = order || model.rows.map((_, r) => r).filter(r => !header || r !== 0);
    this.metrics = csvMetrics(model.rows, model.columns, state.widths, this.order);
    state.plane ||= { x: 0, y: 0, scale: 1 }; this.plane = state.plane;
    this.plane.scale = Math.max(.25, Math.min(3, this.plane.scale));
    root.classList.add('csv-grid-host'); root.classList.toggle('csv-scroll', readOnly);
    root.setAttribute('role', 'grid'); root.setAttribute('aria-label', t(readOnly ? '表格阅读' : '表格编辑'));
    root.setAttribute('aria-rowcount', model.rows.length); root.setAttribute('aria-colcount', model.columns);
    // Headers and row numbers live inside the zoomed stage: the whole table moves as one surface.
    root.innerHTML = '<div class="csv-scroll-space"></div><div class="csv-layers"><div class="csv-plane" tabindex="0"><div class="csv-grid-stage"></div><div class="csv-row-pin" hidden aria-hidden="true"></div><canvas class="csv-overview" hidden></canvas><div class="csv-selection-layer"></div></div></div><canvas class="csv-minimap" hidden></canvas>';
    this.surface = root.querySelector('.csv-plane'); this.stage = root.querySelector('.csv-grid-stage'); this.rowPin = root.querySelector('.csv-row-pin'); this.overview = root.querySelector('.csv-overview'); this.minimap = root.querySelector('.csv-minimap'); this.selectionLayer = root.querySelector('.csv-selection-layer'); this.space = root.querySelector('.csv-scroll-space');
    const initialSize = this.contentSize();
    this.space.style.width = initialSize.width + 'px'; this.space.style.height = initialSize.height + 'px';
    this.schedule = () => { if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.paint(); }); };
    if (readOnly) {
      this.plane = { x: -(state.scrollLeft || 0), y: -(state.scrollTop || 0), scale: 1 };
      root.onscroll = () => { this.plane.x = -root.scrollLeft; this.plane.y = -root.scrollTop; state.scrollTop = root.scrollTop; state.scrollLeft = root.scrollLeft; this.schedule(); onView(); };
    } else {
      this.gesture = bindPlane(this.surface, this.plane, () => this.schedule(), { wheel: 'pan', minScale: .25, maxScale: 3, canPan, onPinch,
        onStart: () => { this.gesturing = true; }, onFinish: () => { this.gesturing = false; this.settle(); } });
      this.minimap.setAttribute('aria-label', t('表格导航')); this.minimap.onclick = e => {
        const rect = this.minimap.getBoundingClientRect(), size = this.contentSize();
        this.plane.x = this.surface.clientWidth / 2 - (e.clientX - rect.left) / rect.width * size.width * this.plane.scale;
        this.plane.y = this.surface.clientHeight / 2 - (e.clientY - rect.top) / rect.height * size.height * this.plane.scale;
        this.settle();
      };
      this.overview.onclick = e => { const hit = this.hit(e); if (hit) { this.zoom(1, e.clientX - this.surface.getBoundingClientRect().left, e.clientY - this.surface.getBoundingClientRect().top); onOverview(hit); } };
    }
    this.observer = new ResizeObserver(() => { this.initialize(); this.schedule(); }); this.observer.observe(root);
    this.initialize(); this.paint();
  }
  contentSize() { return { width: CSV_GUTTER + this.metrics.x.at(-1), height: CSV_HEADING + this.metrics.y.at(-1) }; }
  initialize() {
    const width = this.surface.clientWidth;
    if (!width) return;
    if (!this.readOnly && !this.state.initialized) {
      // Narrow tables open at 100% with a small margin; wide tables fit the width instead.
      const total = this.contentSize().width;
      this.plane.scale = total + 24 <= width ? 1 : Math.max(.25, Math.min(1, (width - 24) / total));
      this.plane.x = 12; this.plane.y = 12; this.state.initialized = true;
    }
    if (!this.readOnly) this.clamp();
    if (this.readOnly && !this.restored) { this.root.scrollLeft = this.state.scrollLeft || 0; this.root.scrollTop = this.state.scrollTop || 0; this.restored = true; }
  }
  dispose() { this.disposed = true; this.observer?.disconnect(); cancelAnimationFrame(this.frame); this.root.onscroll = null; }
  hit(event) {
    const rect = this.surface.getBoundingClientRect(), x = (event.clientX - rect.left - this.plane.x) / this.plane.scale - CSV_GUTTER, y = (event.clientY - rect.top - this.plane.y) / this.plane.scale - CSV_HEADING;
    if (x < 0 || y < 0 || x >= this.metrics.x.at(-1) || y >= this.metrics.y.at(-1) || !this.order.length) return null;
    const index = csvAxisAt(this.metrics.y, y); return { row: this.order[index], column: csvAxisAt(this.metrics.x, x), index };
  }
  rect(row, column) {
    const index = this.order.indexOf(row); if (index < 0) return null;
    return { x: this.plane.x + (CSV_GUTTER + this.metrics.x[column]) * this.plane.scale, y: this.plane.y + (CSV_HEADING + this.metrics.y[index]) * this.plane.scale, width: this.metrics.widths[column] * this.plane.scale, height: this.metrics.heights[index] * this.plane.scale };
  }
  reveal(row, column) {
    const box = this.rect(row, column); if (!box) return;
    const shift = (pos, size, extent) => pos < 24 ? 24 - pos : pos + size > extent - 24 ? Math.min(24 - pos, extent - 24 - pos - size) : 0;
    this.plane.x += shift(box.x, box.width, this.surface.clientWidth); this.plane.y += shift(box.y, box.height, this.surface.clientHeight);
    this.paint(); this.onView();
  }
  clamp() {
    const { clientWidth: w, clientHeight: h } = this.surface; if (!w || !h) return;
    const scale = this.plane.scale, size = this.contentSize();
    const width = size.width * scale, height = size.height * scale;
    // Keep the table visible: fully inside when smaller than the viewport, covering it when larger.
    this.plane.x = width <= w ? Math.max(0, Math.min(w - width, this.plane.x)) : Math.max(w - width, Math.min(0, this.plane.x));
    this.plane.y = height <= h ? Math.max(0, Math.min(h - height, this.plane.y)) : Math.max(h - height, Math.min(0, this.plane.y));
  }
  settle() {
    if (this.disposed) return;
    const before = { ...this.plane }; this.clamp();
    if (!reducedMotion() && (before.x !== this.plane.x || before.y !== this.plane.y)) this.stage.animate([{ transform: `translate(${before.x}px,${before.y}px)` }, { transform: `translate(${this.plane.x}px,${this.plane.y}px)` }], { duration: 180, easing: 'ease-out' });
    this.paint(); this.onView();
  }
  zoom(scale, x = this.surface.clientWidth / 2, y = this.surface.clientHeight / 2) { this.gesture?.zoom(scale, x, y); this.gesturing = false; this.settle(); }
  cancelGesture() { this.gesture?.cancel(); this.gesturing = false; }
  fit(widthOnly = false) {
    const size = this.contentSize(), next = fitPlanningPlane({ x: 0, y: 0, width: size.width, height: size.height }, this.surface.clientWidth, this.surface.clientHeight, { maxScale: 1 });
    if (!next) return;
    if (widthOnly) { next.scale = Math.min(1, (this.surface.clientWidth - 24) / size.width); next.x = 12; next.y = 12; }
    next.scale = Math.max(.25, next.scale); Object.assign(this.plane, next); this.clamp(); this.settle();
  }
  paint() {
    if (this.disposed) return;
    this.clamp();
    const { x, y, scale } = this.plane, width = this.surface.clientWidth, height = this.surface.clientHeight;
    if (!width || !height) return;
    const size = this.contentSize(), overview = !this.readOnly && scale < (this.state.overviewThreshold || .5);
    this.overview.hidden = !overview; this.stage.hidden = overview;
    if (this.readOnly) { this.space.style.width = size.width + 'px'; this.space.style.height = size.height + 'px'; }
    // During a pinch reuse the crisp layout and transform only its visible tiles.
    if (this.gesturing && this.layoutScale && !overview && this.wasOverview === false) {
      this.stage.style.transform = `translate(${x}px,${y}px) scale(${scale / this.layoutScale})`;
      this.rowPin.hidden = true;
      this.onPaint(); return;
    }
    this.wasOverview = overview; this.layoutScale = scale;
    this.root.style.setProperty('--csv-zoom', scale); this.stage.style.transform = `translate(${x}px,${y}px)`;
    const [r0, r1] = csvVisibleRange(this.metrics.y, y + CSV_HEADING * scale, height, scale), [c0, c1] = csvVisibleRange(this.metrics.x, x + CSV_GUTTER * scale, width, scale);
    if (overview) { this.stage.replaceChildren(); this.rowPin.hidden = true; this.drawOverview(this.overview, width, height); }
    else {
      const fragment = document.createDocumentFragment();
      // Column names are a row of the table now; they pan and zoom with the cells.
      const headingRow = document.createElement('div'); headingRow.className = 'csv-grid-row csv-grid-header'; headingRow.setAttribute('role', 'row');
      const corner = document.createElement('div'); corner.className = 'csv-corner'; corner.setAttribute('aria-hidden', 'true'); corner.textContent = '#';
      corner.style.cssText = `left:0;top:0;width:${CSV_GUTTER * scale}px;height:${CSV_HEADING * scale}px`;
      headingRow.append(corner);
      for (let c = c0; c < c1; c++) {
        const heading = document.createElement('div'); heading.className = 'csv-column-heading'; heading.setAttribute('role', 'columnheader'); heading.setAttribute('aria-colindex', c + 1); heading.dataset.csvColumn = c;
        heading.style.cssText = `left:${(CSV_GUTTER + this.metrics.x[c]) * scale}px;top:0;width:${this.metrics.widths[c] * scale}px;height:${CSV_HEADING * scale}px`;
        heading.textContent = this.header ? this.model.rows[0]?.[c] || csvColumnName(c) : csvColumnName(c); if (this.header) heading.setAttribute('data-user-content', '');
        if (!this.readOnly) { const handle = document.createElement('span'); handle.className = 'csv-column-resize'; handle.dataset.resizeColumn = c; handle.setAttribute('aria-label', t('调整列宽')); handle.setAttribute('role', 'separator'); handle.setAttribute('aria-orientation', 'vertical'); handle.tabIndex = 0; heading.append(handle); }
        headingRow.append(heading);
      }
      fragment.append(headingRow);
      for (let index = r0; index < r1; index++) {
        const row = this.order[index]; if (row === undefined) continue;
        const line = document.createElement('div'); line.setAttribute('role', 'row'); line.setAttribute('aria-rowindex', row + 1); line.className = 'csv-grid-row';
        const rowHeading = document.createElement('div'); rowHeading.className = 'csv-row-heading'; rowHeading.setAttribute('role', 'rowheader'); rowHeading.setAttribute('aria-rowindex', row + 1); rowHeading.dataset.csvRow = row; rowHeading.textContent = index + 1;
        rowHeading.style.cssText = `left:0;top:${(CSV_HEADING + this.metrics.y[index]) * scale}px;width:${CSV_GUTTER * scale}px;height:${this.metrics.heights[index] * scale}px`;
        line.append(rowHeading);
        for (let c = c0; c < c1; c++) {
          const cell = document.createElement('div'); cell.className = 'csv-grid-cell'; cell.setAttribute('role', 'gridcell'); cell.setAttribute('aria-colindex', c + 1); cell.setAttribute('aria-rowindex', row + 1); cell.setAttribute('data-user-content', ''); cell.dataset.cellRow = row; cell.dataset.cellColumn = c;
          cell.id = `csv-cell-${row}-${c}`; cell.style.cssText = `left:${(CSV_GUTTER + this.metrics.x[c]) * scale}px;top:${(CSV_HEADING + this.metrics.y[index]) * scale}px;width:${this.metrics.widths[c] * scale}px;height:${this.metrics.heights[index] * scale}px`;
          const text = document.createElement('span'); text.textContent = this.model.rows[row]?.[c] || ''; cell.append(text); line.append(cell);
        }
        fragment.append(line);
      }
      this.stage.replaceChildren(fragment);
      this.paintRowPin(r0, r1, scale);
    }
    this.paintMinimap(width, height, size); this.onPaint();
  }
  /** The row-number rail stays visible when the table has been panned past its left edge. */
  paintRowPin(r0, r1, scale) {
    const show = this.plane.x < -1;
    this.rowPin.hidden = !show;
    if (!show) { this.rowPin.replaceChildren(); return; }
    const fragment = document.createDocumentFragment();
    for (let index = r0; index < r1; index++) {
      const row = this.order[index]; if (row === undefined) continue;
      const heading = document.createElement('div'); heading.className = 'csv-row-heading csv-row-pin-heading'; heading.dataset.csvRow = row; heading.textContent = index + 1;
      heading.style.cssText = `left:0;top:${this.plane.y + (CSV_HEADING + this.metrics.y[index]) * scale}px;width:${CSV_GUTTER * scale}px;height:${this.metrics.heights[index] * scale}px`;
      fragment.append(heading);
    }
    this.rowPin.style.width = CSV_GUTTER * scale + 'px';
    this.rowPin.replaceChildren(fragment);
  }
  drawOverview(canvas, width, height, mini = false) {
    const ratio = Math.min(2, devicePixelRatio || 1); canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.scale(ratio, ratio); const css = getComputedStyle(this.root), size = this.contentSize();
    ctx.fillStyle = css.getPropertyValue('--soft') || '#eee'; ctx.fillRect(0, 0, width, height);
    const sx = mini ? width / size.width : this.plane.scale, sy = mini ? height / size.height : sx, tx = mini ? 0 : this.plane.x, ty = mini ? 0 : this.plane.y;
    // Header bands stay part of the overview, just like they are part of the table.
    ctx.globalAlpha = 1; ctx.fillStyle = css.getPropertyValue('--panel') || '#f4f5f2';
    ctx.fillRect(tx, ty, size.width * sx, CSV_HEADING * sy); ctx.fillRect(tx, ty, CSV_GUTTER * sx, size.height * sy);
    ctx.fillStyle = css.getPropertyValue('--accent') || '#36785c';
    // Bound painting to screen pixels even for 200,000-cell tables.
    const step = Math.max(1, Math.ceil(this.order.length / Math.max(1, height * 2)));
    for (let index = 0; index < this.order.length; index += step) {
      const y = ty + (CSV_HEADING + this.metrics.y[index]) * sy, h = Math.max(1, (this.metrics.y[Math.min(this.order.length, index + step)] - this.metrics.y[index]) * sy);
      if (y + h < 0 || y > height) continue; const row = this.model.rows[this.order[index]];
      for (let c = 0; c < this.model.columns; c++) {
        const x = tx + (CSV_GUTTER + this.metrics.x[c]) * sx, w = this.metrics.widths[c] * sx;
        if (x + w < 0 || x > width || !row[c]) continue;
        ctx.globalAlpha = .35; ctx.fillRect(x + 1, y + 1, Math.max(1, w - 2), Math.max(1, h - 2));
      }
    }
    ctx.globalAlpha = 1;
    if (!mini) {
      const muted = css.getPropertyValue('--muted') || '#777';
      ctx.fillStyle = muted; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const [c0, c1] = csvVisibleRange(this.metrics.x, tx + CSV_GUTTER * sx, width, sx), [r0, r1] = csvVisibleRange(this.metrics.y, ty + CSV_HEADING * sy, height, sy);
      ctx.font = `${Math.max(8, Math.min(11, CSV_HEADING * sy * .42))}px ${css.fontFamily || 'sans-serif'}`;
      if (CSV_HEADING * sy >= 8) for (let c = c0; c < c1; c++) { const w = this.metrics.widths[c] * sx; if (w < 14) continue; ctx.fillText(this.header ? (this.model.rows[0]?.[c] || csvColumnName(c)) : csvColumnName(c), tx + (CSV_GUTTER + this.metrics.x[c] + this.metrics.widths[c] / 2) * sx, ty + CSV_HEADING * sy / 2); }
      // Row numbers stay rendered in the overview even at the smallest zoom / longest tables.
      ctx.save(); ctx.beginPath(); ctx.rect(tx, ty + CSV_HEADING * sy, Math.max(1, CSV_GUTTER * sx), Math.max(1, size.height * sy)); ctx.clip();
      ctx.textAlign = 'center'; ctx.font = `${Math.max(7, Math.min(10, CSV_GUTTER * sx * .55))}px ${css.fontFamily || 'sans-serif'}`;
      for (let index = r0; index < r1; index++) { const row = this.order[index]; if (row === undefined) continue; ctx.fillText(String(index + 1), tx + CSV_GUTTER * sx / 2, ty + (CSV_HEADING + this.metrics.y[index] + this.metrics.heights[index] / 2) * sy); }
      ctx.restore();
    }
    if (mini) { ctx.strokeStyle = css.getPropertyValue('--accent') || '#36785c'; ctx.lineWidth = 2; ctx.strokeRect(-this.plane.x / this.plane.scale * sx, -this.plane.y / this.plane.scale * sy, this.surface.clientWidth / this.plane.scale * sx, this.surface.clientHeight / this.plane.scale * sy); }
  }
  paintMinimap(width, height, size = this.contentSize()) {
    this.minimap.hidden = this.readOnly || (size.width * this.plane.scale <= width && size.height * this.plane.scale <= height);
    if (!this.minimap.hidden) this.drawOverview(this.minimap, 112, 72, true);
  }
}
