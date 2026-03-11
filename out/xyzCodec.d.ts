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
import { Logger } from './logger';
export declare const XYZ_MAGIC: Buffer<ArrayBuffer>;
export declare const XYZ_VERSION_MAJOR = 1;
export declare const XYZ_VERSION_MINOR = 0;
export declare enum XyzEntryType {
    FILE = 0,
    DIR = 1,
    SYMLINK = 2
}
export declare enum XyzCompression {
    STORE = 0,
    DEFLATE = 1
}
export interface XyzEntry {
    name: string;
    type: XyzEntryType;
    uncompressedSize: number;
    compressedSize: number;
    dataOffset: number;
    crc32: number;
    modifiedMs: bigint;
    compression: XyzCompression;
}
export interface XyzArchiveInfo {
    version: string;
    encrypted: boolean;
    checksummed: boolean;
    entryCount: number;
    entries: XyzEntry[];
    fileSizeBytes: number;
}
export declare function crc32(buf: Buffer): number;
export declare class XyzReader {
    private filePath;
    private log;
    constructor(filePath: string, log: Logger);
    readInfo(): Promise<XyzArchiveInfo>;
    extractAll(destDir: string, onProgress?: (pct: number, name: string) => void): Promise<void>;
    private validateMagic;
}
export declare class XyzWriter {
    private log;
    constructor(log: Logger);
    createFromDirectory(srcDir: string, destPath: string, compressionLevel?: number, onProgress?: (pct: number, name: string) => void): Promise<void>;
    private walkDir;
}
