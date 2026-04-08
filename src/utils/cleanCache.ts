import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { Cache, FileStat } from "./cache";

import { pruneCache } from "./cache";

/**
 * Cleans the cache asynchronously and reuses entire directories if possible.
 * Deletes files or directories that no longer exist, or are older than maxAgeMs.
 */
export async function cleanCacheAsync(cache: Cache, maxAgeMs?: number): Promise<Cache> {
	cache.meta.maxAgeMs = maxAgeMs ?? cache.meta.maxAgeMs;
	cache.meta.createdAt ??= Date.now();

	return new Promise((resolve) => {
		setImmediate(() => {
			try {
				pruneCache(cache);

				const now = Date.now();
				const deletedDirs = new Set<string>();
				const dirPaths = Object.keys(cache.dirs);

				// Step 1: Remove directories that no longer exist or are too old
				for (const dirPath of dirPaths) {
					const {
						dirs: { [dirPath]: dirCache }
					} = cache;
					if (!fs.existsSync(dirPath)) deletedDirs.add(dirPath);
					else if (cache.meta.maxAgeMs && dirCache && dirCache.cachedAt && now - dirCache.cachedAt > cache.meta.maxAgeMs) deletedDirs.add(dirPath);
				}

				// Step 2: Remove files inside deleted directories
				const filePaths = Object.keys(cache.files);
				for (const filePath of filePaths) {
					let isInDeletedDir = false;
					for (const d of deletedDirs) {
						if (filePath === d || filePath.startsWith(d + path.sep)) {
							isInDeletedDir = true;
							break;
						}
					}
					if (isInDeletedDir) {
						delete cache.files[filePath];
					}
				}

				// Step 3: Remove deleted directories from cache
				for (const dirPath of Object.keys(cache.dirs)) {
					let isInDeletedDir = false;
					for (const d of deletedDirs) {
						if (dirPath === d || dirPath.startsWith(d + path.sep)) {
							isInDeletedDir = true;
							break;
						}
					}
					if (isInDeletedDir) {
						delete cache.dirs[dirPath];
					}
				}

				// Step 4: Verify directory hashes
				for (const dirPath of Object.keys(cache.dirs)) {
					const {
						dirs: { [dirPath]: dirCache }
					} = cache;
					const cachedFiles: FileStat[] = Object.values(cache.files).filter((f) => f.path.startsWith(dirPath + path.sep));
					if (!cachedFiles.length) {
						delete cache.dirs[dirPath]; // no files left, remove dir cache
						continue;
					}

					// Compute combined hash of all files in this directory
					const combinedHash = cachedFiles.map((f) => f.hash).join("");
					const hash = createHash("sha1").update(combinedHash).digest("hex");

					// If directory hash changed, mark as dirty and remove cache
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
