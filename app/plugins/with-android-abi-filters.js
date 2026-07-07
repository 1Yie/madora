const {
	createRunOncePlugin,
	withAppBuildGradle,
} = require('@expo/config-plugins');
const process = require('node:process');

const ALLOWED_ABIS = new Set(['arm64-v8a', 'armeabi-v7a', 'x86_64']);
const GENERATED_START = '    // @generated begin madora-android-abi-splits';
const GENERATED_END = '    // @generated end madora-android-abi-splits';
const GENERATED_BLOCK_RE =
	/\n?\s*\/\/ @generated begin madora-android-abi-(?:filters|splits)[\s\S]*?\/\/ @generated end madora-android-abi-(?:filters|splits)\n?/g;

function parseAbis(value) {
	if (!value || value === 'universal') return [];

	const abis = String(value)
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);

	for (const abi of abis) {
		if (!ALLOWED_ABIS.has(abi)) {
			throw new Error(`Unsupported Android ABI: ${abi}`);
		}
	}

	return abis;
}

function removeGeneratedBlock(contents) {
	return contents.replace(GENERATED_BLOCK_RE, '\n');
}

function addAbiSplits(contents, abis) {
	const next = removeGeneratedBlock(contents);
	if (abis.length === 0) return next;

	const lines = next.split('\n');
	const androidBlockIndex = lines.findIndex((line) =>
		/^\s*android\s*\{/.test(line)
	);

	if (androidBlockIndex === -1) {
		throw new Error('Unable to find android block in android/app/build.gradle');
	}

	lines.splice(
		androidBlockIndex + 1,
		0,
		GENERATED_START,
		'    splits {',
		'        abi {',
		'            enable true',
		'            reset()',
		`            include ${abis.map((abi) => `"${abi}"`).join(', ')}`,
		'            universalApk false',
		'        }',
		'    }',
		GENERATED_END
	);

	return lines.join('\n');
}

const withAndroidAbiFilters = (config) =>
	withAppBuildGradle(config, (config) => {
		const abis = parseAbis(process.env.MADORA_APP_ANDROID_ABIS);

		if (config.modResults.language !== 'groovy') {
			throw new Error('Android ABI filters plugin only supports Groovy Gradle');
		}

		config.modResults.contents = addAbiSplits(config.modResults.contents, abis);
		return config;
	});

module.exports = createRunOncePlugin(
	withAndroidAbiFilters,
	'madora-android-abi-filters',
	'1.0.0'
);
