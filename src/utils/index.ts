import path from "node:path";
import { z } from "zod";

export function assertNotAborted(signal: AbortSignal, message: string = "Aborted") {
	if (signal.aborted) throw new Error(message);
}
export function msToHumanReadable(ms: number) {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	const parts: string[] = [];

	if (days) parts.push(`${days}d`);
	if (hours % 24) parts.push(`${hours % 24}h`);
	if (minutes % 60) parts.push(`${minutes % 60}m`);
	if (seconds % 60) parts.push(`${seconds % 60}s`);

	const milliseconds = ms % 1000;
	if (parts.length === 0 && milliseconds) {
		parts.push(`${milliseconds.toFixed(2)}ms`);
	}

	return parts.join(" ") || "0ms";
}
export function resolveRootDir(start: string, levels?: number) {
	if (levels === undefined) return start;

	let current = path.resolve(start);

	for (let i = 0; i < levels; i++) {
		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}

	return current;
}
export const getNumberFormatter = (notation: Intl.NumberFormatOptions["notation"] = "standard") => {
	const formatter = new Intl.NumberFormat("en-US", { notation });
	return (n: number) => formatter.format(n);
};
export function formatZodErrors(err: z.ZodError, obj: unknown) {
	return err.issues
		.map((issue) => {
			const path = issue.path.length ? issue.path.join(".") : "root";
			// Resolve input value if undefined
			// eslint-disable-next-line prefer-destructuring -- destructuring unknown is unsafe
			let value = issue.input;
			if (value === undefined && issue.path.length > 0) {
				value = issue.path.reduce((acc, key) => {
					if (acc && typeof acc === "object") return acc[key as keyof typeof acc];
					return undefined;
				}, obj);
			}
			const displayValue = value !== undefined ? `: ${JSON.stringify(value)}` : "";

			// Build human-readable message per issue code
			let msg = "";
			switch (issue.code) {
				case "custom":
					msg = `Invalid value${displayValue}: ${issue.message || "Custom validation failed"}`;
					break;
				case "invalid_element":
					msg = `Invalid element at key ${JSON.stringify(issue.key)} in ${issue.origin}${displayValue}`;
					break;
				case "invalid_format":
					msg = `Invalid format${displayValue}: ${issue.format}${issue.pattern ? `, pattern: ${issue.pattern}` : ""}`;
					break;
				case "invalid_key":
					msg = `Invalid key in ${issue.origin}${displayValue}`;
					break;
				case "invalid_type":
					msg = `Invalid type${displayValue}, expected "${issue.expected}"`;
					break;
				case "invalid_union":
					msg = `No matching union type${displayValue}`;
					break;
				case "invalid_value":
					msg = `Invalid value${displayValue}, expected one of: ${issue.values.map((v) => `"${String(v)}"`).join(", ")}`;
					break;
				case "not_multiple_of":
					msg = `Must be a multiple of ${issue.divisor}${displayValue}`;
					break;
				case "too_big":
					msg = `Value too large${displayValue}${issue.exact ? "" : `, maximum: ${issue.maximum}`}`;
					break;
				case "too_small":
					msg = `Value too small${displayValue}${issue.exact ? "" : `, minimum: ${issue.minimum}`}`;
					break;
				case "unrecognized_keys":
					msg = `Unrecognized key(s): ${issue.keys.map((k) => `"${k}"`).join(", ")}${displayValue}`;
					break;
			}

			return `   ${path}: ${msg}`;
		})
		.join("\n");
}
