import { parseCsvModel, csvDelimiter, csvValue } from './csv-model.mjs';
export { MAX_CSV_CELLS, csvDelimiter } from './csv-model.mjs';
export function documentDelimiter(doc, source = doc.text) { return [',', ';', '\t'].includes(doc.delimiter) ? doc.delimiter : (/\.tsv$/i.test(doc.path || doc.name || '') ? '\t' : csvDelimiter(source)); }
export function parseCsv(source, delimiter = csvDelimiter(source)) {
  const model = parseCsvModel(source, delimiter);
  if (model.error) throw Object.assign(Error(model.error), { line: model.line, column: model.column, offset: model.offset });
  return model.rows;
}
export function writeCsv(rows, delimiter = ',') { return rows.map(row => row.map(value => csvValue(value, delimiter)).join(delimiter)).join('\n'); }
