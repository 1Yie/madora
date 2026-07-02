import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useState,
	type ReactNode,
} from 'react';

import { generateCompletion, useAiSettings } from '@/features/ai';
import { useAppSettings } from '@/features/settings';
import {
	createLocalMarkdownFile,
	pickLocalDirectory,
	pickLocalFile,
	readLocalDirectory,
	readLocalFile,
	writeLocalFile,
} from '../services/local-file-system';
import type {
	EditorDocument,
	EditorNode,
	EditorWorkspaceSource,
} from '../types';

type EditorContextValue = {
	documents: EditorDocument[];
	errorMessage: string | null;
	fileTree: EditorNode[];
	createLocalFile: () => Promise<boolean>;
	openLocalFile: () => Promise<boolean>;
	openLocalFolder: () => Promise<boolean>;
	requestInlineCompletion: (
		fullText: string,
		cursorPos: number
	) => Promise<string>;
	selectDocument: (documentId: string) => Promise<void>;
	selectedDocument: EditorDocument | null;
	selectedDocumentId: string | null;
	updateSelectedDocumentContent: (content: string) => void;
	workspaceSource: EditorWorkspaceSource;
};

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
	const aiSettings = useAiSettings();
	const { saveMode } = useAppSettings();
	const [documents, setDocuments] = useState<EditorDocument[]>([]);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [fileTree, setFileTree] = useState<EditorNode[]>([]);
	const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
		null
	);
	const [workspaceSource, setWorkspaceSource] = useState<EditorWorkspaceSource>(
		{
			kind: 'empty',
		}
	);

	const selectedDocument = useMemo(
		() =>
			documents.find((document) => document.id === selectedDocumentId) ?? null,
		[documents, selectedDocumentId]
	);

	const createLocalFile = useCallback(async () => {
		try {
			if (workspaceSource.kind !== 'directory') {
				setErrorMessage('Open a local folder before creating a file.');
				return false;
			}

			const directoryUri = workspaceSource.uri;
			const document = await createLocalMarkdownFile(directoryUri);

			setDocuments((current) => [
				document,
				...current.filter((item) => item.id !== document.id),
			]);
			setSelectedDocumentId(document.id);

			const refreshed = readLocalDirectory(directoryUri);
			setFileTree([refreshed.root]);

			setErrorMessage(null);
			return true;
		} catch (error) {
			setErrorMessage(getErrorMessage(error, 'Failed to create local file'));
			return false;
		}
	}, [workspaceSource]);

	const openLocalFile = useCallback(async () => {
		try {
			const document = await pickLocalFile();
			if (!document) {
				setErrorMessage(null);
				return false;
			}

			setDocuments([document]);
			setFileTree([]);
			setSelectedDocumentId(document.id);
			setWorkspaceSource({
				kind: 'file',
				name: document.title,
				uri: document.path,
			});
			setErrorMessage(null);
			return true;
		} catch (error) {
			if (isPickerCancel(error)) {
				setErrorMessage(null);
				return false;
			}
			setErrorMessage(getErrorMessage(error, 'Failed to open local file'));
			return false;
		}
	}, []);

	const openLocalFolder = useCallback(async () => {
		try {
			const result = await pickLocalDirectory();
			if (!result) {
				setErrorMessage(null);
				return false;
			}

			setDocuments([]);
			setFileTree([result.root]);
			setSelectedDocumentId(null);
			setWorkspaceSource({
				kind: 'directory',
				name: result.root.name,
				uri: result.uri,
			});
			setErrorMessage(null);
			return true;
		} catch (error) {
			if (isPickerCancel(error)) {
				setErrorMessage(null);
				return false;
			}
			setErrorMessage(getErrorMessage(error, 'Failed to open local folder'));
			return false;
		}
	}, []);

	const selectDocument = useCallback(
		async (documentId: string) => {
			setSelectedDocumentId(documentId);

			const existing = documents.find((document) => document.id === documentId);
			if (existing && existing.content.length > 0) {
				return;
			}

			try {
				const document = await readLocalFile(documentId);
				setDocuments((current) => {
					const exists = current.some((item) => item.id === document.id);
					if (!exists) return [document, ...current];
					return current.map((item) =>
						item.id === document.id ? document : item
					);
				});
				setErrorMessage(null);
			} catch (error) {
				setErrorMessage(getErrorMessage(error, 'Failed to read local file'));
			}
		},
		[documents]
	);

	const updateSelectedDocumentContent = useCallback(
		(content: string) => {
			if (!selectedDocumentId) return;

			const now = Date.now();
			setDocuments((current) =>
				current.map((document) =>
					document.id === selectedDocumentId
						? { ...document, content, updatedAt: now }
						: document
				)
			);

			if (saveMode === 'auto') {
				try {
					writeLocalFile(selectedDocumentId, content);
					setErrorMessage(null);
				} catch (error) {
					setErrorMessage(getErrorMessage(error, 'Failed to save local file'));
				}
			}
		},
		[saveMode, selectedDocumentId]
	);

	const requestInlineCompletion = useCallback(
		async (fullText: string, cursorPos: number): Promise<string> => {
			if (!selectedDocument) return '';

			const prefix = fullText.slice(Math.max(0, cursorPos - 12000), cursorPos);
			const suffix = fullText.slice(cursorPos, cursorPos + 4000);

			try {
				const localConfig = await aiSettings.getCompletionConfig();
				if (!localConfig) return '';

				return await generateCompletion({
					config: localConfig,
					request: {
						prefix,
						suffix: suffix.length > 0 ? suffix : null,
						title: selectedDocument.title,
					},
				});
			} catch {
				return '';
			}
		},
		[aiSettings, selectedDocument]
	);

	const value = useMemo<EditorContextValue>(
		() => ({
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
		}),
		[
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
		]
	);

	return (
		<EditorContext.Provider value={value}>{children}</EditorContext.Provider>
	);
}

export function useEditorWorkspace() {
	const value = useContext(EditorContext);
	if (!value) {
		throw new Error('useEditorWorkspace must be used within EditorProvider');
	}
	return value;
}

function getErrorMessage(error: unknown, fallback: string) {
	if (error instanceof Error && error.message) return error.message;
	if (typeof error === 'string' && error.length > 0) return error;
	return fallback;
}

function isPickerCancel(error: unknown) {
	const message = getErrorMessage(error, '').toLowerCase();
	return (
		message.includes('cancel') ||
		message.includes('canceled') ||
		message.includes('cancelled') ||
		message.includes('user did not select')
	);
}
