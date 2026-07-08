import { resolveFilePath } from './src/features/editor/services/local-file-system';

const androidRoot =
	'content://com.android.externalstorage.documents/tree/primary%3AWorkspace';
const androidFile =
	'content://com.android.externalstorage.documents/tree/primary%3AWorkspace/document/primary%3AWorkspace%2Fnotes%2Fintro.md';

console.log(
	'Android relative ./img/photo.png →',
	resolveFilePath('./img/photo.png', androidFile, androidRoot)
);
console.log(
	'Android absolute /img/photo.png →',
	resolveFilePath('/img/photo.png', androidFile, androidRoot)
);
console.log(
	'Android ../assets/logo.svg →',
	resolveFilePath('../assets/logo.svg', androidFile, androidRoot)
);

const iosRoot = 'file:///data/workspace';
const iosFile = 'file:///data/workspace/notes/intro.md';
console.log(
	'iOS relative ./img/photo.png →',
	resolveFilePath('./img/photo.png', iosFile, iosRoot)
);
console.log(
	'iOS absolute /img/photo.png →',
	resolveFilePath('/img/photo.png', iosFile, iosRoot)
);
console.log(
	'http (null) →',
	resolveFilePath('https://example.com/foo.png', iosFile, iosRoot)
);
