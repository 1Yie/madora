const ko = {
	common: {
		actions: {
			back: '뒤로',
			cancel: '취소',
			close: '닫기',
			delete: '삭제',
			disconnect: '연결 해제',
			discard: '저장 안 함',
			refresh: '새로고침',
			save: '저장',
		},
		labels: {
			apiKey: 'API Key',
			apiUrl: 'API URL',
			author: '작성자',
			https: 'HTTPS',
			language: '언어',
			model: 'Model',
			protocol: '프로토콜',
			provider: 'Provider',
			sourceCode: '소스 코드',
			version: '버전',
			website: '웹사이트',
		},
		status: {
			ai: 'AI',
			authenticating: '인증 중',
			connected: '연결됨',
			connecting: '연결 중',
			disconnected: '연결 끊김',
			discovering: '탐색 중',
			idle: '대기 중',
			pending: '대기 중',
			synced: '동기화 완료',
			syncing: '동기화 중',
			trusted: '신뢰됨',
		},
	},
	language: {
		description:
			'기본적으로 기기 언어를 따르며, 언제든지 여기서 변경할 수 있습니다.',
		label: '언어',
		options: {
			en: 'English',
			ja: '日本語',
			ko: '한국어',
			system: '기기 따르기',
			zhCN: '简体中文',
		},
	},
	settings: {
		mobileHome: {
			description:
				'테마와 인터페이스, 입력 동작, 동기화, 제품 정보를 설정합니다.',
			detail: {
				about: '제품 버전, 링크, 업데이트, 오픈소스 라이선스.',
				appearance: '언어, 테마 모드, 편집기 글자 크기.',
				editor: '자동 저장과 인라인 AI 자동 완성 설정.',
			},
		},
		openAria: '설정 열기',
		sections: {
			about: { description: '제품 및 링크', label: '정보' },
			appearance: { description: '테마와 인터페이스', label: '모양' },
			ai: { description: 'Provider, 모델, API Key', label: 'AI' },
			editor: { description: '입력 및 편집', label: '편집기' },
			sync: { description: '동기화 및 설정', label: '동기화' },
		},
		ai: {
			apiKeyMissing: 'Key 미저장',
			apiKeySaved: 'Key 저장됨',
			description:
				'편집기 인라인 완성에 사용할 Provider를 설정합니다. 자격 증명은 이 기기에만 저장됩니다.',
		},
		appearance: {
			cards: {
				accent: { title: '테마 강조색' },
				editor: { title: '편집기 영역' },
				language: {
					description:
						'기본적으로 기기 언어를 따르며, 특정 언어로 고정할 수도 있습니다.',
					title: '언어',
				},
				tabs: { title: '탭' },
				theme: { title: '테마 모드' },
			},
			accentOptions: {
				amber: '앰버',
				custom: '사용자 지정',
				cyan: '시안',
				default: '기본',
				description:
					'시스템을 따르거나, 기본 테마를 사용하거나, 고정 강조색을 선택할 수 있습니다.',
				green: '그린',
				indigo: '인디고',
				purple: '퍼플',
				red: '레드',
				system: '시스템',
			},
			editorTextSize: {
				description: 'Markdown 편집기의 글자 크기를 조절합니다.',
				label: '글자 크기',
				reset: '재설정',
			},
			tabBar: {
				scroll: {
					description:
						'모든 탭을 한 줄로 유지하고, 넘치는 부분은 가로 스크롤로 표시합니다.',
					label: '한 줄 스크롤',
				},
				wrap: {
					description: '탭이 너비를 초과하면 여러 줄로 자동 줄바꿈합니다.',
					label: '줄바꿈',
				},
			},
			theme: {
				dark: {
					description: '야간이나 긴 독서에 적합합니다.',
					label: '다크',
				},
				light: {
					description: '밝은 환경에 더 적합합니다.',
					label: '라이트',
				},
				system: {
					description: '현재 기기 또는 시스템 설정을 따릅니다.',
					label: '시스템',
				},
			},
			zoomLevel: {
				label: '인터페이스 확대',
				large: '크게',
				medium: '보통',
				small: '작게',
			},
		},
		editor: {
			apiKeyHint: {
				existing:
					'이 Provider에는 이미 API Key가 저장되어 있습니다. 새 Key를 입력해 교체할 수 있습니다.',
				missing: '이 Provider에는 아직 API Key가 저장되어 있지 않습니다.',
				storage:
					'Key는 시스템 보안 저장소에 저장되며, 로컬 요청에만 사용됩니다.',
			},
			apiKeyPlaceholderSaved: '저장됨',
			apiUrlHint: '사용자 지정 Provider의 엔드포인트 URL입니다.',
			cards: {
				ai: { title: 'AI 완성' },
				input: { title: '입력 동작' },
				window: { title: '창' },
			},
			closeBehavior: {
				exit: {
					description:
						'닫기 버튼을 누르면 앱이 종료됩니다. 저장하지 않은 변경 사항이 있으면 먼저 확인합니다.',
					label: '앱 종료',
				},
				minimize: {
					description:
						'닫기 버튼을 누르면 메인 창이 숨겨집니다. Madora는 트레이 아이콘으로 계속 실행됩니다.',
					label: '트레이로 최소화',
				},
			},
			customConfigTitle: '사용자 지정 Provider',
			customProtocolOptions: {
				anthropic: {
					description: 'Anthropic 호환 /v1/messages 엔드포인트에 사용합니다.',
					label: 'Anthropic Compatible',
				},
				google: {
					description:
						'Google 호환 models/{id}:generateContent 엔드포인트에 사용합니다.',
					label: 'Google Compatible',
				},
				openai: {
					description:
						'OpenAI 호환 /v1/chat/completions 엔드포인트에 사용합니다.',
					label: 'OpenAI Compatible',
				},
			},
			customProtocolPlaceholder: '호환 프로토콜 선택...',
			httpsHint:
				'프로토콜을 입력하지 않으면 자동으로 사용됩니다. 자체 호스팅 서비스에서만 비활성화하세요.',
			modelHintCustom:
				'모델 이름을 직접 입력하세요. 기능 차이는 Provider 자료를 참고하세요.',
			modelPlaceholder: '모델 선택...',
			providerHint:
				'각 Provider의 Key와 모델은 개별적으로 저장되며, 전환해도 다른 설정을 덮어쓰지 않습니다.',
			rows: {
				autoSave: {
					description: '편집기 변경 사항을 자동으로 디스크에 기록합니다.',
					title: '자동 저장',
				},
				enableAi: {
					description: '입력 중에 인라인 완성을 자동으로 요청합니다.',
					title: 'AI 완성 활성화',
				},
				hiddenFiles: {
					prefix: '사이드바에서',
					suffix: '(으)로 시작하는 파일과 폴더를 표시합니다.',
					title: '숨김 파일 표시',
				},
			},
			toasts: {
				apiKeyDeleted: '시스템 보안 저장소에서 API Key를 삭제했습니다',
				apiKeyDeleteFailed: 'API Key 삭제에 실패했습니다',
				apiKeySaved: '시스템 보안 저장소에 API Key를 저장했습니다',
				apiKeySaveFailed: 'API Key 저장에 실패했습니다',
			},
		},
		about: {
			actions: {
				check: '업데이트 확인',
				viewRelease: '릴리스 보기',
			},
			cards: {
				licenses: {
					description:
						'Madora가 사용하는 오픈소스 종속성과 라이선스를 확인합니다.',
					title: '오픈소스 라이선스',
				},
				update: {
					description: '새 빌드를 다운로드하기 전에 최신 릴리스를 확인합니다.',
					title: '소프트웨어 업데이트',
				},
			},
			currentVersionDescription: '현재 버전: {{version}}',
			stats: {
				author: '작성자',
				sourceCode: '소스 코드',
				version: '버전',
				website: '웹사이트',
			},
		},
	},
	tabs: {
		ai: 'AI',
		devices: '기기',
		fileTree: '파일',
		settings: '설정',
		workspace: '워크스페이스',
	},
	fileTree: {
		actions: {
			bookmark: '북마크',
			cancelCopy: '복사 취소',
			delete: '삭제',
			locateCurrent: '현재 파일 찾기',
			newFolder: '새 폴더',
			newFile: '새 파일',
			openFile: '파일 열기',
			openFolder: '폴더 열기',
			refresh: '파일 새로고침',
			removeBookmark: '북마크 해제',
		},
		bookmarks: '북마크',
		copyBanner: {
			title: '"{{name}}" 붙여넣기 준비됨',
		},
		delete: {
			detail: '이 워크스페이스에서 "{{name}}"을(를) 삭제하시겠습니까?',
			title: '항목 삭제',
		},
		detail: '로컬 파일과 폴더',
		tabs: {
			local: '로컬 폴더',
			remote: '원격 폴더',
		},
		empty: {
			detail: '로컬 폴더를 열어 여기서 파일을 탐색하고 만들 수 있습니다.',
			title: '선택된 폴더가 없습니다',
		},
		remoteDisconnected: {
			action: '동기화 설정 열기',
			detail:
				'원격 동기화 연결이 끊어졌습니다. 데스크톱 앱에 다시 연결하거나 페어링하면 원격 파일을 다시 볼 수 있습니다.',
			title: '원격 동기화 연결 끊김',
		},
		remoteEmpty: {
			detail: '데스크톱 워크스페이스에 현재 표시할 파일이 없습니다.',
			title: '원격 폴더가 비어 있습니다',
		},
		feedback: {
			copyCanceledDetail: '복사한 파일을 지웠습니다.',
			copyCanceledTitle: '복사를 취소했습니다',
			copyReadyDetail: '"{{name}}"을(를) 폴더에 붙여넣을 수 있습니다.',
			copyReadyTitle: '파일을 복사했습니다',
			locatedDetail: '파일 트리가 현재 파일로 이동했습니다.',
			locatedTitle: '현재 파일을 찾았습니다',
			locateUnavailableDetail: '먼저 파일을 열거나 선택하세요.',
			locateUnavailableTitle: '찾을 파일이 없습니다',
			pastedDetail: '복사한 파일을 선택한 폴더에 추가했습니다.',
			pastedTitle: '파일을 붙여넣었습니다',
			refreshedDetail: '현재 파일 트리를 다시 불러왔습니다.',
			refreshedTitle: '파일을 새로고침했습니다',
		},
		title: '파일 트리',
	},
	workspace: {
		empty: {
			detail:
				'먼저 로컬 폴더를 연 뒤, 그 안에서 Markdown 파일을 만들거나 선택하세요.',
			title: '선택된 파일이 없습니다',
		},
		feedback: {
			savedDetail: '파일이 디스크에 저장되었습니다.',
			savedTitle: '저장됨',
		},
		noSelection: {
			detail: '파일 탭에서 파일을 선택하거나 만드세요.',
			title: '선택된 파일이 없습니다',
		},
		remoteNoSelection: {
			detail: '원격 폴더에서 파일을 선택하세요.',
			title: '선택된 원격 파일이 없습니다',
		},
		unsavedChanges: {
			cancel: '계속 편집',
			continueSwitch: '계속 전환',
			detail:
				'워크스페이스에 저장되지 않은 변경 사항이 있습니다. 나가기 전에 저장하시겠습니까?',
			discard: '저장하지 않고 나가기',
			save: '저장하고 나가기',
			switchDetail:
				'워크스페이스에 저장되지 않은 변경 사항이 있습니다. 계속하면 저장하지 않고 전환합니다.',
			title: '저장되지 않은 변경 사항',
		},
	},
	settingsHome: {
		detail: '편집기 동작, 모양, AI Provider, 앱 정보를 관리합니다.',
		eyebrow: '설정',
		sections: {
			ai: {
				detail: 'Provider, 모델, API URL, API Key, 인라인 완성.',
				title: 'AI',
			},
			appearance: {
				detail: '테마, 상태 표시줄, 하단 플로팅 탭 표시.',
				title: '모양',
			},
			about: {
				detail: 'Madora Mobile의 버전, 기능, 로컬 우선 정책.',
				title: '정보',
			},
			editor: {
				detail: 'CodeMirror, 줄바꿈, Markdown 툴바, 편집 경험.',
				title: '편집기',
			},
		},
		title: '설정',
	},
	settingsDetail: {
		about: {
			detail:
				'Madora Mobile은 편집, 미리보기, AI Provider 호출을 로컬 우선으로 처리합니다.',
			items: {
				desktopParity: {
					detail: '모바일은 데스크톱 기능에 맞춰 순차적으로 보완하고 있습니다.',
					title: '데스크톱 기능 동기화',
				},
				localFirst: {
					detail:
						'초안과 Provider 설정은 기기에 저장되며, API Key는 보안 저장소를 사용합니다.',
					title: '로컬 우선',
				},
				product: {
					detail: 'Markdown 편집, 미리보기, 동기화, AI 완성.',
					title: 'Madora Mobile',
				},
			},
			title: '정보',
		},
		appearance: {
			detail:
				'현재 시스템 테마와 투명 상태 표시줄이 활성화되어 있으며, 스타일 옵션은 여기에 추가될 예정입니다.',
			items: {
				floatingTabs: {
					detail: '주요 탐색이 우측 하단 캡슐에 모여 있습니다.',
					title: '플로팅 탭',
				},
				systemTheme: {
					detail: '시스템의 라이트/다크 모드를 따릅니다.',
					title: '시스템 테마',
				},
				transparentStatusBar: {
					detail:
						'워크스페이스 콘텐츠가 상태 표시줄까지 확장되며, 편집기가 상단 여백을 내부적으로 처리합니다.',
					title: '투명 상태 표시줄',
				},
			},
			title: '모양',
		},
		editor: {
			detail:
				'편집기는 CodeMirror를 사용하며 모바일 키보드 툴바 흐름을 유지합니다.',
			items: {
				codeMirror: {
					detail: 'Markdown 편집 화면은 CodeMirror WebView로 구동됩니다.',
					title: 'CodeMirror',
				},
				lineWrapping: {
					detail: '긴 줄은 편집 영역 안에서 자동으로 줄바꿈됩니다.',
					title: '줄 바꿈',
				},
				markdownToolbar: {
					detail: '키보드가 표시되면 하단 탭이 Markdown 작업으로 전환됩니다.',
					title: 'Markdown 툴바',
				},
			},
			title: '편집기',
		},
		values: {
			enabled: '활성화됨',
			followSystem: '시스템 따르기',
		},
	},
	markdownEditor: {
		loading: 'CodeMirror 불러오는 중',
		loadFailed: 'CodeMirror 편집기를 불러오지 못했습니다.',
		loadTimeout: 'CodeMirror 편집기 로드가 완료되지 않았습니다.',
		androidAssetsMissing:
			'이 Android 빌드에서 CodeMirror 에셋을 찾을 수 없습니다. 개발 앱을 다시 빌드하고 재설치하여 android_asset/codeditor/editor.html이 포함되도록 하세요.',
		completion: {
			accept: '적용',
			loading: '완성 중',
		},
		saveCapsule: {
			save: '저장',
			saving: '저장 중',
			saved: '저장됨',
		},
		toolbar: {
			copyFile: '파일 복사',
			edit: '편집',
			image: '이미지',
			link: '링크',
			pasteFile: '파일 붙여넣기',
			preview: '미리보기',
			renameFile: '파일 이름 변경',
		},
		placeholder: {
			bold: '굵은 텍스트',
			image: '이미지 설명',
			italic: '기울임 텍스트',
			link: '링크 텍스트',
			strikethrough: '취소선 텍스트',
			underline: '밑줄 텍스트',
		},
	},
	syncSettings: {
		detail:
			'로컬 네트워크를 통해 Madora 데스크톱과 페어링하고 로컬 동기화 기록을 관리합니다.',
		eyebrow: '동기화',
		connection: {
			detail: '데스크톱 동기화 서버에 대한 WebSocket 링크입니다.',
			lastSync: '마지막 동기화',
			neverSynced: '아직 동기화되지 않음',
			refreshFiles: '파일 새로고침',
			reconnect: '다시 연결',
			state: '상태',
			title: '연결',
		},
		emptyTrusted: '아직 페어링된 기기가 없습니다.',
		localDevice: {
			defaultName: 'Madora Phone',
			detail: '이 이름은 데스크톱 동기화 상태와 원격 편집 표시에서 사용됩니다.',
			edit: '이름 변경',
			placeholder: '예: Madora Phone',
			saving: '저장 중',
			title: '이 앱의 동기화 이름',
		},
		pairing: {
			detail: '데스크톱 QR을 스캔하여 로컬 네트워크로 페어링합니다.',
			eyebrow: '기기',
			instructions:
				'Madora 데스크톱을 열고 설정 → 동기화에서 표시되는 QR 코드를 스캔하세요.',
			pair: 'QR에서 페어링',
			ready: '페어링 준비됨',
			repair: 'QR로 다시 페어링',
			title: '데스크톱 페어링',
		},
		trustedDevices: {
			detail: '재연결을 위해 로컬에 저장됩니다.',
			removeConfirm: '{{name}}을(를) 신뢰할 수 있는 기기에서 제거할까요?',
			title: '신뢰할 수 있는 기기',
		},
		title: '동기화 설정',
	},
	qrScanner: {
		cancel: '취소',
		detail: '카메라를 Madora 데스크톱 설정에 표시된 QR 코드에 비추세요.',
		grantCamera: '카메라 접근 허용',
		permission: '페어링 QR 코드를 스캔하려면 카메라 접근 권한이 필요합니다.',
		title: '데스크톱 QR 스캔',
	},
	aiSettings: {
		apiKey: 'API Key',
		apiKeyPlaceholderSaved: '새 Key를 입력해 저장된 Key 교체',
		apiKeyStatus: {
			missing: '이 Provider에는 아직 API Key가 저장되어 있지 않습니다.',
			saved: '이 Provider에 API Key가 저장되어 있습니다.',
		},
		apiUrl: 'API URL',
		deleteKey: 'Key 삭제',
		detail:
			'로컬 AI 완성은 데스크톱 백엔드와 동일한 Provider 라우팅과 FIM 프롬프트를 사용합니다.',
		enable: {
			detail: '활성화하면 편집기가 이 기기에서 로컬 인라인 완성을 요청합니다.',
			title: '인라인 완성',
		},
		eyebrow: 'AI',
		messages: {
			deleted: 'API Key가 삭제되었습니다.',
			saved: 'API Key가 저장되었습니다.',
		},
		model: 'Model',
		protocol: '사용자 지정 프로토콜',
		protocols: {
			anthropic: 'Anthropic',
			google: 'Google',
			openai: 'OpenAI',
		},
		provider: 'Provider',
		saveKey: 'Key 저장',
		title: 'AI 설정',
		useSsl: 'URL에 스킴이 없으면 HTTPS 사용',
	},
};

export default ko;
