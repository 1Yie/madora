import { useEffect, useState } from 'react';
import {
	DeviceEventEmitter,
	Keyboard,
	Pressable,
	ScrollView,
	Text,
	View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
	ChevronDown,
	ChevronRight,
	FilePlus2,
	FileText,
	FolderOpen,
	FolderPlus,
} from 'lucide-react-native';

import { MarkdownEditor } from '../components/markdown-editor';
import { useEditorWorkspace } from '../providers/editor-provider';
import type { EditorDocument, EditorNode } from '../types';
import {
	WORKSPACE_TAB_REQUEST_EVENT,
	WORKSPACE_TAB_STATE_EVENT,
	type WorkspaceTab,
} from '../lib/workspace-tab-events';

const EDITOR_FLOATING_CONTROLS_BOTTOM_PADDING = 56;
const EDITOR_KEYBOARD_CONTROLS_BOTTOM_PADDING = 40;

export function WorkspaceScreen() {
	const insets = useSafeAreaInsets();
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
		<View style={{ backgroundColor: '#fbfcff', flex: 1 }}>
			<View style={{ flex: 1 }}>
				<View
					style={{
						display: activeTab === 'fileTree' ? 'flex' : 'none',
						flex: 1,
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
					/>
				</View>

				<View
					style={{
						display: activeTab === 'editor' ? 'flex' : 'none',
						flex: 1,
					}}
				>
					{selectedDocument ? (
						<MarkdownEditor
							contentBottomPadding={editorBottomPadding}
							contentTopPadding={editorTopPadding}
							filePath={selectedDocument.path}
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
}: {
	canCreateFile: boolean;
	documents: EditorDocument[];
	fileTree: EditorNode[];
	onCreateFile: () => void;
	onOpenFile: () => void;
	onOpenFolder: () => void;
	onSelectDocument: (documentId: string) => void;
	selectedDocumentId: string | null;
}) {
	const { t } = useTranslation();
	const insets = useSafeAreaInsets();

	return (
		<View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
			<View className="border-b border-border px-4 pb-3 pt-4">
				<View className="gap-3">
					<View>
						<Text className="text-[18px] font-semibold text-foreground">
							{t('fileTree.title')}
						</Text>
						<Text className="mt-1 text-[12px] text-muted-foreground">
							{t('fileTree.detail')}
						</Text>
					</View>
					<View className="flex-row gap-2">
						{canCreateFile ? (
							<FileActionButton
								icon={FilePlus2}
								label={t('fileTree.actions.newFile')}
								onPress={onCreateFile}
							/>
						) : null}
						<FileActionButton
							icon={FilePlus2}
							label={t('fileTree.actions.openFile')}
							onPress={onOpenFile}
						/>
						<FileActionButton
							icon={FolderPlus}
							label={t('fileTree.actions.openFolder')}
							onPress={onOpenFolder}
						/>
					</View>
				</View>
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
						<EmptyWorkspace />
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
	const [expanded, setExpanded] = useState(depth === 0);
	const selectable =
		node.kind === 'file' &&
		(node.fileKind === 'markdown' || node.fileKind === 'text');
	const selected = node.path === selectedDocumentId;
	const iconColor = selected ? '#fbfcff' : selectable ? '#111827' : '#6b7280';
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
		<View>
			<Pressable
				disabled={!selectable && node.kind !== 'directory'}
				onPress={handlePress}
				style={{ paddingLeft: 10 + depth * 14 }}
				className={`min-h-10 justify-center rounded-md px-3
					${selected ? 'bg-foreground' : 'bg-transparent'}`}
			>
				<View className="flex-row items-center gap-2">
					{node.kind === 'directory' ? (
						<Chevron color={iconColor} size={14} strokeWidth={2.2} />
					) : (
						<View style={{ width: 14 }} />
					)}
					{node.kind === 'directory' ? (
						<FolderOpen color={iconColor} size={16} strokeWidth={2} />
					) : (
						<FileText color={iconColor} size={16} strokeWidth={2} />
					)}
					<Text
						numberOfLines={1}
						className={`flex-1 text-[14px]
							${selected ? 'font-semibold text-background' : 'text-foreground'}
							${selectable ? '' : 'font-semibold text-muted-foreground'}`}
					>
						{node.name}
					</Text>
				</View>
			</Pressable>
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
	const iconColor = selected ? '#fbfcff' : '#111827';

	return (
		<Pressable
			onPress={() => onSelectDocument(document.id)}
			className={`min-h-10 flex-row items-center gap-2 rounded-md px-3
				${selected ? 'bg-foreground' : 'bg-transparent'}`}
		>
			<View style={{ width: 14 }} />
			<FileText color={iconColor} size={16} strokeWidth={2} />
			<View className="flex-1">
				<Text
					numberOfLines={1}
					className={`text-[14px]
						${selected ? 'font-semibold text-background' : 'text-foreground'}`}
				>
					{document.title}
				</Text>
				<Text numberOfLines={1} className="text-[11px] text-muted-foreground">
					{document.path}
				</Text>
			</View>
		</Pressable>
	);
}

function FileActionButton({
	icon: Icon,
	label,
	onPress,
}: {
	icon: typeof FilePlus2;
	label: string;
	onPress: () => void;
}) {
	return (
		<Pressable
			accessibilityLabel={label}
			onPress={onPress}
			className="min-h-9 flex-1 flex-row items-center justify-center gap-2
				rounded-md border border-border bg-secondary px-3"
		>
			<Icon color="#111827" size={16} strokeWidth={2.2} />
			<Text
				numberOfLines={1}
				className="text-[13px] font-semibold text-foreground"
			>
				{label}
			</Text>
		</Pressable>
	);
}

function EmptyWorkspace() {
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
						/>
						<FileActionButton
							icon={FolderPlus}
							label={t('fileTree.actions.openFolder')}
							onPress={onOpenFolder}
						/>
					</View>
				</View>
			</View>
		</View>
	);
}
