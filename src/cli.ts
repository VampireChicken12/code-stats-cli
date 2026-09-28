#!/usr/bin/env node
import { intro, outro, spinner } from "@clack/prompts";
import { cli } from "cleye";
import path from "node:path";

import type { CliFlagsFromOptions } from "@/src/types";

import { Logger } from "@/src/logger";
import { Benchmark } from "@/src/utils/benchmark";

import type { CodeStatsConfig } from "./utils/config";
import type { ScanProgress } from "./utils/scan/scanFiles";

import { formats, groupBy, severityMode, sortBy } from "./utils/config";
import { msToHumanReadable } from "./utils/index";
import { run } from "./utils/pipeline";
import { Style } from "./utils/style";

const controller = new AbortController();
let aborted = false;

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
			"code-stats .                          # Analyze current directory",
			"code-stats ./src                      # Analyze a specific folder",
			"code-stats . --clearCache             # Force full re-scan (ignore cache)",
			"code-stats . --includeHidden --followSymlinks  # Include hidden files and follow symlinks",
			"code-stats . -l ts,tsx                # Include only TS/TSX files",
			"code-stats . -e node_modules,dist     # Exclude directories",
			"code-stats . -i '*.test.ts'           # Ignore test files (extends .gitignore)",
			"code-stats . -f tree                  # Hierarchical tree (default)",
			"code-stats . -f table                 # Tabular view",
			"code-stats . -f summary               # Totals only view",
			"code-stats . --compact                # Reduce verbosity",
			"code-stats . --summaryOnly            # Show only totals (no breakdown)",
			"code-stats . --json                   # JSON to stdout",
			"code-stats . --json --pretty          # Pretty JSON",
			"code-stats . --saveJson               # Save JSON to file",
			"code-stats . --csv                    # CSV to stdout",
			"code-stats . --saveCsv                # Save CSV to file",
			"code-stats . -g ext                   # Group by file type",
			"code-stats . -g dir                   # Group by directory",
			"code-stats . -g size                  # Group by size buckets",
			"code-stats . -s lines                 # Sort by line count",
			"code-stats . -s chars                 # Sort by character count",
			"code-stats . -o desc                  # Descending order",
			"code-stats . -s lines -o desc -n 10   # Top 10 largest files",
			"code-stats . -p 3                     # Top 3 files per directory",
			"code-stats . -d 2                     # Limit depth to 2 levels",
			"code-stats . -d 2 -r 1                # Shift root + limit depth",
			"code-stats . --quiet                  # Disable logs/spinners",
			"code-stats . --noColor                # Disable ANSI colors",
			"code-stats . --enableSeverityColors   # Enable severity highlighting",
			"code-stats . --severityLines 2000,5000,10000",
			"code-stats . --severityChars 5000,20000,100000",
			"code-stats . -m percentile            # Auto-scale severity (distribution-based)",
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
const {
	flags: { benchmark: enableBenchmark }
} = argv;
export const benchmark = new Benchmark({ enabled: enableBenchmark });

void (async () => {
	intro("📊 Code stats");
	const startTime = Date.now();
	const {
		flags: { compact, quiet }
	} = argv;

	const s = spinner();
	const spin = {
		message: (msg: string) => !quiet && s.message(msg),
		start: (msg: string) => !quiet && s.start(msg),
		stop: (msg: string) => !quiet && s.stop(msg)
	};

	const { _: positionalArgs } = argv;
	const base = path.resolve(positionalArgs[0] ?? ".");

	try {
		await run(base, argv, { benchmark, logger }, controller.signal, (p: ScanProgress) => {
			if (quiet) return;
			const now = Date.now();

			switch (p.stage) {
				case "collect":
					spin.message(`Collecting... ${String(p.files)} files (${String(p.dirs)} dirs)`);
					break;
				case "done":
					spin.message(`Finalizing... ${String(p.totalFiles)} files`);
					break;
				case "process": {
					const elapsed = (now - startTime) / 1000;
					const rate = elapsed > 0 ? Math.round(p.completed / elapsed) : 0;
					const displayPath = path.relative(base, p.path);
					const linesLabel = compact ? "L" : "Lines";
					const charsLabel = compact ? "C" : "Chars";
					const elapsedTime = msToHumanReadable(elapsed * 1000);
					spin.message(
						`${p.completed}/${p.total} files (${rate}/s) | ${linesLabel}: ${p.lines} (${p.totalLines}) ${charsLabel}: ${p.chars} (${p.totalChars}) | Elapsed: ${elapsedTime} | ETA: ${msToHumanReadable(p.etaMs)} | ${displayPath}`
					);
					break;
				}
			}
		});

		const duration = Date.now() - startTime;
		if (!quiet) outro(`✨ Done in ${msToHumanReadable(duration)}${aborted ? " (partial)" : ""}`);
	} catch (err: unknown) {
		if (aborted) {
			if (!quiet) outro("Scan aborted");
		} else {
			logger.error("Error:", err instanceof Error ? err.message : err);
			process.exit(1);
		}
	}

	benchmark.printSummary();
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
