declare module 'bun:test' {
	type TestCallback = () => void | Promise<void>;

	type Matchers<T> = {
		readonly not: Matchers<T>;
		readonly rejects: Matchers<unknown>;
		toBe(expected: T): void;
		toBeNull(): void;
		toBeUndefined(): void;
		toBeGreaterThanOrEqual(expected: number): void;
		toHaveLength(expected: number): void;
		toThrow(expected?: string | RegExp): void;
		toContain(expected: unknown): void;
		toEqual(expected: unknown): void;
		toMatchObject(expected: Record<string, unknown>): void;
	};

	export function describe(name: string, callback: TestCallback): void;
	export function expect<T>(actual: T): Matchers<T>;
	export function test(name: string, callback: TestCallback): void;
	export const mock: {
		module(name: string, factory: () => unknown): void;
	};

	export namespace expect {
		function any(value: unknown): unknown;
		function objectContaining(expected: Record<string, unknown>): unknown;
	}
}
