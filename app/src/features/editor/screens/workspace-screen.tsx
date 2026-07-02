import { useEffect, useState } from 'react';
import {
	DeviceEventEmitter,
	Keyboard,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
	Folder,
	ChevronDown,
	ChevronRight,
	FilePlus2,
	FileText,
	FolderOpen,
	FolderPlus,
} from 'lucide-react-native';

import { MarkdownEditor } from '../components/markdown-editor';
import { useEditorWorkspace } from '../providers/editor-provider';
import type {
	EditorDocument,
	EditorNode,
	EditorWorkspaceSource,
} from '../types';
import {
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

export function WorkspaceScreen() {
	const insets = useSafeAreaInsets();
	const resolvedTheme = useResolvedThemePreference();
	const { editorFontSize } = useAppSettings();
	const [activeTab, setActiveTab] = useState<WorkspaceTab>('editor');
	const [keyboardHeight, setKeyboardHeight] = useState(0);
	const {
		createLocalFile,
		documents,
		errorMessage,
		fileTree,
		openLocalFile,
		openLocalFolder,
		requestInlineCompletion,
		selectDocument,
		selectedDocument,
		selectedDocumentId,
		updateSelectedDocumentContent,
		workspaceSource,
	} = useEditorWorkspace();

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

	const handleSelectDocument = (documentId: string) => {
		void selectDocument(documentId);
		setActiveTab('editor');
	};

	const handleCreateFile = () => {
		void createLocalFile().then((opened) => {
			if (opened) setActiveTab('editor');
		});
	};

	const handleOpenFile = () => {
		void openLocalFile().then((opened) => {
			if (opened) setActiveTab('editor');
		});
	};

	const handleOpenFolder = () => {
		void openLocalFolder().then((opened) => {
			if (opened) setActiveTab('fileTree');
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
						canCreateFile={workspaceSource.kind === 'directory'}
						documents={documents}
						fileTree={fileTree}
						onCreateFile={handleCreateFile}
						onOpenFile={handleOpenFile}
						onOpenFolder={handleOpenFolder}
						onSelectDocument={handleSelectDocument}
						selectedDocumentId={selectedDocumentId}
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
							errorMessage={errorMessage}
							onOpenFile={handleOpenFile}
							onOpenFolder={handleOpenFolder}
							topPadding={editorTopPadding}
						/>
					)}
				</View>
			</View>
		</View>
	);
}

function FileTreeView({
	canCreateFile,
	documents,
	fileTree,
	onCreateFile,
	onOpenFile,
	onOpenFolder,
	onSelectDocument,
	selectedDocumentId,
	workspaceSource,
}: {
	canCreateFile: boolean;
	documents: EditorDocument[];
	fileTree: EditorNode[];
	onCreateFile: () => void;
	onOpenFile: () => void;
	onOpenFolder: () => void;
	onSelectDocument: (documentId: string) => void;
	selectedDocumentId: string | null;
	workspaceSource: EditorWorkspaceSource;
}) {
	const { t } = useTranslation();
	const insets = useSafeAreaInsets();
	const palette = useAppThemePalette();
	const workspaceTitle =
		workspaceSource.kind === 'empty'
			? t('fileTree.title')
			: workspaceSource.name;
	const workspaceSubtitle =
		workspaceSource.kind === 'empty'
			? t('fileTree.detail')
			: workspaceSource.uri;
	const showWorkspaceActions = workspaceSource.kind !== 'empty';

	return (
		<View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
			<View style={{ borderBottomColor: palette.border, borderBottomWidth: 1 }}>
				<View className="flex-row items-center justify-between gap-3 px-4 py-3">
					<View className="min-w-0 flex-1">
						<Text
							className="text-[12px] leading-4 text-muted-foreground"
							numberOfLines={1}
						>
							{workspaceSubtitle}
						</Text>
						<Text
							className="mt-1 text-[18px] font-semibold text-foreground"
							numberOfLines={1}
						>
							{workspaceTitle}
						</Text>
					</View>
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
							<FileToolbarIconButton
								icon={FilePlus2}
								label={t('fileTree.actions.newFile')}
								onPress={onCreateFile}
								palette={palette}
							/>
						) : null}
						<FileToolbarIconButton
							icon={FileText}
							label={t('fileTree.actions.openFile')}
							onPress={onOpenFile}
							palette={palette}
						/>
					</View>
				) : null}
			</View>
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
									onSelectDocument={onSelectDocument}
									selectedDocumentId={selectedDocumentId}
								/>
							))
						: documents.map((document) => (
								<DocumentRow
									key={document.id}
									document={document}
									onSelectDocument={onSelectDocument}
									selected={document.id === selectedDocumentId}
								/>
							))}

					{fileTree.length === 0 && documents.length === 0 ? (
						<EmptyWorkspace
							onOpenFile={onOpenFile}
							onOpenFolder={onOpenFolder}
							palette={palette}
						/>
					) : null}
				</View>
			</ScrollView>
		</View>
	);
}

function FileTreeNodeRow({
	depth = 0,
	node,
	onSelectDocument,
	selectedDocumentId,
}: {
	depth?: number;
	node: EditorNode;
	onSelectDocument: (documentId: string) => void;
	selectedDocumentId: string | null;
}) {
	const palette = useAppThemePalette();
	const [expanded, setExpanded] = useState(depth === 0);
	const selectable =
		node.kind === 'file' &&
		(node.fileKind === 'markdown' || node.fileKind === 'text');
	const selected = node.path === selectedDocumentId;
	const iconColor = selected
		? palette.accentForeground
		: selectable
			? palette.icon
			: palette.iconMuted;
	const Chevron = expanded ? ChevronDown : ChevronRight;

	const handlePress = () => {
		if (node.kind === 'directory') {
			setExpanded((current) => !current);
			return;
		}

		if (selectable) {
			onSelectDocument(node.path);
		}
	};

	return (
		<View className="relative py-0.5">
			<IndentGuides depth={depth} />
			<View
				className="flex-row items-center"
				style={{ paddingLeft: depth * TREE_INDENT_STEP + TREE_ROW_INSET }}
			>
				<View
					className="items-start justify-center"
					style={{ marginRight: TREE_TOGGLE_GAP, width: TREE_TOGGLE_SIZE }}
				>
					{node.kind === 'directory' ? (
						<Pressable
							accessibilityLabel={
								expanded ? 'Collapse folder' : 'Expand folder'
							}
							onPress={() => setExpanded((current) => !current)}
							className="h-5 w-5 items-center justify-center rounded-sm"
						>
							<Chevron color={iconColor} size={14} strokeWidth={2.2} />
						</Pressable>
					) : (
						<View
							style={{ height: TREE_TOGGLE_SIZE, width: TREE_TOGGLE_SIZE }}
						/>
					)}
				</View>
				<Pressable
					disabled={!selectable && node.kind !== 'directory'}
					onPress={handlePress}
					className="min-h-9 flex-1 flex-row items-center gap-2 rounded-md px-2
						py-1.5"
					style={{
						backgroundColor: selected ? palette.accentSurface : 'transparent',
					}}
				>
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
						className="flex-1 text-[14px]"
						style={{
							color: selected
								? palette.accentForeground
								: selectable
									? palette.foreground
									: palette.mutedForeground,
							fontWeight: selected || !selectable ? '600' : '400',
						}}
					>
						{node.name}
					</Text>
				</Pressable>
			</View>
			{expanded
				? node.children.map((child) => (
						<FileTreeNodeRow
							key={child.id}
							depth={depth + 1}
							node={child}
							onSelectDocument={onSelectDocument}
							selectedDocumentId={selectedDocumentId}
						/>
					))
				: null}
		</View>
	);
}

function DocumentRow({
	document,
	onSelectDocument,
	selected,
}: {
	document: EditorDocument;
	onSelectDocument: (documentId: string) => void;
	selected: boolean;
}) {
	const palette = useAppThemePalette();
	const iconColor = selected ? palette.accentForeground : palette.icon;

	return (
		<View className="relative py-0.5">
			<Pressable
				onPress={() => onSelectDocument(document.id)}
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
						{document.path}
					</Text>
				</View>
			</Pressable>
		</View>
	);
}

function IndentGuides({ depth }: { depth: number }) {
	if (depth <= 0) return null;

	return (
		<>
			{Array.from({ length: depth }, (_, index) => (
				<View
					key={`guide-${index}`}
					pointerEvents="none"
					style={{
						backgroundColor: 'rgba(115, 115, 115, 0.28)',
						bottom: 0,
						left:
							index * TREE_INDENT_STEP +
							TREE_GUIDE_LEFT -
							StyleSheet.hairlineWidth / 2,
						position: 'absolute',
						top: 0,
						width: StyleSheet.hairlineWidth,
					}}
				/>
			))}
		</>
	);
}

function FileToolbarIconButton({
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
			className="h-8 w-8 items-center justify-center rounded-md"
			style={{ backgroundColor: 'transparent' }}
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
	onOpenFile,
	onOpenFolder,
	palette,
}: {
	onOpenFile: () => void;
	onOpenFolder: () => void;
	palette: ReturnType<typeof useAppThemePalette>;
}) {
	const { t } = useTranslation();

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
					<FileActionButton
						icon={FilePlus2}
						label={t('fileTree.actions.openFile')}
						onPress={onOpenFile}
						palette={palette}
					/>
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

function EmptyEditorState({
	errorMessage,
	onOpenFile,
	onOpenFolder,
	topPadding,
}: {
	errorMessage: string | null;
	onOpenFile: () => void;
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
						{t('workspace.empty.title')}
					</Text>
					<Text className="text-[14px] leading-5 text-muted-foreground">
						{t('workspace.empty.detail')}
					</Text>
				</View>
				{errorMessage ? (
					<Text className="text-[12px] text-destructive">{errorMessage}</Text>
				) : null}
				<View className="gap-2">
					<View className="flex-row gap-2">
						<FileActionButton
							icon={FilePlus2}
							label={t('fileTree.actions.openFile')}
							onPress={onOpenFile}
							palette={palette}
						/>
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
