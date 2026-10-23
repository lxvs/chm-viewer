import * as vscode from 'vscode';
import { ChmFile, chmReaderFromFile, parseSystemInfo, parseToc } from 'chmlib-ts';

export interface TocEntry {
    name: string;
    local: string;
    children: TocEntry[];
}

export class ChmDocument implements vscode.CustomDocument {
    readonly uri: vscode.Uri;
    private chmFile!: ChmFile;
    private reader: any;
    private queue: Promise<unknown> = Promise.resolve();
    public title: string = '';
    public toc: TocEntry[] = [];
    public fileCount: number = 0;
    public defaultTopic: string = '';

    constructor(uri: vscode.Uri) {
        this.uri = uri;
    }

    async open(): Promise<void> {
        this.reader = chmReaderFromFile(this.uri.fsPath);
        this.chmFile = await ChmFile.open(this.reader);

        // Parse system info for title
        const sysRaw = await this.chmFile.getSystemRaw();
        if (sysRaw) {
            const sys = parseSystemInfo(sysRaw);
            this.title = sys.title || 'Untitled';
            this.defaultTopic = sys.defaultTopic || '';
        }

        // Parse TOC from .hhc file
        await this.parseToc();

        // Count files
        let count = 0;
        for await (const entry of this.chmFile.enumerate()) {
            count++;
        }
        this.fileCount = count;
    }

    private async parseToc(): Promise<void> {
        // Try common .hhc file names
        const candidates = [
            '/index.hhc',
            '/contents.hhc',
            '/toc.hhc',
            '/table of contents.hhc',
        ];

        for (const candidate of candidates) {
            try {
                const ui = await this.chmFile.resolve(candidate);
                if (ui) {
                    const data = await this.chmFile.retrieve(ui);
                    const html = new TextDecoder('utf-8').decode(data);
                    const toc = parseToc(html);
                    this.toc = toc.entries.map(e => this.mapEntry(e));
                    return;
                }
            } catch {
                // try next
            }
        }
        this.toc = [];
    }

    private mapEntry(entry: any): TocEntry {
        return {
            name: entry.name || '(untitled)',
            local: entry.local || '',
            children: (entry.children || []).map((c: any) => this.mapEntry(c)),
        };
    }

    // Serialize CHM access: chmlib's LZX decompressor is not safe to use from
    // concurrent reads, and the webview requests several resources at once.
    private enqueue<T>(task: () => Promise<T>): Promise<T> {
        const run = this.queue.then(() => task());
        this.queue = run.then(
            () => undefined,
            () => undefined
        );
        return run;
    }

    async getFileContent(filePath: string): Promise<{ data: Uint8Array; mimeType: string } | null> {
        return this.enqueue(() => this.retrieveFileContent(filePath));
    }

    private async retrieveFileContent(filePath: string): Promise<{ data: Uint8Array; mimeType: string } | null> {
        const path = filePath.replace(/\\/g, '/');
        let normalized: string;
        try {
            normalized = decodeURIComponent(path);
        } catch {
            normalized = path;
        }
        if (!normalized.startsWith('/')) {
            normalized = '/' + normalized;
        }
        // Strip query/hash
        normalized = normalized.split('#')[0].split('?')[0];

        try {
            const ui = await this.chmFile.resolve(normalized);
            if (!ui) return null;
            const data = await this.chmFile.retrieve(ui);
            const ext = this.getExt(normalized);
            const mimeType = this.getMimeType(ext);
            return { data, mimeType };
        } catch {
            return null;
        }
    }

    async getHtml(filePath: string): Promise<string | null> {
        return this.enqueue(async () => {
            const result = await this.retrieveFileContent(filePath);
            if (!result) return null;
            return new TextDecoder('utf-8').decode(result.data);
        });
    }

    private getExt(path: string): string {
        const idx = path.lastIndexOf('.');
        return idx >= 0 ? path.substring(idx).toLowerCase() : '';
    }

    private getMimeType(ext: string): string {
        switch (ext) {
            case '.html': return 'text/html';
            case '.htm': return 'text/html';
            case '.css': return 'text/css';
            case '.js': return 'application/javascript';
            case '.png': return 'image/png';
            case '.jpg': return 'image/jpeg';
            case '.jpeg': return 'image/jpeg';
            case '.gif': return 'image/gif';
            case '.svg': return 'image/svg+xml';
            case '.ico': return 'image/x-icon';
            case '.bmp': return 'image/bmp';
            case '.txt': return 'text/plain';
            case '.xml': return 'application/xml';
            case '.pdf': return 'application/pdf';
            default: return 'application/octet-stream';
        }
    }

    dispose(): void {
        try {
            this.chmFile?.close();
        } catch {
            // ignore
        }
    }
}
