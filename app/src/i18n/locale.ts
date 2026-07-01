export const SUPPORTED_LOCALES = ['zh-CN', 'en', 'ja', 'ko'] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

const SUPPORTED_LOCALE_SET = new Set<AppLocale>(SUPPORTED_LOCALES);

export function isSupportedLocale(
	value: string | null | undefined
): value is AppLocale {
	return (
		value !== null &&
		value !== undefined &&
		SUPPORTED_LOCALE_SET.has(value as AppLocale)
	);
}

export function normalizeLocale(
	value: string | null | undefined
): AppLocale | null {
	if (!value) return null;

	const normalized = value.trim().toLowerCase();

	if (normalized.startsWith('zh')) return 'zh-CN';
	if (normalized.startsWith('en')) return 'en';
	if (normalized.startsWith('ja')) return 'ja';
	if (normalized.startsWith('ko')) return 'ko';

	return null;
}

export function detectSystemLocale(): AppLocale {
	const locale = Intl.DateTimeFormat().resolvedOptions().locale;
	return normalizeLocale(locale) ?? 'en';
}
