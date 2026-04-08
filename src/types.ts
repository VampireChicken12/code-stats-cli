import type { FileStat } from "@/src/utils/cache";

export type CliFlagsFromOptions<T> = {
	[K in keyof T]-?: {
		alias?: string;
		default: T[K];
		description: string;
		type: FlagType<T[K]>;
	};
};
export type DirNode = {
	children: Map<string, DirNode>;
	files: FileStat[];
	isBase?: boolean;
	name: string;
	parent?: DirNode;
	path: string;
	totals: FileStats & {
		dirs: number;
		files: number;
	};
};
export type FileStats = {
	blankLines: number;
	bytes: number;
	chars: number;
	codeLines: number;
	lines: number;
};
// Makes all keys required but allows for optional values
export type Optional<T> = Record<keyof T, T[keyof T]>;
type FlagType<T> = T extends number ? NumberConstructor : T extends boolean ? BooleanConstructor : StringConstructor;
