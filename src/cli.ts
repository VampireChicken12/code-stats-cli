#!/usr/bin/env node
import { cancel, intro, isCancel, outro, spinner, text } from "@clack/prompts";
import { cli } from "cleye";
import { existsSync } from "node:fs";
import path from "node:path";

import { createNode, insertFile } from "./utils/buildTree";
import { printTree } from "./utils/printTree";
import { scanFiles } from "./utils/scanFiles";

type SortMode = "lines" | "chars";
const numberFormatter = new Intl.NumberFormat("en-US");
const argv = cli({
	name: "codestats",
	parameters: ["[path]"],
	flags: {
		chars: { type: Boolean, alias: "c" },
		top: { type: Number, alias: "n", default: 0 },
		types: { type: String, alias: "t", default: "" },
		exclude: { type: String, default: "" },
		quiet: { type: Boolean, alias: "q" }
	}
});

(async () => {
	intro("📊 Code stats");

	// ---------- PATH ----------
	let base = argv._[0] ?? ".";

	if (!base) {
		const input = await text({
			message: "Enter a directory to analyze:",
			placeholder: "./src",
			validate: (value) => {
				if (!value) return "Path is required";
				if (!existsSync(value)) return "Path does not exist";
			}
		});

		if (isCancel(input)) return cancel("Aborted");

		base = input;
	}

	base = path.resolve(base);

	// ---------- OPTIONS ----------
	const sortBy: SortMode = argv.flags.chars ? "chars" : "lines";
	const types = argv.flags.types
		.split(/[ ,]+/)
		.map((t) => t.trim())
		.filter(Boolean);
	const defaultExclude = ["node_modules", ".git"];

	const userExclude = argv.flags.exclude
		? argv.flags.exclude
				.split(/[ ,]+/)
				.map((e) => e.trim())
				.filter(Boolean)
		: [];

	const exclude = Array.from(new Set([...defaultExclude, ...userExclude]));
	// ---------- SPINNER ----------
	const s = spinner();
	const start = performance.now();

	try {
		s.start("Scanning files...");

		const files = await scanFiles(base, types, exclude);

		if (files.length === 0) {
			s.stop("No matching files found");
			outro("Nothing to analyze.");
			return;
		}

		s.message("Building tree...");

		const root = createNode(".", ".");

		for (const file of files) {
			insertFile(root, file);
			root.lines += file.lines;
			root.chars += file.chars;
		}

		s.stop("Analysis complete");

		console.log("");

		// ---------- OUTPUT ----------
		printTree(root, sortBy, argv.flags.quiet ?? false, argv.flags.top);

		console.log(
			`\nTOTAL → Files: ${numberFormatter.format(files.length)} Lines: ${numberFormatter.format(root.lines)} Chars: ${numberFormatter.format(
				root.chars
			)}`
		);

		const duration = (performance.now() - start).toFixed(0);
		outro(`✨ Done in ${duration}ms`);
	} catch (err) {
		s.stop("Error occurred");
		console.error(err);
		outro("❌ Failed");
		process.exit(1);
	}
})();
