import { writeWorkspaceFile } from '@/invoke/explorer';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAiSettings } from '@/components/system/ai-settings-provider';
import { showErrorToast } from '@/components/ui/toast';
import {
	MARKDOWN_DRAFT_STORAGE_KEY_PREFIX,
	registerEditor,
	unregisterEditor,
} from '@/lib/unsaved-registry';

import { MarkdownEditor } from './markdown-editor';

type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

type MarkdownWorkspaceProps = {
	content: string;
	encoding?: string | null;
	filePath: string;
	mode: 'edit' | 'preview';
	onToggleMode?: () => void;
};

const SAVE_DEBOUNCE_MS = 400;

function getDraftStorageKey(filePath: string): string {
	return `${MARKDOWN_DRAFT_STORAGE_KEY_PREFIX}${filePath}`;
}

function getInitialValue(filePath: string, content: string): string {
	const draft = window.localStorage.getItem(getDraftStorageKey(filePath));

	return draft ?? content;
}

function hasStoredDraft(filePath: string): boolean {
	return window.localStorage.getItem(getDraftStorageKey(filePath)) !== null;
}

function getFileTitle(filePath: string): string {
	const normalizedPath = filePath.replace(/\\/g, '/');
	const fileName = normalizedPath.split('/').pop() ?? 'Untitled';

	return fileName.replace(/\.(md|markdown|mdx)$/i, '');
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === 'string') {
		return error;
	}

	return '保存失败';
}

export function MarkdownWorkspace({
	content,
	encoding,
	filePath,
	mode,
	onToggleMode,
}: MarkdownWorkspaceProps) {
	const { saveMode } = useAiSettings();
	const [value, setValue] = useState(() => getInitialValue(filePath, content));
	const [saveError, setSaveError] = useState<string | null>(null);
	const [saveStatus, setSaveStatus] = useState<SaveStatus>(() =>
		hasStoredDraft(filePath) ? 'dirty' : 'idle'
	);
	const saveTimerRef = useRef<number | null>(null);
	const saveRequestIdRef = useRef(0);
	const lastSavedValueRef = useRef(content);
	const syncingFromPropsRef = useRef(false);
	const latestValueRef = useRef(value);

	useEffect(() => {
		latestValueRef.current = value;
	}, [value]);

	useEffect(() => {
		let cancelled = false;

		if (saveTimerRef.current !== null) {
			window.clearTimeout(saveTimerRef.current);
			saveTimerRef.current = null;
		}

		saveRequestIdRef.current += 1;
		const nextValue = getInitialValue(filePath, content);
		const dirtyFromDraft = hasStoredDraft(filePath) && nextValue !== content;

		lastSavedValueRef.current = content;
		syncingFromPropsRef.current = true;
		queueMicrotask(() => {
			if (cancelled) return;
			setValue(nextValue);
			setSaveError(null);
			setSaveStatus(dirtyFromDraft ? 'dirty' : 'idle');
		});

		return () => {
			cancelled = true;
		};
	}, [content, filePath]);

	useEffect(() => {
		if (value === lastSavedValueRef.current) {
			window.localStorage.removeItem(getDraftStorageKey(filePath));
			return;
		}

		window.localStorage.setItem(getDraftStorageKey(filePath), value);
	}, [filePath, value]);

	const persistValue = useCallback(
		async (nextValue: string, requestId: number) => {
			try {
				await writeWorkspaceFile({ content: nextValue, path: filePath });

				if (saveRequestIdRef.current !== requestId) {
					return;
				}

				lastSavedValueRef.current = nextValue;
				window.localStorage.removeItem(getDraftStorageKey(filePath));
				setSaveStatus('saved');
				setSaveError(null);
				window.dispatchEvent(
					new CustomEvent('workspace-file-saved', {
						detail: { filePath },
					})
				);
			} catch (error) {
				if (saveRequestIdRef.current !== requestId) {
					return;
				}

				setSaveStatus('error');
				setSaveError(getErrorMessage(error));
			}
		},
		[filePath]
	);

	const requestSave = useCallback(
		async (nextValue: string, immediate = false) => {
			if (saveTimerRef.current !== null) {
				window.clearTimeout(saveTimerRef.current);
				saveTimerRef.current = null;
			}

			if (nextValue === lastSavedValueRef.current) {
				setSaveStatus('saved');
				setSaveError(null);
				return;
			}

			const requestId = saveRequestIdRef.current + 1;
			saveRequestIdRef.current = requestId;
			setSaveStatus('saving');
			setSaveError(null);

			if (immediate) {
				await persistValue(nextValue, requestId);
				return;
			}

			saveTimerRef.current = window.setTimeout(() => {
				saveTimerRef.current = null;
				void persistValue(nextValue, requestId);
			}, SAVE_DEBOUNCE_MS);
		},
		[persistValue]
	);

	const handleSave = useCallback(() => {
		void requestSave(value, true);
	}, [requestSave, value]);

	useEffect(() => {
		const editorId = `markdown:${filePath}`;

		registerEditor(editorId, {
			filePath,
			isDirty: () => latestValueRef.current !== lastSavedValueRef.current,
			save: async (options) => {
				if (latestValueRef.current === lastSavedValueRef.current) {
					return;
				}

				await requestSave(latestValueRef.current, options?.immediate ?? true);
			},
		});

		return () => {
			unregisterEditor(editorId);
		};
	}, [filePath, requestSave]);

	useEffect(() => {
		if (syncingFromPropsRef.current) {
			syncingFromPropsRef.current = false;
			return;
		}

		if (value === lastSavedValueRef.current) {
			return;
		}

		if (saveMode === 'manual') {
			if (saveTimerRef.current !== null) {
				window.clearTimeout(saveTimerRef.current);
				saveTimerRef.current = null;
			}

			queueMicrotask(() => {
				setSaveStatus('dirty');
				setSaveError(null);
			});
			return;
		}

		requestSave(value);

		return () => {
			if (saveTimerRef.current !== null) {
				window.clearTimeout(saveTimerRef.current);
				saveTimerRef.current = null;
			}
		};
	}, [filePath, requestSave, saveMode, value]);

	useEffect(() => {
		if (!saveError) {
			return;
		}

		showErrorToast('保存失败', saveError);
		queueMicrotask(() => {
			setSaveError(null);
			setSaveStatus(
				value === lastSavedValueRef.current
					? 'idle'
					: saveMode === 'manual'
						? 'dirty'
						: 'idle'
			);
		});
	}, [saveError, saveMode, value]);

	return (
		<MarkdownEditor
			onToggleMode={onToggleMode}
			encoding={encoding}
			mode={mode}
			onChange={setValue}
			onSave={handleSave}
			saveMode={saveMode}
			saveStatus={saveStatus}
			title={getFileTitle(filePath)}
			value={value}
		/>
	);
}
