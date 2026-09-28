import { detectLanguage } from "file-lang";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import picomatch from "picomatch";

import type { DirNode } from "@/src/types";
import type { FileStat } from "@/src/utils/cache";

import { insertFile } from "@/src/utils/buildTree";

import type { CollectedFile, ProcessorConfig, ScanDeps, ScanState } from "./types";

export type ProcessFileInput = {
	config: ProcessorConfig;
	file: CollectedFile;
	root: DirNode;
	signal?: AbortSignal;
	state: ScanState;
};

type ChunkState = {
	blankLines: number;
	chars: number;
	endedWithNewline: boolean;
	hasAnyChar: boolean;
	hasNonWhitespace: boolean;
	lines: number;
};

export async function processFile(input: ProcessFileInput, deps: ScanDeps): Promise<FileStat | null> {
	const { config, file, root, state } = input;
	const { dirLanguagesMap, dirMap, dirMtimeMap } = state;
	const { fs: fsDep } = deps;
	const { followSymlinks = false, includeHidden = false, languages } = config;

	const { cached, fullPath, relativePath } = file;
	const allowAllLanguages = languages.includes("all");
	const languageSet = allowAllLanguages ? new Set<string>() : new Set(languages.map((t: string) => t.toLowerCase()));

	const excludePatterns: string[] = config.exclude ?? [];
	const ignorePatterns: string[] = config.ignore ?? [];
	const matchExclude = buildMatcher(excludePatterns);
	const matchIgnore = buildMatcher(ignorePatterns);

	let fsStat: FileStat | null;
	let stat: fs.Stats | undefined;

	if (
		cached &&
		cached.mtimeMs === (stat = await (followSymlinks ? fsDep.promises.stat(fullPath) : fsDep.promises.lstat(fullPath))).mtimeMs &&
		cached.includeHidden === includeHidden &&
		cached.followSymlinks === followSymlinks &&
		(allowAllLanguages || languageSet.has(cached.language)) &&
		!matchExclude(relativePath) &&
		!matchIgnore(relativePath)
	) {
		fsStat = cached;
		state.processedFiles++;
		state.totalLines += cached.lines;
		state.totalChars += cached.chars;
		updateDirHash(fullPath, cached.hash, state, root);
	} else {
		fsStat = await computeFresh(fullPath, stat, config, state, root, deps);
		if (!fsStat) return null;
		updateDirHash(fullPath, fsStat.hash, state, root);
	}

	if (fsStat && !state.seen.has(fsStat.path)) {
		state.seen.add(fsStat.path);
		insertFile(root, { ...fsStat, path: relativePath }, dirMap);
		state.results.push(fsStat);

		const dirPath = path.dirname(fsStat.path);
		if (!dirLanguagesMap.has(dirPath)) dirLanguagesMap.set(dirPath, new Set());
		dirLanguagesMap.get(dirPath)!.add(fsStat.language);
		dirMtimeMap.set(dirPath, Math.max(dirMtimeMap.get(dirPath) ?? 0, fsStat.mtimeMs));
	}

	return fsStat;
}

function buildMatcher(patterns: string[] | undefined): (input: string) => boolean {
	if (!patterns || patterns.length === 0) return () => false;
	return picomatch(patterns.map(normalizePattern), { dot: true, windows: process.platform === "win32" });
}

async function computeFresh(
	fullPath: string,
	stat: fs.Stats | undefined,
	config: ProcessorConfig,
	state: ScanState,
	_root: DirNode,
	deps: ScanDeps
): Promise<FileStat | null> {
	const { cache } = state;
	const { followSymlinks = false, includeHidden = false, languages } = config;
	const { fs: fsDep, logger } = deps;
	const allowAllLanguages = languages.includes("all");
	const languageSet = allowAllLanguages ? new Set<string>() : new Set(languages.map((t: string) => t.toLowerCase()));

	let localStat = stat;
	try {
		if (!localStat) localStat = followSymlinks ? await fsDep.promises.stat(fullPath) : await fsDep.promises.lstat(fullPath);
	} catch (err) {
		if (isPermissionError(err)) {
			logger.warn(`Skipped unreadable file: ${fullPath}`);
			return null;
		}
		throw err;
	}

	const language = detectLanguage(fullPath).toLowerCase();
	if (!allowAllLanguages && languageSet.size && !languageSet.has(language)) return null;

	const chunkState: ChunkState = { blankLines: 0, chars: 0, endedWithNewline: false, hasAnyChar: false, hasNonWhitespace: false, lines: 0 };
	const hash = createHash("sha1");

	try {
		for await (const chunk of fsDep.createReadStream(fullPath, { highWaterMark: 288 * 1024 }) as AsyncIterable<Buffer>) {
			if (config.signal && config.signal.aborted) throw new Error("Scan cancelled");
			processBuffer(chunk, chunkState);
			hash.update(chunk);
		}
	} catch (err) {
		if ((err as Error).message === "Scan cancelled") throw err;
		logger.warn(`Error reading file: ${fullPath}, skipping. ${(err as Error).message}`);
		return null;
	}

	finalizeChunk(chunkState);

	const fileStat: FileStat = {
		blankLines: chunkState.blankLines,
		bytes: localStat.size,
		cachedAt: Date.now(),
		chars: chunkState.chars,
		codeLines: chunkState.lines - chunkState.blankLines,
		followSymlinks,
		hash: hash.digest("hex"),
		includeHidden,
		language,
		lines: chunkState.lines,
		mtimeMs: localStat.mtimeMs,
		path: fullPath
	};

	cache.files[fullPath] = fileStat;
	state.processedFiles++;
	state.totalLines += fileStat.lines;
	state.totalChars += fileStat.chars;
	return fileStat;
}

function finalizeChunk(state: ChunkState) {
	if (!state.hasAnyChar) {
		state.lines = 1;
		state.blankLines = 1;
		return;
	}
	if (!state.endedWithNewline) {
		state.lines++;
		if (!state.hasNonWhitespace) state.blankLines++;
	}
}

function isPermissionError(err: unknown): boolean {
	return !!err && typeof err === "object" && "code" in err && (err.code === "EACCES" || err.code === "EPERM");
}

function normalizePattern(p: string): string {
	let pattern = p.replace(/\\/g, "/");
	if (!pattern.startsWith("**/") && !pattern.startsWith("/")) pattern = "**/" + pattern;
	if (pattern.endsWith("/")) pattern += "**";
	return pattern;
}

function processBuffer(buffer: Buffer, state: ChunkState) {
	for (let i = 0; i < buffer.length; i++) {
		const byte = buffer[i]!;
		state.chars++;
		state.hasAnyChar = true;
		if (!state.hasNonWhitespace && byte !== 32 && byte !== 9 && byte !== 13 && byte !== 10) {
			state.hasNonWhitespace = true;
		}
		if (byte === 10) {
			state.lines++;
			if (!state.hasNonWhitespace) state.blankLines++;
			state.hasNonWhitespace = false;
			state.endedWithNewline = true;
		} else if (byte === 13) {
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

function updateDirHash(filePath: string, fileHash: string, state: ScanState, root: DirNode) {
	let currentDir = path.dirname(filePath);
	while (true) {
		let hash = state.dirHashState.get(currentDir);
		if (!hash) {
			hash = createHash("sha1");
			state.dirHashState.set(currentDir, hash);
		}
		hash.update(fileHash, "utf-8");
		if (currentDir === root.path) break;
		currentDir = path.dirname(currentDir);
	}
}
