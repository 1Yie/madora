import { useEffect, useMemo, useRef, useState } from 'react';
import {
	DeviceEventEmitter,
	Keyboard,
	PressableProps,
	Pressable,
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
	Trash2,
} from 'lucide-react-native';

import { MarkdownEditor } from '../components/markdown-editor';
import { useEditorWorkspace } from '../providers/editor-provider';
import { Button, ButtonText } from '@/components/ui/button';
import {
	AlertDialog,
	AlertDialogBackdrop,
	AlertDialogBody,
	AlertDialogContent,
	AlertDialogFooter,
	AlertDialogHeader,
} from '@/components/ui/alert-dialog';
import { Input, InputField } from '@/components/ui/input';
import {
	Modal,
	ModalBackdrop,
	ModalBody,
	ModalContent,
	ModalFooter,
	ModalHeader,
} from '@/components/ui/modal';
import { Spinner } from '@/components/ui/spinner';
import type {
	EditorDocument,
	EditorNode,
	EditorWorkspaceSource,
} from '../types';
import {
	WORKSPACE_EDITOR_OVERLAY_ACTIVE_EVENT,
	WORKSPACE_TAB_REQUEST_EVENT,
	WORKSPACE_TAB_STATE_EVENT,
	type WorkspaceTab,
} from '../lib/workspace-tab-events';
import {
	APP_THEME_BACKGROUND_COLORS,
	useAppSettings,
	useAppThemePalette,
	useResolvedThemePreference,
} from '@/features/settings';

const EDITOR_FLOATING_CONTROLS_BOTTOM_PADDING = 56;
const EDITOR_KEYBOARD_CONTROLS_BOTTOM_PADDING = 40;
const TREE_INDENT_STEP = 14;
const TREE_ROW_INSET = 8;
const TREE_TOGGLE_SIZE = 20;
const TREE_TOGGLE_GAP = 4;
const TREE_FILE_START_OFFSET =
	TREE_ROW_INSET + TREE_TOGGLE_SIZE + TREE_TOGGLE_GAP;
const TREE_GUIDE_LEFT = TREE_ROW_INSET + TREE_TOGGLE_SIZE / 2;
const TREE_GUIDE_WIDTH = 1.5;
const DOUBLE_PRESS_DELAY = 260;

export function WorkspaceScreen() {
	const insets = useSafeAreaInsets();
	const resolvedTheme = useResolvedThemePreference();
	const { editorFontSize } = useAppSettings();
	const [activeTab, setActiveTab] = useState<WorkspaceTab>('editor');
	const [keyboardHeight, setKeyboardHeight] = useState(0);
	const {
		bookmarkedDocumentIds,
		copySelectedFile,
		copyState,
		createLocalDirectory,
		createLocalFile,
		deleteSelectedEntry,
		documents,
		errorMessage,
		expandedDirectoryPaths,
		fileTree,
		focusedTreeNode,
		isFocusedTreeNodeBookmarked,
		openLocalFolder,
		pasteCopiedFile,
		renameSelectedFile,
		requestInlineCompletion,
		selectDocument,
		selectTreeNode,
		selectedDocument,
		selectedTreeNodePath,
		toggleBookmark,
		toggleDirectoryExpanded,
		updateSelectedDocumentContent,
		workspaceSource,
	} = useEditorWorkspace();
	const [createModalOpen, setCreateModalOpen] = useState(false);
	const [createValue, setCreateValue] = useState('');
	const [createFolderModalOpen, setCreateFolderModalOpen] = useState(false);
	const [createFolderValue, setCreateFolderValue] = useState('');
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [renameModalOpen, setRenameModalOpen] = useState(false);
	const [renameValue, setRenameValue] = useState('');

	const editorTopPadding = insets.top;
	const editorBottomPadding =
		insets.bottom +
		(keyboardHeight > 0
			? keyboardHeight + EDITOR_KEYBOARD_CONTROLS_BOTTOM_PADDING
			: EDITOR_FLOATING_CONTROLS_BOTTOM_PADDING);

	useEffect(() => {
		const subscription = DeviceEventEmitter.addListener(
			WORKSPACE_TAB_REQUEST_EVENT,
			(tab) => {
				if (tab === 'editor' || tab === 'fileTree') {
					setActiveTab(tab);
				}
			}
		);

		return () => subscription.remove();
	}, []);

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

	useEffect(() => {
		DeviceEventEmitter.emit(
			WORKSPACE_EDITOR_OVERLAY_ACTIVE_EVENT,
			createModalOpen ||
				createFolderModalOpen ||
				deleteDialogOpen ||
				renameModalOpen
		);

		return () => {
			DeviceEventEmitter.emit(WORKSPACE_EDITOR_OVERLAY_ACTIVE_EVENT, false);
		};
	}, [
		createFolderModalOpen,
		createModalOpen,
		deleteDialogOpen,
		renameModalOpen,
	]);

	const handleSelectTreeNode = (documentId: string) => {
		selectTreeNode(documentId);
	};

	const handleOpenDocument = (documentId: string) => {
		void selectDocument(documentId);
		setActiveTab('editor');
	};

	const handleOpenCreateFile = () => {
		setCreateValue('');
		setCreateModalOpen(true);
	};

	const handleOpenCreateFolder = () => {
		setCreateFolderValue('');
		setCreateFolderModalOpen(true);
	};

	const handleOpenFolder = () => {
		void openLocalFolder().then((opened) => {
			if (opened) setActiveTab('fileTree');
		});
	};

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
		void copySelectedFile();
	};

	const handlePasteFile = () => {
		void pasteCopiedFile().then((pasted) => {
			if (pasted) {
				setActiveTab('editor');
			}
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
						canCreateFile={workspaceSource.kind === 'directory'}
						documents={documents}
						errorMessage={errorMessage}
						expandedDirectoryPaths={expandedDirectoryPaths}
						fileTree={fileTree}
						focusedTreeNode={focusedTreeNode}
						hasCopiedFile={Boolean(copyState)}
						isFocusedTreeNodeBookmarked={isFocusedTreeNodeBookmarked}
						onCopyFile={handleCopyFile}
						onCreateFolder={handleOpenCreateFolder}
						onCreateFile={handleOpenCreateFile}
						onDeleteEntry={() => setDeleteDialogOpen(true)}
						onOpenDocument={handleOpenDocument}
						onOpenFolder={handleOpenFolder}
						onPasteFile={handlePasteFile}
						onRenameFile={handleOpenRename}
						onSelectTreeNode={handleSelectTreeNode}
						onToggleBookmark={handleToggleBookmark}
						onToggleDirectoryExpanded={toggleDirectoryExpanded}
						selectedDocumentRelativePath={
							selectedDocument?.relativePath ?? null
						}
						selectedTreeNodePath={selectedTreeNodePath}
						workspaceSource={workspaceSource}
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
						<MarkdownEditor
							contentBottomPadding={editorBottomPadding}
							contentTopPadding={editorTopPadding}
							filePath={selectedDocument.path}
							fontSize={editorFontSize}
							theme={resolvedTheme}
							title={selectedDocument.title}
							value={selectedDocument.content}
							onChange={updateSelectedDocumentContent}
							onRequestCompletion={requestInlineCompletion}
						/>
					) : (
						<EmptyEditorState
							canCreateFile={workspaceSource.kind === 'directory'}
							errorMessage={errorMessage}
							onCreateFile={handleOpenCreateFile}
							onOpenFolder={handleOpenFolder}
							topPadding={editorTopPadding}
							workspaceSource={workspaceSource}
						/>
					)}
				</View>
			</View>
			<RenameFileModal
				isOpen={renameModalOpen}
				title={selectedDocument?.title ?? ''}
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
		</View>
	);
}

function FileTreeView({
	bookmarkedDocumentIds,
	canCreateFile,
	documents,
	errorMessage,
	expandedDirectoryPaths,
	fileTree,
	focusedTreeNode,
	hasCopiedFile,
	isFocusedTreeNodeBookmarked,
	onCopyFile,
	onCreateFolder,
	onCreateFile,
	onDeleteEntry,
	onOpenDocument,
	onOpenFolder,
	onPasteFile,
	onRenameFile,
	onSelectTreeNode,
	onToggleBookmark,
	onToggleDirectoryExpanded,
	selectedDocumentRelativePath,
	selectedTreeNodePath,
	workspaceSource,
}: {
	bookmarkedDocumentIds: string[];
	canCreateFile: boolean;
	documents: EditorDocument[];
	errorMessage: string | null;
	expandedDirectoryPaths: Set<string>;
	fileTree: EditorNode[];
	focusedTreeNode: EditorNode | null;
	hasCopiedFile: boolean;
	isFocusedTreeNodeBookmarked: boolean;
	onCopyFile: () => void;
	onCreateFolder: () => void;
	onCreateFile: () => void;
	onDeleteEntry: () => void;
	onOpenDocument: (documentId: string) => void;
	onOpenFolder: () => void;
	onPasteFile: () => void;
	onRenameFile: () => void;
	onSelectTreeNode: (documentId: string) => void;
	onToggleBookmark: () => void;
	onToggleDirectoryExpanded: (directoryPath: string) => void;
	selectedDocumentRelativePath: string | null;
	selectedTreeNodePath: string | null;
	workspaceSource: EditorWorkspaceSource;
}) {
	const { t } = useTranslation();
	const insets = useSafeAreaInsets();
	const palette = useAppThemePalette();
	const showUnselectedFolderState =
		workspaceSource.kind === 'empty' &&
		fileTree.length === 0 &&
		documents.length === 0;
	const workspacePath =
		workspaceSource.kind === 'empty'
			? t('fileTree.title')
			: getWorkspaceDisplayPath(
					workspaceSource,
					focusedTreeNode?.relativePath || selectedDocumentRelativePath
				);
	const showWorkspaceActions = workspaceSource.kind !== 'empty';
	const bookmarkedNodes = useMemo(
		() =>
			bookmarkedDocumentIds
				.map((path) => findTreeNode(fileTree, path))
				.filter((node): node is EditorNode =>
					Boolean(node && node.kind === 'file')
				),
		[bookmarkedDocumentIds, fileTree]
	);

	if (showUnselectedFolderState) {
		return (
			<EmptyFolderSelectionState
				errorMessage={errorMessage}
				onOpenFolder={onOpenFolder}
				topPadding={insets.top}
			/>
		);
	}

	return (
		<View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
			<View style={{ borderBottomColor: palette.border, borderBottomWidth: 1 }}>
				<View className="flex-row items-center justify-between gap-3 px-4 py-3">
					<Text
						className="min-w-0 flex-1 text-[15px] font-semibold text-foreground"
						numberOfLines={1}
					>
						{workspacePath}
					</Text>
					{showWorkspaceActions ? (
						<FileToolbarIconButton
							icon={FolderOpen}
							label={t('fileTree.actions.openFolder')}
							onPress={onOpenFolder}
							palette={palette}
						/>
					) : null}
				</View>
				{showWorkspaceActions ? (
					<View
						className="flex-row items-center gap-1 px-2 py-1.5"
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
								/>
							</>
						) : null}
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
							disabled={!focusedTreeNode || focusedTreeNode.kind !== 'file'}
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
								!focusedTreeNode || focusedTreeNode.path === workspaceSource.uri
							}
						/>
					</View>
				) : null}
			</View>
			{bookmarkedNodes.length > 0 ? (
				<View className="px-2 pt-2">
					<BookmarksSection
						nodes={bookmarkedNodes}
						onOpenDocument={onOpenDocument}
						onSelectTreeNode={onSelectTreeNode}
						selectedTreeNodePath={selectedTreeNodePath}
					/>
				</View>
			) : null}
			<ScrollView
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
							onCreateFile={onCreateFile}
							onOpenFolder={onOpenFolder}
							palette={palette}
							workspaceSource={workspaceSource}
						/>
					) : null}
				</View>
			</ScrollView>
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

	const handlePress = () => {
		if (node.kind === 'directory') {
			onSelectTreeNode(node.path);
			onToggleDirectoryExpanded(node.path);
			return;
		}

		if (selectable) {
			const now = Date.now();
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
						className="min-h-9 flex-1 flex-row items-center rounded-md py-1.5
							pl-0 pr-2"
						style={{
							backgroundColor: selected ? palette.accentSurface : 'transparent',
						}}
					>
						<View
							className="h-5 w-5 items-center justify-center"
							style={{ marginRight: TREE_TOGGLE_GAP }}
						>
							{node.kind === 'directory' ? (
								<Chevron color={iconColor} size={14} strokeWidth={2.2} />
							) : null}
						</View>
						{node.kind === 'directory' ? (
							expanded ? (
								<FolderOpen color={iconColor} size={16} strokeWidth={2} />
							) : (
								<Folder color={iconColor} size={16} strokeWidth={2} />
							)
						) : (
							<FileText color={iconColor} size={16} strokeWidth={2} />
						)}
						<Text
							numberOfLines={1}
							className="ml-2 flex-1 text-[14px]"
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

	const handlePress: PressableProps['onPress'] = () => {
		const now = Date.now();
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
				className="min-h-9 flex-row items-center gap-2 rounded-md px-2 py-1.5"
				style={{
					backgroundColor: selected ? palette.accentSurface : 'transparent',
					paddingLeft: TREE_FILE_START_OFFSET,
				}}
			>
				<FileText color={iconColor} size={16} strokeWidth={2} />
				<View className="flex-1">
					<Text
						numberOfLines={1}
						className="text-[14px]"
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
	nodes: EditorNode[];
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
								fileKind: node.fileKind ?? 'markdown',
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
				backgroundColor: 'rgba(115, 115, 115, 0.28)',
				bottom: 0,
				left: depth * TREE_INDENT_STEP + TREE_GUIDE_LEFT - TREE_GUIDE_WIDTH / 2,
				position: 'absolute',
				top: 0,
				width: TREE_GUIDE_WIDTH,
			}}
		/>
	);
}

function FileToolbarIconButton({
	icon: Icon,
	label,
	onPress,
	palette,
	disabled = false,
}: {
	icon: typeof FilePlus2;
	label: string;
	onPress: () => void;
	palette: ReturnType<typeof useAppThemePalette>;
	disabled?: boolean;
}) {
	return (
		<Pressable
			accessibilityLabel={label}
			disabled={disabled}
			onPress={onPress}
			className="h-8 w-8 items-center justify-center rounded-md"
			style={{ backgroundColor: 'transparent', opacity: disabled ? 0.45 : 1 }}
		>
			<Icon color={palette.icon} size={16} strokeWidth={2.2} />
		</Pressable>
	);
}

function FileActionButton({
	icon: Icon,
	label,
	onPress,
	palette,
}: {
	icon: typeof FilePlus2;
	label: string;
	onPress: () => void;
	palette: ReturnType<typeof useAppThemePalette>;
}) {
	return (
		<Pressable
			accessibilityLabel={label}
			onPress={onPress}
			className="min-h-9 flex-1 flex-row items-center justify-center gap-2
				rounded-md px-3"
			style={{
				backgroundColor: palette.surfaceMuted,
				borderColor: palette.border,
				borderWidth: 1,
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

function EmptyWorkspace({
	canCreateFile,
	onCreateFile,
	onOpenFolder,
	palette,
	workspaceSource,
}: {
	canCreateFile: boolean;
	onCreateFile: () => void;
	onOpenFolder: () => void;
	palette: ReturnType<typeof useAppThemePalette>;
	workspaceSource: EditorWorkspaceSource;
}) {
	const { t } = useTranslation();
	const canShowCreateAction =
		workspaceSource.kind === 'directory' && canCreateFile;

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
				<View className="flex-row gap-2">
					{canShowCreateAction ? (
						<FileActionButton
							icon={FilePlus2}
							label={t('fileTree.actions.newFile')}
							onPress={onCreateFile}
							palette={palette}
						/>
					) : null}
					<FileActionButton
						icon={FolderPlus}
						label={t('fileTree.actions.openFolder')}
						onPress={onOpenFolder}
						palette={palette}
					/>
				</View>
			</View>
		</View>
	);
}

function EmptyFolderSelectionState({
	errorMessage,
	onOpenFolder,
	topPadding,
}: {
	errorMessage: string | null;
	onOpenFolder: () => void;
	topPadding: number;
}) {
	const { t } = useTranslation();
	const palette = useAppThemePalette();

	return (
		<View
			className="flex-1 bg-background px-5"
			style={{ paddingTop: topPadding + 56 }}
		>
			<View className="gap-4">
				<View className="gap-2">
					<Text className="text-[22px] font-semibold text-foreground">
						{t('fileTree.empty.title')}
					</Text>
					<Text className="text-[14px] leading-5 text-muted-foreground">
						{t('fileTree.empty.detail')}
					</Text>
				</View>
				{errorMessage ? (
					<Text className="text-[12px] text-destructive">{errorMessage}</Text>
				) : null}
				<View className="gap-2">
					<View className="flex-row gap-2">
						<FileActionButton
							icon={FolderPlus}
							label={t('fileTree.actions.openFolder')}
							onPress={onOpenFolder}
							palette={palette}
						/>
					</View>
				</View>
			</View>
		</View>
	);
}

function EmptyEditorState({
	canCreateFile,
	errorMessage,
	onCreateFile,
	onOpenFolder,
	topPadding,
	workspaceSource,
}: {
	canCreateFile: boolean;
	errorMessage: string | null;
	onCreateFile: () => void;
	onOpenFolder: () => void;
	topPadding: number;
	workspaceSource: EditorWorkspaceSource;
}) {
	const { t } = useTranslation();
	const palette = useAppThemePalette();
	const hasOpenFolder = workspaceSource.kind === 'directory';
	const canShowCreateAction = hasOpenFolder && canCreateFile;
	const title = hasOpenFolder
		? t('workspace.noSelection.title')
		: t('workspace.empty.title');
	const detail = hasOpenFolder
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
				{errorMessage ? (
					<Text className="text-[12px] text-destructive">{errorMessage}</Text>
				) : null}
				<View className="gap-2">
					<View className="flex-row gap-2">
						{hasOpenFolder ? (
							canShowCreateAction ? (
								<FileActionButton
									icon={FilePlus2}
									label={t('fileTree.actions.newFile')}
									onPress={onCreateFile}
									palette={palette}
								/>
							) : null
						) : (
							<FileActionButton
								icon={FolderPlus}
								label={t('fileTree.actions.openFolder')}
								onPress={onOpenFolder}
								palette={palette}
							/>
						)}
					</View>
				</View>
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

	if (workspaceSource.kind === 'file') {
		return workspaceSource.name;
	}

	return '';
}

function RenameFileModal({
	isOpen,
	title,
	value,
	onChangeValue,
	onClose,
	onConfirm,
}: {
	isOpen: boolean;
	title: string;
	value: string;
	onChangeValue: (nextValue: string) => void;
	onClose: () => void;
	onConfirm: () => void;
}) {
	const { t } = useTranslation();

	return (
		<Modal isOpen={isOpen} onClose={onClose} size="md">
			<ModalBackdrop />
			<ModalContent
				className="w-[82%] max-w-[392px] rounded-lg border-border/70 px-4 py-4"
			>
				<ModalHeader>
					<Text className="text-[16px] font-semibold text-foreground">
						{t('markdownEditor.toolbar.renameFile')}
					</Text>
				</ModalHeader>
				<ModalBody>
					<View className="gap-3">
						<Text className="text-[13px] leading-5 text-muted-foreground">
							{title}
						</Text>
						<Input>
							<InputField
								autoCapitalize="none"
								autoCorrect={false}
								autoFocus
								value={value}
								onChangeText={onChangeValue}
								onSubmitEditing={onConfirm}
								returnKeyType="done"
							/>
						</Input>
					</View>
				</ModalBody>
				<ModalFooter>
					<Button variant="outline" action="secondary" onPress={onClose}>
						<ButtonText>{t('common.actions.cancel')}</ButtonText>
					</Button>
					<Button onPress={onConfirm}>
						<ButtonText>{t('common.actions.save')}</ButtonText>
					</Button>
				</ModalFooter>
			</ModalContent>
		</Modal>
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
		<Modal isOpen={isOpen} onClose={onClose} size="md">
			<ModalBackdrop />
			<ModalContent
				className="w-[82%] max-w-[392px] rounded-lg border-border/70 px-4 py-4"
			>
				<ModalHeader>
					<Text className="text-[16px] font-semibold text-foreground">
						{t('fileTree.actions.newFile')}
					</Text>
				</ModalHeader>
				<ModalBody>
					<Input>
						<InputField
							autoCapitalize="none"
							autoCorrect={false}
							autoFocus
							value={value}
							onChangeText={onChangeValue}
							onSubmitEditing={onConfirm}
							placeholder="note.md"
							returnKeyType="done"
						/>
					</Input>
				</ModalBody>
				<ModalFooter>
					<Button variant="outline" action="secondary" onPress={onClose}>
						<ButtonText>{t('common.actions.cancel')}</ButtonText>
					</Button>
					<Button onPress={onConfirm}>
						<ButtonText>{t('common.actions.save')}</ButtonText>
					</Button>
				</ModalFooter>
			</ModalContent>
		</Modal>
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
		<Modal isOpen={isOpen} onClose={onClose} size="md">
			<ModalBackdrop />
			<ModalContent
				className="w-[82%] max-w-[392px] rounded-lg border-border/70 px-4 py-4"
			>
				<ModalHeader>
					<Text className="text-[16px] font-semibold text-foreground">
						{t('fileTree.actions.newFolder')}
					</Text>
				</ModalHeader>
				<ModalBody>
					<Input>
						<InputField
							autoCapitalize="none"
							autoCorrect={false}
							autoFocus
							value={value}
							onChangeText={onChangeValue}
							onSubmitEditing={onConfirm}
							placeholder="notes"
							returnKeyType="done"
						/>
					</Input>
				</ModalBody>
				<ModalFooter>
					<Button variant="outline" action="secondary" onPress={onClose}>
						<ButtonText>{t('common.actions.cancel')}</ButtonText>
					</Button>
					<Button onPress={onConfirm}>
						<ButtonText>{t('common.actions.save')}</ButtonText>
					</Button>
				</ModalFooter>
			</ModalContent>
		</Modal>
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
		<AlertDialog isOpen={isOpen} onClose={onClose} size="sm">
			<AlertDialogBackdrop />
			<AlertDialogContent className="rounded-lg border-border/70 px-4 py-4">
				<AlertDialogHeader>
					<Text className="text-[16px] font-semibold text-foreground">
						{t('fileTree.delete.title')}
					</Text>
				</AlertDialogHeader>
				<AlertDialogBody className="mt-3">
					<Text className="text-[13px] leading-5 text-muted-foreground">
						{t('fileTree.delete.detail', { name: entryName })}
					</Text>
				</AlertDialogBody>
				<AlertDialogFooter className="mt-4">
					<Button variant="outline" action="secondary" onPress={onClose}>
						<ButtonText>{t('common.actions.cancel')}</ButtonText>
					</Button>
					<Button variant="destructive" onPress={onConfirm}>
						<ButtonText>{t('common.actions.delete')}</ButtonText>
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
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
