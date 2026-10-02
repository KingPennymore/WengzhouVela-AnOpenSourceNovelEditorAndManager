using System;
public record Chapter(string Title, int Words);
public class Example { public static void Main() { Console.WriteLine(new Chapter("Lighthouse", 1200)); } }
