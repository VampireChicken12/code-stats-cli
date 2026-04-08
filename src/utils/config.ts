import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

import type { Optional } from "@/src/types";

import { type CLI_argv, logger } from "@/src/cli";
import { formatZodErrors } from "@/src/utils";

export const formats = ["tree", "table", "summary"] as const;
export const groupBy = ["ext", "dir", "size", "lang"] as const;
export const sortBy = ["lines", "codeLines", "blankLines", "size", "chars", "files", "name"] as const;
export const severityMode = ["static", "percentile", "z-score"] as const;
export const order = ["asc", "desc"] as const;
export const configSchema = z.object({
	benchmark: z.boolean().default(false),
	clearCache: z.boolean().default(false),
	compact: z.boolean().default(false),
	concurrency: z.number().int().positive().optional(),
	csv: z.boolean().default(false),
	depth: z.number().int().min(-1).default(-1),
	enableSeverityColors: z.boolean().default(false),
	exclude: z.array(z.string()).default(["node_modules/**", ".git/**"]),
	followSymlinks: z.boolean().default(false),
	format: z.enum(formats).default("tree"),
	groupBy: z.enum(groupBy).optional(),
	ignore: z.array(z.string()).default([]),
	includeHidden: z.boolean().default(false),
	json: z.boolean().default(false),
	languages: z.array(z.string()).default(["javascript", "typescript"]),
	noColor: z.boolean().default(false),
	order: z.enum(order).default("desc"),
	perDirTopFiles: z.number().int().positive().optional(),
	pretty: z.boolean().default(false),
	quiet: z.boolean().default(false),
	rootLevels: z.number().int().optional(),
	saveCsv: z.boolean().default(false),
	saveJson: z.boolean().default(false),
	severityChars: z.string().optional(),
	severityLines: z.string().optional(),
	severityMode: z.enum(severityMode).default("static"),
	sortBy: z.enum(sortBy).optional(),
	summaryOnly: z.boolean().default(false),
	topFiles: z.number().int().positive().optional()
});

export type CodeStatsConfig = z.infer<typeof configSchema>;

export function loadConfig(cwd: string): null | Partial<CodeStatsConfig> {
	const configPath = path.join(cwd, ".code-statsrc");
	if (!fs.existsSync(configPath)) return null;

	let raw: unknown;
	try {
		raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
		return configSchema.partial().parse(raw);
	} catch (err) {
		if (err instanceof SyntaxError) {
			logger.error(`Invalid JSON in config file (.code-statsrc) at ${configPath}: ${(err as Error).message}`);
		} else if (err instanceof z.ZodError) {
			logger.error(`Invalid values in config file (.code-statsrc) at ${configPath}:`);
			logger.error(formatZodErrors(err, raw as object));
		} else {
			logger.error(`Unexpected error reading config file (.code-statsrc):`, err);
		}
		process.exit(1);
	}
}
export const defaultConfig = {
	benchmark: false,
	clearCache: false,
	compact: false,
	concurrency: undefined,
	csv: false,
	depth: -1,
	enableSeverityColors: false,
	exclude: ["node_modules/**", ".git/**"],
	followSymlinks: false,
	format: "tree",
	groupBy: undefined,
	ignore: [],
	includeHidden: false,
	json: false,
	languages: ["javascript", "typescript"],
	noColor: false,
	order: "desc",
	perDirTopFiles: undefined,
	pretty: false,
	quiet: false,
	rootLevels: undefined,
	saveCsv: false,
	saveJson: false,
	severityChars: "20000,100000,500000",
	severityLines: "1000,5000,15000",
	severityMode: "static",
	sortBy: "lines",
	summaryOnly: false,
	topFiles: undefined
} as const satisfies Optional<CodeStatsConfig>;
type ConfigSource = {
	defaults: CodeStatsConfig;
	final: CodeStatsConfig;
	user: Partial<CodeStatsConfig>;
};
export function buildConfig(file: Partial<CodeStatsConfig>, cli: Partial<CodeStatsConfig>): ConfigSource {
	const final = mergeConfig(file, cli, defaultConfig);
	const user = mergeConfig(file, cli, {});
	return {
		defaults: defaultConfig,
		final,
		user
	};
}

export function mergeConfig(config: Partial<CodeStatsConfig>, cli: Partial<CodeStatsConfig>, defaults: Partial<CodeStatsConfig>): CodeStatsConfig {
	const merged: CodeStatsConfig = { ...defaults } as CodeStatsConfig;
	const assignDefined = <K extends keyof CodeStatsConfig>(target: CodeStatsConfig, source: Partial<CodeStatsConfig>, keys: K[]) => {
		for (const key of keys) {
			if (source[key] !== undefined) target[key] = source[key] as CodeStatsConfig[K];
		}
	};

	const nonArrayKeys = (Object.keys(defaults) as (keyof CodeStatsConfig)[]).filter((k) => k !== "exclude" && k !== "ignore");

	assignDefined(merged, config, nonArrayKeys);
	assignDefined(merged, cli, nonArrayKeys);

	merged.exclude = [...(defaults.exclude ?? []), ...(config.exclude ?? []), ...(cli.exclude ?? [])].filter(Boolean);
	merged.ignore = [...(defaults.ignore ?? []), ...(config.ignore ?? []), ...(cli.ignore ?? [])].filter(Boolean);

	return configSchema.parse(merged);
}
export function parseCLIFlags(argv: CLI_argv): CodeStatsConfig {
	const normalized = normalizeCLI(argv);
	try {
		return configSchema.parse(normalized);
	} catch (err) {
		if (err instanceof z.ZodError) {
			logger.error("Invalid CLI options:");
			logger.error(formatZodErrors(err, normalized));
		} else {
			logger.error("Unexpected error while parsing CLI options:", err);
		}
		process.exit(1);
	}
}
export function userConfigHasKey<K extends keyof CodeStatsConfig>(key: K, config: Partial<CodeStatsConfig>) {
	return key in config && config[key] !== undefined;
}

function normalizeCLI(argv: CLI_argv) {
	return {
		benchmark: argv.flags.benchmark,
		clearCache: argv.flags.clearCache ?? false,
		compact: argv.flags.compact ?? false,
		concurrency: argv.flags.concurrency,
		csv: argv.flags.csv ?? false,
		depth: argv.flags.depth ?? -1,
		enableSeverityColors: argv.flags.enableSeverityColors,
		exclude: argv.flags.exclude
			? typeof argv.flags.exclude === "string"
				? argv.flags.exclude
						.split(/[ ,]+/)
						.filter(Boolean)
						.map((s) => s.trim())
				: argv.flags.exclude
			: [],
		followSymlinks: argv.flags.followSymlinks ?? false,
		format: argv.flags.format as CodeStatsConfig["format"],
		groupBy: argv.flags.groupBy as CodeStatsConfig["groupBy"],
		ignore: argv.flags.ignore
			? (typeof argv.flags.ignore === "string" ? argv.flags.ignore.split(/[ ,]+/).filter(Boolean) : argv.flags.ignore).map((s) => s.trim())
			: [],
		includeHidden: argv.flags.includeHidden ?? false,
		json: argv.flags.json ?? false,
		languages: argv.flags.languages
			? (typeof argv.flags.languages === "string" ? argv.flags.languages.split(/[ ,]+/).filter(Boolean) : argv.flags.languages).map((s) => s.trim())
			: [],
		noColor: argv.flags.noColor,
		order: argv.flags.order as CodeStatsConfig["order"],
		perDirTopFiles: argv.flags.perDirTopFiles,
		pretty: argv.flags.pretty ?? false,
		quiet: argv.flags.quiet ?? false,
		rootLevels: argv.flags.rootLevels,
		saveCsv: argv.flags.saveCsv ?? false,
		saveJson: argv.flags.saveJson ?? false,
		severityChars: argv.flags.severityChars,
		severityLines: argv.flags.severityLines,
		severityMode: argv.flags.severityMode,
		sortBy: argv.flags.sortBy as CodeStatsConfig["sortBy"],
		summaryOnly: argv.flags.summaryOnly ?? false,
		topFiles: argv.flags.topFiles
	} satisfies Optional<CodeStatsConfig>;
}
