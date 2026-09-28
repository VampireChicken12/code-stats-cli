import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

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

type CacheBenchmark = { run: <T>(label: string, fn: () => T) => Promise<T> | T };
type CacheLogger = { warn: (...args: unknown[]) => void };

export async function cleanCacheAsync(cache: Cache, maxAgeMs?: number): Promise<Cache> {
	cache.meta.maxAgeMs = maxAgeMs ?? cache.meta.maxAgeMs;
	cache.meta.createdAt ??= Date.now();

	return new Promise((resolve) => {
		setImmediate(() => {
			try {
				pruneCache(cache);

				const now = Date.now();
				const deletedDirs = new Set<string>();

				for (const [dirPath, dirCache] of Object.entries(cache.dirs)) {
					if (!fs.existsSync(dirPath)) deletedDirs.add(dirPath);
					else if (cache.meta.maxAgeMs && dirCache?.cachedAt && now - dirCache.cachedAt > cache.meta.maxAgeMs) deletedDirs.add(dirPath);
				}

				for (const filePath of Object.keys(cache.files)) {
					for (const d of deletedDirs) {
						if (filePath === d || filePath.startsWith(d + path.sep)) {
							delete cache.files[filePath];
							break;
						}
					}
				}

				for (const dirPath of Object.keys(cache.dirs)) {
					for (const d of deletedDirs) {
						if (dirPath === d || dirPath.startsWith(d + path.sep)) {
							delete cache.dirs[dirPath];
							break;
						}
					}
				}

				for (const [dirPath, dirCache] of Object.entries(cache.dirs)) {
					const cachedFiles = Object.values(cache.files).filter((f) => f.path.startsWith(dirPath + path.sep));
					if (!cachedFiles.length) {
						delete cache.dirs[dirPath];
						continue;
					}

					const combinedHash = cachedFiles.map((f) => f.hash).join("");
					const hash = createHash("sha1").update(combinedHash).digest("hex");

					if (hash !== dirCache?.hash) {
						delete cache.dirs[dirPath];
					}
				}

				resolve(cache);
			} catch (err) {
				console.error("Error cleaning cache:", err);
				resolve(cache);
			}
		});
	});
}

export function clearCache(cwd: string): void {
	const filePath = path.join(cwd, CACHE_FILE);
	fs.writeFileSync(filePath, JSON.stringify(emptyCache(), null, 2), "utf-8");
}

export async function loadCache(cwd: string, logger?: CacheLogger, benchmark?: CacheBenchmark): Promise<Cache> {
	const filePath = path.join(cwd, CACHE_FILE);
	if (!fs.existsSync(filePath)) return emptyCache();

	try {
		const raw = fs.readFileSync(filePath, "utf-8");
		const parsed: unknown = JSON.parse(raw);
		const cache = cacheSchema.parse(parsed);
		if (benchmark) {
			await benchmark.run("pruning cache", () => pruneCache(cache));
		} else {
			pruneCache(cache);
		}
		return cache;
	} catch (err) {
		logger?.warn("Cache invalid or corrupt, ignoring.", err);
		return emptyCache();
	}
}

export function pruneCache(cache: Cache) {
	const now = Date.now();
	const {
		meta: { maxAgeMs }
	} = cache;

	for (const [filePath, file] of Object.entries(cache.files)) {
		if (now - file.cachedAt > maxAgeMs) {
			delete cache.files[filePath];
		}
	}

	for (const [dirPath, d] of Object.entries(cache.dirs)) {
		if (now - d.cachedAt > maxAgeMs) {
			delete cache.dirs[dirPath];
		}
	}
}

export function saveCache(cwd: string, cache: Cache): void {
	if (!cache.meta) {
		cache.meta = { createdAt: Date.now(), maxAgeMs: 24 * 60 * 60 * 1000, version: 1 };
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

function emptyCache(): Cache {
	return { dirs: {}, files: {}, meta: { createdAt: Date.now(), maxAgeMs: 24 * 60 * 60 * 1000, version: 1 } };
}
