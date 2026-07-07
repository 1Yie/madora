const en = {
	common: {
		actions: {
			back: 'Back',
			cancel: 'Cancel',
			close: 'Close',
			delete: 'Delete',
			disconnect: 'Disconnect',
			discard: "Don't Save",
			refresh: 'Refresh',
			save: 'Save',
		},
		feedback: {
			error: 'Error',
			success: 'Success',
		},
		labels: {
			apiKey: 'API Key',
			apiUrl: 'API URL',
			author: 'Author',
			https: 'HTTPS',
			language: 'Language',
			model: 'Model',
			protocol: 'Protocol',
			provider: 'Provider',
			sourceCode: 'Source Code',
			version: 'Version',
			website: 'Website',
		},
		status: {
			ai: 'AI',
			authenticating: 'Authenticating',
			connected: 'Connected',
			connecting: 'Connecting',
			disconnected: 'Disconnected',
			discovering: 'Discovering',
			idle: 'Idle',
			pending: 'Pending',
			synced: 'Synced',
			syncing: 'Syncing',
			trusted: 'Trusted',
		},
	},
	language: {
		description:
			'Defaults to your device language. You can switch it here at any time.',
		label: 'Language',
		options: {
			en: 'English',
			ja: '日本語',
			ko: '한국어',
			system: 'Follow Device',
			zhCN: '简体中文',
		},
	},
	onboarding: {
		footnote:
			'You can change language, save behavior, sync, and AI providers later in Settings.',
		languageTitle: 'Choose a language',
		nextAction: 'Next',
		primaryAction: 'Enter workspace',
		skipAction: 'Skip',
		stepLabel: '{{current}} / {{total}}',
		taglineBottom: 'powered by AI',
		taglineTop: 'Markdown editing,',
		title: 'Welcome to Madora',
		controls: {
			manualSave: {
				description:
					'Show a save capsule and confirm unsaved workspace changes before leaving.',
				title: 'Manual Save',
			},
		},
		items: {
			ai: {
				detail:
					'Configure a local provider when you want inline completion while writing.',
				hint: 'Open Settings → AI to choose a provider, model, endpoint, and API key.',
				title: 'AI completion',
			},
			sync: {
				detail:
					'Pair with Madora desktop over your local network to browse remote workspaces.',
				hint: 'Open Settings → Sync, scan the desktop QR code, and reconnect later from the same page.',
				title: 'Desktop sync',
			},
			workspace: {
				detail:
					'Open a local folder, create Markdown files, and keep editing on device.',
				hint: 'Use the Files tab to choose a folder, create files, and switch between editor and preview.',
				title: 'Local workspace',
			},
		},
		ready: {
			detail:
				'You can revisit these choices any time from Settings. Start by opening a folder or pairing desktop sync.',
			title: 'Ready to write',
		},
		summary: {
			title: 'Selected settings',
		},
	},
	settings: {
		mobileHome: {
			description:
				'Configure theme and interface, typing behavior, sync, and product information.',
			detail: {
				about: 'Product version, links, updates, and open source licenses.',
				appearance: 'Language, theme mode, and editor text size.',
				editor: 'Auto save and inline AI completion settings.',
			},
		},
		openAria: 'Open settings',
		sections: {
			about: { description: 'Product and links', label: 'About' },
			appearance: {
				description: 'Theme and interface',
				label: 'Appearance',
			},
			ai: { description: 'Provider, model, and API key', label: 'AI' },
			editor: { description: 'Typing and editing', label: 'Editor' },
			sync: { description: 'Sync and configuration', label: 'Sync' },
		},
		ai: {
			apiKeyMissing: 'No key saved',
			apiKeySaved: 'Key saved',
			description:
				'Configure the provider used by editor inline completion. Provider credentials stay on this device.',
		},
		appearance: {
			cards: {
				accent: { title: 'Theme Accent' },
				editor: { title: 'Editor Pane' },
				language: {
					description:
						'Defaults to your device language and can be pinned to a specific language.',
					title: 'Language',
				},
				tabs: { title: 'Tabs' },
				theme: { title: 'Theme Mode' },
			},
			accentOptions: {
				amber: 'Amber',
				custom: 'Custom',
				cyan: 'Cyan',
				default: 'Default',
				description:
					'Follow the system, use the default theme, or choose a fixed accent color.',
				green: 'Green',
				indigo: 'Indigo',
				purple: 'Purple',
				red: 'Red',
				system: 'System',
			},
			editorTextSize: {
				description: 'Control Markdown editor text size.',
				label: 'Text Size',
				reset: 'Reset',
			},
			tabBar: {
				scroll: {
					description:
						'Keep every tab on a single row and reveal overflow through horizontal scrolling.',
					label: 'Single Row',
				},
				wrap: {
					description:
						'Wrap tabs onto multiple rows when they exceed the available width.',
					label: 'Wrap',
				},
			},
			theme: {
				dark: {
					description: 'Works well at night or during long reading sessions.',
					label: 'Dark',
				},
				light: {
					description: 'Better for bright environments.',
					label: 'Light',
				},
				system: {
					description: 'Match the current device or system setting.',
					label: 'System',
				},
			},
			zoomLevel: {
				label: 'Interface Zoom',
				large: 'Large',
				medium: 'Medium',
				small: 'Small',
			},
		},
		editor: {
			apiKeyHint: {
				existing:
					'An API key is already saved for this provider. Enter a new one to replace it.',
				missing: 'No API key has been saved for this provider yet.',
				storage:
					'The key is stored in system secure storage and only used for local requests.',
			},
			apiKeyPlaceholderSaved: 'Saved',
			apiUrlHint: 'Endpoint URL for the custom provider.',
			cards: {
				ai: { title: 'AI Completion' },
				input: { title: 'Typing Behavior' },
				window: { title: 'Window' },
			},
			closeBehavior: {
				exit: {
					description:
						'Quit the app when closing. Unsaved changes are confirmed first.',
					label: 'Quit App',
				},
				minimize: {
					description:
						'Hide the main window when closing. Madora keeps running from the tray icon.',
					label: 'Minimize to Tray',
				},
			},
			customConfigTitle: 'Custom Provider',
			customProtocolOptions: {
				anthropic: {
					description:
						'Use this for Anthropic-compatible /v1/messages endpoints.',
					label: 'Anthropic Compatible',
				},
				google: {
					description:
						'Use this for Google-compatible models/{id}:generateContent endpoints.',
					label: 'Google Compatible',
				},
				openai: {
					description:
						'Use this for OpenAI-compatible /v1/chat/completions endpoints.',
					label: 'OpenAI Compatible',
				},
			},
			customProtocolPlaceholder: 'Select a compatible protocol...',
			httpsHint:
				'Used automatically when no protocol is entered. Disable only for self-hosted services.',
			modelHintCustom:
				'Enter the model name directly. Refer to your provider for capability differences.',
			modelPlaceholder: 'Select a model...',
			providerHint:
				'Each provider keeps its own API key and model settings. Switching providers does not overwrite the others.',
			rows: {
				autoSave: {
					description: 'Write editor changes back to disk automatically.',
					title: 'Auto Save',
				},
				enableAi: {
					description: 'Request inline completions automatically while typing.',
					title: 'Enable AI Completion',
				},
				hiddenFiles: {
					prefix: 'Show files and folders in the sidebar that start with',
					suffix: '.',
					title: 'Show Hidden Files',
				},
			},
			toasts: {
				apiKeyDeleted: 'API key removed from system secure storage',
				apiKeyDeleteFailed: 'Failed to remove API key',
				apiKeyRequired: 'Please enter the API key first',
				apiKeySaved: 'API key saved to system secure storage',
				apiKeySaveFailed: 'Failed to save API key',
			},
		},
		about: {
			actions: {
				check: 'Check for Updates',
				viewRelease: 'View Release',
			},
			cards: {
				licenses: {
					description:
						'Review the open source dependencies and licenses used by Madora.',
					title: 'Open Source Licenses',
				},
				update: {
					description:
						'Checks the latest release before you download a new build.',
					title: 'Software Update',
				},
			},
			currentVersionDescription: '{{version}}',
			stats: {
				author: 'Author',
				sourceCode: 'Source Code',
				version: 'Version',
				website: 'Website',
			},
		},
	},
	tabs: {
		ai: 'AI',
		devices: 'Devices',
		fileTree: 'Files',
		settings: 'Settings',
		workspace: 'Workspace',
	},
	fileTree: {
		actions: {
			bookmark: 'Bookmark',
			cancelCopy: 'Cancel copy',
			delete: 'Delete',
			locateCurrent: 'Locate current file',
			newFolder: 'New folder',
			newFile: 'New file',
			openFile: 'Open file',
			openFolder: 'Open folder',
			refresh: 'Refresh files',
			removeBookmark: 'Remove bookmark',
		},
		bookmarks: 'Bookmarks',
		copyBanner: {
			title: 'Ready to paste "{{name}}"',
		},
		delete: {
			detail: 'Delete "{{name}}" from this workspace?',
			title: 'Delete item',
		},
		detail: 'Local files and folders',
		tabs: {
			local: 'Local folder',
			remote: 'Remote folder',
		},
		empty: {
			detail: 'Open a local folder to browse and create files here.',
			title: 'No folder selected',
		},
		remoteDisconnected: {
			action: 'Open sync settings',
			detail:
				'Remote sync is disconnected. Reconnect or pair with the desktop app to browse remote files again.',
			title: 'Remote sync disconnected',
		},
		remoteNotConnected: {
			action: 'Open sync settings',
			detail: 'Connect to the desktop app to browse remote folders.',
			title: 'Not connected to desktop',
		},
		remoteEmpty: {
			detail: 'The desktop workspace has no files to show right now.',
			title: 'Remote folder is empty',
		},
		feedback: {
			copyCanceledDetail: 'The copied file was cleared.',
			copyCanceledTitle: 'Copy canceled',
			copyReadyDetail: '"{{name}}" can now be pasted into a folder.',
			copyReadyTitle: 'File copied',
			locatedDetail: 'The file tree is focused on the current file.',
			locatedTitle: 'Current file located',
			locateUnavailableDetail: 'Open or select a file first.',
			locateUnavailableTitle: 'Nothing to locate',
			pastedDetail: 'The copied file was added to the selected folder.',
			pastedTitle: 'File pasted',
			refreshedDetail: 'The visible file tree has been reloaded.',
			refreshedTitle: 'Files refreshed',
		},
		title: 'File tree',
	},
	workspace: {
		actions: {
			connectDesktop: 'Connect Desktop',
			openRemote: 'Open Remote',
		},
		empty: {
			detail: 'Open a local folder to browse and create files here.',
			title: 'No folder selected',
		},
		feedback: {
			savedDetail: 'File saved to disk.',
			savedTitle: 'Saved',
		},
		noSelection: {
			detail: 'Go to the Files tab to pick or create a file.',
			title: 'No file selected',
		},
		remoteNoSelection: {
			detail: 'Go to the remote folder and select a file.',
			title: 'No remote file selected',
		},
		remoteFallbackName: 'Desktop workspace',
		unsavedChanges: {
			cancel: 'Keep Editing',
			continueSwitch: 'Continue Switching',
			detail:
				'Some files in the workspace have unsaved changes. Save before leaving?',
			discard: 'Leave Without Saving',
			save: 'Save and Leave',
			switchDetail:
				'Some files in the workspace have unsaved changes. Continuing will switch views without saving them.',
			title: 'Unsaved Changes',
		},
	},
	settingsHome: {
		detail:
			'Manage editor behavior, appearance, AI providers, and app information.',
		eyebrow: 'Settings',
		sections: {
			ai: {
				detail: 'Providers, models, API URL, API keys, and inline completion.',
				title: 'AI',
			},
			appearance: {
				detail: 'Theme, status bar, and floating tab presentation.',
				title: 'Appearance',
			},
			about: {
				detail: 'Madora version, capabilities, and local-first behavior.',
				title: 'About',
			},
			editor: {
				detail: 'CodeMirror, wrapping, Markdown toolbar, and editing behavior.',
				title: 'Editor',
			},
		},
		title: 'Settings',
	},
	settingsDetail: {
		about: {
			detail:
				'Madora keeps editing, preview, and AI provider calls local first.',
			items: {
				desktopParity: {
					detail: 'Mobile is being brought in line with desktop capabilities.',
					title: 'Desktop parity',
				},
				localFirst: {
					detail:
						'Drafts and provider settings stay on device. API keys use secure storage.',
					title: 'Local first',
				},
				product: {
					detail: 'Markdown editing, preview, sync, and AI completion.',
					title: 'Madora',
				},
			},
			title: 'About',
		},
		appearance: {
			detail:
				'System theme and transparent status bar are active. Style controls will live here.',
			items: {
				floatingTabs: {
					detail: 'Primary navigation is grouped in the bottom-right capsule.',
					title: 'Floating tabs',
				},
				systemTheme: {
					detail: 'Follows the system light or dark mode.',
					title: 'System theme',
				},
				transparentStatusBar: {
					detail:
						'Workspace content extends into the status bar; the editor handles top safe spacing internally.',
					title: 'Transparent status bar',
				},
			},
			title: 'Appearance',
		},
		editor: {
			detail:
				'The editor uses CodeMirror and preserves the mobile keyboard toolbar flow.',
			items: {
				codeMirror: {
					detail:
						'The Markdown editing surface is backed by the CodeMirror WebView.',
					title: 'CodeMirror',
				},
				lineWrapping: {
					detail: 'Long lines wrap inside the editing area.',
					title: 'Line wrapping',
				},
				markdownToolbar: {
					detail:
						'When the keyboard is shown, the bottom tabs become Markdown actions.',
					title: 'Markdown toolbar',
				},
			},
			title: 'Editor',
		},
		values: {
			enabled: 'Enabled',
			followSystem: 'Follow system',
		},
	},
	editor: {
		errors: {
			cannotResolveParentDirectory:
				'Could not resolve the parent folder for this file.',
			createFileFailed: 'Failed to create file.',
			createFolderFailed: 'Failed to create folder.',
			deleteItemFailed: 'Failed to delete item.',
			emptyFileName: 'File name cannot be empty.',
			fileAlreadyExists: 'A file with that name already exists.',
			localFolderRequiredForFiles:
				'Open a local folder before creating files here.',
			localFolderRequiredForFolders:
				'Open a local folder before creating folders here.',
			notConnected: 'Not connected to the desktop.',
			openFolderFailed: 'Failed to open folder.',
			openLocalFileFailed: 'Failed to open local file.',
			openLocalFolderFailed: 'Failed to open local folder.',
			openRemoteWorkspaceFailed: 'Failed to open remote workspace.',
			pasteFileFailed: 'Failed to paste file.',
			readFileFailed: 'Failed to read file.',
			refreshFilesFailed: 'Failed to refresh files.',
			remoteNoFiles: 'Remote workspace returned no files.',
			remoteNoRoot: 'Remote workspace returned no root folder.',
			remoteWorkspaceRequired:
				'Open a workspace on the desktop before syncing remote files.',
			renameFileFailed: 'Failed to rename local file.',
			saveFileFailed: 'Failed to save file.',
			singlePathSegment: 'File name must be a single path segment.',
			unexpectedResponse: 'The desktop returned an unexpected response.',
			writeFailed: 'Failed to write file.',
		},
	},
	markdownEditor: {
		loading: 'Loading CodeMirror',
		loadFailed: 'CodeMirror editor failed to load.',
		loadTimeout: 'CodeMirror editor did not finish loading.',
		androidAssetsMissing:
			'CodeMirror assets were not found in this Android build. Rebuild and reinstall the development app so android_asset/codeditor/editor.html is packaged.',
		completion: {
			accept: 'Accept',
			loading: 'Completing',
		},
		saveCapsule: {
			save: 'Save',
			saving: 'Saving',
			saved: 'Saved',
		},
		toolbar: {
			copyFile: 'Copy file',
			edit: 'Edit',
			image: 'Image',
			link: 'Link',
			pasteFile: 'Paste file',
			preview: 'Preview',
			renameFile: 'Rename file',
		},
		placeholder: {
			bold: 'bold text',
			image: 'image description',
			italic: 'italic text',
			link: 'link text',
			strikethrough: 'strikethrough text',
			underline: 'underlined text',
		},
	},
	syncSettings: {
		detail:
			'Pair with Madora desktop over the local network and manage local sync records.',
		eyebrow: 'Sync',
		connection: {
			detail: 'WebSocket link to the desktop sync server.',
			lastSync: 'Last sync',
			neverSynced: 'Not synced yet',
			refreshFiles: 'Refresh files',
			reconnect: 'Reconnect',
			state: 'State',
			title: 'Connection',
		},
		emptyTrusted: 'No paired devices yet.',
		errors: {
			authError: 'Desktop authentication failed. Pair again from QR.',
			connectionClosed: 'Desktop connection closed.',
			connectionReset: 'Desktop connection reset.',
			invalidQr: 'Invalid pairing QR code.',
			notConnected: 'Not connected to the desktop.',
			openDatabaseFailed: 'Failed to open the sync database.',
			refreshFilesFailed: 'Failed to refresh remote files.',
			removeTrustedFailed: 'Failed to remove trusted device.',
			serverError: 'The desktop sync service returned an error.',
			unexpectedResponse: 'The desktop returned an unexpected response.',
			writeFailed: 'Failed to write remote file.',
		},
		localDevice: {
			defaultName: 'Madora Phone',
			detail:
				'This name appears in desktop sync status and remote editing hints.',
			edit: 'Edit name',
			placeholder: 'For example, Madora Phone',
			saving: 'Saving',
			title: 'This app sync name',
		},
		pairing: {
			detail: 'Scan the desktop QR to pair over the local network.',
			eyebrow: 'Devices',
			instructions:
				'Open Madora desktop → Settings → Sync, then scan the QR code shown there.',
			pair: 'Pair from QR',
			ready: 'Ready to pair',
			repair: 'Re-pair via QR',
			title: 'Desktop pairing',
		},
		trustedDevices: {
			detail: 'Stored locally for reconnect.',
			removeConfirm: 'Remove {{name}} from trusted devices?',
			title: 'Trusted devices',
		},
		title: 'Sync settings',
	},
	qrScanner: {
		cancel: 'Cancel',
		detail: 'Point the camera at the QR code shown in Madora desktop settings.',
		grantCamera: 'Grant Camera Access',
		permission: 'Camera access is needed to scan the pairing QR code.',
		title: 'Scan Desktop QR',
	},
	aiSettings: {
		apiKey: 'API Key',
		apiKeyPlaceholderSaved: 'Enter a new key to replace the saved one',
		apiKeyStatus: {
			missing: 'No API key has been saved for this provider.',
			saved: 'An API key is saved for this provider.',
		},
		apiUrl: 'API URL',
		deleteKey: 'Delete key',
		detail:
			'Local AI completion uses the same provider routing and FIM prompts as the desktop backend.',
		enable: {
			detail:
				'When enabled, the editor requests local inline completions from this device.',
			title: 'Inline completion',
		},
		eyebrow: 'AI',
		messages: {
			deleted: 'API key deleted.',
			saved: 'API key saved.',
		},
		model: 'Model',
		protocol: 'Custom protocol',
		protocols: {
			anthropic: 'Anthropic',
			google: 'Google',
			openai: 'OpenAI',
		},
		provider: 'Provider',
		saveKey: 'Save key',
		title: 'AI settings',
		useSsl: 'Use HTTPS when URL has no scheme',
	},
};

export default en;
