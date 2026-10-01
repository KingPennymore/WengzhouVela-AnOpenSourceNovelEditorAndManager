import { webview } from '@kit.ArkWeb';
import { url } from '@kit.ArkTS';
import { HtmlPreviewSession } from '../services/HtmlPreviewSession';

@Entry
@Component
struct HtmlPreview {
  private controller: webview.WebviewController = new webview.WebviewController();
  @State private scripts: boolean = false;
  @State private network: boolean = false;
  @State private textZoom: number = 100;
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
        response.setResponseData(resource.bytes);
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
          Button('返回编辑').fontSize(13).height(36).backgroundColor('#23744e').onClick(() => this.getUIContext().getRouter().back())
          Button('刷新').fontSize(13).height(36).backgroundColor('#23744e').onClick(() => this.reload())
          Button(this.scripts ? '脚本：开' : '脚本：关').fontSize(13).height(36).backgroundColor('#23744e').onClick(() => { this.scripts = !this.scripts; this.reload(); })
          Button(this.network ? '联网：开' : '联网：关').fontSize(13).height(36).backgroundColor('#23744e').onClick(() => { this.network = !this.network; this.reload(); })
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
        .onTouch((event: TouchEvent) => {
          if (event.touches.length === 2) {
            const dx = event.touches[0].x - event.touches[1].x, dy = event.touches[0].y - event.touches[1].y;
            const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
            if (!this.pinchDistance) { this.pinchDistance = distance; this.pinchStartZoom = this.textZoom; }
            else this.textZoom = Math.round(Math.max(50, Math.min(300, this.pinchStartZoom * distance / this.pinchDistance)));
          } else this.pinchDistance = 0;
        })
    }.width('100%').height('100%').backgroundColor(this.pageBackground)
  }
}
