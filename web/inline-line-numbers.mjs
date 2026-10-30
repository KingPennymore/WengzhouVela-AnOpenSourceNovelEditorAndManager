// Line metadata is a decoration, never document text or an editable widget.
// Only visible logical lines are numbered; wrapped continuations keep their layout.
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view';
export function inlineLineNumbers() {
  const build = (view) => {
    const lines = [];
    let previous = -1;
    for (const range of view.visibleRanges) {
      let line = view.state.doc.lineAt(range.from);
      while (line.from <= range.to) {
        if (line.from > previous) {
          lines.push(
            Decoration.line({
              attributes: {
                class: 'vela-numbered-line',
                'data-vela-line-number': String(line.number),
              },
            }).range(line.from),
          );
          previous = line.from;
        }
        if (line.to === view.state.doc.length) break;
        line = view.state.doc.line(line.number + 1);
      }
    }
    return Decoration.set(lines);
  };
  return [
    EditorView.editorAttributes.of({ class: 'vela-inline-line-numbers' }),
    ViewPlugin.fromClass(
      class {
        constructor(view) {
          this.decorations = build(view);
        }
        update(update) {
          if (update.docChanged || update.viewportChanged) this.decorations = build(update.view);
        }
      },
      { decorations: (plugin) => plugin.decorations },
    ),
  ];
}
