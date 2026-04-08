#!/usr/bin/env node
import { intro, outro, spinner } from "@clack/prompts";
import { cli } from "cleye";
import { detectLanguage } from "file-lang";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

import type { CliFlagsFromOptions, DirNode } from "@/src/types";

import { Logger } from "@/src/logger";
import { Benchmark } from "@/src/utils/benchmark";
import { createNode } from "@/src/utils/buildTree";
import { clearCache, loadCache, saveCache } from "@/src/utils/cache";
import { cleanCacheAsync } from "@/src/utils/cleanCache";
import { computeSeverity, parseSeverity } from "@/src/utils/severity";
import { Style } from "@/src/utils/style";

import type { CodeStatsConfig } from "./utils/config";

import { getNumberFormatter, msToHumanReadable, resolveRootDir } from "./utils";
import { buildConfig, defaultConfig, formats, groupBy, loadConfig, parseCLIFlags, severityMode, sortBy, userConfigHasKey } from "./utils/config";
import { CSVPrinter, GroupPrinter, JSONPrinter, SummaryPrinter, TablePrinter, TopFilesPrinter, TreePrinter } from "./utils/printers";
import { scanFiles } from "./utils/scanFiles";
const controller = new AbortController();
let aborted = false;

export const PROGRESS_INTERVAL = 100;
export const logger = new Logger({
	quiet: false,
	style: new Style({ quiet: false }, { chars: [0, 0, 0], lines: [0, 0, 0] })
});
const argv = cli({
	flags: {
		benchmark: {
			default: false,
			description: "Enable timing measurements for important CLI operations",
			type: Boolean
		},
		clearCache: {
			default: false,
			description: "Delete existing cache before scanning to ensure a full recalculation",
			type: Boolean
		},
		compact: {
			alias: "c",
			default: false,
			description: "Display condensed output with reduced detail",
			type: Boolean
		},
		concurrency: {
			default: 8,
			description: "Number of concurrent file scans",
			type: Number
		},
		csv: {
			default: false,
			description: "Print results as CSV to stdout",
			type: Boolean
		},
		depth: {
			alias: "d",
			default: -1,
			description: "Maximum directory traversal depth (-1 = unlimited)",
			type: Number
		},
		enableSeverityColors: {
			default: false,
			description: "Colorize output based on severity thresholds (lines/chars)",
			type: Boolean
		},
		exclude: {
			alias: "e",
			default: ["node_modules/**", ".git/**"],
			description: "Glob patterns to exclude (comma-separated)",
			type: String
		},
		followSymlinks: {
			default: false,
			description: "Follow symlinks",
			type: Boolean
		},
		format: {
			alias: "f",
			default: "tree",
			description: `Output format: ${formats.join(" | ")}`,
			type: String
		},
		groupBy: {
			alias: "g",
			default: undefined,
			description: `Group results by: ${groupBy
				.map((v) => {
					switch (v) {
						case "dir":
							return "dir (directory)";
						case "ext":
							return "ext (file extension)";
						case "lang":
							return "lang (language)";
						case "size":
							return "size (file size)";
						default:
							v satisfies never;
					}
				})
				.join(" | ")}`,
			type: String
		},
		ignore: {
			alias: "i",
			default: [],
			description: "Additional ignore patterns (merged with .gitignore rules)",
			type: String
		},
		includeHidden: {
			default: false,
			description: "Include hidden files and directories",
			type: Boolean
		},
		json: {
			default: false,
			description: "Print results as JSON to stdout",
			type: Boolean
		},
		languages: {
			alias: "l",
			default: ["javascript", "typescript"],
			description: "Languages to include (comma-separated). File extensions are automatically mapped to these languages.",
			type: String
		},
		noColor: {
			default: false,
			description: "Disable all terminal colors",
			type: Boolean
		},
		order: {
			alias: "o",
			default: "desc",
			description: "Sort order: asc | desc",
			type: String
		},
		perDirTopFiles: {
			alias: "p",
			default: undefined,
			description: "Show top N files within each directory (by current sort metric)",
			type: Number
		},
		pretty: {
			default: false,
			description: "Pretty-print JSON output (only applies with --json)",
			type: Boolean
		},
		quiet: {
			alias: "q",
			default: false,
			description: "Suppress logs, spinners, and non-essential output",
			type: Boolean
		},
		rootLevels: {
			alias: "r",
			default: undefined,
			description: "Shift the logical root up by N directories",
			type: Number
		},
		saveCsv: {
			default: false,
			description: "Write CSV output to a file instead of stdout",
			type: Boolean
		},
		saveJson: {
			default: false,
			description: "Write JSON output to a file instead of stdout",
			type: Boolean
		},
		severityChars: {
			default: undefined,
			description: "Character thresholds for medium/high/critical (e.g. 5000,20000,100000)",
			type: String
		},
		severityLines: {
			default: undefined,
			description: "Line thresholds for medium/high/critical (e.g. 2000,5000,10000)",
			type: String
		},
		severityMode: {
			alias: "m",
			default: "static",
			description: `Severity calculation mode: ${severityMode.join(" | ")}`,
			type: String
		},
		sortBy: {
			alias: "s",
			default: "lines",
			description: `Sort metric: ${sortBy.join(" | ")}`,
			type: String
		},
		summaryOnly: {
			default: false,
			description: "Only display aggregated totals (no per-file output)",
			type: Boolean
		},
		topFiles: {
			alias: "n",
			default: undefined,
			description: "Show top N files globally (by current sort metric)",
			type: Number
		}
	} as const satisfies CliFlagsFromOptions<CodeStatsConfig>,
	help: {
		description: "Analyze codebases and report file, line, character, and size statistics.",
		examples: [
			// --- Basic ---
			"code-stats .                          # Analyze current directory",
			"code-stats ./src                      # Analyze a specific folder",
			"code-stats . --clearCache             # Force full re-scan (ignore cache)",
			"code-stats . --includeHidden --followSymlinks  # Include hidden files and follow symlinks",
			// --- Filtering ---
			"code-stats . -l ts,tsx                # Include only TS/TSX files",
			"code-stats . -e node_modules,dist     # Exclude directories",
			"code-stats . -i '*.test.ts'           # Ignore test files (extends .gitignore)",
			// --- Output formats ---
			"code-stats . -f tree                  # Hierarchical tree (default)",
			"code-stats . -f table                 # Tabular view",
			"code-stats . -f summary               # Totals only view",
			"code-stats . --compact                # Reduce verbosity",
			"code-stats . --summaryOnly            # Show only totals (no breakdown)",
			// --- Machine-readable output ---
			"code-stats . --json                   # JSON to stdout",
			"code-stats . --json --pretty          # Pretty JSON",
			"code-stats . --saveJson               # Save JSON to file",
			"code-stats . --csv                    # CSV to stdout",
			"code-stats . --saveCsv                # Save CSV to file",
			// --- Grouping ---
			"code-stats . -g ext                   # Group by file type",
			"code-stats . -g dir                   # Group by directory",
			"code-stats . -g size                  # Group by size buckets",
			// --- Sorting / ranking ---
			"code-stats . -s lines                 # Sort by line count",
			"code-stats . -s chars                 # Sort by character count",
			"code-stats . -o desc                  # Descending order",
			"code-stats . -s lines -o desc -n 10   # Top 10 largest files",
			"code-stats . -p 3                     # Top 3 files per directory",
			// --- Directory control ---
			"code-stats . -d 2                     # Limit depth to 2 levels",
			"code-stats . -d 2 -r 1                # Shift root + limit depth",
			// --- Output control ---
			"code-stats . --quiet                  # Disable logs/spinners",
			"code-stats . --noColor                # Disable ANSI colors",
			// --- Severity ---
			"code-stats . --enableSeverityColors   # Enable severity highlighting",
			"code-stats . --severityLines 2000,5000,10000",
			"code-stats . --severityChars 5000,20000,100000",
			"code-stats . -m percentile            # Auto-scale severity (distribution-based)",
			// --- Real-world combos ---
			"code-stats . -l ts,tsx -g ext -s lines -o desc -n 5",
			"code-stats ./src -f table -s chars -o desc --compact",
			"code-stats . -e dist,node_modules --saveJson",
			"code-stats . -g dir -p 5 --summaryOnly",
			"code-stats . --includeHidden --followSymlinks"
		],
		usage: [
			"code-stats [path] [options]",
			"# Analyze TypeScript files sorted by size",
			"code-stats . -l ts,tsx -s lines -o desc",
			"# Show top files in table format",
			"code-stats ./src -f table -n 10",
			"# Group by file type (compact view)",
			"code-stats . -g ext --compact",
			"# Export machine-readable output",
			"code-stats . --json --pretty",
			"code-stats . --saveCsv",
			"# Enable severity visualization",
			"code-stats . --enableSeverityColors",
			"code-stats . -m percentile",
			"# Include hidden files and follow symlinks",
			"code-stats . --includeHidden --followSymlinks"
		],
		version: "1.0.0"
	},
	name: "code-stats",
	parameters: ["[path]"]
});
export type CLI_argv = typeof argv;
const standardNotationFormatter = getNumberFormatter("standard");
const compactNotationFormatter = getNumberFormatter("compact");
const resolveFormatter = (n: number) => (n >= 100_000 ? compactNotationFormatter(n) : standardNotationFormatter(n));
function printSummary(config: CodeStatsConfig, duration: number, totals: DirNode["totals"]) {
	if (config.format !== "summary")
		logger.log(
			`TOTAL → Lines: ${standardNotationFormatter(totals.lines)}, Chars: ${standardNotationFormatter(totals.chars)}${totals.files > 0 ? `, Files: ${standardNotationFormatter(totals.files)}` : ""}${totals.dirs > 0 ? `, Directories: ${standardNotationFormatter(totals.dirs)}` : ""}`
		);
	if (!config.quiet) outro(`✨ Done in ${msToHumanReadable(duration)}${aborted ? " (partial)" : ""}`);
}

async function tryBlock<T>(label: string, fn: () => Promise<T> | T): Promise<null | T> {
	try {
		return await fn();
	} catch (err: any) {
		logger.error(`Error in ${label}:`, err instanceof Error ? err.message : err);
		if (aborted) return null;
		process.exit(1);
	}
}
export const benchmark = new Benchmark({ enabled: argv.flags.benchmark });
void (async () => {
	{
		intro("📊 Code stats");
		const startTime = Date.now();
		// ---------- PATH ----------
		const base = path.resolve(argv._[0] ?? ".");
		if (!existsSync(base)) return outro("Path does not exist.");
		if (!statSync(base).isDirectory()) return outro(`Path must be a directory. Received: ${base}`);
		// ---------- LOAD CONFIG ----------
		const fileConfig = loadConfig(process.cwd());
		const cliConfig = parseCLIFlags(argv);
		const { final: config, user: userConfig } = buildConfig(fileConfig ?? {}, cliConfig);
		logger.setConfig(config);
		logger.setSeverityLevels(
			{
				chars: parseSeverity(config.severityChars ?? defaultConfig.severityChars),
				lines: parseSeverity(config.severityLines ?? defaultConfig.severityLines)
			},
			config
		);
		logger.setStyle(
			new Style(config, {
				chars: parseSeverity(config.severityChars ?? defaultConfig.severityChars),
				lines: parseSeverity(config.severityLines ?? defaultConfig.severityLines)
			})
		);
		const rootDir = resolveRootDir(base, config.rootLevels);
		const s = spinner();
		const spin = {
			message: (msg: string) => !config.quiet && s.message(msg),
			start: (msg: string) => !config.quiet && s.start(msg),
			stop: (msg: string) => !config.quiet && s.stop(msg)
		};
		if ((config.json || config.csv) && config.format !== "tree") {
			logger.warn("--json/--csv overrides --format");
		}
		if (config.json && config.csv) {
			logger.error("Cannot use --json and --csv together");
			process.exit(1);
		}
		if (config.clearCache) {
			await tryBlock("clearing cache", () => benchmark.run("clearing cache", () => clearCache(process.cwd())));
			logger.info("🧹 Cache cleared");
		}
		if (userConfig.severityMode !== undefined && (userConfigHasKey("severityLines", userConfig) || userConfigHasKey("severityChars", userConfig))) {
			logger.warn("--severityMode overrides manual severity thresholds");
		}
		const cache = await benchmark.run("loading cache", () => loadCache(process.cwd()));
		// ---------- SCAN ----------
		let lastUpdate = 0;
		const rootName = rootDir === base ? path.basename(base) : path.basename(rootDir);
		const root = createNode(rootName || rootDir, rootDir, undefined, rootDir === base);
		const files = await tryBlock("file scanning", async () => {
			spin.start("Scanning files...");

			const result = await benchmark.run("file scanning", async () => {
				return await scanFiles(
					base,
					{
						cache,
						...config,
						languages: config.languages.map((t) =>
							t === "all" ? t : detectLanguage(t.toLowerCase()) === "Unknown" ? t : detectLanguage(t.toLowerCase())
						),
						onProgress: (p) => {
							if (config.quiet) return;
							const now = Date.now();
							if (now - lastUpdate < PROGRESS_INTERVAL) return;
							lastUpdate = now;

							switch (p.stage) {
								case "collect":
									spin.message(`Collecting... ${resolveFormatter(p.files)} files (${resolveFormatter(p.dirs)} dirs)`);
									break;

								case "done":
									spin.message(`Finalizing... ${resolveFormatter(p.totalFiles)} files`);
									break;

								case "process": {
									const elapsed = (now - startTime) / 1000;
									const rate = elapsed > 0 ? Math.round(p.completed / elapsed) : 0;
									const displayPath = path.relative(rootDir, p.path);
									const linesLabel = config.compact ? "L" : "Lines";
									const charsLabel = config.compact ? "C" : "Chars";

									const elapsedTime = msToHumanReadable(elapsed * 1000);
									spin.message(
										`${resolveFormatter(p.completed)}/${resolveFormatter(p.total)} files (${resolveFormatter(rate)}/s) | ${linesLabel}: ${resolveFormatter(p.lines)} (${resolveFormatter(p.totalLines)}) ${charsLabel}: ${resolveFormatter(p.chars)} (${resolveFormatter(p.totalChars)}) | Elapsed: ${elapsedTime} | ETA: ${msToHumanReadable(p.etaMs)} | ${displayPath}`
									);
									break;
								}
							}
						},
						signal: controller.signal
					},
					root
				);
			});

			spin.stop(aborted ? "Scan aborted" : `Done (${resolveFormatter(result.length)} files)`);

			return result;
		});

		if (!files || files.length === 0) return;
		if (aborted && !config.quiet && files.length > 0) {
			logger.warn("Scan aborted — results are partial");
		}

		void tryBlock("updating cache", () => {
			for (const f of files) cache.files[f.path] = f;

			const now = Date.now();
			const { length: cacheSize } = Object.keys(cache.files);

			const shouldClean = cacheSize > 200_000 || now - cache.meta.createdAt > cache.meta.maxAgeMs;

			if (shouldClean) {
				void benchmark
					.run("cleaning cache", () => cleanCacheAsync(cache))
					.then((finalCache) => saveCache(process.cwd(), finalCache))
					.catch((err) => logger.error("Error cleaning cache in background:", err));
			} else {
				saveCache(process.cwd(), cache);
			}
		});
		const { severityChars, severityLines } = computeSeverity(files, config);

		const style = new Style(config, {
			chars: severityChars,
			lines: severityLines
		});
		function getPrinter(config: CodeStatsConfig, style: Style) {
			if (config.json) return new JSONPrinter(config, style);
			if (config.csv) return new CSVPrinter(config, style);
			if (config.groupBy) return new GroupPrinter(config, style, config.groupBy);
			switch (config.format) {
				case "summary":
					return new SummaryPrinter(config, style);
				case "table":
					return new TablePrinter(config, style);
				case "tree":
					return new TreePrinter(config, style);
				default:
					config.format satisfies never;
			}
		}
		const printer = getPrinter(config, style);
		// ---------- PRINT ----------
		await tryBlock("printing results", async () => {
			await benchmark.run("printing results", () => {
				const duration = Number((Date.now() - startTime).toFixed(0));
				if (config.topFiles) {
					new TopFilesPrinter(config, style).print(files, root);
					return printSummary(config, duration, root.totals);
				}
				if (config.summaryOnly) return printSummary(config, duration, root.totals);
				printer?.print(files, root);
				printSummary(config, duration, root.totals);
			});
		});
		benchmark.printSummary();
	}
})();
process.on("SIGINT", () => {
	aborted = true;
	logger.warn("Scan aborted by user (Ctrl+C)");
	controller.abort();
});
process.on("uncaughtException", (err) => {
	aborted = true;
	if (err instanceof Error) {
		logger.error("Uncaught exception:");
		logger.error(err.stack ?? err.message);
	} else {
		logger.error("Uncaught exception (non-error):", err);
	}
	controller.abort();
});

process.on("unhandledRejection", (reason, promise) => {
	aborted = true;
	logger.error("Unhandled promise rejection:");
	if (reason instanceof Error) {
		logger.error(reason.stack ?? reason.message);
	} else {
		logger.error("Reason:", reason);
	}
	logger.error("Promise:", promise);
	controller.abort();
});
