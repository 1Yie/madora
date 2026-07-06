const { getDefaultConfig } = require('expo/metro-config');
const { withNativewind } = require('nativewind/metro');
const fs = require('fs');
const path = require('path');

const config = getDefaultConfig(__dirname);
config.transformer = {
	...(config.transformer ?? {}),
	babelTransformerPath: require.resolve('./metro-sql-transformer'),
};
config.resolver.alias = {
	...(config.resolver.alias ?? {}),
	'@/assets': path.resolve(__dirname, 'assets'),
	'@': path.resolve(__dirname, 'src'),
};
config.resolver.assetExts = config.resolver.assetExts.filter(
	(ext) => ext !== 'sql'
);
config.resolver.sourceExts = [...config.resolver.sourceExts, 'sql'];
config.resolver.resolveRequest = (context, moduleName, platform) => {
	if (moduleName.endsWith('.sql') && moduleName.startsWith('.')) {
		const filePath = path.resolve(
			path.dirname(context.originModulePath),
			moduleName
		);

		if (fs.existsSync(filePath)) {
			return {
				filePath,
				type: 'sourceFile',
			};
		}
	}

	return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativewind(config, { inlineRem: 16 });
