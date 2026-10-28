/** Decoded text for full-table searches; anchors use cells, never recycled DOM text nodes. */
export function csvReadingIndex(model) {
  const starts = [], lines = []; let offset = 0;
  for (const row of model.rows) { starts.push(offset); const line = row.join('\t'); lines.push(line); offset += line.length + 1; }
  const text = lines.join('\n');
  const offsetAt = ({row, column}) => {
    let at = starts[row] ?? 0;
    for (let c = 0; c < column && c < (model.rows[row]?.length || 0); c++) at += model.rows[row][c].length + 1;
    return at;
  };
  const cellAt = at => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (starts[mid] <= at) lo = mid; else hi = mid - 1; }
    const row = lo, values = model.rows[row] || []; let column = 0, from = starts[row] || 0;
    while (column + 1 < values.length && from + values[column].length < at) from += values[column++].length + 1;
    return {row, column};
  };
  return {text, offsetAt, cellAt};
}
