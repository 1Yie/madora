import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
	BackHandler,
	DeviceEventEmitter,
	Image,
	Keyboard,
	PressableProps,
	Pressable,
	type ScrollView as ScrollViewType,
	ScrollView,
	Text,
	View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
	ClipboardPaste,
	Bookmark,
	BookmarkCheck,
	Copy,
	Folder,
	FolderCog,
	ChevronDown,
	ChevronRight,
	Edit3,
	FilePlus2,
	FileText,
	FolderOpen,
	FolderPlus,
	LocateFixed,
	MonitorSmartphone,
	RefreshCw,
	Settings,
	Trash2,
	X,
	Save,
	AlertTriangle,
} from 'lucide-react-native';

import { MarkdownEditor } from '../components/markdown-editor';
import { useEditorWorkspace } from '../providers/editor-provider';
import { hashEditorContent } from '../lib/editor-content-hash';
import {
	readLocalFileAsDataUri,
	resolveFilePath,
} from '../services/local-file-system';
import {
	NativeModal,
	NativeModalActions,
	NativeModalTextInput,
} from '@/components/ui/native-modal';
import { useNativeToast } from '@/components/ui/native-toast';
import { Spinner } from '@/components/ui/spinner';
import {
	FileTreeModeTabs,
	type WorkspaceMode,
} from '../components/file-tree-mode-tabs';
import { RemoteNotConnectedState } from '../components/remote-not-connected-state';
import type {
	EditorDocument,
	EditorNode,
	EditorWorkspaceSource,
} from '../types';
import {
	WORKSPACE_EDITOR_OVERLAY_ACTIVE_EVENT,
	WORKSPACE_LEAVE_REQUEST_EVENT,
	WORKSPACE_ROUTE_SWITCH_REQUEST_EVENT,
	WORKSPACE_TAB_REQUEST_EVENT,
	WORKSPACE_TAB_STATE_EVENT,
	type WorkspaceTab,
} from '../lib/workspace-tab-events';
import {
	shouldPromptUnsavedAction,
	type UnsavedPromptIntent,
} from '../lib/unsaved-switch-prompt';
import {
	APP_THEME_BACKGROUND_COLORS,
	useAppSettings,
	useAppThemePalette,
	useResolvedThemePreference,
	type ResolvedThemePreference,
} from '@/features/settings';
import { useMadoraSync } from '@/features/madora-sync';
import type { EditorStateMessage } from '@/features/madora-sync/lib/protocol';
import type { SyncConnectionState } from '@/features/madora-sync';

const EDITOR_FLOATING_CONTROLS_BOTTOM_PADDING = 56;
const EDITOR_KEYBOARD_CONTROLS_BOTTOM_PADDING = 40;
const TREE_INDENT_STEP = 16;
const TREE_ROW_INSET = 8;
const TREE_TOGGLE_SIZE = 22;
const TREE_TOGGLE_GAP = 4;
const TREE_FILE_START_OFFSET =
	TREE_ROW_INSET + TREE_TOGGLE_SIZE + TREE_TOGGLE_GAP;
const TREE_GUIDE_WIDTH = 1.5;
const TREE_ROW_RADIUS = 10;
const TREE_CHEVRON_SIZE = 15;
const TREE_NODE_ICON_SIZE = 18;
const TREE_ROW_ESTIMATED_HEIGHT = 44;
const TREE_LOCATE_SCROLL_OFFSET = 96;
const DOUBLE_PRESS_DELAY = 260;
const WORKSPACE_TOAST_ID = 'madora-workspace-toast';
const WORKSPACE_TOAST_DURATION_MS = 2200;
const LOCAL_EDIT_PROTECTION_MS = 1_200;
const REMOTE_APPLY_LOADING_MS = 420;

type UnsavedDialogIntent = UnsavedPromptIntent;
type BookmarkedFileEntry = {
	fileKind: EditorDocument['fileKind'];
	id: string;
	name: string;
	path: string;
	relativePath: string;
};

export function WorkspaceScreen() {
	const insets = useSafeAreaInsets();
	const { t } = useTranslation();
	const resolvedTheme = useResolvedThemePreference();
	const { editorFontSize, saveMode } = useAppSettings();
	const [activeTab, setActiveTab] = useState<WorkspaceTab>('editor');
	const [keyboardHeight, setKeyboardHeight] = useState(0);
	const {
		activeDocumentDirty,
		bookmarkedDocumentIds,
		workspaceMode,
		switchWorkspaceMode,
		cancelCopiedFile,
		copySelectedFile,
		copyState,
		createLocalDirectory,
		createLocalFile,
		deleteSelectedEntry,
		discardUnsavedDocuments,
		documents,
		expandedDirectoryPaths,
		fileTree,
		focusedTreeNode,
		hasUnsavedDocuments,
		isFocusedTreeNodeBookmarked,
		isSavingActiveDocument,
		openLocalFolder,
		openRemoteWorkspace,
		pasteCopiedFile,
		locateSelectedDocumentInTree,
		renameSelectedFile,
		refreshFileTree,
		requestInlineCompletion,
		saveActiveDocument,
		saveAllUnsavedDocuments,
		selectDocument,
		selectTreeNode,
		selectedDocument,
		selectedTreeNodePath,
		toggleBookmark,
		toggleDirectoryExpanded,
		updateSelectedDocumentContent,
		workspaceSource,
	} = useEditorWorkspace();
	const {
		connectionState,
		publishEditorState,
		readRemoteFile,
		remoteEditorState,
		syncEnabled,
	} = useMadoraSync();
	const { showToast } = useNativeToast();
	const [createModalOpen, setCreateModalOpen] = useState(false);
	const [createValue, setCreateValue] = useState('');
	const [createFolderModalOpen, setCreateFolderModalOpen] = useState(false);
	const [createFolderValue, setCreateFolderValue] = useState('');
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [renameModalOpen, setRenameModalOpen] = useState(false);
	const [renameValue, setRenameValue] = useState('');
	const [refreshingFileTree, setRefreshingFileTree] = useState(false);
	const [switchingWorkspaceMode, setSwitchingWorkspaceMode] =
		useState<WorkspaceMode | null>(null);
	const [locateRequestId, setLocateRequestId] = useState(0);
	const [editorSyncLoading, setEditorSyncLoading] = useState(false);
	const [visibleRemoteEditorState, setVisibleRemoteEditorState] =
		useState<EditorStateMessage | null>(null);
	const activeRemoteDocumentRef = useRef<{
		path: string;
		title: string;
	} | null>(null);
	const pendingRemoteEditorStateRef = useRef<EditorStateMessage | null>(null);
	const lastLocalEditAtRef = useRef(0);
	const remoteApplyLoadingTimerRef = useRef<ReturnType<
		typeof setTimeout
	> | null>(null);
	const [unsavedDialogIntent, setUnsavedDialogIntent] =
		useState<UnsavedDialogIntent | null>(null);
	const pendingNavigationRef = useRef<(() => void) | null>(null);
	const switchPromptAcknowledgedRef = useRef(false);

	const editorTopPadding = insets.top;
	const editorBottomPadding =
		insets.bottom +
		(keyboardHeight > 0
			? keyboardHeight + EDITOR_KEYBOARD_CONTROLS_BOTTOM_PADDING
			: EDITOR_FLOATING_CONTROLS_BOTTOM_PADDING);
	const clearAcknowledgedSwitchDirtyKeys = useCallback(() => {
		switchPromptAcknowledgedRef.current = false;
	}, []);

	const promptUnsavedBefore = useCallback(
		(intent: UnsavedDialogIntent, continueNavigation: () => void) => {
			const shouldPrompt = shouldPromptUnsavedAction({
				activeDocumentDirty,
				hasUnsavedDocuments,
				intent,
				saveMode,
				switchPromptAcknowledged: switchPromptAcknowledgedRef.current,
			});
			if (!shouldPrompt) {
				continueNavigation();
				return;
			}
			pendingNavigationRef.current = continueNavigation;
			setUnsavedDialogIntent(intent);
		},
		[activeDocumentDirty, hasUnsavedDocuments, saveMode]
	);

	const checkUnsavedBeforeNavigate = useCallback(
		(continueNavigation: () => void) => {
			promptUnsavedBefore('leave', continueNavigation);
		},
		[promptUnsavedBefore]
	);

	const checkUnsavedBeforeSwitch = useCallback(
		(continueNavigation: () => void) => {
			promptUnsavedBefore('switch', continueNavigation);
		},
		[promptUnsavedBefore]
	);

	const handleSaveActiveDocument = useCallback(() => {
		void saveActiveDocument().then((saved) => {
			if (saved) {
				if (workspaceSource.kind === 'remote' && selectedDocument) {
					publishEditorState({
						column: null,
						content: selectedDocument.content,
						contentHash: hashEditorContent(selectedDocument.content),
						cursorIndex: null,
						editing: activeTab === 'editor',
						filePath: selectedDocument.path,
						line: null,
						title: selectedDocument.title,
					});
				}
				showWorkspaceToast(
					showToast,
					t('workspace.feedback.savedTitle'),
					t('workspace.feedback.savedDetail')
				);
			}
		});
	}, [
		activeTab,
		publishEditorState,
		saveActiveDocument,
		selectedDocument,
		showToast,
		t,
		workspaceSource.kind,
	]);

	const handleUnsavedSaveAndExit = useCallback(() => {
		const pending = pendingNavigationRef.current;
		setUnsavedDialogIntent(null);
		pendingNavigationRef.current = null;
		void saveAllUnsavedDocuments().then((saved) => {
			if (saved) {
				pending?.();
				return;
			}
			setUnsavedDialogIntent('leave');
			pendingNavigationRef.current = pending;
		});
	}, [saveAllUnsavedDocuments]);

	const handleUnsavedDiscardAndExit = useCallback(() => {
		const pending = pendingNavigationRef.current;
		setUnsavedDialogIntent(null);
		pendingNavigationRef.current = null;
		discardUnsavedDocuments();
		pending?.();
	}, [discardUnsavedDocuments]);

	const handleUnsavedContinueSwitch = useCallback(() => {
		const pending = pendingNavigationRef.current;
		switchPromptAcknowledgedRef.current = true;
		setUnsavedDialogIntent(null);
		pendingNavigationRef.current = null;
		pending?.();
	}, []);

	const handleUnsavedCancelExit = useCallback(() => {
		setUnsavedDialogIntent(null);
		pendingNavigationRef.current = null;
	}, []);

	useEffect(() => {
		if (activeDocumentDirty || !selectedDocument) return;
		clearAcknowledgedSwitchDirtyKeys();
	}, [activeDocumentDirty, clearAcknowledgedSwitchDirtyKeys, selectedDocument]);

	const showRemoteEditorSyncLoading = useCallback(() => {
		setEditorSyncLoading(true);
		if (remoteApplyLoadingTimerRef.current) {
			clearTimeout(remoteApplyLoadingTimerRef.current);
		}
		remoteApplyLoadingTimerRef.current = setTimeout(() => {
			setEditorSyncLoading(false);
			remoteApplyLoadingTimerRef.current = null;
		}, REMOTE_APPLY_LOADING_MS);
	}, []);

	useEffect(() => {
		const subscription = DeviceEventEmitter.addListener(
			WORKSPACE_TAB_REQUEST_EVENT,
			(tab) => {
				if (tab === 'editor' || tab === 'fileTree') {
					if (tab === activeTab) {
						if (tab === 'editor') {
							clearAcknowledgedSwitchDirtyKeys();
						}
						return;
					}
					checkUnsavedBeforeSwitch(() => setActiveTab(tab));
				}
			}
		);

		return () => subscription.remove();
	}, [activeTab, checkUnsavedBeforeSwitch, clearAcknowledgedSwitchDirtyKeys]);

	useEffect(() => {
		if (activeTab === 'editor') {
			clearAcknowledgedSwitchDirtyKeys();
		}
	}, [activeTab, clearAcknowledgedSwitchDirtyKeys]);

	useEffect(() => {
		const subscription = DeviceEventEmitter.addListener(
			WORKSPACE_LEAVE_REQUEST_EVENT,
			(continueNavigation) => {
				if (typeof continueNavigation === 'function') {
					checkUnsavedBeforeNavigate(continueNavigation);
				}
			}
		);

		return () => subscription.remove();
	}, [checkUnsavedBeforeNavigate]);

	useEffect(() => {
		const subscription = DeviceEventEmitter.addListener(
			WORKSPACE_ROUTE_SWITCH_REQUEST_EVENT,
			(continueNavigation) => {
				if (typeof continueNavigation === 'function') {
					checkUnsavedBeforeSwitch(continueNavigation);
				}
			}
		);

		return () => subscription.remove();
	}, [checkUnsavedBeforeSwitch]);

	useEffect(() => {
		const showSubscription = Keyboard.addListener(
			'keyboardDidShow',
			(event) => {
				setKeyboardHeight(event.endCoordinates.height);
			}
		);
		const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
			setKeyboardHeight(0);
		});

		return () => {
			showSubscription.remove();
			hideSubscription.remove();
		};
	}, []);

	useEffect(() => {
		DeviceEventEmitter.emit(WORKSPACE_TAB_STATE_EVENT, activeTab);
	}, [activeTab]);

	useFocusEffect(
		useCallback(() => {
			const subscription = BackHandler.addEventListener(
				'hardwareBackPress',
				() => {
					if (
						(!hasUnsavedDocuments && !activeDocumentDirty) ||
						saveMode !== 'manual'
					) {
						return false;
					}
					if (unsavedDialogIntent) return true;
					setUnsavedDialogIntent('leave');
					pendingNavigationRef.current = () => {
						BackHandler.exitApp();
					};
					return true;
				}
			);
			return () => subscription.remove();
		}, [
			activeDocumentDirty,
			hasUnsavedDocuments,
			saveMode,
			unsavedDialogIntent,
		])
	);

	useEffect(() => {
		DeviceEventEmitter.emit(
			WORKSPACE_EDITOR_OVERLAY_ACTIVE_EVENT,
			createModalOpen ||
				createFolderModalOpen ||
				deleteDialogOpen ||
				renameModalOpen ||
				Boolean(unsavedDialogIntent)
		);

		return () => {
			DeviceEventEmitter.emit(WORKSPACE_EDITOR_OVERLAY_ACTIVE_EVENT, false);
		};
	}, [
		createFolderModalOpen,
		createModalOpen,
		deleteDialogOpen,
		renameModalOpen,
		unsavedDialogIntent,
	]);

	useEffect(() => {
		if (workspaceSource.kind !== 'remote' || !selectedDocument) {
			activeRemoteDocumentRef.current = null;
			pendingRemoteEditorStateRef.current = null;
			Promise.resolve().then(() => {
				setVisibleRemoteEditorState(null);
				setEditorSyncLoading(false);
			});
			if (remoteApplyLoadingTimerRef.current) {
				clearTimeout(remoteApplyLoadingTimerRef.current);
				remoteApplyLoadingTimerRef.current = null;
			}
			publishEditorState({
				column: null,
				content: null,
				contentHash: null,
				cursorIndex: null,
				editing: false,
				filePath: null,
				line: null,
				title: null,
			});
			return;
		}

		activeRemoteDocumentRef.current = {
			path: selectedDocument.path,
			title: selectedDocument.title,
		};
		publishEditorState({
			column: null,
			content: null,
			contentHash: hashEditorContent(selectedDocument.content),
			cursorIndex: null,
			editing: activeTab === 'editor',
			filePath: selectedDocument.path,
			line: null,
			title: selectedDocument.title,
		});
	}, [
		activeTab,
		publishEditorState,
		selectedDocument,
		selectedDocument?.path,
		selectedDocument?.title,
		workspaceSource.kind,
	]);

	useEffect(() => {
		if (workspaceSource.kind !== 'remote' || !selectedDocument) {
			pendingRemoteEditorStateRef.current = null;
			Promise.resolve().then(() => {
				setVisibleRemoteEditorState(null);
			});
			return;
		}

		if (
			!remoteEditorState ||
			remoteEditorState.filePath !== selectedDocument.path
		) {
			pendingRemoteEditorStateRef.current = null;
			Promise.resolve().then(() => {
				setVisibleRemoteEditorState(null);
			});
			return;
		}

		const nextContent =
			typeof remoteEditorState.content === 'string'
				? remoteEditorState.content
				: null;

		if (nextContent === null) {
			const pending = pendingRemoteEditorStateRef.current;
			if (pending?.filePath === selectedDocument.path) {
				pendingRemoteEditorStateRef.current = {
					...pending,
					column: remoteEditorState.column,
					cursorIndex: remoteEditorState.cursorIndex,
					deviceId: remoteEditorState.deviceId,
					deviceName: remoteEditorState.deviceName,
					editing: remoteEditorState.editing,
					line: remoteEditorState.line,
					source: remoteEditorState.source,
					title: remoteEditorState.title ?? pending.title,
					updatedAt: remoteEditorState.updatedAt,
				};
				return;
			}

			Promise.resolve().then(() => {
				setVisibleRemoteEditorState(remoteEditorState);
				if (remoteEditorState.cursorIndex !== null) {
					showRemoteEditorSyncLoading();
				}
			});
			return;
		}

		if (nextContent === selectedDocument.content) {
			pendingRemoteEditorStateRef.current = null;
			Promise.resolve().then(() => {
				setVisibleRemoteEditorState(remoteEditorState);
				if (remoteEditorState.cursorIndex !== null) {
					showRemoteEditorSyncLoading();
				}
			});
			return;
		}

		const hasRecentLocalEdit =
			Date.now() - lastLocalEditAtRef.current < LOCAL_EDIT_PROTECTION_MS;
		if (hasRecentLocalEdit) {
			pendingRemoteEditorStateRef.current = remoteEditorState;
			return;
		}

		pendingRemoteEditorStateRef.current = remoteEditorState;
		updateSelectedDocumentContent(nextContent, {
			markSaved: true,
			skipRemoteWrite: true,
		});
	}, [
		remoteEditorState,
		selectedDocument,
		selectedDocument?.content,
		selectedDocument?.path,
		showRemoteEditorSyncLoading,
		updateSelectedDocumentContent,
		workspaceSource.kind,
	]);

	useEffect(() => {
		if (workspaceSource.kind !== 'remote' || !selectedDocument) return;

		const pending = pendingRemoteEditorStateRef.current;
		if (
			!pending ||
			pending.filePath !== selectedDocument.path ||
			pending.content !== selectedDocument.content
		) {
			return;
		}

		pendingRemoteEditorStateRef.current = null;
		Promise.resolve().then(() => {
			setVisibleRemoteEditorState(pending);
			if (pending.cursorIndex !== null) {
				showRemoteEditorSyncLoading();
			}
		});
	}, [
		selectedDocument,
		selectedDocument?.content,
		selectedDocument?.path,
		showRemoteEditorSyncLoading,
		workspaceSource.kind,
	]);

	useEffect(() => {
		return () => {
			if (remoteApplyLoadingTimerRef.current) {
				clearTimeout(remoteApplyLoadingTimerRef.current);
			}
		};
	}, []);

	const handleEditorStateChange = useCallback(
		(state: {
			column: number | null;
			content: string | null;
			cursorIndex: number | null;
			line: number | null;
			localEditedAt: number;
		}) => {
			const document = activeRemoteDocumentRef.current;
			if (!document) return;

			if (
				typeof state.content === 'string' &&
				state.content !== selectedDocument?.content
			) {
				lastLocalEditAtRef.current = state.localEditedAt;
			}
			const publishedContent = saveMode === 'auto' ? state.content : null;
			publishEditorState({
				column: state.column,
				content: publishedContent,
				contentHash: hashEditorContent(
					state.content ?? selectedDocument?.content ?? ''
				),
				cursorIndex: state.cursorIndex,
				editing: activeTab === 'editor',
				filePath: document.path,
				line: state.line,
				title: document.title,
			});
		},
		[activeTab, publishEditorState, saveMode, selectedDocument?.content]
	);

	const handleSelectTreeNode = (documentId: string) => {
		selectTreeNode(documentId);
	};

	const handleOpenDocument = (documentId: string) => {
		if (documentId === selectedDocument?.id) {
			if (activeTab === 'editor') return;
			checkUnsavedBeforeSwitch(() => setActiveTab('editor'));
			return;
		}
		checkUnsavedBeforeSwitch(() => {
			void selectDocument(documentId);
			setActiveTab('editor');
		});
	};

	const handleNavigateFile = useCallback(
		(resolvedPath: string) => {
			handleOpenDocument(resolvedPath);
		},
		// handleOpenDocument depends on selectedDocument / activeTab but is
		// recreated every render; depending on it would bust the memo. Read the
		// latest values via refs instead is overkill here — the callback is only
		// invoked on user taps, so stale closures are harmless.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[checkUnsavedBeforeSwitch, selectDocument, activeTab, selectedDocument?.id]
	);

	const resolveRemoteImage = useCallback(
		async (src: string) => {
			if (workspaceSource.kind !== 'remote' || !selectedDocument) {
				return null;
			}
			try {
				const resolved = resolveFilePath(
					src,
					selectedDocument.path,
					workspaceSource.uri
				);
				if (!resolved) return null;
				const result = await readRemoteFile(resolved);
				if (result.imageDataUrl) return result.imageDataUrl;
				return null;
			} catch {
				return null;
			}
		},
		[readRemoteFile, selectedDocument, workspaceSource]
	);

	const handleOpenCreateFile = () => {
		setCreateValue('');
		setCreateModalOpen(true);
	};

	const handleOpenCreateFolder = () => {
		setCreateFolderValue('');
		setCreateFolderModalOpen(true);
	};

	const handleOpenFolder = () => {
		checkUnsavedBeforeNavigate(() => {
			void openLocalFolder().then((opened) => {
				if (opened) setActiveTab('fileTree');
			});
		});
	};

	const handleOpenRemoteWorkspace = () => {
		if (!syncEnabled) return;
		checkUnsavedBeforeNavigate(() => {
			void openRemoteWorkspace().then((opened) => {
				if (opened) setActiveTab('fileTree');
			});
		});
	};

	const handleOpenSyncSettings = () => {
		checkUnsavedBeforeNavigate(() => {
			router.navigate('/settings');
			setTimeout(() => {
				router.push('/settings/sync');
			}, 0);
		});
	};

	const handleSwitchWorkspaceMode = (mode: WorkspaceMode) => {
		if (mode === workspaceMode || switchingWorkspaceMode) return;
		if (mode === 'remote' && !syncEnabled) return;

		checkUnsavedBeforeNavigate(() => {
			setSwitchingWorkspaceMode(mode);
			void switchWorkspaceMode(mode).finally(() => {
				setSwitchingWorkspaceMode(null);
			});
		});
	};

	useEffect(() => {
		if (syncEnabled || workspaceMode !== 'remote' || switchingWorkspaceMode) {
			return;
		}

		queueMicrotask(() => {
			setSwitchingWorkspaceMode('local');
			void switchWorkspaceMode('local').finally(() => {
				setSwitchingWorkspaceMode(null);
			});
		});
	}, [syncEnabled, switchWorkspaceMode, switchingWorkspaceMode, workspaceMode]);

	const handleOpenRename = () => {
		if (!focusedTreeNode) return;
		setRenameValue(focusedTreeNode.name);
		setRenameModalOpen(true);
	};

	const handleConfirmRename = () => {
		Keyboard.dismiss();
		void renameSelectedFile(renameValue).then((renamed) => {
			if (renamed) {
				setRenameModalOpen(false);
			}
		});
	};

	const handleConfirmCreate = () => {
		Keyboard.dismiss();
		void createLocalFile(createValue).then((opened) => {
			if (opened) {
				setCreateModalOpen(false);
			}
		});
	};

	const handleConfirmCreateFolder = () => {
		Keyboard.dismiss();
		void createLocalDirectory(createFolderValue).then((created) => {
			if (created) {
				setCreateFolderModalOpen(false);
			}
		});
	};

	const handleCopyFile = () => {
		void copySelectedFile().then((copied) => {
			if (copied) {
				showWorkspaceToast(
					showToast,
					t('fileTree.feedback.copyReadyTitle'),
					t('fileTree.feedback.copyReadyDetail', {
						name: focusedTreeNode?.name ?? selectedDocument?.title ?? '',
					})
				);
			}
		});
	};

	const handlePasteFile = () => {
		void pasteCopiedFile().then((pasted) => {
			if (pasted) {
				checkUnsavedBeforeSwitch(() => setActiveTab('editor'));
				showWorkspaceToast(
					showToast,
					t('fileTree.feedback.pastedTitle'),
					t('fileTree.feedback.pastedDetail')
				);
			}
		});
	};

	const handleCancelCopy = () => {
		cancelCopiedFile();
		showWorkspaceToast(
			showToast,
			t('fileTree.feedback.copyCanceledTitle'),
			t('fileTree.feedback.copyCanceledDetail')
		);
	};

	const handleRefreshFileTree = () => {
		setRefreshingFileTree(true);
		void refreshFileTree()
			.then((refreshed) => {
				if (refreshed) {
					showWorkspaceToast(
						showToast,
						t('fileTree.feedback.refreshedTitle'),
						t('fileTree.feedback.refreshedDetail')
					);
				}
			})
			.finally(() => setRefreshingFileTree(false));
	};

	const handleLocateSelectedDocument = () => {
		checkUnsavedBeforeSwitch(() => {
			void locateSelectedDocumentInTree().then((located) => {
				if (located) {
					setActiveTab('fileTree');
					setLocateRequestId((current) => current + 1);
					showWorkspaceToast(
						showToast,
						t('fileTree.feedback.locatedTitle'),
						t('fileTree.feedback.locatedDetail')
					);
					return;
				}

				showWorkspaceToast(
					showToast,
					t('fileTree.feedback.locateUnavailableTitle'),
					t('fileTree.feedback.locateUnavailableDetail')
				);
			});
		});
	};

	const handleToggleBookmark = () => {
		void toggleBookmark();
	};

	const handleDeleteEntry = () => {
		void deleteSelectedEntry().then((deleted) => {
			if (deleted) {
				setDeleteDialogOpen(false);
			}
		});
	};

	return (
		<View
			style={{
				backgroundColor: APP_THEME_BACKGROUND_COLORS[resolvedTheme],
				flex: 1,
			}}
		>
			<View style={{ flex: 1 }}>
				<View
					style={{
						flex: 1,
						opacity: activeTab === 'fileTree' ? 1 : 0,
						pointerEvents: activeTab === 'fileTree' ? 'auto' : 'none',
						position: activeTab === 'fileTree' ? 'relative' : 'absolute',
						inset: 0,
					}}
				>
					<FileTreeView
						bookmarkedDocumentIds={bookmarkedDocumentIds}
						canCopyFile={
							focusedTreeNode?.kind === 'file' ||
							(fileTree.length === 0 && Boolean(selectedDocument))
						}
						canCreateFile={workspaceSource.kind === 'directory'}
						connectionState={connectionState}
						copyState={copyState}
						documents={documents}
						expandedDirectoryPaths={expandedDirectoryPaths}
						fileTree={fileTree}
						focusedTreeNode={focusedTreeNode}
						hasCopiedFile={Boolean(copyState)}
						isFocusedTreeNodeBookmarked={isFocusedTreeNodeBookmarked}
						locateRequestId={locateRequestId}
						onCancelCopy={handleCancelCopy}
						onCopyFile={handleCopyFile}
						onCreateFolder={handleOpenCreateFolder}
						onCreateFile={handleOpenCreateFile}
						onDeleteEntry={() => setDeleteDialogOpen(true)}
						onLocateCurrent={handleLocateSelectedDocument}
						onOpenDocument={handleOpenDocument}
						onOpenFolder={handleOpenFolder}
						onOpenRemote={handleOpenRemoteWorkspace}
						onOpenSyncSettings={handleOpenSyncSettings}
						onPasteFile={handlePasteFile}
						onRenameFile={handleOpenRename}
						onRefreshFileTree={handleRefreshFileTree}
						onSelectTreeNode={handleSelectTreeNode}
						onToggleBookmark={handleToggleBookmark}
						onToggleDirectoryExpanded={toggleDirectoryExpanded}
						refreshing={refreshingFileTree}
						syncEnabled={syncEnabled}
						switchingWorkspaceMode={switchingWorkspaceMode}
						selectedDocumentId={selectedDocument?.id ?? null}
						selectedDocumentRelativePath={
							selectedDocument?.relativePath ?? null
						}
						selectedTreeNodePath={selectedTreeNodePath}
						workspaceSource={workspaceSource}
						workspaceMode={workspaceMode}
						switchWorkspaceMode={handleSwitchWorkspaceMode}
					/>
				</View>

				<View
					style={{
						flex: 1,
						opacity: activeTab === 'editor' ? 1 : 0,
						pointerEvents: activeTab === 'editor' ? 'auto' : 'none',
						position: activeTab === 'editor' ? 'relative' : 'absolute',
						inset: 0,
					}}
				>
					{selectedDocument ? (
						selectedDocument.fileKind === 'image' ? (
							<ImageDocumentPreview
								document={selectedDocument}
								readRemoteFile={readRemoteFile}
								topPadding={editorTopPadding}
								workspaceSource={workspaceSource}
							/>
						) : (
							<>
								<MarkdownEditor
									contentBottomPadding={editorBottomPadding}
									contentTopPadding={editorTopPadding}
									filePath={selectedDocument.path}
									fontSize={editorFontSize}
									onNavigateFile={handleNavigateFile}
									onSave={handleSaveActiveDocument}
									resolveRemoteImage={
										workspaceSource.kind === 'remote'
											? resolveRemoteImage
											: undefined
									}
									rootUri={
										workspaceSource.kind === 'directory' ||
										workspaceSource.kind === 'remote'
											? workspaceSource.uri
											: null
									}
									theme={resolvedTheme}
									title={selectedDocument.title}
									value={selectedDocument.content}
									onChange={updateSelectedDocumentContent}
									onEditorStateChange={handleEditorStateChange}
									onRequestCompletion={requestInlineCompletion}
									remoteEditorState={visibleRemoteEditorState}
									syncShowingLoader={editorSyncLoading}
								/>
								{saveMode === 'manual' && activeDocumentDirty ? (
									<SaveCapsule
										insetsTop={insets.top}
										saving={isSavingActiveDocument}
										onPress={handleSaveActiveDocument}
									/>
								) : null}
							</>
						)
					) : (
						<EmptyEditorState
							canCreateFile={workspaceSource.kind === 'directory'}
							connectionState={connectionState}
							onCreateFile={handleOpenCreateFile}
							onOpenFolder={handleOpenFolder}
							onOpenRemote={handleOpenRemoteWorkspace}
							onOpenSyncSettings={handleOpenSyncSettings}
							syncEnabled={syncEnabled}
							topPadding={editorTopPadding}
							workspaceSource={workspaceSource}
						/>
					)}
				</View>
			</View>
			<RenameFileModal
				isOpen={renameModalOpen}
				value={renameValue}
				onChangeValue={setRenameValue}
				onClose={() => {
					Keyboard.dismiss();
					setRenameModalOpen(false);
				}}
				onConfirm={handleConfirmRename}
			/>
			<CreateFileModal
				isOpen={createModalOpen}
				value={createValue}
				onChangeValue={setCreateValue}
				onClose={() => {
					Keyboard.dismiss();
					setCreateModalOpen(false);
				}}
				onConfirm={handleConfirmCreate}
			/>
			<CreateFolderModal
				isOpen={createFolderModalOpen}
				value={createFolderValue}
				onChangeValue={setCreateFolderValue}
				onClose={() => {
					Keyboard.dismiss();
					setCreateFolderModalOpen(false);
				}}
				onConfirm={handleConfirmCreateFolder}
			/>
			<DeleteEntryDialog
				entryName={focusedTreeNode?.name ?? ''}
				isOpen={deleteDialogOpen}
				onClose={() => setDeleteDialogOpen(false)}
				onConfirm={handleDeleteEntry}
			/>
			<UnsavedExitDialog
				intent={unsavedDialogIntent ?? 'leave'}
				isOpen={Boolean(unsavedDialogIntent)}
				onCancel={handleUnsavedCancelExit}
				onContinue={handleUnsavedContinueSwitch}
				onDiscard={handleUnsavedDiscardAndExit}
				onSave={handleUnsavedSaveAndExit}
			/>
		</View>
	);
}

function ImageDocumentPreview({
	document,
	readRemoteFile,
	topPadding,
	workspaceSource,
}: {
	document: EditorDocument;
	readRemoteFile: (path: string) => Promise<{ imageDataUrl: string | null }>;
	topPadding: number;
	workspaceSource: EditorWorkspaceSource;
}) {
	const { t } = useTranslation();
	const palette = useAppThemePalette();
	const [imageUri, setImageUri] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setImageUri(null);

		async function loadImage() {
			try {
				const nextUri =
					workspaceSource.kind === 'remote'
						? (await readRemoteFile(document.path)).imageDataUrl
						: await readLocalFileAsDataUri(document.path);

				if (!cancelled) {
					setImageUri(nextUri ?? null);
				}
			} catch {
				if (!cancelled) {
					setImageUri(null);
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		}

		void loadImage();

		return () => {
			cancelled = true;
		};
	}, [document.path, readRemoteFile, workspaceSource.kind]);

	return (
		<View
			className="flex-1 items-center justify-center px-4 pb-4"
			style={{ backgroundColor: palette.background, paddingTop: topPadding }}
		>
			{loading ? (
				<Spinner color={palette.iconMuted} size="small" />
			) : imageUri ? (
				<Image
					accessibilityLabel={document.title}
					resizeMode="contain"
					source={{ uri: imageUri }}
					style={{ height: '100%', width: '100%' }}
				/>
			) : (
				<View className="items-center gap-1 px-6">
					<Text
						className="text-center text-[15px] font-semibold"
						numberOfLines={2}
						style={{ color: palette.foreground }}
					>
						{document.title}
					</Text>
					<Text
						className="text-center text-[13px]"
						style={{ color: palette.mutedForeground }}
					>
						{t('workspace.imagePreviewUnavailable')}
					</Text>
				</View>
			)}
		</View>
	);
}

function FileTreeView({
	bookmarkedDocumentIds,
	canCopyFile,
	canCreateFile,
	connectionState,
	copyState,
	documents,
	expandedDirectoryPaths,
	fileTree,
	focusedTreeNode,
	hasCopiedFile,
	isFocusedTreeNodeBookmarked,
	locateRequestId,
	onCancelCopy,
	onCopyFile,
	onCreateFolder,
	onCreateFile,
	onDeleteEntry,
	onLocateCurrent,
	onOpenDocument,
	onOpenFolder,
	onOpenRemote,
	onOpenSyncSettings,
	onPasteFile,
	onRenameFile,
	onRefreshFileTree,
	onSelectTreeNode,
	onToggleBookmark,
	onToggleDirectoryExpanded,
	refreshing,
	syncEnabled,
	switchingWorkspaceMode,
	selectedDocumentId,
	selectedDocumentRelativePath,
	selectedTreeNodePath,
	workspaceSource,
	workspaceMode,
	switchWorkspaceMode,
}: {
	bookmarkedDocumentIds: string[];
	canCopyFile: boolean;
	canCreateFile: boolean;
	connectionState: SyncConnectionState;
	copyState: { documentId: string; title: string } | null;
	documents: EditorDocument[];
	expandedDirectoryPaths: Set<string>;
	fileTree: EditorNode[];
	focusedTreeNode: EditorNode | null;
	hasCopiedFile: boolean;
	isFocusedTreeNodeBookmarked: boolean;
	locateRequestId: number;
	onCancelCopy: () => void;
	onCopyFile: () => void;
	onCreateFolder: () => void;
	onCreateFile: () => void;
	onDeleteEntry: () => void;
	onLocateCurrent: () => void;
	onOpenDocument: (documentId: string) => void;
	onOpenFolder: () => void;
	onOpenRemote: () => void;
	onOpenSyncSettings: () => void;
	onPasteFile: () => void;
	onRenameFile: () => void;
	onRefreshFileTree: () => void;
	onSelectTreeNode: (documentId: string) => void;
	onToggleBookmark: () => void;
	onToggleDirectoryExpanded: (directoryPath: string) => void;
	refreshing: boolean;
	syncEnabled: boolean;
	switchingWorkspaceMode: WorkspaceMode | null;
	selectedDocumentId: string | null;
	selectedDocumentRelativePath: string | null;
	selectedTreeNodePath: string | null;
	workspaceSource: EditorWorkspaceSource;
	workspaceMode: WorkspaceMode;
	switchWorkspaceMode: (mode: WorkspaceMode) => void;
}) {
	const { t } = useTranslation();
	const insets = useSafeAreaInsets();
	const palette = useAppThemePalette();
	const scrollViewRef = useRef<ScrollViewType>(null);
	const showUnselectedFolderState =
		workspaceSource.kind === 'empty' &&
		fileTree.length === 0 &&
		documents.length === 0;
	const showUnselectedRemoteState =
		syncEnabled && showUnselectedFolderState && workspaceMode === 'remote';
	const workspacePath =
		workspaceSource.kind === 'empty'
			? t('fileTree.title')
			: getWorkspaceDisplayPath(
					workspaceSource,
					focusedTreeNode?.relativePath || selectedDocumentRelativePath
				);
	const showRemoteNotConnectedState =
		syncEnabled &&
		workspaceSource.kind === 'remote' &&
		workspaceMode === 'remote' &&
		connectionState !== 'connected' &&
		fileTree.length === 0 &&
		documents.length === 0;
	const showRemoteEmptyState =
		syncEnabled &&
		workspaceSource.kind === 'remote' &&
		workspaceMode === 'remote' &&
		connectionState === 'connected' &&
		fileTree.length === 0 &&
		documents.length === 0;
	const showWorkspaceActions =
		workspaceSource.kind !== 'empty' &&
		!showRemoteNotConnectedState &&
		!showRemoteEmptyState;
	const bookmarkedNodes = useMemo(
		() =>
			bookmarkedDocumentIds.map((path) =>
				createBookmarkedFileEntry(path, findTreeNode(fileTree, path))
			),
		[bookmarkedDocumentIds, fileTree]
	);
	const visiblePaths = useMemo(
		() => flattenVisibleTreePaths(fileTree, expandedDirectoryPaths),
		[fileTree, expandedDirectoryPaths]
	);
	const selectedVisibleIndex = selectedTreeNodePath
		? visiblePaths.indexOf(selectedTreeNodePath)
		: -1;
	const canLocateCurrent = Boolean(selectedDocumentId);

	useEffect(() => {
		if (locateRequestId === 0 || selectedVisibleIndex < 0) return;

		scrollViewRef.current?.scrollTo({
			animated: true,
			y: Math.max(
				0,
				selectedVisibleIndex * TREE_ROW_ESTIMATED_HEIGHT -
					TREE_LOCATE_SCROLL_OFFSET
			),
		});
	}, [locateRequestId, selectedVisibleIndex]);

	return (
		<View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
			<FileTreeModeTabs
				pendingValue={switchingWorkspaceMode}
				showRemote={syncEnabled}
				value={workspaceMode}
				onValueChange={switchWorkspaceMode}
			/>

			{switchingWorkspaceMode ? (
				<FileTreeModeLoadingState />
			) : showUnselectedFolderState ? (
				showUnselectedRemoteState ? (
					<RemoteNotConnectedState onOpenSyncSettings={onOpenSyncSettings} />
				) : (
					<EmptyFolderSelectionState
						connectionState={connectionState}
						onOpenFolder={onOpenFolder}
						onOpenRemote={onOpenRemote}
						syncEnabled={syncEnabled}
					/>
				)
			) : (
				<>
					<View
						style={{
							borderBottomColor: palette.border,
							borderBottomWidth:
								showRemoteEmptyState || showRemoteNotConnectedState ? 0 : 1,
						}}
					>
						{showRemoteEmptyState || showRemoteNotConnectedState ? null : (
							<View
								className="flex-row items-center justify-between gap-3 px-4
									py-3"
							>
								<Text
									className="min-w-0 flex-1 text-[15px] font-semibold
										text-foreground"
									numberOfLines={1}
								>
									{workspacePath}
								</Text>
								{showWorkspaceActions && workspaceSource.kind !== 'remote' ? (
									<FileToolbarIconButton
										icon={FolderOpen}
										label={t('fileTree.actions.openFolder')}
										onPress={onOpenFolder}
										palette={palette}
									/>
								) : null}
							</View>
						)}
						{showWorkspaceActions ? (
							<View
								className="flex-row flex-wrap items-center gap-1 px-2 py-1.5"
								style={{ borderTopColor: palette.border, borderTopWidth: 1 }}
							>
								{canCreateFile ? (
									<>
										<FileToolbarIconButton
											icon={FilePlus2}
											label={t('fileTree.actions.newFile')}
											onPress={onCreateFile}
											palette={palette}
										/>
										<FileToolbarIconButton
											icon={FolderCog}
											label={t('fileTree.actions.newFolder')}
											onPress={onCreateFolder}
											palette={palette}
										/>
										<FileToolbarIconButton
											icon={ClipboardPaste}
											label={t('markdownEditor.toolbar.pasteFile')}
											onPress={onPasteFile}
											palette={palette}
											disabled={!hasCopiedFile}
											active={hasCopiedFile}
										/>
									</>
								) : null}
								<FileToolbarIconButton
									icon={RefreshCw}
									label={t('fileTree.actions.refresh')}
									onPress={onRefreshFileTree}
									palette={palette}
									disabled={refreshing}
									loading={refreshing}
								/>
								<FileToolbarIconButton
									icon={LocateFixed}
									label={t('fileTree.actions.locateCurrent')}
									onPress={onLocateCurrent}
									palette={palette}
									disabled={!canLocateCurrent}
								/>
								<FileToolbarIconButton
									icon={Edit3}
									label={t('markdownEditor.toolbar.renameFile')}
									onPress={onRenameFile}
									palette={palette}
									disabled={!focusedTreeNode || focusedTreeNode.kind !== 'file'}
								/>
								<FileToolbarIconButton
									icon={Copy}
									label={t('markdownEditor.toolbar.copyFile')}
									onPress={onCopyFile}
									palette={palette}
									disabled={!canCopyFile}
									active={Boolean(
										copyState &&
										(focusedTreeNode?.path === copyState.documentId ||
											selectedDocumentId === copyState.documentId)
									)}
								/>
								<FileToolbarIconButton
									icon={isFocusedTreeNodeBookmarked ? BookmarkCheck : Bookmark}
									label={
										isFocusedTreeNodeBookmarked
											? t('fileTree.actions.removeBookmark')
											: t('fileTree.actions.bookmark')
									}
									onPress={onToggleBookmark}
									palette={palette}
									disabled={!focusedTreeNode || focusedTreeNode.kind !== 'file'}
								/>
								<FileToolbarIconButton
									icon={Trash2}
									label={t('fileTree.actions.delete')}
									onPress={onDeleteEntry}
									palette={palette}
									disabled={
										!focusedTreeNode ||
										focusedTreeNode.path === workspaceSource.uri
									}
								/>
							</View>
						) : null}
						{copyState ? (
							<View
								className="flex-row items-center gap-2 px-3 py-2"
								style={{
									backgroundColor: palette.surfaceMuted,
									borderTopColor: palette.border,
									borderTopWidth: 1,
								}}
							>
								<Copy color={palette.icon} size={15} strokeWidth={2.2} />
								<Text
									className="min-w-0 flex-1 text-[12px] font-medium
										text-foreground"
									numberOfLines={1}
								>
									{t('fileTree.copyBanner.title', { name: copyState.title })}
								</Text>
								<FileToolbarIconButton
									icon={ClipboardPaste}
									label={t('markdownEditor.toolbar.pasteFile')}
									onPress={onPasteFile}
									palette={palette}
									active
								/>
								<FileToolbarIconButton
									icon={X}
									label={t('fileTree.actions.cancelCopy')}
									onPress={onCancelCopy}
									palette={palette}
								/>
							</View>
						) : null}
					</View>
					{bookmarkedNodes.length > 0 && !showRemoteNotConnectedState ? (
						<View className="px-2 pt-2">
							<BookmarksSection
								nodes={bookmarkedNodes}
								onOpenDocument={onOpenDocument}
								onSelectTreeNode={onSelectTreeNode}
								selectedTreeNodePath={selectedTreeNodePath}
							/>
						</View>
					) : null}
					{showRemoteNotConnectedState ? (
						<RemoteNotConnectedState onOpenSyncSettings={onOpenSyncSettings} />
					) : (
						<ScrollView
							ref={scrollViewRef}
							keyboardShouldPersistTaps="handled"
							showsVerticalScrollIndicator={false}
							className="flex-1 px-2 py-2"
							contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
						>
							<View className="gap-1">
								{fileTree.length > 0
									? fileTree.map((node) => (
											<FileTreeNodeRow
												key={node.id}
												node={node}
												expandedDirectoryPaths={expandedDirectoryPaths}
												onOpenDocument={onOpenDocument}
												onSelectTreeNode={onSelectTreeNode}
												onToggleDirectoryExpanded={onToggleDirectoryExpanded}
												selectedTreeNodePath={selectedTreeNodePath}
											/>
										))
									: documents.map((document) => (
											<DocumentRow
												key={document.id}
												document={document}
												onOpenDocument={onOpenDocument}
												onSelectTreeNode={onSelectTreeNode}
												selected={document.id === selectedTreeNodePath}
											/>
										))}

								{fileTree.length === 0 && documents.length === 0 ? (
									<EmptyWorkspace
										canCreateFile={canCreateFile}
										connectionState={connectionState}
										onCreateFile={onCreateFile}
										onOpenFolder={onOpenFolder}
										onOpenRemote={onOpenRemote}
										palette={palette}
										syncEnabled={syncEnabled}
										workspaceSource={workspaceSource}
									/>
								) : null}
							</View>
						</ScrollView>
					)}
				</>
			)}
		</View>
	);
}

function FileTreeNodeRow({
	depth = 0,
	expandedDirectoryPaths,
	node,
	onOpenDocument,
	onSelectTreeNode,
	onToggleDirectoryExpanded,
	selectedTreeNodePath,
}: {
	depth?: number;
	expandedDirectoryPaths: Set<string>;
	node: EditorNode;
	onOpenDocument: (documentId: string) => void;
	onSelectTreeNode: (documentId: string) => void;
	onToggleDirectoryExpanded: (directoryPath: string) => void;
	selectedTreeNodePath: string | null;
}) {
	const palette = useAppThemePalette();
	const lastPressRef = useRef(0);
	const expanded = expandedDirectoryPaths.has(node.path);
	const selectable =
		node.kind === 'file' &&
		(node.fileKind === 'markdown' || node.fileKind === 'text');
	const actionable = selectable || node.kind === 'directory';
	const selected = node.path === selectedTreeNodePath;
	const iconColor = selected
		? palette.accentForeground
		: actionable
			? palette.icon
			: palette.iconMuted;
	const Chevron = expanded ? ChevronDown : ChevronRight;

	const handlePress: PressableProps['onPress'] = (event) => {
		if (node.kind === 'directory') {
			handleToggleDirectory();
			return;
		}

		if (selectable) {
			const now = event.nativeEvent.timestamp;
			if (
				lastPressRef.current &&
				now - lastPressRef.current <= DOUBLE_PRESS_DELAY
			) {
				lastPressRef.current = 0;
				onOpenDocument(node.path);
				return;
			}

			lastPressRef.current = now;
			onSelectTreeNode(node.path);
		}
	};

	const handleToggleDirectory = () => {
		onSelectTreeNode(node.path);
		onToggleDirectoryExpanded(node.path);
	};

	return (
		<View>
			<View className="py-0.5">
				<View
					className="flex-row items-center"
					style={{ paddingLeft: depth * TREE_INDENT_STEP + TREE_ROW_INSET }}
				>
					<Pressable
						disabled={!actionable}
						onPress={handlePress}
						className="min-h-10 flex-1 flex-row items-center rounded-md py-2
							pl-0 pr-2"
						style={{
							backgroundColor: selected ? palette.accentSurface : 'transparent',
							borderRadius: TREE_ROW_RADIUS,
							overflow: 'hidden',
						}}
					>
						{node.kind === 'directory' ? (
							<View
								className="items-center justify-center"
								style={{
									height: TREE_TOGGLE_SIZE,
									marginRight: TREE_TOGGLE_GAP,
									width: TREE_TOGGLE_SIZE,
								}}
							>
								<Chevron
									color={iconColor}
									size={TREE_CHEVRON_SIZE}
									strokeWidth={2.2}
								/>
							</View>
						) : (
							<View
								style={{
									height: TREE_TOGGLE_SIZE,
									marginRight: TREE_TOGGLE_GAP,
									width: TREE_TOGGLE_SIZE,
								}}
							/>
						)}
						<View className="min-w-0 flex-1 flex-row items-center">
							{node.kind === 'directory' ? (
								expanded ? (
									<FolderOpen
										color={iconColor}
										size={TREE_NODE_ICON_SIZE}
										strokeWidth={2}
									/>
								) : (
									<Folder
										color={iconColor}
										size={TREE_NODE_ICON_SIZE}
										strokeWidth={2}
									/>
								)
							) : (
								<FileText
									color={iconColor}
									size={TREE_NODE_ICON_SIZE}
									strokeWidth={2}
								/>
							)}
							<Text
								numberOfLines={1}
								className="ml-2 flex-1 text-[15px]"
								style={{
									color: selected
										? palette.accentForeground
										: actionable
											? palette.foreground
											: palette.mutedForeground,
									fontWeight: selected ? '600' : '400',
								}}
							>
								{node.name}
							</Text>
						</View>
					</Pressable>
				</View>
			</View>
			{expanded && node.kind === 'directory' ? (
				<View className="relative">
					<IndentGuides depth={depth} />
					{node.loaded && node.children.length > 0 ? (
						node.children.map((child) => (
							<FileTreeNodeRow
								key={child.id}
								depth={depth + 1}
								expandedDirectoryPaths={expandedDirectoryPaths}
								node={child}
								onOpenDocument={onOpenDocument}
								onSelectTreeNode={onSelectTreeNode}
								onToggleDirectoryExpanded={onToggleDirectoryExpanded}
								selectedTreeNodePath={selectedTreeNodePath}
							/>
						))
					) : node.loaded ? null : (
						<View
							className="items-center justify-center py-2"
							style={{
								paddingLeft: (depth + 1) * TREE_INDENT_STEP + TREE_ROW_INSET,
							}}
						>
							<Spinner color={palette.iconMuted} size="small" />
						</View>
					)}
				</View>
			) : null}
		</View>
	);
}

function DocumentRow({
	document,
	onOpenDocument,
	onSelectTreeNode,
	selected,
}: {
	document: EditorDocument;
	onOpenDocument: (documentId: string) => void;
	onSelectTreeNode: (documentId: string) => void;
	selected: boolean;
}) {
	const palette = useAppThemePalette();
	const iconColor = selected ? palette.accentForeground : palette.icon;
	const lastPressRef = useRef(0);

	const handlePress: PressableProps['onPress'] = (event) => {
		const now = event.nativeEvent.timestamp;
		if (
			lastPressRef.current &&
			now - lastPressRef.current <= DOUBLE_PRESS_DELAY
		) {
			lastPressRef.current = 0;
			onOpenDocument(document.id);
			return;
		}

		lastPressRef.current = now;
		onSelectTreeNode(document.id);
	};

	return (
		<View className="relative py-0.5">
			<Pressable
				onPress={handlePress}
				className="min-h-10 flex-row items-center gap-2 rounded-md px-2 py-2"
				style={{
					backgroundColor: selected ? palette.accentSurface : 'transparent',
					borderRadius: TREE_ROW_RADIUS,
					overflow: 'hidden',
					paddingLeft: TREE_FILE_START_OFFSET,
				}}
			>
				<FileText
					color={iconColor}
					size={TREE_NODE_ICON_SIZE}
					strokeWidth={2}
				/>
				<View className="flex-1">
					<Text
						numberOfLines={1}
						className="text-[15px]"
						style={{
							color: selected ? palette.accentForeground : palette.foreground,
							fontWeight: selected ? '600' : '400',
						}}
					>
						{document.title}
					</Text>
					<Text numberOfLines={1} className="text-[11px] text-muted-foreground">
						{document.relativePath || document.path}
					</Text>
				</View>
			</Pressable>
		</View>
	);
}

function BookmarksSection({
	nodes,
	onOpenDocument,
	onSelectTreeNode,
	selectedTreeNodePath,
}: {
	nodes: BookmarkedFileEntry[];
	onOpenDocument: (documentId: string) => void;
	onSelectTreeNode: (documentId: string) => void;
	selectedTreeNodePath: string | null;
}) {
	const { t } = useTranslation();
	const palette = useAppThemePalette();
	const [collapsed, setCollapsed] = useState(false);
	const Chevron = collapsed ? ChevronRight : ChevronDown;

	return (
		<View
			className="mb-2 gap-1 rounded-md border border-border/70 px-2 py-2"
			style={{ backgroundColor: palette.surfaceMuted }}
		>
			<Pressable
				onPress={() => setCollapsed((current) => !current)}
				className="flex-row items-center gap-1.5 px-1 py-0.5"
			>
				<Chevron color={palette.mutedForeground} size={12} strokeWidth={2.2} />
				<Text className="flex-1 text-[12px] font-semibold text-muted-foreground">
					{t('fileTree.bookmarks')}
				</Text>
			</Pressable>
			{collapsed
				? null
				: nodes.map((node) => (
						<DocumentRow
							key={`bookmark-${node.path}`}
							document={{
								content: '',
								fileKind: node.fileKind,
								id: node.path,
								path: node.path,
								readOnly: false,
								relativePath: node.relativePath,
								title: node.name,
								updatedAt: 0,
							}}
							onOpenDocument={onOpenDocument}
							onSelectTreeNode={onSelectTreeNode}
							selected={node.path === selectedTreeNodePath}
						/>
					))}
		</View>
	);
}

function IndentGuides({ depth }: { depth: number }) {
	return (
		<View
			pointerEvents="none"
			style={{
				alignItems: 'center',
				bottom: 0,
				left: depth * TREE_INDENT_STEP + TREE_ROW_INSET,
				position: 'absolute',
				top: 0,
				width: TREE_TOGGLE_SIZE,
			}}
		>
			<View
				style={{
					backgroundColor: 'rgba(115, 115, 115, 0.28)',
					flex: 1,
					width: TREE_GUIDE_WIDTH,
				}}
			/>
		</View>
	);
}

function FileToolbarIconButton({
	icon: Icon,
	label,
	onPress,
	palette,
	active = false,
	disabled = false,
	loading = false,
}: {
	icon: typeof FilePlus2;
	label: string;
	onPress: () => void;
	palette: ReturnType<typeof useAppThemePalette>;
	active?: boolean;
	disabled?: boolean;
	loading?: boolean;
}) {
	const foregroundColor = active ? palette.accentForeground : palette.icon;

	return (
		<Pressable
			accessibilityLabel={label}
			disabled={disabled}
			onPress={onPress}
			className="h-8 w-8 items-center justify-center rounded-md"
			style={{
				backgroundColor: active ? palette.accentSurface : 'transparent',
				opacity: disabled ? 0.45 : 1,
			}}
		>
			{loading ? (
				<Spinner color={foregroundColor} size="small" />
			) : (
				<Icon color={foregroundColor} size={16} strokeWidth={2.2} />
			)}
		</Pressable>
	);
}

function FileActionButton({
	fullWidth = false,
	icon: Icon,
	label,
	onPress,
	palette,
}: {
	fullWidth?: boolean;
	icon: typeof FilePlus2;
	label: string;
	onPress: () => void;
	palette: ReturnType<typeof useAppThemePalette>;
}) {
	return (
		<Pressable
			accessibilityLabel={label}
			onPress={onPress}
			className={`min-h-9 flex-row items-center justify-center gap-2 rounded-md
				px-3 ${fullWidth ? 'w-full' : 'flex-1'}`}
			style={{
				backgroundColor: palette.surfaceMuted,
				borderColor: palette.border,
				borderWidth: 1,
				...(fullWidth ? { width: '100%' } : { flex: 1, minWidth: 0 }),
			}}
		>
			<Icon color={palette.icon} size={16} strokeWidth={2.2} />
			<Text
				numberOfLines={1}
				className="text-[13px] font-semibold text-foreground"
			>
				{label}
			</Text>
		</Pressable>
	);
}

function FileActionRow({ children }: { children: ReactNode }) {
	return <View className="w-full flex-row gap-2">{children}</View>;
}

function FileActionStack({ children }: { children: ReactNode }) {
	return <View className="w-full gap-2">{children}</View>;
}

function FileTreeModeLoadingState() {
	const palette = useAppThemePalette();

	return (
		<View className="flex-1 items-center justify-center">
			<Spinner color={palette.iconMuted} size="small" />
		</View>
	);
}

function EmptyWorkspace({
	canCreateFile,
	connectionState,
	onCreateFile,
	onOpenFolder,
	onOpenRemote,
	palette,
	syncEnabled,
	workspaceSource,
}: {
	canCreateFile: boolean;
	connectionState: SyncConnectionState;
	onCreateFile: () => void;
	onOpenFolder: () => void;
	onOpenRemote: () => void;
	palette: ReturnType<typeof useAppThemePalette>;
	syncEnabled: boolean;
	workspaceSource: EditorWorkspaceSource;
}) {
	const { t } = useTranslation();
	const canShowCreateAction =
		workspaceSource.kind === 'directory' && canCreateFile;

	if (workspaceSource.kind === 'remote') {
		return (
			<View className="px-3 py-6">
				<View
					className="gap-3 rounded-md border border-dashed border-border p-4"
				>
					<View className="gap-1">
						<Text className="text-[15px] font-semibold text-foreground">
							{t('fileTree.remoteEmpty.title')}
						</Text>
						<Text className="text-[13px] leading-5 text-muted-foreground">
							{t('fileTree.remoteEmpty.detail')}
						</Text>
					</View>
				</View>
			</View>
		);
	}

	return (
		<View className="px-3 py-6">
			<View className="gap-3 rounded-md border border-dashed border-border p-4">
				<View className="gap-1">
					<Text className="text-[15px] font-semibold text-foreground">
						{t('fileTree.empty.title')}
					</Text>
					<Text className="text-[13px] leading-5 text-muted-foreground">
						{t('fileTree.empty.detail')}
					</Text>
				</View>
				<FileActionStack>
					{canShowCreateAction ? (
						<FileActionButton
							fullWidth
							icon={FilePlus2}
							label={t('fileTree.actions.newFile')}
							onPress={onCreateFile}
							palette={palette}
						/>
					) : null}
					<FileActionButton
						fullWidth
						icon={FolderPlus}
						label={t('fileTree.actions.openFolder')}
						onPress={onOpenFolder}
						palette={palette}
					/>
					{syncEnabled ? (
						<FileActionButton
							fullWidth
							icon={MonitorSmartphone}
							label={
								connectionState === 'connected'
									? t('workspace.actions.openRemote')
									: t('workspace.actions.connectDesktop')
							}
							onPress={onOpenRemote}
							palette={palette}
						/>
					) : null}
				</FileActionStack>
			</View>
		</View>
	);
}

function EmptyFolderSelectionState({
	connectionState,
	onOpenFolder,
	onOpenRemote,
	syncEnabled,
}: {
	connectionState: SyncConnectionState;
	onOpenFolder: () => void;
	onOpenRemote: () => void;
	syncEnabled: boolean;
}) {
	const { t } = useTranslation();
	const palette = useAppThemePalette();

	return (
		<View className="flex-1 bg-background px-5 pt-8">
			<View className="gap-4">
				<View className="gap-2">
					<Text className="text-[22px] font-semibold text-foreground">
						{t('fileTree.empty.title')}
					</Text>
					<Text className="text-[14px] leading-5 text-muted-foreground">
						{t('fileTree.empty.detail')}
					</Text>
				</View>
				<FileActionRow>
					<FileActionButton
						icon={FolderPlus}
						label={t('fileTree.actions.openFolder')}
						onPress={onOpenFolder}
						palette={palette}
					/>
					{syncEnabled ? (
						<FileActionButton
							icon={MonitorSmartphone}
							label={
								connectionState === 'connected'
									? t('workspace.actions.openRemote')
									: t('workspace.actions.connectDesktop')
							}
							onPress={onOpenRemote}
							palette={palette}
						/>
					) : null}
				</FileActionRow>
			</View>
		</View>
	);
}

function EmptyEditorState({
	canCreateFile,
	connectionState,
	onCreateFile,
	onOpenFolder,
	onOpenRemote,
	onOpenSyncSettings,
	syncEnabled,
	topPadding,
	workspaceSource,
}: {
	canCreateFile: boolean;
	connectionState: SyncConnectionState;
	onCreateFile: () => void;
	onOpenFolder: () => void;
	onOpenRemote: () => void;
	onOpenSyncSettings: () => void;
	syncEnabled: boolean;
	topPadding: number;
	workspaceSource: EditorWorkspaceSource;
}) {
	const { t } = useTranslation();
	const palette = useAppThemePalette();
	const isRemoteWorkspace = workspaceSource.kind === 'remote';
	const hasOpenFolder = workspaceSource.kind === 'directory';
	const canShowCreateAction = hasOpenFolder && canCreateFile;
	const title = isRemoteWorkspace
		? connectionState === 'connected'
			? t('workspace.remoteNoSelection.title')
			: t('fileTree.remoteNotConnected.title')
		: hasOpenFolder
			? t('workspace.noSelection.title')
			: t('workspace.empty.title');
	const detail = isRemoteWorkspace
		? connectionState === 'connected'
			? t('workspace.remoteNoSelection.detail')
			: t('fileTree.remoteNotConnected.detail')
		: hasOpenFolder
			? t('workspace.noSelection.detail')
			: t('workspace.empty.detail');

	return (
		<View
			className="flex-1 bg-background px-5"
			style={{ paddingTop: topPadding + 56 }}
		>
			<View className="gap-4">
				<View className="gap-2">
					<Text className="text-[22px] font-semibold text-foreground">
						{title}
					</Text>
					<Text className="text-[14px] leading-5 text-muted-foreground">
						{detail}
					</Text>
				</View>
				<FileActionRow>
					{isRemoteWorkspace ? (
						connectionState === 'connected' ? (
							<FileActionButton
								icon={MonitorSmartphone}
								label={t('fileTree.tabs.remote')}
								onPress={onOpenRemote}
								palette={palette}
							/>
						) : (
							<FileActionButton
								icon={Settings}
								label={t('fileTree.remoteNotConnected.action')}
								onPress={onOpenSyncSettings}
								palette={palette}
							/>
						)
					) : hasOpenFolder ? (
						canShowCreateAction ? (
							<FileActionButton
								icon={FilePlus2}
								label={t('fileTree.actions.newFile')}
								onPress={onCreateFile}
								palette={palette}
							/>
						) : null
					) : (
						<>
							<FileActionButton
								icon={FolderPlus}
								label={t('fileTree.actions.openFolder')}
								onPress={onOpenFolder}
								palette={palette}
							/>
							{syncEnabled ? (
								<FileActionButton
									icon={MonitorSmartphone}
									label={
										connectionState === 'connected'
											? t('workspace.actions.openRemote')
											: t('workspace.actions.connectDesktop')
									}
									onPress={onOpenRemote}
									palette={palette}
								/>
							) : null}
						</>
					)}
				</FileActionRow>
			</View>
		</View>
	);
}

function getWorkspaceDisplayPath(
	workspaceSource: EditorWorkspaceSource,
	selectedDocumentRelativePath: string | null
) {
	if (workspaceSource.kind === 'directory') {
		return selectedDocumentRelativePath
			? `${workspaceSource.name}/${selectedDocumentRelativePath}`
			: workspaceSource.name;
	}

	if (workspaceSource.kind === 'remote') {
		return selectedDocumentRelativePath
			? `${workspaceSource.uri}/${selectedDocumentRelativePath}`
			: workspaceSource.uri;
	}

	if (workspaceSource.kind === 'file') {
		return workspaceSource.name;
	}

	return '';
}

function RenameFileModal({
	isOpen,
	value,
	onChangeValue,
	onClose,
	onConfirm,
}: {
	isOpen: boolean;
	value: string;
	onChangeValue: (nextValue: string) => void;
	onClose: () => void;
	onConfirm: () => void;
}) {
	const { t } = useTranslation();

	return (
		<NativeModal
			isOpen={isOpen}
			title={t('markdownEditor.toolbar.renameFile')}
			onClose={onClose}
			footer={
				<NativeModalActions
					cancelLabel={t('common.actions.cancel')}
					confirmLabel={t('common.actions.save')}
					onCancel={onClose}
					onConfirm={onConfirm}
				/>
			}
		>
			<NativeModalTextInput
				autoCapitalize="none"
				autoCorrect={false}
				autoFocus
				value={value}
				onChangeText={onChangeValue}
				onSubmitEditing={onConfirm}
				returnKeyType="done"
			/>
		</NativeModal>
	);
}

function CreateFileModal({
	isOpen,
	value,
	onChangeValue,
	onClose,
	onConfirm,
}: {
	isOpen: boolean;
	value: string;
	onChangeValue: (nextValue: string) => void;
	onClose: () => void;
	onConfirm: () => void;
}) {
	const { t } = useTranslation();

	return (
		<NativeModal
			isOpen={isOpen}
			title={t('fileTree.actions.newFile')}
			onClose={onClose}
			footer={
				<NativeModalActions
					cancelLabel={t('common.actions.cancel')}
					confirmLabel={t('common.actions.save')}
					onCancel={onClose}
					onConfirm={onConfirm}
				/>
			}
		>
			<NativeModalTextInput
				autoCapitalize="none"
				autoCorrect={false}
				autoFocus
				value={value}
				onChangeText={onChangeValue}
				onSubmitEditing={onConfirm}
				placeholder="note.md"
				returnKeyType="done"
			/>
		</NativeModal>
	);
}

function CreateFolderModal({
	isOpen,
	value,
	onChangeValue,
	onClose,
	onConfirm,
}: {
	isOpen: boolean;
	value: string;
	onChangeValue: (nextValue: string) => void;
	onClose: () => void;
	onConfirm: () => void;
}) {
	const { t } = useTranslation();

	return (
		<NativeModal
			isOpen={isOpen}
			title={t('fileTree.actions.newFolder')}
			onClose={onClose}
			footer={
				<NativeModalActions
					cancelLabel={t('common.actions.cancel')}
					confirmLabel={t('common.actions.save')}
					onCancel={onClose}
					onConfirm={onConfirm}
				/>
			}
		>
			<NativeModalTextInput
				autoCapitalize="none"
				autoCorrect={false}
				autoFocus
				value={value}
				onChangeText={onChangeValue}
				onSubmitEditing={onConfirm}
				placeholder="notes"
				returnKeyType="done"
			/>
		</NativeModal>
	);
}

function DeleteEntryDialog({
	entryName,
	isOpen,
	onClose,
	onConfirm,
}: {
	entryName: string;
	isOpen: boolean;
	onClose: () => void;
	onConfirm: () => void;
}) {
	const { t } = useTranslation();

	return (
		<NativeModal
			isOpen={isOpen}
			title={t('fileTree.delete.title')}
			onClose={onClose}
			footer={
				<NativeModalActions
					cancelLabel={t('common.actions.cancel')}
					confirmLabel={t('common.actions.delete')}
					destructive
					onCancel={onClose}
					onConfirm={onConfirm}
				/>
			}
		>
			<Text className="text-[13px] leading-5 text-muted-foreground">
				{t('fileTree.delete.detail', { name: entryName })}
			</Text>
		</NativeModal>
	);
}

const SAVE_CAPSULE_TOP_OFFSET = 8;
const SAVE_CAPSULE_RIGHT_OFFSET = 16;
type SaveCapsulePalette = {
	borderColor: string;
	mutedTextColor: string;
	surfaceColor: string;
	textColor: string;
};

function SaveCapsule({
	insetsTop,
	saving,
	onPress,
}: {
	insetsTop: number;
	saving: boolean;
	onPress: () => void;
}) {
	const { t } = useTranslation();
	const resolvedTheme = useResolvedThemePreference();
	const palette = getSaveCapsulePalette(resolvedTheme);

	return (
		<View
			pointerEvents="box-none"
			className="absolute"
			style={{
				top: insetsTop + SAVE_CAPSULE_TOP_OFFSET,
				right: SAVE_CAPSULE_RIGHT_OFFSET,
				zIndex: 20,
			}}
		>
			<View
				className="rounded-full p-1 shadow-lg shadow-black/25"
				style={{
					backgroundColor: palette.surfaceColor,
					borderColor: palette.borderColor,
					borderWidth: 1,
					opacity: saving ? 0.7 : 1,
				}}
			>
				<Pressable
					accessibilityLabel={t('markdownEditor.saveCapsule.save')}
					disabled={saving}
					onPress={onPress}
					className="flex-row items-center gap-1.5 rounded-full px-3 py-1"
				>
					{saving ? (
						<Spinner color={palette.textColor} size="small" />
					) : (
						<Save color={palette.textColor} size={14} strokeWidth={2.2} />
					)}
					<Text
						className="text-[12px]"
						style={{
							color: saving ? palette.mutedTextColor : palette.textColor,
						}}
					>
						{saving
							? t('markdownEditor.saveCapsule.saving')
							: t('markdownEditor.saveCapsule.save')}
					</Text>
				</Pressable>
			</View>
		</View>
	);
}

function getSaveCapsulePalette(
	theme: ResolvedThemePreference
): SaveCapsulePalette {
	if (theme === 'dark') {
		return {
			borderColor: 'rgba(255, 255, 255, 0.08)',
			mutedTextColor: 'rgba(245, 245, 245, 0.65)',
			surfaceColor: '#1a1a1a',
			textColor: '#f5f5f5',
		};
	}

	return {
		borderColor: 'rgba(17, 24, 39, 0.08)',
		mutedTextColor: 'rgba(17, 24, 39, 0.58)',
		surfaceColor: '#ffffff',
		textColor: '#111827',
	};
}

function UnsavedExitDialog({
	intent,
	isOpen,
	onCancel,
	onContinue,
	onDiscard,
	onSave,
}: {
	intent: UnsavedDialogIntent;
	isOpen: boolean;
	onCancel: () => void;
	onContinue: () => void;
	onDiscard: () => void;
	onSave: () => void;
}) {
	const { t } = useTranslation();
	const palette = useAppThemePalette();
	const isSwitchIntent = intent === 'switch';

	return (
		<NativeModal
			isOpen={isOpen}
			title={t('workspace.unsavedChanges.title')}
			onClose={onCancel}
			footer={
				<View className="flex-row flex-wrap justify-end gap-2">
					<UnsavedExitDialogButton
						label={t('workspace.unsavedChanges.cancel')}
						onPress={onCancel}
						palette={palette}
						variant="outline"
					/>
					{isSwitchIntent ? (
						<UnsavedExitDialogButton
							label={t('workspace.unsavedChanges.continueSwitch')}
							onPress={onContinue}
							palette={palette}
							variant="primary"
						/>
					) : (
						<>
							<UnsavedExitDialogButton
								label={t('workspace.unsavedChanges.discard')}
								onPress={onDiscard}
								palette={palette}
								variant="destructive"
							/>
							<UnsavedExitDialogButton
								label={t('workspace.unsavedChanges.save')}
								onPress={onSave}
								palette={palette}
								variant="primary"
							/>
						</>
					)}
				</View>
			}
		>
			<View className="flex-row items-start gap-2.5">
				<AlertTriangle
					color={palette.mutedForeground}
					size={16}
					strokeWidth={2.2}
				/>
				<Text className="flex-1 text-[13px] leading-5 text-muted-foreground">
					{t(
						isSwitchIntent
							? 'workspace.unsavedChanges.switchDetail'
							: 'workspace.unsavedChanges.detail'
					)}
				</Text>
			</View>
		</NativeModal>
	);
}

function UnsavedExitDialogButton({
	label,
	onPress,
	palette,
	variant,
}: {
	label: string;
	onPress: () => void;
	palette: ReturnType<typeof useAppThemePalette>;
	variant: 'destructive' | 'outline' | 'primary';
}) {
	const isOutline = variant === 'outline';
	const isDestructive = variant === 'destructive';
	const destructiveColor = '#dc2626';
	const backgroundColor = isOutline
		? 'transparent'
		: isDestructive
			? destructiveColor
			: palette.accentSurface;
	const borderColor = isOutline ? palette.border : backgroundColor;
	const textColor = isOutline
		? palette.foreground
		: isDestructive
			? '#ffffff'
			: palette.accentForeground;

	return (
		<Pressable
			accessibilityLabel={label}
			onPress={onPress}
			className="min-h-10 items-center justify-center rounded-md border px-3.5"
			style={{ backgroundColor, borderColor }}
		>
			<Text className="text-[13px] font-semibold" style={{ color: textColor }}>
				{label}
			</Text>
		</Pressable>
	);
}

function findTreeNode(nodes: EditorNode[], path: string): EditorNode | null {
	for (const node of nodes) {
		if (node.path === path) return node;

		if (node.kind === 'directory') {
			const nested = findTreeNode(node.children, path);
			if (nested) return nested;
		}
	}

	return null;
}

function createBookmarkedFileEntry(
	path: string,
	node: EditorNode | null
): BookmarkedFileEntry {
	if (node?.kind === 'file') {
		return {
			fileKind: node.fileKind ?? 'markdown',
			id: node.path,
			name: node.name,
			path: node.path,
			relativePath: node.relativePath,
		};
	}

	const name = getPathBasename(path);

	return {
		fileKind: inferFileKindFromPath(path),
		id: path,
		name,
		path,
		relativePath: name,
	};
}

function inferFileKindFromPath(path: string): EditorDocument['fileKind'] {
	const extension = getPathBasename(path).split('.').pop()?.toLowerCase();
	if (extension === 'md' || extension === 'markdown') return 'markdown';
	if (extension === 'txt') return 'text';
	if (
		extension === 'png' ||
		extension === 'jpg' ||
		extension === 'jpeg' ||
		extension === 'gif' ||
		extension === 'webp'
	) {
		return 'image';
	}
	return 'other';
}

function getPathBasename(path: string): string {
	const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
	return normalized.split('/').pop() || path;
}

function flattenVisibleTreePaths(
	nodes: EditorNode[],
	expandedDirectoryPaths: Set<string>
): string[] {
	const paths: string[] = [];

	for (const node of nodes) {
		paths.push(node.path);

		if (node.kind === 'directory' && expandedDirectoryPaths.has(node.path)) {
			paths.push(
				...flattenVisibleTreePaths(node.children, expandedDirectoryPaths)
			);
		}
	}

	return paths;
}

function showWorkspaceToast(
	showToast: ReturnType<typeof useNativeToast>['showToast'],
	title: string,
	description: string
) {
	showToast({
		description,
		durationMs: WORKSPACE_TOAST_DURATION_MS,
		id: WORKSPACE_TOAST_ID,
		title,
		tone: 'info',
	});
}
