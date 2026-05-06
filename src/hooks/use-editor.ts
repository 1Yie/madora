import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useEffectEvent, useRef } from "react";

type UseEditorOptions = {
  onChange?: (value: string) => void;
  value: string;
};

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "transparent",
    color: "var(--color-foreground)",
    fontSize: "0.875rem",
  },
  ".cm-scroller": {
    fontFamily:
      '"Geist Variable", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    lineHeight: "1.7",
  },
  ".cm-content": {
    minHeight: "100%",
    padding: "1rem 1.25rem",
  },
  ".cm-line": {
    padding: "0",
  },
  ".cm-gutters": {
    minHeight: "100%",
    border: "none",
    backgroundColor: "transparent",
    color: "var(--color-muted-foreground)",
  },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in oklab, var(--color-muted) 72%, transparent)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--color-primary)",
  },
  "&.cm-focused": {
    outline: "none",
  },
}, {
  dark: true,
});

export function useEditor({ onChange, value }: UseEditorOptions) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  const handleChange = useEffectEvent((nextValue: string) => {
    onChange?.(nextValue);
  });

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }

    const view = new EditorView({
      parent: editorRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          markdown(),
          EditorView.lineWrapping,
          editorTheme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              handleChange(update.state.doc.toString());
            }
          }),
        ],
      }),
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;

    if (!view) {
      return;
    }

    const currentValue = view.state.doc.toString();

    if (currentValue === value) {
      return;
    }

    view.dispatch({
      changes: {
        from: 0,
        to: currentValue.length,
        insert: value,
      },
    });
  }, [value]);

  return editorRef;
}
