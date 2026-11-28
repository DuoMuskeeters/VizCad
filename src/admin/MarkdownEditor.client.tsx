import { useEffect, useRef } from 'react'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView, keymap, placeholder as placeholderExt } from '@codemirror/view'
import { Bold, Code, Heading2, Image, Link2 } from 'lucide-react'
import { IconButton } from '#/components/ui/Button'

export type MarkdownEditorProps = {
  value: string
  onChange: (value: string) => void
  /** Accessible name of the editing area. */
  label: string
  labels: { readonly heading: string; readonly bold: string; readonly link: string; readonly image: string; readonly code: string; readonly toolbar: string }
  placeholder?: string
  /**
   * The image button: called with an `insert` that puts Markdown at the selection (the picker asks for the image and its
   * alt text first). Without it, the button wraps the selection in a bare image template.
   */
  onImage?: (insert: (markdown: string) => void) => void
}

/** Theme from the app's tokens (CSS variables), so light and dark follow the page; no inline styles. */
const theme = EditorView.theme({
  // Font size comes from the wrapper: 15 px, and 16 px on touch screens so iOS does not zoom on focus.
  '&': { backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 'inherit' },
  '.cm-content': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', padding: '12px 0', caretColor: 'var(--color-text)', minHeight: '24rem' },
  '.cm-line': { padding: '0 12px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor': { borderLeftColor: 'var(--color-text)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'var(--color-accent-soft)' },
  '.cm-placeholder': { color: 'var(--color-text-3)' },
})

type Edit = (view: EditorView) => void

/** Wraps the selection (or inserts a placeholder) with `before`/`after`, keeping the inner text selected. */
const wrap = (before: string, after: string, fallback: string): Edit => (view) => {
  view.dispatch(
    view.state.changeByRange((range) => {
      const inner = view.state.sliceDoc(range.from, range.to) || fallback
      const insert = `${before}${inner}${after}`
      return { changes: { from: range.from, to: range.to, insert }, range: EditorSelection.range(range.from + before.length, range.from + before.length + inner.length) }
    }),
  )
  view.focus()
}

/** Puts `prefix` at the start of every selected line. */
const linePrefix = (prefix: string): Edit => (view) => {
  const changes = []
  for (const range of view.state.selection.ranges) {
    for (let pos = range.from; pos <= range.to; ) {
      const line = view.state.doc.lineAt(pos)
      if (!line.text.startsWith(prefix)) changes.push({ from: line.from, insert: prefix })
      pos = line.to + 1
    }
  }
  view.dispatch({ changes })
  view.focus()
}

/**
 * The post text editor (docs/12 §4.1): CodeMirror 6 in Markdown mode, loaded only in the admin chunk. Toolbar: heading,
 * bold, link, image, code. The preview is the server's renderer (`previewDraft`), never a client one.
 */
/** Replaces the selection with `text` and puts the cursor after it. */
const insertText = (view: EditorView, text: string) => {
  view.dispatch(view.state.replaceSelection(text))
  view.focus()
}

export default function MarkdownEditor({ value, onChange, label, labels, placeholder, onImage }: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const latest = useRef(onChange)
  latest.current = onChange

  useEffect(() => {
    if (!host.current) return
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          markdown(),
          EditorView.lineWrapping,
          theme,
          placeholderExt(placeholder ?? ''),
          EditorView.contentAttributes.of({ 'aria-label': label, 'aria-multiline': 'true', spellcheck: 'true' }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) latest.current(update.state.doc.toString())
          }),
        ],
      }),
    })
    view.current = editor
    return () => {
      editor.destroy()
      view.current = null
    }
    // Created once; outside value changes are applied by the effect below.
  }, [])

  // A new value from outside (another locale tab, a reload) replaces the document.
  useEffect(() => {
    const editor = view.current
    if (editor && editor.state.doc.toString() !== value) editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } })
  }, [value])

  const run = (edit: Edit) => () => {
    if (view.current) edit(view.current)
  }

  return (
    <div className="overflow-hidden rounded-md border border-line-strong text-[15px] focus-within:border-accent pointer-coarse:text-base">
      <div role="toolbar" aria-label={labels.toolbar} className="flex flex-wrap gap-0.5 border-b border-line bg-surface px-1 py-0.5">
        <IconButton label={labels.heading} onClick={run(linePrefix('## '))}>
          <Heading2 aria-hidden className="size-4" />
        </IconButton>
        <IconButton label={labels.bold} onClick={run(wrap('**', '**', 'text'))}>
          <Bold aria-hidden className="size-4" />
        </IconButton>
        <IconButton label={labels.link} onClick={run(wrap('[', '](https://)', 'link'))}>
          <Link2 aria-hidden className="size-4" />
        </IconButton>
        <IconButton
          label={labels.image}
          onClick={
            onImage === undefined
              ? run(wrap('![', '](/api/blog/image/)', 'alt text'))
              : () => onImage((markdown) => (view.current ? insertText(view.current, markdown) : undefined))
          }
        >
          <Image aria-hidden className="size-4" />
        </IconButton>
        <IconButton label={labels.code} onClick={run(wrap('`', '`', 'code'))}>
          <Code aria-hidden className="size-4" />
        </IconButton>
      </div>
      <div ref={host} />
    </div>
  )
}
