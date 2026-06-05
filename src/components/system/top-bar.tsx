import {
	destroyWindow,
	minimizeWindow,
	onCloseRequested,
	toggleMaximizeWindow,
} from '@/invoke/window';
import { X, Square, Minus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { SettingsDialog } from '@/components/system/settings-dialog';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogPopup,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from '@/components/ui/dialog';
import { showErrorToast } from '@/components/ui/toast';
import {
	clearStoredMarkdownDrafts,
	hasUnsaved,
	saveAll,
} from '@/lib/unsaved-registry';

function getSaveFailureMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	return '关闭前保存失败';
}

export default function Titlebar() {
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [savingBeforeClose, setSavingBeforeClose] = useState(false);
	const bypassCloseGuardRef = useRef(false);

	const closeWindow = useCallback(async () => {
		bypassCloseGuardRef.current = true;
		try {
			await destroyWindow();
		} finally {
			window.setTimeout(() => {
				bypassCloseGuardRef.current = false;
			}, 0);
		}
	}, []);

	const requestClose = useCallback(async () => {
		if (savingBeforeClose) return;
		if (hasUnsaved()) {
			setConfirmOpen(true);
			return;
		}
		await closeWindow();
	}, [closeWindow, savingBeforeClose]);

	const handleSaveAndClose = useCallback(async () => {
		if (savingBeforeClose) return;
		setSavingBeforeClose(true);
		try {
			const results = await saveAll();
			const failed = results.filter((r) => !r.ok);

			if (failed.length > 0) {
				const firstError = failed[0]?.error;
				showErrorToast('关闭前保存失败', getSaveFailureMessage(firstError));
			}

			if (!hasUnsaved()) {
				setConfirmOpen(false);
				await closeWindow();
				return;
			}

			showErrorToast(
				'关闭前仍有未保存内容',
				'请重试保存，或选择不保存并关闭。'
			);
		} finally {
			setSavingBeforeClose(false);
		}
	}, [closeWindow, savingBeforeClose]);

	const handleDiscardAndClose = useCallback(async () => {
		clearStoredMarkdownDrafts();
		setConfirmOpen(false);
		await closeWindow();
	}, [closeWindow]);

	const requestCloseRef = useRef(requestClose);
	useEffect(() => {
		requestCloseRef.current = requestClose;
	}, [requestClose]);

	useEffect(() => {
		let active = true;

		const bindCloseListener = async () => {
			const unlisten = await onCloseRequested(async (event) => {
				if (bypassCloseGuardRef.current) return;
				event.preventDefault();
				await requestCloseRef.current();
			});

			if (!active) unlisten();
			return unlisten;
		};

		const unlistenPromise = bindCloseListener();

		return () => {
			active = false;
			void unlistenPromise.then((unlisten) => unlisten?.());
		};
	}, []);

	return (
		<>
			<div
				data-tauri-drag-region
				className="flex h-9 items-center justify-between border-b border-border
					bg-muted/80 text-foreground select-none z-50"
			>
				<div className="flex items-center ml-4 gap-2 pointer-events-none">
					<span className="text-sm font-medium text-muted-foreground">
						Madora
					</span>
				</div>
				<div className="flex items-center h-full">
					<SettingsDialog />
					<button
						type="button"
						onClick={() => void minimizeWindow()}
						className="flex h-full items-center px-3 text-muted-foreground
							transition-colors hover:bg-accent hover:text-accent-foreground"
					>
						<Minus size={14} />
					</button>
					<button
						type="button"
						onClick={() => void toggleMaximizeWindow()}
						className="flex h-full items-center px-3 text-muted-foreground
							transition-colors hover:bg-accent hover:text-accent-foreground"
					>
						<Square size={12} />
					</button>
					<button
						type="button"
						onClick={() => void requestClose()}
						className="group flex h-full items-center px-3 text-muted-foreground
							transition-colors hover:bg-red-500/80 hover:text-white"
					>
						<X size={14} className="group-hover:text-white" />
					</button>
				</div>
			</div>
			<Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<DialogPopup showCloseButton={false} className="max-w-md">
					<DialogHeader>
						<DialogTitle>工作区还有文档未保存</DialogTitle>
						<DialogDescription>
							{savingBeforeClose
								? '正在保存未完成的修改...'
								: '关闭窗口前请选择：先保存修改，或放弃这些未保存的内容。'}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							disabled={savingBeforeClose}
							variant="outline"
							onClick={() => setConfirmOpen(false)}
						>
							取消
						</Button>
						<Button
							disabled={savingBeforeClose}
							variant="destructive-outline"
							onClick={() => void handleDiscardAndClose()}
						>
							不保存并关闭
						</Button>
						<Button
							loading={savingBeforeClose}
							onClick={() => void handleSaveAndClose()}
						>
							保存并关闭
						</Button>
					</DialogFooter>
				</DialogPopup>
			</Dialog>
		</>
	);
}
