const ja = {
	common: {
		actions: {
			back: '戻る',
			cancel: 'キャンセル',
			close: '閉じる',
			delete: '削除',
			disconnect: '切断',
			refresh: '更新',
			save: '保存',
		},
		labels: {
			apiKey: 'API Key',
			apiUrl: 'API URL',
			author: '作者',
			https: 'HTTPS',
			language: '言語',
			model: 'Model',
			protocol: 'プロトコル',
			provider: 'Provider',
			sourceCode: 'ソースコード',
			version: 'バージョン',
			website: 'ウェブサイト',
		},
		status: {
			ai: 'AI',
			authenticating: '認証中',
			connected: '接続済み',
			connecting: '接続中',
			disconnected: '未接続',
			discovering: '探索中',
			idle: '待機中',
			pending: '保留中',
			synced: '同期済み',
			syncing: '同期中',
			trusted: '信頼済み',
		},
	},
	language: {
		description:
			'デフォルトではデバイスの言語に従います。ここからいつでも切り替えられます。',
		label: '言語',
		options: {
			en: 'English',
			ja: '日本語',
			ko: '한국어',
			system: 'デバイスに従う',
			zhCN: '简体中文',
		},
	},
	settings: {
		mobileHome: {
			description: 'テーマと画面、入力の挙動、同期、製品情報を設定します。',
			detail: {
				about: '製品のバージョン、リンク、更新情報、オープンソースライセンス。',
				appearance: '言語、テーマモード、エディターの文字サイズ。',
				editor: '自動保存とインライン AI 補完の設定。',
			},
		},
		openAria: '設定を開く',
		sections: {
			about: { description: '製品とリンク', label: '概要' },
			appearance: { description: 'テーマと画面', label: '外観' },
			ai: { description: 'Provider、モデル、API Key', label: 'AI' },
			editor: { description: '入力と編集', label: 'エディター' },
			sync: { description: '同期と設定', label: '同期' },
		},
		ai: {
			apiKeyMissing: 'Key 未保存',
			apiKeySaved: 'Key 保存済み',
			description:
				'エディターのインライン補完で使用する Provider を設定します。認証情報はこのデバイスにのみ保存されます。',
		},
		appearance: {
			cards: {
				accent: { title: 'テーマアクセント' },
				editor: { title: 'エディター表示域' },
				language: {
					description:
						'デフォルトではデバイスの言語に従います。特定の言語に固定することもできます。',
					title: '言語',
				},
				tabs: { title: 'タブ' },
				theme: { title: 'テーマモード' },
			},
			accentOptions: {
				amber: 'アンバー',
				custom: 'カスタム',
				cyan: 'シアン',
				default: 'デフォルト',
				description:
					'システムに従う、デフォルトテーマを使う、または固定のアクセントカラーを選択できます。',
				green: 'グリーン',
				indigo: 'インディゴ',
				purple: 'パープル',
				red: 'レッド',
				system: 'システム',
			},
			editorTextSize: {
				description: 'Markdown エディターの文字サイズを調整します。',
				label: '文字サイズ',
				reset: 'リセット',
			},
			tabBar: {
				scroll: {
					description:
						'すべてのタブを 1 行に保ち、はみ出した分は横スクロールで表示します。',
					label: '1 行スクロール',
				},
				wrap: {
					description: 'タブが幅を超えると複数行に折り返して並びます。',
					label: '折り返し',
				},
			},
			theme: {
				dark: {
					description: '夜間や長時間の読書に最適です。',
					label: 'ダーク',
				},
				light: {
					description: '明るい環境に適しています。',
					label: 'ライト',
				},
				system: {
					description: '現在のデバイスまたはシステム設定に従います。',
					label: 'システム',
				},
			},
			zoomLevel: {
				label: '画面のズーム',
				large: '大',
				medium: '中',
				small: '小',
			},
		},
		editor: {
			apiKeyHint: {
				existing:
					'この Provider には既に API Key が保存されています。新しい Key を入力して上書きできます。',
				missing: 'この Provider にはまだ API Key が保存されていません。',
				storage:
					'Key はシステムのセキュアストレージに保存され、ローカルリクエストにのみ使用されます。',
			},
			apiKeyPlaceholderSaved: '保存済み',
			apiUrlHint: 'カスタム Provider のエンドポイント URL です。',
			cards: {
				ai: { title: 'AI 補完' },
				input: { title: '入力の挙動' },
				window: { title: 'ウィンドウ' },
			},
			closeBehavior: {
				exit: {
					description:
						'閉じるボタンでアプリを終了します。未保存の変更がある場合は先に確認します。',
					label: 'アプリを終了',
				},
				minimize: {
					description:
						'閉じるボタンでメインウィンドウを非表示にします。Madora はトレイアイコンから引き続き実行されます。',
					label: 'トレイに最小化',
				},
			},
			customConfigTitle: 'カスタム Provider',
			customProtocolOptions: {
				anthropic: {
					description: 'Anthropic 互換の /v1/messages エンドポイント向けです。',
					label: 'Anthropic Compatible',
				},
				google: {
					description:
						'Google 互換の models/{id}:generateContent エンドポイント向けです。',
					label: 'Google Compatible',
				},
				openai: {
					description:
						'OpenAI 互換の /v1/chat/completions エンドポイント向けです。',
					label: 'OpenAI Compatible',
				},
			},
			customProtocolPlaceholder: '互換プロトコルを選択...',
			httpsHint:
				'プロトコル未指定時に自動で使用します。自己ホスト型サービスでのみ無効化してください。',
			modelHintCustom:
				'モデル名を直接入力してください。機能の違いは Provider の資料を参照してください。',
			modelPlaceholder: 'モデルを選択...',
			providerHint:
				'各 Provider の Key とモデルは個別に保存され、切り替えても他の設定は上書きされません。',
			rows: {
				autoSave: {
					description: 'エディターの変更を自動的にディスクに書き込みます。',
					title: '自動保存',
				},
				enableAi: {
					description: '入力中にインライン補完を自動的に要求します。',
					title: 'AI 補完を有効化',
				},
				hiddenFiles: {
					prefix: 'サイドバーで先頭が',
					suffix: 'のファイルやフォルダーを表示します。',
					title: '隠しファイルを表示',
				},
			},
			toasts: {
				apiKeyDeleted: 'API Key をシステムのセキュアストレージから削除しました',
				apiKeyDeleteFailed: 'API Key の削除に失敗しました',
				apiKeySaved: 'API Key をシステムのセキュアストレージに保存しました',
				apiKeySaveFailed: 'API Key の保存に失敗しました',
			},
		},
		about: {
			actions: {
				check: '更新を確認',
				viewRelease: 'リリースを見る',
			},
			cards: {
				licenses: {
					description:
						'Madora が使用するオープンソースの依存関係とライセンスを確認します。',
					title: 'オープンソースライセンス',
				},
				update: {
					description:
						'新しいビルドをダウンロードする前に最新のリリースを確認します。',
					title: 'ソフトウェアアップデート',
				},
			},
			currentVersionDescription: '現在のバージョン：{{version}}',
			stats: {
				author: '作者',
				sourceCode: 'ソースコード',
				version: 'バージョン',
				website: 'ウェブサイト',
			},
		},
	},
	tabs: {
		ai: 'AI',
		devices: 'デバイス',
		fileTree: 'ファイル',
		settings: '設定',
		workspace: 'ワークスペース',
	},
	fileTree: {
		actions: {
			bookmark: 'ブックマーク',
			cancelCopy: 'コピーをキャンセル',
			delete: '削除',
			locateCurrent: '現在のファイルへ移動',
			newFolder: '新規フォルダー',
			newFile: '新規ファイル',
			openFile: 'ファイルを開く',
			openFolder: 'フォルダーを開く',
			refresh: 'ファイルを更新',
			removeBookmark: 'ブックマークを解除',
		},
		bookmarks: 'ブックマーク',
		copyBanner: {
			title: '「{{name}}」を貼り付けできます',
		},
		delete: {
			detail: 'このワークスペースから「{{name}}」を削除しますか？',
			title: '項目を削除',
		},
		detail: 'ローカルのファイルとフォルダー',
		tabs: {
			local: 'ローカルフォルダー',
			remote: 'リモートフォルダー',
		},
		empty: {
			detail:
				'ローカルフォルダーを開いて、ここでファイルを閲覧・作成できます。',
			title: 'フォルダーが選択されていません',
		},
		feedback: {
			copyCanceledDetail: 'コピー中のファイルをクリアしました。',
			copyCanceledTitle: 'コピーをキャンセルしました',
			copyReadyDetail: '「{{name}}」をフォルダーに貼り付けできます。',
			copyReadyTitle: 'ファイルをコピーしました',
			locatedDetail: 'ファイルツリーで現在のファイルを表示しました。',
			locatedTitle: '現在のファイルを表示しました',
			locateUnavailableDetail: '先にファイルを開くか選択してください。',
			locateUnavailableTitle: '移動先がありません',
			pastedDetail: 'コピーしたファイルを選択中のフォルダーに追加しました。',
			pastedTitle: 'ファイルを貼り付けました',
			refreshedDetail: '表示中のファイルツリーを再読み込みしました。',
			refreshedTitle: 'ファイルを更新しました',
		},
		title: 'ファイルツリー',
	},
	workspace: {
		empty: {
			detail:
				'先にローカルフォルダーを開き、その中の Markdown ファイルを作成または選択してください。',
			title: 'ファイルが選択されていません',
		},
		noSelection: {
			detail: 'ファイルタブでファイルを選択または作成してください。',
			title: 'ファイルが選択されていません',
		},
	},
	settingsHome: {
		detail: 'エディターの挙動、外観、AI Provider、アプリ情報を管理します。',
		eyebrow: '設定',
		sections: {
			ai: {
				detail: 'Provider、モデル、API URL、API Key、インライン補完。',
				title: 'AI',
			},
			appearance: {
				detail: 'テーマ、ステータスバー、下部のフローティングタブの表示。',
				title: '外観',
			},
			about: {
				detail: 'Madora Mobile のバージョン、機能、ローカルファーストの方針。',
				title: '概要',
			},
			editor: {
				detail: 'CodeMirror、折り返し、Markdown ツールバー、編集体験。',
				title: 'エディター',
			},
		},
		title: '設定',
	},
	settingsDetail: {
		about: {
			detail:
				'Madora Mobile は編集、プレビュー、AI Provider の呼び出しをローカル優先で行います。',
			items: {
				desktopParity: {
					detail: 'モバイル版はデスクトップ版の機能に順次合わせていきます。',
					title: 'デスクトップとの同等性',
				},
				localFirst: {
					detail:
						'下書きと Provider 設定はデバイスに保存されます。API Key はセキュアストレージを使用します。',
					title: 'ローカルファースト',
				},
				product: {
					detail: 'Markdown 編集、プレビュー、同期、AI 補完。',
					title: 'Madora Mobile',
				},
			},
			title: '概要',
		},
		appearance: {
			detail:
				'現在はシステムテーマと透明ステータスバーが有効です。今後のスタイル設定はここに表示されます。',
			items: {
				floatingTabs: {
					detail: '主要なナビゲーションは右下のカプセルにまとめられています。',
					title: 'フローティングタブ',
				},
				systemTheme: {
					detail: 'システムのライト・ダークモードに従います。',
					title: 'システムテーマ',
				},
				transparentStatusBar: {
					detail:
						'ワークスペースの内容がステータスバーまで広がり、エディターが上部の余白を内部で処理します。',
					title: '透明ステータスバー',
				},
			},
			title: '外観',
		},
		editor: {
			detail:
				'エディターは CodeMirror を使用し、モバイルのキーボードツールバーの操作性を維持しています。',
			items: {
				codeMirror: {
					detail: 'Markdown 編集画面は CodeMirror WebView で動作します。',
					title: 'CodeMirror',
				},
				lineWrapping: {
					detail: '長い行は編集領域内で折り返されます。',
					title: '行の折り返し',
				},
				markdownToolbar: {
					detail:
						'キーボード表示中、下部のタブが Markdown 操作に切り替わります。',
					title: 'Markdown ツールバー',
				},
			},
			title: 'エディター',
		},
		values: {
			enabled: '有効',
			followSystem: 'システムに従う',
		},
	},
	markdownEditor: {
		loading: 'CodeMirror を読み込み中',
		loadFailed: 'CodeMirror エディターの読み込みに失敗しました。',
		loadTimeout: 'CodeMirror エディターの読み込みが完了しませんでした。',
		androidAssetsMissing:
			'この Android ビルドに CodeMirror アセットが見つかりません。開発用アプリを再ビルドして再インストールし、android_asset/codeditor/editor.html が同梱されるようにしてください。',
		completion: {
			accept: '確定',
			loading: '補完中',
		},
		toolbar: {
			copyFile: 'ファイルをコピー',
			edit: '編集',
			image: '画像',
			link: 'リンク',
			pasteFile: 'ファイルを貼り付け',
			preview: 'プレビュー',
			renameFile: 'ファイル名を変更',
		},
		placeholder: {
			bold: '太字テキスト',
			image: '画像の説明',
			italic: '斜体テキスト',
			link: 'リンクテキスト',
			strikethrough: '取り消し線テキスト',
			underline: '下線テキスト',
		},
	},
	syncSettings: {
		detail:
			'ローカルネットワーク経由で Madora デスクトップとペアリングし、ローカルの同期記録を管理します。',
		eyebrow: '同期',
		connection: {
			detail: 'デスクトップ同期サーバーへの WebSocket リンクです。',
			lastSync: '前回の同期',
			neverSynced: 'まだ同期されていません',
			refreshFiles: 'ファイルを更新',
			reconnect: '再接続',
			state: '状態',
			title: '接続',
		},
		emptyTrusted: 'まだペアリング済みのデバイスはありません。',
		localStore: {
			detail: 'SQLite でペアリング状態と信頼済みデバイスの記録を保存します。',
			title: '同期ストア',
		},
		metrics: {
			trusted: '信頼済み',
		},
		pairing: {
			detail:
				'デスクトップの QR をスキャンしてローカルネットワークでペアリングします。',
			eyebrow: 'デバイス',
			instructions:
				'Madora デスクトップを開き、設定 → 同步 から表示される QR コードをスキャンしてください。',
			pair: 'QR からペアリング',
			ready: 'ペアリング可能',
			repair: 'QR で再ペアリング',
			title: 'デスクトップとのペアリング',
		},
		trustedDevices: {
			detail: '再接続用にローカルに保存されています。',
			removeConfirm: '{{name}} を信頼済みデバイスから削除しますか？',
			title: '信頼済みデバイス',
		},
		title: '同期設定',
	},
	qrScanner: {
		cancel: 'キャンセル',
		detail:
			'カメラを Madora デスクトップの設定に表示された QR コードに向けてください。',
		grantCamera: 'カメラへのアクセスを許可',
		permission:
			'ペアリング用 QR コードをスキャンするにはカメラへのアクセスが必要です。',
		title: 'デスクトップの QR をスキャン',
	},
	aiSettings: {
		apiKey: 'API Key',
		apiKeyPlaceholderSaved: '新しい Key を入力して保存済みの Key を置き換え',
		apiKeyStatus: {
			missing: 'この Provider にはまだ API Key が保存されていません。',
			saved: 'この Provider には API Key が保存されています。',
		},
		apiUrl: 'API URL',
		deleteKey: 'Key を削除',
		detail:
			'ローカルの AI 補完はデスクトップバックエンドと同じ Provider ルーティングと FIM プロンプトを使用します。',
		enable: {
			detail:
				'有効にすると、エディターがこのデバイスからローカルのインライン補完を要求します。',
			title: 'インライン補完',
		},
		eyebrow: 'AI',
		messages: {
			deleted: 'API Key を削除しました。',
			saved: 'API Key を保存しました。',
		},
		model: 'Model',
		protocol: 'カスタムプロトコル',
		protocols: {
			anthropic: 'Anthropic',
			google: 'Google',
			openai: 'OpenAI',
		},
		provider: 'Provider',
		saveKey: 'Key を保存',
		title: 'AI 設定',
		useSsl: 'URL にスキームがない場合は HTTPS を使用',
	},
};

export default ja;
