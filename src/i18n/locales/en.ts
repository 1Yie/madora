const en = {
	common: {
		actions: {
			activate: 'Activate',
			cancel: 'Cancel',
			close: 'Close',
			copy: 'Copy',
			cut: 'Cut',
			confirm: 'Confirm',
			continue: 'Continue',
			create: 'Create',
			delete: 'Delete',
			disable: 'Disable',
			dismiss: 'Dismiss',
			enterEditor: 'Open Editor',
			finish: 'Finish',
			paste: 'Paste',
			retry: 'Retry',
			save: 'Save',
			skip: 'Skip',
			tryFirst: 'Start Trial',
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
			current: 'Current',
			loading: 'Loading...',
			notAvailable: 'Unavailable',
			saved: 'Saved',
			unknownError: 'Unknown error',
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
		openAria: 'Open settings',
		sections: {
			about: { description: 'Product and links', label: 'About' },
			appearance: {
				description: 'Theme and interface',
				label: 'Appearance',
			},
			cli: { description: 'Command line tools', label: 'CLI' },
			editor: { description: 'Typing and editing', label: 'Editor' },
			license: { description: 'Activation and management', label: 'License' },
			sync: { description: 'Sync and configuration', label: 'Sync' },
		},
		appearance: {
			cards: {
				language: {
					description:
						'Defaults to your device language and can be pinned to a specific language.',
					title: 'Language',
				},
				tabs: { title: 'Tabs' },
				editor: { title: 'Editor Pane' },
				theme: { title: 'Theme Mode' },
				accent: { title: 'Theme Accent' },
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
			editorTextSize: {
				label: 'Text Size',
			},
			zoomLevel: {
				label: 'Interface Zoom',
				small: 'Small',
				medium: 'Medium',
				large: 'Large',
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
			accentOptions: {
				amber: 'Amber',
				custom: 'Custom',
				cyan: 'Cyan',
				default: 'Default',
				green: 'Green',
				indigo: 'Indigo',
				purple: 'Purple',
				red: 'Red',
				system: 'System',
			},
		},
		editor: {
			cards: {
				ai: { title: 'AI Completion' },
				input: { title: 'Typing Behavior' },
				window: { title: 'Window' },
			},
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
			closeBehavior: {
				minimize: {
					description:
						'Hide the main window when closing. Madora keeps running from the tray icon.',
					label: 'Minimize to Tray',
				},
				exit: {
					description:
						'Quit the app when closing. Unsaved changes are confirmed first.',
					label: 'Quit App',
				},
			},
			providerHint:
				'Each provider keeps its own API key and model settings. Switching providers does not overwrite the others.',
			customConfigTitle: 'Custom Provider',
			customProtocolPlaceholder: 'Select a compatible protocol...',
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
			apiUrlHint: 'Endpoint URL for the custom provider.',
			httpsHint:
				'Used automatically when no protocol is entered. Disable only for self-hosted services.',
			apiKeyHint: {
				existing:
					'An API key is already saved for this provider. Enter a new one to replace it.',
				missing: 'No API key has been saved for this provider yet.',
				storage:
					'The key is stored in the system keychain and only used for local requests.',
			},
			apiKeyPlaceholderSaved: 'Saved',
			editApiKeyAria: 'Edit API key',
			confirmSaveAria: 'Confirm save',
			cancelEditAria: 'Cancel editing',
			modelHintCustom:
				'Enter the model name directly. Refer to your provider for capability differences.',
			modelPlaceholder: 'Select a model...',
			loadingModels: 'Loading model list...',
			loadingSelect: 'Loading...',
			toasts: {
				apiKeyDeleted: 'API key removed from the system keychain',
				apiKeyDeleteFailed: 'Failed to remove API key',
				apiKeySaved: 'API key saved to the system keychain',
				apiKeySaveFailed: 'Failed to save API key',
			},
		},
		cli: {
			cards: {
				cli: { title: 'CLI' },
				status: { title: 'Status' },
			},
			rows: {
				install: {
					description:
						'Install the bundled `mado` command so it can be called directly from a terminal.',
					title: 'Install CLI',
				},
			},
			stats: {
				cliSource: 'CLI Source',
				command: 'Shell Command',
				installPath: 'Install Path',
				path: 'PATH',
			},
			statusText: {
				available: 'Available',
				notDetected: 'Not detected',
				notFound: 'Not found',
				notResolved: 'Unresolved',
				pathReady: 'Install directory is already on PATH',
				pathMissing: 'Install directory is not on PATH',
				restartTerminal: 'Restart your terminal',
				terminalRefreshPending:
					'Installed, waiting for the terminal to refresh',
				usableCommand: 'Ready to use via {{command}}',
			},
			toasts: {
				fetchStatusFailed: 'Failed to read CLI status: {{error}}',
				installFailed: 'Failed to install CLI: {{error}}',
				installed: 'CLI installed',
				installedAndPathUpdated: 'CLI installed and PATH updated',
				installedRestartTerminal:
					'CLI installed. Reopen the terminal before using `mado`.',
				installedWithHint: 'CLI installed to {{dest}}; {{hint}}',
				removed: 'CLI removed',
				removedAndPathCleaned: 'CLI removed and PATH cleaned up',
				uninstallFailed: 'Failed to remove CLI: {{error}}',
			},
		},
		license: {
			cards: {
				details: { title: 'License Details' },
			},
			status: {
				active: 'Activated',
				expired: 'Expired',
				revoked: 'Revoked',
				trial: 'Trial',
			},
			labels: {
				licensed: 'Licensed',
				license: 'Madora License',
			},
			descriptions: {
				active: 'This device currently has access to the full feature set.',
				missing: 'No valid license was detected.',
				trialRemaining: '{{days}} days of trial remaining',
			},
			actions: {
				activate: 'Activate',
				deactivate: 'Deactivate this device',
				manage: 'Manage license',
				purchase: 'Purchase',
			},
			purchase: 'Don’t have a license yet? Purchase one.',
			deviceHint:
				'Need to use it on another device? Deactivate this one first.',
			confirm: {
				title: 'Confirm Deactivation',
				description:
					'After deactivation, this device will lose access to Madora Pro features until the license is activated again. You can then use the same license key on another device.',
				action: 'Deactivate',
				success: 'License deactivated',
				failed: 'Failed to deactivate license',
			},
			loading: 'Loading license information...',
		},
		sync: {
			cards: {
				mode: { title: 'Repository Sync' },
			},
			rows: {
				enabled: {
					title: 'Enable Sync',
					description: 'Enable Git or WebDAV sync for this workspace.',
				},
			},
			options: {
				git: {
					description:
						'Local version control with commits, pushes, pulls, and branches.',
					label: 'Git',
				},
				madoraSync: {
					description:
						'Desktop-hosted real-time sync for phones and other Madora clients on your network.',
					label: 'Madora Sync',
				},
				webdav: {
					description: 'Remote file sync over the WebDAV protocol.',
					label: 'WebDAV',
				},
			},
			madora: {
				actions: {
					clearPairingCode: 'Clear code',
					issuePairingCode: 'Generate pairing code',
					refreshPairingQr: 'Refresh QR Code',
					removeDevice: 'Remove',
				},
				cards: {
					devices: { title: 'Trusted Devices' },
					features: {
						description:
							'These settings define how the desktop host exposes sync services to local clients.',
						title: 'Host Features',
					},
					host: { title: 'Host Settings' },
					pairing: {
						description:
							'Scan the QR code from mobile to pair automatically. The code is only a fallback path.',
						title: 'Pairing',
					},
					status: { title: 'Connection Status' },
				},
				connectionStates: {
					authenticating: 'Authenticating',
					connected: 'Connected',
					connecting: 'Connecting',
					disconnected: 'Disconnected',
					discovering: 'Discovering',
					syncing: 'Syncing',
				},
				empty: {
					devices: 'No trusted devices yet.',
				},
				fields: {
					deviceName: 'Device Name',
					fallbackCode: 'Fallback Code',
					pairingCode: 'Pairing Code',
					port: 'Port',
				},
				hints: {
					port: 'Reserve a stable port for the desktop sync host. Mobile clients will reconnect to this endpoint.',
				},
				rows: {
					enabled: {
						description:
							'Allow phones and other Madora clients to connect to this desktop and collaborate on the same workspace.',
						title: 'Enable Device Collaboration',
					},
					aiSharing: {
						description:
							'Route mobile AI completion requests through this desktop device.',
						title: 'Share AI Completion',
					},
					autoStart: {
						description:
							'Start the local sync host automatically when Madora launches.',
						title: 'Auto-start Host',
					},
					lanDiscovery: {
						description:
							'Advertise this desktop on the local network for zero-config discovery.',
						title: 'LAN Discovery',
					},
				},
				status: {
					automaticPairing:
						'Scanning carries a one-time pairing ticket to this host, so the phone does not need a manual code entry.',
					availableHosts: 'Available hosts',
					connection: 'Connection',
					expiresAt: 'Expires at {{time}}',
					expiresIn: 'Expires in {{time}}',
					expired: 'Expired',
					fallbackCodeDescription:
						'Use this only when QR scanning is unavailable or the client does not support automatic pairing tickets yet.',
					hostMode: 'Host mode',
					lastSeenAt: 'Last seen {{time}}',
					lastSync: 'Last Sync',
					neverSynced: 'Not synced yet',
					noRemoteEditor: 'No remote editor activity',
					noPairingCode: 'No active pairing code',
					noReachableHost: 'No reachable LAN address detected',
					pairedDevices: 'Paired Devices',
					primaryHost: 'Primary host',
					qrUnavailable:
						'QR code will appear after a reachable LAN address is available.',
					remoteEditor: 'Remote editor',
					scanToConnect: 'Scan to Connect',
					trusted: 'Trusted',
					unavailable: 'Madora Sync unavailable',
					unknownPlatform: 'Unknown platform',
				},
				toasts: {
					loadFailed: 'Failed to load Madora Sync settings',
					pairingCodeFailed: 'Failed to update pairing code',
					pairingCodeIssued: 'Pairing code generated',
					pairingCodeCopied: 'Pairing code copied',
					pairingUrlCopied: 'Connection address copied',
					copyFailed: 'Copy failed',
					pairingQrFailed: 'Failed to load pairing QR code',
					removeDeviceFailed: 'Failed to remove paired device',
					saveFailed: 'Failed to save Madora Sync settings',
					saved: 'Madora Sync settings saved',
				},
				validation: {
					invalidPort: 'Enter a valid TCP port between 1 and 65535.',
				},
			},
		},
		about: {
			actions: {
				check: 'Check for Updates',
				viewRelease: 'View Release',
			},
			cards: {
				licenses: { title: 'Open Source Licenses' },
				update: {
					description:
						'Checks the latest GitHub release before you download a new build.',
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
			toasts: {
				checkFailed: 'Failed to check for updates',
				checkFailedDescription: 'Unable to reach GitHub Releases right now.',
				upToDate: 'Madora is already up to date ({{version}})',
				updateAvailableDescription:
					'Current {{currentVersion}} · Latest {{latestVersion}}',
				updateAvailableTitle: 'A new version is available',
			},
		},
	},
	setup: {
		testPrompt:
			'# Madora connection test\n\nPlease continue the next sentence directly. Keep it natural and brief without explaining.\nThe current model connection has already',
		emptyTestResult:
			'Connection succeeded. The model responded normally, but this test did not return any visible completion text.',
		validation: {
			apiKeyRequired: 'Please enter an API key.',
			apiUrlRequired: 'Please enter the API URL.',
			modelRequired: 'Please choose or enter a model.',
		},
		welcome: {
			title: 'Welcome to Madora',
			action: 'Start Setup',
			taglineTop: 'Markdown editing,',
			taglineBottom: 'powered by AI',
		},
		configure: {
			title: 'Connect a Provider',
			description: 'Configure your AI completion endpoint',
		},
		test: {
			title: 'Connection Test',
			description: 'Verifying credentials and model connectivity',
			waiting: 'Waiting for a response',
			retry: 'Run Test Again',
			finish: 'Finish Verification',
		},
		license: {
			title: 'License',
			description:
				'Already have a license? Activate it to unlock the full feature set. You can also continue with the trial and activate later in settings.',
			activate: 'Activate License',
		},
		success: {
			title: 'Ready to Go',
			description:
				'Madora is configured. Open a Markdown file and start writing right away.',
		},
		skipConfirm: {
			title: 'Skip setup?',
			description:
				'You can skip for now and return to AI completion settings later.',
			action: 'Skip Setup',
		},
	},
	licenseDialog: {
		title: 'Activate License',
		description: 'Enter your license key to activate Madora.',
		label: 'License Key',
		purchaseAction: 'Go to purchase',
		purchase: 'Don’t have a license yet? Purchase one.',
		action: 'Activate',
		validation: 'Please enter the full license key',
		success: 'Activation successful',
	},
	licenseBanner: {
		verifying: 'Verifying license...',
		revoked: {
			title: 'License update required',
			action: 'Activate New License',
			switchToTrial: 'Switch to Trial',
		},
		expired: {
			title: 'Trial expired',
			description:
				'Your 14-day trial has ended. Activate a license to continue using Madora.',
			action: 'Activate License',
		},
		trial: {
			remaining: '{{days}} days left in trial',
			action: 'Activate',
		},
	},
	topBar: {
		saveFailureFallback: 'Failed to save before closing',
		toasts: {
			saveFailed: 'Failed to save before closing',
			stillUnsaved: 'Unsaved changes remain before closing',
			stillUnsavedDescription:
				'Try saving again, or choose to close without saving.',
		},
		confirmClose: {
			title: 'There are unsaved documents in this workspace',
			saving: 'Saving unfinished changes...',
			description:
				'Choose what to do before closing the window: save your changes first, or discard them.',
			discard: 'Close Without Saving',
			save: 'Save and Close',
		},
		confirmMinimize: {
			title: 'This workspace has unsaved changes',
			description: 'Minimize to the tray anyway?',
			confirm: 'Minimize Anyway',
		},
	},
	errors: {
		applicationError: 'The app ran into an error',
		openLinkFailed: 'Failed to open link',
		retry: 'Retry',
	},
	ai: {
		apiKeyRequired: 'Please enter an API key first',
		completionFailed: 'AI completion failed',
		disabled: 'AI completion is off',
		generating: 'Generating AI suggestion...',
		ready: 'AI completion is ready',
		saveApiKeyToUse: 'Save an API key to enable it',
	},
	licenseProvider: {
		activateFailed: 'Activation failed',
		deactivateFailed: 'Deactivation failed',
		revokedTitle: 'License revoked',
		revokedDescription:
			'Your license has been revoked, so AI completion has been disabled.',
	},
	aiSettingsProvider: {
		keychainAccessFailed: 'Unable to access the system keychain',
	},
	webdav: {
		tab: {
			connection: 'Connection',
			connectionDesc: 'Server & Auth Configuration',
			sync: 'Sync',
			syncDesc: 'Sync Operations & Strategy',
		},
		connectSuccess: 'Connection successful',
		connectSuccessWithName: 'Connection successful — {{name}}',
		connectFailed: 'Connection failed',
		testConnectionError: 'Test connection failed',
		configSaved: 'Configuration saved',
		saveConfigFailed: 'Failed to save configuration',
		configCleared: 'Configuration cleared',
		deleteConfigFailed: 'Failed to clear configuration',
		syncCompletedWithErrors: 'Sync completed with errors',
		syncComplete:
			'Sync complete — {{uploaded}} uploaded, {{downloaded}} downloaded',
		syncFailed: 'Sync failed',
		notConfigured: 'WebDAV not configured',
		lastSyncAt: 'Last sync: {{time}}',
		notSyncedYet: 'Not synced yet',
		errorCount: '{{count}} error(s)',
		configureLabel: 'Configure WebDAV',
		syncLabel: 'Sync',
		settingsLabel: 'WebDAV Settings',
		connection: {
			sectionLabel: 'WebDAV',
			sectionTitle: 'Connection',
			cardTitle: 'Server Configuration',
			serverUrl: 'Server URL',
			username: 'Username',
			password: 'Password',
			testing: 'Testing...',
			testAction: 'Test Connection',
			saveAction: 'Save Configuration',
			clearAction: 'Clear Configuration',
		},
		syncPanel: {
			sectionLabel: 'WebDAV',
			sectionTitle: 'Sync',
			optionsTitle: 'Sync Options',
			remoteSubdir: 'Remote Subdirectory',
			remoteSubdirHint:
				'Optional subdirectory used for this workspace on the WebDAV server.',
			conflictStrategy: 'Conflict Strategy',
			strategies: {
				localFirst: 'Keep Local Version',
				remoteFirst: 'Use Remote Version',
				keepBoth: 'Keep Both',
			},
			manualTitle: 'Manual Sync',
			syncing: 'Syncing...',
			syncNow: 'Sync Now',
			resultsTitle: 'Latest Sync Result',
			uploaded: '{{count}} file(s) uploaded',
			downloaded: '{{count}} file(s) downloaded',
			conflicts: '{{count}} conflict(s) resolved',
			errors: '{{count}} error(s)',
		},
	},
	git: {
		gitOperationFailed: 'Git operation failed',
		remoteSaveFailed: 'Remote save failed',
		remoteSaveFailedHint: 'Please enter a remote name and repository URL',
		commitFailed: 'Commit failed',
		commitMessageRequired: 'Please enter a commit message',
		mergeConflicts: 'Merge conflicts exist',
		sshKeySelected: 'SSH private key file selected',
		revertConflicts: 'Revert conflicts exist',
		history: 'History',
		changes: 'Changes',
		staged: 'Staged',
		conflict: 'Conflicts',
		noChanges: 'No changes',
		commitAll: 'Commit All',
		commitMessage: 'Commit Message',
		commitPlaceholder: 'Describe your changes',
		moreActions: 'More actions',
		undoLastCommit: 'Undo Last Commit',
		undoDescription:
			'This will remove the most recent commit and keep its changes in your working tree.',
		confirmUndo: 'Undo Commit',
		revertSelectedCommit: 'Revert Selected Commit',
		revertThisCommit: 'Revert This Commit',
		confirmRevert: 'Revert Commit',
		remoteName: 'Remote Name',
		remoteUrl: 'Remote URL',
		saveRemote: 'Save Remote',
		pullAction: 'Pull',
		pushAction: 'Push',
		sshAuth: 'SSH Authentication',
		sshUsername: 'SSH Username',
		sshKeyPath: 'SSH Private Key',
		sshPassphrase: 'SSH Passphrase',
		passphrasePlaceholder: 'Enter passphrase if the key is encrypted',
		httpsAuth: 'HTTPS Authentication',
		httpsUsername: 'Username',
		httpsPassword: 'Password',
		tokenOrPassword: 'Token or password',
		selectFile: 'Select File',
		stage: 'Stage',
		stageAll: 'Stage All',
		unstage: 'Unstage',
		unstageAll: 'Unstage All',
		commitLabel: {
			commitStaged: 'Commit Staged Changes',
			resolve: 'Resolve Conflicts',
			merging: 'Resolve Merge Conflicts',
			reverting: 'Resolve Revert Conflicts',
			cherryPicking: 'Resolve Cherry-pick Conflicts',
			rebasing: 'Resolve Rebase Conflicts',
		},
		commitConflict: {
			mixed:
				'{{with}} file(s) still need inline conflict resolution; {{without}} can be staged directly.',
			resolveFirst:
				'Resolve the inline conflict markers before staging these files.',
			noMarkers:
				'These conflicts have no inline markers and can be staged once you decide to keep the current workspace version.',
			markerTooltip:
				'Contains inline conflict markers. Resolve them in the editor first.',
			noMarkerTooltip:
				'No inline conflict markers. If the current workspace version is correct, you can stage it directly.',
			markerWarning:
				'Resolve the inline conflict markers before staging this file.',
			stageAndResolve: 'Stage current version and mark conflict resolved',
		},
		tab: {
			commit: 'Commit',
			commitDesc: 'Create a new commit',
			history: 'History',
			historyDesc: 'Commit history',
			remote: 'Remote',
			remoteDesc: 'Remote sync configuration',
			authDesc: 'Authentication & credentials',
		},
		status: {
			notInitialized: 'Not initialized',
			clean: 'Working directory clean',
			loading: 'Reading repository status...',
			notARepo: 'Current workspace is not a Git repository',
			reverting: 'Reverting in progress, {{count}} conflict(s) pending',
			merging: 'Merging in progress, {{count}} conflict(s) pending',
			cherryPicking:
				'Cherry-picking in progress, {{count}} conflict(s) pending',
			rebasing: 'Rebasing in progress, {{count}} conflict(s) pending',
			conflicts: '{{count}} conflict(s) pending',
			staged: '{{count}} staged',
			unstaged: '{{count}} unstaged',
			ahead: '{{count}} ahead',
			behind: '{{count}} behind',
		},
		initSuccess: 'Git repository initialized',
		commitSuccess: 'Commit successful',
		pushSuccess: 'Push successful',
		pullComplete: 'Pull complete',
		fetchComplete: 'Remote updates fetched',
		remoteSaved: 'Remote saved',
		undoSuccess: 'Latest commit undone',
		revertSuccess: 'Revert commit created',
		createBranchFailed: 'Failed to create branch',
		fetchBranchListFailed: 'Failed to fetch branch list',
		fetchStatusFailed: 'Failed to read Git status',
		selectFileFailed: 'Failed to select file',
		noBranches: 'No branches yet',
		loading: 'Loading...',
		init: 'Initialize',
		pull: 'Pull',
		push: 'Push',
		notMadoraRepo: 'Not a Git repository for the current workspace',
		revertDescriptionWithSummary:
			'This will create a new revert commit for: {{summary}}',
	},
	explorerPanel: {
		newDocument: 'New Document',
		newFolder: 'New Folder',
		rename: 'Rename',
		copy: 'Copy',
		cut: 'Cut',
		paste: 'Paste',
		pasteHere: 'Paste Here',
		pasteToDir: 'Paste to Current Directory',
		delete: 'Delete',
		restore: 'Restore',
		save: 'Save',
		cancel: 'Cancel',
		confirmDeleteTitle: 'Confirm Delete',
		confirmDeleteFile: 'Delete file "{{name}}"?',
		confirmDeleteFolder: 'Delete folder "{{name}}" and all its contents?',
		confirmBatchDelete: 'Confirm delete selected {{items}}?',
		confirmBatchDeleteTitle: 'Confirm Batch Delete',
		fileCount: '{{count}} file(s)',
		dirCount: '{{count}} folder(s)',
		selectFolder: 'Open a local folder',
		selectFolderDescription:
			'Previewable files will appear here in the folder tree.',
		startBrowsing: 'Open a folder to start browsing',
		noFilesFound: 'No files found',
		itemsSelected: '{{count}} item(s) selected',
		itemsCopied: 'Copied {{count}} item(s)',
		itemsCut: 'Cut {{count}} item(s)',
		syncNotEnabled: 'Sync not enabled',
		bookmarks: 'Bookmarks',
		addBookmark: 'Add bookmark',
		removeBookmark: 'Remove bookmark',
		bookmarkRemoved: 'Remove bookmark',
		deleteBookmarkWithName: 'Remove bookmark {{name}}',
		showInTree: 'Show in tree',
		toggleExpand: 'Collapse / Expand all',
		collapseWithName: 'Collapse {{name}}',
		expandWithName: 'Expand {{name}}',
		refreshTree: 'Refresh file tree',
		sorted: 'Sorted',
		unsorted: 'Unsorted',
		sortToggle: 'Toggle sort',
		createDescription:
			'Creates inside the target directory; if the target is a file, it is created alongside it; without a target, it is created at the workspace root.',
		createFailed: 'Creation failed',
		enterFileName: 'Please enter a file name',
		invalidFileExtension: 'File name must end with .md or .mdx',
		enterFolderName: 'Please enter a folder name',
		enterName: 'Please enter a name',
		renameFailed: 'Rename failed',
		renameFolderDescription: 'Enter a new folder name.',
		renameFileDescription: 'Enter a new file name.',
		createSuccess: 'Created "{{name}}"',
		copySuccess: 'Copied "{{name}}"',
		cutSuccess: 'Cut "{{name}}"',
		pasteSuccess: 'Pasted "{{name}}"',
		clearClipboard: 'Clipboard operation cancelled',
		dropFailed: 'Unable to read dropped file path',
		confirmRestoreTitle: 'Restore Deleted File',
		confirmRestoreFromGit: 'Restore file "{{name}}" from Git?',
		workspaceOperationFailed: 'Workspace operation failed',
		fileReadFailed: 'Failed to read file',
		importUnsupported: 'Only .md/.mdx files and images can be imported',
		importSummary: 'Imported {{count}} file(s)',
		importSummaryWithSkipped:
			'Imported {{imported}} file(s); skipped {{skipped}} unsupported item(s)',
	},
	tabBar: {
		closeTabWithName: 'Close {{name}}',
		outsideWorkspace: 'Outside workspace',
		closeCurrent: 'Close Current Tab',
		closeLeft: 'Close Tabs to the Left',
		closeRight: 'Close Tabs to the Right',
		keepCurrentOnly: 'Keep Only Current Tab',
		closeAll: 'Close All Tabs',
	},
	conflictEditor: {
		conflictCount: 'Conflict {{current}} / {{total}}',
		selected: 'Selected',
		keepBoth: 'Keep Both',
		currentBranch: 'Current Branch HEAD',
		incomingChanges: 'Incoming Changes',
		useChoice: 'Use',
		empty: '(empty)',
		resolving: 'Resolving...',
		complete: 'Finish Resolving Conflicts',
		remaining: '{{count}} conflict(s) still need a choice',
	},
	markdownEditor: {
		actions: {
			bold: 'Bold',
			italic: 'Italic',
			strikethrough: 'Strikethrough',
			underline: 'Underline',
			link: 'Insert Link',
			image: 'Insert Image',
		},
		placeholders: {
			bold: 'bold text',
			italic: 'italic text',
			strikethrough: 'strikethrough text',
			underline: 'underlined text',
			link: 'link text',
			image: 'image description',
		},
		status: {
			dirty: 'Unsaved, press',
			saving: 'Saving...',
			saved: 'Saved',
			error: 'Save failed',
			manual: 'Manual save',
			auto: 'Autosaves while you edit',
		},
		cursor: {
			lineCol: 'Line {{line}}, Col {{col}}',
			characters: '{{count}} characters',
		},
		toggle: {
			preview: 'Switch to preview',
			edit: 'Switch to editor',
		},
	},
	markdownPreview: {
		fileNotFound: 'File not found',
		externalTitle: 'Allow opening an external file?',
		externalDescription:
			'This link points outside the current workspace. Opening it will allow reading files from that location.',
		allowAccess: 'Allow Access',
	},
	filePreview: {
		conflictNoMarkersTitle: 'This conflict has no inline markers',
		conflictNoMarkersDescription:
			'This usually means a modify/delete or delete/modify index conflict. Check the current workspace version first; if you want to keep it, stage it from the commit panel to mark the conflict resolved.',
		deletedTitle: 'This file was removed from the workspace',
		deletedDescription:
			'The file still appears in Git changes. Use Restore File from the sidebar context menu if needed.',
		truncatedTitle: 'Preview truncated',
		truncatedDescription: 'The file is large, so only the first part is shown.',
		emptyTitle: 'No preview available',
		emptyDescription:
			'This file type is not previewable yet, or the file is empty.',
		selectFileTitle: 'Select a file from the sidebar',
		selectFileDescription:
			'Choose any file after opening a folder and its contents will appear here.',
		openFolderTitle: 'No folder is open yet',
		openFolderDescription:
			'After opening a local folder, Markdown, image, and text files will be listed here for preview.',
	},
} as const;

export default en;
