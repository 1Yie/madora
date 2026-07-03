export type EditorFileKind = 'markdown' | 'text' | 'image' | 'other';

export type EditorNodeKind = 'directory' | 'file';

export interface EditorNode {
	children: EditorNode[];
	fileKind: EditorFileKind | null;
	hasChildren: boolean;
	id: string;
	kind: EditorNodeKind;
	loaded: boolean;
	name: string;
	path: string;
	relativePath: string;
}

export interface EditorDocument {
	content: string;
	fileKind: EditorFileKind;
	id: string;
	path: string;
	readOnly: boolean;
	relativePath: string;
	title: string;
	updatedAt: number;
}

export type EditorWorkspaceSource =
	| {
			kind: 'empty';
	  }
	| {
			kind: 'file';
			name: string;
			uri: string;
	  }
	| {
			kind: 'directory';
			name: string;
			uri: string;
	  }
	| {
			kind: 'remote';
			name: string;
			uri: string;
	  };
