// Every whitespace-separated keyword must match somewhere in the same entry.
export function glossaryKeywords(query){return [...new Set(String(query||'').trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean))];}
export function matchesGlossary(entry,keywords){
  const text=[entry.term,entry.category,entry.definition,...(entry.aliases||[])].filter(Boolean).join(' ').toLocaleLowerCase();
  return keywords.every(keyword=>text.includes(keyword));
}
