// Workers and the standalone HTML reader never call setLanguage(), so t()/say() there always return the Chinese
// source text. scripts/build.mjs maps i18n.mjs to this file for those bundles to keep the dictionaries out of them.
export const t=value=>value;
export const say=zh=>zh;
export const getLanguage=()=>'zh-CN';
