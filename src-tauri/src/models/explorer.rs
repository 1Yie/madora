use serde::Serialize;

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ExplorerNodeKind {
    Directory,
    File,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ExplorerFileKind {
    Image,
    Markdown,
    Text,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerNode {
    pub name: String,
    pub path: String,
    pub relative_path: String,
    pub kind: ExplorerNodeKind,
    pub file_kind: Option<ExplorerFileKind>,
    pub has_children: bool,
    pub loaded: bool,
    pub children: Vec<ExplorerNode>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePreview {
    pub file_kind: ExplorerFileKind,
    pub content: Option<String>,
    pub image_data_url: Option<String>,
    pub size: u64,
    pub truncated: bool,
}
