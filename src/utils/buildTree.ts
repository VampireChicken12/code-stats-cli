import path from "node:path";

import type { FileStat } from "@/src/utils/cache";

import type { DirNode } from "../types";

export function createNode(name: string, fullPath: string, parent?: DirNode, isBase = false): DirNode {
	return {
		children: new Map(),
		files: [],
		isBase,
		name,
		parent,
		path: fullPath,
		totals: { blankLines: 0, bytes: 0, chars: 0, codeLines: 0, dirs: 0, files: 0, lines: 0 }
	};
}
export function insertFile(root: DirNode, file: FileStat, dirMap: Map<string, DirNode>) {
	const dirPath = path.dirname(file.path);
	let node = dirMap.get(dirPath);

	if (!node) {
		const parts = dirPath.split("/");
		let parentNode = root;
		// eslint-disable-next-line prefer-destructuring
		let currentPath = root.path;
		for (const part of parts) {
			currentPath = path.join(currentPath, part);
			if (!dirMap.has(currentPath)) {
				const newNode = createNode(part, currentPath, parentNode);
				parentNode.children.set(part, newNode);
				dirMap.set(currentPath, newNode);
			}
			parentNode = dirMap.get(currentPath)!;
		}
		node = parentNode;
	}

	// Insert file
	node.files.push(file);
	node.totals.files++;
	node.totals.lines += file.lines;
	node.totals.chars += file.chars;
	node.totals.codeLines += file.codeLines;
	node.totals.blankLines += file.blankLines;
	node.totals.bytes += file.bytes;

	for (let { parent: current } = node; current; { parent: current } = current) {
		current.totals.files++;
		current.totals.lines += file.lines;
		current.totals.chars += file.chars;
		current.totals.codeLines += file.codeLines;
		current.totals.blankLines += file.blankLines;
		current.totals.bytes += file.bytes;
	}
}
