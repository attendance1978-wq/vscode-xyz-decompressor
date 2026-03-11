"use strict";
/**
 * XYZ Archive Format Specification
 * ──────────────────────────────────
 * Binary layout:
 *   [0..3]   Magic: 0x58 0x59 0x5A 0x21  ("XYZ!")
 *   [4..5]   Version: major(u8) minor(u8)
 *   [6..7]   Flags:   bit0=encrypted, bit1=checksummed, bit2=split
 *   [8..11]  Entry count (u32 LE)
 *   [12..15] Header CRC32 (u32 LE)
 *   [16..]   Entry table (variable)
 *            Each entry:
 *              u16  name length
 *              u8[] name (UTF-8)
 *              u8   entry flags (0=file,1=dir,2=symlink)
 *              u32  uncompressed size
 *              u32  compressed size
 *              u32  data offset from start of file
 *              u32  crc32 of compressed data
 *              u64  modified time (unix ms, LE)
 *              u8   compression method (0=store,1=deflate,2=bzip2)
 *   [..]     Data blocks (raw compressed bytes per entry)
 */
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
exports.XyzWriter = exports.XyzReader = exports.XyzCompression = exports.XyzEntryType = exports.XYZ_VERSION_MINOR = exports.XYZ_VERSION_MAJOR = exports.XYZ_MAGIC = void 0;
exports.crc32 = crc32;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const zlib = __importStar(require("zlib"));
const util_1 = require("util");
const deflateRaw = (0, util_1.promisify)(zlib.deflateRaw);
const inflateRaw = (0, util_1.promisify)(zlib.inflateRaw);
exports.XYZ_MAGIC = Buffer.from([0x58, 0x59, 0x5A, 0x21]);
exports.XYZ_VERSION_MAJOR = 1;
exports.XYZ_VERSION_MINOR = 0;
var XyzEntryType;
(function (XyzEntryType) {
    XyzEntryType[XyzEntryType["FILE"] = 0] = "FILE";
    XyzEntryType[XyzEntryType["DIR"] = 1] = "DIR";
    XyzEntryType[XyzEntryType["SYMLINK"] = 2] = "SYMLINK";
})(XyzEntryType || (exports.XyzEntryType = XyzEntryType = {}));
var XyzCompression;
(function (XyzCompression) {
    XyzCompression[XyzCompression["STORE"] = 0] = "STORE";
    XyzCompression[XyzCompression["DEFLATE"] = 1] = "DEFLATE";
})(XyzCompression || (exports.XyzCompression = XyzCompression = {}));
// ── CRC-32 ──────────────────────────────────────────────────────────────────
const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++)
            c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        t[i] = c;
    }
    return t;
})();
function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++)
        crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}
// ── Reader ───────────────────────────────────────────────────────────────────
class XyzReader {
    constructor(filePath, log) {
        this.filePath = filePath;
        this.log = log;
    }
    async readInfo() {
        const buf = fs.readFileSync(this.filePath);
        this.validateMagic(buf);
        const vMajor = buf.readUInt8(4);
        const vMinor = buf.readUInt8(5);
        const flags = buf.readUInt16LE(6);
        const entryCount = buf.readUInt32LE(8);
        const encrypted = !!(flags & 0x01);
        const checksummed = !!(flags & 0x02);
        this.log.debug(`XYZ v${vMajor}.${vMinor}  entries=${entryCount}  flags=0x${flags.toString(16)}`);
        const entries = [];
        let cursor = 16;
        for (let i = 0; i < entryCount; i++) {
            const nameLen = buf.readUInt16LE(cursor);
            cursor += 2;
            const name = buf.slice(cursor, cursor + nameLen).toString('utf8');
            cursor += nameLen;
            const type = buf.readUInt8(cursor);
            cursor += 1;
            const uncompressedSize = buf.readUInt32LE(cursor);
            cursor += 4;
            const compressedSize = buf.readUInt32LE(cursor);
            cursor += 4;
            const dataOffset = buf.readUInt32LE(cursor);
            cursor += 4;
            const crc32val = buf.readUInt32LE(cursor);
            cursor += 4;
            const modifiedMs = buf.readBigUInt64LE(cursor);
            cursor += 8;
            const compression = buf.readUInt8(cursor);
            cursor += 1;
            entries.push({ name, type, uncompressedSize, compressedSize, dataOffset, crc32: crc32val, modifiedMs, compression });
        }
        return {
            version: `${vMajor}.${vMinor}`,
            encrypted,
            checksummed,
            entryCount,
            entries,
            fileSizeBytes: buf.length,
        };
    }
    async extractAll(destDir, onProgress) {
        const buf = fs.readFileSync(this.filePath);
        this.validateMagic(buf);
        const info = await this.readInfo();
        fs.mkdirSync(destDir, { recursive: true });
        for (let i = 0; i < info.entries.length; i++) {
            const entry = info.entries[i];
            const outPath = path.join(destDir, entry.name.replace(/\\/g, '/'));
            if (entry.type === XyzEntryType.DIR) {
                fs.mkdirSync(outPath, { recursive: true });
            }
            else {
                fs.mkdirSync(path.dirname(outPath), { recursive: true });
                const compressed = buf.slice(entry.dataOffset, entry.dataOffset + entry.compressedSize);
                let data;
                if (entry.compression === XyzCompression.DEFLATE) {
                    data = await inflateRaw(compressed);
                }
                else {
                    data = compressed;
                }
                if (crc32(data) !== entry.crc32) {
                    throw new Error(`CRC32 mismatch for entry: ${entry.name}`);
                }
                fs.writeFileSync(outPath, data);
                const mtime = new Date(Number(entry.modifiedMs));
                fs.utimesSync(outPath, mtime, mtime);
            }
            if (onProgress) {
                const pct = Math.round(((i + 1) / info.entries.length) * 100);
                onProgress(pct, entry.name);
            }
            this.log.debug(`Extracted: ${entry.name}`);
        }
    }
    validateMagic(buf) {
        if (!buf.slice(0, 4).equals(exports.XYZ_MAGIC)) {
            throw new Error('Not a valid XYZ archive (bad magic bytes)');
        }
    }
}
exports.XyzReader = XyzReader;
// ── Writer ───────────────────────────────────────────────────────────────────
class XyzWriter {
    constructor(log) {
        this.log = log;
    }
    async createFromDirectory(srcDir, destPath, compressionLevel = 6, onProgress) {
        const files = this.walkDir(srcDir);
        const entries = [];
        const dataBlocks = [];
        let dataOffset = 0;
        // Compute header size estimate first (will fill in offsets after)
        // Pass 1: compress data
        for (let i = 0; i < files.length; i++) {
            const abs = files[i];
            const rel = path.relative(srcDir, abs).replace(/\\/g, '/');
            const stat = fs.statSync(abs);
            let data;
            let compressed;
            let compMethod;
            if (stat.isDirectory()) {
                data = Buffer.alloc(0);
                compressed = Buffer.alloc(0);
                compMethod = XyzCompression.STORE;
            }
            else {
                data = fs.readFileSync(abs);
                compressed = compressionLevel > 0
                    ? await deflateRaw(data, { level: compressionLevel })
                    : data;
                compMethod = compressionLevel > 0 ? XyzCompression.DEFLATE : XyzCompression.STORE;
            }
            const checksum = crc32(data.length > 0 ? data : compressed);
            entries.push({
                name: rel,
                type: stat.isDirectory() ? XyzEntryType.DIR : XyzEntryType.FILE,
                uncompressedSize: data.length,
                compressedSize: compressed.length,
                dataOffset, // will fix below
                crc32: checksum,
                modifiedMs: BigInt(stat.mtimeMs | 0),
                compression: compMethod,
            });
            dataBlocks.push(compressed);
            dataOffset += compressed.length;
            if (onProgress)
                onProgress(Math.round(((i + 1) / files.length) * 80), rel);
            this.log.debug(`Packed: ${rel}  (${data.length} → ${compressed.length} bytes)`);
        }
        // Build header table
        const headerParts = [];
        const fixedHeader = Buffer.alloc(16);
        exports.XYZ_MAGIC.copy(fixedHeader, 0);
        fixedHeader.writeUInt8(exports.XYZ_VERSION_MAJOR, 4);
        fixedHeader.writeUInt8(exports.XYZ_VERSION_MINOR, 5);
        fixedHeader.writeUInt16LE(0x02, 6); // checksummed
        fixedHeader.writeUInt32LE(entries.length, 8);
        fixedHeader.writeUInt32LE(0, 12); // placeholder CRC
        headerParts.push(fixedHeader);
        let entryTableSize = 0;
        for (const e of entries) {
            const nameBytes = Buffer.from(e.name, 'utf8');
            entryTableSize += 2 + nameBytes.length + 1 + 4 + 4 + 4 + 4 + 8 + 1;
        }
        const headerSize = 16 + entryTableSize;
        const entryTableBuf = Buffer.alloc(entryTableSize);
        let cursor = 0;
        // Fix dataOffset references with actual header size
        let absoluteOffset = headerSize;
        for (let i = 0; i < entries.length; i++) {
            entries[i].dataOffset = absoluteOffset;
            absoluteOffset += dataBlocks[i].length;
        }
        for (const e of entries) {
            const nameBytes = Buffer.from(e.name, 'utf8');
            entryTableBuf.writeUInt16LE(nameBytes.length, cursor);
            cursor += 2;
            nameBytes.copy(entryTableBuf, cursor);
            cursor += nameBytes.length;
            entryTableBuf.writeUInt8(e.type, cursor);
            cursor += 1;
            entryTableBuf.writeUInt32LE(e.uncompressedSize, cursor);
            cursor += 4;
            entryTableBuf.writeUInt32LE(e.compressedSize, cursor);
            cursor += 4;
            entryTableBuf.writeUInt32LE(e.dataOffset, cursor);
            cursor += 4;
            entryTableBuf.writeUInt32LE(e.crc32, cursor);
            cursor += 4;
            entryTableBuf.writeBigUInt64LE(e.modifiedMs, cursor);
            cursor += 8;
            entryTableBuf.writeUInt8(e.compression, cursor);
            cursor += 1;
        }
        // Write header CRC
        const headerCrc = crc32(entryTableBuf);
        fixedHeader.writeUInt32LE(headerCrc, 12);
        const finalBuf = Buffer.concat([fixedHeader, entryTableBuf, ...dataBlocks]);
        fs.writeFileSync(destPath, finalBuf);
        if (onProgress)
            onProgress(100, 'Done');
        this.log.info(`Created XYZ archive: ${destPath}  (${finalBuf.length} bytes, ${entries.length} entries)`);
    }
    walkDir(dir) {
        const result = [];
        const recurse = (current) => {
            result.push(current);
            if (fs.statSync(current).isDirectory()) {
                for (const child of fs.readdirSync(current)) {
                    recurse(path.join(current, child));
                }
            }
        };
        for (const child of fs.readdirSync(dir))
            recurse(path.join(dir, child));
        return result;
    }
}
exports.XyzWriter = XyzWriter;
//# sourceMappingURL=xyzCodec.js.map