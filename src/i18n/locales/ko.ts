const ko = {
	common: {
		actions: {
			activate: '활성화',
			cancel: '취소',
			close: '닫기',
			copy: '복사',
			cut: '잘라내기',
			confirm: '확인',
			continue: '계속',
			create: '생성',
			delete: '삭제',
			disable: '비활성화',
			dismiss: '닫기',
			enterEditor: '에디터 열기',
			finish: '완료',
			paste: '붙여넣기',
			retry: '다시 테스트',
			save: '저장',
			skip: '건너뛰기',
			tryFirst: '먼저 체험하기',
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
			current: '현재',
			loading: '불러오는 중...',
			notAvailable: '사용 불가',
			saved: '저장됨',
			unknownError: '알 수 없는 오류',
		},
	},
	language: {
		description:
			'기본값은 기기 언어를 따르며, 여기서 언제든 변경할 수 있습니다.',
		label: '언어',
		options: {
			en: 'English',
			ja: '日本語',
			ko: '한국어',
			system: '기기 설정 따르기',
			zhCN: '简体中文',
		},
	},
	settings: {
		openAria: '설정 열기',
		sections: {
			about: { description: '제품 정보와 링크', label: '정보' },
			appearance: { description: '테마와 인터페이스', label: '모양' },
			cli: { description: '명령줄 도구', label: 'CLI' },
			editor: { description: '입력과 편집', label: '에디터' },
			license: { description: '활성화와 관리', label: '라이선스' },
			sync: { description: '동기화와 설정', label: '동기화' },
		},
		appearance: {
			cards: {
				language: {
					description:
						'기기 언어를 기본으로 사용하며 필요하면 특정 언어로 고정할 수 있습니다.',
					title: '언어',
				},
				tabs: { title: '탭' },
				editor: { title: '편집 영역' },
				theme: { title: '테마 모드' },
				accent: { title: '테마 색상' },
			},
			tabBar: {
				scroll: {
					description:
						'모든 탭을 한 줄에 유지하고 넘치는 항목은 가로 스크롤로 확인합니다.',
					label: '한 줄 스크롤',
				},
				wrap: {
					description: '탭이 너비를 넘기면 자동으로 줄바꿈합니다.',
					label: '줄바꿈',
				},
			},
			editorTextSize: {
				description:
					'오른쪽 편집 영역에서 입력하는 텍스트 크기를 실시간으로 조절합니다.',
				label: '텍스트 크기',
			},
			zoomLevel: {
				label: '인터페이스 확대',
				small: '작게',
				medium: '보통',
				large: '크게',
			},
			theme: {
				dark: {
					description: '야간이나 장시간 읽기에 적합합니다.',
					label: '다크',
				},
				light: { description: '밝은 환경에 적합합니다.', label: '라이트' },
				system: {
					description: '현재 기기 또는 OS 설정을 따릅니다.',
					label: '시스템 따르기',
				},
			},
			accentOptions: {
				amber: '앰버',
				custom: '사용자 지정',
				cyan: '시안',
				default: '기본',
				green: '그린',
				indigo: '인디고',
				purple: '퍼플',
				red: '레드',
				system: '시스템 따르기',
			},
		},
		editor: {
			cards: {
				ai: { title: 'AI 자동완성' },
				input: { title: '입력 동작' },
				window: { title: '창' },
			},
			rows: {
				autoSave: {
					description: '편집 내용을 자동으로 파일에 저장합니다.',
					title: '자동 저장',
				},
				enableAi: {
					description: '입력 중에 인라인 자동완성을 자동으로 요청합니다.',
					title: 'AI 자동완성 사용',
				},
				hiddenFiles: {
					prefix: '사이드바에서',
					suffix: '로 시작하는 파일과 폴더를 표시합니다.',
					title: '숨김 파일 표시',
				},
			},
			closeBehavior: {
				minimize: {
					description:
						'닫기 버튼을 누르면 메인 창을 숨기고 트레이 아이콘에서 계속 실행합니다.',
					label: '트레이로 최소화',
				},
				exit: {
					description:
						'닫기 버튼을 누르면 앱을 종료합니다. 저장하지 않은 변경 사항은 먼저 확인합니다.',
					label: '앱 종료',
				},
			},
			providerHint:
				'각 Provider 는 자체 API Key 와 모델 설정을 유지하며, 전환해도 서로 덮어쓰지 않습니다.',
			customConfigTitle: '사용자 지정 Provider',
			customProtocolPlaceholder: '호환 프로토콜 선택...',
			customProtocolOptions: {
				anthropic: {
					description: 'Anthropic 호환 /v1/messages 엔드포인트용입니다.',
					label: 'Anthropic Compatible',
				},
				google: {
					description:
						'Google 호환 models/{id}:generateContent 엔드포인트용입니다.',
					label: 'Google Compatible',
				},
				openai: {
					description: 'OpenAI 호환 /v1/chat/completions 엔드포인트용입니다.',
					label: 'OpenAI Compatible',
				},
			},
			apiUrlHint: '사용자 지정 Provider 의 엔드포인트 URL입니다.',
			httpsHint:
				'프로토콜이 비어 있으면 자동으로 사용됩니다. 자체 호스팅 환경에서만 끄세요.',
			apiKeyHint: {
				existing:
					'이 Provider 에는 이미 API Key 가 저장되어 있습니다. 새 값을 저장하면 덮어써집니다.',
				missing: '이 Provider 에는 아직 API Key 가 저장되지 않았습니다.',
				storage: 'Key 는 시스템 키체인에 저장되며 로컬 요청에만 사용됩니다.',
			},
			apiKeyPlaceholderSaved: '저장됨',
			editApiKeyAria: 'API Key 편집',
			confirmSaveAria: '저장 확인',
			cancelEditAria: '편집 취소',
			modelHintCustom:
				'모델 이름을 직접 입력하세요. 기능 차이는 Provider 문서를 참고하세요.',
			modelPlaceholder: '모델 선택...',
			loadingModels: '모델 목록을 불러오는 중...',
			loadingSelect: '불러오는 중...',
			toasts: {
				apiKeyDeleted: '시스템 키체인에서 API Key 를 삭제했습니다',
				apiKeyDeleteFailed: 'API Key 삭제에 실패했습니다',
				apiKeySaved: 'API Key 를 시스템 키체인에 저장했습니다',
				apiKeySaveFailed: 'API Key 저장에 실패했습니다',
			},
		},
		cli: {
			cards: {
				cli: { title: 'CLI' },
				status: { title: '상태' },
			},
			rows: {
				install: {
					description:
						'번들된 `mado` 명령을 설치하여 터미널에서 직접 실행할 수 있게 합니다.',
					title: 'CLI 설치',
				},
			},
			stats: {
				cliSource: 'CLI 원본',
				command: '셸 명령',
				installPath: '설치 경로',
				path: 'PATH',
			},
			statusText: {
				available: '사용 가능',
				notDetected: '감지되지 않음',
				notFound: '찾을 수 없음',
				notResolved: '확인 불가',
				pathReady: '설치 디렉터리가 PATH 에 포함되어 있습니다',
				pathMissing: '설치 디렉터리가 PATH 에 포함되어 있지 않습니다',
				restartTerminal: '터미널을 다시 열어 주세요',
				terminalRefreshPending:
					'설치는 완료되었고 터미널 갱신을 기다리는 중입니다',
				usableCommand: '{{command}} 명령으로 바로 사용할 수 있습니다',
			},
			toasts: {
				fetchStatusFailed: 'CLI 상태를 불러오지 못했습니다: {{error}}',
				installFailed: 'CLI 설치에 실패했습니다: {{error}}',
				installed: 'CLI 를 설치했습니다',
				installedAndPathUpdated: 'CLI 를 설치했고 PATH 도 업데이트했습니다',
				installedRestartTerminal:
					'CLI 를 설치했습니다. `mado` 를 사용하기 전에 터미널을 다시 열어 주세요.',
				installedWithHint: 'CLI 를 {{dest}} 에 설치했습니다. {{hint}}',
				removed: 'CLI 를 제거했습니다',
				removedAndPathCleaned: 'CLI 를 제거했고 PATH 설정도 정리했습니다',
				uninstallFailed: 'CLI 제거에 실패했습니다: {{error}}',
			},
		},
		license: {
			cards: {
				details: { title: '라이선스 정보' },
			},
			status: {
				active: '활성화됨',
				expired: '만료됨',
				revoked: '회수됨',
				trial: '체험판',
			},
			labels: {
				licensed: '인증됨',
				license: 'Madora 라이선스',
			},
			descriptions: {
				active: '이 기기에서 전체 기능을 사용할 수 있습니다.',
				missing: '유효한 라이선스를 찾지 못했습니다.',
				trialRemaining: '체험 기간이 {{days}}일 남았습니다',
			},
			actions: {
				activate: '활성화',
				deactivate: '이 기기 비활성화',
				manage: '라이선스 관리',
				purchase: '구매하기',
			},
			purchase: '아직 라이선스가 없으신가요? 구매하세요.',
			deviceHint:
				'다른 기기에서 사용해야 하나요? 먼저 이 기기를 비활성화하세요.',
			confirm: {
				title: '비활성화 확인',
				description:
					'비활성화 후에는 다시 활성화할 때까지 이 기기에서 Madora Pro 기능을 사용할 수 없습니다. 이후 같은 라이선스 키를 다른 기기에서 사용할 수 있습니다.',
				action: '비활성화',
				success: '라이선스를 비활성화했습니다',
				failed: '라이선스 비활성화에 실패했습니다',
			},
			loading: '라이선스 정보를 불러오는 중...',
		},
		sync: {
			cards: {
				mode: { title: '저장소 동기화' },
			},
			rows: {
				enabled: {
					title: '동기화 사용',
					description: '이 워크스페이스에 Git 또는 WebDAV 동기화를 사용합니다.',
				},
			},
			options: {
				git: {
					description:
						'로컬 버전 관리로 커밋, 푸시, 풀, 브랜치 관리를 지원합니다.',
					label: 'Git',
				},
				madoraSync: {
					description:
						'데스크톱이 호스트하는 로컬 네트워크용 실시간 동기화입니다. 모바일과 다른 Madora 클라이언트를 연결합니다.',
					label: 'Madora Sync',
				},
				webdav: {
					description: 'WebDAV 프로토콜을 통한 원격 파일 동기화입니다.',
					label: 'WebDAV',
				},
			},
			madora: {
				actions: {
					clearPairingCode: '코드 지우기',
					issuePairingCode: '페어링 코드 생성',
					refreshPairingQr: 'QR 코드 새로고침',
					removeDevice: '제거',
				},
				cards: {
					devices: { title: '신뢰된 장치' },
					features: {
						description:
							'이 설정은 데스크톱 호스트가 로컬 클라이언트에 동기화 기능을 어떻게 제공할지 결정합니다.',
						title: '호스트 기능',
					},
					host: { title: '호스트 설정' },
					pairing: {
						description:
							'모바일에서 QR 코드를 스캔하면 자동으로 페어링됩니다. 코드 입력은 예비 경로입니다.',
						title: '페어링',
					},
					status: { title: '연결 상태' },
				},
				connectionStates: {
					authenticating: '인증 중',
					connected: '연결됨',
					connecting: '연결 중',
					disconnected: '연결 안 됨',
					discovering: '검색 중',
					syncing: '동기화 중',
				},
				empty: {
					devices: '아직 신뢰된 장치가 없습니다.',
				},
				fields: {
					deviceName: '장치 이름',
					fallbackCode: '예비 코드',
					pairingCode: '페어링 코드',
					port: '포트',
				},
				hints: {
					port: '데스크톱 동기화 호스트용 고정 포트를 지정합니다. 모바일 클라이언트는 이 주소로 다시 연결합니다.',
				},
				rows: {
					enabled: {
						description:
							'모바일과 다른 Madora 클라이언트가 현재 데스크톱에 연결해 같은 워크스페이스를 함께 편집할 수 있게 합니다.',
						title: '장치 협업 사용',
					},
					aiSharing: {
						description:
							'모바일 AI 자동완성 요청을 현재 데스크톱 장치를 통해 처리합니다.',
						title: 'AI 자동완성 공유',
					},
					autoStart: {
						description:
							'Madora 시작 시 로컬 동기화 호스트를 자동으로 시작합니다.',
						title: '호스트 자동 시작',
					},
					lanDiscovery: {
						description:
							'현재 데스크톱을 로컬 네트워크에 광고해 자동 검색을 허용합니다.',
						title: 'LAN 검색',
					},
				},
				status: {
					automaticPairing:
						'QR 스캔 시 이 호스트용 일회성 페어링 티켓이 함께 전달되므로 보통 수동 코드 입력이 필요 없습니다.',
					availableHosts: '사용 가능한 호스트',
					connection: '연결',
					expiresAt: '{{time}} 에 만료',
					fallbackCodeDescription:
						'QR 스캔을 쓸 수 없거나 클라이언트가 자동 페어링 티켓을 아직 지원하지 않을 때만 사용합니다.',
					hostMode: '호스트 모드',
					lastSeenAt: '마지막 확인 {{time}}',
					lastSync: '마지막 동기화',
					neverSynced: '아직 동기화하지 않음',
					noPairingCode: '활성 페어링 코드 없음',
					noReachableHost: '접근 가능한 LAN 주소를 찾지 못했습니다',
					pairedDevices: '페어링된 장치',
					primaryHost: '기본 호스트',
					qrUnavailable:
						'사용 가능한 LAN 주소가 감지되면 QR 코드가 표시됩니다.',
					scanToConnect: '스캔하여 연결',
					trusted: '신뢰됨',
					unavailable: 'Madora Sync 사용 불가',
					unknownPlatform: '알 수 없는 플랫폼',
				},
				toasts: {
					loadFailed: 'Madora Sync 설정을 불러오지 못했습니다',
					pairingCodeFailed: '페어링 코드 갱신에 실패했습니다',
					pairingCodeIssued: '페어링 코드를 생성했습니다',
					pairingQrFailed: '페어링 QR 코드를 불러오지 못했습니다',
					removeDeviceFailed: '페어링된 장치를 제거하지 못했습니다',
					saveFailed: 'Madora Sync 설정을 저장하지 못했습니다',
					saved: 'Madora Sync 설정을 저장했습니다',
				},
				validation: {
					invalidPort: '1에서 65535 사이의 유효한 TCP 포트를 입력하세요.',
				},
			},
		},
		about: {
			actions: {
				check: '업데이트 확인',
				viewRelease: '릴리스 보기',
			},
			cards: {
				licenses: { title: '오픈소스 라이선스' },
				update: {
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
			toasts: {
				checkFailed: '업데이트 확인에 실패했습니다',
				checkFailedDescription: '지금은 GitHub Releases 에 연결할 수 없습니다.',
				upToDate: 'Madora 는 이미 최신 버전입니다 ({{version}})',
				updateAvailableDescription:
					'현재 {{currentVersion}} · 최신 {{latestVersion}}',
				updateAvailableTitle: '새 버전이 있습니다',
			},
		},
	},
	setup: {
		testPrompt:
			'# Madora 연결 테스트\n\n다음 문장을 자연스럽고 짧게 이어서 작성해 주세요. 설명은 필요 없습니다.\n현재 모델 연결은 이미',
		emptyTestResult:
			'연결에 성공했습니다. 모델은 정상적으로 응답했지만 이번 테스트에서는 표시할 자동완성 텍스트를 반환하지 않았습니다.',
		validation: {
			apiKeyRequired: 'API Key 를 입력해 주세요.',
			apiUrlRequired: 'API URL 을 입력해 주세요.',
			modelRequired: '모델을 선택하거나 입력해 주세요.',
		},
		welcome: {
			title: 'Madora에 오신 것을 환영합니다',
			action: '설정 시작',
			taglineTop: 'Markdown editing,',
			taglineBottom: 'powered by AI',
		},
		configure: {
			title: 'Provider 연결',
			description: 'AI 자동완성 엔드포인트를 설정합니다',
		},
		test: {
			title: '연결 테스트',
			description: '자격 증명과 모델 연결 상태를 확인하는 중입니다',
			waiting: '응답 대기 중',
			retry: '다시 테스트',
			finish: '검증 완료',
		},
		license: {
			title: '라이선스',
			description:
				'이미 라이선스가 있다면 활성화하여 전체 기능을 사용하세요. 지금은 체험으로 진행하고 나중에 설정에서 활성화해도 됩니다.',
			activate: '라이선스 활성화',
		},
		success: {
			title: '준비 완료',
			description:
				'Madora 설정이 끝났습니다. Markdown 파일을 열고 바로 작업을 시작하세요.',
		},
		skipConfirm: {
			title: '설정을 건너뛸까요?',
			description:
				'지금은 건너뛰고 나중에 설정에서 AI 자동완성을 다시 구성할 수 있습니다.',
			action: '설정 건너뛰기',
		},
	},
	licenseDialog: {
		title: '라이선스 활성화',
		description: '라이선스 키를 입력해 Madora 를 활성화하세요.',
		label: '라이선스 키',
		purchaseAction: '라이선스 구매',
		purchase: '아직 라이선스가 없으신가요? 구매하세요.',
		action: '활성화',
		validation: '전체 라이선스 키를 입력해 주세요',
		success: '활성화에 성공했습니다',
	},
	licenseBanner: {
		verifying: '라이선스를 확인하는 중...',
		revoked: {
			title: '라이선스 업데이트가 필요합니다',
			description:
				'이 기기의 라이선스가 더 이상 유효하지 않습니다. 계속 사용하려면 새 키를 입력해 주세요.',
			action: '새 라이선스 활성화',
			switchToTrial: '체험판으로 전환',
		},
		expired: {
			title: '체험 기간이 종료되었습니다',
			description:
				'14일 체험 기간이 끝났습니다. Madora 를 계속 사용하려면 라이선스를 활성화하세요.',
			action: '라이선스 활성화',
		},
		trial: {
			remaining: '체험 기간이 {{days}}일 남았습니다',
			action: '활성화',
		},
	},
	topBar: {
		saveFailureFallback: '닫기 전에 저장하지 못했습니다',
		toasts: {
			saveFailed: '닫기 전에 저장하지 못했습니다',
			stillUnsaved: '닫기 전에 저장되지 않은 변경이 남아 있습니다',
			stillUnsavedDescription: '다시 저장하거나 저장하지 않고 닫으세요.',
		},
		confirmClose: {
			title: '이 작업공간에는 저장되지 않은 문서가 있습니다',
			saving: '저장되지 않은 변경을 저장하는 중...',
			description: '창을 닫기 전에 변경 사항을 저장할지 버릴지 선택하세요.',
			discard: '저장하지 않고 닫기',
			save: '저장 후 닫기',
		},
		confirmMinimize: {
			title: '현재 작업공간의 변경 사항이 저장되지 않았습니다',
			description: '그래도 트레이로 최소화할까요?',
			confirm: '그래도 최소화',
		},
	},
	errors: {
		applicationError: '앱에서 오류가 발생했습니다',
		openLinkFailed: '링크를 열지 못했습니다',
		retry: '다시 시도',
	},
	ai: {
		apiKeyRequired: '먼저 API Key 를 입력해 주세요',
		completionFailed: 'AI 자동완성에 실패했습니다',
		disabled: 'AI 자동완성이 꺼져 있습니다',
		generating: 'AI 제안을 생성하는 중...',
		ready: 'AI 자동완성이 준비되었습니다',
		saveApiKeyToUse: '사용하려면 API Key 를 저장하세요',
	},
	licenseProvider: {
		activateFailed: '활성화에 실패했습니다',
		deactivateFailed: '비활성화에 실패했습니다',
		revokedTitle: '라이선스가 회수되었습니다',
		revokedDescription: '라이선스가 회수되어 AI 자동완성이 비활성화되었습니다',
	},
	aiSettingsProvider: {
		keychainAccessFailed: '시스템 키체인에 접근할 수 없습니다',
	},
	webdav: {
		tab: {
			connection: '연결',
			connectionDesc: '서버 및 인증 설정',
			sync: '동기화',
			syncDesc: '동기화 작업과 충돌 전략',
		},
		connectSuccess: '연결에 성공했습니다',
		connectSuccessWithName: '연결에 성공했습니다 — {{name}}',
		connectFailed: '연결에 실패했습니다',
		testConnectionError: '연결 테스트에 실패했습니다',
		configSaved: '설정을 저장했습니다',
		saveConfigFailed: '설정 저장에 실패했습니다',
		configCleared: '설정을 지웠습니다',
		deleteConfigFailed: '설정 삭제에 실패했습니다',
		syncCompletedWithErrors: '동기화는 완료되었지만 오류가 있습니다',
		syncComplete:
			'동기화 완료 — 업로드 {{uploaded}}개, 다운로드 {{downloaded}}개',
		syncFailed: '동기화에 실패했습니다',
		notConfigured: 'WebDAV 가 아직 설정되지 않았습니다',
		lastSyncAt: '마지막 동기화: {{time}}',
		notSyncedYet: '아직 동기화하지 않았습니다',
		errorCount: '{{count}}개 오류',
		configureLabel: 'WebDAV 설정',
		syncLabel: '동기화',
		settingsLabel: 'WebDAV 설정',
		connection: {
			sectionLabel: 'WebDAV',
			sectionTitle: '연결',
			cardTitle: '서버 설정',
			serverUrl: '서버 URL',
			username: '사용자 이름',
			password: '비밀번호',
			testing: '테스트 중...',
			testAction: '연결 테스트',
			saveAction: '설정 저장',
			clearAction: '설정 지우기',
		},
		syncPanel: {
			sectionLabel: 'WebDAV',
			sectionTitle: '동기화',
			optionsTitle: '동기화 옵션',
			remoteSubdir: '원격 하위 디렉터리',
			remoteSubdirHint:
				'선택 사항입니다. WebDAV 서버에서 이 작업공간 전용으로 사용할 하위 디렉터리입니다.',
			conflictStrategy: '충돌 처리 방식',
			strategies: {
				localFirst: '로컬 버전 유지',
				remoteFirst: '원격 버전 사용',
				keepBoth: '둘 다 유지',
			},
			manualTitle: '수동 동기화',
			syncing: '동기화 중...',
			syncNow: '지금 동기화',
			resultsTitle: '최근 동기화 결과',
			uploaded: '{{count}}개 업로드',
			downloaded: '{{count}}개 다운로드',
			conflicts: '{{count}}개 충돌 해결',
			errors: '{{count}}개 오류',
		},
	},
	git: {
		gitOperationFailed: 'Git 작업에 실패했습니다',
		remoteSaveFailed: '원격 저장에 실패했습니다',
		remoteSaveFailedHint: '원격 이름과 저장소 URL 을 입력해 주세요',
		commitFailed: '커밋에 실패했습니다',
		commitMessageRequired: '커밋 메시지를 입력해 주세요',
		mergeConflicts: '병합 충돌이 있습니다',
		sshKeySelected: 'SSH 개인 키 파일을 선택했습니다',
		revertConflicts: '리버트 충돌이 있습니다',
		history: '히스토리',
		changes: '변경 사항',
		staged: '스테이징됨',
		conflict: '충돌',
		noChanges: '변경 사항이 없습니다',
		commitAll: '모두 커밋',
		commitMessage: '커밋 메시지',
		commitPlaceholder: '이번 변경 내용을 입력해 주세요',
		moreActions: '추가 작업',
		undoLastCommit: '마지막 커밋 되돌리기',
		undoDescription:
			'가장 최근 커밋을 제거하고, 변경 내용은 현재 작업 트리에 남겨 둡니다.',
		confirmUndo: '커밋 되돌리기',
		revertSelectedCommit: '선택한 커밋 리버트',
		revertThisCommit: '이 커밋 리버트',
		confirmRevert: '커밋 리버트',
		remoteName: '원격 이름',
		remoteUrl: '원격 URL',
		saveRemote: '원격 저장',
		pullAction: '풀',
		pushAction: '푸시',
		sshAuth: 'SSH 인증',
		sshUsername: 'SSH 사용자 이름',
		sshKeyPath: 'SSH 개인 키',
		sshPassphrase: 'SSH 암호문',
		passphrasePlaceholder: '키가 암호화되어 있다면 암호문을 입력해 주세요',
		httpsAuth: 'HTTPS 인증',
		httpsUsername: '사용자 이름',
		httpsPassword: '비밀번호',
		tokenOrPassword: '토큰 또는 비밀번호',
		selectFile: '파일 선택',
		stage: '스테이징',
		stageAll: '모두 스테이징',
		unstage: '스테이징 해제',
		unstageAll: '모두 스테이징 해제',
		commitLabel: {
			commitStaged: '스테이징된 변경 커밋',
			resolve: '먼저 충돌 해결',
			merging: '먼저 병합 충돌 해결',
			reverting: '먼저 리버트 충돌 해결',
			cherryPicking: '먼저 체리픽 충돌 해결',
			rebasing: '먼저 리베이스 충돌 해결',
		},
		commitConflict: {
			mixed:
				'{{with}}개 파일은 인라인 충돌을 먼저 해결해야 하고, {{without}}개는 바로 스테이징할 수 있습니다.',
			resolveFirst:
				'이 파일들은 먼저 에디터에서 인라인 충돌 마커를 해결해 주세요.',
			noMarkers:
				'이 충돌들은 인라인 마커가 없습니다. 현재 작업공간 버전을 유지할 거라면 바로 스테이징할 수 있습니다.',
			markerTooltip: '인라인 충돌 마커가 있습니다. 먼저 에디터에서 해결하세요.',
			noMarkerTooltip:
				'인라인 충돌 마커가 없습니다. 현재 작업공간 버전이 맞다면 바로 스테이징할 수 있습니다.',
			markerWarning:
				'이 파일을 스테이징하기 전에 인라인 충돌 마커를 해결해 주세요.',
			stageAndResolve: '현재 버전을 스테이징하고 충돌 해결로 표시',
		},
		tab: {
			commit: '커밋',
			commitDesc: '새 커밋 만들기',
			history: '히스토리',
			historyDesc: '커밋 기록',
			remote: '원격',
			remoteDesc: '원격 동기화 설정',
			authDesc: '인증 정보 설정',
		},
		status: {
			notInitialized: '초기화되지 않음',
			clean: '작업 디렉터리가 깨끗합니다',
			loading: '저장소 상태를 읽는 중...',
			notARepo: '현재 작업공간은 Git 저장소가 아닙니다',
			reverting: '리버트 중, 충돌 {{count}}건 남음',
			merging: '병합 중, 충돌 {{count}}건 남음',
			cherryPicking: '체리픽 중, 충돌 {{count}}건 남음',
			rebasing: '리베이스 중, 충돌 {{count}}건 남음',
			conflicts: '충돌 {{count}}건 남음',
			staged: '스테이징 {{count}}건',
			unstaged: '미스테이징 {{count}}건',
			ahead: '{{count}}개 앞섬',
			behind: '{{count}}개 뒤처짐',
		},
		initSuccess: 'Git 저장소를 초기화했습니다',
		commitSuccess: '커밋했습니다',
		pushSuccess: '푸시를 완료했습니다',
		pullComplete: '풀을 완료했습니다',
		fetchComplete: '원격 업데이트를 가져왔습니다',
		remoteSaved: '원격 설정을 저장했습니다',
		undoSuccess: '마지막 커밋을 되돌렸습니다',
		revertSuccess: '리버트 커밋을 만들었습니다',
		createBranchFailed: '브랜치 생성에 실패했습니다',
		fetchBranchListFailed: '브랜치 목록을 불러오지 못했습니다',
		fetchStatusFailed: 'Git 상태를 읽지 못했습니다',
		selectFileFailed: '파일 선택에 실패했습니다',
		noBranches: '브랜치가 없습니다',
		loading: '불러오는 중...',
		init: '초기화',
		pull: '풀',
		push: '푸시',
		notMadoraRepo: '현재 작업공간은 Git 저장소가 아닙니다',
		revertDescriptionWithSummary:
			'다음 커밋을 되돌리는 새 리버트 커밋을 만듭니다: {{summary}}',
	},
	explorerPanel: {
		newDocument: '새 문서',
		newFolder: '새 폴더',
		rename: '이름 바꾸기',
		copy: '복사',
		cut: '잘라내기',
		paste: '붙여넣기',
		pasteHere: '여기에 붙여넣기',
		pasteToDir: '현재 디렉터리에 붙여넣기',
		delete: '삭제',
		restore: '복원',
		save: '저장',
		cancel: '취소',
		confirmDeleteTitle: '삭제 확인',
		confirmDeleteFile: '파일 "{{name}}"을 삭제할까요?',
		confirmDeleteFolder: '폴더 "{{name}}"과 그 안의 모든 내용을 삭제할까요?',
		confirmBatchDelete: '선택한 {{items}}을 삭제할까요?',
		confirmBatchDeleteTitle: '일괄 삭제 확인',
		fileCount: '파일 {{count}}개',
		dirCount: '폴더 {{count}}개',
		selectFolder: '로컬 폴더 열기',
		selectFolderDescription: '미리보기 가능한 파일이 폴더 트리에 표시됩니다.',
		startBrowsing: '폴더를 열어 탐색 시작',
		noFilesFound: '파일을 찾을 수 없습니다',
		itemsSelected: '{{count}}개 항목 선택됨',
		itemsCopied: '{{count}}개 항목을 복사했습니다',
		itemsCut: '{{count}}개 항목을 잘라냈습니다',
		syncNotEnabled: '동기화가 활성화되지 않았습니다',
		bookmarks: '북마크',
		addBookmark: '북마크 추가',
		removeBookmark: '북마크 제거',
		bookmarkRemoved: '북마크 제거',
		deleteBookmarkWithName: '{{name}} 북마크 삭제',
		showInTree: '트리에서 현재 파일 보기',
		toggleExpand: '모두 펼치기 / 접기',
		collapseWithName: '{{name}} 접기',
		expandWithName: '{{name}} 펼치기',
		refreshTree: '파일 트리 새로고침',
		sorted: '정렬됨',
		unsorted: '정렬 안 함',
		sortToggle: '정렬 전환',
		createDescription:
			'대상 디렉터리 안에 생성됩니다. 대상이 파일이면 같은 폴더에, 대상이 없으면 작업공간 루트에 생성됩니다.',
		createFailed: '생성에 실패했습니다',
		enterFileName: '파일 이름을 입력해 주세요',
		invalidFileExtension: '파일 이름은 .md 또는 .mdx 로 끝나야 합니다',
		enterFolderName: '폴더 이름을 입력해 주세요',
		enterName: '이름을 입력해 주세요',
		renameFailed: '이름 바꾸기에 실패했습니다',
		renameFolderDescription: '새 폴더 이름을 입력해 주세요.',
		renameFileDescription: '새 파일 이름을 입력해 주세요.',
		createSuccess: '"{{name}}" 파일을 만들었습니다',
		copySuccess: '"{{name}}"을 복사했습니다',
		cutSuccess: '"{{name}}"을 잘라냈습니다',
		pasteSuccess: '"{{name}}"을 붙여넣었습니다',
		clearClipboard: '클립보드 작업을 취소했습니다',
		dropFailed: '드롭한 파일 경로를 읽지 못했습니다',
		confirmRestoreTitle: '삭제된 파일 복원',
		confirmRestoreFromGit: 'Git 에서 "{{name}}"을 복원할까요?',
		workspaceOperationFailed: '작업공간 작업에 실패했습니다',
		fileReadFailed: '파일을 읽지 못했습니다',
		importUnsupported: '.md/.mdx 파일과 이미지만 가져올 수 있습니다',
		importSummary: '{{count}}개 파일을 가져왔습니다',
		importSummaryWithSkipped:
			'{{imported}}개를 가져오고 {{skipped}}개를 건너뛰었습니다',
	},
	tabBar: {
		closeTabWithName: '{{name}} 닫기',
		outsideWorkspace: '작업공간 외부',
		closeCurrent: '현재 탭 닫기',
		closeLeft: '왼쪽 탭 닫기',
		closeRight: '오른쪽 탭 닫기',
		keepCurrentOnly: '현재 탭만 남기기',
		closeAll: '모든 탭 닫기',
	},
	conflictEditor: {
		conflictCount: '충돌 {{current}} / {{total}}',
		selected: '선택됨',
		keepBoth: '둘 다 유지',
		currentBranch: '현재 브랜치 HEAD',
		incomingChanges: '들어온 변경',
		useChoice: '선택',
		empty: '(비어 있음)',
		resolving: '해결 중...',
		complete: '충돌 해결 완료',
		remaining: '{{count}}개 충돌이 아직 선택되지 않았습니다',
	},
	markdownEditor: {
		actions: {
			bold: '굵게',
			italic: '기울임꼴',
			strikethrough: '취소선',
			underline: '밑줄',
			link: '링크 삽입',
			image: '이미지 삽입',
		},
		placeholders: {
			bold: '굵은 텍스트',
			italic: '기울임꼴 텍스트',
			strikethrough: '취소선 텍스트',
			underline: '밑줄 텍스트',
			link: '링크 텍스트',
			image: '이미지 설명',
		},
		status: {
			dirty: '저장되지 않음,',
			saving: '저장 중...',
			saved: '저장됨',
			error: '저장 실패',
			manual: '수동 저장',
			auto: '편집 중 자동 저장',
		},
		cursor: {
			lineCol: '{{line}}행 {{col}}열',
			characters: '{{count}}자',
		},
		toggle: {
			preview: '미리보기로 전환',
			edit: '에디터로 전환',
		},
	},
	markdownPreview: {
		fileNotFound: '파일을 찾을 수 없습니다',
		externalTitle: '외부 파일을 열까요?',
		externalDescription:
			'이 링크는 현재 작업공간 밖을 가리킵니다. 열면 해당 위치의 파일을 읽을 수 있게 됩니다.',
		allowAccess: '접근 허용',
	},
	filePreview: {
		conflictNoMarkersTitle: '이 충돌에는 인라인 마커가 없습니다',
		conflictNoMarkersDescription:
			'보통 수정/삭제 또는 삭제/수정 충돌입니다. 먼저 현재 작업공간 버전을 확인하고, 유지하려면 커밋 패널에서 스테이징하여 해결된 것으로 표시하세요.',
		deletedTitle: '이 파일은 작업공간에서 삭제되었습니다',
		deletedDescription:
			'Git 변경 목록에는 아직 남아 있습니다. 필요하면 사이드바 컨텍스트 메뉴에서 복원하세요.',
		truncatedTitle: '미리보기가 잘렸습니다',
		truncatedDescription: '파일이 커서 앞부분만 표시합니다.',
		emptyTitle: '미리보기를 사용할 수 없습니다',
		emptyDescription:
			'이 파일 형식은 아직 미리보기를 지원하지 않거나 파일이 비어 있습니다.',
		selectFileTitle: '사이드바에서 파일 선택',
		selectFileDescription:
			'폴더를 연 뒤 파일을 선택하면 여기에 내용이 표시됩니다.',
		openFolderTitle: '아직 열린 폴더가 없습니다',
		openFolderDescription:
			'로컬 폴더를 열면 Markdown, 이미지, 텍스트 파일을 여기서 미리볼 수 있습니다.',
	},
} as const;

export default ko;
