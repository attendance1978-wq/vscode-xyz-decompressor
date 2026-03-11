import { Logger } from './logger';
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
export declare class DecompressorService {
    private log;
    private xyzReader;
    constructor(log: Logger);
    extract(archivePath: string, destDir: string, onProgress?: ProgressCallback): Promise<void>;
    listContents(archivePath: string): Promise<ArchiveEntry[]>;
    getStats(archivePath: string): Promise<ArchiveStats>;
    validateXyz(archivePath: string): Promise<{
        valid: boolean;
        errors: string[];
    }>;
    createXyz(srcDir: string, destPath: string, compressionLevel?: number, onProgress?: ProgressCallback): Promise<void>;
    private extractXyz;
    private listXyz;
    private extractZip;
    private listZip;
    private extractTar;
    private extractTarGz;
    private extractTarBz2;
    private listTar;
    private extractGz;
    private listGz;
    private getEffectiveExtension;
}
export {};
