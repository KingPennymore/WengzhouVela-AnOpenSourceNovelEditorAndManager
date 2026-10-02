import { common } from '@kit.AbilityKit';
import { webview } from '@kit.ArkWeb';
import { util } from '@kit.ArkTS';
import { url } from '@kit.ArkTS';
import { HtmlPreviewSession, ReaderLayout } from '../services/HtmlPreviewSession';

interface HtmlReaderOptions { path: string; english: boolean; dark: boolean; pages: boolean; spread: boolean; titlePage: boolean; motion: string; fontSize: number; layout: ReaderLayout; }

@Entry
@Component
struct HtmlPreview {
  private controller: webview.WebviewController = new webview.WebviewController();
  @State private scripts: boolean = false;
  @State private network: boolean = false;
  @State private textZoom: number = Math.round(HtmlPreviewSession.fontSize * 100 / 16);
  private pageWidth: number = 360;
  private pinchDistance: number = 0;
  private pinchStartZoom: number = 100;
  private pageBackground: string = HtmlPreviewSession.dark ? '#161e1a' : '#eef3ef';
  private foreground: string = HtmlPreviewSession.dark ? '#e2ebe5' : '#1a2b20';

  private reload(): void {
    // Apply reactive Web settings before reloading the document.
    setTimeout(() => { try { this.controller.refresh(); } catch (error) { } }, 0);
  }
  private resource(request: WebResourceRequest): WebResourceResponse | null {
    const response = new WebResourceResponse();
    try {
      const parsed = new url.URL(request.getRequestUrl());
      if (HtmlPreviewSession.reading && parsed.hostname === 'wenzhou-reader.local' && parsed.pathname === '/reader.js') {
        const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
        const source = context.resourceManager.getRawFileContentSync('web/html-reader.js');
        const buffer = new ArrayBuffer(source.byteLength); new Uint8Array(buffer).set(source);
        response.setResponseData(buffer); response.setResponseMimeType('text/javascript'); response.setResponseEncoding('UTF-8'); response.setResponseCode(200); response.setReasonMessage('OK'); response.setResponseIsReady(true); return response;
      }
      if (parsed.hostname === 'wenzhou-preview.local' && parsed.protocol === 'https:') {
        const path = decodeURIComponent(parsed.pathname.substring(1));
        const resource = HtmlPreviewSession.files?.readPreviewResource(path, path === HtmlPreviewSession.path);
        if (!resource) throw new Error('预览文件不存在。');
        let bytes = resource.bytes;
        if (HtmlPreviewSession.reading && path === HtmlPreviewSession.path) {
          let text = new util.TextDecoder('utf-8').decodeToString(new Uint8Array(bytes));
          text = text.replace(/\scontenteditable(?:\s*=\s*(?:["'][^"']*["']|[^\s>]+))?/gi, '').replace(/<(input|textarea|select|button)(?=[\s>])/gi, '<$1 disabled readonly');
          const options: HtmlReaderOptions = { path: HtmlPreviewSession.path, english: HtmlPreviewSession.english, dark: HtmlPreviewSession.dark, pages: HtmlPreviewSession.pages, spread: HtmlPreviewSession.spread, titlePage: HtmlPreviewSession.titlePage, motion: HtmlPreviewSession.motion, fontSize: HtmlPreviewSession.fontSize, layout: HtmlPreviewSession.layout };
          text = text.replace(/<meta[^>]*http-equiv\s*=\s*['"]?Content-Security-Policy[^>]*>/gi, '');
          text += '<script src="https://wenzhou-reader.local/reader.js?config=' + encodeURIComponent(JSON.stringify(options)) + '"></script>';
          response.setResponseHeader([{ headerKey: 'Content-Security-Policy', headerValue: "default-src 'none'; script-src https://wenzhou-reader.local; style-src 'unsafe-inline' https://wenzhou-preview.local; img-src data: https://wenzhou-preview.local; font-src https://wenzhou-preview.local; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'" }]);
          const encoded = new util.TextEncoder().encodeInto(text);
          bytes = new ArrayBuffer(encoded.byteLength);
          new Uint8Array(bytes).set(encoded);
        }
        response.setResponseData(bytes);
        response.setResponseMimeType(resource.mime);
        response.setResponseEncoding('UTF-8');
        response.setResponseCode(200);
        response.setReasonMessage('OK');
        response.setResponseIsReady(true);
        return response;
      }
      if (this.network && parsed.protocol === 'https:') return null;
    } catch (error) { }
    response.setResponseData('');
    response.setResponseMimeType('text/plain');
    response.setResponseCode(403);
    response.setReasonMessage('Forbidden');
    response.setResponseIsReady(true);
    return response;
  }

  build() {
    Column() {
      if (!HtmlPreviewSession.reading) {
      Text('HTML · ' + HtmlPreviewSession.path)
        .fontSize(16).fontColor(this.foreground).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
        .width('100%').padding({ left: 16, right: 16, top: 8, bottom: 4 })
      Scroll() {
        Row({ space: 8 }) {
          Button(HtmlPreviewSession.reading ? (HtmlPreviewSession.english ? 'Library' : '返回阅读') : (HtmlPreviewSession.english ? 'Back to editor' : '返回编辑')).fontSize(13).height(36).backgroundColor('#23744e').onClick(() => this.getUIContext().getRouter().back())
          if (!HtmlPreviewSession.reading) {
          Button(HtmlPreviewSession.english ? 'Refresh' : '刷新').fontSize(13).height(36).backgroundColor('#23744e').onClick(() => this.reload())
          Button(HtmlPreviewSession.english ? (this.scripts ? 'Scripts: on' : 'Scripts: off') : (this.scripts ? '脚本：开' : '脚本：关')).fontSize(13).height(36).backgroundColor('#23744e').onClick(() => { this.scripts = !this.scripts; this.reload(); })
          Button(HtmlPreviewSession.english ? (this.network ? 'Network: on' : 'Network: off') : (this.network ? '联网：开' : '联网：关')).fontSize(13).height(36).backgroundColor('#23744e').onClick(() => { this.network = !this.network; this.reload(); })
          }
        }.padding({ left: 8, right: 8, top: 4, bottom: 8 })
      }.scrollable(ScrollDirection.Horizontal).scrollBar(BarState.Off).width('100%')
      }
      Web({ src: HtmlPreviewSession.pageUrl(), controller: this.controller })
        .width('100%').layoutWeight(1)
        .javaScriptAccess(this.scripts || HtmlPreviewSession.reading).domStorageAccess(HtmlPreviewSession.reading).fileAccess(false)
        .onlineImageAccess(true).mixedMode(MixedMode.None).zoomAccess(false).textZoomRatio(HtmlPreviewSession.reading ? 100 : this.textZoom)
        // ArkWeb delegates to its network loader when the callback returns null.
        .onInterceptRequest(event => this.resource(event.request)!)
        .onOverrideUrlLoading(request => {
          if (HtmlPreviewSession.reading && request.getRequestUrl() === 'https://wenzhou-reader.local/back') { this.getUIContext().getRouter().back(); return true; }
          if (HtmlPreviewSession.reading) return request.getRequestUrl() !== HtmlPreviewSession.pageUrl();
          try {
            const parsed = new url.URL(request.getRequestUrl());
            return parsed.protocol !== 'https:' || (parsed.hostname !== 'wenzhou-preview.local' && !this.network);
          } catch (error) { return true; }
        })
        .onSizeChange((_oldValue, value) => { this.pageWidth = Number(value.width); })
        .parallelGesture(PinchGesture({ fingers: 2, distance: 3 })
          .onActionStart(() => { this.pinchStartZoom = this.textZoom; })
          .onActionUpdate(event => { this.textZoom = Math.round(Math.max(50, Math.min(300, this.pinchStartZoom * event.scale))); if (HtmlPreviewSession.reading) this.controller.runJavaScript('window.velaHtmlReaderZoom?.(' + this.textZoom + ')').catch(() => {}); }))

    }.width('100%').height('100%').backgroundColor(this.pageBackground)
  }
}
