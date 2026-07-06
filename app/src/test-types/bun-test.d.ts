declare module 'bun:test' {
	type TestCallback = () => void | Promise<void>;

	type Matchers<T> = {
		readonly not: Matchers<T>;
		toBe(expected: T): void;
		toContain(expected: unknown): void;
		toEqual(expected: unknown): void;
		toMatchObject(expected: Record<string, unknown>): void;
	};

	export function describe(name: string, callback: TestCallback): void;
	export function expect<T>(actual: T): Matchers<T>;
	export function test(name: string, callback: TestCallback): void;

	export namespace expect {
		function any(value: unknown): unknown;
		function objectContaining(expected: Record<string, unknown>): unknown;
	}
}
