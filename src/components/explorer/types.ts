export type ExplorerNodeKind = "directory" | "file";
export type ExplorerFileKind = "image" | "markdown" | "text";

export type ExplorerNode = {
  name: string;
  path: string;
  relativePath: string;
  kind: ExplorerNodeKind;
  fileKind: ExplorerFileKind | null;
  hasChildren: boolean;
  loaded: boolean;
  children: ExplorerNode[];
};

export type FilePreview = {
  fileKind: ExplorerFileKind;
  content: string | null;
  imageDataUrl: string | null;
  size: number;
  truncated: boolean;
};
