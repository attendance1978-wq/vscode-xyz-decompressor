"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecompressorService = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const zlib = __importStar(require("zlib"));
const util_1 = require("util");
const xyzCodec_1 = require("./xyzCodec");
const gunzip = (0, util_1.promisify)(zlib.gunzip);
const bunzip2 = (0, util_1.promisify)(zlib.brotliDecompress); // fallback for bz2 (native bz2 needs native module)
class DecompressorService {
    constructor(log) {
        this.log = log;
        this.xyzReader = null;
    }
    // ── Public API ─────────────────────────────────────────────────────────────
    async extract(archivePath, destDir, onProgress) {
        const ext = this.getEffectiveExtension(archivePath);
        this.log.info(`Extracting [${ext}] ${archivePath} → ${destDir}`);
        switch (ext) {
            case 'xyz': return this.extractXyz(archivePath, destDir, onProgress);
            case 'zip': return this.extractZip(archivePath, destDir, onProgress);
            case 'tar': return this.extractTar(archivePath, destDir, onProgress);
            case 'tgz':
            case 'tar.gz': return this.extractTarGz(archivePath, destDir, onProgress);
            case 'tar.bz2':
            case 'tbz2': return this.extractTarBz2(archivePath, destDir, onProgress);
            case 'gz': return this.extractGz(archivePath, destDir);
            default:
                throw new Error(`Unsupported archive format: .${ext}`);
        }
    }
    async listContents(archivePath) {
        const ext = this.getEffectiveExtension(archivePath);
        switch (ext) {
            case 'xyz': return this.listXyz(archivePath);
            case 'zip': return this.listZip(archivePath);
            case 'tar':
            case 'tgz':
            case 'tar.gz':
            case 'tar.bz2':
            case 'tbz2': return this.listTar(archivePath);
            case 'gz': return this.listGz(archivePath);
            default:
                throw new Error(`Cannot list contents of .${ext} archives`);
        }
    }
    async getStats(archivePath) {
        const entries = await this.listContents(archivePath);
        const ext = this.getEffectiveExtension(archivePath);
        let encrypted = false;
        let uncompressed = 0;
        let compressed = 0;
        if (ext === 'xyz') {
            const reader = new xyzCodec_1.XyzReader(archivePath, this.log);
            const info = await reader.readInfo();
            encrypted = info.encrypted;
            for (const e of info.entries) {
                uncompressed += e.uncompressedSize;
                compressed += e.compressedSize;
            }
        }
        else {
            for (const e of entries) {
                uncompressed += e.size;
                compressed += e.compressedSize;
            }
        }
        return {
            totalFiles: entries.filter(e => !e.isDirectory).length,
            totalDirs: entries.filter(e => e.isDirectory).length,
            uncompressedBytes: uncompressed,
            compressedBytes: compressed,
            compressionRatio: uncompressed > 0 ? compressed / uncompressed : 1,
            format: ext.toUpperCase(),
            encrypted,
        };
    }
    async validateXyz(archivePath) {
        const errors = [];
        try {
            const reader = new xyzCodec_1.XyzReader(archivePath, this.log);
            const info = await reader.readInfo();
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
        }
        catch (err) {
            errors.push(err instanceof Error ? err.message : String(err));
        }
        return { valid: errors.length === 0, errors };
    }
    async createXyz(srcDir, destPath, compressionLevel = 6, onProgress) {
        const writer = new xyzCodec_1.XyzWriter(this.log);
        await writer.createFromDirectory(srcDir, destPath, compressionLevel, onProgress);
    }
    // ── XYZ ───────────────────────────────────────────────────────────────────
    async extractXyz(src, dest, onProgress) {
        const reader = new xyzCodec_1.XyzReader(src, this.log);
        await reader.extractAll(dest, onProgress);
    }
    async listXyz(src) {
        const reader = new xyzCodec_1.XyzReader(src, this.log);
        const info = await reader.readInfo();
        return info.entries.map(e => ({
            name: e.name,
            size: e.uncompressedSize,
            compressedSize: e.compressedSize,
            isDirectory: e.type === xyzCodec_1.XyzEntryType.DIR,
            modifiedAt: new Date(Number(e.modifiedMs)),
            compressionMethod: e.compression === xyzCodec_1.XyzCompression.DEFLATE ? 'DEFLATE' : 'STORE',
            crc: e.crc32,
        }));
    }
    // ── ZIP ───────────────────────────────────────────────────────────────────
    async extractZip(src, dest, onProgress) {
        // Dynamic require so the extension doesn't crash if adm-zip isn't installed yet
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(src);
        const entries = zip.getEntries();
        fs.mkdirSync(dest, { recursive: true });
        for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            zip.extractEntryTo(e, dest, true, true);
            if (onProgress)
                onProgress(Math.round(((i + 1) / entries.length) * 100), e.entryName);
        }
    }
    async listZip(src) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(src);
        return zip.getEntries().map((e) => ({
            name: e.entryName,
            size: e.header.size,
            compressedSize: e.header.compressedSize,
            isDirectory: e.isDirectory,
            modifiedAt: e.header.time,
            compressionMethod: e.header.method === 0 ? 'STORE' : 'DEFLATE',
            crc: e.header.crc,
        }));
    }
    // ── TAR ───────────────────────────────────────────────────────────────────
    async extractTar(src, dest, onProgress) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const tar = require('tar');
        fs.mkdirSync(dest, { recursive: true });
        await tar.x({ file: src, cwd: dest, strict: true });
        if (onProgress)
            onProgress(100, 'Complete');
    }
    async extractTarGz(src, dest, onProgress) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const tar = require('tar');
        fs.mkdirSync(dest, { recursive: true });
        await tar.x({ file: src, cwd: dest, gzip: true, strict: true });
        if (onProgress)
            onProgress(100, 'Complete');
    }
    async extractTarBz2(src, dest, onProgress) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const tar = require('tar');
        fs.mkdirSync(dest, { recursive: true });
        await tar.x({ file: src, cwd: dest, bzip2: true, strict: true });
        if (onProgress)
            onProgress(100, 'Complete');
    }
    async listTar(src) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const tar = require('tar');
        const entries = [];
        await tar.t({
            file: src,
            onentry: (e) => {
                entries.push({
                    name: e.path,
                    size: e.size,
                    compressedSize: e.size,
                    isDirectory: e.type === 'Directory',
                    modifiedAt: e.mtime,
                    compressionMethod: 'DEFLATE',
                });
            }
        });
        return entries;
    }
    // ── GZ (single file) ─────────────────────────────────────────────────────
    async extractGz(src, dest) {
        const compressed = fs.readFileSync(src);
        const data = await gunzip(compressed);
        fs.mkdirSync(dest, { recursive: true });
        const outName = path.basename(src, '.gz');
        fs.writeFileSync(path.join(dest, outName), data);
    }
    async listGz(src) {
        const stat = fs.statSync(src);
        return [{
                name: path.basename(src, '.gz'),
                size: 0,
                compressedSize: stat.size,
                isDirectory: false,
                modifiedAt: stat.mtime,
                compressionMethod: 'GZIP',
            }];
    }
    // ── Helpers ───────────────────────────────────────────────────────────────
    getEffectiveExtension(filePath) {
        const base = path.basename(filePath).toLowerCase();
        if (base.endsWith('.tar.gz'))
            return 'tar.gz';
        if (base.endsWith('.tar.bz2'))
            return 'tar.bz2';
        if (base.endsWith('.tar.xz'))
            return 'tar.xz';
        return path.extname(filePath).slice(1).toLowerCase();
    }
}
exports.DecompressorService = DecompressorService;
//# sourceMappingURL=decompressorService.js.map