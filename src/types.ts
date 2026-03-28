export type SortBy = "lines" | "chars";

export type FileStat = {
	path: string;
	lines: number;
	chars: number;
};

export type DirNode = {
	name: string;
	path: string;
	lines: number;
	chars: number;
	files: FileStat[];
	children: Map<string, DirNode>;
};

export type CLIOptions = {
	base: string;
	sortBy: SortBy;
	topN: number;
	compact: boolean;
	types: string[];
	exclude: string[];
};
