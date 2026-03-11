# XYZ File Decompressor — VSCode Extension

A full-featured archive decompressor for VSCode with **first-class support for the custom `.xyz` format**, plus ZIP, TAR, GZ, BZ2, and more.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🗜️ **Custom `.xyz` format** | Read, write, and validate proprietary `.xyz` archives with CRC-32 integrity checks |
| 📦 **Multi-format support** | ZIP · TAR · TAR.GZ · TAR.BZ2 · GZ · (7Z via cli) |
| 🔍 **Archive preview** | Rich webview showing all entries with sizes, compression ratios, and dates |
| ⚙️ **Syntax highlighting** | Full TextMate grammar for `.xyz` manifest files |
| 📝 **Snippets** | Quick-insert header/entry templates for `.xyz` files |
| ✅ **Integrity validation** | Validate `.xyz` archives, check magic bytes, CRC, and entry table |
| 📊 **Statistics** | Compression ratio, file/dir counts, encryption status |
| 🏗️ **Create `.xyz` archives** | Compress any folder into `.xyz` format right from Explorer |

---

## 🚀 Quick Start

### Install
```bash
# From VSIX
code --install-extension xyz-decompressor-1.0.0.vsix
```

### Build from source
```bash
npm install
npm run compile
# package
npx vsce package
```

---

## 📁 The `.xyz` Archive Format

`.xyz` is a binary archive format designed for developer toolchains.

### Binary Layout
```
Offset  Size  Field
──────────────────────────────────────────────────────
0       4     Magic: 0x58 0x59 0x5A 0x21  ("XYZ!")
4       1     Version major (u8)
5       1     Version minor (u8)
6       2     Flags: bit0=encrypted  bit1=checksummed  bit2=split
8       4     Entry count (u32 LE)
12      4     Header CRC-32 (u32 LE)
16      …     Entry table (variable length, one record per entry)
…       …     Raw data blocks (compressed bytes, one per file entry)
```

### Entry Table Record
```
Size   Field
──────────────────────────────────────
u16    Name length (bytes)
u8[]   Name (UTF-8, no null terminator)
u8     Type: 0=FILE  1=DIR  2=SYMLINK
u32    Uncompressed size
u32    Compressed size
u32    Data offset (absolute, from file start)
u32    CRC-32 of compressed data
u64    Modified time (Unix ms, little-endian)
u8     Compression: 0=STORE  1=DEFLATE
```

### Flags
| Bit | Meaning |
|-----|---------|
| 0   | AES-256 encrypted payload |
| 1   | CRC-32 checksums present  |
| 2   | Split archive (multi-part) |

---

## 🛠️ Commands

| Command | Default Keybinding | Description |
|---------|--------------------|-------------|
| `XYZ: Extract Here` | — | Extract next to the archive |
| `XYZ: Extract To…` | — | Pick destination folder |
| `XYZ: Extract to Workspace Root` | — | Extract into open workspace |
| `XYZ: Preview Archive Contents` | — | Open rich webview |
| `XYZ: Create .xyz Archive from Folder` | — | Compress selected folder |
| `XYZ: Validate Archive Integrity` | — | Verify magic, CRC, entry table |
| `XYZ: Show Archive Statistics` | — | Sizes, ratio, encryption status |

All commands are available in:
- **Explorer context menu** (right-click an archive)
- **Command Palette** (`Ctrl+Shift+P`)

---

## ⚙️ Settings

```jsonc
{
  // Create a named subfolder when extracting
  "xyzDecompressor.createSubfolder": true,

  // "ask" | "always" | "never"
  "xyzDecompressor.overwriteExisting": "ask",

  // Reveal extracted folder in Explorer
  "xyzDecompressor.openAfterExtract": true,

  // Compression level 1–9 for new .xyz archives
  "xyzDecompressor.xyzCompressionLevel": 6,

  // Enable AES-256 (requires passphrase prompt)
  "xyzDecompressor.xyzEncryptionEnabled": false
}
```

---

## 🧩 Syntax Highlighting

`.xyz` manifest files get full syntax highlighting:

```xyz
XYZ_ARCHIVE v1.0
CREATED: 2024-06-01T12:00:00Z
AUTHOR: "Jane Dev"
COMPRESSION: DEFLATE
ENCRYPTION: NONE
CHECKSUM: SHA256
ENTRIES: 3

ENTRY 0
  TYPE: FILE
  NAME: "src/main.ts"
  SIZE: 4096
  COMPRESSED: 1820
  CRC32: A3F2B1C0
  MODIFIED: 2024-06-01T11:00:00Z
```

---

## 📦 Supported Formats

| Extension | Read | Write | Preview |
|-----------|------|-------|---------|
| `.xyz`    | ✅   | ✅    | ✅      |
| `.zip`    | ✅   | ❌    | ✅      |
| `.tar`    | ✅   | ❌    | ✅      |
| `.tar.gz` / `.tgz` | ✅ | ❌ | ✅  |
| `.tar.bz2`/ `.tbz2`| ✅ | ❌ | ✅  |
| `.gz`     | ✅   | ❌    | ⚠️ partial |

---

## License

MIT © devtools
