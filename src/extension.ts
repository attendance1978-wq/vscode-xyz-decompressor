import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from './logger';
import { DecompressorService } from './decompressorService';
import { ArchivePreviewProvider } from './archivePreviewProvider';

let logger: Logger;
let service: DecompressorService;

export function activate(context: vscode.ExtensionContext): void {
  logger  = new Logger('XYZ Decompressor');
  service = new DecompressorService(logger);

  logger.info('XYZ Decompressor activated');

  const previewProvider = new ArchivePreviewProvider(context.extensionUri);

  // ── Register commands ──────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('xyzDecompressor.extractHere', async (uri?: vscode.Uri) => {
      const file = await resolveArchive(uri);
      if (!file) return;
      const dest = buildDest(file);
      await runExtract(file, dest);
    }),

    vscode.commands.registerCommand('xyzDecompressor.extractTo', async (uri?: vscode.Uri) => {
      const file = await resolveArchive(uri);
      if (!file) return;
      const folder = await pickFolder('Select Extraction Destination');
      if (!folder) return;
      const cfg   = vscode.workspace.getConfiguration('xyzDecompressor');
      const dest  = cfg.get<boolean>('createSubfolder', true)
        ? path.join(folder, baseName(file))
        : folder;
      await runExtract(file, dest);
    }),

    vscode.commands.registerCommand('xyzDecompressor.extractToWorkspace', async (uri?: vscode.Uri) => {
      const file = await resolveArchive(uri);
      if (!file) return;
      const ws = vscode.workspace.workspaceFolders?.[0];
      if (!ws) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return;
      }
      const cfg  = vscode.workspace.getConfiguration('xyzDecompressor');
      const dest = cfg.get<boolean>('createSubfolder', true)
        ? path.join(ws.uri.fsPath, baseName(file))
        : ws.uri.fsPath;
      await runExtract(file, dest);
    }),

    vscode.commands.registerCommand('xyzDecompressor.previewContents', async (uri?: vscode.Uri) => {
      const file = await resolveArchive(uri);
      if (!file) return;
      try {
        const entries = await service.listContents(file);
        const panel   = vscode.window.createWebviewPanel(
          'xyzPreview',
          `📦 ${path.basename(file)}`,
          vscode.ViewColumn.One,
          { enableScripts: true, retainContextWhenHidden: true }
        );
        panel.webview.html = previewProvider.getPreviewHtml(path.basename(file), entries, file);
        panel.webview.onDidReceiveMessage(async (msg) => {
          const cmdUri = vscode.Uri.file(file);
          if (msg.command === 'extractAll') {
            await vscode.commands.executeCommand('xyzDecompressor.extractHere', cmdUri);
          } else if (msg.command === 'extractTo') {
            await vscode.commands.executeCommand('xyzDecompressor.extractTo', cmdUri);
          }
        });
      } catch (err) {
        showError('Preview failed', err);
      }
    }),

    vscode.commands.registerCommand('xyzDecompressor.validateXyz', async (uri?: vscode.Uri) => {
      const file = uri?.fsPath || (await resolveArchive(undefined, '*.xyz'));
      if (!file) return;
      try {
        const result = await service.validateXyz(file);
        if (result.valid) {
          vscode.window.showInformationMessage(`✅ ${path.basename(file)}: archive is valid.`);
        } else {
          vscode.window.showWarningMessage(
            `⚠️ ${path.basename(file)}: ${result.errors.length} issue(s) found`,
            'Show Details'
          ).then(btn => {
            if (btn === 'Show Details') {
              const ch = vscode.window.createOutputChannel('XYZ Validation');
              result.errors.forEach(e => ch.appendLine('• ' + e));
              ch.show();
            }
          });
        }
      } catch (err) {
        showError('Validation failed', err);
      }
    }),

    vscode.commands.registerCommand('xyzDecompressor.showStats', async (uri?: vscode.Uri) => {
      const file = uri?.fsPath || (await resolveArchive(undefined));
      if (!file) return;
      try {
        const stats = await service.getStats(file);
        const msg = [
          `Format: ${stats.format}`,
          `Files: ${stats.totalFiles}  Dirs: ${stats.totalDirs}`,
          `Uncompressed: ${fmtBytes(stats.uncompressedBytes)}`,
          `Compressed:   ${fmtBytes(stats.compressedBytes)}`,
          `Savings:      ${((1 - stats.compressionRatio) * 100).toFixed(1)}%`,
          stats.encrypted ? '🔒 Encrypted' : '',
        ].filter(Boolean).join('\n');
        vscode.window.showInformationMessage(`📊 ${path.basename(file)}`, { modal: true, detail: msg }, 'Close');
      } catch (err) {
        showError('Stats failed', err);
      }
    }),

    vscode.commands.registerCommand('xyzDecompressor.createXyz', async (uri?: vscode.Uri) => {
      const folder = uri?.fsPath || (await pickFolder('Select folder to compress'));
      if (!folder) return;

      const defaultName = path.basename(folder) + '.xyz';
      const name = await vscode.window.showInputBox({
        prompt: 'Output filename',
        value: defaultName,
        validateInput: v => v.endsWith('.xyz') ? undefined : 'Filename must end with .xyz'
      });
      if (!name) return;

      const dest = path.join(path.dirname(folder), name);
      const cfg  = vscode.workspace.getConfiguration('xyzDecompressor');
      const lvl  = cfg.get<number>('xyzCompressionLevel', 6);

      try {
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: `Creating ${name}`, cancellable: false },
          async (progress) => {
            await service.createXyz(folder, dest, lvl, (pct, file) => {
              progress.report({ increment: pct, message: file });
            });
          }
        );
        vscode.window.showInformationMessage(`✅ Created: ${name}`);
        logger.info(`Created XYZ: ${dest}`);
      } catch (err) {
        showError('Create XYZ failed', err);
      }
    })
  );

  logger.info('All commands registered');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function runExtract(file: string, dest: string): Promise<void> {
  const cfg       = vscode.workspace.getConfiguration('xyzDecompressor');
  const overwrite = cfg.get<string>('overwriteExisting', 'ask');
  const openAfter = cfg.get<boolean>('openAfterExtract', true);

  if (fs.existsSync(dest) && overwrite === 'ask') {
    const choice = await vscode.window.showWarningMessage(
      `Destination already exists: ${path.basename(dest)}`,
      'Overwrite', 'Merge', 'Cancel'
    );
    if (!choice || choice === 'Cancel') return;
    if (choice === 'Overwrite') fs.rmSync(dest, { recursive: true, force: true });
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Extracting ${path.basename(file)}`,
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: 'Starting…' });
        await service.extract(file, dest, (pct, name) => {
          progress.report({ increment: pct, message: name });
        });
      }
    );

    const action = openAfter ? await vscode.window.showInformationMessage(
      `✅ Extracted to: ${path.basename(dest)}`, 'Reveal in Explorer'
    ) : undefined;

    if (action === 'Reveal in Explorer') {
      await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(dest));
    }
    logger.info(`Extracted: ${file} → ${dest}`);
  } catch (err) {
    showError('Extraction failed', err);
  }
}

async function resolveArchive(uri?: vscode.Uri, filter?: string): Promise<string | undefined> {
  if (uri?.fsPath) return uri.fsPath;
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    openLabel: 'Select Archive',
    filters: {
      'Archives': ['xyz', 'zip', 'tar', 'gz', 'tgz', 'bz2', '7z', 'xz'],
    }
  });
  return selected?.[0]?.fsPath;
}

async function pickFolder(label: string): Promise<string | undefined> {
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: label,
  });
  return selected?.[0]?.fsPath;
}

function buildDest(file: string): string {
  const cfg = vscode.workspace.getConfiguration('xyzDecompressor');
  const sub = cfg.get<boolean>('createSubfolder', true);
  return sub ? path.join(path.dirname(file), baseName(file)) : path.dirname(file);
}

function baseName(file: string): string {
  const b = path.basename(file);
  return b.replace(/\.(tar\.(gz|bz2|xz)|xyz|zip|tar|gz|bz2|7z|xz|tgz|tbz2)$/i, '') || 'extracted';
}

function fmtBytes(n: number): string {
  if (n === 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return `${(n / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
}

function showError(prefix: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  vscode.window.showErrorMessage(`❌ ${prefix}: ${msg}`);
  logger.error(`${prefix}: ${msg}`);
}

export function deactivate(): void {
  logger?.info('XYZ Decompressor deactivated');
}
