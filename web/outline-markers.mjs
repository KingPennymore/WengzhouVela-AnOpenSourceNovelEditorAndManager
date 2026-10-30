// Outline links live at the end of their source line, never in a separate gutter.
import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view';
import { StateEffect } from '@codemirror/state';
import { t } from './i18n.mjs';
export const outlineMarksChanged = StateEffect.define();
class OutlineLink extends WidgetType {
  constructor(entries, open) {
    super();
    this.entries = entries;
    this.open = open;
  }
  eq(other) {
    return (
      this.open === other.open &&
      this.entries.map((e) => e.outlineId + e.collection + e.nodeId + e.title).join('|') ===
        other.entries.map((e) => e.outlineId + e.collection + e.nodeId + e.title).join('|')
    );
  }
  toDOM() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'outline-line-marker';
    button.textContent = '⋮';
    button.title = t('链接的大纲节点') + '：' + this.entries.map((e) => e.title).join('、');
    button.setAttribute('aria-label', button.title);
    button.onmousedown = (event) => event.preventDefault();
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.open(this.entries);
    };
    return button;
  }
}
export function outlineMarkers(entries, open) {
  const build = (view) => {
    const lines = new Map();
    for (const entry of entries()) {
      const anchor = entry.anchor;
      if (
        !anchor ||
        anchor.needsReview ||
        anchor.invalid ||
        !Number.isInteger(anchor.offset) ||
        anchor.offset < 0 ||
        anchor.offset > view.state.doc.length
      )
        continue;
      const end = view.state.doc.lineAt(anchor.offset).to;
      if (!lines.has(end)) lines.set(end, []);
      lines.get(end).push(entry);
    }
    return Decoration.set(
      [...lines]
        .sort((a, b) => a[0] - b[0])
        .map(([end, links]) =>
          Decoration.widget({ widget: new OutlineLink(links, open), side: 1 }).range(end),
        ),
    );
  };
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = build(view);
      }
      update(update) {
        if (
          update.docChanged ||
          update.transactions.some((tr) =>
            tr.effects.some((effect) => effect.is(outlineMarksChanged)),
          )
        )
          this.decorations = build(update.view);
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}
