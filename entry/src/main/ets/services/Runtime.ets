import { webview } from '@kit.ArkWeb';
import { window } from '@kit.ArkUI';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { preferences } from '@kit.ArkData';
import { common } from '@kit.AbilityKit';

/** AppStorage key for the Web component's background before the page paints. */
export const LAUNCH_BACKGROUND: string = 'launchBackground';
const HEX: RegExp = /^#[0-9a-f]{6}$/i;

interface EditorEnvironment { platform: string; dark: boolean; top: number; bottom: number; left: number; right: number; }

export class Runtime {
  static controller: webview.WebviewController | undefined = undefined;
  static mainWindow: window.Window | undefined = undefined;
  static immersive: boolean = false;
  static environment: EditorEnvironment = { platform: 'harmonyos', dark: false, top: 0, bottom: 0, left: 0, right: 0 };
  private static store: preferences.Preferences | undefined = undefined;

  static readEnvironment(): string { return JSON.stringify(Runtime.environment); }

  static publishEnvironment(): void {
    Runtime.controller?.runJavaScript('window.dispatchEvent(new CustomEvent("wenzhouEnvironment",{detail:' + Runtime.readEnvironment() + '}))').catch(() => {});
  }

  static updateSystemTheme(dark: boolean): void {
    Runtime.environment.dark = dark;
    Runtime.publishEnvironment();
  }

  static updateInsets(): void {
    const main = Runtime.mainWindow;
    if (!main) return;
    try {
      const ui = main.getUIContext();
      // ArkUI reserves the top system area. Only the bottom is extended into the indicator.
      const navigation = main.getWindowAvoidArea(window.AvoidAreaType.TYPE_NAVIGATION_INDICATOR);
      Runtime.environment.top = 0;
      Runtime.environment.bottom = Runtime.immersive ? 0 : ui.px2vp(navigation.bottomRect.height);
      Runtime.environment.left = 0;
      Runtime.environment.right = 0;
      Runtime.publishEnvironment();
    } catch (_) { hilog.warn(0x1122, 'WenzhouLayout', 'Window safe area not ready; retaining last measured insets.'); }
  }

  /** The startup screen's colour: the page background under web/startup.css's 10% black (light) or 7% white (dark) veil. */
  static veiled(color: string, dark: boolean): string {
    let result = '#';
    for (let i = 1; i < 7; i += 2) {
      const channel = parseInt(color.slice(i, i + 2), 16);
      result += Math.round(dark ? channel + (255 - channel) * 0.07 : channel * 0.9).toString(16).padStart(2, '0');
    }
    return result;
  }

  /** Paints the window in last session's startup colour before the page loads, resolved the way web/startup.js does. */
  static async restore(context: common.UIAbilityContext): Promise<void> {
    let theme = 'system', light = '', night = '';
    try {
      Runtime.store = preferences.getPreferencesSync(context, { name: 'appearance' });
      theme = Runtime.store.getSync('theme', 'system') as string;
      light = Runtime.store.getSync('light', '') as string;
      night = Runtime.store.getSync('night', '') as string;
    } catch (_) { hilog.warn(0x1122, 'WenzhouAppearance', 'Saved appearance unavailable; using the default palette.'); }
    const dark = theme === 'dark' || theme !== 'light' && Runtime.environment.dark;
    const saved = dark ? night : light;
    await Runtime.applyAppearance(dark, Runtime.veiled(HEX.test(saved) ? saved : dark ? '#161e1a' : '#eef3ef', dark));
  }

  /** Saves the page's theme choice and both backgrounds for the next cold start. */
  static remember(theme?: string, light?: string, night?: string): void {
    const store = Runtime.store;
    if (!store || !theme || !['light', 'dark', 'system'].includes(theme) || !light || !HEX.test(light) || !night || !HEX.test(night)) return;
    try {
      store.putSync('theme', theme); store.putSync('light', light); store.putSync('night', night);
      store.flush().catch(() => {});
    } catch (_) { hilog.warn(0x1122, 'WenzhouAppearance', 'Appearance not saved for the next start.'); }
  }

  static async applyAppearance(dark: boolean, surface?: string, foreground?: string): Promise<void> {
    const background = surface && HEX.test(surface) ? surface : dark ? '#161e1a' : '#eef3ef';
    AppStorage.setOrCreate(LAUNCH_BACKGROUND, background);
    const main = Runtime.mainWindow;
    if (!main) return;
    const content = foreground && HEX.test(foreground) ? foreground : dark ? '#d5e5db' : '#28372f';
    main.setWindowBackgroundColor(background);
    await main.setWindowSystemBarProperties({ statusBarColor: '#00000000', navigationBarColor: '#00000000', statusBarContentColor: content, navigationBarContentColor: content });
  }

  static async fullscreen(enabled: boolean): Promise<void> {
    const main = Runtime.mainWindow;
    if (!main) throw new Error('应用窗口尚未准备好。');
    await main.setWindowLayoutFullScreen(enabled);
    const bars: Array<'status' | 'navigation'> = enabled ? [] : ['status', 'navigation'];
    await main.setWindowSystemBarEnable(bars);
    await main.setSpecificSystemBarEnabled('navigationIndicator', !enabled);
    Runtime.immersive = enabled;
    Runtime.updateInsets();
  }

  static flush(): void {
    Runtime.controller?.runJavaScript('window.wenzhouSave && window.wenzhouSave()').catch(() => {});
  }
}
