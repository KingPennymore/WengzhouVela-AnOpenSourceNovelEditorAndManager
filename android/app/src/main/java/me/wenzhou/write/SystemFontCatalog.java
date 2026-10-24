package me.wenzhou.write;

import android.util.Xml;
import org.json.JSONArray;
import org.xmlpull.v1.XmlPullParser;
import java.io.FileInputStream;
import java.util.TreeSet;

/** WebView can select the named families and aliases exported by Android's font configuration. */
final class SystemFontCatalog {
    static JSONArray list() {
        TreeSet<String> names = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        // These generic families are always provided by Android's typeface resolver.
        names.add("sans-serif"); names.add("serif"); names.add("monospace");
        for (String path : new String[]{"/system/etc/fonts.xml", "/product/etc/fonts_customization.xml"}) {
            try (FileInputStream input = new FileInputStream(path)) {
                XmlPullParser xml = Xml.newPullParser();
                xml.setInput(input, "UTF-8");
                for (int event = xml.getEventType(); event != XmlPullParser.END_DOCUMENT; event = xml.next()) {
                    if (event != XmlPullParser.START_TAG) continue;
                    if (!"family".equals(xml.getName()) && !"alias".equals(xml.getName())) continue;
                    String name = xml.getAttributeValue(null, "name");
                    if (name != null && !name.trim().isEmpty() && name.length() <= 160) names.add(name.trim());
                }
            } catch (Exception ignored) {
                // OEM configurations can be inaccessible; generic families remain selectable.
            }
        }
        return new JSONArray(names);
    }
}
