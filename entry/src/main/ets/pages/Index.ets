import { webview } from '@kit.ArkWeb';
import { url } from '@kit.ArkTS';
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

  private resource(request: WebResourceRequest): WebResourceResponse | null {
    try {
      const parsed = new url.URL(request.getRequestUrl());
      if (parsed.protocol !== 'https:' || parsed.hostname !== 'wenzhou-editor.local') return null;
      const path = decodeURIComponent(parsed.pathname.substring(1));
      if (!path.startsWith('web/') || path.includes('\\') || path.split('/').some(part => part === '..' || part === '.')) return null;
      const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
      const bytes = context.resourceManager.getRawFileContentSync(path);
      const buffer = new ArrayBuffer(bytes.byteLength); new Uint8Array(buffer).set(bytes);
      const response = new WebResourceResponse(); response.setResponseData(buffer);
      const mime = path.endsWith('.html') ? 'text/html' : /\.m?js$/.test(path) ? 'text/javascript' : path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.css') ? 'text/css' : path.endsWith('.json') ? 'application/json' : path.endsWith('.woff2') ? 'font/woff2' : path.endsWith('.woff') ? 'font/woff' : 'application/octet-stream';
      response.setResponseMimeType(mime); response.setResponseEncoding('UTF-8'); response.setResponseCode(200); response.setReasonMessage('OK'); response.setResponseIsReady(true); return response;
    } catch (error) { return null; }
  }

  build() {
    Column() {
      Web({ src: 'https://wenzhou-editor.local/web/index.html', controller: this.controller })
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
        .parallelGesture(PinchGesture({ fingers: 2, distance: 3 })
          .onActionStart(() => { this.controller.runJavaScript('window.wenzhouNativePinch?.(1,"start")').catch(() => {}); })
          .onActionUpdate(event => { this.controller.runJavaScript('window.wenzhouNativePinch?.(' + event.scale + ',"move")').catch(() => {}); })
          .onActionEnd(() => { this.controller.runJavaScript('window.wenzhouNativePinch?.(1,"end")').catch(() => {}); })
          .onActionCancel(() => { this.controller.runJavaScript('window.wenzhouNativePinch?.(1,"end")').catch(() => {}); }))
        .javaScriptProxy({
          object: this.bridge,
          name: 'WenzhouNative',
          // Register Promise-returning calls in methodList. asyncMethodList is fire-and-forget.
          methodList: ['readWorkspace', 'writeWorkspace', 'readPlugins', 'writePlugins', 'readEnvironment', 'call'],
          controller: this.controller
        })
        .onInterceptRequest(event => this.resource(event.request)!)
        .onOverrideUrlLoading((request: WebResourceRequest): boolean => {
          if (!request.isMainFrame() && ['about:srcdoc', 'about:blank'].includes(request.getRequestUrl())) return false;
          // The privileged view must never navigate to GitHub or user-provided content.
          return request.getRequestUrl() !== 'https://wenzhou-editor.local/web/index.html';
        })
    }
    .width('100%')
    .height('100%')
    .backgroundColor(Color.Transparent)
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.BOTTOM])
  }
}
