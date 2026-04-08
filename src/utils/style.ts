import type { CodeStatsConfig } from "@/src/utils/config";

import { getNumberFormatter } from "@/src/utils";

import { type SeverityLevels } from "./severity";

// 256-color foreground
type Ansi256Color = `38;5;${number}`;

type ForegroundCode = `${SGR};${Ansi256Color}` | Ansi256Color | SGR;

type SGR = "0" | "1" | "2" | "3" | "4" | "7" | "22" | "23" | "24" | "27";

const severityColors = {
	critical: "38;5;196", // red
	high: "38;5;214", // orange
	low: "38;5;82", // green
	medium: "38;5;226" // yellow
} as const;

const COLORS = {
	base: "38;5;34", // green
	dir: "38;5;33", // bright blue
	file: "38;5;226", // yellow
	severity: severityColors
} as const;
const formatter = getNumberFormatter("standard");
export class Style {
	constructor(
		private config: Partial<CodeStatsConfig>,
		private severity: {
			chars: SeverityLevels;
			lines: SeverityLevels;
		}
	) {}
	base(s: string) {
		return this.wrap(`1;${COLORS.base}`, s);
	}

	bold(s: string) {
		return this.wrap("1", s);
	}

	chars(n: number, padStart: number = 0) {
		const formatted = formatter(n).padStart(padStart);
		return this.config.enableSeverityColors ? this.wrap(this.getSeverityColor(n, this.severity.chars), formatted) : formatted;
	}

	dim(s: string) {
		return this.wrap("2", s);
	}

	dir(s: string) {
		return this.wrap(COLORS.dir, s);
	}

	file(s: string) {
		return this.wrap(COLORS.file, s);
	}
	getSeverityColor(v: number, levels: SeverityLevels) {
		const [medium, high, critical] = levels;
		if (v >= critical) return COLORS.severity.critical;
		if (v >= high) return COLORS.severity.high;
		if (v >= medium) return COLORS.severity.medium;
		return COLORS.severity.low;
	}

	lines(n: number, padStart: number = 0) {
		const formatted = formatter(n).padStart(padStart);
		return this.config.enableSeverityColors ? this.wrap(this.getSeverityColor(n, this.severity.lines), formatted) : formatted;
	}
	private wrap(code: ForegroundCode, s: string) {
		if (this.config.noColor) return s;
		return `\x1b[${code}m${s}\x1b[0m`;
	}
}
