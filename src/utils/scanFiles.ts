import { detectLanguage } from "file-lang";
import ignore from "ignore";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pLimit from "p-limit";
import picomatch from "picomatch";

import type { DirNode } from "@/src/types";
import type { CodeStatsConfig } from "@/src/utils/config";

import { benchmark, logger, PROGRESS_INTERVAL } from "@/src/cli";
import { assertNotAborted } from "@/src/utils";
import { createNode, insertFile } from "@/src/utils/buildTree";
import { type Cache, type FileStat } from "@/src/utils/cache";

export type ScanOptions = CodeStatsConfig & {
	cache: Cache;
	onProgress?: (progress: ScanProgress) => void;
	signal?: AbortSignal;
};

export type ScanProgress =
	| {
			/** Characters in this file */
			chars: number;
			/** Number of files fully processed so far */
			completed: number;
			/** Estimated time remaining in milliseconds */
			etaMs: number;
			/** Lines in this file */
			lines: number;
			/** Path of the file currently being processed */
			path: string;
			/** Completion percentage (0–1) */
			percentage: number;
			/** Processing rate in files per second */
			rate: number;
			/** Current stage of the scan */
			stage: "process";
			/** Total number of files to process */
			total: number;
			/** Total number of characters scanned so far */
			totalChars: number;
			/** Total number of lines scanned so far */
			totalLines: number;
	  }
	| {
			/** Current stage of the scan */
			stage: "done";
			/** Total number of files processed */
			totalFiles: number;
	  }
	| {
			/** Path of the directory currently being scanned */
			currentDir: string;
			/** Number of directories scanned so far */
			dirs: number;
			/** Number of files discovered so far */
			files: number;
			/** Current stage of the scan */
			stage: "collect";
	  };

export type ScanStage = ScanProgress["stage"];
/**
 * Calculate the progress of a scan.
 * @param completed - The number of files that have been processed so far.
 * @param total - The total number of files to process.
 * @param startTime - The time at which the scan started, in milliseconds.
 * @returns - An object containing the estimated time remaining in milliseconds, the percentage of files completed, and the processing rate in files per second.
 */
function calculateProgress(completed: number, total: number, startTime: number) {
	const elapsedSec = (Date.now() - startTime) / 1000;
	const rate = elapsedSec > 0 ? completed / elapsedSec : 0;
	const percentage = total > 0 ? completed / total : 0;
	const remaining = total - completed;
	const etaMs = rate > 0 ? (remaining / rate) * 1000 : Infinity;
	return { etaMs, percentage, rate };
}
/**
 * Normalizes a pattern by ensuring it starts with "**\/" and ends with "**"
 * if it refers to a directory, and replacing all "\\" with "/".
 * This is necessary because picomatch uses "/" as a path separator.
 */
const normalizePattern = (p: string) => {
	let pattern = p.replace(/\\/g, "/"); // normalize slashes
	if (!pattern.startsWith("**/") && !pattern.startsWith("/")) pattern = "**/" + pattern;
	if (pattern.endsWith("/")) pattern += "**"; // match all files inside directory
	return pattern;
};
type CollectedFile = {
	cached?: FileStat;
	fullPath: string;
	relativePath: string;
};

type DirState = {
	dir: string;
	ig: ignore.Ignore;
};

/**
 * Scans a directory and all subdirectories for files, and returns their file stats.
 * @param dir - The directory to scan.
 * @param options - The options to use when scanning.
 * @param [root] - The root directory node to use for inserting files. If not provided, the root directory node will be created.
 * @returns - A promise that resolves with an array of file stats.
 */
export async function scanFiles(dir: string, options: ScanOptions, root?: DirNode) {
	const { cache, onProgress, signal, ...config } = options;
	const { concurrency, exclude = [], followSymlinks = false, ignore: ignorePatterns = [], includeHidden = false, languages } = config;
	const results: FileStat[] = [];
	const seen = new Set<string>();
	const allowAllLanguages = languages.includes("all");
	const languageSet = allowAllLanguages ? new Set<string>() : new Set(languages.map((t) => t.toLowerCase()));
	const extToLanguageCache = new Map<string, string>();
	const matchIgnore = ignorePatterns.length
		? picomatch(ignorePatterns.map(normalizePattern), { dot: true, windows: process.platform === "win32" })
		: () => false;

	const matchExclude = exclude.length ? picomatch(exclude.map(normalizePattern), { dot: true, windows: process.platform === "win32" }) : () => false;

	const concurrencyLimit = concurrency ?? Math.max(64, os.cpus().length * 2);
	const limit = pLimit(concurrencyLimit);

	let collectedFiles = 0;
	let collectedDirs = 0;
	let processedFiles = 0;
	let totalFiles = 0;
	let totalLines = 0;
	let totalChars = 0;
	let lastProgressEmit = 0;
	const startTime = Date.now();

	const dirLanguagesMap = new Map<string, Set<string>>();
	const dirMtimeMap = new Map<string, number>();
	const dirHashState = new Map<string, ReturnType<typeof createHash>>();
	const dirMap = new Map<string, DirNode>();

	const emitProgress = (progress: ScanProgress) => {
		const now = Date.now();
		if (now - lastProgressEmit < PROGRESS_INTERVAL && progress.stage !== "done") return;
		lastProgressEmit = now;
		onProgress?.(progress);
	};

	async function collectPaths(): Promise<CollectedFile[]> {
		const collected: CollectedFile[] = [];
		const stack: DirState[] = [{ dir, ig: await loadGitignoreForDir(dir) }];
		const filesByDir = new Map<string, FileStat[]>();
		for (const file of Object.values(cache.files)) {
			const parentDir = path.dirname(file.path);
			if (!filesByDir.has(parentDir)) filesByDir.set(parentDir, []);
			filesByDir.get(parentDir)!.push(file);
		}
		const cachedAllFiles = Object.values(cache.files);
		function getFilesInDir(dirPath: string): FileStat[] {
			const prefix = dirPath + path.sep;
			return cachedAllFiles.filter((f) => f.path === dirPath || f.path.startsWith(prefix));
		}

		while (stack.length) {
			if (signal) assertNotAborted(signal, "Scan cancelled");

			const { dir: current, ig } = stack.pop()!;
			collectedDirs++;
			emitProgress({ currentDir: current, dirs: collectedDirs, files: collectedFiles, stage: "collect" });

			const {
				dirs: { [current]: cachedDir }
			} = cache;
			if (cachedDir) {
				const dirFiles = getFilesInDir(current)
					.map((file) => {
						const relativePath = path.relative(dir, file.path).split(path.sep).join("/");
						return { cached: file, fullPath: file.path, relativePath };
					})
					.filter((f) => !matchExclude(f.relativePath) && !matchIgnore(f.relativePath));
				collectedFiles += dirFiles.length;
				collected.push(...dirFiles);
				// Skip traversal of this directory entirely
				continue;
			}

			let entries: fs.Dirent[];
			try {
				entries = await fs.promises.readdir(current, { withFileTypes: true });
			} catch {
				logger.warn(`Failed reading dir ${current}`);
				continue;
			}

			for (const entry of entries) {
				const fullPath = path.join(current, entry.name);
				const relativePath = path.relative(dir, fullPath).split(path.sep).join("/");
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
				emitProgress({ currentDir: current, dirs: collectedDirs, files: collectedFiles, stage: "collect" });
			}
		}

		return collected;
	}
	type ChunkState = {
		blankLines: number;
		chars: number;
		endedWithNewline: boolean;
		hasAnyChar: boolean;
		hasNonWhitespace: boolean;
		lines: number;
	};

	function processBuffer(buffer: Buffer, state: ChunkState) {
		for (let i = 0; i < buffer.length; i++) {
			const byte = buffer[i]!;
			state.chars++;
			state.hasAnyChar = true;
			// We approximate String.trim() by checking common whitespace:
			// 32 = space ' '
			// 9 = tab '\t'
			// 13 = carriage return '\r'
			// 10 = newline '\n'
			// If we see anything else, it's a "non-blank" line
			if (!state.hasNonWhitespace && byte !== 32 && byte !== 9 && byte !== 13 && byte !== 10) {
				state.hasNonWhitespace = true;
			}
			// --- Line break detection ---
			// 10 = '\n' → standard newline delimiter
			// 13 = '\r' → carriage return (old Mac line endings or Windows \r\n)
			if (byte === 10) {
				state.lines++;
				if (!state.hasNonWhitespace) state.blankLines++;
				state.hasNonWhitespace = false;
				state.endedWithNewline = true;
			} else if (byte === 13) {
				// Only count \r as a line break if NOT followed by \n
				// Also skip the \n in \r\n to avoid double-counting
				if (i + 1 < buffer.length && buffer[i + 1] === 10) {
					i++;
				}
				state.lines++;
				if (!state.hasNonWhitespace) state.blankLines++;
				state.hasNonWhitespace = false;
				state.endedWithNewline = true;
			} else state.endedWithNewline = false;
		}
	}
	function finalizeChunk(state: ChunkState) {
		if (!state.hasAnyChar) {
			state.lines = 1;
			state.blankLines = 1;
			return;
		}

		// Only add final line if file does NOT end with newline
		if (!state.endedWithNewline) {
			state.lines++;
			if (!state.hasNonWhitespace) state.blankLines++;
		}
	}

	async function computeFresh(fullPath: string, stat?: fs.Stats): Promise<FileStat | null> {
		let localStat = stat;
		try {
			if (!localStat) localStat = followSymlinks ? await fs.promises.stat(fullPath) : await fs.promises.lstat(fullPath);
		} catch (err) {
			if (isPermissionError(err)) {
				logger.warn(`Skipped unreadable file: ${fullPath}`);
				return null;
			}
			throw err;
		}

		const ext = path.extname(fullPath).toLowerCase().slice(1) || "none";
		if (!extToLanguageCache.has(ext)) extToLanguageCache.set(ext, detectLanguage(fullPath).toLowerCase());
		const language = extToLanguageCache.get(ext) ?? "unknown";
		if (!allowAllLanguages && languageSet.size && !languageSet.has(language)) return null;

		const state = { blankLines: 0, chars: 0, endedWithNewline: false, hasAnyChar: false, hasNonWhitespace: false, lines: 0 } satisfies ChunkState;
		const hash = createHash("sha1");

		try {
			for await (const chunk of fs.createReadStream(fullPath, { highWaterMark: 288 * 1024 }) as AsyncIterable<Buffer>) {
				if (signal) assertNotAborted(signal, "Scan cancelled");
				processBuffer(chunk, state);
				hash.update(chunk);
			}
		} catch (err) {
			logger.warn(`Error reading file: ${fullPath}, skipping. ${(err as Error).message}`);
			return null;
		}

		finalizeChunk(state);

		const fileStat: FileStat = {
			blankLines: state.blankLines,
			bytes: localStat.size,
			cachedAt: Date.now(),
			chars: state.chars,
			codeLines: state.lines - state.blankLines,
			followSymlinks,
			hash: hash.digest("hex"),
			includeHidden,
			language,
			lines: state.lines,
			mtimeMs: localStat.mtimeMs,
			path: fullPath
		};

		cache.files[fullPath] = fileStat;
		processedFiles++;
		totalLines += fileStat.lines;
		totalChars += fileStat.chars;
		return fileStat;
	}
	function updateDirHash(filePath: string, fileHash: string) {
		let currentDir = path.dirname(filePath);
		while (true) {
			let hash = dirHashState.get(currentDir);
			if (!hash) {
				hash = createHash("sha1");
				dirHashState.set(currentDir, hash);
			}
			hash.update(fileHash, "utf-8");
			if (currentDir === root!.path) break;
			currentDir = path.dirname(currentDir);
		}
	}

	async function processFileAndInsert(file: CollectedFile) {
		const { cached, fullPath, relativePath } = file;

		let fsStat: FileStat | null;
		let stat: fs.Stats | undefined;

		if (
			cached &&
			cached.mtimeMs === (stat = await (followSymlinks ? fs.promises.stat(fullPath) : fs.promises.lstat(fullPath))).mtimeMs &&
			cached.includeHidden === includeHidden &&
			cached.followSymlinks === followSymlinks &&
			(allowAllLanguages || languageSet.has(cached.language)) &&
			!matchExclude(relativePath) &&
			!matchIgnore(relativePath)
		) {
			// Reuse cached file completely
			fsStat = cached;
			processedFiles++;
			totalLines += cached.lines;
			totalChars += cached.chars;
			updateDirHash(fullPath, cached.hash);
		} else {
			fsStat = await computeFresh(fullPath, stat);
			if (!fsStat) return;
			updateDirHash(fullPath, fsStat.hash);
		}

		if (fsStat && !seen.has(fsStat.path)) {
			seen.add(fsStat.path);
			insertFile(root!, { ...fsStat, path: relativePath }, dirMap);
			results.push(fsStat);

			const dirPath = path.dirname(fsStat.path);
			if (!dirLanguagesMap.has(dirPath)) dirLanguagesMap.set(dirPath, new Set());
			dirLanguagesMap.get(dirPath)!.add(fsStat.language);
			dirMtimeMap.set(dirPath, Math.max(dirMtimeMap.get(dirPath) ?? 0, fsStat.mtimeMs));
		}

		const { etaMs, percentage, rate } = calculateProgress(processedFiles, totalFiles, startTime);
		emitProgress({
			chars: fsStat.chars,
			completed: processedFiles,
			etaMs,
			lines: fsStat.lines,
			path: fullPath,
			percentage,
			rate,
			stage: "process",
			total: totalFiles,
			totalChars,
			totalLines
		});
	}

	function finalizeDirHashes() {
		for (const [dirPath, hash] of dirHashState.entries()) {
			const dirCache = cache.dirs[dirPath] ?? { cachedAt: 0, languages: [], mtimeMs: 0 };
			cache.dirs[dirPath] = {
				...dirCache,
				cachedAt: Date.now(),
				hash: hash.digest("hex"),
				languages: [...(dirLanguagesMap.get(dirPath) ?? [])],
				mtimeMs: dirMtimeMap.get(dirPath) ?? 0
			};
		}
	}
	const files = await benchmark.run("collecting files", () => collectPaths());
	({ length: totalFiles } = files);
	if (!root) {
		const rootName = path.basename(dir);
		root = createNode(rootName || dir, dir, undefined, true);
	}
	dirMap.set(root.path, root);

	await benchmark.run("processing files", () => Promise.all(files.map((file) => limit(() => processFileAndInsert(file)))));
	await benchmark.run("finalizing dir hashes", finalizeDirHashes);
	emitProgress({ stage: "done", totalFiles: processedFiles });
	return results;
}
function isPermissionError(err: unknown): boolean {
	return !!err && typeof err === "object" && "code" in err && (err.code === "EACCES" || err.code === "EPERM");
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
