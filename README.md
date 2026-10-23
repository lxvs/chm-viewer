# CHM Viewer for VS Code

A VS Code extension that lets you open and browse Microsoft Compiled HTML Help (`.chm`) files directly in the editor.

## Features

- **Open CHM files** directly in VS Code with a familiar help viewer interface
- **Table of Contents (TOC)** sidebar with collapsible tree navigation
- **Full-text search** through topics in the sidebar
- **Back/Forward navigation** history
- **Internal link support** — clickable links between help topics
- **Embedded resources** — images, CSS, and other assets are resolved from inside the CHM archive
- **LZX decompression** — handles both compressed and uncompressed CHM sections

## Installation

### From source

```bash
git clone <this-repo>
cd chm-viewer
npm install
npm run compile
```

Then package and install:

```bash
npx vsce package
code --install-extension chm-viewer-0.1.0.vsix
```

Or run directly in debug mode:
1. Open this folder in VS Code
2. Press `F5` to launch the Extension Development Host
3. Open any `.chm` file

## Usage

1. Open a `.chm` file (e.g., `OakStreamCrb.chm`) in VS Code
2. The CHM Viewer will open with:
   - Left sidebar: Table of Contents and search
   - Right pane: Rendered HTML help content
   - Toolbar: Back/Forward navigation buttons
3. Click any topic in the TOC to navigate to it
4. Click internal links within help pages to jump between topics
5. Use the search box to filter topics by name

## How It Works

The extension parses the CHM (InfoTech Storage Format) file structure:

1. **ITSF Header** — locates the directory and data sections
2. **PMGL Directory Chunks** — lists all files in the archive (HTML, images, CSS, etc.)
3. **LZXC Compression** — decompresses LZX-compressed content blocks
4. **HHC Sitemap Parsing** — extracts the Table of Contents from the `.hhc` file
5. **Webview Rendering** — displays HTML content with intercepted resource loading

## Supported File Types

| Extension | Description |
|-----------|-------------|
| `.chm` | Microsoft Compiled HTML Help files |

## Requirements

- VS Code 1.140.0 or later

## Known Limitations

- JavaScript files inside CHM archives are not executed (for security)
- Some very old or non-standard CHM files may not parse correctly
- Binary TOC (stored in `#TOPICS`) is not yet supported — only `.hhc` file-based TOC

## License

MIT
