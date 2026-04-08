import type { FileStat } from "@/src/utils/cache";
import type { CodeStatsConfig } from "@/src/utils/config";

import { logger } from "@/src/cli";

export type SeverityLevels = [number, number, number];

export function computeSeverity(files: FileStat[], config: CodeStatsConfig) {
	const lineValues = files.map((f) => f.lines);
	const charValues = files.map((f) => f.chars);

	let severityChars: SeverityLevels = [0, 0, 0],
		severityLines: SeverityLevels = [0, 0, 0];

	switch (config.severityMode) {
		case "percentile":
			severityLines = computeAutoSeverity(lineValues);
			severityChars = computeAutoSeverity(charValues);
			break;
		case "static":
			severityLines = parseSeverity(config.severityLines!);
			severityChars = parseSeverity(config.severityChars!);
			break;
		case "z-score":
			severityLines = computeZScoreSeverity(lineValues);
			severityChars = computeZScoreSeverity(charValues);
			break;
		default:
			config.severityMode satisfies never;
	}

	logger.info("📊 Severity Thresholds (" + config.severityMode + ")");
	logger.info(`(Lines): ${severityLines.join(" / ")}`);
	logger.info(`(Chars): ${severityChars.join(" / ")}\n`);

	return { severityChars, severityLines };
}

export function computeZScoreSeverity(values: number[]): SeverityLevels {
	if (values.length === 0) return [0, 0, 0];

	const mean = values.reduce((a, b) => a + b, 0) / values.length;
	const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
	const stdDev = Math.sqrt(variance);

	// Define thresholds: medium = mean + 0.5*std, high = mean + 1*std, critical = mean + 2*std
	const medium = mean + 0.5 * stdDev;
	const high = mean + 1 * stdDev;
	const critical = mean + 2 * stdDev;
	if (stdDev === 0) return [Math.round(mean), Math.round(mean) + 1, Math.round(mean) + 2] as SeverityLevels;
	// Ensure thresholds are integers
	return [Math.round(medium), Math.round(high), Math.round(critical)] as SeverityLevels;
}

export function parseSeverity(input: string): SeverityLevels {
	const parts = input
		.split(",")
		.map((n) => Number(n.trim()))
		.filter((n) => !Number.isNaN(n));

	if (parts.length !== 3) {
		throw new Error(`Severity must have exactly 3 values (got ${parts.length})`);
	}

	return parts as SeverityLevels;
}
function computeAutoSeverity(values: number[]): SeverityLevels {
	const levels: SeverityLevels = [
		percentile(values, 50), // median
		percentile(values, 75),
		percentile(values, 95)
	];

	return normalize(levels);
}
function normalize([a, b, c]: SeverityLevels): SeverityLevels {
	const min = 10;

	if (c === 0) return [min, min * 2, min * 4];
	if (c < min) {
		const scale = min / c;
		return [Math.round(a * scale), Math.round(b * scale), Math.round(c * scale)];
	}

	if (b >= c) c = b + 1;
	if (a >= b) b = a + 1;

	return [a, b, c];
}
function percentile(values: number[], p: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const idx = (p / 100) * (sorted.length - 1);
	const lower = Math.floor(idx);
	const upper = Math.ceil(idx);
	const weight = idx - lower;
	return Math.round(sorted[lower]! * (1 - weight) + sorted[upper]! * weight);
}
