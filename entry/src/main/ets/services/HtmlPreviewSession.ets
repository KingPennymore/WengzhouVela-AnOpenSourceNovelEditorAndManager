import { WorkspaceFiles } from './WorkspaceFiles';
export interface ReaderLayout { lineHeight: number; marginTop: number; marginBottom: number; marginLeft: number; marginRight: number; }

// The preview page receives a workspace reader, never the editor's JavaScript bridge.
export class HtmlPreviewSession {
  static files: WorkspaceFiles | undefined = undefined;
  static path: string = '';
  static dark: boolean = false;
  static reading: boolean = false;
  static pages: boolean = false;
  static english: boolean = false;
  static fontSize: number = 16;
  static layout: ReaderLayout = { lineHeight: 1.9, marginTop: 24, marginBottom: 24, marginLeft: 35, marginRight: 35 };
  static pageUrl(): string {
    return 'https://wenzhou-preview.local/' + HtmlPreviewSession.path.split('/').map(part => encodeURIComponent(part)).join('/');
  }
}
