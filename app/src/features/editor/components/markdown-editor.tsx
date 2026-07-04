import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	DeviceEventEmitter,
	KeyboardAvoidingView,
	Platform,
	StyleSheet,
	Text,
	View,
} from 'react-native';
import { Paths } from 'expo-file-system';
import CodeEditor from '@actualwave/react-native-codeditor';
import type { WebViewAPI } from '@actualwave/react-native-codeditor';
import { useTranslation } from 'react-i18next';
import {
	Bold,
	Eye,
	Image,
	Italic,
	Link,
	PenLine,
	Strikethrough,
	Underline,
} from 'lucide-react-native';
import { Spinner } from '@/components/ui/spinner';
import {
	APP_THEME_BACKGROUND_COLORS,
	type ResolvedThemePreference,
} from '@/features/settings';
import { WORKSPACE_EDITOR_INPUT_ACTIVE_EVENT } from '../lib/workspace-tab-events';
import { useSetMarkdownToolbar } from '../providers/markdown-toolbar-provider';
import { MarkdownPreview } from './markdown-preview';
import type {
	MarkdownCompletionControl,
	MarkdownToolbarIcon,
} from '../providers/markdown-toolbar-provider';
import type { EditorStateMessage } from '@/features/madora-sync/lib/protocol';

type SaveMode = 'auto' | 'manual';
type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
type EditorMode = 'edit' | 'preview';
type RemoteEditorState = EditorStateMessage | null;

type FormatKey =
	| 'bold'
	| 'italic'
	| 'strikethrough'
	| 'underline'
	| 'link'
	| 'image';

export interface MarkdownEditorHandle {
	editor: WebViewAPI;
}

export function MarkdownEditor({
	contentBottomPadding = 0,
	contentTopPadding = 0,
	filePath = '',
	fontSize = 14,
	mode,
	onChange,
	onEditorStateChange,
	onRequestCompletion,
	onSave,
	onToggleMode,
	remoteEditorState,
	syncShowingLoader = false,
	theme = 'light',
	title,
	value,
}: {
	contentBottomPadding?: number;
	contentTopPadding?: number;
	encoding?: string | null;
	filePath?: string;
	fontSize?: number;
	mode?: EditorMode;
	onChange: (content: string) => void;
	onEditorStateChange?: (state: {
		column: number | null;
		content: string | null;
		cursorIndex: number | null;
		line: number | null;
		localEditedAt: number;
	}) => void;
	onRequestCompletion?: (
		fullText: string,
		cursorPos: number
	) => Promise<string>;
	onSave?: () => void;
	onToggleMode?: () => void;
	remoteEditorState?: RemoteEditorState;
	syncShowingLoader?: boolean;
	theme?: ResolvedThemePreference;
	rootPath?: string | null;
	saveMode?: SaveMode;
	saveStatus?: SaveStatus;
	title?: string;
	value: string;
}) {
	const { t } = useTranslation();
	const setMarkdownToolbar = useSetMarkdownToolbar();
	const apiRef = useRef<WebViewAPI | null>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const requestSequenceRef = useRef(0);
	const completionAnchorRef = useRef<number | null>(null);
	const lastLocalValueRef = useRef(value);
	const emittedValuesRef = useRef(new Set<string>());
	const suppressContentUpdateRef = useRef<string | null>(null);
	const latestRemoteCursorRef = useRef<{
		content: string | null;
		contentHash: string | null;
		label: string | null;
		pos: number;
	} | null>(null);
	const documentKeyRef = useRef(getDocumentKey(filePath, title));
	const [editorContent, setEditorContent] = useState(value);
	const [internalMode, setInternalMode] = useState<EditorMode>('edit');
	const [editorLoadError, setEditorLoadError] = useState<string | null>(null);
	const [editorReady, setEditorReady] = useState(false);
	const [completionStatus, setCompletionStatus] =
		useState<MarkdownCompletionControl['status']>('idle');
	const effectiveMode = mode ?? internalMode;
	const editorUri = getEditorUri();

	const clearCompletion = useCallback(() => {
		requestSequenceRef.current += 1;
		completionAnchorRef.current = null;
		setCompletionStatus('idle');
		apiRef.current?.injectJavaScript(
			'window.__madoraClearGhost && window.__madoraClearGhost(); true;'
		);
	}, []);

	const acceptCompletion = useCallback(() => {
		requestSequenceRef.current += 1;
		completionAnchorRef.current = null;
		const api = apiRef.current;
		if (!api) {
			setCompletionStatus('idle');
			return;
		}

		api.injectJavaScript(
			'window.__madoraAcceptGhost && window.__madoraAcceptGhost(); true;'
		);
		setCompletionStatus('idle');
		void focusEditor(api);
	}, []);

	useEffect(() => {
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, []);

	useEffect(() => {
		DeviceEventEmitter.emit(
			WORKSPACE_EDITOR_INPUT_ACTIVE_EVENT,
			effectiveMode === 'edit'
		);

		return () => {
			DeviceEventEmitter.emit(WORKSPACE_EDITOR_INPUT_ACTIVE_EVENT, false);
		};
	}, [effectiveMode]);

	useEffect(() => {
		if (effectiveMode !== 'edit' || editorReady) return;

		const timer = setTimeout(() => {
			setEditorLoadError(
				Platform.OS === 'android'
					? t('markdownEditor.androidAssetsMissing')
					: t('markdownEditor.loadTimeout')
			);
		}, 8_000);

		return () => clearTimeout(timer);
	}, [effectiveMode, editorReady, t]);

	useEffect(() => {
		const nextDocumentKey = getDocumentKey(filePath, title);
		const documentChanged = documentKeyRef.current !== nextDocumentKey;
		documentKeyRef.current = nextDocumentKey;

		if (documentChanged) {
			lastLocalValueRef.current = value;
			emittedValuesRef.current.clear();
			suppressContentUpdateRef.current = value;
			setEditorContent(value);
			void apiRef.current?.editor.resetValue(value);
			clearCompletion();
			return;
		}

		if (value === lastLocalValueRef.current) {
			return;
		}

		if (emittedValuesRef.current.has(value)) {
			emittedValuesRef.current.delete(value);
			return;
		}

		lastLocalValueRef.current = value;
		suppressContentUpdateRef.current = value;
		setEditorContent(value);
		void apiRef.current?.editor.setValue(value);
		clearCompletion();
	}, [clearCompletion, filePath, title, value]);

	useEffect(() => {
		void apiRef.current?.editor.setFontSize(fontSize);
		if (apiRef.current)
			injectEditorStyle(
				apiRef.current,
				fontSize,
				contentTopPadding,
				contentBottomPadding,
				theme
			);
	}, [contentBottomPadding, contentTopPadding, fontSize, theme]);

	const scheduleCompletion = useCallback(
		(nextValue: string) => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
			if (!onRequestCompletion || nextValue.trim().length === 0) {
				clearCompletion();
				return;
			}

			const sequence = requestSequenceRef.current + 1;
			requestSequenceRef.current = sequence;

			debounceRef.current = setTimeout(() => {
				void (async () => {
					const api = apiRef.current;
					if (!api) return;

					const selection = await api.editor.getSelection();
					if (selection.length > 0) {
						completionAnchorRef.current = null;
						setCompletionStatus('idle');
						return;
					}

					const cursor = await api.editor.getCursor('head');
					const snapshot = { cursor: cursor.index, value: nextValue };
					completionAnchorRef.current = snapshot.cursor;
					api.injectJavaScript(
						'window.__madoraClearGhost && window.__madoraClearGhost(); true;'
					);
					setCompletionStatus('requesting');

					let completion = '';
					try {
						completion = await onRequestCompletion(nextValue, cursor.index);
					} catch {
						completion = '';
					}
					if (
						requestSequenceRef.current !== sequence ||
						lastLocalValueRef.current !== snapshot.value
					) {
						if (requestSequenceRef.current === sequence) {
							completionAnchorRef.current = null;
						}
						return;
					}

					const latestCursor = await api.editor.getCursor('head');
					if (latestCursor.index !== snapshot.cursor) {
						completionAnchorRef.current = null;
						setCompletionStatus('idle');
						return;
					}

					if (completion.length > 0) {
						api.injectJavaScript(
							`window.__madoraShowGhost && window.__madoraShowGhost(${JSON.stringify(completion)}); true;`
						);
						setCompletionStatus('ready');
						return;
					}

					completionAnchorRef.current = null;
					setCompletionStatus('idle');
				})();
			}, 80);
		},
		[clearCompletion, onRequestCompletion]
	);

	const handleContentUpdate = useCallback(
		(nextValue: string) => {
			const localEditedAt = Date.now();
			if (suppressContentUpdateRef.current === nextValue) {
				suppressContentUpdateRef.current = null;
				lastLocalValueRef.current = nextValue;
				clearCompletion();
				return;
			}

			lastLocalValueRef.current = nextValue;
			emittedValuesRef.current.add(nextValue);
			onChange(nextValue);
			clearCompletion();
			scheduleCompletion(nextValue);
			void reportEditorState(
				apiRef.current,
				nextValue,
				localEditedAt,
				true,
				onEditorStateChange
			);
		},
		[clearCompletion, onChange, onEditorStateChange, scheduleCompletion]
	);

	const handleSelectionChange = useCallback(() => {
		void reportEditorState(
			apiRef.current,
			lastLocalValueRef.current,
			Date.now(),
			false,
			onEditorStateChange
		);

		const anchor = completionAnchorRef.current;
		if (anchor === null) return;

		const api = apiRef.current;
		if (!api) {
			clearCompletion();
			return;
		}

		void (async () => {
			try {
				const selection = await api.editor.getSelection();
				const cursor = await api.editor.getCursor('head');
				if (
					completionAnchorRef.current !== null &&
					(selection.length > 0 || cursor.index !== completionAnchorRef.current)
				) {
					clearCompletion();
				}
			} catch {
				clearCompletion();
			}
		})();
	}, [clearCompletion, onEditorStateChange]);

	const handleInitialized = useCallback(
		(api: WebViewAPI) => {
			apiRef.current = api;
			setEditorReady(true);
			setEditorLoadError(null);
			injectEditorStyle(
				api,
				fontSize,
				contentTopPadding,
				contentBottomPadding,
				theme
			);
			injectGhostTextSupport(api);
			injectRemoteCursorSupport(api);
			injectSyncLoaderSupport(api);
			if (latestRemoteCursorRef.current) {
				api.injectJavaScript(
					`window.__madoraSetRemoteCursor && window.__madoraSetRemoteCursor(${JSON.stringify(
						latestRemoteCursorRef.current
					)}); true;`
				);
			}
			void api.editor.setFontSize(fontSize);
			void api.editor.registerShortcut('Mod-s', 'save');
			void api.editor.registerShortcut('Escape', 'dismissCompletion');
			void api.focus();
		},
		[contentBottomPadding, contentTopPadding, fontSize, theme]
	);

	const handleShortcut = useCallback(
		(name: string) => {
			if (name === 'save') {
				onSave?.();
				return;
			}
			if (name === 'dismissCompletion') {
				clearCompletion();
			}
		},
		[clearCompletion, onSave]
	);

	const handleToggleMode = useCallback(() => {
		clearCompletion();
		if (onToggleMode) {
			onToggleMode();
			return;
		}
		setInternalMode((current) => (current === 'edit' ? 'preview' : 'edit'));
	}, [clearCompletion, onToggleMode]);

	const applyFormat = useCallback(
		async (key: FormatKey) => {
			const api = apiRef.current;
			if (!api) return;

			clearCompletion();

			switch (key) {
				case 'bold':
					await wrapSelection(
						api,
						'**',
						'**',
						t('markdownEditor.placeholder.bold')
					);
					break;
				case 'italic':
					await wrapSelection(
						api,
						'*',
						'*',
						t('markdownEditor.placeholder.italic')
					);
					break;
				case 'strikethrough':
					await wrapSelection(
						api,
						'~~',
						'~~',
						t('markdownEditor.placeholder.strikethrough')
					);
					break;
				case 'underline':
					await wrapSelection(
						api,
						'<u>',
						'</u>',
						t('markdownEditor.placeholder.underline')
					);
					break;
				case 'link':
					await insertLink(api, t('markdownEditor.placeholder.link'));
					break;
				case 'image':
					await insertImage(api, t('markdownEditor.placeholder.image'));
					break;
			}
		},
		[clearCompletion, t]
	);

	const toolbarActions = useMemo(() => {
		if (effectiveMode === 'preview') {
			return [
				{
					icon: PenLine,
					key: 'edit',
					label: t('markdownEditor.toolbar.edit'),
					onPress: handleToggleMode,
				},
			];
		}

		return [
			...FORMAT_ACTIONS.map((action) => ({
				icon: action.icon,
				key: action.key,
				label: t(`markdownEditor.toolbar.${action.key}`),
				onPress: () => void applyFormat(action.key),
			})),
			{
				icon: Eye,
				key: 'preview',
				label: t('markdownEditor.toolbar.preview'),
				onPress: handleToggleMode,
			},
		];
	}, [applyFormat, effectiveMode, handleToggleMode, t]);

	const completionControl = useMemo<MarkdownCompletionControl>(() => {
		if (effectiveMode !== 'edit') return { status: 'idle' };

		if (completionStatus === 'requesting') {
			return {
				accessibilityLabel: t('markdownEditor.completion.loading'),
				label: t('markdownEditor.completion.loading'),
				status: 'requesting',
			};
		}

		if (completionStatus === 'ready') {
			return {
				accessibilityLabel: t('markdownEditor.completion.accept'),
				label: t('markdownEditor.completion.accept'),
				onAccept: acceptCompletion,
				status: 'ready',
			};
		}

		return { status: 'idle' };
	}, [acceptCompletion, completionStatus, effectiveMode, t]);

	useEffect(() => {
		setMarkdownToolbar({
			actions: toolbarActions,
			completion: completionControl,
			visible: true,
		});

		return () => setMarkdownToolbar(null);
	}, [completionControl, setMarkdownToolbar, toolbarActions]);

	useEffect(() => {
		const api = apiRef.current;
		if (!api) return;
		const cursorIndex = remoteEditorState?.cursorIndex ?? null;
		if (cursorIndex === null) {
			if (!remoteEditorState || remoteEditorState.filePath !== filePath) {
				latestRemoteCursorRef.current = null;
				api.injectJavaScript(
					'window.__madoraSetRemoteCursor && window.__madoraSetRemoteCursor(null); true;'
				);
			}
			return;
		}

		latestRemoteCursorRef.current = {
			content: remoteEditorState?.content ?? null,
			contentHash: remoteEditorState?.contentHash ?? null,
			label: remoteEditorState?.deviceName ?? null,
			pos: cursorIndex,
		};
		api.injectJavaScript(
			`window.__madoraSetRemoteCursor && window.__madoraSetRemoteCursor(${JSON.stringify(
				latestRemoteCursorRef.current
			)}); true;`
		);
	}, [
		filePath,
		remoteEditorState?.cursorIndex,
		remoteEditorState?.content,
		remoteEditorState?.contentHash,
		remoteEditorState?.deviceName,
		remoteEditorState?.filePath,
		remoteEditorState?.updatedAt,
	]);

	useEffect(() => {
		const api = apiRef.current;
		if (!api) return;
		api.injectJavaScript(
			`window.__madoraSetSyncLoader && window.__madoraSetSyncLoader(${syncShowingLoader ? 'true' : 'false'}); true;`
		);
	}, [syncShowingLoader]);

	const previewContent = useMemo(() => value || '', [value]);
	const containerStyle = useMemo(
		() => [
			styles.container,
			{ backgroundColor: theme === 'dark' ? '#0a0a0a' : '#fbfcff' },
		],
		[theme]
	);
	const blockingViewStyle = useMemo(
		() => [
			styles.blockingView,
			{ backgroundColor: theme === 'dark' ? '#0a0a0a' : '#ffffff' },
		],
		[theme]
	);

	return (
		<KeyboardAvoidingView
			behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
			style={containerStyle}
		>
			<View style={styles.editorPane}>
				<View
					pointerEvents={effectiveMode === 'edit' ? 'auto' : 'none'}
					style={[
						styles.modePane,
						{
							opacity: effectiveMode === 'edit' ? 1 : 0,
							position: effectiveMode === 'edit' ? 'relative' : 'absolute',
						},
					]}
				>
					<CodeEditor
						content={editorContent}
						editorUri={editorUri}
						language="markdown"
						onContentUpdate={handleContentUpdate}
						onError={(error) => {
							setEditorLoadError(
								getEditorErrorMessage(error, t('markdownEditor.loadFailed'))
							);
						}}
						onHistorySizeUpdate={() => {}}
						onInitialized={handleInitialized}
						onLog={() => {}}
						onSelectionChange={handleSelectionChange}
						onShortcut={handleShortcut}
						renderBlockingView={() => (
							<View style={blockingViewStyle}>
								{editorLoadError ? (
									<Text style={styles.blockingText}>{editorLoadError}</Text>
								) : (
									<Spinner color="#2563eb" size="small" />
								)}
							</View>
						)}
						theme={theme === 'dark' ? 'githubDark' : 'githubLight'}
						viewport={{
							intialScale: 1,
							maximumScale: 1,
							minimumScale: 1,
							userScalable: false,
							viewportWidth: 'device-width',
						}}
					/>
				</View>
				<View
					pointerEvents={effectiveMode === 'preview' ? 'auto' : 'none'}
					style={[
						styles.modePane,
						{
							opacity: effectiveMode === 'preview' ? 1 : 0,
							position: effectiveMode === 'preview' ? 'relative' : 'absolute',
						},
					]}
				>
					<MarkdownPreview
						content={previewContent}
						contentBottomPadding={contentBottomPadding}
						contentTopPadding={contentTopPadding}
						theme={theme}
					/>
				</View>
			</View>
		</KeyboardAvoidingView>
	);
}

const FORMAT_ACTIONS: { icon: MarkdownToolbarIcon; key: FormatKey }[] = [
	{ icon: Bold, key: 'bold' },
	{ icon: Italic, key: 'italic' },
	{ icon: Strikethrough, key: 'strikethrough' },
	{ icon: Underline, key: 'underline' },
	{ icon: Link, key: 'link' },
	{ icon: Image, key: 'image' },
];

function getDocumentKey(filePath: string, title?: string) {
	return filePath || title || 'madora-sync-document';
}

function getEditorUri() {
	if (Platform.OS !== 'ios') return undefined;
	return Paths.join(Paths.bundle, 'assets/codeditor/editor.html');
}

function getEditorErrorMessage(error: unknown, fallback: string) {
	if (typeof error === 'string') return error;
	if (error instanceof Error) return error.message;
	if (error && typeof error === 'object') {
		const maybeNativeError = error as {
			description?: unknown;
			message?: unknown;
			nativeEvent?: { description?: unknown };
		};
		if (typeof maybeNativeError.nativeEvent?.description === 'string') {
			return maybeNativeError.nativeEvent.description;
		}
		if (typeof maybeNativeError.description === 'string') {
			return maybeNativeError.description;
		}
		if (typeof maybeNativeError.message === 'string') {
			return maybeNativeError.message;
		}
	}
	return fallback;
}

async function wrapSelection(
	api: WebViewAPI,
	before: string,
	after: string,
	placeholder: string
) {
	const selectionStart = await api.editor.getCursor('from');
	const selected = await api.editor.getSelection();
	const text = selected || placeholder;
	await api.editor.replaceSelection(`${before}${text}${after}`);
	await api.editor.setSelection(
		selectionStart.index + before.length,
		selectionStart.index + before.length + text.length
	);
	await focusEditor(api);
}

async function insertLink(api: WebViewAPI, placeholder: string) {
	const selectionStart = await api.editor.getCursor('from');
	const selected = await api.editor.getSelection();
	const text = selected || placeholder;
	const insert = `[${text}](url)`;
	await api.editor.replaceSelection(insert);
	await api.editor.setSelection(
		selectionStart.index + text.length + 3,
		selectionStart.index + insert.length - 1
	);
	await focusEditor(api);
}

async function insertImage(api: WebViewAPI, placeholder: string) {
	const selectionStart = await api.editor.getCursor('from');
	const selected = await api.editor.getSelection();
	const alt = selected || placeholder;
	const insert = `![${alt}](url)`;
	await api.editor.replaceSelection(insert);
	await api.editor.setSelection(
		selectionStart.index + alt.length + 4,
		selectionStart.index + insert.length - 1
	);
	await focusEditor(api);
}

async function focusEditor(api: WebViewAPI) {
	await api.focus();
	await api.editor.scrollToCursor(24);
}

async function reportEditorState(
	api: WebViewAPI | null,
	content: string,
	localEditedAt: number,
	includeContent: boolean,
	onEditorStateChange:
		| ((state: {
				column: number | null;
				content: string | null;
				cursorIndex: number | null;
				line: number | null;
				localEditedAt: number;
		  }) => void)
		| undefined
) {
	if (!api || !onEditorStateChange) return;

	try {
		const cursor = await api.editor.getCursor('head');
		onEditorStateChange({
			column: cursor.ch + 1,
			content: includeContent ? content : null,
			cursorIndex: cursor.index,
			line: cursor.line + 1,
			localEditedAt,
		});
	} catch {
		onEditorStateChange({
			column: null,
			content: includeContent ? content : null,
			cursorIndex: null,
			line: null,
			localEditedAt,
		});
	}
}

function injectEditorStyle(
	api: WebViewAPI,
	fontSize: number,
	contentTopPadding: number,
	contentBottomPadding: number,
	theme: ResolvedThemePreference
) {
	const backgroundColor = APP_THEME_BACKGROUND_COLORS[theme];

	api.injectJavaScript(`
    (function() {
      var existing = document.getElementById('madora-codemirror-style');
      if (existing) existing.remove();
      var style = document.createElement('style');
      style.id = 'madora-codemirror-style';
      style.textContent = ${JSON.stringify(
				getEditorCss(fontSize, contentTopPadding, contentBottomPadding, theme)
			)};
      document.head.appendChild(style);
      document.documentElement.style.backgroundColor = ${JSON.stringify(backgroundColor)};
      document.body.style.backgroundColor = ${JSON.stringify(backgroundColor)};
      requestAnimationFrame(function() {
        (async function() {
          try {
            const { EditorView } =
              await window.CodeMirrorEditor.requireAsyncModule('@codemirror/view');
            const { StateEffect } =
              await window.CodeMirrorEditor.requireAsyncModule('@codemirror/state');
            const view = EditorView.findFromDOM(document.querySelector('.cm-editor'));
            if (view) {
              if (!window.__madoraLineWrappingInstalled) {
                window.__madoraLineWrappingInstalled = true;
                view.dispatch({
                  effects: StateEffect.appendConfig.of(EditorView.lineWrapping),
                });
              }
              view.requestMeasure();
            }
          } catch (_error) {}
        })();
      });
    })();
    true;
  `);
}

function injectGhostTextSupport(api: WebViewAPI) {
	api.injectJavaScript(`
    (async function() {
      if (window.__madoraGhostInstalled) return true;
      window.__madoraGhostInstalled = true;

      const { EditorView, Decoration, WidgetType, keymap } =
        await window.CodeMirrorEditor.requireAsyncModule('@codemirror/view');
      const { StateEffect, StateField, Transaction, Prec } =
        await window.CodeMirrorEditor.requireAsyncModule('@codemirror/state');
      const editorDom = document.querySelector('.cm-editor');
      const view = EditorView.findFromDOM(editorDom);
      if (!view) return true;

      const setGhostEffect = StateEffect.define();

      class MadoraGhostWidget extends WidgetType {
        constructor(text) {
          super();
          this.text = text;
        }
        eq(other) {
          return other.text === this.text;
        }
        toDOM() {
          const span = document.createElement('span');
          span.className = 'cm-fim-preview';
          span.setAttribute('aria-hidden', 'true');
          span.textContent = this.text;
          return span;
        }
        ignoreEvent() {
          return true;
        }
      }

      function continueGhost(ghost, transaction) {
        let next = ghost;
        transaction.changes.iterChanges(function(fromA, toA, _fromB, toB, inserted) {
          if (!next) return;
          const insertedText = inserted.toString();
          if (
            fromA === next.pos &&
            toA === next.pos &&
            insertedText.length > 0 &&
            next.text.startsWith(insertedText)
          ) {
            const remaining = next.text.slice(insertedText.length);
            next = remaining.length === 0 ? null : { pos: toB, text: remaining };
            return;
          }
          next = null;
        });
        return next;
      }

      const ghostField = StateField.define({
        create() {
          return null;
        },
        update(value, transaction) {
          for (const effect of transaction.effects) {
            if (effect.is(setGhostEffect)) return effect.value;
          }
          if (!value) return null;
          if (transaction.docChanged) return continueGhost(value, transaction);
          if (transaction.selection) {
            const selection = transaction.state.selection;
            if (
              selection.ranges.length !== 1 ||
              !selection.main.empty ||
              selection.main.head !== value.pos
            ) {
              return null;
            }
          }
          return value;
        },
        provide: (field) =>
          EditorView.decorations.compute([field], (state) => {
            const ghost = state.field(field);
            if (!ghost || ghost.text.length === 0) return Decoration.set([]);
            return Decoration.set([
              Decoration.widget({
                side: 1,
                widget: new MadoraGhostWidget(ghost.text),
              }).range(ghost.pos),
            ]);
          }),
      });

      function currentGhost() {
        try {
          return view.state.field(ghostField);
        } catch (_error) {
          return null;
        }
      }

      function acceptGhost(editorView) {
        const ghost = currentGhost();
        const selection = editorView.state.selection.main;
        if (!ghost || !selection.empty || selection.head !== ghost.pos) {
          return false;
        }

        editorView.dispatch({
          changes: { from: ghost.pos, to: ghost.pos, insert: ghost.text },
          selection: { anchor: ghost.pos + ghost.text.length },
          effects: setGhostEffect.of(null),
        });
        return true;
      }

      window.__madoraClearGhost = function() {
        view.dispatch({
          effects: setGhostEffect.of(null),
          annotations: Transaction.addToHistory.of(false),
        });
      };

      window.__madoraAcceptGhost = function() {
        return acceptGhost(view);
      };

      window.__madoraShowGhost = function(text) {
        const selection = view.state.selection.main;
        if (!text || !selection.empty) {
          window.__madoraClearGhost();
          return;
        }
        view.dispatch({
          effects: [
            setGhostEffect.of({ pos: selection.head, text: String(text) }),
            EditorView.scrollIntoView(selection.head, { y: 'nearest' }),
          ],
          annotations: Transaction.addToHistory.of(false),
        });
      };

      view.dispatch({
        effects: StateEffect.appendConfig.of([
          ghostField,
          Prec.highest(
            keymap.of([
              {
                key: 'Tab',
                run(editorView) {
                  return acceptGhost(editorView);
                },
              },
              {
                key: 'Escape',
                run() {
                  window.__madoraClearGhost();
                  return false;
                },
              },
            ])
          ),
        ]),
      });

      return true;
    })();
    true;
  `);
}

function injectRemoteCursorSupport(api: WebViewAPI) {
	api.injectJavaScript(`
    (async function() {
      if (window.__madoraRemoteCursorInstalled) return true;
      window.__madoraRemoteCursorInstalled = true;

      const { EditorView } =
        await window.CodeMirrorEditor.requireAsyncModule('@codemirror/view');
      const { StateEffect } =
        await window.CodeMirrorEditor.requireAsyncModule('@codemirror/state');
      const editorDom = document.querySelector('.cm-editor');
      const view = EditorView.findFromDOM(editorDom);
      if (!view) return true;

      window.__madoraRemoteCursorState = null;
      let remoteCursorFrame = null;
      const overlay = document.createElement('div');
      overlay.className = 'cm-madora-remote-cursor';
      overlay.setAttribute('aria-hidden', 'true');
      const label = document.createElement('div');
      label.className = 'cm-madora-remote-cursor-label';
      overlay.appendChild(label);
      view.dom.appendChild(overlay);

      function hashMadoraEditorContent(content) {
        let hash = 0x811c9dc5;
        for (let index = 0; index < content.length; index += 1) {
          hash ^= content.charCodeAt(index);
          hash = Math.imul(hash, 0x01000193);
        }
        return (hash >>> 0).toString(36);
      }

      function renderRemoteCursor() {
        const currentCursor = window.__madoraRemoteCursorState;
        if (
          !currentCursor ||
          (currentCursor.content !== null && view.state.doc.toString() !== currentCursor.content) ||
          (currentCursor.contentHash !== null && hashMadoraEditorContent(view.state.doc.toString()) !== currentCursor.contentHash) ||
          currentCursor.pos < 0 ||
          currentCursor.pos > view.state.doc.length
        ) {
          overlay.style.display = 'none';
          return;
        }

        const coords = view.coordsAtPos(currentCursor.pos);
        if (!coords) {
          overlay.style.display = 'none';
          return;
        }

        const editorRect = view.dom.getBoundingClientRect();
        const x = coords.left - editorRect.left;
        const y = coords.top - editorRect.top;
        overlay.style.display = 'block';
        overlay.style.left = Math.round(x) + 'px';
        overlay.style.top = Math.round(y) + 'px';
        overlay.style.height = Math.max(14, coords.bottom - coords.top) + 'px';

        label.textContent = currentCursor.label || '';
        label.style.display = currentCursor.label ? 'block' : 'none';
        if (!currentCursor.label) return;

        requestAnimationFrame(function() {
          if (overlay.style.display === 'none') return;
          const labelWidth = label.offsetWidth;
          const minLeft = 2 - x;
          const maxLeft = editorRect.width - x - labelWidth - 2;
          label.style.left = Math.round(Math.max(minLeft, Math.min(-1, maxLeft))) + 'px';
        });
      }

      function scheduleRenderRemoteCursor() {
        if (remoteCursorFrame !== null) return;
        remoteCursorFrame = requestAnimationFrame(function() {
          remoteCursorFrame = null;
          renderRemoteCursor();
        });
      }

      window.__madoraSetRemoteCursor = function(cursor) {
        window.__madoraRemoteCursorState =
          cursor && Number.isFinite(cursor.pos)
            ? {
                content: typeof cursor.content === 'string' ? cursor.content : null,
                contentHash: typeof cursor.contentHash === 'string' ? cursor.contentHash : null,
                label: cursor.label || null,
                pos: Number(cursor.pos),
              }
            : null;
        renderRemoteCursor();
        if (window.__madoraSetSyncLoader) window.__madoraSetSyncLoader(window.__madoraSyncLoaderVisible || false);
      };

      const scroller = view.dom.querySelector('.cm-scroller');
      if (scroller) {
        scroller.addEventListener('scroll', scheduleRenderRemoteCursor, { passive: true });
      }
      window.addEventListener('resize', scheduleRenderRemoteCursor);

      const updateListener = EditorView.updateListener.of(function(update) {
        if (update.docChanged || update.selectionSet || update.viewportChanged || update.geometryChanged) {
          scheduleRenderRemoteCursor();
        }
      });
      view.dispatch({ effects: StateEffect.appendConfig.of(updateListener) });

      return true;
    })();
    true;
  `);
}

function injectSyncLoaderSupport(api: WebViewAPI) {
	api.injectJavaScript(`
    (async function() {
      if (window.__madoraSyncLoaderInstalled) return true;
      window.__madoraSyncLoaderInstalled = true;

      const { EditorView } =
        await window.CodeMirrorEditor.requireAsyncModule('@codemirror/view');
      const { StateEffect } =
        await window.CodeMirrorEditor.requireAsyncModule('@codemirror/state');
      const editorDom = document.querySelector('.cm-editor');
      const view = EditorView.findFromDOM(editorDom);
      if (!view) return true;

      let visible = false;
      let syncLoaderFrame = null;
      const loader = document.createElement('div');
      loader.className = 'cm-madora-sync-loader';
      loader.setAttribute('aria-hidden', 'true');
      loader.appendChild(document.createElement('i'));
      loader.appendChild(document.createElement('i'));
      loader.appendChild(document.createElement('i'));
      view.dom.appendChild(loader);

      function hashMadoraEditorContent(content) {
        let hash = 0x811c9dc5;
        for (let index = 0; index < content.length; index += 1) {
          hash ^= content.charCodeAt(index);
          hash = Math.imul(hash, 0x01000193);
        }
        return (hash >>> 0).toString(36);
      }

      function renderSyncLoader() {
        const remoteCursor = window.__madoraRemoteCursorState;
        if (
          !visible ||
          !remoteCursor ||
          (remoteCursor.content !== null && view.state.doc.toString() !== remoteCursor.content) ||
          (remoteCursor.contentHash !== null && hashMadoraEditorContent(view.state.doc.toString()) !== remoteCursor.contentHash) ||
          remoteCursor.pos < 0 ||
          remoteCursor.pos > view.state.doc.length
        ) {
          loader.style.display = 'none';
          return;
        }

        const coords = view.coordsAtPos(remoteCursor.pos);
        if (!coords) {
          loader.style.display = 'none';
          return;
        }

        const editorRect = view.dom.getBoundingClientRect();
        loader.style.display = 'inline-flex';
        loader.style.left = Math.round(coords.left - editorRect.left + 6) + 'px';
        loader.style.top = Math.round(coords.bottom - editorRect.top - 1) + 'px';
      }

      function scheduleRenderSyncLoader() {
        if (syncLoaderFrame !== null) return;
        syncLoaderFrame = requestAnimationFrame(function() {
          syncLoaderFrame = null;
          renderSyncLoader();
        });
      }

      window.__madoraSetSyncLoader = function(nextVisible) {
        visible = Boolean(nextVisible);
        window.__madoraSyncLoaderVisible = visible;
        renderSyncLoader();
      };

      const scroller = view.dom.querySelector('.cm-scroller');
      if (scroller) {
        scroller.addEventListener('scroll', scheduleRenderSyncLoader, { passive: true });
      }
      window.addEventListener('resize', scheduleRenderSyncLoader);

      const updateListener = EditorView.updateListener.of(function(update) {
        if (update.docChanged || update.selectionSet || update.viewportChanged || update.geometryChanged) {
          scheduleRenderSyncLoader();
        }
      });
      view.dispatch({ effects: StateEffect.appendConfig.of(updateListener) });

      return true;
    })();
    true;
  `);
}

function getEditorCss(
	fontSize: number,
	contentTopPadding: number,
	contentBottomPadding: number,
	theme: ResolvedThemePreference
) {
	const safePaddingTop = Math.max(0, contentTopPadding);
	const safePaddingBottom = Math.max(0, contentBottomPadding);
	const contentPaddingTop = 14 + safePaddingTop;
	const contentPaddingBottom = 14 + safePaddingBottom;
	const isDark = theme === 'dark';
	const backgroundColor = APP_THEME_BACKGROUND_COLORS[theme];
	const textColor = isDark ? '#f5f5f5' : '#111827';
	const gutterBackground = isDark
		? 'rgba(255, 255, 255, 0.03)'
		: 'rgba(37, 99, 235, 0.03)';
	const gutterBorder = isDark
		? 'rgba(255, 255, 255, 0.08)'
		: 'rgba(17, 24, 39, 0.12)';
	const gutterText = isDark ? '#737373' : '#9ca3af';
	const activeLine = isDark
		? 'rgba(37, 99, 235, 0.16)'
		: 'rgba(37, 99, 235, 0.08)';

	return `
    html, body {
      background: ${backgroundColor} !important;
      color: ${textColor};
      height: 100%;
      margin: 0;
      overflow: hidden;
    }
    .cm-editor {
      background: ${backgroundColor} !important;
      color: ${textColor};
      font-size: ${fontSize}px;
      height: 100%;
      min-height: 100%;
    }
    .cm-scroller {
      background: ${backgroundColor} !important;
      box-sizing: border-box;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
      line-height: 1.7;
      overflow: auto !important;
      padding-top: 0 !important;
    }
    .cm-content {
      caret-color: #2563eb;
      min-height: 100%;
      padding: ${contentPaddingTop}px 18px ${contentPaddingBottom}px !important;
      white-space: pre-wrap !important;
      word-break: break-word;
      overflow-wrap: anywhere;
    }
    .cm-line {
      padding: 0;
      word-break: break-word;
      overflow-wrap: anywhere;
    }
    .cm-gutters {
      background: ${gutterBackground} !important;
      border-right: 1px solid ${gutterBorder} !important;
      color: ${gutterText} !important;
    }
    .cm-activeLine {
      background: ${activeLine} !important;
    }
    .cm-activeLineGutter {
      background: ${activeLine} !important;
      color: #2563eb !important;
    }
    .cm-selectionBackground,
    .cm-content ::selection {
      background: rgba(37, 99, 235, 0.2) !important;
    }
    .cm-focused {
      outline: none !important;
    }
    .cm-cursor,
    .cm-dropCursor {
      border-left-color: #2563eb !important;
    }
    .cm-fim-preview {
      color: #737373;
      font-style: italic;
      font-weight: 200;
      overflow-wrap: anywhere;
      pointer-events: none;
      user-select: none;
      vertical-align: top;
      white-space: pre-wrap;
    }
    .cm-madora-remote-cursor {
      border-left: 2px solid #22c55e;
      pointer-events: none;
      position: absolute;
      transform: translateX(-1px);
      z-index: 3;
    }
    .cm-madora-remote-cursor-label {
      background: #16a34a;
      border-radius: 3px;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 10px;
      font-weight: 700;
      left: -1px;
      line-height: 14px;
      max-width: 120px;
      overflow: hidden;
      padding: 0 4px;
      position: absolute;
      text-overflow: ellipsis;
      top: -15px;
      white-space: nowrap;
    }
    .cm-madora-sync-loader {
      align-items: center;
      display: inline-flex;
      gap: 3px;
      pointer-events: none;
      position: absolute;
      z-index: 3;
    }
    .cm-madora-sync-loader i {
      animation: madora-sync-pulse 0.9s ease-in-out infinite;
      background: #22c55e;
      border-radius: 999px;
      display: inline-block;
      height: 4px;
      opacity: 0.35;
      width: 4px;
    }
    .cm-madora-sync-loader i:nth-child(2) {
      animation-delay: 0.12s;
    }
    .cm-madora-sync-loader i:nth-child(3) {
      animation-delay: 0.24s;
    }
    @keyframes madora-sync-pulse {
      0%, 80%, 100% {
        opacity: 0.3;
        transform: translateY(0);
      }
      40% {
        opacity: 1;
        transform: translateY(-2px);
      }
    }
  `;
}

const styles = StyleSheet.create({
	blockingView: {
		alignItems: 'center',
		bottom: 0,
		justifyContent: 'center',
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
	},
	blockingText: {
		color: '#b91c1c',
		fontSize: 12,
		lineHeight: 18,
		maxWidth: 300,
		textAlign: 'center',
	},
	container: {
		flex: 1,
	},
	editorPane: {
		flex: 1,
		minHeight: 0,
	},
	modePane: {
		bottom: 0,
		flex: 1,
		left: 0,
		minHeight: 0,
		right: 0,
		top: 0,
	},
	formatGroup: {
		alignItems: 'center',
		flexDirection: 'row',
		gap: 4,
	},
	modeButton: {
		alignItems: 'center',
		borderColor: 'rgba(17, 24, 39, 0.12)',
		borderRadius: 6,
		borderWidth: StyleSheet.hairlineWidth,
		height: 32,
		justifyContent: 'center',
		paddingHorizontal: 10,
	},
	modeButtonText: {
		color: '#111827',
		fontSize: 12,
		fontWeight: '600',
	},
	toolbar: {
		alignItems: 'center',
		borderBottomColor: 'rgba(17, 24, 39, 0.1)',
		borderBottomWidth: StyleSheet.hairlineWidth,
		flexDirection: 'row',
		justifyContent: 'space-between',
		minHeight: 42,
		paddingHorizontal: 8,
	},
	toolButton: {
		alignItems: 'center',
		borderColor: 'rgba(17, 24, 39, 0.12)',
		borderRadius: 6,
		borderWidth: StyleSheet.hairlineWidth,
		height: 30,
		justifyContent: 'center',
		minWidth: 30,
		paddingHorizontal: 8,
	},
	toolButtonText: {
		color: '#111827',
		fontSize: 12,
		fontWeight: '600',
	},
});
