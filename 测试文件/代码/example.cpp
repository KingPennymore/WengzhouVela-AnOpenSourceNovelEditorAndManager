#include <iostream>
#include <string>
struct Chapter { std::string title; int words; };
int main() { Chapter chapter{"Lighthouse", 1200}; std::cout << chapter.title << '\n'; }
