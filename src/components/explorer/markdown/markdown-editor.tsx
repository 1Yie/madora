import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { SaveMode } from '@/context/app-settings-provider';
import type { RemoteCursorState } from '@/hooks/use-editor';
import { useEditor } from '@/hooks/use-editor';
import { Spinner } from '@/components/ui/spinner';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { explorerEditorStatusBarClassName } from '../layout';
import { MarkdownPreview } from './markdown-preview';
import {
	ContextMenuPopup,
	ContextMenuRoot,
	ContextMenuTrigger,
	MenuItem,
	MenuSeparator,
} from '@/components/ui/context-menu';
import {
	Clipboard,
	Scissors,
	Copy,
	Eye,
	EyeOff,
	Bold,
	Italic,
	Strikethrough,
	Underline,
	Link,
	ImageIcon,
	PenLine,
	CircleCheck,
	CircleX,
	Save,
	CloudUpload,
} from 'lucide-react';
import type { ReactNode } from 'react';

type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

type MarkdownEditorProps = {
	encoding?: string | null;
	mode: 'edit' | 'preview';
	onChange: (value: string) => void;
	onCursorChange?: (line: number, col: number, cursorIndex: number) => void;
	onSave: () => void;
	onToggleMode?: () => void;
	remoteCursor?: RemoteCursorState | null;
	saveMode: SaveMode;
	saveStatus: SaveStatus;
	syncLoading?: boolean;
	title?: string;
	filePath: string;
	rootPath: string | null;
	fontSize: number;

	value: string;
};

function isMac(): boolean {
	if ('userAgentData' in navigator) {
		return (
			(navigator as Navigator & { userAgentData: { platform: string } })
				.userAgentData.platform === 'macOS'
		);
	}
	return navigator.platform.toUpperCase().includes('MAC');
}

function getModKey(): string {
	return isMac() ? 'Cmd' : 'Ctrl';
}

function SaveShortcutHint(): ReactNode {
	return (
		<KbdGroup>
			<Kbd>{getModKey()}</Kbd>
			<Kbd>S</Kbd>
		</KbdGroup>
	);
}

function getSaveStatusNode(
	saveStatus: SaveStatus,
	saveMode: SaveMode,
	t: (key: string) => string
): ReactNode {
	switch (saveStatus) {
		case 'dirty':
			return (
				<span className="inline-flex items-center gap-1.5">
					<PenLine className="size-3.5 shrink-0" />
					{t('markdownEditor.status.dirty')} <SaveShortcutHint />
				</span>
			);
		case 'saving':
			return (
				<span className="inline-flex items-center gap-1.5">
					{t('markdownEditor.status.saving')}
				</span>
			);
		case 'saved':
			return (
				<span className="inline-flex items-center gap-1.5 text-emerald-500">
					<CircleCheck className="size-3.5 shrink-0" />
					{t('markdownEditor.status.saved')}
				</span>
			);
		case 'error':
			return (
				<span className="inline-flex items-center gap-1.5 text-destructive">
					<CircleX className="size-3.5 shrink-0" />
					{t('markdownEditor.status.error')}
				</span>
			);
		default:
			return saveMode === 'manual' ? (
				<span className="inline-flex items-center gap-1.5">
					<Save className="size-3.5 shrink-0" />
					{t('markdownEditor.status.manual')} <SaveShortcutHint />
				</span>
			) : (
				<span className="inline-flex items-center gap-1.5">
					<CloudUpload className="size-3.5 shrink-0" />
					{t('markdownEditor.status.auto')}
				</span>
			);
	}
}

function wrapSelection(
	view: import('@codemirror/view').EditorView,
	before: string,
	after: string,
	placeholder?: string
) {
	const { from, to } = view.state.selection.main;
	const selected = view.state.sliceDoc(from, to);
	const text = selected || placeholder || '';
	view.dispatch({
		changes: { from, to, insert: `${before}${text}${after}` },
		selection: {
			anchor: from + before.length,
			head: from + before.length + text.length,
		},
	});
	view.focus();
}

const FORMAT_ACTIONS = [
	{ labelKey: 'markdownEditor.actions.bold', icon: Bold, key: 'bold' },
	{ labelKey: 'markdownEditor.actions.italic', icon: Italic, key: 'italic' },
	{
		labelKey: 'markdownEditor.actions.strikethrough',
		icon: Strikethrough,
		key: 'strikethrough',
	},
	{
		labelKey: 'markdownEditor.actions.underline',
		icon: Underline,
		key: 'underline',
	},
	{ labelKey: 'markdownEditor.actions.link', icon: Link, key: 'link' },
	{ labelKey: 'markdownEditor.actions.image', icon: ImageIcon, key: 'image' },
] as const;

type FormatKey = (typeof FORMAT_ACTIONS)[number]['key'];

function FormatToolbar({ onAction }: { onAction: (key: FormatKey) => void }) {
	const { t } = useTranslation();

	return (
		<div className="flex items-center gap-0.5 px-1 py-0.5 select-none">
			{FORMAT_ACTIONS.map(({ labelKey, icon: Icon, key }) => {
				const label = t(labelKey);
				return (
					<MenuItem
						key={key}
						aria-label={label}
						title={label}
						className="inline-flex size-7 items-center justify-center rounded-sm
							p-0"
						onClick={() => onAction(key)}
					>
						<Icon className="size-3.5" />
					</MenuItem>
				);
			})}
		</div>
	);
}
export function MarkdownEditor({
	encoding,
	mode,
	onChange,
	onCursorChange,
	onSave,
	onToggleMode,
	remoteCursor,
	saveMode,
	saveStatus,
	syncLoading,
	title,
	filePath,
	rootPath,
	fontSize,

	value,
}: MarkdownEditorProps) {
	const { t } = useTranslation();
	const { editorRef, viewRef } = useEditor({
		fontSize,
		onChange,
		onCursorChange: (line, col, cursorIndex) => {
			setCursorPos({ line, col });
			onCursorChange?.(line, col, cursorIndex);
		},
		onSave,
		remoteCursor,
		syncLoading,
		title,
		value,
	});
	const characterCount = Array.from(value).length;
	const lineEnding = !value.includes('\r')
		? 'LF'
		: value.includes('\r\n')
			? 'CRLF'
			: 'CR';
	const [gutterWidth, setGutterWidth] = useState(0);
	const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

	useEffect(() => {
		if (!editorRef.current) return;
		const getWidth = () => {
			const gutters =
				editorRef.current?.querySelector<HTMLElement>('.cm-gutters');
			if (gutters) setGutterWidth(gutters.getBoundingClientRect().width);
		};
		getWidth();
		const observer = new ResizeObserver(getWidth);
		const gutters = editorRef.current.querySelector<HTMLElement>('.cm-gutters');
		if (gutters) observer.observe(gutters);
		return () => observer.disconnect();
	}, [editorRef]);

	const handleCut = () => {
		const view = viewRef.current;
		if (!view) return;
		const { from, to } = view.state.selection.main;
		const selection = view.state.sliceDoc(from, to);
		if (selection) {
			void navigator.clipboard.writeText(selection);
			view.dispatch({ changes: { from, to, insert: '' } });
		}
	};

	const handleCopy = () => {
		const view = viewRef.current;
		if (!view) return;
		const { from, to } = view.state.selection.main;
		const selection = view.state.sliceDoc(from, to);
		if (selection) void navigator.clipboard.writeText(selection);
	};

	const handlePaste = async () => {
		const view = viewRef.current;
		if (!view) return;
		const text = await navigator.clipboard.readText();
		const { from, to } = view.state.selection.main;
		view.dispatch({
			changes: { from, to, insert: text },
			selection: { anchor: from + text.length },
		});
		view.focus();
	};

	const handleBold = () => {
		const view = viewRef.current;
		if (!view) return;
		wrapSelection(view, '**', '**', t('markdownEditor.placeholders.bold'));
	};

	const handleItalic = () => {
		const view = viewRef.current;
		if (!view) return;
		wrapSelection(view, '*', '*', t('markdownEditor.placeholders.italic'));
	};

	const handleStrikethrough = () => {
		const view = viewRef.current;
		if (!view) return;
		wrapSelection(
			view,
			'~~',
			'~~',
			t('markdownEditor.placeholders.strikethrough')
		);
	};

	const handleUnderline = () => {
		const view = viewRef.current;
		if (!view) return;
		wrapSelection(
			view,
			'<u>',
			'</u>',
			t('markdownEditor.placeholders.underline')
		);
	};

	const handleLink = () => {
		const view = viewRef.current;
		if (!view) return;
		const { from, to } = view.state.selection.main;
		const selected = view.state.sliceDoc(from, to);
		const text = selected || t('markdownEditor.placeholders.link');
		const insert = `[${text}](url)`;
		view.dispatch({
			changes: { from, to, insert },
			selection: {
				anchor: from + text.length + 3,
				head: from + insert.length - 1,
			},
		});
		view.focus();
	};

	const handleImage = () => {
		const view = viewRef.current;
		if (!view) return;
		const { from, to } = view.state.selection.main;
		const selected = view.state.sliceDoc(from, to);
		const alt = selected || t('markdownEditor.placeholders.image');
		const insert = `![${alt}](url)`;
		view.dispatch({
			changes: { from, to, insert },
			selection: {
				anchor: from + alt.length + 4,
				head: from + insert.length - 1,
			},
		});
		view.focus();
	};

	const handleFormatAction = (key: FormatKey) => {
		({
			bold: handleBold,
			italic: handleItalic,
			strikethrough: handleStrikethrough,
			underline: handleUnderline,
			link: handleLink,
			image: handleImage,
		})[key]();
	};

	return (
		<div
			className="flex h-full min-h-72 flex-col overflow-hidden
				bg-[color-mix(in_oklab,var(--color-primary)_2%,transparent)]"
		>
			<ContextMenuRoot>
				<ContextMenuTrigger
					className="relative min-h-0 flex-1"
					hidden={mode !== 'edit'}
				>
					{gutterWidth > 0 && (
						<div
							className="absolute top-0 bottom-0 w-px bg-border
								pointer-events-none z-10"
							style={{ left: gutterWidth }}
						/>
					)}
					<div
						className="overflow-auto size-full min-h-0 h-full"
						data-os-scroll
						data-slot="editor-scroll"
					>
						<div className="h-full" ref={editorRef} />
					</div>
				</ContextMenuTrigger>
				<ContextMenuPopup align="start" sideOffset={6}>
					<MenuItem onClick={handleCut}>
						<Scissors />
						{t('common.actions.cut')}
					</MenuItem>
					<MenuItem onClick={handleCopy}>
						<Copy />
						{t('common.actions.copy')}
					</MenuItem>
					<MenuItem onClick={() => void handlePaste()}>
						<Clipboard />
						{t('common.actions.paste')}
					</MenuItem>
					<MenuSeparator />
					<FormatToolbar onAction={handleFormatAction} />
				</ContextMenuPopup>
			</ContextMenuRoot>
			{mode === 'preview' ? (
				<MarkdownPreview
					className="min-h-0 flex-1"
					content={value}
					filePath={filePath}
					rootPath={rootPath}
				/>
			) : null}
			<div className={explorerEditorStatusBarClassName}>
				<div
					className={`flex min-w-0 items-center gap-2 leading-none
						text-muted-foreground${mode === 'preview' ? ' invisible' : ''}`}
				>
					{saveStatus === 'saving' ? (
						<Spinner className="size-3.5 shrink-0 flex-none text-primary" />
					) : null}
					<span className="truncate flex items-center">
						{getSaveStatusNode(saveStatus, saveMode, t)}
					</span>
				</div>
				<div
					className="flex shrink-0 items-center gap-3 text-muted-foreground
						tabular-nums"
				>
					<span className={mode === 'preview' ? 'invisible' : ''}>
						{t('markdownEditor.cursor.lineCol', {
							line: cursorPos.line,
							col: cursorPos.col,
						})}
					</span>
					<span className={mode === 'preview' ? 'invisible' : ''}>
						{t('markdownEditor.cursor.characters', {
							count: characterCount,
						})}
					</span>
					<span className={mode === 'preview' ? 'invisible' : ''}>
						{encoding ?? '-'}
					</span>
					<span className={mode === 'preview' ? 'invisible' : ''}>
						{lineEnding}
					</span>
					{onToggleMode && (
						<button
							onClick={onToggleMode}
							className="flex size-5 items-center justify-center rounded
								hover:bg-muted-foreground/20"
							title={
								mode === 'edit'
									? t('markdownEditor.toggle.preview')
									: t('markdownEditor.toggle.edit')
							}
							type="button"
						>
							{mode === 'edit' ? (
								<Eye className="size-3.5" />
							) : (
								<EyeOff className="size-3.5" />
							)}
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
