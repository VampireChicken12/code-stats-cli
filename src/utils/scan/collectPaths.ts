import ignore from "ignore";
import fs from "node:fs";
import path from "node:path";
import picomatch from "picomatch";

import type { Cache, FileStat } from "@/src/utils/cache";

import type { CollectedFile, CollectorConfig, CollectorProgress, ScanDeps } from "./types";

type DirState = {
	dir: string;
	ig: ignore.Ignore;
};

const normalizePattern = (p: string) => {
	let pattern = p.replace(/\\/g, "/");
	if (!pattern.startsWith("**/") && !pattern.startsWith("/")) pattern = "**/" + pattern;
	if (pattern.endsWith("/")) pattern += "**";
	return pattern;
};

export type CollectPathsInput = {
	cache: Cache;
	config: CollectorConfig;
	onProgress?: (progress: CollectorProgress) => void;
	rootDir: string;
	signal?: AbortSignal;
};

export async function collectPaths(input: CollectPathsInput, deps: ScanDeps): Promise<CollectedFile[]> {
	const { cache, config, onProgress, rootDir, signal } = input;
	const { fs: fsDep, logger } = deps;
	const { exclude = [], followSymlinks = false, ignore: ignorePatterns = [], includeHidden = false } = config;

	const collected: CollectedFile[] = [];
	const stack: DirState[] = [{ dir: rootDir, ig: await loadGitignoreForDir(rootDir) }];

	const cachedAllFiles = Object.values(cache.files);
	function getFilesInDir(dirPath: string): FileStat[] {
		const prefix = dirPath + path.sep;
		return cachedAllFiles.filter((f) => f.path === dirPath || f.path.startsWith(prefix));
	}

	const matchIgnore = ignorePatterns.length
		? picomatch(ignorePatterns.map(normalizePattern), { dot: true, windows: process.platform === "win32" })
		: () => false;

	const matchExclude = exclude.length ? picomatch(exclude.map(normalizePattern), { dot: true, windows: process.platform === "win32" }) : () => false;

	let collectedFiles = 0;
	let collectedDirs = 0;

	while (stack.length) {
		if (signal?.aborted) throw new Error("Scan cancelled");

		const { dir: current, ig } = stack.pop()!;
		collectedDirs++;
		onProgress?.({ currentDir: current, dirs: collectedDirs, files: collectedFiles, stage: "collect" });

		const {
			dirs: { [current]: cachedDir }
		} = cache;
		if (cachedDir) {
			const dirFiles = getFilesInDir(current)
				.map((file) => {
					const relativePath = path.relative(rootDir, file.path).split(path.sep).join("/");
					return { cached: file, fullPath: file.path, relativePath };
				})
				.filter((f) => !matchExclude(f.relativePath) && !matchIgnore(f.relativePath));
			collectedFiles += dirFiles.length;
			collected.push(...dirFiles);
			continue;
		}

		let entries: fs.Dirent[];
		try {
			entries = await fsDep.promises.readdir(current, { withFileTypes: true });
		} catch {
			logger.warn(`Failed reading dir ${current}`);
			continue;
		}

		for (const entry of entries) {
			const fullPath = path.join(current, entry.name);
			const relativePath = path.relative(rootDir, fullPath).split(path.sep).join("/");
			if (matchExclude(relativePath) || matchIgnore(relativePath) || ig.ignores(relativePath)) continue;
			if (!includeHidden && entry.name.startsWith(".")) continue;
			if (entry.isSymbolicLink() && !followSymlinks) continue;
			if (!entry.isFile() && !entry.isDirectory()) continue;

			if (entry.isDirectory()) {
				const childIg = await loadGitignoreForDir(fullPath, ig);
				stack.push({ dir: fullPath, ig: childIg });
				continue;
			}

			const {
				files: { [fullPath]: cached }
			} = cache;
			collected.push({ cached, fullPath, relativePath });
			collectedFiles++;
			onProgress?.({ currentDir: current, dirs: collectedDirs, files: collectedFiles, stage: "collect" });
		}
	}

	return collected;
}

async function loadGitignoreForDir(dir: string, parentIg?: ignore.Ignore) {
	const ig = ignore();
	if (parentIg) ig.add(parentIg);
	try {
		const gitignorePath = path.join(dir, ".gitignore");
		const content = await fs.promises.readFile(gitignorePath, "utf-8");
		ig.add(content);
	} catch {
		// ignore silently
	}
	return ig;
}
