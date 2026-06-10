import { writeWorkspaceFile } from '@/invoke/explorer';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAppSettings } from '@/context/app-settings-provider';
import { showErrorToast } from '@/components/ui/toast';
import { registerEditor, unregisterEditor } from '@/lib/unsaved-registry';

import { MarkdownEditor } from '../markdown/markdown-editor';

type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

type TextWorkspaceProps = {
	content: string;
	encoding?: string | null;
	filePath: string;
	rootPath: string | null;
	mode?: 'edit' | 'preview';
};

const SAVE_DEBOUNCE_MS = 400;

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === 'string') {
		return error;
	}

	return '保存失败';
}

export function TextWorkspace({
	content,
	encoding,
	filePath,
	rootPath,
	mode = 'edit',
}: TextWorkspaceProps) {
	const { saveMode } = useAppSettings();
	const [value, setValue] = useState(content);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
	const saveTimerRef = useRef<number | null>(null);
	const saveRequestIdRef = useRef(0);
	const lastSavedValueRef = useRef(content);
	const syncingFromPropsRef = useRef(false);
	const latestValueRef = useRef(value);

	useEffect(() => {
		latestValueRef.current = value;
	}, [value]);

	const fileName = filePath.replace(/\\/g, '/').split('/').pop() ?? 'file';

	useEffect(() => {
		let cancelled = false;

		saveRequestIdRef.current += 1;
		lastSavedValueRef.current = content;
		syncingFromPropsRef.current = true;
		queueMicrotask(() => {
			if (cancelled) return;
			setValue(content);
			setSaveError(null);
			setSaveStatus('idle');
		});

		return () => {
			cancelled = true;
		};
	}, [content, filePath]);

	const persistValue = useCallback(
		async (nextValue: string, requestId: number) => {
			try {
				await writeWorkspaceFile({ content: nextValue, path: filePath });

				if (saveRequestIdRef.current !== requestId) {
					return;
				}

				lastSavedValueRef.current = nextValue;
				setSaveStatus('saved');
				setSaveError(null);
				window.dispatchEvent(
					new CustomEvent('workspace-file-saved', {
						detail: { filePath },
					})
				);
				window.dispatchEvent(
					new CustomEvent('editor-dirty-changed', {
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
		const editorId = `text:${filePath}`;

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

		// Sync tab state with registry after registration, in case the
		// dirty-change effect skipped its event during sync-from-props.
		window.dispatchEvent(
			new CustomEvent('editor-dirty-changed', {
				detail: { filePath },
			})
		);

		return () => {
			unregisterEditor(editorId);
		};
	}, [filePath, requestSave]);

	useEffect(() => {
		if (syncingFromPropsRef.current) {
			syncingFromPropsRef.current = false;
			return;
		}

		const isDirty = value !== lastSavedValueRef.current;

		// Notify parent of dirty state change
		window.dispatchEvent(
			new CustomEvent('editor-dirty-changed', {
				detail: { filePath },
			})
		);

		if (!isDirty) {
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
			encoding={encoding}
			onChange={setValue}
			onSave={handleSave}
			saveMode={saveMode}
			saveStatus={saveStatus}
			filePath={filePath}
			rootPath={rootPath}
			title={fileName}
			value={value}
			mode={mode}
		/>
	);
}
