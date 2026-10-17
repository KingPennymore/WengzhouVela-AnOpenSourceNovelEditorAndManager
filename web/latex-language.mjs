// LaTeX highlighting and editing helpers, loaded with the latex-editor chunk when a .tex file is opened.
import {StreamLanguage} from '@codemirror/language';
import {stex} from '@codemirror/legacy-modes/mode/stex';
import {latexEditing} from './latex-editor.mjs';
const tex=StreamLanguage.define(stex);
export const latexSupport=()=>[tex,latexEditing()];
