CREATE TABLE chapters (id INTEGER PRIMARY KEY, title TEXT NOT NULL, words INTEGER);
INSERT INTO chapters VALUES (1, 'Lighthouse', 1200);
SELECT title, words FROM chapters WHERE words > 1000 ORDER BY id;
