/** Vela project SDK v3. Revisions and IDs are opaque; all paths are relative to a granted project. */
export type Revision = string;
export type WorkspaceId = string;
export type Unsubscribe = () => void;
export interface VelaError extends Error { code: 'E_CONFLICT' | 'E_EXISTS' | 'E_NOT_FOUND' | 'E_INVALID_PATH' | 'E_INVALID_DATA' | 'E_LIMIT' | 'E_QUOTA' | 'E_CANCELLED' | 'E_UNSUPPORTED' | 'E_PERMISSION' | 'E_STALE_CURSOR' | 'E_PLUGIN_STOPPED' | 'E_RECOVERY_REQUIRED'; details: Record<string, unknown>; retryable: boolean; }
export interface WorkspaceHandle { id: WorkspaceId; name: string; revision: Revision; writable: boolean; }
export interface FileRef { workspaceId: WorkspaceId; path: string; }
export interface FileEntry extends FileRef { entryId: string; kind: 'file' | 'directory'; size: number; mime: string; revision: Revision; textEditable: boolean; modifiedAt: string; }
export interface ReadOptions { signal?: AbortSignal; }
export interface TextResult { text: string; revision: Revision; encoding: 'utf-8'; }
export interface BytesResult { bytes: Uint8Array; revision: Revision; totalSize: number; }
export interface BlobReceipt { blobId: string; size: number; sha256: string; }
export type FileChange =
  | { kind: 'mkdir'; path: string }
  | { kind: 'writeText'; path: string; text: string; expectedRevision: Revision | null; addToReadingList?: boolean }
  | { kind: 'writeBlob'; path: string; blobId: string; expectedRevision: Revision | null; addToReadingList?: boolean }
  | { kind: 'move'; from: string; to: string; expectedRevision: Revision }
  | { kind: 'delete'; path: string; expectedRevision: Revision; recursive?: boolean; mode: 'trash' };
export interface BatchRequest { workspaceId: WorkspaceId; expectedWorkspaceRevision: Revision; idempotencyKey: string; label?: string; changes: FileChange[]; }
export interface BatchReceipt { transactionId: string; workspaceRevision: Revision; changed: FileEntry[]; removed: { entryId: string; path: string }[]; }
export interface ProjectEvent { revision: Revision; transactionId?: string; origin: 'plugin' | 'editor' | 'sync' | 'import' | 'external' | 'restore'; originPluginId?: string; changes: { kind: 'create' | 'change' | 'move' | 'delete'; entryId: string; path: string; oldPath?: string; revision?: Revision }[]; }
export interface TaskProgress { taskId: string; phase: string; completedFiles?: number; totalFiles?: number; completedBytes?: number; totalBytes?: number; }
export interface TaskHandle<T> { readonly id: string; readonly result: Promise<T>; onProgress(listener: (event: TaskProgress) => void): Unsubscribe; cancel(): Promise<void>; }
export interface TaskStatus<T = unknown> { state: 'running' | 'committing' | 'completed' | 'cancelled' | 'failed'; progress?: TaskProgress; result?: T; error?: { code: string; message: string; details: Record<string, unknown>; retryable: boolean }; }
export interface Selection { token: string; name: string; size: number; mime: string; }
export interface SnapshotInfo { id: string; label: string; createdAt: string; bytes: number; }
export interface Capabilities {
  apiVersion: 3; platform: string;
  limits: { textBytes: number; readChunkBytes: number; bridgeChunkBytes: number; importFileBytes: number; projectEntries: number; archiveExpandedBytes: number; archiveEntries: number; archiveFileBytes?: number; projectBytes: number; snapshotBytes: number; assetBytes?: number };
  resource: { range: boolean; worker: boolean; canvas2d: boolean };
  features: { filesystem: boolean; transactions: boolean; assetSessions: boolean; archives: boolean; snapshots: boolean; nativePicker: boolean; independentPreview: boolean; externalWatch: boolean };
}
export interface Page {
  readonly container: HTMLElement; readonly body: HTMLElement; settitle(title: string): void;
  show(): void; hide(): void; close(): Promise<boolean>; destroy(): void;
  onVisible(listener: () => void): Unsubscribe; onHide(listener: () => void): Unsubscribe;
  onBeforeClose(listener: () => boolean | Promise<boolean>): Unsubscribe;
}
export interface DocumentFormatProvider {
  id: string; extensions: string[];
  importBytes(bytes: Uint8Array, name: string): { name: string; text: string };
  validate?(source: string): unknown;
  plainText(source: string): string;
  toHtml(source: string): string;
  render(options: { root: HTMLElement; doc: { id: string; name: string; text: string }; onChange(text: string): void; onCopy(text: string): void; onError(error: Error): void; onGlossary?: (text: string) => void; manage(): void; exportText(name: string, text: string): Promise<unknown>; exportBinary(name: string, bytes: Uint8Array, mime?: string): Promise<unknown> }): void;
}
export interface Vela {
  registerDocumentFormat(provider: DocumentFormatProvider): Unsubscribe;
  readonly version: 3; readonly platform: string; readonly capabilities: readonly string[];
  workspace: {
    current(): Promise<WorkspaceHandle | null>;
    list(): Promise<WorkspaceHandle[]>;
    open(args: { workspaceId: WorkspaceId }): Promise<WorkspaceHandle>;
    create(args: { name: string; parentWorkspaceId?: WorkspaceId }): Promise<WorkspaceHandle>;
  };
  fs: {
    list(args: FileRef & { recursive?: boolean; limit?: number; cursor?: string }): Promise<{ entries: FileEntry[]; revision: Revision; nextCursor?: string }>;
    stat(ref: FileRef): Promise<FileEntry>;
    readText(ref: FileRef, options?: ReadOptions): Promise<TextResult>;
    readBytes(ref: FileRef & { offset?: number; length?: number; expectedRevision?: Revision }, options?: ReadOptions): Promise<BytesResult>;
    applyBatch(args: BatchRequest, options?: ReadOptions): Promise<BatchReceipt>;
    beginWrite(args: { workspaceId: WorkspaceId; size: number; mime: string; sha256?: string }): Promise<{ blobId: string; maxChunkBytes: number }>;
    writeChunk(args: { blobId: string; sequence: number; bytes: Uint8Array }): Promise<{ acceptedBytes: number; nextSequence: number }>;
    finishWrite(args: { blobId: string }): Promise<BlobReceipt>;
    abortWrite(args: { blobId: string }): Promise<void>;
    watch(args: { workspaceId: WorkspaceId; paths?: string[] }, listener: (event: ProjectEvent) => void): Unsubscribe;
  };
  io: {
    pickFiles(args: { multiple: boolean; accept: string[] }): Promise<{ cancelled: boolean; selections: Selection[] }>;
    importFiles(args: { workspaceId: WorkspaceId; expectedWorkspaceRevision: Revision; selections: { token: string; targetPath: string }[]; collision: 'error' | 'rename' }, options?: ReadOptions): TaskHandle<{ transactionId: string; entries: FileEntry[] }>;
    inspectArchive(args: { selectionToken: string }, options?: ReadOptions): TaskHandle<{ archiveToken: string; entries: { path: string; directory: boolean; size: number }[]; totalBytes: number }>;
    readArchiveText(args: { archiveToken: string; path: string }): Promise<{ text: string }>;
    importArchive(args: { archiveToken: string; workspaceId: WorkspaceId; targetDirectory: string; expectedWorkspaceRevision: Revision; collision: 'error' }, options?: ReadOptions): TaskHandle<{ transactionId: string; revision: Revision }>;
    exportFile(args: FileRef & { expectedRevision: Revision; suggestedName: string }, options?: ReadOptions): TaskHandle<{ saved: boolean; name?: string }>;
    exportArchive(args: { snapshotId: string; root: string; paths: string[]; suggestedName: string }, options?: ReadOptions): TaskHandle<{ saved: boolean; bytes?: number; sha256?: string }>;
  };
  assets: {
    openSession(args: { workspaceId: WorkspaceId; allowedRoots: string[]; purpose: 'editor' | 'preview'; snapshotId?: string }): Promise<{ sessionId: string }>;
    resolve(args: { sessionId: string; path: string; expectedRevision?: Revision }): Promise<{ url: string; mime: string; size: number; revision: Revision; supportsRange: boolean }>;
    release(args: { sessionId: string }): Promise<void>;
  };
  snapshots: {
    create(args: { workspaceId: WorkspaceId; expectedWorkspaceRevision: Revision; label: string; includeRoots: string[] }, options?: ReadOptions): TaskHandle<{ snapshotId: string; revision: Revision; bytes: number }>;
    list(args: { workspaceId: WorkspaceId }): Promise<SnapshotInfo[]>;
    restore(args: { workspaceId: WorkspaceId; snapshotId: string; expectedWorkspaceRevision: Revision }, options?: ReadOptions): TaskHandle<{ revision: Revision; safetySnapshotId: string }>;
  };
  documents: { open(args: FileRef & { expectedRevision?: Revision; selection?: { from: number; to: number }; focus?: boolean }): Promise<{ documentId: string; revision: Revision }> };
  config: { patchExtension(args: { workspaceId: WorkspaceId; expectedRevision: Revision; patch: Record<string, unknown> }): Promise<{ revision: Revision }> };
  tasks: { status<T = unknown>(taskId: string): Promise<TaskStatus<T>>; cancel(taskId: string): Promise<void> };
  preview: {
    open(args: { snapshotId: string; runtime: { pluginAsset: string }; contentRoot: string; viewport?: { width: number; height: number }; initialState: Record<string, unknown>; network: 'none' }): Promise<{ previewId: string }>;
    reload(args: { previewId: string; snapshotId: string }): Promise<void>;
    close(args: { previewId: string }): Promise<void>;
    on(previewId: string, listener: (event: { type: 'ready' | 'closed' | 'error' | 'trace'; payload: Record<string, unknown> }) => void): Unsubscribe;
  };
  getCapabilities(): Promise<Capabilities>;
  /** Existing v2 facade is retained. Prefer fs.readText/applyBatch for project edits. */
  getFiles(): { id: string; name: string; path: string }[];
  readText(documentId: string): Promise<string>;
  writeText(documentId: string, text: string): Promise<boolean>;
  getDocumentInfo(documentId: string): unknown; getHistory(documentId: string): unknown[];
  getConfig(documentId: string): unknown; getChapters(documentId: string): unknown;
  compileTex(documentId: string, options?: { engine?: string; signal?: AbortSignal; onLog?: (line: string) => void }): Promise<unknown>;
  getSettings(): Record<string, unknown>; updateSettings(value: Record<string, unknown>): void;
  on(event: string, listener: (...args: unknown[]) => void): Unsubscribe;
  addExtension(extension: unknown): Unsubscribe;
  addCompletion(source: unknown, kinds?: string[]): Unsubscribe;
  dispose(cleanup: () => void): () => void;
}
export interface PluginManifest { id: string; name: string; version: string; main: string; vela?: { api?: string; requiredCapabilities?: string[] } }
