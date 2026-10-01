# Acode Writer 1.0.4

A writing plugin with a chapter outline, heading navigation and live chapter character counts. Chinese and English interfaces are included.

## Install

Download `Acode-Writer-1.0.4.zip` to your Android device. In Acode, open Settings → Plugins → + → Local and select the ZIP without extracting it. Enable the plugin and open a TXT or Markdown document.

Click the current chapter in the bottom bar to open the searchable outline. Select a heading to jump to it. The arrows move between sections. Click ⚙ for settings.

## Language

Set Interface language to Auto (follow Acode), 中文 or English, then save. Auto uses Chinese for Acode Chinese locales and English for other locales. A saved explicit selection takes priority over the host language. Your manuscript headings are always displayed as written.

## Heading recognition

Headings must occupy a full line. Auto recognizes Chinese numbering, Chinese chapter headings, Markdown headings, numbered headings and English headings together.

English examples:

```text
Chapter 1: Dawn
Chapter One
CHAPTER IV — Home
Part II
Book Three
```

English presets are case-insensitive. Use a custom template such as `Chapter {number}: {title}`. `{number}` accepts digits, Roman numerals, One–Nineteen, tens and forms such as Twenty-One. Chinese `{序号}` and `{标题}` placeholders remain supported; `{title}` is equivalent to `{标题}`. Templates are case-insensitive and punctuation is literal.

Advanced regex rules match the entire trimmed line, are case-sensitive and use Unicode mode. Enter one rule per line without slash delimiters or flags. For example:

```text
[Cc]hapter [0-9]+.*
Prologue|Epilogue
```

Use the live preview before saving. Avoid nested repetition such as `(a+)+`.

## Counts

Counts are Unicode character counts, **not English word counts**. By default, whitespace and heading lines are excluded, while punctuation is included. Choose Letters and digits only to exclude punctuation and symbols. Include headings affects both chapter and total counts.

The active chapter follows the caret, not scrolling. A chapter ends immediately before the next heading. Text before the first heading appears as Preamble. Files without headings appear as Document (no chapters found).

Settings persist locally. The plugin does not change manuscript contents or send network requests. Light and dark colors follow Acode's application theme.

## Development and verification

Source and build files are included. Run `node --test tests/*.test.cjs`, then `python3 build.py` to create a new ZIP in the parent directory. The browser fixture in `tests/browser` uses real CodeMirror and Ace with a simulated Acode host; see the Chinese readme for setup commands.

26 logic / host simulation checks and 45 browser checks passed. Actual Android Acode installation, keyboard and system navigation still require device testing. See `VALIDATION.md` for scope.


## Multiple formats (1.0.4)

In Writer settings, choose Multiple formats. Add preset, template or regex rules and enable, disable or remove each separately. Up to 32 formats can be combined. A line matching any enabled rule is a heading; overlapping matches never duplicate chapters. Invalid enabled rules are identified by their number and prevent saving. Disabled rules are retained but ignored.
