import fs from "node:fs/promises";
import path from "node:path";
import type { FileStat } from "../types";

export async function scanFiles(dir: string, types: string[], exclude: string[] = []): Promise<FileStat[]> {
	const results: FileStat[] = [];

	async function walk(current: string) {
		const entries = await fs.readdir(current, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = path.join(current, entry.name);

			// Skip excluded folders/files
			if (exclude.some((ex) => entry.name === ex)) continue;

			if (entry.isDirectory()) {
				await walk(fullPath);
			} else if (entry.isFile()) {
				const ext = path.extname(entry.name).replace(/^\./, "").toLowerCase();
				if (types.length === 0 || types.includes(ext)) {
					const content = await fs.readFile(fullPath, "utf-8");
					results.push({
						path: fullPath,
						lines: content.split(/\r?\n/).length,
						chars: content.length
					});
				}
			}
		}
	}

	await walk(dir);

	return results;
}
