import * as path from 'path';
import * as fs from 'fs';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { Logger } from './logger';
import { XyzReader, XyzWriter, XyzEntryType, XyzCompression } from './xyzCodec';

const gunzip = promisify(zlib.gunzip);
const bunzip2 = promisify(zlib.brotliDecompress); // fallback for bz2 (native bz2 needs native module)

export interface ArchiveEntry {
  name: string;
  size: number;
  compressedSize: number;
  isDirectory: boolean;
  modifiedAt: Date;
  compressionMethod: string;
  crc?: number;
}

export interface ArchiveStats {
  totalFiles: number;
  totalDirs: number;
  uncompressedBytes: number;
  compressedBytes: number;
  compressionRatio: number;
  format: string;
  encrypted: boolean;
}

type ProgressCallback = (pct: number, file: string) => void;

export class DecompressorService {
  private xyzReader: XyzReader | null = null;

  constructor(private log: Logger) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  async extract(
    archivePath: string,
    destDir: string,
    onProgress?: ProgressCallback
  ): Promise<void> {
    const ext = this.getEffectiveExtension(archivePath);
    this.log.info(`Extracting [${ext}] ${archivePath} → ${destDir}`);

    switch (ext) {
      case 'xyz':  return this.extractXyz(archivePath, destDir, onProgress);
      case 'zip':  return this.extractZip(archivePath, destDir, onProgress);
      case 'tar':  return this.extractTar(archivePath, destDir, onProgress);
      case 'tgz':
      case 'tar.gz': return this.extractTarGz(archivePath, destDir, onProgress);
      case 'tar.bz2':
      case 'tbz2': return this.extractTarBz2(archivePath, destDir, onProgress);
      case 'gz':   return this.extractGz(archivePath, destDir);
      default:
        throw new Error(`Unsupported archive format: .${ext}`);
    }
  }

  async listContents(archivePath: string): Promise<ArchiveEntry[]> {
    const ext = this.getEffectiveExtension(archivePath);

    switch (ext) {
      case 'xyz':  return this.listXyz(archivePath);
      case 'zip':  return this.listZip(archivePath);
      case 'tar':
      case 'tgz':
      case 'tar.gz':
      case 'tar.bz2':
      case 'tbz2': return this.listTar(archivePath);
      case 'gz':   return this.listGz(archivePath);
      default:
        throw new Error(`Cannot list contents of .${ext} archives`);
    }
  }

  async getStats(archivePath: string): Promise<ArchiveStats> {
    const entries = await this.listContents(archivePath);
    const ext     = this.getEffectiveExtension(archivePath);

    let encrypted  = false;
    let uncompressed = 0;
    let compressed   = 0;

    if (ext === 'xyz') {
      const reader = new XyzReader(archivePath, this.log);
      const info   = await reader.readInfo();
      encrypted    = info.encrypted;
      for (const e of info.entries) {
        uncompressed += e.uncompressedSize;
        compressed   += e.compressedSize;
      }
    } else {
      for (const e of entries) {
        uncompressed += e.size;
        compressed   += e.compressedSize;
      }
    }

    return {
      totalFiles: entries.filter(e => !e.isDirectory).length,
      totalDirs:  entries.filter(e =>  e.isDirectory).length,
      uncompressedBytes: uncompressed,
      compressedBytes:   compressed,
      compressionRatio:  uncompressed > 0 ? compressed / uncompressed : 1,
      format: ext.toUpperCase(),
      encrypted,
    };
  }

  async validateXyz(archivePath: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      const reader = new XyzReader(archivePath, this.log);
      const info   = await reader.readInfo();

      if (!info.version.startsWith('1.')) {
        errors.push(`Unknown version: ${info.version}`);
      }
      if (info.entryCount !== info.entries.length) {
        errors.push(`Entry count mismatch: header says ${info.entryCount}, found ${info.entries.length}`);
      }

      const buf = fs.readFileSync(archivePath);
      for (const e of info.entries) {
        if (e.dataOffset + e.compressedSize > buf.length) {
          errors.push(`Entry "${e.name}" data extends beyond file boundary`);
        }
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    return { valid: errors.length === 0, errors };
  }

  async createXyz(
    srcDir: string,
    destPath: string,
    compressionLevel = 6,
    onProgress?: ProgressCallback
  ): Promise<void> {
    const writer = new XyzWriter(this.log);
    await writer.createFromDirectory(srcDir, destPath, compressionLevel, onProgress);
  }

  // ── XYZ ───────────────────────────────────────────────────────────────────

  private async extractXyz(src: string, dest: string, onProgress?: ProgressCallback): Promise<void> {
    const reader = new XyzReader(src, this.log);
    await reader.extractAll(dest, onProgress);
  }

  private async listXyz(src: string): Promise<ArchiveEntry[]> {
    const reader = new XyzReader(src, this.log);
    const info   = await reader.readInfo();
    return info.entries.map(e => ({
      name:             e.name,
      size:             e.uncompressedSize,
      compressedSize:   e.compressedSize,
      isDirectory:      e.type === XyzEntryType.DIR,
      modifiedAt:       new Date(Number(e.modifiedMs)),
      compressionMethod: e.compression === XyzCompression.DEFLATE ? 'DEFLATE' : 'STORE',
      crc:              e.crc32,
    }));
  }

  // ── ZIP ───────────────────────────────────────────────────────────────────

  private async extractZip(src: string, dest: string, onProgress?: ProgressCallback): Promise<void> {
    // Dynamic require so the extension doesn't crash if adm-zip isn't installed yet
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AdmZip = require('adm-zip');
    const zip    = new AdmZip(src);
    const entries = zip.getEntries();

    fs.mkdirSync(dest, { recursive: true });
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      zip.extractEntryTo(e, dest, true, true);
      if (onProgress) onProgress(Math.round(((i + 1) / entries.length) * 100), e.entryName);
    }
  }

  private async listZip(src: string): Promise<ArchiveEntry[]> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AdmZip = require('adm-zip');
    const zip    = new AdmZip(src);
    return zip.getEntries().map((e: any) => ({
      name:             e.entryName,
      size:             e.header.size,
      compressedSize:   e.header.compressedSize,
      isDirectory:      e.isDirectory,
      modifiedAt:       e.header.time,
      compressionMethod: e.header.method === 0 ? 'STORE' : 'DEFLATE',
      crc:              e.header.crc,
    }));
  }

  // ── TAR ───────────────────────────────────────────────────────────────────

  private async extractTar(src: string, dest: string, onProgress?: ProgressCallback): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const tar = require('tar');
    fs.mkdirSync(dest, { recursive: true });
    await tar.x({ file: src, cwd: dest, strict: true });
    if (onProgress) onProgress(100, 'Complete');
  }

  private async extractTarGz(src: string, dest: string, onProgress?: ProgressCallback): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const tar = require('tar');
    fs.mkdirSync(dest, { recursive: true });
    await tar.x({ file: src, cwd: dest, gzip: true, strict: true });
    if (onProgress) onProgress(100, 'Complete');
  }

  private async extractTarBz2(src: string, dest: string, onProgress?: ProgressCallback): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const tar = require('tar');
    fs.mkdirSync(dest, { recursive: true });
    await tar.x({ file: src, cwd: dest, bzip2: true, strict: true });
    if (onProgress) onProgress(100, 'Complete');
  }

  private async listTar(src: string): Promise<ArchiveEntry[]> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const tar = require('tar');
    const entries: ArchiveEntry[] = [];
    await tar.t({
      file: src,
      onentry: (e: any) => {
        entries.push({
          name:             e.path,
          size:             e.size,
          compressedSize:   e.size,
          isDirectory:      e.type === 'Directory',
          modifiedAt:       e.mtime,
          compressionMethod: 'DEFLATE',
        });
      }
    });
    return entries;
  }

  // ── GZ (single file) ─────────────────────────────────────────────────────

  private async extractGz(src: string, dest: string): Promise<void> {
    const compressed = fs.readFileSync(src);
    const data       = await gunzip(compressed);
    fs.mkdirSync(dest, { recursive: true });
    const outName = path.basename(src, '.gz');
    fs.writeFileSync(path.join(dest, outName), data);
  }

  private async listGz(src: string): Promise<ArchiveEntry[]> {
    const stat = fs.statSync(src);
    return [{
      name:             path.basename(src, '.gz'),
      size:             0,
      compressedSize:   stat.size,
      isDirectory:      false,
      modifiedAt:       stat.mtime,
      compressionMethod: 'GZIP',
    }];
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private getEffectiveExtension(filePath: string): string {
    const base = path.basename(filePath).toLowerCase();
    if (base.endsWith('.tar.gz'))  return 'tar.gz';
    if (base.endsWith('.tar.bz2')) return 'tar.bz2';
    if (base.endsWith('.tar.xz'))  return 'tar.xz';
    return path.extname(filePath).slice(1).toLowerCase();
  }
}
