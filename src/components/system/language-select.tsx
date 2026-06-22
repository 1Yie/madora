import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppSettings } from '@/context/app-settings-provider';
import type { LocalePreference } from '@/i18n/locale';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';

const FIXED_LANGUAGE_LABELS = {
	en: 'English',
	ja: '日本語',
	ko: '한국어',
	'zh-CN': '简体中文',
} as const;

type LanguageSelectProps = {
	ariaLabel?: string;
	includeSystem?: boolean;
	triggerClassName?: string;
};

export function LanguageSelect({
	ariaLabel,
	includeSystem = true,
	triggerClassName,
}: LanguageSelectProps) {
	const { localePreference, setLocalePreference } = useAppSettings();
	const { t } = useTranslation();

	const options = useMemo(() => {
		const items: Array<{ label: string; value: LocalePreference }> = [];

		if (includeSystem) {
			items.push({
				label: t('language.options.system'),
				value: 'system',
			});
		}

		items.push(
			{ label: FIXED_LANGUAGE_LABELS['zh-CN'], value: 'zh-CN' },
			{ label: FIXED_LANGUAGE_LABELS.en, value: 'en' },
			{ label: FIXED_LANGUAGE_LABELS.ja, value: 'ja' },
			{ label: FIXED_LANGUAGE_LABELS.ko, value: 'ko' }
		);

		return items;
	}, [includeSystem, t]);

	const selectedLabel =
		options.find((option) => option.value === localePreference)?.label ??
		t('language.options.system');

	return (
		<Select
			value={localePreference}
			onValueChange={(value) => {
				if (!value) return;
				setLocalePreference(value as LocalePreference);
			}}
		>
			<SelectTrigger aria-label={ariaLabel} className={triggerClassName}>
				<SelectValue>{selectedLabel}</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{options.map((option) => (
					<SelectItem key={option.value} value={option.value}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
