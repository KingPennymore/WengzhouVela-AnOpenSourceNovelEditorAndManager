// Outline headings for TeX sources. Kept apart from latex-editor.mjs (a lazy chunk) because the editor index needs
// it for every .tex outline.
export const LEVELS={part:0,chapter:1,section:2,subsection:3,subsubsection:4,paragraph:5};
/** Outline heading for a source line, e.g. "  2  引言" for \section{引言}; null for other lines. */
export function texHeading(line){
  const match=/^\s*\\(part|chapter|section|subsection|subsubsection|paragraph)(\*?)\s*(?:\[[^\]]*\])?\s*\{(.*)\}\s*(?:%.*)?$/.exec(line);if(!match)return null;
  const level=LEVELS[match[1]],title=match[3].replace(/\\[A-Za-z]+\*?\s*(\{([^{}]*)\})?/g,(all,group,inner)=>inner??'').replace(/[{}]/g,'').trim()||match[1];
  return '　'.repeat(Math.max(0,level-1))+title;
}
