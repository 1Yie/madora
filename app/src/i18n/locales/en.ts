const en = {
	common: {
		actions: {
			back: 'Back',
			cancel: 'Cancel',
			close: 'Close',
			delete: 'Delete',
			disconnect: 'Disconnect',
			refresh: 'Refresh',
			save: 'Save',
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
	settings: {
		mobileHome: {
			description:
				'Configure theme and interface, typing behavior, sync, and product information.',
			detail: {
				about: 'Product version, links, updates, and open source licenses.',
				appearance:
					'Language, tabs, editor pane, theme mode, and theme accent.',
				editor: 'Typing behavior, window behavior, and AI completion settings.',
			},
		},
		openAria: 'Open settings',
		sections: {
			about: { description: 'Product and links', label: 'About' },
			appearance: {
				description: 'Theme and interface',
				label: 'Appearance',
			},
			editor: { description: 'Typing and editing', label: 'Editor' },
			sync: { description: 'Sync and configuration', label: 'Sync' },
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
				description:
					'Control Markdown editor text size and overall interface zoom.',
				label: 'Text Size',
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
			currentVersionDescription: 'Current version: {{version}}',
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
			newFile: 'New file',
			openFile: 'Open file',
			openFolder: 'Open folder',
		},
		detail: 'Local files and folders',
		empty: {
			detail: 'Open a local folder to browse and create files here.',
			title: 'No folder selected',
		},
		title: 'File tree',
	},
	workspace: {
		empty: {
			detail:
				'Open a local folder first, then create or select a Markdown file inside it.',
			title: 'No file selected',
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
				detail:
					'Madora Mobile version, capabilities, and local-first behavior.',
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
				'Madora Mobile keeps editing, preview, and AI provider calls local first.',
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
					title: 'Madora Mobile',
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
		toolbar: {
			edit: 'Edit',
			image: 'Image',
			link: 'Link',
			preview: 'Preview',
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
		connection: {
			detail: 'WebSocket link to the desktop sync server.',
			refreshFiles: 'Refresh files',
			title: 'Connection',
		},
		emptyTrusted: 'No paired devices yet.',
		localStore: {
			detail: 'SQLite-backed pairing state and trusted device records.',
			title: 'Sync store',
		},
		metrics: {
			trusted: 'Trusted',
		},
		pairing: {
			detail: 'Scan the desktop QR to pair over the local network.',
			eyebrow: 'Devices',
			instructions:
				'Open Madora desktop -> Settings -> Sync, then scan the QR code shown there.',
			pair: 'Pair from QR',
			ready: 'Ready to pair',
			repair: 'Re-pair via QR',
			title: 'Desktop pairing',
		},
		trustedDevices: {
			detail: 'Stored locally for reconnect.',
			title: 'Trusted devices',
		},
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
