from dataclasses import dataclass

@dataclass
class Chapter:
    title: str
    words: int

def total_words(chapters: list[Chapter]) -> int:
    return sum(chapter.words for chapter in chapters)

print(total_words([Chapter("Lighthouse", 1200)]))
