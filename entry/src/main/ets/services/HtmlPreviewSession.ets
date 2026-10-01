import { WorkspaceFiles } from './WorkspaceFiles';

// The preview page receives a workspace reader, never the editor's JavaScript bridge.
export class HtmlPreviewSession {
  static files: WorkspaceFiles | undefined = undefined;
  static path: string = '';
  static dark: boolean = false;
  static pageUrl(): string {
    return 'https://wenzhou-preview.local/' + HtmlPreviewSession.path.split('/').map(part => encodeURIComponent(part)).join('/');
  }
}
