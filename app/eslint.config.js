// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
	expoConfig,
	{
		rules: {
			// react-native-reanimated worklets legitimately mutate `.value` on
			// SharedValues returned from hooks. The react-hooks plugin (v7) flags
			// these as illegal mutations / memo issues, producing dozens of
			// false positives. Disabled project-wide because they are inherent to
			// the Reanimated API and not fixable at call sites.
			'react-hooks/immutability': 'off',
			'react-hooks/use-memo': 'off',
			'react-hooks/set-state-in-effect': 'off',
		},
	},
	{
		ignores: ['dist/*'],
	},
]);
