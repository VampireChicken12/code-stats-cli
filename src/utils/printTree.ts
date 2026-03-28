import path from "path";
import type { DirNode, SortBy } from "../types";

function sortNodes(nodes: DirNode[], sortBy: SortBy): DirNode[] {
	return nodes.sort((a, b) => (sortBy === "lines" ? b.lines - a.lines : b.chars - a.chars));
}

function sortFiles(files: DirNode["files"], sortBy: SortBy) {
	return files.sort((a, b) => (sortBy === "lines" ? b.lines - a.lines : b.chars - a.chars));
}
const numberFormatter = new Intl.NumberFormat("en-US");
export function printTree(node: DirNode, sortBy: SortBy, compact: boolean, topN: number, prefix = "", isLast = true) {
	const connector = prefix ? (isLast ? "└── " : "├── ") : "";

	if (node.name !== ".") {
		console.log(
			`${prefix}${connector}${node.name} ${
				compact
					? `(L: ${numberFormatter.format(node.lines)} C: ${numberFormatter.format(node.chars)})`
					: `(Lines: ${numberFormatter.format(node.lines)}, Chars: ${numberFormatter.format(node.chars)})`
			}`
		);
	}

	// Gather children and files, sort them
	const children = sortNodes([...node.children.values()], sortBy);
	let files = sortFiles(node.files, sortBy);
	if (topN > 0) files = files.slice(0, topN);

	// Combine children + files to know if there's anything below
	const itemsBelow = [...children, ...files];
	if (!itemsBelow.length) return; // Nothing below, no continuation lines

	// Build new prefix only if there’s something below
	const newPrefix = prefix + (isLast ? "    " : "│   ");

	// Print child directories
	children.forEach((child, i) => {
		printTree(child, sortBy, compact, topN, newPrefix, i === children.length - 1 && files.length === 0);
	});

	// Print files
	files.forEach((file, i) => {
		const isLastFile = i === files.length - 1;
		const conn = isLastFile ? "└── " : "├── ";
		const name = path.basename(file.path);

		console.log(
			`${newPrefix}${conn}${name} ${
				compact
					? `(L: ${numberFormatter.format(file.lines)} C: ${numberFormatter.format(file.chars)})`
					: `(Lines: ${numberFormatter.format(file.lines)}, Chars: ${numberFormatter.format(file.chars)})`
			}`
		);
	});
}
