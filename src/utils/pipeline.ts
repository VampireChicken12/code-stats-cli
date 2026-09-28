import { detectLanguage } from "file-lang";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

import type { CLI_argv } from "@/src/cli";
import type { DirNode } from "@/src/types";
import type { FileStat } from "@/src/utils/cache";

import { createNode } from "@/src/utils/buildTree";
import { cleanCacheAsync, clearCache, loadCache, saveCache } from "@/src/utils/cache";
import { buildConfig, loadConfig, parseCLIFlags, userConfigHasKey } from "@/src/utils/config";
import { getNumberFormatter, resolveRootDir } from "@/src/utils/index";
import { computeSeverity } from "@/src/utils/severity";
import { Style } from "@/src/utils/style";

import type { CodeStatsConfig } from "./config";
import type { ScanProgress } from "./scan/scanFiles";

import { CSVPrinter, GroupPrinter, JSONPrinter, SummaryPrinter, TablePrinter, TopFilesPrinter, TreePrinter } from "./printers";
import { scanFiles } from "./scan";

export type PipelineBenchmark = {
	printSummary: () => void;
	run: <T>(label: string, fn: () => T) => Promise<T> | T;
};

export type PipelineDeps = {
	benchmark: PipelineBenchmark;
	detectLanguage?: (input: string) => string;
	logger: PipelineLogger;
};

export type PipelineLogger = {
	error: (...args: unknown[]) => void;
	info: (...args: unknown[]) => void;
	log: (...args: unknown[]) => void;
	setQuiet: (quiet: boolean) => void;
	setStyle: (style: Style) => void;
	warn: (...args: unknown[]) => void;
};

export type PipelineResult = {
	duration: number;
	files: FileStat[];
	root: DirNode;
};

export async function run(
	base: string,
	argv: CLI_argv,
	deps: PipelineDeps,
	signal?: AbortSignal,
	onProgress?: (progress: ScanProgress) => void
): Promise<PipelineResult> {
	const { benchmark, logger } = deps;
	const detectFn = deps.detectLanguage ?? detectLanguage;

	const standardFormatter = getNumberFormatter("standard");

	// ---------- PATH ----------
	const resolved = path.resolve(base);
	if (!existsSync(resolved)) throw new Error("Path does not exist.");
	if (!statSync(resolved).isDirectory()) throw new Error(`Path must be a directory. Received: ${resolved}`);

	// ---------- LOAD CONFIG ----------
	const fileConfig = loadConfig(process.cwd(), logger);
	const cliConfig = parseCLIFlags(argv, logger);
	const { final: config, user: userConfig } = buildConfig(fileConfig ?? {}, cliConfig);
	logger.setQuiet(config.quiet);

	// ---------- VALIDATE FLAGS ----------
	if ((config.json || config.csv) && config.format !== "tree") {
		logger.warn("--json/--csv overrides --format");
	}
	if (config.json && config.csv) {
		throw new Error("Cannot use --json and --csv together");
	}
	if (userConfig.severityMode !== undefined && (userConfigHasKey("severityLines", userConfig) || userConfigHasKey("severityChars", userConfig))) {
		logger.warn("--severityMode overrides manual severity thresholds");
	}

	// ---------- CACHE ----------
	if (config.clearCache) {
		await benchmark.run("clearing cache", () => clearCache(process.cwd()));
		logger.info("🧹 Cache cleared");
	}
	const cache = await loadCache(process.cwd(), logger, benchmark);

	// ---------- SCAN ----------
	const rootDir = resolveRootDir(resolved, config.rootLevels);
	const rootName = rootDir === resolved ? path.basename(resolved) : path.basename(rootDir);
	const root = createNode(rootName || rootDir, rootDir, undefined, rootDir === resolved);

	const startTime = Date.now();
	const files = await benchmark.run("file scanning", () =>
		scanFiles(
			resolved,
			{
				cache,
				...config,
				languages: config.languages.map((t) => (t === "all" ? t : detectFn(t.toLowerCase()) === "Unknown" ? t : detectFn(t.toLowerCase()))),
				onProgress,
				signal
			},
			{ benchmark, logger },
			root
		)
	);

	if (!files || files.length === 0) throw new Error("No files found.");

	// ---------- UPDATE CACHE ----------
	for (const f of files) cache.files[f.path] = f;
	const now = Date.now();
	const { length: cacheSize } = Object.keys(cache.files);
	const shouldClean = cacheSize > 200_000 || now - cache.meta.createdAt > cache.meta.maxAgeMs;

	if (shouldClean) {
		try {
			const finalCache = await benchmark.run("cleaning cache", () => cleanCacheAsync(cache));
			saveCache(process.cwd(), finalCache);
		} catch (err) {
			logger.error("Error cleaning cache in background:", err);
		}
	} else {
		saveCache(process.cwd(), cache);
	}

	// ---------- SEVERITY ----------
	const { severityChars, severityLines } = computeSeverity(files, config, logger);
	const style = new Style(config, { chars: severityChars, lines: severityLines });
	logger.setStyle(style);

	// ---------- PRINT ----------
	function getPrinter(cfg: CodeStatsConfig, st: Style) {
		if (cfg.json) return new JSONPrinter(cfg, st, logger);
		if (cfg.csv) return new CSVPrinter(cfg, st, logger);
		if (cfg.groupBy) return new GroupPrinter(cfg, st, logger, cfg.groupBy);
		switch (cfg.format) {
			case "summary":
				return new SummaryPrinter(cfg, st, logger);
			case "table":
				return new TablePrinter(cfg, st, logger);
			case "tree":
				return new TreePrinter(cfg, st, logger);
			default:
				return undefined;
		}
	}

	function printSummary(cfg: CodeStatsConfig, totals: DirNode["totals"]) {
		if (cfg.format !== "summary")
			logger.log(
				`TOTAL → Lines: ${standardFormatter(totals.lines)}, Chars: ${standardFormatter(totals.chars)}${totals.files > 0 ? `, Files: ${standardFormatter(totals.files)}` : ""}${totals.dirs > 0 ? `, Directories: ${standardFormatter(totals.dirs)}` : ""}`
			);
	}

	await benchmark.run("printing results", () => {
		if (config.topFiles) {
			new TopFilesPrinter(config, style, logger).print(files, root);
			printSummary(config, root.totals);
			return;
		}
		if (config.summaryOnly) {
			printSummary(config, root.totals);
			return;
		}
		const printer = getPrinter(config, style);
		printer?.print(files, root);
		printSummary(config, root.totals);
	});

	benchmark.printSummary();

	const duration = Date.now() - startTime;
	return { duration, files, root };
}
