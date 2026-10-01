import { webview } from '@kit.ArkWeb';
import { common } from '@kit.AbilityKit';
import { NativeBridge } from '../services/NativeBridge';
import { Runtime } from '../services/Runtime';

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  private bridge: NativeBridge = new NativeBridge();
  private pinchDistance: number = 0;

  aboutToAppear(): void {
    this.bridge.context = this.getUIContext().getHostContext() as common.UIAbilityContext;
    Runtime.controller = this.controller;
  }

  build() {
    Column() {
      Web({ src: $rawfile('web/index.html'), controller: this.controller })
        .width('100%')
        .height('100%')
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .fileAccess(false)
        .onlineImageAccess(false)
        .mixedMode(MixedMode.None)
        .zoomAccess(false)
        .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.BOTTOM])
        .onPageEnd(() => { Runtime.updateInsets(); Runtime.publishEnvironment(); })
        .onTouch((event: TouchEvent) => {
          if (event.touches.length === 2) {
            const dx = event.touches[0].x - event.touches[1].x;
            const dy = event.touches[0].y - event.touches[1].y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (this.pinchDistance === 0) {
              this.pinchDistance = Math.max(1, distance);
              this.controller.runJavaScript('window.wenzhouNativePinch && window.wenzhouNativePinch(1,"start")').catch(() => {});
            } else {
              this.controller.runJavaScript('window.wenzhouNativePinch && window.wenzhouNativePinch(' + distance / this.pinchDistance + ',"move")').catch(() => {});
            }
          } else if (this.pinchDistance > 0) {
            this.pinchDistance = 0;
            this.controller.runJavaScript('window.wenzhouNativePinch && window.wenzhouNativePinch(1,"end")').catch(() => {});
          }
        })
        .javaScriptProxy({
          object: this.bridge,
          name: 'WenzhouNative',
          // Register Promise-returning calls in methodList. asyncMethodList is fire-and-forget.
          methodList: ['readWorkspace', 'writeWorkspace', 'readPlugins', 'writePlugins', 'readEnvironment', 'call'],
          controller: this.controller
        })
        .onOverrideUrlLoading((request: WebResourceRequest): boolean => {
          if (!request.isMainFrame() && ['about:srcdoc', 'about:blank'].includes(request.getRequestUrl())) return false;
          // The privileged view must never navigate to GitHub or user-provided content.
          return request.getRequestUrl() !== 'resource://rawfile/web/index.html';
        })
    }
    .width('100%')
    .height('100%')
    .backgroundColor(Color.Transparent)
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.BOTTOM])
  }
}
