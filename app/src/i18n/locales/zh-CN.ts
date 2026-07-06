const zhCN = {
	common: {
		actions: {
			back: '返回',
			cancel: '取消',
			close: '关闭',
			delete: '删除',
			disconnect: '断开连接',
			discard: '不保存',
			refresh: '刷新',
			save: '保存',
		},
		feedback: {
			error: '错误',
			success: '成功',
		},
		labels: {
			apiKey: 'API Key',
			apiUrl: 'API 地址',
			author: '作者',
			https: 'HTTPS',
			language: '语言',
			model: 'Model',
			protocol: '协议',
			provider: 'Provider',
			sourceCode: '源代码',
			version: '版本',
			website: '网站',
		},
		status: {
			ai: 'AI',
			authenticating: '认证中',
			connected: '已连接',
			connecting: '连接中',
			disconnected: '未连接',
			discovering: '发现中',
			idle: '空闲',
			pending: '待同步',
			synced: '已同步',
			syncing: '同步中',
			trusted: '已信任',
		},
	},
	language: {
		description: '默认跟随设备语言，也可以随时在这里切换。',
		label: '语言',
		options: {
			en: 'English',
			ja: '日本語',
			ko: '한국어',
			system: '跟随设备',
			zhCN: '简体中文',
		},
	},
	onboarding: {
		footnote: '语言、保存方式、同步和 AI Provider 都可以稍后在设置里修改。',
		languageTitle: '选择语言',
		nextAction: '下一步',
		primaryAction: '进入工作区',
		skipAction: '跳过',
		stepLabel: '{{current}} / {{total}}',
		taglineBottom: 'powered by AI',
		taglineTop: 'Markdown editing,',
		title: '欢迎使用 Madora',
		controls: {
			manualSave: {
				description: '显示右上角保存胶囊，离开未保存工作区前先确认。',
				title: '手动保存',
			},
		},
		items: {
			ai: {
				detail: '需要写作时自动补全文本时，可以配置本机 AI Provider。',
				hint: '进入 设置 → AI，可以选择 Provider、模型、接口地址和 API Key。',
				title: 'AI 补全',
			},
			sync: {
				detail: '通过局域网配对 Madora 桌面端，继续浏览远程工作区。',
				hint: '进入 设置 → 同步，扫描桌面端二维码；后续也可以在这里重连。',
				title: '桌面端同步',
			},
			workspace: {
				detail: '打开本地文件夹，创建 Markdown 文件，并在手机上继续编辑。',
				hint: '在文件树里选择文件夹、创建文件，并在编辑和预览之间切换。',
				title: '本地工作区',
			},
		},
		ready: {
			detail:
				'这些设置之后都能在设置里修改。可以先打开文件夹，或配对桌面端同步。',
			title: '准备开始写作',
		},
		summary: {
			title: '已选择的设置',
		},
	},
	settings: {
		mobileHome: {
			description: '设置主题与界面、输入行为、同步配置和产品信息。',
			detail: {
				about: '产品版本、链接、更新与开源许可。',
				appearance: '语言、主题模式和编辑区文字大小。',
				editor: '自动保存和行内 AI 自动补全配置。',
			},
		},
		openAria: '打开设置',
		sections: {
			about: { description: '产品与链接', label: '关于' },
			appearance: { description: '主题与界面', label: '外观' },
			ai: { description: '模型与配置', label: 'AI' },
			editor: { description: '输入与编辑', label: '编辑器' },
			sync: { description: '同步与配置', label: '同步' },
		},
		ai: {
			apiKeyMissing: '未保存 Key',
			apiKeySaved: '已保存 Key',
			description: '配置编辑器行内补全使用的 Provider，凭据只保存在当前设备。',
		},
		appearance: {
			cards: {
				accent: { title: '主题颜色' },
				editor: { title: '编辑区' },
				language: {
					description: '默认跟随设备语言，也可以固定成某一种语言。',
					title: '语言',
				},
				tabs: { title: '标签页' },
				theme: { title: '主题模式' },
			},
			accentOptions: {
				amber: '琥珀',
				custom: '自定义',
				cyan: '青色',
				default: '默认主题',
				description: '可以跟随系统、使用默认主题，或选择一组固定强调色。',
				green: '绿色',
				indigo: '靛蓝',
				purple: '紫色',
				red: '红色',
				system: '跟随系统',
			},
			editorTextSize: {
				description: '控制 Markdown 编辑区文字大小。',
				label: '文本大小',
				reset: '重置',
			},
			tabBar: {
				scroll: {
					description: '所有标签页保持在一行，超出后通过横向滚动查看。',
					label: '单行滚动',
				},
				wrap: {
					description: '标签页超出容器宽度后自动换行排列。',
					label: '自动换行',
				},
			},
			theme: {
				dark: { description: '适合夜间或长时间阅读。', label: '深色' },
				light: { description: '更适合明亮环境。', label: '浅色' },
				system: { description: '跟随当前设备或系统设置。', label: '跟随系统' },
			},
			zoomLevel: {
				label: '界面缩放',
				large: '大',
				medium: '中',
				small: '小',
			},
		},
		editor: {
			apiKeyHint: {
				existing: '当前 Provider 已保存 API Key，重新输入并保存可覆盖旧值。',
				missing: '当前 Provider 尚未保存 API Key。',
				storage: 'Key 存储在系统安全存储中，不会上传云端，仅通过本机请求使用。',
			},
			apiKeyPlaceholderSaved: '已保存',
			apiUrlHint: '自定义 Provider 的接口地址。',
			cards: {
				ai: { title: 'AI 配置' },
				input: { title: '输入行为' },
				window: { title: '窗口' },
			},
			closeBehavior: {
				exit: {
					description: '点击关闭按钮时退出应用；存在未保存内容时会先提示。',
					label: '直接退出',
				},
				minimize: {
					description: '点击关闭按钮时隐藏主窗口，应用继续在状态栏图标中运行。',
					label: '最小化到托盘',
				},
			},
			customConfigTitle: '自定义接口配置',
			customProtocolOptions: {
				anthropic: {
					description: '适用于 /v1/messages 一类 Anthropic 兼容接口。',
					label: 'Anthropic Compatible',
				},
				google: {
					description: '适用于 Google 风格 models/{id}:generateContent 接口。',
					label: 'Google Compatible',
				},
				openai: {
					description: '适用于 /v1/chat/completions 一类 OpenAI 兼容接口。',
					label: 'OpenAI Compatible',
				},
			},
			customProtocolPlaceholder: '选择兼容协议...',
			httpsHint: '未填写协议时自动使用；自建服务可关闭。',
			modelHintCustom: '填写模型名称，不同模型的功能和表现请参考提供方说明。',
			modelPlaceholder: '选择模型...',
			providerHint: '各 Provider 的 Key 和模型独立保存，切换后不会互相覆盖。',
			rows: {
				autoSave: {
					description: '开启后编辑内容会自动写入文件。',
					title: '自动保存',
				},
				enableAi: {
					description: '开启后在输入时会自动向后补全文本。',
					title: '启用 AI 自动补全',
				},
				hiddenFiles: {
					prefix: '控制侧栏是否显示以',
					suffix: '开头的文件和目录。',
					title: '显示隐藏文件',
				},
			},
			toasts: {
				apiKeyDeleted: '已从系统安全存储删除 API Key',
				apiKeyDeleteFailed: '删除 API Key 失败',
				apiKeyRequired: '请先输入 API Key',
				apiKeySaved: 'API Key 已保存到系统安全存储',
				apiKeySaveFailed: '保存 API Key 失败',
			},
		},
		about: {
			actions: {
				check: '检查更新',
				viewRelease: '查看发行版',
			},
			cards: {
				licenses: {
					description: '查看 Madora 使用的开源依赖和许可证信息。',
					title: '开源许可',
				},
				update: {
					description: '检查最新发行版后再下载新构建。',
					title: '软件更新',
				},
			},
			currentVersionDescription: '当前版本：{{version}}',
			stats: {
				author: '作者',
				sourceCode: '源代码',
				version: '版本',
				website: '网站',
			},
		},
	},
	tabs: {
		ai: 'AI',
		devices: '设备',
		fileTree: '文件树',
		settings: '设置',
		workspace: '工作区',
	},
	fileTree: {
		actions: {
			bookmark: '收藏',
			cancelCopy: '取消复制',
			delete: '删除',
			locateCurrent: '定位当前文件',
			newFolder: '新建文件夹',
			newFile: '新建文件',
			openFile: '打开文件',
			openFolder: '打开文件夹',
			refresh: '刷新文件',
			removeBookmark: '取消收藏',
		},
		bookmarks: '书签',
		copyBanner: {
			title: '已复制“{{name}}”，可粘贴',
		},
		delete: {
			detail: '确认从当前工作区删除“{{name}}”？',
			title: '删除项目',
		},
		detail: '本地文件和文件夹',
		tabs: {
			local: '本地文件夹',
			remote: '远程文件夹',
		},
		empty: {
			detail: '先打开一个本地文件夹，之后在这里浏览和新建文件。',
			title: '还未选择文件夹',
		},
		remoteDisconnected: {
			action: '前往同步设置',
			detail: '远程同步已断开。重新配对或连接桌面端后，可以继续浏览远程文件。',
			title: '远程同步已断开',
		},
		remoteEmpty: {
			detail: '桌面端工作区当前没有可显示的文件。',
			title: '远程文件夹为空',
		},
		feedback: {
			copyCanceledDetail: '已清除待粘贴文件。',
			copyCanceledTitle: '已取消复制',
			copyReadyDetail: '现在可以把“{{name}}”粘贴到文件夹中。',
			copyReadyTitle: '文件已复制',
			locatedDetail: '文件树已定位到当前文件。',
			locatedTitle: '已定位当前文件',
			locateUnavailableDetail: '请先打开或选择一个文件。',
			locateUnavailableTitle: '没有可定位的文件',
			pastedDetail: '复制的文件已添加到目标文件夹。',
			pastedTitle: '文件已粘贴',
			refreshedDetail: '当前文件树已重新加载。',
			refreshedTitle: '文件已刷新',
		},
		title: '文件树',
	},
	workspace: {
		actions: {
			connectDesktop: '连接桌面端',
			openRemote: '打开远程',
		},
		empty: {
			detail: '先打开一个本地文件夹，之后在这里浏览和新建文件。',
			title: '还未选择文件夹',
		},
		feedback: {
			savedDetail: '文件已保存到磁盘。',
			savedTitle: '已保存',
		},
		noSelection: {
			detail: '请前往 文件树 选择或创建文件。',
			title: '还未选择文件',
		},
		remoteNoSelection: {
			detail: '请前往远程文件夹选择一个文件。',
			title: '还未选择远程文件',
		},
		remoteFallbackName: '桌面端工作区',
		unsavedChanges: {
			cancel: '继续编辑',
			continueSwitch: '继续切换',
			detail: '工作区中有文件尚未保存。退出前是否先保存？',
			discard: '不保存退出',
			save: '保存并退出',
			switchDetail: '当前工作区有文件尚未保存，继续切换不会自动保存这些修改。',
			title: '有未保存的修改',
		},
	},
	settingsHome: {
		detail: '管理编辑器、外观、AI Provider 和应用信息。',
		eyebrow: '设置',
		sections: {
			ai: {
				detail: 'Provider、模型、API URL、API Key 和行内补全。',
				title: 'AI',
			},
			appearance: {
				detail: '主题、状态栏和底部浮动 Tab 的显示方式。',
				title: '外观',
			},
			about: {
				detail: 'Madora Mobile 的版本、能力和本地优先策略。',
				title: '关于',
			},
			editor: {
				detail: 'CodeMirror、换行、Markdown 工具栏和编辑体验。',
				title: '编辑器',
			},
		},
		title: '设置',
	},
	settingsDetail: {
		about: {
			detail: 'Madora Mobile 会优先在本地完成编辑、预览和 AI Provider 调用。',
			items: {
				desktopParity: {
					detail: '移动端正在按 Desktop 的能力逐步补齐。',
					title: 'Desktop 能力同步',
				},
				localFirst: {
					detail: '草稿和 Provider 配置保存在本机，API Key 使用安全存储。',
					title: '本地优先',
				},
				product: {
					detail: 'Markdown 编辑、预览、同步和 AI 补全。',
					title: 'Madora Mobile',
				},
			},
			title: '关于',
		},
		appearance: {
			detail: '当前保留系统主题和透明状态栏，后续样式项会放在这里。',
			items: {
				floatingTabs: {
					detail: '底部主导航集中在右下角胶囊里。',
					title: '浮动 Tab',
				},
				systemTheme: {
					detail: '跟随系统深浅色模式。',
					title: '系统主题',
				},
				transparentStatusBar: {
					detail: '工作区内容延伸到状态栏，编辑器内部处理顶部安全距离。',
					title: '透明状态栏',
				},
			},
			title: '外观',
		},
		editor: {
			detail: '编辑器使用 CodeMirror，并保持移动端键盘工具栏体验。',
			items: {
				codeMirror: {
					detail: 'Markdown 编辑区由 CodeMirror WebView 承载。',
					title: 'CodeMirror',
				},
				lineWrapping: {
					detail: '长行在编辑区内自动换行。',
					title: '自动换行',
				},
				markdownToolbar: {
					detail: '键盘唤起时，底部 Tab 切换为 Markdown 操作。',
					title: 'Markdown 工具栏',
				},
			},
			title: '编辑器',
		},
		values: {
			enabled: '已开启',
			followSystem: '跟随系统',
		},
	},
	editor: {
		errors: {
			cannotResolveParentDirectory: '无法解析文件所在文件夹。',
			createFileFailed: '创建文件失败。',
			createFolderFailed: '创建文件夹失败。',
			deleteItemFailed: '删除项目失败。',
			emptyFileName: '文件名不能为空。',
			fileAlreadyExists: '已存在同名文件。',
			localFolderRequiredForFiles: '请先打开本地文件夹，再在这里创建文件。',
			localFolderRequiredForFolders: '请先打开本地文件夹，再在这里创建文件夹。',
			notConnected: '未连接到桌面端。',
			openFolderFailed: '打开文件夹失败。',
			openLocalFileFailed: '打开本地文件失败。',
			openLocalFolderFailed: '打开本地文件夹失败。',
			openRemoteWorkspaceFailed: '打开远程工作区失败。',
			pasteFileFailed: '粘贴文件失败。',
			readFileFailed: '读取文件失败。',
			refreshFilesFailed: '刷新文件失败。',
			remoteNoFiles: '远程工作区没有返回文件。',
			remoteNoRoot: '远程工作区没有返回根文件夹。',
			remoteWorkspaceRequired: '请先在桌面端打开工作区，再同步远程文件。',
			renameFileFailed: '重命名本地文件失败。',
			saveFileFailed: '保存文件失败。',
			singlePathSegment: '文件名不能包含路径分隔符。',
			unexpectedResponse: '桌面端返回了无法识别的响应。',
			writeFailed: '写入文件失败。',
		},
	},
	markdownEditor: {
		loading: '正在加载 CodeMirror',
		loadFailed: 'CodeMirror 编辑器加载失败。',
		loadTimeout: 'CodeMirror 编辑器没有完成加载。',
		androidAssetsMissing:
			'这个 Android 构建里没有找到 CodeMirror 资源。请重新构建并安装开发 App，确保 android_asset/codeditor/editor.html 被打包进去。',
		completion: {
			accept: '确认',
			loading: '正在补全',
		},
		saveCapsule: {
			save: '保存',
			saving: '保存中',
			saved: '已保存',
		},
		toolbar: {
			copyFile: '复制文件',
			edit: '编辑',
			image: '图片',
			link: '链接',
			pasteFile: '粘贴文件',
			preview: '预览',
			renameFile: '重命名文件',
		},
		placeholder: {
			bold: '加粗文本',
			image: '图片描述',
			italic: '斜体文本',
			link: '链接文本',
			strikethrough: '删除线文本',
			underline: '下划线文本',
		},
	},
	syncSettings: {
		detail: '通过局域网配对 Madora 桌面端，并管理本地同步记录。',
		eyebrow: '同步',
		connection: {
			detail: '连接到桌面端同步服务的 WebSocket 通道。',
			lastSync: '上次同步',
			neverSynced: '还未同步',
			refreshFiles: '刷新文件',
			reconnect: '重新连接',
			state: '状态',
			title: '连接',
		},
		emptyTrusted: '还没有配对设备。',
		errors: {
			authError: '桌面端认证失败，请重新扫码配对。',
			connectionClosed: '桌面端连接已断开。',
			connectionReset: '桌面端连接已重置。',
			invalidQr: '无效的配对二维码。',
			notConnected: '尚未连接到桌面端。',
			openDatabaseFailed: '打开同步数据库失败。',
			refreshFilesFailed: '刷新远程文件失败。',
			removeTrustedFailed: '移除信任设备失败。',
			serverError: '桌面端同步服务返回错误。',
			unexpectedResponse: '桌面端返回了无法识别的响应。',
			writeFailed: '写入远程文件失败。',
		},
		localDevice: {
			defaultName: 'Madora 手机',
			detail: '这个名称会显示在桌面端的同步状态和远程编辑提示中。',
			edit: '修改名称',
			placeholder: '例如 Madora 手机',
			saving: '保存中',
			title: '本机同步名称',
		},
		pairing: {
			detail: '扫描桌面端二维码，通过局域网完成配对。',
			eyebrow: '设备',
			instructions: '打开 Madora 桌面端 → 设置 → 同步。',
			pair: '扫码配对',
			ready: '准备配对',
			repair: '重新扫码',
			title: '桌面端配对',
		},
		trustedDevices: {
			detail: '本地保存这些设备，用于后续重连。',
			removeConfirm: '从信任设备中移除 {{name}}？',
			title: '信任设备',
		},
		title: '同步设置',
	},
	qrScanner: {
		cancel: '取消',
		detail: '将摄像头对准 Madora 桌面端设置里显示的二维码。',
		grantCamera: '授予摄像头权限',
		permission: '需要摄像头权限才能扫描配对二维码。',
		title: '扫描桌面端二维码',
	},
	aiSettings: {
		apiKey: 'API Key',
		apiKeyPlaceholderSaved: '输入新 Key 可替换已保存的 Key',
		apiKeyStatus: {
			missing: '当前 Provider 还没有保存 API Key。',
			saved: '当前 Provider 已保存 API Key。',
		},
		apiUrl: 'API URL',
		deleteKey: '删除 Key',
		detail: '本地 AI 补全复用 Desktop 后端同一套 Provider 路由和 FIM Prompt。',
		enable: {
			detail: '开启后，编辑器会直接从手机本地配置的 Provider 请求行内补全。',
			title: '行内补全',
		},
		eyebrow: 'AI',
		messages: {
			deleted: 'API Key 已删除。',
			saved: 'API Key 已保存。',
		},
		model: 'Model',
		protocol: '自定义协议',
		protocols: {
			anthropic: 'Anthropic',
			google: 'Google',
			openai: 'OpenAI',
		},
		provider: 'Provider',
		saveKey: '保存 Key',
		title: 'AI 设置',
		useSsl: 'URL 未带协议时使用 HTTPS',
	},
};

export default zhCN;
