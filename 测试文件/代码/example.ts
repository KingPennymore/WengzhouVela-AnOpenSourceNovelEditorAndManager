interface Chapter { title: string; words: number; }
const chapters: Chapter[] = [{ title: 'Lighthouse', words: 1200 }];
export const totalWords = (items: Chapter[]): number => items.reduce((sum, item) => sum + item.words, 0);
