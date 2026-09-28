import type { createHash } from "node:crypto";
import type fs from "node:fs";

import type { DirNode } from "@/src/types";
import type { Cache, FileStat } from "@/src/utils/cache";
import type { CodeStatsConfig } from "@/src/utils/config";

export type CollectedFile = {
	cached?: FileStat;
	fullPath: string;
	relativePath: string;
};

export type CollectorConfig = {
	exclude: string[];
	followSymlinks: boolean;
	ignore: string[];
	includeHidden: boolean;
	languages: string[];
};

export type CollectorProgress =
	| {
			currentDir: string;
			dirs: number;
			files: number;
			stage: "collect";
	  }
	| { stage: "done"; totalFiles: number };

export type ProcessorConfig = {
	exclude?: string[];
	followSymlinks: boolean;
	ignore?: string[];
	includeHidden: boolean;
	languages: string[];
	signal?: AbortSignal;
};

export type ProcessorProgress = {
	chars: number;
	completed: number;
	etaMs: number;
	lines: number;
	path: string;
	percentage: number;
	rate: number;
	stage: "process";
	total: number;
	totalChars: number;
	totalLines: number;
};

export type ScanConfig = CodeStatsConfig & {
	cache: Cache;
	signal?: AbortSignal;
};

export type ScanDeps = {
	benchmark?: { run: <T>(label: string, fn: () => T) => Promise<T> | T };
	fs?: typeof fs;
	logger?: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void };
};

export type ScanState = {
	cache: Cache;
	dirHashState: Map<string, ReturnType<typeof createHash>>;
	dirLanguagesMap: Map<string, Set<string>>;
	dirMap: Map<string, DirNode>;
	dirMtimeMap: Map<string, number>;
	processedFiles: number;
	results: FileStat[];
	seen: Set<string>;
	totalChars: number;
	totalLines: number;
};
