import { font } from '@kit.ArkUI';
import { text } from '@kit.ArkGraphics2D';
import { deviceInfo } from '@kit.BasicServicesKit';

/** Enumerates families, not file paths. API 12 devices use their UI font configuration. */
export async function listSystemFonts(): Promise<string[]> {
  const names = new Set<string>();
  try {
    const config = font.getUIFontConfig();
    for (const family of config.generic) {
      if (family.family) names.add(family.family);
      for (const alias of family.alias) if (alias.name) names.add(alias.name);
    }
    for (const group of config.fallbackGroups) {
      for (const family of group.fallback) if (family.family) names.add(family.family);
    }
  } catch (_) {}
  // getSystemFontList only works on PC/2-in-1; the graphics API includes phone fonts too.
  if (deviceInfo.sdkApiVersion >= 14) {
    try {
      const fullNames = await text.getSystemFontFullNamesByType(text.SystemFontType.ALL);
      for (const name of fullNames.slice(0, 4096)) {
        try {
          const descriptor = await text.getFontDescriptorByFullName(name, text.SystemFontType.ALL);
          if (descriptor.fontFamily) names.add(descriptor.fontFamily);
        } catch (_) {}
      }
    } catch (_) {}
  }
  return Array.from(names).filter(name => name.length > 0 && name.length <= 160).sort();
}
