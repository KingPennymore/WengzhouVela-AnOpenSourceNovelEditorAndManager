import { webview } from '@kit.ArkWeb';
import { window } from '@kit.ArkUI';
import { hilog } from '@kit.PerformanceAnalysisKit';

interface EditorEnvironment { dark: boolean; top: number; bottom: number; left: number; right: number; }

export class Runtime {
  static controller: webview.WebviewController | undefined = undefined;
  static mainWindow: window.Window | undefined = undefined;
  static immersive: boolean = false;
  static environment: EditorEnvironment = { dark: false, top: 0, bottom: 0, left: 0, right: 0 };

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

  static async applyAppearance(dark: boolean, surface?: string, foreground?: string): Promise<void> {
    const main = Runtime.mainWindow;
    if (!main) return;
    const background = surface && /^#[0-9a-f]{6}$/i.test(surface) ? surface : dark ? '#161e1a' : '#eef3ef';
    const content = foreground && /^#[0-9a-f]{6}$/i.test(foreground) ? foreground : dark ? '#d5e5db' : '#28372f';
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
