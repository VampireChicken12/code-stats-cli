import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

import { benchmark, logger } from "@/src/cli";

export const fileStatSchema = z.object({
	blankLines: z.number(),
	bytes: z.number(),
	cachedAt: z.number(),
	chars: z.number(),
	codeLines: z.number(),
	followSymlinks: z.boolean().default(false),
	hash: z.string(),
	includeHidden: z.boolean().default(false),
	language: z.string(),
	lines: z.number(),
	mtimeMs: z.number(),
	path: z.string()
});

export const dirCacheSchema = z.object({
	cachedAt: z.number(),
	hash: z.string(),
	languages: z.array(z.string()),
	mtimeMs: z.number()
});

export const cacheSchema = z.object({
	dirs: z.record(z.string(), dirCacheSchema),
	files: z.record(z.string(), fileStatSchema),
	meta: z.object({
		createdAt: z.number().default(Date.now()),
		maxAgeMs: z.number().default(24 * 60 * 60 * 1000),
		version: z.number().default(1)
	})
});
export type Cache = z.infer<typeof cacheSchema>;
export type CacheDir = z.infer<typeof dirCacheSchema>;
export type CacheEntry = z.infer<typeof fileStatSchema>;
export type FileStat = CacheEntry;
const CACHE_FILE = ".code-stats-cache.json";

export function clearCache(cwd: string): void {
	const filePath = path.join(cwd, CACHE_FILE);
	fs.writeFileSync(
		filePath,
		JSON.stringify({ dirs: {}, files: {}, meta: { createdAt: Date.now(), maxAgeMs: 24 * 60 * 60 * 1000, version: 1 } } satisfies Cache, null, 2),
		"utf-8"
	);
}
export async function getDirMtime(dir: string): Promise<number> {
	const entries = await fs.promises.readdir(dir, { withFileTypes: true });
	let max = 0;

	for (const e of entries) {
		const full = path.join(dir, e.name);
		const stat = await fs.promises.stat(full);
		if (stat.mtimeMs > max) ({ mtimeMs: max } = stat);
	}

	return max;
}
export function isDirCacheValid(dir: CacheDir | undefined, stat: fs.Stats, languages: Set<string>, allowAll: boolean, maxAgeMs: number): boolean {
	if (!dir) return false;
	if (dir.mtimeMs !== stat.mtimeMs) return false;
	if (isExpired(dir.cachedAt, maxAgeMs)) return false;

	if (allowAll) return dir.languages.includes("all");

	return languages.size === dir.languages.length && [...languages].every((l) => dir.languages.includes(l));
}
export function isExpired(cachedAt: number, maxAgeMs: number): boolean {
	return Date.now() - cachedAt > maxAgeMs;
}

export function isFileCacheValid(file: FileStat | undefined, stat: fs.Stats, maxAgeMs: number): boolean {
	if (!file) return false;
	if (file.mtimeMs !== stat.mtimeMs) return false;
	if (isExpired(file.cachedAt, maxAgeMs)) return false;
	return true;
}

export async function loadCache(cwd: string): Promise<Cache> {
	const filePath = path.join(cwd, CACHE_FILE);
	if (!fs.existsSync(filePath)) return { dirs: {}, files: {}, meta: { createdAt: Date.now(), maxAgeMs: 24 * 60 * 60 * 1000, version: 1 } };

	try {
		const raw = fs.readFileSync(filePath, "utf-8");
		const parsed: unknown = JSON.parse(raw);
		const cache = cacheSchema.parse(parsed);
		await benchmark.run("pruning cache", () => pruneCache(cache));
		return cache;
	} catch (err) {
		logger.warn("Cache invalid or corrupt, ignoring.", err);
		return { dirs: {}, files: {}, meta: { createdAt: Date.now(), maxAgeMs: 24 * 60 * 60 * 1000, version: 1 } };
	}
}
export function pruneCache(cache: Cache) {
	const now = Date.now();
	const {
		meta: { maxAgeMs }
	} = cache;

	for (const [path, file] of Object.entries(cache.files)) {
		if (now - file.cachedAt > maxAgeMs) {
			delete cache.files[path];
		}
	}

	for (const [dir, d] of Object.entries(cache.dirs)) {
		if (now - d.cachedAt > maxAgeMs) {
			delete cache.dirs[dir];
		}
	}
}
export function saveCache(cwd: string, cache: Cache): void {
	if (!cache.meta) {
		cache.meta = {
			createdAt: Date.now(),
			maxAgeMs: 24 * 60 * 60 * 1000,
			version: 1
		};
	}

	cache.meta = {
		createdAt: cache.meta.createdAt ?? Date.now(),
		maxAgeMs: cache.meta.maxAgeMs ?? 24 * 60 * 60 * 1000,
		version: cache.meta.version ?? 1
	};

	pruneCache(cache);

	const filePath = path.join(cwd, CACHE_FILE);
	fs.writeFileSync(filePath, JSON.stringify(cache, null, 2), "utf-8");
}
