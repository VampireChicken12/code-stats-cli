import os from "node:os";
import path from "node:path";
import pLimit from "p-limit";

import type { DirNode } from "@/src/types";
import type { Cache } from "@/src/utils/cache";
import type { CodeStatsConfig } from "@/src/utils/config";

import { createNode } from "@/src/utils/buildTree";

import type { CollectorProgress, ProcessorProgress, ScanDeps, ScanState } from "./types";

import { collectPaths } from "./collectPaths";
import { processFile } from "./processFile";

const PROGRESS_INTERVAL = 100;

export type ScanOptions = CodeStatsConfig & {
	cache: Cache;
	onProgress?: (progress: ScanProgress) => void;
	signal?: AbortSignal;
};

export type ScanProgress = CollectorProgress | ProcessorProgress | { stage: "done"; totalFiles: number };

export async function scanFiles(dir: string, options: ScanOptions, deps: ScanDeps, root?: DirNode) {
	const { cache, onProgress, signal, ...config } = options;

	const state: ScanState = {
		cache,
		dirHashState: new Map(),
		dirLanguagesMap: new Map(),
		dirMap: new Map(),
		dirMtimeMap: new Map(),
		processedFiles: 0,
		results: [],
		seen: new Set(),
		totalChars: 0,
		totalLines: 0
	};

	const { benchmark: benchFn, fs: fsDep, logger: logFn } = deps;
	const benchmark = benchFn ?? { run: <T>(_: string, fn: () => T) => fn() };
	const logger = logFn ?? console;
	const resolvedDeps: Required<ScanDeps> = { benchmark, fs: fsDep ?? (await import("node:fs")), logger };

	let lastProgressEmit = 0;
	const startTime = Date.now();

	const emitProgress = (progress: ScanProgress) => {
		const now = Date.now();
		if (now - lastProgressEmit < PROGRESS_INTERVAL && progress.stage !== "done") return;
		lastProgressEmit = now;
		onProgress?.(progress);
	};

	const files = await benchmark.run("collecting files", () =>
		collectPaths(
			{
				cache,
				config: {
					exclude: config.exclude ?? [],
					followSymlinks: config.followSymlinks ?? false,
					ignore: config.ignore ?? [],
					includeHidden: config.includeHidden ?? false,
					languages: config.languages ?? []
				},
				onProgress: emitProgress,
				rootDir: dir,
				signal
			},
			resolvedDeps
		)
	);

	const { length: totalFiles } = files;

	if (!root) {
		const rootName = path.basename(dir);
		root = createNode(rootName || dir, dir, undefined, true);
	}
	state.dirMap.set(root.path, root);

	const concurrencyLimit = config.concurrency ?? Math.max(64, os.cpus().length * 2);
	const limit = pLimit(concurrencyLimit);

	await benchmark.run("processing files", () =>
		Promise.all(
			files.map((file) =>
				limit(async () => {
					const fsStat = await processFile(
						{
							config: {
								exclude: config.exclude,
								followSymlinks: config.followSymlinks ?? false,
								ignore: config.ignore,
								includeHidden: config.includeHidden ?? false,
								languages: config.languages ?? [],
								signal
							},
							file,
							root,
							signal,
							state
						},
						resolvedDeps
					);

					if (fsStat) {
						const { etaMs, percentage, rate } = calculateProgress(state.processedFiles, totalFiles, startTime);
						emitProgress({
							chars: fsStat.chars,
							completed: state.processedFiles,
							etaMs,
							lines: fsStat.lines,
							path: file.fullPath,
							percentage,
							rate,
							stage: "process",
							total: totalFiles,
							totalChars: state.totalChars,
							totalLines: state.totalLines
						});
					}
				})
			)
		)
	);

	await benchmark.run("finalizing dir hashes", () => {
		for (const [dirPath, hash] of state.dirHashState.entries()) {
			const dirCache = cache.dirs[dirPath] ?? { cachedAt: 0, languages: [], mtimeMs: 0 };
			cache.dirs[dirPath] = {
				...dirCache,
				cachedAt: Date.now(),
				hash: hash.digest("hex"),
				languages: [...(state.dirLanguagesMap.get(dirPath) ?? [])],
				mtimeMs: state.dirMtimeMap.get(dirPath) ?? 0
			};
		}
	});

	emitProgress({ stage: "done", totalFiles: state.processedFiles });
	return state.results;
}

function calculateProgress(completed: number, total: number, startTime: number) {
	const elapsedSec = (Date.now() - startTime) / 1000;
	const rate = elapsedSec > 0 ? completed / elapsedSec : 0;
	const percentage = total > 0 ? completed / total : 0;
	const remaining = total - completed;
	const etaMs = rate > 0 ? (remaining / rate) * 1000 : Infinity;
	return { etaMs, percentage, rate };
}
