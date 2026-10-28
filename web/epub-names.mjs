import {MB} from './text-utils.mjs';
// What the export dialog needs before the EPUB builder (a lazy chunk, web/epub-export.mjs) is loaded.
export const COVER_TYPES=Object.freeze({'image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp'});
export const MAX_COVER_BYTES=5*MB;
export const epubFileName=title=>(String(title||'').replace(/[\\/:*?"<>|\x00-\x1f\x7f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,120).trim()||'电子书')+'.epub';
