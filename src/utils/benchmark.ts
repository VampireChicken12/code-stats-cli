import { msToHumanReadable } from "@/src/utils";

export type BenchmarkConfig = {
	enabled?: boolean;
};

export type BenchmarkEntry = {
	durationMs: number;
	label: string;
};

export class Benchmark {
	private enabled: boolean;
	private results: BenchmarkEntry[] = [];

	constructor(config?: BenchmarkConfig) {
		this.enabled = Boolean(config?.enabled);
	}

	clear(): void {
		this.results = [];
	}

	getResults(): BenchmarkEntry[] {
		return [...this.results];
	}

	printSummary(): void {
		if (!this.enabled || this.results.length === 0) return;

		console.log("\nBenchmark Summary:");

		const sorted = [...this.results].sort((a, b) => b.durationMs - a.durationMs);

		for (const { durationMs, label } of sorted) {
			console.log(`  ${label.padEnd(25)} ${msToHumanReadable(durationMs)}`);
		}
	}

	async run<T>(label: string, fn: () => Promise<T> | T): Promise<T> {
		if (!this.enabled) return await fn();

		const start = process.hrtime.bigint();
		const result = await fn();
		const end = process.hrtime.bigint();

		const durationMs = Number(end - start) / 1_000_000;

		this.results.push({ durationMs, label });

		return result;
	}
}
