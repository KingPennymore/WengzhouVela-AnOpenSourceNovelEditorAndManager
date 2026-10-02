public class Example {
    record Chapter(String title, int words) {}
    public static void main(String[] args) { System.out.println(new Chapter("Lighthouse", 1200)); }
}
