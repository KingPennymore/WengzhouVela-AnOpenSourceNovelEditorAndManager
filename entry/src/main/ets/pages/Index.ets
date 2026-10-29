import { webview } from '@kit.ArkWeb';
import { url, util } from '@kit.ArkTS';
import { common } from '@kit.AbilityKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { NativeBridge } from '../services/NativeBridge';
import { Runtime, LAUNCH_BACKGROUND } from '../services/Runtime';

@Entry
@Component
struct Index {
  private controller: webview.WebviewController = new webview.WebviewController();
  private bridge: NativeBridge = new NativeBridge();
  private pinchDistance: number = 0;
  /** Bump when the policy text changes materially so consent is requested again. */
  private static readonly POLICY_VERSION: string = '2026-10-29';
  private static readonly POLICY_URL: string = 'https://gitee.com/kingpennymore/wenzhou-vela-mirror-repository/blob/master/PRIVACY.md';
  @State consented: boolean = false;
  @State showFullPolicy: boolean = false;
  @State policyText: string = '';
  // Not `background`: that name collides with the component's .background() attribute method.
  @StorageProp(LAUNCH_BACKGROUND) launchBackground: string = '#d6dbd7';

  aboutToAppear(): void {
    this.bridge.context = this.getUIContext().getHostContext() as common.UIAbilityContext;
    this.bridge.downloads.context = this.bridge.context;
    this.bridge.downloads.clear();
    this.consented = this.readConsent();
    if (!this.consented) this.policyText = this.loadPolicy();
  }

  private consentFile(): string { return this.bridge.context!.filesDir + '/privacy-consent.txt'; }

  private readConsent(): boolean {
    try {
      const file = this.consentFile();
      if (!fs.accessSync(file)) return false;
      return fs.readTextSync(file).trim() === Index.POLICY_VERSION;
    } catch (error) { return false; }
  }

  private loadPolicy(): string {
    try {
      const bytes = this.bridge.context!.resourceManager.getRawFileContentSync('privacy-policy.txt');
      return new util.TextDecoder('utf-8').decodeToString(bytes);
    } catch (error) { return '隐私政策加载失败，请访问：' + Index.POLICY_URL; }
  }

  private agree(): void {
    try {
      const file = fs.openSync(this.consentFile(), fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.TRUNC);
      fs.writeSync(file.fd, Index.POLICY_VERSION); fs.closeSync(file);
    } catch (error) { /* consent then applies to this run only */ }
    this.policyText = '';
    this.consented = true;
  }

  private decline(): void {
    this.bridge.context?.terminateSelf().catch(() => {});
  }

  @Builder
  privacyDialog() {
    Column() {
      Column() {
        if (this.showFullPolicy) {
          Row() {
            Text('隐私政策').fontSize(20).fontWeight(FontWeight.Bold).fontColor($r('sys.color.font_primary')).layoutWeight(1)
            Button('返回', { type: ButtonType.Normal }).height(36).borderRadius(18).fontSize(15)
              .fontColor($r('sys.color.font_emphasize')).backgroundColor($r('sys.color.comp_background_tertiary'))
              .onClick(() => { this.showFullPolicy = false; })
          }.width('100%').margin({ bottom: 12 })
          Scroll() {
            Text(this.policyText).fontSize(14).lineHeight(22).fontColor($r('sys.color.font_secondary')).width('100%')
          }.layoutWeight(1).scrollBar(BarState.Auto)
        } else {
          Text('文舟 隐私政策').fontSize(20).fontWeight(FontWeight.Bold).fontColor($r('sys.color.font_primary')).margin({ bottom: 12 })
          Scroll() {
            Column() {
              Text('欢迎使用文舟 Vela。我们非常重视你的个人信息保护，请你在使用前阅读并确认下列要点：')
                .fontSize(15).lineHeight(23).fontColor($r('sys.color.font_primary'))
              Text('1. 文稿、附件和设置仅保存在本机，不会上传到开发者服务器；本应用无账号体系，不含广告、统计或第三方 SDK。\n2. 仅在你主动使用 GitHub / Gitee 仓库同步、组件下载或更新检查时联网；令牌保存在系统安全存储。\n3. 仅在你执行粘贴操作时读取剪贴板；不收集设备标识、位置、通讯录等信息。\n4. 你可随时删除数据、退出登录或卸载应用。')
                .fontSize(14).lineHeight(22).fontColor($r('sys.color.font_secondary')).margin({ top: 10 })
              Text() {
                Span('完整内容请阅读')
                Span('《隐私政策》').fontColor($r('sys.color.font_emphasize')).onClick(() => { this.showFullPolicy = true; })
                Span('。点击“同意”表示你已阅读并同意；点击“拒绝”将退出应用，我们不会收集任何信息。')
              }.fontSize(14).lineHeight(22).fontColor($r('sys.color.font_secondary')).margin({ top: 10 })
            }.alignItems(HorizontalAlign.Start).width('100%')
          }.layoutWeight(1).scrollBar(BarState.Auto)
          Row({ space: 12 }) {
            Button('拒绝', { type: ButtonType.Normal }).layoutWeight(1).height(44).borderRadius(22).fontSize(16)
              .fontColor($r('sys.color.font_emphasize')).backgroundColor($r('sys.color.comp_background_tertiary'))
              .onClick(() => this.decline())
            Button('同意', { type: ButtonType.Normal }).layoutWeight(1).height(44).borderRadius(22).fontSize(16)
              .fontColor(Color.White).backgroundColor($r('sys.color.brand'))
              .onClick(() => this.agree())
          }.width('100%').margin({ top: 16 })
        }
      }
      .width('100%').constraintSize({ maxWidth: 480, maxHeight: '80%' }).padding(24).borderRadius(24)
      .backgroundColor($r('sys.color.comp_background_primary'))
    }
    .width('100%').height('100%').justifyContent(FlexAlign.Center).padding({ left: 24, right: 24 })
    .backgroundColor('#99000000')
  }

  private resource(request: WebResourceRequest): WebResourceResponse | null {
    try {
      const parsed = new url.URL(request.getRequestUrl());
      if (parsed.protocol === 'https:' && parsed.hostname === 'wenzhou-preview.local' && !request.isMainFrame()) return this.embeddedHtml(parsed);
      if (parsed.protocol !== 'https:' || parsed.hostname !== 'wenzhou-editor.local') return null;
      const path = decodeURIComponent(parsed.pathname.substring(1));
      if (path.startsWith('imports/') && request.getRequestMethod() === 'GET') return this.imported(path.substring(8));
      if (!path.startsWith('web/') || path.includes('\\') || path.split('/').some(part => part === '..' || part === '.')) return null;
      const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
      const bytes = context.resourceManager.getRawFileContentSync(path);
      const buffer = new ArrayBuffer(bytes.byteLength); new Uint8Array(buffer).set(bytes);
      const response = new WebResourceResponse(); response.setResponseData(buffer);
      const mime = path.endsWith('.html') ? 'text/html' : /\.m?js$/.test(path) ? 'text/javascript' : path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.css') ? 'text/css' : path.endsWith('.json') ? 'application/json' : path.endsWith('.woff2') ? 'font/woff2' : path.endsWith('.woff') ? 'font/woff' : 'application/octet-stream';
      response.setResponseMimeType(mime); response.setResponseEncoding('UTF-8'); response.setResponseCode(200); response.setReasonMessage('OK'); response.setResponseIsReady(true); return response;
    } catch (error) { return null; }
  }

  /** Downloaded component ZIPs, streamed from the private cache to the same-origin editor page. */
  private imported(token: string): WebResourceResponse {
    const response = new WebResourceResponse();
    const bytes = /^[0-9a-f-]{36}$/.test(token) ? this.bridge.downloads.read(token) : null;
    if (bytes) {
      response.setResponseData(bytes); response.setResponseMimeType(this.bridge.downloads.isText(token) ? 'text/plain' : 'application/zip'); response.setResponseEncoding('UTF-8');
      response.setResponseHeader([{ headerKey: 'Cache-Control', headerValue: 'no-store' }, { headerKey: 'X-Content-Type-Options', headerValue: 'nosniff' }]);
      response.setResponseCode(200); response.setReasonMessage('OK');
    } else { response.setResponseData(''); response.setResponseMimeType('text/plain'); response.setResponseCode(404); response.setReasonMessage('Not Found'); }
    response.setResponseIsReady(true); return response;
  }

  private embeddedHtml(parsed: url.URL): WebResourceResponse {
    const response = new WebResourceResponse();
    try {
      const path = decodeURIComponent(parsed.pathname.substring(1));
      const resource = this.bridge.previewResource(path, parsed.searchParams.get('html') === 'true');
      let bytes = resource.bytes;
      if (resource.mime === 'text/html') {
        const value = Number(parsed.searchParams.get('fontSize') || '16');
        const size = Number.isFinite(value) ? Math.max(10, Math.min(40, value)) : 16;
        const theme = parsed.searchParams.get('dark') === 'true' ? 'dark' : 'light';
        const defaults = '<style>html{color-scheme:' + theme + '}body{font-family:system-ui,sans-serif;font-size:' + size + 'px;overflow-wrap:anywhere}</style>';
        let html = new util.TextDecoder('utf-8').decodeToString(new Uint8Array(bytes));
        html = /<head\b[^>]*>/i.test(html) ? html.replace(/(<head\b[^>]*>)/i, '$1' + defaults) : defaults + html;
        const encoded = new util.TextEncoder().encodeInto(html);
        bytes = new ArrayBuffer(encoded.byteLength); new Uint8Array(bytes).set(encoded);
      }
      response.setResponseData(bytes); response.setResponseMimeType(resource.mime); response.setResponseEncoding('UTF-8');
      response.setResponseHeader([
        { headerKey: 'Cache-Control', headerValue: 'no-store' },
        { headerKey: 'Access-Control-Allow-Origin', headerValue: '*' },
        { headerKey: 'X-Content-Type-Options', headerValue: 'nosniff' },
        { headerKey: 'Content-Security-Policy', headerValue: "sandbox; default-src 'none'; script-src 'none'; style-src 'unsafe-inline' https://wenzhou-preview.local; img-src data: https://wenzhou-preview.local; font-src data: https://wenzhou-preview.local; media-src https://wenzhou-preview.local; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'" }
      ]);
      response.setResponseCode(200); response.setReasonMessage('OK');
    } catch (error) { response.setResponseData(''); response.setResponseMimeType('text/plain'); response.setResponseCode(403); response.setReasonMessage('Forbidden'); }
    response.setResponseIsReady(true); return response;
  }

  build() {
    Stack() {
      if (this.consented) {
      Web({ src: 'https://wenzhou-editor.local/web/index.html', controller: this.controller })
        .width('100%')
        .height('100%')
        .backgroundColor(this.launchBackground)
        .onControllerAttached(() => { Runtime.controller = this.controller; })
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .editMenuOptions({ onCreateMenu: (_items: Array<TextMenuItem>): Array<TextMenuItem> => {
          this.controller.runJavaScript('window.wenzhouShowSelectionMenu?.()').catch(() => {});
          return [];
        }, onMenuItemClick: (_item: TextMenuItem, _range: TextRange): boolean => false })
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
          methodList: ['readWorkspace', 'writeWorkspace', 'writeWorkspaceDelta', 'readPlugins', 'writePlugins', 'readEnvironment', 'call'],
          controller: this.controller
        })
        .onInterceptRequest(event => this.resource(event.request)!)
        .onOverrideUrlLoading((request: WebResourceRequest): boolean => {
          if (!request.isMainFrame() && ['about:srcdoc', 'about:blank'].includes(request.getRequestUrl())) return false;
          if (!request.isMainFrame() && request.getRequestUrl().startsWith('https://wenzhou-preview.local/')) return false;
          // The privileged view must never navigate to GitHub or user-provided content.
          return request.getRequestUrl() !== 'https://wenzhou-editor.local/web/index.html';
        })
      } else {
        this.privacyDialog()
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor(Color.Transparent)
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.BOTTOM])
  }
}
