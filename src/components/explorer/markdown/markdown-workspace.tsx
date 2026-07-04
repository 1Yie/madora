import { writeWorkspaceFile } from '@/invoke/explorer';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
	madoraSyncPublishEditorState,
	type MadoraSyncEditorState,
} from '@/invoke/madora-sync';
import { listen } from '@tauri-apps/api/event';

import { useAppSettings } from '@/context/app-settings-provider';
import { showErrorToast } from '@/components/ui/toast';
import { hashEditorContent } from '@/lib/editor-content-hash';
import {
	getMarkdownDraftStorageKey,
	getStoredMarkdownDraftContent,
	registerEditor,
	removeStoredMarkdownDraft,
	unregisterEditor,
} from '@/lib/unsaved-registry';

import { MarkdownEditor } from './markdown-editor';

type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

type MarkdownWorkspaceProps = {
	content: string;
	encoding?: string | null;
	filePath: string;
	rootPath: string | null;
	mode: 'edit' | 'preview';
	onToggleMode?: () => void;
};

const SAVE_DEBOUNCE_MS = 400;
const EDITOR_STATE_THROTTLE_MS = 80;
const LOCAL_EDIT_PROTECTION_MS = 1_200;
const REMOTE_APPLY_LOADING_MS = 420;

function getInitialValue(filePath: string, content: string): string {
	const draft = getStoredMarkdownDraftContent(filePath);

	return draft ?? content;
}

function hasStoredDraft(filePath: string): boolean {
	return getStoredMarkdownDraftContent(filePath) !== null;
}

function getFileTitle(filePath: string): string {
	const normalizedPath = filePath.replace(/\\/g, '/');
	const fileName = normalizedPath.split('/').pop() ?? 'Untitled';

	return fileName.replace(/\.(md|markdown|mdx)$/i, '');
}

function getErrorMessage(error: unknown, t: (key: string) => string): string {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === 'string') {
		return error;
	}

	return t('errors.saveFailed');
}

export function MarkdownWorkspace({
	content,
	encoding,
	filePath,
	rootPath,
	mode,
	onToggleMode,
}: MarkdownWorkspaceProps) {
	const { t } = useTranslation();
	const { saveMode, editorFontSize } = useAppSettings();
	const [value, setValue] = useState(() => getInitialValue(filePath, content));
	const [saveError, setSaveError] = useState<string | null>(null);
	const [remoteState, setRemoteState] = useState<MadoraSyncEditorState | null>(
		null
	);
	const [syncLoading, setSyncLoading] = useState(false);
	const [saveStatus, setSaveStatus] = useState<SaveStatus>(() =>
		hasStoredDraft(filePath) ? 'dirty' : 'idle'
	);
	const saveTimerRef = useRef<number | null>(null);
	const editorStateTimerRef = useRef<number | null>(null);
	const remoteApplyLoadingTimerRef = useRef<number | null>(null);
	const saveRequestIdRef = useRef(0);
	const lastSavedValueRef = useRef(content);
	const lastEditorStateAtRef = useRef(0);
	const lastLocalEditAtRef = useRef(0);
	const pendingRemoteStateRef = useRef<MadoraSyncEditorState | null>(null);
	const lastCursorRef = useRef<{
		column: number | null;
		cursorIndex: number | null;
		line: number | null;
	}>({ column: null, cursorIndex: null, line: null });
	const syncingFromPropsRef = useRef(false);
	const latestValueRef = useRef(value);

	useEffect(() => {
		latestValueRef.current = value;
	}, [value]);

	useEffect(() => {
		const pendingRemoteState = pendingRemoteStateRef.current;
		if (
			!pendingRemoteState ||
			pendingRemoteState.filePath !== filePath ||
			pendingRemoteState.content !== value
		) {
			return;
		}

		pendingRemoteStateRef.current = null;
		setRemoteState(pendingRemoteState);
		setSyncLoading(true);
		if (remoteApplyLoadingTimerRef.current !== null) {
			window.clearTimeout(remoteApplyLoadingTimerRef.current);
		}
		remoteApplyLoadingTimerRef.current = window.setTimeout(() => {
			setSyncLoading(false);
			remoteApplyLoadingTimerRef.current = null;
		}, REMOTE_APPLY_LOADING_MS);
	}, [filePath, value]);

	useEffect(() => {
		let active = true;
		let unlisten: (() => void) | null = null;

		void listen<MadoraSyncEditorState>(
			'madora-sync://editor-state',
			(event) => {
				if (!active) return;
				const nextState = event.payload;
				if (nextState.filePath === filePath) {
					const hasRecentLocalEdit =
						Date.now() - lastLocalEditAtRef.current < LOCAL_EDIT_PROTECTION_MS;
					const hasRemoteContent = typeof nextState.content === 'string';
					const canApplyRemoteContent = hasRemoteContent && !hasRecentLocalEdit;

					if (!hasRemoteContent) {
						const pendingRemoteState = pendingRemoteStateRef.current;
						if (pendingRemoteState?.filePath === filePath) {
							pendingRemoteStateRef.current = {
								...pendingRemoteState,
								column: nextState.column,
								cursorIndex: nextState.cursorIndex,
								deviceId: nextState.deviceId,
								deviceName: nextState.deviceName,
								editing: nextState.editing,
								line: nextState.line,
								source: nextState.source,
								title: nextState.title ?? pendingRemoteState.title,
								updatedAt: nextState.updatedAt,
							};
							return;
						}

						setRemoteState(nextState);
						setSyncLoading(true);
						if (remoteApplyLoadingTimerRef.current !== null) {
							window.clearTimeout(remoteApplyLoadingTimerRef.current);
						}
						remoteApplyLoadingTimerRef.current = window.setTimeout(() => {
							setSyncLoading(false);
							remoteApplyLoadingTimerRef.current = null;
						}, REMOTE_APPLY_LOADING_MS);
					}

					const nextContent =
						typeof nextState.content === 'string' ? nextState.content : null;
					if (canApplyRemoteContent && nextContent !== null) {
						if (
							!pendingRemoteStateRef.current &&
							nextContent === latestValueRef.current
						) {
							pendingRemoteStateRef.current = null;
							setRemoteState(nextState);
							setSyncLoading(true);
							if (remoteApplyLoadingTimerRef.current !== null) {
								window.clearTimeout(remoteApplyLoadingTimerRef.current);
							}
							remoteApplyLoadingTimerRef.current = window.setTimeout(() => {
								setSyncLoading(false);
								remoteApplyLoadingTimerRef.current = null;
							}, REMOTE_APPLY_LOADING_MS);
							return;
						}

						pendingRemoteStateRef.current = nextState;
						lastSavedValueRef.current = nextContent;
						syncingFromPropsRef.current = true;
						removeStoredMarkdownDraft(filePath);
						setValue(nextContent);
						setSaveError(null);
						setSaveStatus('saved');
						window.dispatchEvent(
							new CustomEvent('editor-dirty-changed', {
								detail: { filePath },
							})
						);
					} else if (hasRemoteContent) {
						pendingRemoteStateRef.current = nextState;
					}
				} else {
					setRemoteState(null);
				}
			}
		).then((dispose) => {
			if (!active) {
				dispose();
				return;
			}
			unlisten = dispose;
		});

		return () => {
			active = false;
			unlisten?.();
		};
	}, [filePath]);

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
			removeStoredMarkdownDraft(filePath);
			return;
		}

		removeStoredMarkdownDraft(filePath);
		window.localStorage.setItem(getMarkdownDraftStorageKey(filePath), value);
	}, [filePath, value]);

	const persistValue = useCallback(
		async (nextValue: string, requestId: number) => {
			try {
				await writeWorkspaceFile({ content: nextValue, path: filePath });

				if (saveRequestIdRef.current !== requestId) {
					return;
				}

				lastSavedValueRef.current = nextValue;
				removeStoredMarkdownDraft(filePath);
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
				setSaveError(getErrorMessage(error, t));
			}
		},
		[filePath, t]
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

	const publishEditorState = useCallback(
		({
			column,
			content,
			contentHash,
			cursorIndex,
			editing,
			line,
		}: {
			column: number | null;
			content?: string | null;
			contentHash?: string | null;
			cursorIndex: number | null;
			editing: boolean;
			line: number | null;
		}) => {
			void madoraSyncPublishEditorState({
				column,
				content,
				contentHash,
				cursorIndex,
				editing,
				filePath,
				line,
				title: getFileTitle(filePath),
			});
		},
		[filePath]
	);

	const scheduleEditorStatePublish = useCallback(
		(nextValue: string | null) => {
			if (editorStateTimerRef.current !== null) {
				window.clearTimeout(editorStateTimerRef.current);
			}

			editorStateTimerRef.current = window.setTimeout(() => {
				editorStateTimerRef.current = null;
				lastEditorStateAtRef.current = Date.now();
				publishEditorState({
					...lastCursorRef.current,
					content: nextValue,
					contentHash: hashEditorContent(nextValue ?? latestValueRef.current),
					editing: mode === 'edit',
				});
			}, EDITOR_STATE_THROTTLE_MS);
		},
		[mode, publishEditorState]
	);

	const handleCursorEditorStateChange = useCallback(
		(line: number, col: number, cursorIndex: number) => {
			lastCursorRef.current = { column: col, cursorIndex, line };
			const now = Date.now();
			if (now - lastEditorStateAtRef.current < EDITOR_STATE_THROTTLE_MS) {
				scheduleEditorStatePublish(null);
				return;
			}

			lastEditorStateAtRef.current = now;
			publishEditorState({
				column: col,
				content: null,
				contentHash: hashEditorContent(latestValueRef.current),
				cursorIndex,
				editing: mode === 'edit',
				line,
			});
		},
		[mode, publishEditorState, scheduleEditorStatePublish]
	);

	const handleEditorChange = useCallback(
		(nextValue: string) => {
			lastLocalEditAtRef.current = Date.now();
			latestValueRef.current = nextValue;
			setValue(nextValue);
			const now = Date.now();
			if (now - lastEditorStateAtRef.current < EDITOR_STATE_THROTTLE_MS) {
				scheduleEditorStatePublish(nextValue);
				return;
			}

			if (editorStateTimerRef.current !== null) {
				window.clearTimeout(editorStateTimerRef.current);
				editorStateTimerRef.current = null;
			}
			lastEditorStateAtRef.current = now;
			publishEditorState({
				...lastCursorRef.current,
				content: nextValue,
				contentHash: hashEditorContent(nextValue),
				editing: mode === 'edit',
			});
		},
		[mode, publishEditorState, scheduleEditorStatePublish]
	);

	useEffect(() => {
		publishEditorState({
			column: null,
			content: latestValueRef.current,
			contentHash: hashEditorContent(latestValueRef.current),
			cursorIndex: null,
			editing: mode === 'edit',
			line: null,
		});

		return () => {
			void madoraSyncPublishEditorState({
				column: null,
				content: null,
				contentHash: null,
				cursorIndex: null,
				editing: false,
				filePath,
				line: null,
				title: getFileTitle(filePath),
			});
		};
	}, [filePath, mode, publishEditorState]);

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

		// Sync tab state with registry after registration, in case the
		// dirty-change effect skipped its event during sync-from-props.
		window.dispatchEvent(
			new CustomEvent('editor-dirty-changed', {
				detail: { filePath },
			})
		);

		return () => {
			if (editorStateTimerRef.current !== null) {
				window.clearTimeout(editorStateTimerRef.current);
				editorStateTimerRef.current = null;
			}
			if (remoteApplyLoadingTimerRef.current !== null) {
				window.clearTimeout(remoteApplyLoadingTimerRef.current);
				remoteApplyLoadingTimerRef.current = null;
			}
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

		showErrorToast(t('errors.saveFailed'), saveError);
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
	}, [saveError, saveMode, t, value]);

	return (
		<MarkdownEditor
			onToggleMode={onToggleMode}
			encoding={encoding}
			mode={mode}
			onChange={handleEditorChange}
			onCursorChange={handleCursorEditorStateChange}
			onSave={handleSave}
			saveMode={saveMode}
			filePath={filePath}
			rootPath={rootPath}
			saveStatus={saveStatus}
			syncLoading={syncLoading}
			remoteCursor={{
				contentHash: remoteState?.contentHash ?? null,
				content: remoteState?.content ?? null,
				cursorIndex: remoteState?.cursorIndex ?? null,
				label: remoteState?.deviceName ?? null,
			}}
			title={getFileTitle(filePath)}
			fontSize={editorFontSize}
			value={value}
		/>
	);
}
