import type { DirNode } from "@/src/types";

import { type CodeStatsConfig } from "./config";

export function sortFiles(files: DirNode["files"], sortBy: CodeStatsConfig["sortBy"] = "lines", order: CodeStatsConfig["order"]) {
	const dir = order === "asc" ? 1 : -1;

	return [...files].sort((a, b) => {
		let result = 0;
		switch (sortBy) {
			case "blankLines":
				result = a.blankLines - b.blankLines;
				break;
			case "chars":
				result = a.chars - b.chars;
				break;
			case "codeLines":
				result = a.codeLines - b.codeLines;
				break;
			case "files":
				result = a.path.localeCompare(b.path);
				break;
			case "lines":
				result = a.lines - b.lines;
				break;
			case "name":
				result = a.path.localeCompare(b.path);
				break;
			case "size":
				result = a.bytes - b.bytes;
				break;
			default:
				sortBy satisfies never;
				break;
		}

		if (result === 0) {
			result = a.path.localeCompare(b.path);
		}
		return result * dir;
	});
}

export function sortNodes(nodes: DirNode[], sortBy: CodeStatsConfig["sortBy"] = "lines", order: CodeStatsConfig["order"]): DirNode[] {
	const dir = order === "asc" ? 1 : -1;

	return [...nodes].sort((a, b) => {
		switch (sortBy) {
			case "blankLines":
				return (a.totals.blankLines - b.totals.blankLines) * dir;
			case "chars":
				return (a.totals.chars - b.totals.chars) * dir;
			case "codeLines":
				return (a.totals.codeLines - b.totals.codeLines) * dir;
			case "files":
				return (a.totals.files - b.totals.files) * dir;
			case "lines":
				return (a.totals.lines - b.totals.lines) * dir;
			case "name":
				return a.name.localeCompare(b.name) * dir;
			case "size":
				return (a.totals.bytes - b.totals.bytes) * dir;
			default:
				sortBy satisfies never;
				return 0;
		}
	});
}
