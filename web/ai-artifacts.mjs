// Pure, bounded AI output adapters. Model-generated paths and IDs are never trusted.
import { parseGlossary, glossaryText, createGlossary } from './glossary.mjs';
import { parseOutline, outlineText, createOutline } from './outline.mjs';
import { parseMap, mapText, createMap } from './map.mjs';
export const TYPES = ['glossary', 'outline', 'relations', 'places'];
export const names = {
  glossary: '术语库',
  outline: '大纲',
  relations: '人物关系',
  places: '地图信息点',
};
const key = (value) => String(value).trim().toLocaleLowerCase();
const word = (value, max = 120) =>
  typeof value === 'string' && value.trim() && value.length <= max && !/[\x00-\x1f]/.test(value);
export function readDraft(text, types) {
  if (typeof text !== 'string' || text.length > 1024 * 1024) throw Error('AI 结果超过大小限制。');
  const value = JSON.parse(
    text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, ''),
  );
  if (!value || Array.isArray(value) || typeof value !== 'object')
    throw Error('AI 结果必须是 JSON 对象。');
  const rows = [],
    warnings = [];
  for (const type of types) {
    if (!TYPES.includes(type) || !Array.isArray(value[type]) || value[type].length > 1000)
      throw Error('AI 结果数组无效或超过 1000 项：' + type);
    for (const item of value[type]) {
      const name = item?.name,
        description = item?.description ?? '',
        category = item?.category ?? '';
      const aliases = item?.aliases ?? [];
      if (
        !word(name) ||
        typeof description !== 'string' ||
        description.length > 4000 ||
        typeof category !== 'string' ||
        category.length > 80 ||
        !Array.isArray(aliases) ||
        aliases.length > 32 ||
        aliases.some((a) => !word(a))
      ) {
        warnings.push('已丢弃无效条目');
        continue;
      }
      if (
        type === 'relations' &&
        (!word(item.from) || !word(item.to) || key(item.from) === key(item.to))
      ) {
        warnings.push('已丢弃无效关系');
        continue;
      }
      rows.push({
        id: crypto.randomUUID(),
        type,
        name: name.trim(),
        description,
        category,
        aliases: [...new Set(aliases.map((a) => a.trim()))],
        ...(type === 'relations' ? { from: item.from.trim(), to: item.to.trim() } : {}),
        ...(type === 'places'
          ? {
              x: Number.isFinite(item.x)
                ? Math.max(-10000, Math.min(10000, item.x))
                : rows.length * 80,
              y: Number.isFinite(item.y) ? Math.max(-10000, Math.min(10000, item.y)) : 0,
              links: Array.isArray(item.links)
                ? item.links.filter((n) => word(n)).slice(0, 32)
                : [],
            }
          : {}),
        selected: true,
      });
    }
  }
  return { rows, warnings };
}
export function mergeDrafts(drafts) {
  const rows = [],
    seen = new Map(),
    warnings = drafts.flatMap((d) => d.warnings);
  for (const row of drafts.flatMap((d) => d.rows)) {
    const identity =
      row.type === 'relations'
        ? row.type + ':' + [key(row.from), key(row.to)].sort().join('|')
        : row.type + ':' + key(row.name);
    const previous =
      seen.get(identity) ||
      rows.find(
        (r) =>
          r.type === row.type &&
          r.type !== 'relations' &&
          [r.name, ...r.aliases].some((n) =>
            [row.name, ...row.aliases].some((a) => key(n) === key(a)),
          ),
      );
    if (previous) {
      previous.aliases = [...new Set([...previous.aliases, ...row.aliases])].slice(0, 32);
      warnings.push('已合并重复条目：' + row.name);
    } else {
      if (rows.length >= 2000) throw Error('草稿最多 2000 项，请减少章节。');
      seen.set(identity, row);
      rows.push(row);
    }
  }
  return { rows, warnings };
}
export function matchRow(row, values) {
  return values.find((value) =>
    [value.name, ...(value.aliases || [])].some((n) =>
      [row.name, ...row.aliases].some((a) => key(n) === key(a)),
    ),
  );
}
export function artifactValues(type, text) {
  if (!text) return [];
  if (type === 'glossary')
    return parseGlossary(text).entries.map((e) => ({
      ...e,
      name: e.term,
      description: e.definition || '',
    }));
  if (type === 'places')
    return (parseMap(text).markers || []).map((e) => ({ ...e, description: e.note || '' }));
  const outline = parseOutline(text);
  if (type === 'relations')
    return (outline.relations?.edges || []).map((edge) => ({
      name: edge.label || '',
      description: edge.description || '',
      from: outline.relations.nodes[edge.from]?.title,
      to: outline.relations.nodes[edge.to]?.title,
    }));
  return Object.values(type === 'relations' ? outline.relations?.nodes || {} : outline.nodes).map(
    (e) => ({ ...e, name: e.title, description: e.summary || '' }),
  );
}
export function rowStatus(row, text, values = artifactValues(row.type, text)) {
  if (row.type === 'relations') {
    const previous = values.find(
      (value) =>
        [key(value.from), key(value.to)].sort().join('|') ===
        [key(row.from), key(row.to)].sort().join('|'),
    );
    return !previous
      ? '新增'
      : previous.name === row.name && previous.description === row.description
        ? '已存在'
        : '与现有不同';
  }
  const previous = matchRow(row, values);
  return !previous
    ? '新增'
    : previous.description === row.description &&
        (row.type !== 'glossary' ||
          (previous.category === row.category &&
            JSON.stringify(previous.aliases) === JSON.stringify(row.aliases)))
      ? '已存在'
      : '与现有不同';
}
export function buildArtifact(type, text, rows, title) {
  if (type === 'glossary') {
    const value = text ? parseGlossary(text) : createGlossary(title);
    for (const row of rows) {
      const old = matchRow(
          row,
          value.entries.map((e) => ({ ...e, name: e.term })),
        ),
        entry = {
          id: old?.id || crypto.randomUUID(),
          term: row.name,
          definition: row.description,
          category: row.category,
          aliases: [
            ...new Set([
              ...(old?.aliases || []),
              ...row.aliases,
              ...(old && old.term !== row.name ? [old.term] : []),
            ]),
          ].filter((a) => a !== row.name),
        };
      const at = value.entries.findIndex((e) => e.id === old?.id);
      if (at >= 0) value.entries[at] = { ...value.entries[at], ...entry };
      else value.entries.push(entry);
    }
    return glossaryText(value);
  }
  if (type === 'places') {
    const value = text ? parseMap(text) : createMap(title);
    value.markers ||= [];
    const generated = new Map();
    for (const row of rows) {
      const old = matchRow(row, value.markers),
        entry = {
          ...old,
          id: old?.id || crypto.randomUUID(),
          name: row.name,
          note: row.description,
          category: row.category,
          x: old?.x ?? row.x,
          y: old?.y ?? row.y,
        };
      generated.set(key(row.name), entry);
      if (old) Object.assign(old, entry);
      else value.markers.push(entry);
    }
    // Keep generated links inside this map: no model-provided filesystem paths.
    for (const row of rows) {
      const marker = generated.get(key(row.name));
      for (const name of row.links || []) {
        const target = value.markers.find((m) => key(m.name) === key(name));
        if (target && target !== marker) {
          marker.relatedIds = [...new Set([...(marker.relatedIds || []), target.id])].slice(0, 32);
          target.relatedIds = [...new Set([...(target.relatedIds || []), marker.id])].slice(0, 32);
        }
      }
    }
    return mapText(value);
  }
  const value = text ? parseOutline(text) : createOutline(title);
  value.roots ||= Object.keys(value.nodes).filter(
    (id) => !Object.values(value.nodes).some((n) => n.children.includes(id)),
  );
  value.relations ||= { nodes: {}, edges: [] };
  for (const row of rows) {
    if (row.type === 'relations') {
      const ensure = (name) => {
        let entry = Object.entries(value.relations.nodes).find(
          ([, n]) => key(n.title) === key(name),
        );
        if (!entry) {
          const id = crypto.randomUUID();
          value.relations.nodes[id] = { title: name, summary: '', children: [] };
          entry = [id, value.relations.nodes[id]];
        }
        return entry[0];
      };
      const from = ensure(row.from),
        to = ensure(row.to),
        old = value.relations.edges.find(
          (e) => [e.from, e.to].sort().join('|') === [from, to].sort().join('|'),
        );
      if (old) Object.assign(old, { label: row.name, description: row.description });
      else
        value.relations.edges.push({
          id: crypto.randomUUID(),
          from,
          to,
          label: row.name,
          description: row.description,
          direction: 'none',
        });
    } else {
      let entry = Object.entries(value.nodes).find(([, n]) =>
        matchRow(row, [{ name: n.title, aliases: n.aliases || [] }]),
      );
      if (entry)
        Object.assign(entry[1], {
          title: row.name,
          summary: row.description,
          aliases: row.aliases,
        });
      else {
        const id = crypto.randomUUID();
        value.nodes[id] = {
          title: row.name,
          summary: row.description,
          aliases: row.aliases,
          children: [],
        };
        value.roots.push(id);
        if (!value.root) value.root = id;
      }
    }
  }
  return outlineText(value);
}
