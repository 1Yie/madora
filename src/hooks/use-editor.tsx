import { indentWithTab } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import {
	Compartment,
	EditorSelection,
	EditorState,
	Prec,
	StateField,
	StateEffect,
	type Transaction,
} from '@codemirror/state';
import {
	Decoration,
	EditorView,
	keymap,
	showTooltip,
	tooltips,
	WidgetType,
	type Tooltip,
	type TooltipView,
	type ViewUpdate,
} from '@codemirror/view';
import { invoke } from '@tauri-apps/api/core';
import { tags as t } from '@lezer/highlight';
import { basicSetup } from 'codemirror';
import { createRoot, type Root } from 'react-dom/client';
import {
	useEffect,
	useEffectEvent,
	useRef,
	type MutableRefObject,
} from 'react';

import { useAiSettings } from '@/components/system/ai-settings-provider';
import { useTheme } from '@/components/system/theme-provider';
import { Spinner } from '@/components/ui/spinner';

type UseEditorOptions = {
	onChange?: (value: string) => void;
	onSave?: () => void;
	title?: string;
	value: string;
	viewRef?: MutableRefObject<EditorView | null>;
};

type CompletionRequestMode = 'auto' | 'chat-prefix' | 'fim';

type CompletionResultData = {
	mode: Exclude<CompletionRequestMode, 'auto'>;
	text: string;
};

type CompletionStatusTone = 'muted' | 'loading' | 'success' | 'error';

type CompletionStatus = {
	message: string;
	tone: CompletionStatusTone;
};

type CompletionTooltipState = {
	message: string;
	pos: number;
	tone: CompletionStatusTone;
};

type CompletionPreviewState = {
	pos: number;
	text: string;
};

type CompletionSnapshot = {
	cursor: number;
	docText: string;
};

type PendingCompletionRequest = CompletionSnapshot & {
	requestSequence: number;
};

type CompletionCacheEntry = {
	completion: string;
	snapshot: CompletionSnapshot;
};

const AUTO_COMPLETION_DEBOUNCE_MS = 300;
const AUTO_COMPLETION_COOLDOWN_MS = 800;
const MAX_PREFIX_CHARS = 12_000;
const MAX_SUFFIX_CHARS = 4_000;
const DEFAULT_READY_MESSAGE = 'AI 自动补全已就绪';
const COMPLETION_TOOLTIP_EDGE_MARGIN = 12;
const COMPLETION_DEBUG = import.meta.env.DEV;

function logCompletionDebug(event: string, details?: Record<string, unknown>) {
	if (!COMPLETION_DEBUG) return;
	if (details) {
		console.debug('[completion]', event, details);
	} else {
		console.debug('[completion]', event);
	}
}

function getCompletionTooltipSpace(view: EditorView) {
	const rect = view.dom.getBoundingClientRect();
	return {
		bottom: rect.bottom,
		left: rect.left,
		right: rect.right,
		top: rect.top,
	};
}

function getCompletionTooltipShiftX(
	dom: HTMLElement,
	space: { left: number; right: number }
): number {
	const rect = dom.getBoundingClientRect();
	const rightGap = space.right - rect.right;
	const leftGap = rect.left - space.left;
	if (rightGap >= COMPLETION_TOOLTIP_EDGE_MARGIN || leftGap <= 0) return 0;
	return Math.round(-(COMPLETION_TOOLTIP_EDGE_MARGIN - rightGap));
}

function isSameCompletionSnapshot(
	left: CompletionSnapshot | null,
	right: CompletionSnapshot | null
): boolean {
	return left?.cursor === right?.cursor && left?.docText === right?.docText;
}

function isSnapshotCurrent(
	view: EditorView,
	snapshot: CompletionSnapshot
): boolean {
	const state = view.state;
	return (
		state.doc.toString() === snapshot.docText &&
		state.selection.ranges.length === 1 &&
		state.selection.main.empty &&
		state.selection.main.head === snapshot.cursor
	);
}

function getContinuedCompletionPreview(
	preview: CompletionPreviewState,
	transaction: Transaction
): CompletionPreviewState | null {
	const selection = transaction.newSelection;
	if (selection.ranges.length !== 1 || !selection.main.empty) {
		logCompletionDebug('preview-drop:invalid-selection');
		return null;
	}

	let nextPreview: CompletionPreviewState | null = null;

	transaction.changes.iterChanges((fromA, toA, _fromB, toB, inserted) => {
		const insertedText = inserted.toString();

		if (toA <= preview.pos) {
			const offset = insertedText.length - (toA - fromA);
			nextPreview = { pos: preview.pos + offset, text: preview.text };
			return;
		}
		if (fromA >= preview.pos + preview.text.length) {
			nextPreview = preview;
			return;
		}
		if (
			fromA === preview.pos &&
			toA === preview.pos &&
			insertedText.length > 0
		) {
			const remainingText = preview.text.slice(insertedText.length);
			nextPreview =
				remainingText.length === 0 ? null : { pos: toB, text: remainingText };
			return;
		}
		nextPreview = null;
	});

	return nextPreview;
}

const internalCompletionEffect = StateEffect.define<true>();
const externalSyncEffect = StateEffect.define<true>();
const setCompletionTooltipEffect =
	StateEffect.define<CompletionTooltipState | null>();
const setCompletionPreviewEffect =
	StateEffect.define<CompletionPreviewState | null>();

const completionTooltipField = StateField.define<CompletionTooltipState | null>(
	{
		create() {
			return null;
		},
		update(value, transaction) {
			for (const effect of transaction.effects) {
				if (effect.is(setCompletionTooltipEffect)) return effect.value;
			}
			if (transaction.docChanged && value) {
				const cursor = transaction.state.selection.main.head;
				return { ...value, pos: cursor };
			}
			return value;
		},
		provide: (field) =>
			showTooltip.compute([field], (state) => {
				const tooltipState = state.field(field);
				if (!tooltipState) return null;
				return {
					above: false,
					arrow: false,
					pos: tooltipState.pos,
					strictSide: false,
					create() {
						return createCompletionTooltipView();
					},
				} satisfies Tooltip;
			}),
	}
);

class CompletionPreviewWidget extends WidgetType {
	constructor(private readonly text: string) {
		super();
	}
	eq(other: CompletionPreviewWidget) {
		return other.text === this.text;
	}
	toDOM() {
		const dom = document.createElement('span');
		dom.className = 'cm-fim-preview';
		dom.setAttribute('aria-hidden', 'true');
		dom.textContent = this.text;
		return dom;
	}
	ignoreEvent() {
		return true;
	}
}

const completionPreviewField = StateField.define<CompletionPreviewState | null>(
	{
		create() {
			return null;
		},
		update(value, transaction) {
			for (const effect of transaction.effects) {
				if (effect.is(setCompletionPreviewEffect)) return effect.value;
			}
			if (!value) return null;

			if (transaction.docChanged) {
				if (transaction.isUserEvent('input.type.compose')) return value;
				return getContinuedCompletionPreview(value, transaction);
			}

			if (transaction.selection) {
				const prev = transaction.startState.selection.main;
				const next = transaction.state.selection.main;
				const selectionActuallyChanged =
					prev.from !== next.from || prev.to !== next.to;
				if (
					selectionActuallyChanged &&
					(transaction.state.selection.ranges.length !== 1 ||
						!transaction.state.selection.main.empty ||
						transaction.state.selection.main.head !== value.pos)
				) {
					return null;
				}
			}
			return value;
		},
		provide: (field) =>
			EditorView.decorations.compute([field], (state) => {
				const preview = state.field(field);
				if (!preview || preview.text.length === 0) return Decoration.set([]);
				return Decoration.set([
					Decoration.widget({
						side: 1,
						widget: new CompletionPreviewWidget(preview.text),
					}).range(preview.pos),
				]);
			}),
	}
);

const themeCompartment = new Compartment();

function createEditorTheme(dark: boolean) {
	return EditorView.theme(
		{
			'&': {
				minHeight: '100%',
				accentColor: 'var(--color-primary)',
				backgroundColor: 'transparent',
				color: 'var(--color-foreground)',
				fontSize: '0.875rem',
			},
			'.cm-scroller': {
				fontFamily:
					'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
				lineHeight: '1.7',
				overflow: 'hidden',
				maxHeight: 'none',
			},
			'.cm-content': {
				caretColor: 'var(--color-primary)',
				minHeight: '100%',
				padding: '1rem 1.25rem',
			},
			'.cm-line': { padding: '0' },
			'.cm-gutters': {
				borderRight: 'none',
				minHeight: '100%',
				backgroundColor: 'transparent',
				color: 'var(--color-muted-foreground)',
			},
			'.cm-selectionBackground, .cm-content ::selection': {
				backgroundColor:
					'color-mix(in oklab, var(--color-primary) 20%, transparent)',
			},
			'.cm-activeLine': {
				backgroundColor:
					'color-mix(in oklab, var(--color-primary) 8%, transparent)',
			},
			'.cm-activeLineGutter': {
				backgroundColor:
					'color-mix(in oklab, var(--color-primary) 5%, transparent)',
				color: 'var(--color-primary)',
			},
			'.cm-focused .cm-selectionBackground': {
				backgroundColor:
					'color-mix(in oklab, var(--color-primary) 26%, transparent)',
			},
			'.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-primary)' },
			'.cm-fim-preview': {
				color: 'var(--color-muted-foreground)',
				fontStyle: 'italic',
				fontWeight: '200',
				overflowWrap: 'anywhere',
				pointerEvents: 'none',
				userSelect: 'none',
				verticalAlign: 'top',
				whiteSpace: 'pre-wrap',
			},
			'.cm-tooltip.cm-fim-tooltip': {
				border: 'none',
				backgroundColor: 'transparent',
				boxShadow: 'none',
				padding: '0',
				maxWidth: 'none',
			},
			'&.cm-focused': { outline: 'none' },
		},
		{ dark }
	);
}

const markdownHighlightStyle = HighlightStyle.define([
	{
		tag: [
			t.heading,
			t.heading1,
			t.heading2,
			t.heading3,
			t.heading4,
			t.heading5,
			t.heading6,
		],
		color: 'var(--color-primary)',
		fontWeight: '700',
	},
	{
		tag: [t.strong],
		color: 'var(--color-primary)',
		fontWeight: '700',
	},
	{
		tag: [t.emphasis],
		color:
			'color-mix(in oklab, var(--color-primary) 68%, var(--color-foreground))',
		fontStyle: 'italic',
	},
	{
		tag: [t.link, t.url],
		color: 'var(--color-primary)',
		textDecoration: 'underline',
		textDecorationColor:
			'color-mix(in oklab, var(--color-primary) 55%, transparent)',
	},
	{
		tag: [t.quote, t.list, t.contentSeparator],
		color:
			'color-mix(in oklab, var(--color-primary) 58%, var(--color-muted-foreground))',
	},
	{
		tag: [t.monospace],
		color: 'var(--color-primary)',
	},
	{
		tag: [t.strikethrough],
		color:
			'color-mix(in oklab, var(--color-primary) 52%, var(--color-muted-foreground))',
		textDecoration: 'line-through',
	},
	{
		tag: [t.processingInstruction, t.punctuation, t.meta, t.escape],
		color:
			'color-mix(in oklab, var(--color-primary) 34%, var(--color-muted-foreground))',
	},
]);

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	return 'AI 补全失败';
}

function getDefaultCompletionStatus(
	enabled: boolean,
	hasApiKey: boolean
): CompletionStatus {
	if (!enabled) return { message: 'AI 补全已关闭', tone: 'muted' };
	if (!hasApiKey) return { message: '保存 API Key 后可用', tone: 'muted' };
	return { message: DEFAULT_READY_MESSAGE, tone: 'muted' };
}

function shouldTriggerCompletion(
	state: EditorState,
	enabled: boolean,
	hasApiKey: boolean
): boolean {
	if (!enabled || !hasApiKey) return false;
	if (state.selection.ranges.length !== 1 || !state.selection.main.empty)
		return false;
	const cursor = state.selection.main.head;
	const prompt = state.doc.sliceString(
		Math.max(0, cursor - MAX_PREFIX_CHARS),
		cursor
	);
	return prompt.trim().length > 0;
}

function shouldShowCompletionTooltip(
	view: EditorView,
	status: CompletionStatus,
	hasPendingRequest: boolean
): boolean {
	return view.hasFocus && (hasPendingRequest || status.tone === 'loading');
}

function isCompositionInputUpdate(update: ViewUpdate): boolean {
	return update.transactions.some((tr) => tr.isUserEvent('input.type.compose'));
}

function isInternalCompletionUpdate(update: ViewUpdate): boolean {
	return (
		update.transactions.length > 0 &&
		update.transactions.every((tr) =>
			tr.effects.some((e) => e.is(internalCompletionEffect))
		)
	);
}

function isExternalSyncUpdate(update: ViewUpdate): boolean {
	return (
		update.transactions.length > 0 &&
		update.transactions.every((tr) =>
			tr.effects.some((e) => e.is(externalSyncEffect))
		)
	);
}

function renderCompletionTooltip(
	view: EditorView,
	status: CompletionStatus,
	hasPendingRequest: boolean
) {
	const nextTooltip = shouldShowCompletionTooltip(
		view,
		status,
		hasPendingRequest
	)
		? { message: '', pos: view.state.selection.main.head, tone: status.tone }
		: null;

	const currentTooltip = view.state.field(completionTooltipField);
	if (
		currentTooltip?.message === nextTooltip?.message &&
		currentTooltip?.pos === nextTooltip?.pos &&
		currentTooltip?.tone === nextTooltip?.tone
	) {
		return;
	}
	view.dispatch({
		effects: [
			setCompletionTooltipEffect.of(nextTooltip),
			internalCompletionEffect.of(true),
		],
	});
}

function renderCompletionPreview(
	view: EditorView,
	preview: CompletionPreviewState | null
) {
	view.dispatch({
		effects: [
			setCompletionPreviewEffect.of(preview),
			internalCompletionEffect.of(true),
		],
	});
}

// Suppress react-refresh warning: this file exports a hook but contains a tiny
// internal component used only for rendering the tooltip. Moving it out would
// be noisier than a local rule disable.
// eslint-disable-next-line react-refresh/only-export-components
function CompletionTooltipContent() {
	return (
		<div
			className="inline-flex items-center justify-center rounded-full border
				border-primary/15 bg-background p-1 shadow"
		>
			<Spinner className="size-3 text-primary" />
		</div>
	);
}

function createCompletionTooltipView(): TooltipView {
	const dom = document.createElement('div');
	let root: Root | null = createRoot(dom);
	dom.className = 'cm-fim-tooltip';
	root.render(<CompletionTooltipContent />);

	return {
		dom,
		offset: { x: 0, y: 8 },
		positioned(space) {
			const shiftX = getCompletionTooltipShiftX(dom, space);
			dom.style.transform = shiftX ? `translateX(${shiftX}px)` : '';
		},
		destroy() {
			const rootToUnmount = root;
			root = null;
			Promise.resolve().then(() => rootToUnmount?.unmount());
		},
	};
}

export function useEditor({
	onChange,
	onSave,
	title,
	value,
	viewRef: externalViewRef,
}: UseEditorOptions) {
	const autoCompletionTimerRef = useRef<number | null>(null);
	const cooldownTimerRef = useRef<number | null>(null);
	const editorRef = useRef<HTMLDivElement | null>(null);
	const queuedRequestRef = useRef<CompletionSnapshot | null>(null);
	const pendingRequestRef = useRef<PendingCompletionRequest | null>(null);
	const requestSequenceRef = useRef(0);
	const scheduledSnapshotRef = useRef<CompletionSnapshot | null>(null);
	const viewRef = useRef<EditorView | null>(null);
	const completionCacheRef = useRef<CompletionCacheEntry | null>(null);
	const aiSettingsRef = useRef({
		apiUrl: '',
		enabled: true,
		hasApiKey: false,
		model: '',
		provider: 'deepseek',
		smartRoutingEnabled: false,
	});
	const completionStatusRef = useRef<CompletionStatus>({
		message: '保存 API Key 后可用',
		tone: 'muted',
	});

	const { apiUrl, enabled, hasApiKey, model, provider, smartRoutingEnabled } =
		useAiSettings();
	const { resolvedTheme } = useTheme();

	const handleChange = useEffectEvent((nextValue: string) => {
		onChange?.(nextValue);
	});

	const handleSave = useEffectEvent(() => {
		onSave?.();
	});

	const syncTooltip = useEffectEvent(() => {
		const view = viewRef.current;
		if (!view) return;
		renderCompletionTooltip(
			view,
			completionStatusRef.current,
			pendingRequestRef.current !== null ||
				scheduledSnapshotRef.current !== null
		);
	});

	const setCompletionStatus = useEffectEvent((status: CompletionStatus) => {
		completionStatusRef.current = status;
		syncTooltip();
	});

	const syncPreview = useEffectEvent(
		(preview: CompletionPreviewState | null) => {
			const view = viewRef.current;
			if (!view) return;
			renderCompletionPreview(view, preview);
		}
	);

	const clearScheduledCompletion = useEffectEvent(
		(reason: 'cancel' | 'restart' = 'cancel') => {
			if (autoCompletionTimerRef.current === null) return;
			logCompletionDebug(
				reason === 'restart' ? 'schedule-restart' : 'schedule-clear'
			);
			window.clearTimeout(autoCompletionTimerRef.current);
			autoCompletionTimerRef.current = null;
			scheduledSnapshotRef.current = null;
			syncTooltip();
		}
	);

	const clearCompletionPreview = useEffectEvent(() => {
		const view = viewRef.current;
		if (!view || !view.state.field(completionPreviewField)) return;
		logCompletionDebug('preview-clear');
		syncPreview(null);

		if (cooldownTimerRef.current !== null)
			window.clearTimeout(cooldownTimerRef.current);
		cooldownTimerRef.current = window.setTimeout(() => {
			cooldownTimerRef.current = null;
		}, AUTO_COMPLETION_COOLDOWN_MS);
	});

	const abortAllCompletion = useEffectEvent(() => {
		const view = viewRef.current;
		if (view && view.state.field(completionPreviewField)) {
			syncPreview(null);
		}
		clearScheduledCompletion('cancel');
		requestSequenceRef.current += 1;
		pendingRequestRef.current = null;
		queuedRequestRef.current = null;
		setCompletionStatus(
			getDefaultCompletionStatus(
				aiSettingsRef.current.enabled,
				aiSettingsRef.current.hasApiKey
			)
		);
		if (cooldownTimerRef.current !== null)
			window.clearTimeout(cooldownTimerRef.current);
		cooldownTimerRef.current = window.setTimeout(() => {
			cooldownTimerRef.current = null;
		}, AUTO_COMPLETION_COOLDOWN_MS);
	});

	const isInCooldown = () => cooldownTimerRef.current !== null;

	const tryUseCache = useEffectEvent(
		(view: EditorView, snapshot: CompletionSnapshot): boolean => {
			const cache = completionCacheRef.current;
			if (!cache || !isSameCompletionSnapshot(cache.snapshot, snapshot))
				return false;

			logCompletionDebug('cache-hit', { cursor: snapshot.cursor });
			const currentPreview = view.state.field(completionPreviewField);
			if (currentPreview && currentPreview.pos === snapshot.cursor) return true;

			view.dispatch({
				effects: [
					setCompletionPreviewEffect.of({
						pos: snapshot.cursor,
						text: cache.completion,
					}),
					internalCompletionEffect.of(true),
				],
			});
			setCompletionStatus(
				getDefaultCompletionStatus(
					aiSettingsRef.current.enabled,
					aiSettingsRef.current.hasApiKey
				)
			);
			return true;
		}
	);

	const requestCompletion = useEffectEvent(
		async (view: EditorView, snapshotOverride?: CompletionSnapshot) => {
			const settings = aiSettingsRef.current;

			if (!view.hasFocus) return;
			if (view.composing) return;
			if (
				!shouldTriggerCompletion(
					view.state,
					settings.enabled,
					settings.hasApiKey
				)
			)
				return;
			if (isInCooldown()) {
				logCompletionDebug('request-skip:cooldown');
				return;
			}

			const snapshot =
				snapshotOverride ??
				({
					cursor: view.state.selection.main.head,
					docText: view.state.doc.toString(),
				} satisfies CompletionSnapshot);

			if (tryUseCache(view, snapshot)) return;

			const { cursor, docText } = snapshot;
			const prompt = docText.slice(
				Math.max(0, cursor - MAX_PREFIX_CHARS),
				cursor
			);
			const suffix = docText.slice(cursor, cursor + MAX_SUFFIX_CHARS);
			const pendingRequest = pendingRequestRef.current;

			if (pendingRequest) {
				if (isSameCompletionSnapshot(pendingRequest, snapshot)) {
					logCompletionDebug('request-skip:duplicate-inflight');
				} else {
					queuedRequestRef.current = snapshot;
					logCompletionDebug('request-queue-latest');
				}
				syncTooltip();
				return;
			}

			if (
				scheduledSnapshotRef.current &&
				isSameCompletionSnapshot(scheduledSnapshotRef.current, snapshot)
			) {
				logCompletionDebug('request-skip:duplicate-scheduled');
				return;
			}

			const requestId = requestSequenceRef.current + 1;
			requestSequenceRef.current = requestId;
			pendingRequestRef.current = {
				cursor,
				docText,
				requestSequence: requestId,
			};

			clearScheduledCompletion('cancel');
			scheduledSnapshotRef.current = null;
			syncTooltip();
			setCompletionStatus({ message: '正在生成 AI 建议...', tone: 'loading' });

			try {
				const result = await invoke<CompletionResultData>(
					'generate_completion',
					{
						config: {
							apiUrl:
								settings.apiUrl.trim().length > 0 ? settings.apiUrl : null,
							model: settings.model.trim().length > 0 ? settings.model : null,
							provider: settings.provider,
							smartRoutingEnabled: settings.smartRoutingEnabled,
						},
						request: {
							mode: 'auto',
							prefix: prompt,
							suffix: suffix.length > 0 ? suffix : null,
							title: title ?? null,
						},
					}
				);

				if (requestId !== requestSequenceRef.current) {
					logCompletionDebug('request-cancelled', {
						requestId,
						currentSeq: requestSequenceRef.current,
					});
					return;
				}

				const completion = result.text;
				const currentView = viewRef.current;
				if (!currentView) return;

				if (!isSnapshotCurrent(currentView, snapshot)) {
					logCompletionDebug('request-drop:view-mismatch');
					setCompletionStatus(
						getDefaultCompletionStatus(settings.enabled, settings.hasApiKey)
					);
					return;
				}

				if (completion.length === 0) {
					clearCompletionPreview();
					setCompletionStatus(
						getDefaultCompletionStatus(settings.enabled, settings.hasApiKey)
					);
					return;
				}

				completionCacheRef.current = {
					snapshot: { cursor, docText },
					completion,
				};

				currentView.dispatch({
					effects: [
						setCompletionPreviewEffect.of({ pos: cursor, text: completion }),
						internalCompletionEffect.of(true),
					],
				});

				setCompletionStatus(
					getDefaultCompletionStatus(settings.enabled, settings.hasApiKey)
				);
			} catch (error) {
				if (requestId !== requestSequenceRef.current) return;
				clearCompletionPreview();
				setCompletionStatus({ message: getErrorMessage(error), tone: 'error' });
			} finally {
				const wasPending =
					pendingRequestRef.current?.requestSequence === requestId;
				if (wasPending) pendingRequestRef.current = null;

				if (!pendingRequestRef.current && !scheduledSnapshotRef.current) {
					const currentTone = completionStatusRef.current.tone;
					if (currentTone === 'loading' || currentTone === 'error') {
						setCompletionStatus(
							getDefaultCompletionStatus(
								aiSettingsRef.current.enabled,
								aiSettingsRef.current.hasApiKey
							)
						);
					}
				}

				syncTooltip();

				const nextView = viewRef.current;
				const queuedRequest = queuedRequestRef.current;
				if (nextView && queuedRequest) {
					queuedRequestRef.current = null;
					if (
						isSnapshotCurrent(nextView, queuedRequest) &&
						requestSequenceRef.current === requestId
					) {
						void requestCompletion(nextView, queuedRequest);
					}
				}
			}
		}
	);

	const scheduleCompletionRequest = useEffectEvent((view: EditorView) => {
		const settings = aiSettingsRef.current;
		if (isInCooldown()) return;

		const snapshot = {
			cursor: view.state.selection.main.head,
			docText: view.state.doc.toString(),
		} satisfies CompletionSnapshot;

		if (
			!view.hasFocus ||
			view.composing ||
			!shouldTriggerCompletion(view.state, settings.enabled, settings.hasApiKey)
		) {
			return;
		}

		const pendingRequest = pendingRequestRef.current;
		if (pendingRequest) {
			if (!isSameCompletionSnapshot(queuedRequestRef.current, snapshot)) {
				queuedRequestRef.current = snapshot;
			}
			syncTooltip();
			return;
		}

		if (
			autoCompletionTimerRef.current !== null &&
			isSameCompletionSnapshot(scheduledSnapshotRef.current, snapshot)
		) {
			return;
		}

		clearScheduledCompletion('restart');
		scheduledSnapshotRef.current = snapshot;
		autoCompletionTimerRef.current = window.setTimeout(() => {
			autoCompletionTimerRef.current = null;
			scheduledSnapshotRef.current = null;
			void requestCompletion(view);
		}, AUTO_COMPLETION_DEBOUNCE_MS);
		syncTooltip();
	});

	const acceptCompletionPreview = useEffectEvent((view: EditorView) => {
		const preview = view.state.field(completionPreviewField);
		const cursor = view.state.selection.main.head;

		if (!preview || preview.pos !== cursor || preview.text.length === 0)
			return false;

		clearScheduledCompletion();
		view.dispatch({
			changes: { from: cursor, insert: preview.text },
			effects: setCompletionPreviewEffect.of(null),
			selection: EditorSelection.cursor(cursor + preview.text.length),
		});
		setCompletionStatus(
			getDefaultCompletionStatus(
				aiSettingsRef.current.enabled,
				aiSettingsRef.current.hasApiKey
			)
		);
		return true;
	});

	const cancelCompletionPreview = useEffectEvent((view: EditorView) => {
		if (view.state.field(completionPreviewField)) {
			clearCompletionPreview();
			return true;
		}
		return false;
	});

	// AI 设置变化时清空缓存与进行中的请求
	useEffect(() => {
		aiSettingsRef.current = {
			apiUrl,
			enabled,
			hasApiKey,
			model,
			provider,
			smartRoutingEnabled,
		};
		completionCacheRef.current = null;

		if (!viewRef.current) return;
		clearScheduledCompletion();
		queuedRequestRef.current = null;
		pendingRequestRef.current = null;
		clearCompletionPreview();
		completionStatusRef.current = getDefaultCompletionStatus(
			enabled,
			hasApiKey
		);
		syncTooltip();
	}, [apiUrl, enabled, hasApiKey, model, provider, smartRoutingEnabled]);

	// resolvedTheme 变化时热更新编辑器主题
	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		view.dispatch({
			effects: themeCompartment.reconfigure(
				createEditorTheme(resolvedTheme === 'dark')
			),
		});
	}, [resolvedTheme]);

	// 初始化编辑器
	/* eslint-disable react-hooks/exhaustive-deps */
	useEffect(() => {
		if (!editorRef.current) return;

		completionStatusRef.current = getDefaultCompletionStatus(
			enabled,
			hasApiKey
		);

		const view = new EditorView({
			parent: editorRef.current,
			state: EditorState.create({
				doc: value,
				extensions: [
					basicSetup,
					markdown(),
					syntaxHighlighting(markdownHighlightStyle),
					EditorView.lineWrapping,
					tooltips({ tooltipSpace: getCompletionTooltipSpace }),
					EditorView.domEventHandlers({
						contextmenu: (event) => {
							event.preventDefault();
							return true;
						},
						compositionend: () => {
							window.requestAnimationFrame(() => {
								const currentView = viewRef.current;
								if (!currentView) return;
								scheduleCompletionRequest(currentView);
							});
						},
					}),
					themeCompartment.of(createEditorTheme(resolvedTheme === 'dark')),
					completionPreviewField,
					completionTooltipField,
					Prec.high(
						keymap.of([
							{
								key: 'Tab',
								run: (activeView) => acceptCompletionPreview(activeView),
							},
							{
								key: 'Escape',
								run: (activeView) => cancelCompletionPreview(activeView),
							},
							{
								key: 'Mod-s',
								run: () => {
									if (!onSave) {
										return false;
									}
									handleSave();
									return true;
								},
							},
							indentWithTab,
						])
					),
					EditorView.updateListener.of((update: ViewUpdate) => {
						const compositionInputUpdate = isCompositionInputUpdate(update);
						const internalUpdate = isInternalCompletionUpdate(update);
						const externalSyncUpdate = isExternalSyncUpdate(update);

						if (update.docChanged && !externalSyncUpdate) {
							handleChange(update.state.doc.toString());
						}

						if (
							!internalUpdate &&
							!externalSyncUpdate &&
							update.selectionSet &&
							!update.docChanged
						) {
							abortAllCompletion();
							return;
						}

						if (
							!internalUpdate &&
							!externalSyncUpdate &&
							!compositionInputUpdate &&
							update.docChanged &&
							!update.view.composing
						) {
							if (
								completionStatusRef.current.tone === 'error' ||
								completionStatusRef.current.tone === 'loading'
							) {
								completionStatusRef.current = getDefaultCompletionStatus(
									aiSettingsRef.current.enabled,
									aiSettingsRef.current.hasApiKey
								);
							}
						}

						if (update.focusChanged && !update.view.hasFocus) {
							clearScheduledCompletion('cancel');
							queuedRequestRef.current = null;
						}

						if (!internalUpdate && !externalSyncUpdate) {
							const isUserInput = update.transactions.some((tr) =>
								tr.isUserEvent('input')
							);
							if (isUserInput && !compositionInputUpdate) {
								scheduleCompletionRequest(update.view);
							}
						}

						if (
							update.docChanged ||
							update.selectionSet ||
							update.focusChanged ||
							update.viewportChanged
						) {
							renderCompletionTooltip(
								update.view,
								completionStatusRef.current,
								pendingRequestRef.current !== null
							);
						}
					}),
				],
			}),
		});

		viewRef.current = view;
		if (externalViewRef) externalViewRef.current = view;
		view.focus();

		return () => {
			queuedRequestRef.current = null;
			pendingRequestRef.current = null;
			if (autoCompletionTimerRef.current !== null)
				window.clearTimeout(autoCompletionTimerRef.current);
			if (cooldownTimerRef.current !== null)
				window.clearTimeout(cooldownTimerRef.current);
			view.destroy();
			viewRef.current = null;
		};
	}, []);
	/* eslint-enable react-hooks/exhaustive-deps */

	// 外部 value 同步
	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;

		const currentValue = view.state.doc.toString();
		if (currentValue === value) return;

		view.dispatch({
			changes: { from: 0, to: currentValue.length, insert: value },
			effects: externalSyncEffect.of(true),
		});
	}, [value]);

	return { editorRef, viewRef };
}
