package main
import "fmt"
type Chapter struct { Title string; Words int }
func main() { chapter := Chapter{Title: "Lighthouse", Words: 1200}; fmt.Println(chapter.Title) }
