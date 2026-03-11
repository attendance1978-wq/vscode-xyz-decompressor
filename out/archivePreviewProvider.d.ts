import * as vscode from 'vscode';
import { ArchiveEntry, ArchiveStats } from './decompressorService';
export declare class ArchivePreviewProvider implements vscode.WebviewViewProvider {
    private readonly extensionUri;
    static readonly viewType = "xyzDecompressor.previewView";
    constructor(extensionUri: vscode.Uri);
    resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void;
    getPreviewHtml(archiveName: string, entries: ArchiveEntry[], archivePath: string, stats?: ArchiveStats): string;
    private getLoadingHtml;
    private fileIcon;
    private fmtBytes;
    private shortName;
    private esc;
}
