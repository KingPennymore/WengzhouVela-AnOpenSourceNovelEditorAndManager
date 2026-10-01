import { webview } from '@kit.ArkWeb';
import { util } from '@kit.ArkTS';
import { url } from '@kit.ArkTS';
import { HtmlPreviewSession } from '../services/HtmlPreviewSession';

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
      if (parsed.hostname === 'wenzhou-preview.local' && parsed.protocol === 'https:') {
        const path = decodeURIComponent(parsed.pathname.substring(1));
        const resource = HtmlPreviewSession.files?.readPreviewResource(path, path === HtmlPreviewSession.path);
        if (!resource) throw new Error('预览文件不存在。');
        let bytes = resource.bytes;
        if (HtmlPreviewSession.reading && path === HtmlPreviewSession.path) {
          let text = new util.TextDecoder('utf-8').decodeToString(new Uint8Array(bytes));
          text = text.replace(/\scontenteditable(?:\s*=\s*(?:["'][^"']*["']|[^\s>]+))?/gi, '').replace(/<(input|textarea|select|button)(?=[\s>])/gi, '<$1 disabled readonly');
          const css = '<style>input,textarea,select,button{pointer-events:none}' + (HtmlPreviewSession.pages ? 'html{overflow-x:auto;overflow-y:hidden}body{box-sizing:border-box!important;width:100vw!important;height:100vh!important;max-width:none!important;margin:0!important;padding:24px!important;column-width:calc(100vw - 48px)!important;column-gap:48px!important;column-fill:auto!important}' : '') + '</style>';
          text = text.replace(/<head([^>]*)>/i, '<head$1>' + css);
          if (!text.includes(css)) text = text.replace(/^(<!doctype[^>]*>)?/i, '$&' + css);
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
          } else if (HtmlPreviewSession.pages) {
            Button(HtmlPreviewSession.english ? 'Previous' : '上一页').fontSize(13).height(36).onClick(() => this.controller.scrollBy(-vp2px(this.pageWidth), 0))
            Button(HtmlPreviewSession.english ? 'Next' : '下一页').fontSize(13).height(36).onClick(() => this.controller.scrollBy(vp2px(this.pageWidth), 0))
          }
        }.padding({ left: 8, right: 8, top: 4, bottom: 8 })
      }.scrollable(ScrollDirection.Horizontal).scrollBar(BarState.Off).width('100%')
      Web({ src: HtmlPreviewSession.pageUrl(), controller: this.controller })
        .width('100%').layoutWeight(1)
        .javaScriptAccess(this.scripts).domStorageAccess(false).fileAccess(false)
        .onlineImageAccess(true).mixedMode(MixedMode.None).zoomAccess(false).textZoomRatio(this.textZoom)
        // ArkWeb delegates to its network loader when the callback returns null.
        .onInterceptRequest(event => this.resource(event.request)!)
        .onOverrideUrlLoading(request => {
          try {
            const parsed = new url.URL(request.getRequestUrl());
            return parsed.protocol !== 'https:' || (parsed.hostname !== 'wenzhou-preview.local' && !this.network);
          } catch (error) { return true; }
        })
        .onSizeChange((_oldValue, value) => { this.pageWidth = Number(value.width); })
        .parallelGesture(PinchGesture({ fingers: 2, distance: 3 })
          .onActionStart(() => { this.pinchStartZoom = this.textZoom; })
          .onActionUpdate(event => { this.textZoom = Math.round(Math.max(50, Math.min(300, this.pinchStartZoom * event.scale))); }))

    }.width('100%').height('100%').backgroundColor(this.pageBackground)
  }
}
