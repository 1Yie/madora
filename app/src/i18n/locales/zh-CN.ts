const zhCN = {
	common: {
		actions: {
			back: '返回',
			cancel: '取消',
			close: '关闭',
			delete: '删除',
			disconnect: '断开连接',
			refresh: '刷新',
			save: '保存',
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
			ai: { description: 'Provider、模型和 API Key', label: 'AI' },
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
			newFile: '新建文件',
			openFile: '打开文件',
			openFolder: '打开文件夹',
		},
		detail: '本地文件和文件夹',
		empty: {
			detail: '先打开一个本地文件夹，之后在这里浏览和新建文件。',
			title: '还未选择文件夹',
		},
		title: '文件树',
	},
	workspace: {
		empty: {
			detail:
				'请先打开一个本地文件夹，然后在文件夹内新建或选择 Markdown 文件。',
			title: '还未选择文件',
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
		toolbar: {
			edit: '编辑',
			image: '图片',
			link: '链接',
			preview: '预览',
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
			state: '状态',
			title: '连接',
		},
		emptyTrusted: '还没有配对设备。',
		localStore: {
			detail: '使用 SQLite 保存配对状态和信任设备记录。',
			title: '同步存储',
		},
		metrics: {
			trusted: '信任',
		},
		pairing: {
			detail: '扫描桌面端二维码，通过局域网完成配对。',
			eyebrow: '设备',
			instructions:
				'打开 Madora 桌面端 -> 设置 -> 同步，然后扫描那里显示的二维码。',
			pair: '扫码配对',
			ready: '准备配对',
			repair: '重新扫码',
			title: '桌面端配对',
		},
		trustedDevices: {
			detail: '本地保存这些设备，用于后续重连。',
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
