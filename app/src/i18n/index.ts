import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { SUPPORTED_LOCALES, detectSystemLocale } from '@/i18n/locale';
import { resources } from '@/i18n/resources';

void i18n.use(initReactI18next).init({
	resources,
	lng: detectSystemLocale(),
	fallbackLng: 'en',
	supportedLngs: SUPPORTED_LOCALES,
	interpolation: {
		escapeValue: false,
	},
	returnNull: false,
});

export default i18n;
