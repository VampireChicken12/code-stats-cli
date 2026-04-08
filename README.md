# Code Stats CLI

Analyze your codebase with fast, flexible statistics.

**Code Stats CLI** scans directories and reports file, line, character, blank, and code line metrics with powerful filtering, grouping, and output options, ranging from clean terminal trees to machine-readable JSON.

---

## ✨ Features

- 📂 Tree, table, and summary output formats
- 📏 Line, character, blank line, and code line metrics
- 🔍 Filter by language, exclude, and ignore patterns
- 🧠 Smart severity highlighting (static, percentile, z-score)
- 🗂 Grouping (by extension, directory, language, or size buckets)
- 📊 Sorting, ranking, and top file insights
- ⚡ Fast scanning with caching and configurable concurrency
- ⏱ Real-time progress with throughput and ETA
- 🧠 Intelligent caching with automatic cleanup
- 📤 Export to JSON or CSV
- 📁 Supports per-directory `.gitignore` (inherits parent rules)
- 🕵️‍♂️ Include hidden files and follow symlinks

---

## 🚀 Quick Start

After linking globally:

```bash
code-stats .
```

Analyze only TypeScript files and show the largest ones:

```bash
code-stats . -l ts,tsx -s lines -o desc -n 5
```

Include hidden files and follow symlinks:

```bash
code-stats . --includeHidden --followSymlinks
```

---

## 📦 Installation (Development)

```bash
npm install
npm run dev
```

Link globally:

```bash
npm run link
```

Then use anywhere:

```bash
code-stats .
```

---

## 🧠 Common Usage Patterns

### Analyze a folder

```bash
code-stats ./src
```

### Filter by languages

```bash
code-stats . -l cs,tsx
```

### Exclude directories

```bash
code-stats . -e node_modules,dist
```

### Ignore specific files

```bash
code-stats . -i '*.test.ts'
```

### Show largest files

```bash
code-stats . -s lines -o desc -n 10
```

### Group by extension

```bash
code-stats . -g ext
```

### Group by language

```bash
code-stats . -g lang
```

### Compact output

```bash
code-stats . --compact
```

### Include hidden files and follow symlinks

```bash
code-stats . --includeHidden --followSymlinks
```

### Export results

```bash
code-stats . --json --pretty
code-stats . --saveCsv
```

### Enable severity visualization

```bash
code-stats . --enableSeverityColors
code-stats . --severityLines 2000,5000,10000
code-stats . --severityChars 5000,20000,100000
code-stats . -m percentile
```

---

## ⚡ Performance

- Concurrent file scanning with default (number of cores \* 2) workers
- Incremental caching for faster repeated runs
- Automatic cache cleanup to prevent bloat
- Real-time progress with files per second, ETA, and live metrics

---

## ⚙️ CLI Options

| Flag                     | Description                                                                  | Default                   |
| ------------------------ | ---------------------------------------------------------------------------- | ------------------------- |
| `-l, --languages`        | Include only specified languages. Auto-mapped from extensions                | `javascript,typescript`   |
| `-e, --exclude`          | Glob patterns to exclude                                                     | `node_modules/**,.git/**` |
| `-i, --ignore`           | Additional ignore patterns merged with `.gitignore`                          | `[]`                      |
| `-f, --format`           | Output format: `tree`, `table`, `summary`                                    | `tree`                    |
| `-g, --groupBy`          | Group by `ext`, `dir`, `lang`, or `size`                                     | —                         |
| `-s, --sortBy`           | Sort by `lines`, `chars`, `blankLines`, `codeLines`, `files`, `name`, `size` | `lines`                   |
| `-o, --order`            | Sort order: `asc`, `desc`                                                    | `desc`                    |
| `-n, --topFiles`         | Show top N files globally                                                    | —                         |
| `-p, --perDirTopFiles`   | Show top N files per directory                                               | —                         |
| `-d, --depth`            | Maximum directory traversal depth. `-1` means unlimited                      | `-1`                      |
| `-r, --rootLevels`       | Shift logical root up N directories                                          | —                         |
| `--compact`              | Display condensed output                                                     | `false`                   |
| `--summaryOnly`          | Show only aggregated totals                                                  | `false`                   |
| `--quiet`                | Suppress logs and spinners                                                   | `false`                   |
| `--noColor`              | Disable terminal colors                                                      | `false`                   |
| `--json`                 | Output JSON to stdout                                                        | `false`                   |
| `--pretty`               | Pretty-print JSON when using `--json`                                        | `false`                   |
| `--csv`                  | Output CSV to stdout                                                         | `false`                   |
| `--saveJson`             | Write JSON output to file                                                    | `false`                   |
| `--saveCsv`              | Write CSV output to file                                                     | `false`                   |
| `--clearCache`           | Delete cache before scanning                                                 | `false`                   |
| `--includeHidden`        | Include hidden files and directories                                         | `false`                   |
| `--followSymlinks`       | Follow symbolic links                                                        | `false`                   |
| `--concurrency`          | Number of concurrent file scans                                              | `number of cores * 2`                       |
| `--benchmark`            | Enable timing measurements for CLI operations                                | `false`                   |
| `--enableSeverityColors` | Colorize output based on severity thresholds                                 | `false`                   |
| `--severityLines`        | Line thresholds for medium, high, critical                                   | —                         |
| `--severityChars`        | Character thresholds for medium, high, critical                              | —                         |
| `-m, --severityMode`     | Severity mode: `static`, `percentile`, `z-score`                             | `static`                  |

---

## 📊 Example Output

```text
┌  📊 Code stats
│
◇  Done (318 files)
📊 Severity Thresholds (z-score)
(Lines): 292 / 474 / 839
(Chars): 17178 / 29356 / 53713

youtube-enhancer                                        (Lines: 34,966 (100.000%) [Code: 32,984, Blank: 1,982], Chars: 1,589,691 (100.000%), Files: 318, Size: 1.5MB)
    ├── src                                             (Lines: 28,955 (82.809%) [Code: 27,750, Blank: 1,205], Chars: 947,161 (59.581%), Files: 295, Size: 925.0KB)
    │   ├── features                                    (Lines: 9,152 (26.174%) [Code: 8,574, Blank: 578], Chars: 329,523 (20.729%), Files: 175, Size: 321.8KB)
    │   ├── components                                  (Lines: 4,013 (11.477%) [Code: 3,827, Blank: 186], Chars: 155,024 (9.752%), Files: 56, Size: 151.4KB)
    │   ├── utils                                       (Lines: 6,543 (18.712%) [Code: 6,391, Blank: 152], Chars: 159,256 (10.018%), Files: 21, Size: 155.5KB)
    │   ├── hooks                                       (Lines: 347 (0.992%) [Code: 310, Blank: 37], Chars: 12,664 (0.797%), Files: 15, Size: 12.4KB)
    │   │   ├── useSettingsFilter                       (Lines: 34 (0.097%) [Code: 26, Blank: 8], Chars: 1,095 (0.069%), Files: 3, Size: 1.1KB)
    │   │   │   ├── provider.tsx                        (Lines: 13 (0.037%) [Code: 10, Blank: 3], Chars: 458 (0.029%), Size: 458B)
    │   │   │   ├── index.ts                            (Lines: 13 (0.037%) [Code: 10, Blank: 3], Chars: 348 (0.022%), Size: 348B)
    │   │   │   └── context.ts                          (Lines: 8 (0.023%) [Code: 6, Blank: 2], Chars: 289 (0.018%), Size: 289B)
    │   │   ├── useSectionTitle                         (Lines: 34 (0.097%) [Code: 30, Blank: 4], Chars: 1,067 (0.067%), Files: 3, Size: 1.0KB)
    │   │   │   ├── provider.tsx                        (Lines: 15 (0.043%) [Code: 14, Blank: 1], Chars: 506 (0.032%), Size: 506B)
    │   │   │   ├── index.ts                            (Lines: 12 (0.034%) [Code: 10, Blank: 2], Chars: 335 (0.021%), Size: 335B)
    │   │   │   └── context.ts                          (Lines: 7 (0.020%) [Code: 6, Blank: 1], Chars: 226 (0.014%), Size: 226B)
    │   │   ├── useNotifications                        (Lines: 102 (0.292%) [Code: 94, Blank: 8], Chars: 4,382 (0.276%), Files: 3, Size: 4.3KB)
    │   │   │   ├── provider.tsx                        (Lines: 75 (0.214%) [Code: 72, Blank: 3], Chars: 3,231 (0.203%), Size: 3.2KB)
    │   │   │   ├── index.ts                            (Lines: 11 (0.031%) [Code: 10, Blank: 1], Chars: 327 (0.021%), Size: 327B)
    │   │   │   └── context.ts                          (Lines: 16 (0.046%) [Code: 12, Blank: 4], Chars: 824 (0.052%), Size: 824B)
    │   │   ├── useStorage.ts                           (Lines: 84 (0.240%) [Code: 76, Blank: 8], Chars: 2,606 (0.164%), Size: 2.5KB)
    │   │   ├── useRunAfterUpdate.ts                    (Lines: 15 (0.043%) [Code: 13, Blank: 2], Chars: 405 (0.025%), Size: 405B)
    │   │   ├── useDebounce.ts                          (Lines: 12 (0.034%) [Code: 11, Blank: 1], Chars: 398 (0.025%), Size: 398B)
    │   │   ├── useComponentVisible.ts                  (Lines: 25 (0.071%) [Code: 23, Blank: 2], Chars: 840 (0.053%), Size: 840B)
    │   │   ├── useClickOutside.ts                      (Lines: 36 (0.103%) [Code: 32, Blank: 4], Chars: 1,575 (0.099%), Size: 1.5KB)
    │   │   └── index.ts                                (Lines: 5 (0.014%) [Code: 5, Blank: 0], Chars: 296 (0.019%), Size: 296B)
    │   ├── pages                                       (Lines: 725 (2.073%) [Code: 693, Blank: 32], Chars: 24,045 (1.513%), Files: 14, Size: 23.5KB)
    │   │   ├── options                                 (Lines: 72 (0.206%) [Code: 65, Blank: 7], Chars: 1,974 (0.124%), Files: 5, Size: 1.9KB)
    │   │   │   ├── Options.tsx                         (Lines: 27 (0.077%) [Code: 25, Blank: 2], Chars: 756 (0.048%), Size: 756B)
    │   │   │   ├── Options.css                         (Lines: 1 (0.003%) [Code: 0, Blank: 1], Chars: 0 (0.000%), Size: 0B)
    │   │   │   ├── index.tsx                           (Lines: 14 (0.040%) [Code: 11, Blank: 3], Chars: 387 (0.024%), Size: 387B)
    │   │   │   ├── index.html                          (Lines: 14 (0.040%) [Code: 13, Blank: 1], Chars: 416 (0.026%), Size: 416B)
    │   │   │   └── index.css                           (Lines: 16 (0.046%) [Code: 16, Blank: 0], Chars: 415 (0.026%), Size: 415B)
    │   │   ├── popup                                   (Lines: 68 (0.194%) [Code: 61, Blank: 7], Chars: 1,876 (0.118%), Files: 4, Size: 1.8KB)
    │   │   │   ├── Popup.tsx                           (Lines: 28 (0.080%) [Code: 25, Blank: 3], Chars: 750 (0.047%), Size: 750B)
    │   │   │   ├── index.tsx                           (Lines: 15 (0.043%) [Code: 12, Blank: 3], Chars: 414 (0.026%), Size: 414B)
    │   │   │   ├── index.html                          (Lines: 13 (0.037%) [Code: 12, Blank: 1], Chars: 349 (0.022%), Size: 349B)
    │   │   │   └── index.css                           (Lines: 12 (0.034%) [Code: 12, Blank: 0], Chars: 363 (0.023%), Size: 363B)
    │   │   ├── embedded                                (Lines: 150 (0.429%) [Code: 145, Blank: 5], Chars: 5,189 (0.326%), Files: 2, Size: 5.1KB)
    │   │   │   ├── style.css                           (Lines: 3 (0.009%) [Code: 3, Blank: 0], Chars: 59 (0.004%), Size: 59B)
    │   │   │   └── index.ts                            (Lines: 147 (0.420%) [Code: 142, Blank: 5], Chars: 5,130 (0.323%), Size: 5.0KB)
    │   │   ├── background                              (Lines: 104 (0.297%) [Code: 101, Blank: 3], Chars: 3,548 (0.223%), Files: 2, Size: 3.5KB)
    │   │   │   ├── index.ts                            (Lines: 95 (0.272%) [Code: 92, Blank: 3], Chars: 3,292 (0.207%), Size: 3.2KB)
    │   │   │   └── index.html                          (Lines: 9 (0.026%) [Code: 9, Blank: 0], Chars: 256 (0.016%), Size: 256B)
    │   │   └── content                                 (Lines: 331 (0.947%) [Code: 321, Blank: 10], Chars: 11,458 (0.721%), Files: 1, Size: 11.2KB)
    │   │       └── index.ts                            (Lines: 331 (0.947%) [Code: 321, Blank: 10], Chars: 11,458 (0.721%), Size: 11.2KB)
    │   ├── i18n                                        (Lines: 2,713 (7.759%) [Code: 2,673, Blank: 40], Chars: 60,296 (3.793%), Files: 5, Size: 58.9KB)
    │   │   ├── types.ts                                (Lines: 1,438 (4.113%) [Code: 1,416, Blank: 22], Chars: 28,591 (1.799%), Size: 27.9KB)
    │   │   ├── migrate-translation.ts                  (Lines: 1,128 (3.226%) [Code: 1,113, Blank: 15], Chars: 28,308 (1.781%), Size: 27.6KB)
    │   │   ├── index.ts                                (Lines: 61 (0.174%) [Code: 58, Blank: 3], Chars: 1,990 (0.125%), Size: 1.9KB)
    │   │   ├── i18n.d.ts                               (Lines: 10 (0.029%) [Code: 10, Blank: 0], Chars: 209 (0.013%), Size: 209B)
    │   │   └── constants.ts                            (Lines: 76 (0.217%) [Code: 76, Blank: 0], Chars: 1,198 (0.075%), Size: 1.2KB)
    │   ├── types                                       (Lines: 528 (1.510%) [Code: 520, Blank: 8], Chars: 20,982 (1.320%), Files: 1, Size: 20.5KB)
    │   │   └── index.ts                                (Lines: 528 (1.510%) [Code: 520, Blank: 8], Chars: 20,982 (1.320%), Size: 20.5KB)
    │   ├── vite-env.d.ts                               (Lines: 1 (0.003%) [Code: 1, Blank: 0], Chars: 38 (0.002%), Size: 38B)
    │   ├── reset.d.ts                                  (Lines: 1 (0.003%) [Code: 1, Blank: 0], Chars: 37 (0.002%), Size: 37B)
    │   ├── manifest.ts                                 (Lines: 95 (0.272%) [Code: 93, Blank: 2], Chars: 2,331 (0.147%), Size: 2.3KB)
    │   ├── icons.ts                                    (Lines: 504 (1.441%) [Code: 501, Blank: 3], Chars: 22,054 (1.387%), Size: 21.5KB)
    │   ├── global.d.ts                                 (Lines: 129 (0.369%) [Code: 125, Blank: 4], Chars: 3,588 (0.226%), Size: 3.5KB)
    │   ├── defaults.ts                                 (Lines: 57 (0.163%) [Code: 54, Blank: 3], Chars: 2,651 (0.167%), Size: 2.6KB)
    │   ├── deepDarkPresets.ts                          (Lines: 350 (1.001%) [Code: 350, Blank: 0], Chars: 8,827 (0.555%), Size: 8.6KB)
    │   └── deepDarkMaterialCSS.ts                      (Lines: 3,797 (10.859%) [Code: 3,637, Blank: 160], Chars: 145,845 (9.174%), Size: 142.4KB)
    ├── scripts                                         (Lines: 508 (1.453%) [Code: 475, Blank: 33], Chars: 16,964 (1.067%), Files: 4, Size: 16.6KB)
    │   ├── updateVersionAndBuild.js                    (Lines: 25 (0.071%) [Code: 22, Blank: 3], Chars: 687 (0.043%), Size: 687B)
    │   ├── updateDeepDarkPresets.js                    (Lines: 209 (0.598%) [Code: 197, Blank: 12], Chars: 6,932 (0.436%), Size: 6.8KB)
    │   ├── updateDeepDarkMaterialCSS.js                (Lines: 245 (0.701%) [Code: 231, Blank: 14], Chars: 8,518 (0.536%), Size: 8.3KB)
    │   └── generateReleaseHashes.js                    (Lines: 29 (0.083%) [Code: 25, Blank: 4], Chars: 827 (0.052%), Size: 827B)
    ├── code-stats                                      (Lines: 1,901 (5.437%) [Code: 1,901, Blank: 0], Chars: 97,991 (6.164%), Files: 2, Size: 95.7KB)
    │   ├── code-stats-2026-03-30_01-42-05.json         (Lines: 1,633 (4.670%) [Code: 1,633, Blank: 0], Chars: 60,493 (3.805%), Size: 59.1KB)
    │   └── code-stats-2026-03-30_01-41-47.csv          (Lines: 268 (0.766%) [Code: 268, Blank: 0], Chars: 37,498 (2.359%), Size: 36.6KB)
    ├── vite.config.ts                                  (Lines: 76 (0.217%) [Code: 74, Blank: 2], Chars: 2,543 (0.160%), Size: 2.5KB)
    ├── tsconfig.json                                   (Lines: 44 (0.126%) [Code: 44, Blank: 0], Chars: 1,107 (0.070%), Size: 1.1KB)
    ├── TODO.md                                         (Lines: 1 (0.003%) [Code: 0, Blank: 1], Chars: 0 (0.000%), Size: 0B)
    ├── tailwind.config.ts                              (Lines: 14 (0.040%) [Code: 14, Blank: 0], Chars: 295 (0.019%), Size: 295B)
    ├── release.config.cjs                              (Lines: 45 (0.129%) [Code: 45, Blank: 0], Chars: 896 (0.056%), Size: 896B)
    ├── README.md                                       (Lines: 366 (1.047%) [Code: 230, Blank: 136], Chars: 26,200 (1.648%), Size: 25.6KB)
    ├── privacy.md                                      (Lines: 39 (0.112%) [Code: 20, Blank: 19], Chars: 2,702 (0.170%), Size: 2.6KB)
    ├── prettier.config.mjs                             (Lines: 12 (0.034%) [Code: 12, Blank: 0], Chars: 238 (0.015%), Size: 238B)
    ├── postcss.config.cjs                              (Lines: 9 (0.026%) [Code: 9, Blank: 0], Chars: 194 (0.012%), Size: 194B)
    ├── package.json                                    (Lines: 95 (0.272%) [Code: 95, Blank: 0], Chars: 3,329 (0.209%), Size: 3.3KB)
    ├── nodemon.json                                    (Lines: 20 (0.057%) [Code: 20, Blank: 0], Chars: 395 (0.025%), Size: 395B)
    ├── LICENSE                                         (Lines: 21 (0.060%) [Code: 17, Blank: 4], Chars: 1,083 (0.068%), Size: 1.1KB)
    ├── eslint.config.mjs                               (Lines: 113 (0.323%) [Code: 113, Blank: 0], Chars: 3,693 (0.232%), Size: 3.6KB)
    ├── crowdin.yml                                     (Lines: 3 (0.009%) [Code: 3, Blank: 0], Chars: 93 (0.006%), Size: 93B)
    ├── CHANGELOG.md                                    (Lines: 1,469 (4.201%) [Code: 918, Blank: 551], Chars: 97,332 (6.123%), Size: 95.1KB)
    ├── bun.lockb                                       (Lines: 1,158 (3.312%) [Code: 1,154, Blank: 4], Chars: 382,190 (24.042%), Size: 373.2KB)
    └── AGENTS.md                                       (Lines: 117 (0.335%) [Code: 90, Blank: 27], Chars: 5,285 (0.332%), Size: 5.2KB)
TOTAL → Lines: 34,966, Chars: 1,589,691, Files: 318
│
└  ✨ Done in 464.00ms
```
