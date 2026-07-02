const { getDefaultConfig } = require('expo/metro-config');
const { withNativewind } = require('nativewind/metro');
const path = require('path');

const config = getDefaultConfig(__dirname);
config.resolver.alias = {
	...(config.resolver.alias ?? {}),
	'@/assets': path.resolve(__dirname, 'assets'),
	'@': path.resolve(__dirname, 'src'),
};

module.exports = withNativewind(config, { inlineRem: 16 });
