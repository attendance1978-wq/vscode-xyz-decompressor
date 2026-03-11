import * as vscode from 'vscode';
import * as path from 'path';
import { ArchiveEntry, ArchiveStats } from './decompressorService';

export class ArchivePreviewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'xyzDecompressor.previewView';

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getLoadingHtml();
  }

  getPreviewHtml(
    archiveName: string,
    entries: ArchiveEntry[],
    archivePath: string,
    stats?: ArchiveStats
  ): string {
    const totalFiles = entries.filter(e => !e.isDirectory).length;
    const totalDirs  = entries.filter(e =>  e.isDirectory).length;
    const totalSize  = entries.reduce((sum, e) => sum + e.size, 0);
    const compSize   = entries.reduce((sum, e) => sum + e.compressedSize, 0);
    const ratio      = totalSize > 0 ? ((1 - compSize / totalSize) * 100).toFixed(1) : '0';
    const ext        = path.extname(archiveName).slice(1).toUpperCase();

    const rowsHtml = entries.map(e => {
      const icon = e.isDirectory ? '📁' : this.fileIcon(e.name);
      const size = e.isDirectory ? '—' : this.fmtBytes(e.size);
      const comp = e.isDirectory ? '—' : this.fmtBytes(e.compressedSize);
      const date = e.modifiedAt ? new Date(e.modifiedAt).toLocaleDateString() : '—';
      return `
        <tr class="${e.isDirectory ? 'dir-row' : 'file-row'}">
          <td class="name-cell">${icon} <span title="${this.esc(e.name)}">${this.esc(this.shortName(e.name))}</span></td>
          <td class="size-cell">${size}</td>
          <td class="comp-cell">${comp}</td>
          <td class="method-cell">${e.compressionMethod}</td>
          <td class="date-cell">${date}</td>
        </tr>`;
    }).join('');

    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Archive Preview</title>
<style>
  :root {
    --bg:        var(--vscode-editor-background, #1e1e1e);
    --fg:        var(--vscode-editor-foreground, #d4d4d4);
    --accent:    var(--vscode-button-background, #0e639c);
    --accent-fg: var(--vscode-button-foreground, #fff);
    --border:    var(--vscode-panel-border, #454545);
    --row-alt:   var(--vscode-list-hoverBackground, #2a2d2e);
    --badge-bg:  var(--vscode-badge-background, #4d4d4d);
    --badge-fg:  var(--vscode-badge-foreground, #fff);
    --font:      var(--vscode-font-family, 'Segoe UI', sans-serif);
    --mono:      var(--vscode-editor-font-family, 'Cascadia Code', monospace);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg); color: var(--fg);
    font-family: var(--font); font-size: 13px;
    padding: 0; overflow-x: hidden;
  }

  /* ── Header ── */
  .header {
    background: linear-gradient(135deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 60%, #000) 100%);
    padding: 16px 20px;
  }
  .header-top { display: flex; align-items: center; gap: 10px; }
  .archive-icon { font-size: 28px; }
  .archive-name {
    font-size: 15px; font-weight: 600; color: var(--accent-fg);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 280px;
  }
  .format-badge {
    background: rgba(255,255,255,0.2); color: var(--accent-fg);
    font-family: var(--mono); font-size: 11px;
    padding: 2px 7px; border-radius: 10px; margin-left: auto;
  }

  /* ── Stats bar ── */
  .stats {
    display: flex; gap: 0; border-top: 1px solid rgba(255,255,255,0.1); margin-top: 12px;
  }
  .stat {
    flex: 1; text-align: center; padding: 8px 4px;
    border-right: 1px solid rgba(255,255,255,0.1);
    color: rgba(255,255,255,0.85);
  }
  .stat:last-child { border-right: none; }
  .stat-val { font-size: 16px; font-weight: 700; display: block; color: #fff; }
  .stat-lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7; }

  /* ── Toolbar ── */
  .toolbar {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 16px; border-bottom: 1px solid var(--border);
    background: var(--row-alt);
  }
  .btn {
    background: var(--accent); color: var(--accent-fg);
    border: none; border-radius: 4px; padding: 5px 14px;
    cursor: pointer; font-size: 12px; font-family: var(--font);
    transition: opacity 0.15s;
  }
  .btn:hover { opacity: 0.85; }
  .btn.secondary {
    background: transparent; color: var(--fg);
    border: 1px solid var(--border);
  }
  .search-box {
    margin-left: auto; background: var(--bg); color: var(--fg);
    border: 1px solid var(--border); border-radius: 4px;
    padding: 4px 10px; font-size: 12px; width: 180px;
    font-family: var(--font);
  }
  .search-box:focus { outline: 1px solid var(--accent); }

  /* ── Table ── */
  .table-wrap { overflow: auto; max-height: calc(100vh - 220px); }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  thead { position: sticky; top: 0; background: var(--bg); z-index: 1; }
  th {
    text-align: left; padding: 7px 10px;
    border-bottom: 2px solid var(--border);
    font-weight: 600; color: var(--fg); opacity: 0.7;
    cursor: pointer; user-select: none; white-space: nowrap;
  }
  th:hover { opacity: 1; }
  th .sort-arrow { margin-left: 4px; font-size: 9px; }
  td { padding: 5px 10px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  tr:hover td { background: var(--row-alt); }
  .dir-row td { opacity: 0.8; font-style: italic; }
  .name-cell { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .name-cell span { font-family: var(--mono); }
  .size-cell, .comp-cell, .date-cell { white-space: nowrap; text-align: right; }
  .method-cell { white-space: nowrap; }
  .method-cell { font-family: var(--mono); font-size: 11px; opacity: 0.7; }
  .no-results { text-align: center; padding: 40px; opacity: 0.5; }
</style>
</head>
<body>

<div class="header">
  <div class="header-top">
    <span class="archive-icon">📦</span>
    <span class="archive-name" title="${this.esc(archiveName)}">${this.esc(archiveName)}</span>
    <span class="format-badge">.${ext}</span>
  </div>
  <div class="stats">
    <div class="stat">
      <span class="stat-val">${totalFiles}</span>
      <span class="stat-lbl">Files</span>
    </div>
    <div class="stat">
      <span class="stat-val">${totalDirs}</span>
      <span class="stat-lbl">Dirs</span>
    </div>
    <div class="stat">
      <span class="stat-val">${this.fmtBytes(totalSize)}</span>
      <span class="stat-lbl">Uncompressed</span>
    </div>
    <div class="stat">
      <span class="stat-val">${ratio}%</span>
      <span class="stat-lbl">Saved</span>
    </div>
  </div>
</div>

<div class="toolbar">
  <button class="btn" onclick="extractAll()">⬇ Extract All</button>
  <button class="btn secondary" onclick="extractTo()">📂 Extract To…</button>
  <input class="search-box" id="searchBox" placeholder="🔍 Filter files…" oninput="filterTable(this.value)"/>
</div>

<div class="table-wrap">
  <table id="archiveTable">
    <thead>
      <tr>
        <th onclick="sortTable(0)">Name <span class="sort-arrow">▲</span></th>
        <th onclick="sortTable(1)">Size</th>
        <th onclick="sortTable(2)">Compressed</th>
        <th onclick="sortTable(3)">Method</th>
        <th onclick="sortTable(4)">Modified</th>
      </tr>
    </thead>
    <tbody id="tableBody">${rowsHtml}</tbody>
  </table>
  <div id="noResults" class="no-results" style="display:none">No files match your filter.</div>
</div>

<script>
  const vscode = acquireVsCodeApi();

  function extractAll() { vscode.postMessage({ command: 'extractAll' }); }
  function extractTo()  { vscode.postMessage({ command: 'extractTo'  }); }

  function filterTable(q) {
    const rows = document.querySelectorAll('#tableBody tr');
    let shown = 0;
    rows.forEach(row => {
      const name = row.querySelector('.name-cell span')?.title || '';
      const match = name.toLowerCase().includes(q.toLowerCase());
      row.style.display = match ? '' : 'none';
      if (match) shown++;
    });
    document.getElementById('noResults').style.display = shown === 0 ? '' : 'none';
  }

  let sortDir = [1,1,1,1,1];
  function sortTable(col) {
    const tbody = document.getElementById('tableBody');
    const rows  = Array.from(tbody.querySelectorAll('tr'));
    sortDir[col] *= -1;
    rows.sort((a, b) => {
      const aT = a.querySelectorAll('td')[col]?.textContent?.trim() || '';
      const bT = b.querySelectorAll('td')[col]?.textContent?.trim() || '';
      return aT.localeCompare(bT, undefined, { numeric: true }) * sortDir[col];
    });
    rows.forEach(r => tbody.appendChild(r));
  }
</script>
</body>
</html>`;
  }

  private getLoadingHtml(): string {
    return `<!DOCTYPE html><html><body style="background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);font-family:var(--vscode-font-family);padding:20px;">
      <p>Open an archive file to preview its contents.</p>
    </body></html>`;
  }

  private fileIcon(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    const map: Record<string, string> = {
      ts:'📘', js:'📙', json:'📋', md:'📝', txt:'📄', html:'🌐', css:'🎨',
      py:'🐍', rs:'🦀', go:'🐹', java:'☕', cpp:'⚙️', c:'⚙️', h:'📎',
      png:'🖼️', jpg:'🖼️', jpeg:'🖼️', gif:'🖼️', svg:'🎭', ico:'🔷',
      mp4:'🎬', mp3:'🎵', wav:'🎵', pdf:'📕', zip:'📦', tar:'📦',
      sh:'🐚', bat:'🪟', exe:'⚡', dll:'🔗',
    };
    return map[ext] ?? '📄';
  }

  private fmtBytes(n: number): string {
    if (n === 0) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(n) / Math.log(1024));
    return `${(n / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
  }

  private shortName(name: string): string {
    const parts = name.replace(/\\/g, '/').split('/');
    const file  = parts[parts.length - 1];
    const depth = parts.length - 1;
    return depth > 0 ? `${'  '.repeat(Math.min(depth, 4))}${file}` : file;
  }

  private esc(s: string): string {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
}
