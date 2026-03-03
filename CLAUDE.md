# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build        # Compile TypeScript and copy icons to dist/
npm run dev          # Watch mode TypeScript compilation
npm run lint         # ESLint (nodes + package.json)
npm run lintfix      # ESLint with auto-fix
npm run format       # Prettier formatting on nodes/
npm run prepublishOnly  # Full build + strict lint (run before publishing)
```

There are no tests in this project.

## Architecture

This is an **n8n community node package** that provides a `Printer` node for sending files to a CUPS print server and a `Scanner` node for scanning documents via SANE.

### How it works

#### Printer node (`nodes/Printer/Printer.node.ts`)

Implements the `INodeType` interface from `n8n-workflow`. It has two main runtime behaviors:

1. **Printer discovery** (`methods.listSearch.searchPrinters`): Runs `lpstat -h <serverIP>:631 -p` via `child_process.exec` to list available printers on the CUPS server.

2. **Print execution** (`execute`): Builds an `lp` command argument array, then spawns the process via `child_process.spawn('lp', args)`, writing the binary file buffer to its stdin. Options map as follows:
   - `quantity` → `-n <copies>`
   - `pageRange` → `-o page-ranges=<range>`
   - `advancedOptions` (JSON) → `-o key=value` for each key

#### Scanner node (`nodes/Scanner/Scanner.node.ts`)

Requires `sane-utils` (providing `scanimage`) in the n8n environment. Two main runtime behaviors:

1. **Scanner discovery** (`methods.listSearch.searchScanners`): Runs `scanimage -L` via `child_process.exec` and parses device names with regex `/device `(.+?)' is a (.+)/`.

2. **Scan execution** (`execute`): Spawns `scanimage -d <device> --format=pdf --resolution=<dpi> --mode=<mode> --source=<source>`, collects stdout chunks into a Buffer, and attaches the result as `application/pdf` binary data on the output item. Options map as follows:
   - `resolution` → `--resolution=N` (default 300)
   - `mode` → `--mode=X` (Color / Gray / Lineart, default Color)
   - `source` → `--source=X` (Flatbed / ADF, default Flatbed)

### Build pipeline

- TypeScript compiles to `dist/` (configured in `tsconfig.json`)
- `gulp build:icons` copies `.svg`/`.png` files from `nodes/` to `dist/nodes/`
- n8n loads the node from `dist/nodes/Printer/Printer.node.js` as declared in `package.json` under `n8n.nodes`

### n8n-specific conventions

The ESLint config enforces strict `eslint-plugin-n8n-nodes-base` rules. Key conventions to follow:
- Node parameter `description` fields must end with a period, be lowercase first char, and not be identical to `displayName`
- Errors must use `NodeOperationError` (not plain `Error`) and respect `this.continueOnFail()`
- Icons must be SVG files
- The `prepublishOnly` script uses a stricter `.eslintrc.prepublish.js` config — run it to catch publish-blocking issues
