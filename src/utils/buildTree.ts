import path from "node:path";
import type { DirNode, FileStat } from "../types";

export function createNode(name: string, fullPath: string): DirNode {
	return {
		name,
		path: fullPath,
		lines: 0,
		chars: 0,
		files: [],
		children: new Map()
	};
}

export function insertFile(root: DirNode, file: FileStat): void {
	const parts = file.path.split(path.sep);
	let current = root;

	for (let i = 0; i < parts.length - 1; i++) {
		const part = parts[i]!;
		const fullPath = parts.slice(0, i + 1).join(path.sep);

		if (!current.children.has(part)) {
			current.children.set(part, createNode(part, fullPath));
		}

		current = current.children.get(part)!;
		current.lines += file.lines;
		current.chars += file.chars;
	}

	current.files.push(file);
}
