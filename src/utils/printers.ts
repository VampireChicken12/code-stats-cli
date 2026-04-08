import { detectLanguage } from "file-lang";
import fs from "node:fs";
import path from "node:path";

import type { DirNode, FileStats } from "@/src/types";
import type { FileStat } from "@/src/utils/cache";

import { logger } from "@/src/cli";
import { getNumberFormatter } from "@/src/utils";
import { Style } from "@/src/utils/style";

import { type CodeStatsConfig } from "./config";
import { sortFiles, sortNodes } from "./sortUtils";
// eslint-disable-next-line no-control-regex
const ANSI_FULL_REGEX = /[\u001B\u009B][[\]()#;?]*(?:\d{1,4}(?:;\d{0,4})*)?[0-9A-ORZcf-nqry=><]|\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g;

type GroupStats = FileStats & { count: number };
type TreePrintNodeParams = {
	depth: number;
	isLast: boolean;
	node: DirNode;
	prefix: string;
	rootChars: number;
	rootLines: number;
};
const formatter = getNumberFormatter("standard");
export abstract class Printer {
	constructor(
		public config: CodeStatsConfig,
		public style: Style
	) {}
	formatBytes(bytes: number) {
		if (bytes < 1024) return `${bytes}B`;
		if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)}KB`;
		if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)}MB`;
		return `${(bytes / 1024 ** 3).toFixed(2)}GB`;
	}
	formatCodeAndBlank(code: number, blank: number, compact: boolean) {
		const codeLabel = this.style.dim(compact ? "C:" : "Code:");
		const blankLabel = this.style.dim(compact ? "B:" : "Blank:");
		const codeStr = formatter(code);
		const blankStr = formatter(blank);
		return `${this.style.dim("[")}${codeLabel} ${codeStr}, ${blankLabel} ${blankStr}${this.style.dim("]")}`;
	}
	abstract print(files: FileStat[], rootNode: DirNode): void;
	protected formatFileStats(file: FileStat, totalLines: number, totalChars: number) {
		const sizeStr = this.formatBytes(file.bytes ?? 0);
		const blank = file.blankLines ?? 0;
		const code = file.codeLines ?? file.lines - blank;

		const linePct = totalLines ? this.formatPercent(file.lines, totalLines) : "0.0";
		const charPct = totalChars ? this.formatPercent(file.chars, totalChars) : "0.0";

		const lineStr = `${this.style.lines(file.lines)} ${`(${linePct})`}`;
		const charStr = `${this.style.chars(file.chars)} ${`(${charPct})`}`;
		const codeStr = this.formatCodeAndBlank(code, blank, this.config.compact ?? false);

		const compactData = `(L: ${lineStr} ${codeStr}, C: ${charStr}, S: ${sizeStr})`;
		const fullData = `(Lines: ${lineStr} ${codeStr}, Chars: ${charStr}, Size: ${sizeStr})`;

		return this.config.compact ? compactData : fullData;
	}

	protected formatNodeStats(node: DirNode, totalLines: number, totalChars: number) {
		const { totals: t } = node;
		const sizeStr = this.formatBytes(t.bytes ?? 0);
		const blank = t.blankLines ?? 0;
		const code = t.codeLines ?? t.lines - blank;

		const linePct = totalLines ? this.formatPercent(t.lines, totalLines) : "0.0";
		const charPct = totalChars ? this.formatPercent(t.chars, totalChars) : "0.0";

		const lineStr = `${this.style.lines(t.lines)} ${`(${linePct})`}`;
		const charStr = `${this.style.chars(t.chars)} ${`(${charPct})`}`;
		const codeStr = this.formatCodeAndBlank(code, blank, this.config.compact ?? false);
		const filesStr = t.files ? (this.config.compact ? `, F: ${t.files}` : `, Files: ${t.files}`) : "";
		const dirsStr = t.dirs ? (this.config.compact ? `, D: ${t.dirs}` : `, Directories: ${t.dirs}`) : "";

		const compactData = `(L: ${lineStr} ${codeStr}, C: ${charStr}${filesStr}${dirsStr}, ${sizeStr})`;
		const fullData = `(Lines: ${lineStr} ${codeStr}, Chars: ${charStr}${filesStr}${dirsStr}, Size: ${sizeStr})`;

		return this.config.compact ? compactData : fullData;
	}
	protected formatPercent(value: number, total: number) {
		if (total === 0) return "0.0%";
		return `${((value / total) * 100).toFixed(3)}%`;
	}
	protected writeFile(content: string, ext: "csv" | "json") {
		const dir = path.resolve(process.cwd(), "code-stats");
		const filename = `code-stats-${this.getTimestamp()}.${ext}`;
		const fullPath = path.join(dir, filename);

		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		fs.writeFileSync(fullPath, content, "utf-8");

		logger.log(`Saved → ${fullPath}`);
	}

	private getTimestamp() {
		const d = new Date();
		const pad = (n: number) => String(n).padStart(2, "0");
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
	}
}

export class CSVPrinter extends Printer {
	print(files: FileStat[]) {
		const lines = ["Path,Lines,Code Lines,Blank Lines,Chars,Bytes"];
		for (const f of files) {
			const fields = [f.path, String(f.lines), String(f.codeLines), String(f.blankLines ?? 0), String(f.chars), String(f.bytes ?? "")];
			lines.push(fields.map((v) => (v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v)).join(","));
		}
		const content = lines.join("\n");
		if (this.config.saveCsv) {
			this.writeFile(content, "csv");
		} else {
			logger.log(content);
		}
	}
}
export class GroupPrinter extends Printer {
	constructor(
		config: CodeStatsConfig,
		public style: Style,
		private groupBy: CodeStatsConfig["groupBy"]
	) {
		super(config, style);
	}
	print(files: FileStat[], rootNode: DirNode) {
		switch (this.groupBy) {
			case "dir":
				return this.printGrouped(files, (f) => this.getDir(f.path, rootNode.path));
			case "ext":
				return this.printGrouped(files, (f) => this.getExt(f.path));
			case "lang":
				return this.printGrouped(files, (f) => this.getLanguage(this.getExt(f.path)));
			case "size":
				return this.printGrouped(files, (f) => this.getSizeGroup(f.bytes ?? 0));
			default:
				if (this.groupBy !== undefined) this.groupBy satisfies never;
		}
	}
	private getDir(filePath: string, rootNodePath: string) {
		let dir = path.dirname(filePath);
		if (dir === ".") return "root";

		// Make it relative to rootNodePath if possible
		if (rootNodePath && dir.startsWith(rootNodePath)) {
			dir = path.relative(rootNodePath, dir) || rootNodePath.split(path.sep).pop()!;
		}
		return dir;
	}
	private getExt(filePath: string) {
		return path.extname(filePath).slice(1).toLowerCase() || "none";
	}
	private getLanguage(ext: string) {
		return detectLanguage(ext);
	}
	private getSizeGroup(bytes: number) {
		if (bytes < 1024) return "<1KB";
		if (bytes < 1024 ** 2) return "1KB–1MB";
		if (bytes < 1024 ** 3) return "1MB–1GB";
		return ">1GB";
	}
	private groupFiles(files: FileStat[], keyFn: (f: FileStat) => string) {
		const map = new Map<string, GroupStats>();
		for (const file of files) {
			const key = keyFn(file);
			const current = map.get(key) ?? ({ blankLines: 0, bytes: 0, chars: 0, codeLines: 0, count: 0, lines: 0 } satisfies GroupStats);
			current.lines += file.lines;
			current.blankLines += file.blankLines;
			current.codeLines += file.codeLines;
			current.chars += file.chars;
			current.bytes += file.bytes ?? 0;
			current.count += 1;
			map.set(key, current);
		}
		return map;
	}
	private printGrouped(files: FileStat[], keyFn: (f: FileStat) => string) {
		const map = this.groupFiles(files, keyFn);
		const sorted = sortGroups(Array.from(map.entries()), this.config.sortBy, this.config.order);

		let totalLines = 0;
		let totalChars = 0;

		for (const file of files) {
			totalLines += file.lines;
			totalChars += file.chars;
		}
		const maxKeyLength = map.size ? Math.max(...[...map.keys()].map((k) => k.length)) : 0;

		for (const [key, stats] of sorted) {
			const sizeStr = this.formatBytes(stats.bytes);
			const blank = stats.blankLines ?? 0;
			const code = stats.codeLines ?? stats.lines - blank;

			const linePct = totalLines ? this.formatPercent(stats.lines, totalLines) : "0.0";
			const charPct = totalChars ? this.formatPercent(stats.chars, totalChars) : "0.0";

			const lineStr = `${this.style.lines(stats.lines)} ${`(${linePct})`}`;
			const charStr = `${this.style.chars(stats.chars)} ${`(${charPct})`}`;
			const codeStr = this.formatCodeAndBlank(code, blank, this.config.compact ?? false);
			const filesStr = stats.count ? (this.config.compact ? `, F: ${stats.count}` : `, Files: ${stats.count}`) : "";

			const compactOutput = `${key.padEnd(maxKeyLength)} → L: ${lineStr} ${codeStr} C: ${charStr}${filesStr}, S: ${sizeStr}`;
			const fullOutput = `${key.padEnd(maxKeyLength)} → Lines: ${lineStr} ${codeStr} Chars: ${charStr}${filesStr}, Size: ${sizeStr}`;

			logger.log(this.config.compact ? compactOutput : fullOutput);
		}
	}
}

export class JSONPrinter extends Printer {
	print(files: FileStat[], rootNode: DirNode) {
		const output = {
			files,
			root: rootNode
		};
		const content = this.config.pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output);
		if (this.config.saveJson) {
			this.writeFile(content, "json");
		} else {
			logger.log(content);
		}
	}
}
export class SummaryPrinter extends Printer {
	print(files: FileStat[], rootNode: DirNode) {
		const { length: totalFiles } = files;
		const {
			totals: { blankLines: totalBlankLines, bytes: totalBytes, chars: totalChars, codeLines: totalCodeLines, lines: totalLines }
		} = rootNode;

		logger.log(this.style.bold(`Files: ${formatter(totalFiles)}`));
		logger.log(this.style.bold(`Lines: ${formatter(totalLines)}`));
		logger.log(this.style.bold(`Code Lines: ${formatter(totalCodeLines)}`));
		logger.log(this.style.bold(`Blank Lines: ${formatter(totalBlankLines)}`));
		logger.log(this.style.bold(`Chars: ${formatter(totalChars)}`));

		if (totalBytes > 0) logger.log(this.style.bold(`Size: ${this.formatBytes(totalBytes)}`));
	}
}

export class TablePrinter extends Printer {
	private readonly COLS = {
		chars: 12,
		dirs: 12,
		files: 10,
		lines: 12,
		name: 40,
		size: 12
	};
	print(_files: FileStat[], rootNode: DirNode) {
		if (!rootNode) return;
		const nodes = this.flatten([rootNode], [], 0, this.config.depth);
		const sorted = sortNodes(nodes, this.config.sortBy, this.config.order);

		// Header
		logger.log(
			"Directory".padEnd(this.COLS.name) +
				"Lines".padStart(this.COLS.lines) +
				"Code Lines".padStart(this.COLS.lines) +
				"Blank Lines".padStart(this.COLS.lines) +
				"Chars".padStart(this.COLS.chars) +
				"Files".padStart(this.COLS.files) +
				"Directories".padStart(this.COLS.dirs) +
				"Size".padStart(this.COLS.size)
		);

		for (const node of sorted) {
			logger.log(
				node.name.padEnd(this.COLS.name) +
					formatter(node.totals.lines).padStart(this.COLS.lines) +
					formatter(node.totals.codeLines).padStart(this.COLS.lines) +
					formatter(node.totals.blankLines).padStart(this.COLS.lines) +
					formatter(node.totals.chars).padStart(this.COLS.chars) +
					String(node.totals.files).padStart(this.COLS.files) +
					String(node.totals.dirs).padStart(this.COLS.dirs) +
					this.formatBytes(node.totals.bytes ?? 0).padStart(this.COLS.size)
			);
		}
	}

	private flatten(nodes: DirNode[], acc: DirNode[] = [], currentDepth = 0, maxDepth?: number): DirNode[] {
		for (const node of nodes) {
			if (maxDepth !== undefined && maxDepth !== -1 && currentDepth > maxDepth) continue;
			acc.push(node);
			if (node.children.size > 0) this.flatten([...node.children.values()], acc, currentDepth + 1, maxDepth);
		}
		return acc;
	}
}
export class TopFilesPrinter extends Printer {
	print(files: FileStat[], rootNode: DirNode) {
		const sorted = sortFiles(files, this.config.sortBy, this.config.order).slice(0, this.config.topFiles);
		const {
			totals: { chars: totalChars, lines: totalLines }
		} = rootNode;
		logger.log("Top Files:");
		sorted.forEach((f, i) => {
			const displayPath = path.relative(rootNode.path, f.path);
			logger.log(`${i + 1}. ${displayPath} ${this.formatFileStats(f, totalLines, totalChars)}`);
		});
	}
}
export class TreePrinter extends Printer {
	private maxLabelWidth = 0;
	print(_files: FileStat[], rootNode: DirNode) {
		if (!rootNode) return;

		const {
			totals: { chars: rootChars, lines: rootLines }
		} = rootNode;

		this.maxLabelWidth = 0;
		this.computeMaxWidth(rootNode, "", true);

		this.printNode({
			depth: 0,
			isLast: true,
			node: rootNode,
			prefix: "",
			rootChars,
			rootLines
		});
	}
	private computeMaxWidth(node: DirNode, prefix: string, isLast: boolean) {
		const connector = prefix ? (isLast ? "└── " : "├── ") : "";
		const { name } = node;

		const full = `${prefix}${connector}${name}`;
		const { length: width } = stripAnsi(full);

		this.maxLabelWidth = Math.max(this.maxLabelWidth, width);

		const children = [...node.children.values()];
		const { files } = node;

		const newPrefix = prefix + (isLast ? "    " : "│   ");

		children.forEach((child, i) => {
			this.computeMaxWidth(child, newPrefix, i === children.length - 1 && files.length === 0);
		});

		files.forEach((file, i) => {
			const conn = i === files.length - 1 ? "└── " : "├── ";
			const fileFull = `${newPrefix}${conn}${path.basename(file.path)}`;
			const { length: fileWidth } = stripAnsi(fileFull);
			this.maxLabelWidth = Math.max(this.maxLabelWidth, fileWidth);
		});
	}
	private getMaxLeftWidth(node: DirNode, prefix = "", isLast = true): number {
		const connector = prefix ? (isLast ? "└── " : "├── ") : "";
		const current = prefix + connector + node.name;

		// eslint-disable-next-line prefer-destructuring
		let max = current.length;

		const children = [...node.children.values()];
		children.forEach((child, i) => {
			const newPrefix = prefix + (isLast ? "    " : "│   ");
			max = Math.max(max, this.getMaxLeftWidth(child, newPrefix, i === children.length - 1 && node.files.length === 0));
		});

		for (let i = 0; i < node.files.length; i++) {
			const conn = i === node.files.length - 1 ? "└── " : "├── ";
			const line = prefix + (isLast ? "    " : "│   ") + conn + path.basename(node.files[i]!.path);
			max = Math.max(max, line.length);
		}

		return max;
	}
	private padLabel(str: string): string {
		const { length: visible } = stripAnsi(str);
		return str + " ".repeat(Math.max(0, this.maxLabelWidth - visible));
	}
	private printNode({ depth, isLast, node, prefix, rootChars, rootLines }: TreePrintNodeParams) {
		const connector = prefix ? (isLast ? "└── " : "├── ") : "";

		const childrenSorted = sortNodes([...node.children.values()], this.config.sortBy, this.config.order);
		const children =
			this.config.perDirTopFiles && this.config.perDirTopFiles > 0 ? childrenSorted.slice(0, this.config.perDirTopFiles) : childrenSorted;

		let files = sortFiles(node.files, this.config.sortBy, this.config.order);
		if (this.config.perDirTopFiles && this.config.perDirTopFiles > 0) {
			files = files.slice(0, this.config.perDirTopFiles);
		}

		const displayName = node.isBase ? this.style.base(node.name) : this.style.dir(node.name);
		const label = `${prefix}${connector}${displayName}`;
		logger.log(`${this.padLabel(label)} ${this.formatNodeStats(node, rootLines, rootChars)}`);

		const newPrefix = prefix + (isLast ? "    " : "│   ");

		children.forEach((child, i) =>
			this.printNode({
				depth: depth + 1,
				isLast: i === children.length - 1 && files.length === 0,
				node: child,
				prefix: newPrefix,
				rootChars,
				rootLines
			})
		);

		files.forEach((file, i) => {
			const isLastFile = i === files.length - 1;
			const conn = isLastFile ? "└── " : "├── ";

			const stats = this.formatFileStats(file, rootLines, rootChars);

			const label = `${newPrefix}${conn}${this.style.file(path.basename(file.path))}`;
			logger.log(`${this.padLabel(label)} ${stats}`);
		});
	}
}
export function sortGroups(groups: Array<[string, GroupStats]>, sortBy: CodeStatsConfig["sortBy"] = "lines", order: CodeStatsConfig["order"]) {
	const dir = order === "asc" ? 1 : -1;
	return [...groups].sort((a, b) => {
		const [nameA, statsA] = a;
		const [nameB, statsB] = b;

		let result = 0;

		switch (sortBy) {
			case "blankLines":
				result = statsA.blankLines - statsB.blankLines;
				break;
			case "chars":
				result = statsA.chars - statsB.chars;
				break;
			case "codeLines":
				result = statsA.codeLines - statsB.codeLines;
				break;
			case "files":
				result = statsA.count - statsB.count;
				break;
			case "lines":
				result = statsA.lines - statsB.lines;
				break;
			case "name":
				result = nameA.localeCompare(nameB);
				break;
			case "size":
				result = statsA.bytes - statsB.bytes;
				break;
			default:
				sortBy satisfies never;
		}

		if (result === 0) result = nameA.localeCompare(nameB);

		return result * dir;
	});
}
export function stripAnsi(input: string): string {
	return input.replace(ANSI_FULL_REGEX, "");
}
