const ja = {
	common: {
		actions: {
			activate: '有効化',
			cancel: 'キャンセル',
			close: '閉じる',
			copy: 'コピー',
			cut: '切り取り',
			confirm: '確認',
			continue: '続行',
			create: '作成',
			delete: '削除',
			disable: '無効化',
			dismiss: '閉じる',
			enterEditor: 'エディタを開く',
			finish: '完了',
			paste: '貼り付け',
			retry: '再テスト',
			save: '保存',
			skip: 'スキップ',
			tryFirst: 'まず試す',
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
			current: '現在',
			loading: '読み込み中...',
			notAvailable: '利用不可',
			saved: '保存済み',
			unknownError: '不明なエラー',
		},
	},
	language: {
		description: '既定では端末の言語に従います。ここでいつでも変更できます。',
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
		openAria: '設定を開く',
		dialogTitle: '設定',
		sections: {
			about: { label: '情報' },
			appearance: { label: '外観' },
			cli: { description: 'コマンドラインツール', label: 'CLI' },
			editor: { label: 'エディタ' },
			license: { label: 'ライセンス' },
			sync: { label: '同期' },
		},
		appearance: {
			cards: {
				language: {
					description: '既定では端末の言語に従い、必要なら固定できます。',
					title: '言語',
				},
				tabs: { title: 'タブ' },
				editor: { title: '編集エリア' },
				theme: { title: 'テーマモード' },
				accent: { title: 'アクセントカラー' },
			},
			tabBar: {
				scroll: {
					description:
						'すべてのタブを1行に保ち、はみ出した分は横スクロールで表示します。',
					label: '1行スクロール',
				},
				wrap: {
					description: 'タブが幅を超えたら自動で折り返します。',
					label: '折り返し',
				},
			},
			editorTextSize: {
				label: '文字サイズ',
			},
			zoomLevel: {
				label: 'インターフェース拡大率',
				small: '小',
				medium: '中',
				large: '大',
			},
			theme: {
				dark: {
					description: '夜間や長時間の読書に適しています。',
					label: 'ダーク',
				},
				light: { description: '明るい環境に向いています。', label: 'ライト' },
				system: {
					description: '現在の端末やOS設定に合わせます。',
					label: 'システムに従う',
				},
			},
			accentOptions: {
				amber: 'アンバー',
				custom: 'カスタム',
				cyan: 'シアン',
				default: 'デフォルト',
				green: 'グリーン',
				indigo: 'インディゴ',
				purple: 'パープル',
				red: 'レッド',
				system: 'システムに従う',
			},
		},
		editor: {
			cards: {
				ai: { title: 'AI 補完' },
				input: { title: '入力動作' },
				window: { title: 'ウィンドウ' },
			},
			rows: {
				autoSave: {
					description: '編集中の内容を自動でファイルへ保存します。',
					title: '自動保存',
				},
				enableAi: {
					description: '入力中にインライン補完を自動で取得します。',
					title: 'AI 自動補完を有効化',
				},
				hiddenFiles: {
					prefix: 'サイドバーで',
					suffix: 'で始まるファイルやフォルダーを表示します。',
					title: '隠しファイルを表示',
				},
			},
			closeBehavior: {
				minimize: {
					description:
						'閉じるボタンでメインウィンドウを隠し、トレイアイコンから実行を継続します。',
					label: 'トレイに最小化',
				},
				exit: {
					description:
						'閉じるボタンでアプリを終了します。未保存の変更は先に確認します。',
					label: 'アプリを終了',
				},
			},
			providerHint:
				'各 Provider の API Key とモデル設定は個別に保存され、切り替えても上書きされません。',
			customConfigTitle: 'カスタム Provider',
			customProtocolPlaceholder: '互換プロトコルを選択...',
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
			apiUrlHint: 'カスタム Provider のエンドポイント URL。',
			httpsHint:
				'プロトコル未指定時は自動で使用されます。セルフホスト環境のみ無効化してください。',
			apiKeyHint: {
				existing:
					'この Provider には API Key が保存されています。新しい値を保存すると上書きされます。',
				missing: 'この Provider にはまだ API Key が保存されていません。',
				storage:
					'Key はシステムのキーチェーンに保存され、ローカルのリクエストにのみ使用されます。',
			},
			apiKeyPlaceholderSaved: '保存済み',
			editApiKeyAria: 'API Key を編集',
			confirmSaveAria: '保存を確定',
			cancelEditAria: '編集をキャンセル',
			modelHintCustom:
				'モデル名を直接入力してください。機能差は各 Provider の説明を参照してください。',
			modelPlaceholder: 'モデルを選択...',
			loadingModels: 'モデル一覧を読み込み中...',
			loadingSelect: '読み込み中...',
			toasts: {
				apiKeyDeleted: 'API Key をシステムキーチェーンから削除しました',
				apiKeyDeleteFailed: 'API Key の削除に失敗しました',
				apiKeySaved: 'API Key をシステムキーチェーンに保存しました',
				apiKeySaveFailed: 'API Key の保存に失敗しました',
			},
		},
		cli: {
			cards: {
				cli: { title: 'CLI' },
				status: { title: '状態' },
			},
			rows: {
				install: {
					description:
						'同梱の `mado` コマンドをインストールし、端末から直接呼び出せるようにします。',
					title: 'CLI をインストール',
				},
			},
			stats: {
				cliSource: 'CLI ソース',
				command: 'シェルコマンド',
				installPath: 'インストール先',
				path: 'PATH',
			},
			statusText: {
				available: '利用可能',
				notDetected: '未検出',
				notFound: '見つかりません',
				notResolved: '未解決',
				pathReady: 'インストール先は PATH に含まれています',
				pathMissing: 'インストール先は PATH に含まれていません',
				restartTerminal: '端末を再起動してください',
				terminalRefreshPending: 'インストール済み。端末の更新待ちです',
				usableCommand: '{{command}} として利用できます',
			},
			toasts: {
				fetchStatusFailed: 'CLI 状態の取得に失敗しました: {{error}}',
				installFailed: 'CLI のインストールに失敗しました: {{error}}',
				installed: 'CLI をインストールしました',
				installedAndPathUpdated: 'CLI をインストールし、PATH を更新しました',
				installedRestartTerminal:
					'CLI をインストールしました。`mado` を使う前に端末を再起動してください。',
				installedWithHint: 'CLI を {{dest}} にインストールしました。{{hint}}',
				removed: 'CLI を削除しました',
				removedAndPathCleaned: 'CLI を削除し、PATH 設定も整理しました',
				uninstallFailed: 'CLI の削除に失敗しました: {{error}}',
			},
		},
		license: {
			cards: {
				details: { title: 'ライセンス詳細' },
			},
			status: {
				active: '有効',
				expired: '期限切れ',
				revoked: '取り消し済み',
				trial: '試用中',
			},
			labels: {
				licensed: '認証済み',
				license: 'Madora ライセンス',
			},
			descriptions: {
				active: 'この端末ではフル機能を利用できます。',
				missing: '有効なライセンスが見つかりませんでした。',
				trialRemaining: '試用期間は残り {{days}} 日です',
			},
			actions: {
				activate: '有効化',
				deactivate: 'この端末を無効化',
				manage: 'ライセンス管理',
				purchase: '購入する',
			},
			purchase: 'ライセンスをお持ちでないですか？購入してください。',
			deviceHint:
				'別の端末で使う必要がありますか？先にこの端末を無効化してください。',
			confirm: {
				title: '無効化の確認',
				description:
					'無効化すると、この端末では再度有効化するまで Madora Pro 機能を利用できなくなります。その後、同じキーを別の端末で利用できます。',
				action: '無効化',
				success: 'ライセンスを無効化しました',
				failed: 'ライセンスの無効化に失敗しました',
			},
			loading: 'ライセンス情報を読み込み中...',
		},
		sync: {
			cards: {
				mode: { title: 'リポジトリ同期' },
			},
			rows: {
				enabled: {
					title: '同期を有効化',
					description:
						'このワークスペースで Git または WebDAV 同期を有効にします。',
				},
			},
			options: {
				git: {
					description:
						'ローカルのバージョン管理。コミット、push、pull、ブランチ管理に対応。',
					label: 'Git',
				},
				madoraSync: {
					description:
						'デスクトップがホストするローカルネットワーク向けリアルタイム同期。モバイルや他の Madora クライアント向け。',
					label: 'Madora Sync',
				},
				webdav: {
					description: 'WebDAV プロトコルによるリモートファイル同期。',
					label: 'WebDAV',
				},
			},
			madora: {
				actions: {
					clearPairingCode: 'コードをクリア',
					issuePairingCode: 'ペアリングコードを生成',
					refreshPairingQr: 'QR コードを更新',
					removeDevice: '削除',
				},
				cards: {
					devices: { title: '信頼済み端末' },
					features: {
						description:
							'これらの設定は、デスクトップホストがローカルクライアントに同期機能をどう公開するかを決めます。',
						title: 'ホスト機能',
					},
					host: { title: 'ホスト設定' },
					pairing: {
						description:
							'モバイル側で QR コードを読み取ると自動でペアリングします。コード入力は予備手段です。',
						title: 'ペアリング',
					},
					status: { title: '接続状態' },
				},
				connectionStates: {
					authenticating: '認証中',
					connected: '接続済み',
					connecting: '接続中',
					disconnected: '未接続',
					discovering: '探索中',
					syncing: '同期中',
				},
				empty: {
					devices: '信頼済み端末はまだありません。',
				},
				fields: {
					deviceName: '端末名',
					fallbackCode: '予備コード',
					pairingCode: 'ペアリングコード',
					port: 'ポート',
				},
				hints: {
					port: 'デスクトップ同期ホスト用に固定ポートを確保します。モバイル端末はこのエンドポイントへ再接続します。',
				},
				rows: {
					enabled: {
						description:
							'モバイルや他の Madora クライアントがこのデスクトップへ接続し、同じワークスペースを共同編集できるようにします。',
						title: '端末コラボレーションを有効化',
					},
					aiSharing: {
						description:
							'モバイル側の AI 補完リクエストをこのデスクトップ経由で処理します。',
						title: 'AI 補完を共有',
					},
					autoStart: {
						description:
							'Madora 起動時にローカル同期ホストを自動で起動します。',
						title: 'ホストを自動起動',
					},
					lanDiscovery: {
						description:
							'このデスクトップをローカルネットワーク上へ公開し、自動検出を有効にします。',
						title: 'LAN 検出',
					},
				},
				status: {
					automaticPairing:
						'QR スキャン時にこのホスト向けのワンタイムペアリングチケットを渡すため、通常は手入力が不要です。',
					availableHosts: '利用可能なホスト',
					connection: '接続',
					expiresAt: '{{time}} に失効',
					expiresIn: 'あと {{time}}',
					expired: '期限切れ',
					fallbackCodeDescription:
						'QR スキャンが使えない場合や、クライアントが自動チケットに未対応の場合のみ使います。',
					hostMode: 'ホストモード',
					lastSeenAt: '最終確認 {{time}}',
					lastSync: '最終同期',
					neverSynced: 'まだ同期していません',
					noRemoteEditor: 'リモート編集の状態はありません',
					noPairingCode: '有効なペアリングコードはありません',
					noReachableHost: '到達可能な LAN アドレスを検出できませんでした',
					pairedDevices: 'ペア済み端末',
					primaryHost: 'プライマリホスト',
					qrUnavailable:
						'利用可能な LAN アドレスが見つかると QR コードを表示します。',
					remoteEditor: 'リモートエディター',
					scanToConnect: 'スキャンして接続',
					trusted: '信頼済み',
					unavailable: 'Madora Sync は利用できません',
					unknownPlatform: '不明なプラットフォーム',
				},
				toasts: {
					loadFailed: 'Madora Sync 設定の読み込みに失敗しました',
					pairingCodeFailed: 'ペアリングコードの更新に失敗しました',
					pairingCodeIssued: 'ペアリングコードを生成しました',
					pairingCodeCopied: 'ペアリングコードをコピーしました',
					pairingUrlCopied: '接続アドレスをコピーしました',
					copyFailed: 'コピーに失敗しました',
					pairingQrFailed: 'ペアリング QR コードの読み込みに失敗しました',
					removeDeviceFailed: '端末の削除に失敗しました',
					saveFailed: 'Madora Sync 設定の保存に失敗しました',
					saved: 'Madora Sync 設定を保存しました',
				},
				validation: {
					invalidPort:
						'1 から 65535 の範囲で有効な TCP ポートを入力してください。',
				},
			},
		},
		about: {
			actions: {
				check: '更新を確認',
				viewRelease: 'リリースを見る',
			},
			cards: {
				licenses: { title: 'オープンソースライセンス' },
				update: {
					title: 'ソフトウェア更新',
				},
			},
			currentVersionDescription: '現在のバージョン: {{version}}',
			stats: {
				author: '作者',
				sourceCode: 'ソースコード',
				version: 'バージョン',
				website: 'ウェブサイト',
			},
			toasts: {
				checkFailed: '更新の確認に失敗しました',
				checkFailedDescription: '現在 GitHub Releases に接続できません。',
				upToDate: 'Madora は最新です（{{version}}）',
				updateAvailableDescription:
					'現在 {{currentVersion}} ・ 最新 {{latestVersion}}',
				updateAvailableTitle: '新しいバージョンがあります',
			},
		},
	},
	setup: {
		testPrompt:
			'# Madora 接続テスト\n\n次の文をそのまま自然に短く続けてください。説明は不要です。\n現在のモデル接続はすでに',
		emptyTestResult:
			'接続に成功しました。モデルは正常に応答しましたが、今回のテストでは表示可能な補完テキストは返されませんでした。',
		validation: {
			apiKeyRequired: 'API Key を入力してください。',
			apiUrlRequired: 'API URL を入力してください。',
			modelRequired: 'モデルを選択または入力してください。',
		},
		welcome: {
			title: 'Madora へようこそ',
			action: 'セットアップを開始',
			taglineTop: 'Markdown editing,',
			taglineBottom: 'powered by AI',
		},
		configure: {
			title: 'Provider を接続',
			description: 'AI 補完エンドポイントを設定します',
		},
		test: {
			title: '接続テスト',
			description: '認証情報とモデル接続を確認しています',
			waiting: '応答を待っています',
			retry: '再テスト',
			finish: '確認を完了',
		},
		license: {
			title: 'ライセンス',
			description:
				'すでにライセンスをお持ちですか？有効化するとすべての機能を利用できます。後で設定から有効化することもできます。',
			activate: 'ライセンスを有効化',
		},
		success: {
			title: '準備完了',
			description:
				'Madora の設定が完了しました。Markdown ファイルを開いてすぐに書き始められます。',
		},
		skipConfirm: {
			title: 'セットアップをスキップしますか？',
			description: '今はスキップして、あとで設定から AI 補完を構成できます。',
			action: 'セットアップをスキップ',
		},
	},
	licenseDialog: {
		title: 'ライセンスを有効化',
		description: 'ライセンスキーを入力して Madora を有効化してください。',
		label: 'ライセンスキー',
		purchaseAction: 'ライセンスを購入',
		purchase: 'まだライセンスをお持ちではありませんか？購入してください。',
		action: '有効化',
		validation: '完全なライセンスキーを入力してください',
		success: '有効化に成功しました',
	},
	licenseBanner: {
		verifying: 'ライセンスを確認しています...',
		revoked: {
			title: 'ライセンスの更新が必要です',
			description:
				'この端末のライセンスは無効になりました。Madora を使い続けるには新しいキーを入力してください。',
			action: '新しいライセンスを有効化',
			switchToTrial: '試用に切り替える',
		},
		expired: {
			title: '試用期間が終了しました',
			description:
				'14 日間の試用期間が終了しました。Madora を使い続けるにはライセンスを有効化してください。',
			action: 'ライセンスを有効化',
		},
		trial: {
			remaining: '試用期間は残り {{days}} 日です',
			action: '有効化',
		},
	},
	topBar: {
		saveFailureFallback: '閉じる前の保存に失敗しました',
		toasts: {
			saveFailed: '閉じる前の保存に失敗しました',
			stillUnsaved: '閉じる前に未保存の変更が残っています',
			stillUnsavedDescription: 'もう一度保存するか、保存せずに閉じてください。',
		},
		confirmClose: {
			title: 'このワークスペースには未保存のドキュメントがあります',
			saving: '未保存の変更を保存しています...',
			description:
				'ウィンドウを閉じる前に、変更を保存するか破棄するかを選んでください。',
			discard: '保存せずに閉じる',
			save: '保存して閉じる',
		},
		confirmMinimize: {
			title: '現在のワークスペースに未保存の変更があります',
			description: 'それでもトレイに最小化しますか？',
			confirm: 'そのまま最小化',
		},
	},
	errors: {
		applicationError: 'アプリケーションでエラーが発生しました',
		openLinkFailed: 'リンクを開けませんでした',
		retry: '再試行',
	},
	ai: {
		apiKeyRequired: 'まず API Key を入力してください',
		completionFailed: 'AI 補完に失敗しました',
		disabled: 'AI 補完はオフです',
		generating: 'AI 提案を生成しています...',
		ready: 'AI 補完の準備ができました',
		saveApiKeyToUse: 'API Key を保存すると利用できます',
	},
	licenseProvider: {
		activateFailed: '有効化に失敗しました',
		deactivateFailed: '無効化に失敗しました',
		revokedTitle: 'ライセンスが取り消されました',
		revokedDescription:
			'ライセンスが取り消されたため、AI 補完は無効になりました',
	},
	aiSettingsProvider: {
		keychainAccessFailed: 'システムキーチェーンにアクセスできません',
	},
	webdav: {
		tab: {
			connection: '接続',
			connectionDesc: 'サーバーと認証の設定',
			sync: '同期',
			syncDesc: '同期操作と競合戦略',
		},
		connectSuccess: '接続に成功しました',
		connectSuccessWithName: '接続に成功しました — {{name}}',
		connectFailed: '接続に失敗しました',
		testConnectionError: '接続テストに失敗しました',
		configSaved: '設定を保存しました',
		saveConfigFailed: '設定の保存に失敗しました',
		configCleared: '設定を消去しました',
		deleteConfigFailed: '設定の消去に失敗しました',
		syncCompletedWithErrors: '同期は完了しましたが、エラーがあります',
		syncComplete:
			'同期完了 — アップロード {{uploaded}} 件、ダウンロード {{downloaded}} 件',
		syncFailed: '同期に失敗しました',
		notConfigured: 'WebDAV は未設定です',
		lastSyncAt: '前回の同期: {{time}}',
		notSyncedYet: 'まだ同期していません',
		errorCount: '{{count}} 件のエラー',
		configureLabel: 'WebDAV を設定',
		syncLabel: '同期',
		settingsLabel: 'WebDAV 設定',
		connection: {
			cardTitle: 'サーバー設定',
			serverUrl: 'サーバー URL',
			username: 'ユーザー名',
			password: 'パスワード',
			testing: 'テスト中...',
			testAction: '接続をテスト',
			saveAction: '設定を保存',
			clearAction: '設定を消去',
		},
		syncPanel: {
			optionsTitle: '同期オプション',
			remoteSubdir: 'リモートのサブディレクトリ',
			remoteSubdirHint:
				'任意。WebDAV サーバー上でこのワークスペース専用に使うサブディレクトリです。',
			conflictStrategy: '競合時の扱い',
			strategies: {
				localFirst: 'ローカル版を優先',
				remoteFirst: 'リモート版を優先',
				keepBoth: '両方残す',
			},
			manualTitle: '手動同期',
			syncing: '同期中...',
			syncNow: '今すぐ同期',
			resultsTitle: '最新の同期結果',
			uploaded: '{{count}} 件アップロード',
			downloaded: '{{count}} 件ダウンロード',
			conflicts: '{{count}} 件の競合を解決',
			errors: '{{count}} 件のエラー',
		},
	},
	git: {
		gitOperationFailed: 'Git 操作に失敗しました',
		remoteSaveFailed: 'リモートの保存に失敗しました',
		remoteSaveFailedHint: 'リモート名とリポジトリ URL を入力してください',
		commitFailed: 'コミットに失敗しました',
		commitMessageRequired: 'コミットメッセージを入力してください',
		mergeConflicts: 'マージ競合があります',
		sshKeySelected: 'SSH 秘密鍵ファイルを選択しました',
		revertConflicts: 'リバート競合があります',
		history: '履歴',
		changes: '変更',
		staged: 'ステージ済み',
		conflict: '競合',
		noChanges: '変更はありません',
		commitAll: 'すべてコミット',
		commitMessage: 'コミットメッセージ',
		commitPlaceholder: '今回の変更内容を入力',
		moreActions: 'その他の操作',
		undoLastCommit: '最新コミットを取り消す',
		undoDescription: '最新コミットを取り消し、変更内容は作業ツリーに残します。',
		confirmUndo: 'コミットを取り消す',
		revertSelectedCommit: '選択したコミットをリバート',
		revertThisCommit: 'このコミットをリバート',
		confirmRevert: 'コミットをリバート',
		remoteName: 'リモート名',
		remoteUrl: 'リモート URL',
		saveRemote: 'リモートを保存',
		pullAction: 'Pull',
		pushAction: 'Push',
		sshAuth: 'SSH 認証',
		sshUsername: 'SSH ユーザー名',
		sshKeyPath: 'SSH 秘密鍵',
		sshPassphrase: 'SSH パスフレーズ',
		passphrasePlaceholder:
			'秘密鍵が暗号化されている場合はパスフレーズを入力してください',
		httpsAuth: 'HTTPS 認証',
		httpsUsername: 'ユーザー名',
		httpsPassword: 'パスワード',
		tokenOrPassword: 'トークンまたはパスワード',
		selectFile: 'ファイルを選択',
		stage: 'ステージ',
		stageAll: 'すべてステージ',
		unstage: 'ステージ解除',
		unstageAll: 'すべてステージ解除',
		commitLabel: {
			commitStaged: 'ステージ済みの変更をコミット',
			resolve: '先に競合を解決',
			merging: '先にマージ競合を解決',
			reverting: '先にリバート競合を解決',
			cherryPicking: '先に Cherry-pick 競合を解決',
			rebasing: '先に Rebase 競合を解決',
		},
		commitConflict: {
			mixed:
				'{{with}} 件のファイルはインライン競合を解決する必要があり、{{without}} 件はそのままステージできます。',
			resolveFirst:
				'これらのファイルは先にエディタでインライン競合を解決してください。',
			noMarkers:
				'これらの競合にはインラインマーカーがありません。現在のワークスペース版を残すならそのままステージできます。',
			markerTooltip:
				'インライン競合マーカーがあります。先にエディタで解決してください。',
			noMarkerTooltip:
				'インライン競合マーカーはありません。現在のワークスペース版が正しければそのままステージできます。',
			markerWarning:
				'このファイルをステージする前にインライン競合を解決してください。',
			stageAndResolve: '現在の内容をステージして解決済みにする',
		},
		tab: {
			commit: 'コミット',
			history: '履歴',
			remote: 'リモート',
		},
		status: {
			notInitialized: '未初期化',
			clean: '作業ツリーはクリーンです',
			loading: 'リポジトリの状態を読み込み中...',
			notARepo: '現在のワークスペースは Git リポジトリではありません',
			reverting: 'リバート中、{{count}} 件の競合が残っています',
			merging: 'マージ中、{{count}} 件の競合が残っています',
			cherryPicking: 'Cherry-pick 中、{{count}} 件の競合が残っています',
			rebasing: 'Rebase 中、{{count}} 件の競合が残っています',
			conflicts: '{{count}} 件の競合',
			staged: '{{count}} 件ステージ済み',
			unstaged: '{{count}} 件未ステージ',
			ahead: '{{count}} 件先行',
			behind: '{{count}} 件遅れ',
		},
		initSuccess: 'Git リポジトリを初期化しました',
		commitSuccess: 'コミットしました',
		pushSuccess: 'Push が完了しました',
		pullComplete: 'Pull が完了しました',
		fetchComplete: 'リモート更新を取得しました',
		remoteSaved: 'リモートを保存しました',
		undoSuccess: '最新コミットを取り消しました',
		revertSuccess: 'リバートコミットを作成しました',
		createBranchFailed: 'ブランチ作成に失敗しました',
		fetchBranchListFailed: 'ブランチ一覧の取得に失敗しました',
		fetchStatusFailed: 'Git 状態の取得に失敗しました',
		selectFileFailed: 'ファイル選択に失敗しました',
		noBranches: 'ブランチがありません',
		loading: '読み込み中...',
		init: '初期化',
		pull: 'Pull',
		push: 'Push',
		notMadoraRepo: '現在のワークスペースは Git リポジトリではありません',
		revertDescriptionWithSummary:
			'このコミットを打ち消す新しいリバートコミットを作成します: {{summary}}',
	},
	explorerPanel: {
		newDocument: '新しいドキュメント',
		newFolder: '新しいフォルダー',
		rename: '名前を変更',
		copy: 'コピー',
		cut: '切り取り',
		paste: '貼り付け',
		pasteHere: 'ここに貼り付け',
		pasteToDir: '現在のディレクトリに貼り付け',
		delete: '削除',
		restore: '復元',
		save: '保存',
		cancel: 'キャンセル',
		confirmDeleteTitle: '削除の確認',
		confirmDeleteFile: 'ファイル「{{name}}」を削除しますか？',
		confirmDeleteFolder: 'フォルダー「{{name}}」と中身をすべて削除しますか？',
		confirmBatchDelete: '選択した {{items}} を削除しますか？',
		confirmBatchDeleteTitle: '一括削除の確認',
		fileCount: '{{count}} 個のファイル',
		dirCount: '{{count}} 個のフォルダー',
		selectFolder: 'ローカルフォルダーを開く',
		selectFolderDescription:
			'プレビュー可能なファイルがフォルダーツリーに表示されます。',
		startBrowsing: 'フォルダーを開いてブラウズを開始',
		noFilesFound: 'ファイルが見つかりません',
		itemsSelected: '{{count}} 項目を選択中',
		itemsCopied: '{{count}} 項目をコピーしました',
		itemsCut: '{{count}} 項目を切り取りました',
		syncNotEnabled: '同期は有効化されていません',
		bookmarks: 'ブックマーク',
		addBookmark: 'ブックマークを追加',
		removeBookmark: 'ブックマークを解除',
		bookmarkRemoved: 'ブックマークを解除',
		deleteBookmarkWithName: '{{name}} のブックマークを削除',
		showInTree: 'ツリー内で現在のファイルを表示',
		toggleExpand: 'すべて展開 / 折りたたみ',
		collapseWithName: '{{name}} を折りたたむ',
		expandWithName: '{{name}} を展開',
		refreshTree: 'ファイルツリーを更新',
		sorted: 'ソート済み',
		unsorted: '未ソート',
		sortToggle: 'ソート切替',
		createDescription:
			'対象ディレクトリ内に作成します。対象がファイルの場合は同階層に、対象がない場合はワークスペースのルートに作成されます。',
		createFailed: '作成に失敗しました',
		enterFileName: 'ファイル名を入力してください',
		invalidFileExtension: 'ファイル名は .md または .mdx で終わる必要があります',
		enterFolderName: 'フォルダー名を入力してください',
		enterName: '名前を入力してください',
		renameFailed: '名前変更に失敗しました',
		renameFolderDescription: '新しいフォルダー名を入力してください。',
		renameFileDescription: '新しいファイル名を入力してください。',
		createSuccess: '「{{name}}」を作成しました',
		copySuccess: '「{{name}}」をコピーしました',
		cutSuccess: '「{{name}}」を切り取りました',
		pasteSuccess: '「{{name}}」を貼り付けました',
		clearClipboard: 'クリップボード操作をキャンセルしました',
		dropFailed: 'ドロップしたファイルパスを読み取れませんでした',
		confirmRestoreTitle: '削除済みファイルを復元',
		confirmRestoreFromGit: 'Git から「{{name}}」を復元しますか？',
		workspaceOperationFailed: 'ワークスペース操作に失敗しました',
		fileReadFailed: 'ファイルの読み込みに失敗しました',
		importUnsupported: '.md/.mdx ファイルと画像のみインポートできます',
		importSummary: '{{count}} 個のファイルをインポートしました',
		importSummaryWithSkipped:
			'{{imported}} 個をインポートし、{{skipped}} 個をスキップしました',
	},
	tabBar: {
		closeTabWithName: '{{name}} を閉じる',
		outsideWorkspace: 'ワークスペース外',
		closeCurrent: '現在のタブを閉じる',
		closeLeft: '左側のタブを閉じる',
		closeRight: '右側のタブを閉じる',
		keepCurrentOnly: '現在のタブだけ残す',
		closeAll: 'すべてのタブを閉じる',
	},
	conflictEditor: {
		conflictCount: '競合 {{current}} / {{total}}',
		selected: '選択済み',
		keepBoth: '両方残す',
		currentBranch: '現在のブランチ HEAD',
		incomingChanges: '取り込み側の変更',
		useChoice: '採用',
		empty: '（空）',
		resolving: '解決中...',
		complete: '競合解決を完了',
		remaining: '{{count}} 件の競合が未選択です',
	},
	markdownEditor: {
		actions: {
			bold: '太字',
			italic: '斜体',
			strikethrough: '取り消し線',
			underline: '下線',
			link: 'リンクを挿入',
			image: '画像を挿入',
		},
		placeholders: {
			bold: '太字テキスト',
			italic: '斜体テキスト',
			strikethrough: '取り消し線テキスト',
			underline: '下線テキスト',
			link: 'リンクテキスト',
			image: '画像の説明',
		},
		status: {
			dirty: '未保存、',
			saving: '保存中...',
			saved: '保存済み',
			error: '保存に失敗しました',
			manual: '手動保存',
			auto: '編集中に自動保存',
		},
		cursor: {
			lineCol: '{{line}} 行 {{col}} 列',
			characters: '{{count}} 文字',
		},
		toggle: {
			preview: 'プレビューに切り替え',
			edit: 'エディタに切り替え',
		},
	},
	markdownPreview: {
		fileNotFound: 'ファイルが見つかりません',
		externalTitle: '外部ファイルを開きますか？',
		externalDescription:
			'このリンクは現在のワークスペース外を指しています。開くとその場所のファイルを読み取れるようになります。',
		allowAccess: 'アクセスを許可',
	},
	filePreview: {
		conflictNoMarkersTitle: 'この競合にはインラインマーカーがありません',
		conflictNoMarkersDescription:
			'通常は変更/削除や削除/変更の競合です。まず現在のワークスペース版を確認し、保持したい場合はコミットパネルでステージして解決済みにしてください。',
		deletedTitle: 'このファイルはワークスペースから削除されました',
		deletedDescription:
			'Git の変更一覧にはまだ残っています。必要ならサイドバーのコンテキストメニューから復元してください。',
		truncatedTitle: 'プレビューは途中までです',
		truncatedDescription:
			'ファイルが大きいため、先頭部分のみを表示しています。',
		emptyTitle: '利用可能なプレビューがありません',
		emptyDescription:
			'この種類のファイルはまだプレビューできないか、内容が空です。',
		selectFileTitle: 'サイドバーからファイルを選択',
		selectFileDescription:
			'フォルダーを開いて任意のファイルを選ぶと、ここに内容が表示されます。',
		openFolderTitle: 'まだフォルダーが開かれていません',
		openFolderDescription:
			'ローカルフォルダーを開くと、Markdown、画像、テキストファイルをここでプレビューできます。',
	},
} as const;

export default ja;
