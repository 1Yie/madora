const upstreamTransformer = require('@expo/metro-config/babel-transformer');

function transform({ filename, options, src }) {
	if (filename.endsWith('.sql')) {
		return upstreamTransformer.transform({
			filename,
			options,
			src: `export default ${JSON.stringify(src)};`,
		});
	}

	return upstreamTransformer.transform({ filename, options, src });
}

module.exports = { transform };
