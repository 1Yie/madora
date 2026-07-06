export type SaveMode = 'auto' | 'manual';
export type UnsavedPromptIntent = 'leave' | 'switch';

export function shouldPromptUnsavedAction({
	activeDocumentDirty,
	hasUnsavedDocuments,
	intent,
	saveMode,
	switchPromptAcknowledged,
}: {
	activeDocumentDirty: boolean;
	hasUnsavedDocuments: boolean;
	intent: UnsavedPromptIntent;
	saveMode: SaveMode;
	switchPromptAcknowledged: boolean;
}) {
	if (saveMode !== 'manual') return false;

	if (intent === 'switch') {
		return activeDocumentDirty && !switchPromptAcknowledged;
	}

	return hasUnsavedDocuments || activeDocumentDirty;
}
