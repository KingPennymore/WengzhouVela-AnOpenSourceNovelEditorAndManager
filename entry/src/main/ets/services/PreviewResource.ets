export interface PreviewResource { bytes: ArrayBuffer; mime: string; }

export function previewMime(path: string): string {
  const extension = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
  switch (extension) {
    case 'html': case 'htm': return 'text/html';
    case 'css': return 'text/css';
    case 'js': case 'mjs': return 'text/javascript';
    case 'json': return 'application/json';
    case 'svg': return 'image/svg+xml';
    case 'png': return 'image/png';
    case 'jpg': case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    case 'avif': return 'image/avif';
    case 'ico': return 'image/x-icon';
    case 'woff': return 'font/woff';
    case 'woff2': return 'font/woff2';
    case 'ttf': return 'font/ttf';
    case 'otf': return 'font/otf';
    case 'mp4': return 'video/mp4';
    case 'mp3': return 'audio/mpeg';
    case 'txt': case 'csv': case 'md': return 'text/plain';
    default: return 'application/octet-stream';
  }
}
