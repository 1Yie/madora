const {
	createRunOncePlugin,
	withAndroidManifest,
	withDangerousMod,
	AndroidConfig: { Paths, Resources },
} = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const NSC_FILENAME = 'network_security_config.xml';
const NSC_TAG = 'network-security-config';

/**
 * Raw-IP-safe cleartext Network Security Config.
 *
 * The Madora sync server lives on the LAN and is reached by raw IP address
 * (e.g. ws://192.168.1.10:3210). Android's Network Security Config domain
 * rules do NOT match raw IP literals, so cleartext to a raw IP is governed
 * solely by <base-config>. We therefore permit cleartext at the base level.
 *
 * Why this plugin exists:
 *   - Debug builds get an injected, permissive NSC from the React Native
 *     gradle plugin, so ws:// "just works" in debug.
 *   - Release builds have no such injection. `usesCleartextTraffic="true"`
 *     alone is not reliably honored for raw-IP cleartext in release.
 *   - Once android:networkSecurityConfig is set, it takes precedence over
 *     usesCleartextTraffic, and <base-config cleartextTrafficPermitted>
 *     also covers raw IPs.
 */
const NSC_XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
`;

function addNetworkSecurityConfig(config) {
	return withAndroidManifest(config, (config) => {
		const application = config.modResults.manifest.application;
		if (!Array.isArray(application) || application.length === 0) {
			throw new Error('No <application> node found in AndroidManifest.xml');
		}

		const app = application[0];
		app.$ = app.$ || {};
		app.$.android = app.$.android || {};

		// networkSecurityConfig takes precedence over usesCleartextTraffic.
		// Keep usesCleartextTraffic="true" too, as a fallback for API < 24
		// where NSC is unavailable.
		app.$.android.usesCleartextTraffic = 'true';
		app.$.android.networkSecurityConfig = `@xml/${NSC_FILENAME.replace(
			/\.\w+$/,
			''
		)}`;

		return config;
	});
}

function writeNetworkSecurityConfigFile(config) {
	return withDangerousMod(config, [
		'android',
		async (config) => {
			const resourceFolder = await Paths.getResourceFolderAsync(
				config.modRequest.projectRoot
			);
			const xmlFolder = path.join(resourceFolder, 'xml');
			fs.mkdirSync(xmlFolder, { recursive: true });
			fs.writeFileSync(path.join(xmlFolder, NSC_FILENAME), NSC_XML);
		},
	]);
}

const withMadoraNetworkSecurityConfig = (config) =>
	writeNetworkSecurityConfigFile(addNetworkSecurityConfig(config));

module.exports = createRunOncePlugin(
	withMadoraNetworkSecurityConfig,
	'madora-network-security-config',
	'1.0.0'
);

// Exported for unit tests.
module.exports.NSC_FILENAME = NSC_FILENAME;
module.exports.NSC_TAG = NSC_TAG;
module.exports.NSC_XML = NSC_XML;
module.exports.addNetworkSecurityConfig = addNetworkSecurityConfig;
module.exports.writeNetworkSecurityConfigFile = writeNetworkSecurityConfigFile;
