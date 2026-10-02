export const novel = { title: 'Harbour', chapters: ['Lighthouse', 'Island'] };
export function chapterTitle(index) { return novel.chapters[index] ?? 'Untitled'; }
console.log(chapterTitle(0));
