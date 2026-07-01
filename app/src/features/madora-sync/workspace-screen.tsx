import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
	DeviceEventEmitter,
	Pressable,
	ScrollView,
	Text,
	View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { ChevronDown, FileText, FolderOpen } from 'lucide-react-native';
import { useMadoraSync } from './provider';
import { MarkdownEditor } from './markdown-editor';
import type { ExplorerNode } from './protocol';
import type { SyncDocument } from './types';
import {
	WORKSPACE_TAB_REQUEST_EVENT,
	WORKSPACE_TAB_STATE_EVENT,
	type WorkspaceTab,
} from './workspace-tab-events';

export function WorkspaceScreen() {
	const insets = useSafeAreaInsets();
	const [activeTab, setActiveTab] = useState<WorkspaceTab>('editor');
	const {
		documents,
		fileTree,
		selectedDocument,
		selectDocument,
		updateSelectedDocumentContent,
		requestInlineCompletion,
	} = useMadoraSync();

	const doc = selectedDocument ?? documents[0];
	const editorTopPadding = insets.top;

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
		DeviceEventEmitter.emit(WORKSPACE_TAB_STATE_EVENT, activeTab);
	}, [activeTab]);

	const handleSelectDocument = (documentId: string) => {
		void selectDocument(documentId);
		setActiveTab('editor');
	};

	return (
		<View
			style={{
				backgroundColor: '#fbfcff',
				flex: 1,
			}}
		>
			<View style={{ flex: 1 }}>
				{activeTab === 'fileTree' ? (
					<FileTreeView
						documents={documents}
						fileTree={fileTree}
						onSelectDocument={handleSelectDocument}
						selectedDocumentId={doc?.id ?? null}
					/>
				) : (
					<MarkdownEditor
						contentTopPadding={editorTopPadding}
						value={doc?.content ?? ''}
						onChange={updateSelectedDocumentContent}
						onRequestCompletion={requestInlineCompletion}
					/>
				)}
			</View>
		</View>
	);
}

function FileTreeView({
	documents,
	fileTree,
	onSelectDocument,
	selectedDocumentId,
}: {
	documents: SyncDocument[];
	fileTree: ExplorerNode[];
	onSelectDocument: (documentId: string) => void;
	selectedDocumentId: string | null;
}) {
	const { t } = useTranslation();
	const insets = useSafeAreaInsets();

	return (
		<View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
			<View className="border-b border-border px-4 pb-3 pt-4">
				<View>
					<Text className="text-[18px] font-semibold text-foreground">
						{t('fileTree.title')}
					</Text>
					<Text className="mt-1 text-[12px] text-muted-foreground">
						{t('fileTree.detail')}
					</Text>
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
									key={node.path}
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
	node: ExplorerNode;
	onSelectDocument: (documentId: string) => void;
	selectedDocumentId: string | null;
}) {
	const selectable =
		node.kind === 'file' &&
		(node.fileKind === 'markdown' || node.fileKind === 'text');
	const selected = node.path === selectedDocumentId;
	const iconColor = selected ? '#fbfcff' : selectable ? '#111827' : '#6b7280';

	return (
		<View>
			<Pressable
				disabled={!selectable}
				onPress={() => selectable && onSelectDocument(node.path)}
				style={{ paddingLeft: 10 + depth * 14 }}
				className={`min-h-10 justify-center rounded-md px-3
					${selected ? 'bg-foreground' : 'bg-transparent'}`}
			>
				<View className="flex-row items-center gap-2">
					{node.kind === 'directory' ? (
						<ChevronDown color={iconColor} size={14} strokeWidth={2.2} />
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
			{node.children.map((child) => (
				<FileTreeNodeRow
					key={child.path}
					depth={depth + 1}
					node={child}
					onSelectDocument={onSelectDocument}
					selectedDocumentId={selectedDocumentId}
				/>
			))}
		</View>
	);
}

function DocumentRow({
	document,
	onSelectDocument,
	selected,
}: {
	document: SyncDocument;
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
