import * as vscode from 'vscode';
import { ChmDocument } from './chmDocument';

export class ChmEditorProvider implements vscode.CustomReadonlyEditorProvider<ChmDocument> {
    constructor(private readonly context: vscode.ExtensionContext) {}

    static register(context: vscode.ExtensionContext): vscode.Disposable {
        return vscode.window.registerCustomEditorProvider(
            'chmViewer.editor',
            new ChmEditorProvider(context),
            {
                supportsMultipleEditorsPerDocument: false,
                webviewOptions: {
                    retainContextWhenHidden: true,
                    enableFindWidget: true,
                },
            }
        );
    }

    async openCustomDocument(
        uri: vscode.Uri,
        _openContext: vscode.CustomDocumentOpenContext,
        _token: vscode.CancellationToken
    ): Promise<ChmDocument> {
        const document = new ChmDocument(uri);
        await document.open();
        return document;
    }

    async resolveCustomEditor(
        document: ChmDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        // Register message handler BEFORE setting HTML to avoid race condition
        // where initial messages from the webview are lost
        webviewPanel.webview.onDidReceiveMessage(async (message) => {
            try {
                switch (message.type) {
                    case 'getHtml': {
                        const html = await document.getHtml(message.path);
                        webviewPanel.webview.postMessage({
                            type: 'htmlContent',
                            path: message.path,
                            html: html,
                            requestId: message.requestId,
                        });
                        break;
                    }
                    case 'getFile': {
                        const result = await document.getFileContent(message.path);
                        if (result) {
                            const base64 = Buffer.from(result.data).toString('base64');
                            webviewPanel.webview.postMessage({
                                type: 'fileContent',
                                path: message.path,
                                data: base64,
                                mimeType: result.mimeType,
                                requestId: message.requestId,
                            });
                        } else {
                            webviewPanel.webview.postMessage({
                                type: 'fileNotFound',
                                path: message.path,
                                requestId: message.requestId,
                            });
                        }
                        break;
                    }
                }
            } catch (error) {
                console.error('chm-viewer: failed to serve webview request', message, error);
                webviewPanel.webview.postMessage({
                    type: 'loadError',
                    path: message.path,
                    message: error instanceof Error ? error.message : String(error),
                    requestId: message.requestId,
                });
            }
        });

        // Custom editor webviews have scripts disabled by default; the whole
        // viewer UI is driven by main.js, so enable it explicitly.
        webviewPanel.webview.options = { enableScripts: true };
        webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document);
    }

    private getHtmlForWebview(webview: vscode.Webview, document: ChmDocument): string {
        const nonce = getNonce();
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'main.js')
        );

        const title = document.title;
        const tocData = JSON.stringify(document.toc);
        const defaultTopic = document.defaultTopic || 'index.html';
        const csp = [
            `default-src 'none'`,
            `style-src ${webview.cspSource} 'unsafe-inline'`,
            `script-src 'nonce-${nonce}' ${webview.cspSource}`,
            `img-src data: ${webview.cspSource}`,
            `font-src data: ${webview.cspSource}`,
            `connect-src ${webview.cspSource}`,
        ].join('; ');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <title>${escapeHtml(title)}</title>
</head>
<body>
    <div id="app">
        <div id="sidebar">
            <div id="sidebar-header">
                <h3>${escapeHtml(title)}</h3>
            </div>
            <div id="sidebar-search">
                <input type="text" id="search-input" placeholder="Filter topics by name..." />
                <button id="search-clear" class="hidden" title="Clear filter">&times;</button>
                <div id="search-results" class="hidden"></div>
            </div>
            <div id="toc-tree"></div>
        </div>
        <div id="content">
            <div id="content-toolbar">
                <button id="btn-home" title="Home">&#8962;</button>
                <button id="btn-back" title="Back" disabled>&#8592;</button>
                <button id="btn-forward" title="Forward" disabled>&#8594;</button>
                <span id="current-page"></span>
            </div>
            <div id="content-frame">
                <div id="loading">Loading...</div>
                <div id="error" class="hidden"></div>
                <iframe id="content-iframe" sandbox="allow-same-origin allow-popups" style="display:none;"></iframe>
            </div>
        </div>
    </div>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
            height: 100%;
            width: 100%;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: #333;
            background-color: #fff;
        }
        #app { display: flex; height: 100%; }
        #sidebar {
            width: 280px;
            min-width: 200px;
            max-width: 500px;
            border-right: 1px solid #e0e0e0;
            display: flex;
            flex-direction: column;
            background-color: #f8f8f8;
        }
        #sidebar-header {
            padding: 10px 12px;
            border-bottom: 1px solid #e0e0e0;
        }
        #sidebar-header h3 {
            font-size: 13px;
            font-weight: 600;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        #sidebar-search {
            padding: 6px 8px;
            border-bottom: 1px solid #e0e0e0;
        }
        #sidebar-search input {
            width: 100%;
            padding: 5px 8px;
            font-size: 12px;
            border: 1px solid #ccc;
            border-radius: 3px;
            outline: none;
        }
        #sidebar-search input:focus {
            border-color: #2196F3;
        }
        #sidebar-search {
            position: relative;
        }
        #search-clear {
            position: absolute;
            right: 14px;
            top: 50%;
            transform: translateY(-50%);
            border: none;
            background: transparent;
            font-size: 14px;
            color: #999;
            cursor: pointer;
            padding: 2px 4px;
        }
        #search-clear:hover {
            color: #333;
        }
        #search-results {
            font-size: 11px;
            color: #888;
            padding: 2px 8px 4px;
        }
        #toc-tree {
            flex: 1;
            overflow-y: auto;
            padding: 4px 0;
        }
        .toc-item { user-select: none; }
        .toc-item-row {
            display: flex;
            align-items: center;
            padding: 3px 8px;
            cursor: pointer;
            white-space: nowrap;
        }
        .toc-item-row:hover { background-color: #e0e0e0; }
        .toc-item-row.selected { background-color: #d0e4f7; }
        .toc-item-label {
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 12px;
        }
        .toc-toggle {
            width: 16px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            flex-shrink: 0;
            margin-right: 2px;
            color: #666;
        }
        .toc-toggle.empty { visibility: hidden; }
        .toc-children { padding-left: 16px; }
        .toc-children.collapsed { display: none; }
        #content { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
        #content-toolbar {
            display: flex;
            align-items: center;
            padding: 4px 8px;
            border-bottom: 1px solid #e0e0e0;
            gap: 4px;
            min-height: 36px;
            background-color: #f8f8f8;
        }
        #content-toolbar button {
            padding: 4px 10px;
            font-size: 14px;
            background: #fff;
            border: 1px solid #ccc;
            color: #333;
            cursor: pointer;
            border-radius: 3px;
        }
        #content-toolbar button:hover:not(:disabled) { background-color: #e8e8e8; }
        #content-toolbar button:disabled { opacity: 0.4; cursor: default; }
        #current-page {
            font-size: 12px;
            color: #666;
            margin-left: 8px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        #content-frame {
            flex: 1;
            position: relative;
            overflow: hidden;
            background-color: #fff;
        }
        #content-iframe {
            width: 100%;
            height: 100%;
            border: none;
        }
        #loading, #error {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            padding: 20px;
            text-align: center;
        }
        #loading { font-size: 14px; color: #666; }
        #error {
            color: #d32f2f;
            background-color: #ffebee;
            border: 1px solid #ef9a9a;
            border-radius: 4px;
            padding: 12px 20px;
            max-width: 80%;
        }
        .hidden { display: none !important; }
        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #c0c0c0; border-radius: 5px; }
        ::-webkit-scrollbar-thumb:hover { background: #a0a0a0; }
    </style>
    <script nonce="${nonce}">
        window.CHM_DATA = {
            title: ${JSON.stringify(title)},
            defaultTopic: ${JSON.stringify(defaultTopic)},
            toc: ${tocData},
        };
    </script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
