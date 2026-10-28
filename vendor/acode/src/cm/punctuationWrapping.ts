import {
	Decoration,
	type DecorationSet,
	EditorView,
	MatchDecorator,
	ViewPlugin,
	type ViewUpdate,
	WidgetType,
} from "@codemirror/view";

// VS Code's default wordWrapBreak{After,Before}Characters:
// https://github.com/microsoft/vscode/blob/main/src/vs/editor/common/config/editorOptions.ts
const after = " \t})]?|/&.,;¢°′″‰℃、。｡､￠，．：；？！％・･ゝゞヽヾーァィゥェォッャュョヮヵヶぁぃぅぇぉっゃゅょゎゕゖㇰㇱㇲㇳㇴㇵㇶㇷㇸㇹㇺㇻㇼㇽㇾㇿ々〻ｧｨｩｪｫｬｭｮｯｰ”〉》」』】〕）］｝｣";
const before = "([{‘“〈《「『【〔（［｛｢£¥＄￡￥+＋";
const escapeClass = (text: string) => text.replace(/[\\\]\[\-^]/g, "\\$&");

class WrapOpportunity extends WidgetType {
	toDOM(view: EditorView): HTMLElement {
		return view.dom.ownerDocument.createElement("wbr");
	}
}

const opportunity = Decoration.widget({
	widget: new WrapOpportunity(),
	side: 1,
});
const matcher = new MatchDecorator({
	// Consume the character before each boundary. Keep runs of closing
	// punctuation together and break before a run of opening punctuation.
	// Whitespace already provides native breaks, so needs no widget.
	regexp: new RegExp(
		`[${escapeClass(after.trim())}](?=[^${escapeClass(after)}])|[^${escapeClass(before)}\\s](?=[${escapeClass(before)}])`,
		"gu",
	),
	decorate: (add, _from, to) => add(to, to, opportunity),
});

// A widget at the edge of a non-empty selection breaks IME replacement: Chrome
// composes next to the <wbr>, CodeMirror misreads the pre-edit DOM, and typing
// pinyin over "你好" after "，" leaves "t他". Drop the widgets at selection edges.
function withoutSelectionEdges(view: EditorView, all: DecorationSet): DecorationSet {
	const edges = view.state.selection.ranges.filter((range) => !range.empty).flatMap((range) => [range.from, range.to]);
	if (!edges.length) return all;
	return all.update({ filter: (from) => !edges.includes(from) });
}

/** Add punctuation break opportunities; retain native layout and long-word wrapping. */
export const punctuationWrapping = ViewPlugin.fromClass(
	class {
		all: DecorationSet;
		decorations: DecorationSet;

		constructor(view: EditorView) {
			this.all = matcher.createDeco(view);
			this.decorations = withoutSelectionEdges(view, this.all);
		}

		update(update: ViewUpdate) {
			const all = matcher.updateDeco(update, this.all);
			if (all !== this.all || update.selectionSet) {
				this.all = all;
				this.decorations = withoutSelectionEdges(update.view, all);
			}
		}
	},
	{ decorations: (value) => value.decorations },
);
