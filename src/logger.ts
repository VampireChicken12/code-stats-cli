import type { Style } from "@/src/utils/style";

export interface LoggerOptions {
	quiet?: boolean;
	style?: Style;
	verbose?: boolean;
}

export type LogLevel = "debug" | "error" | "info" | "warn";

export class Logger {
	private quiet: boolean;
	private style?: Style;
	private verbose: boolean;

	constructor({ quiet = false, style, verbose = false }: LoggerOptions = {}) {
		this.quiet = quiet;
		this.verbose = verbose;
		this.style = style;
	}

	debug(...args: Parameters<typeof console.debug>) {
		if (!this.verbose || this.quiet) return;
		console.debug(...this.formatArgs("debug", args));
	}

	error(...args: Parameters<typeof console.error>) {
		console.error(...this.formatArgs("error", args));
	}

	info(...args: Parameters<typeof console.log>) {
		if (this.quiet) return;
		console.log(...this.formatArgs("info", args));
	}

	log(...args: Parameters<typeof console.log>) {
		if (this.quiet) return;
		console.log(...this.formatArgs("info", args));
	}

	setQuiet(quiet: boolean) {
		this.quiet = quiet;
		return this;
	}

	setStyle(style: Style) {
		this.style = style;
		return this;
	}

	warn(...args: Parameters<typeof console.warn>) {
		if (this.quiet) return;
		console.warn(...this.formatArgs("warn", args));
	}

	private formatArgs(level: LogLevel, args: unknown[]) {
		const styledArgs = args.map((arg) => {
			if (typeof arg !== "string") return arg;

			if (!this.style) return arg;

			switch (level) {
				case "debug":
					return this.style.dim(arg);
				case "error":
					return this.style.bold("❌  " + arg);
				case "warn":
					return this.style.bold("⚠️  " + arg);
				case "info":
				default:
					return arg;
			}
		});

		return [...styledArgs];
	}
}
