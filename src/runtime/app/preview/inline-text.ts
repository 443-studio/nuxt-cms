import {
   CMS_INLINE_INPUT_DELAY,
   editableText,
   fitInlineInsertion,
   normalizeInlineText,
} from '../../shared/inline-text'
import { onApplePlatform } from '../utils/keyboard'

export interface CmsInlineTextOptions {
   multiline: boolean
   maxLength?: number
   point?: { x: number; y: number }
   onInput: (value: string, commit: boolean) => void
   onStop: (value: string) => void
}

export interface CmsInlineTextSession {
   element: HTMLElement
   stop: (commit: boolean) => void
}

let plaintextOnly: boolean | null = null

function supportsPlaintextOnly() {
   if (plaintextOnly !== null) return plaintextOnly
   const probe = document.createElement('div')
   try {
      probe.contentEditable = 'plaintext-only'
      plaintextOnly = probe.contentEditable === 'plaintext-only'
   } catch {
      plaintextOnly = false
   }
   return plaintextOnly
}

function caretAt(point: { x: number; y: number }): Range | null {
   const positioned = document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
   }
   const position = positioned.caretPositionFromPoint?.(point.x, point.y)
   if (position) {
      const range = document.createRange()
      range.setStart(position.offsetNode, position.offset)
      return range
   }
   return document.caretRangeFromPoint?.(point.x, point.y) ?? null
}

function placeCaret(element: HTMLElement, point: { x: number; y: number } | undefined) {
   const selection = window.getSelection()
   if (!selection) return
   const current = selection.rangeCount ? selection.getRangeAt(0) : null
   const kept =
      current && !current.collapsed && element.contains(current.commonAncestorContainer)
         ? current.cloneRange()
         : null
   element.focus({ preventScroll: true })
   const range = kept ?? (point ? caretAt(point) : null)
   if (range && element.contains(range.startContainer)) {
      selection.removeAllRanges()
      selection.addRange(range)
   } else {
      selection.selectAllChildren(element)
      selection.collapseToEnd()
   }
}

export function startInlineText(
   element: HTMLElement,
   options: CmsInlineTextOptions
): CmsInlineTextSession {
   const nodes = Array.from(element.childNodes)
   const values = nodes.map((node) => node.nodeValue)
   const read = () => normalizeInlineText(editableText(element), options.multiline)
   const initial = read()
   const native = supportsPlaintextOnly()
   let sent = initial
   let dirty = false
   let active = true
   let timer: ReturnType<typeof setTimeout> | undefined

   function flush() {
      clearTimeout(timer)
      timer = undefined
      const value = read()
      if (value === sent) return
      sent = value
      dirty = true
      options.onInput(value, false)
   }

   function onInput() {
      clearTimeout(timer)
      timer = setTimeout(flush, CMS_INLINE_INPUT_DELAY)
   }

   function onKeydown(event: KeyboardEvent) {
      if (event.isComposing) return
      const mod = onApplePlatform() ? event.metaKey : event.ctrlKey
      if (event.key === 'Escape') {
         event.preventDefault()
         event.stopPropagation()
         stop(false)
      } else if (event.key === 'Enter' && (!options.multiline || mod)) {
         event.preventDefault()
         event.stopPropagation()
         stop(true)
      } else if (mod && event.key.toLowerCase() === 's') {
         flush()
      }
   }

   function selectedLength() {
      const selection = window.getSelection()
      if (!selection?.rangeCount || !element.contains(selection.anchorNode)) return 0
      return selection.toString().length
   }

   function insertedText(event: InputEvent) {
      if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak')
         return '\n'
      return event.data ?? event.dataTransfer?.getData('text/plain') ?? ''
   }

   function limitInsertion(event: InputEvent) {
      const max = options.maxLength
      if (max === undefined || !event.inputType.startsWith('insert')) return
      const text = insertedText(event)
      const fitted = fitInlineInsertion(text, max - (read().length - selectedLength()))
      if (fitted === text) return
      event.preventDefault()
      if (fitted) document.execCommand('insertText', false, fitted)
   }

   function onBeforeInput(event: InputEvent) {
      const type = event.inputType
      if (type.startsWith('format')) event.preventDefault()
      else if (!options.multiline && (type === 'insertParagraph' || type === 'insertLineBreak'))
         event.preventDefault()
      else limitInsertion(event)
   }

   function onPaste(event: ClipboardEvent) {
      if (native) return
      event.preventDefault()
      const text = event.clipboardData?.getData('text/plain') ?? ''
      document.execCommand(
         'insertText',
         false,
         options.multiline ? text : normalizeInlineText(text, false)
      )
   }

   function onDrop(event: DragEvent) {
      event.preventDefault()
   }

   function onBlur() {
      stop(true)
   }

   function stop(commit: boolean) {
      if (!active) return
      active = false
      clearTimeout(timer)
      const value = commit ? read() : initial
      element.removeEventListener('input', onInput)
      element.removeEventListener('keydown', onKeydown)
      element.removeEventListener('beforeinput', onBeforeInput)
      element.removeEventListener('paste', onPaste)
      element.removeEventListener('drop', onDrop)
      element.removeEventListener('blur', onBlur)
      element.removeAttribute('contenteditable')
      element.removeAttribute('data-cms-editing')
      if (element.isConnected) {
         nodes.forEach((node, index) => {
            if (node.nodeValue !== values[index]) node.nodeValue = values[index] ?? null
         })
         element.replaceChildren(...nodes)
         if (document.activeElement === element) element.blur()
      }
      if (dirty || value !== initial) options.onInput(value, true)
      options.onStop(value)
   }

   element.setAttribute('contenteditable', native ? 'plaintext-only' : 'true')
   element.setAttribute('data-cms-editing', '')
   element.addEventListener('input', onInput)
   element.addEventListener('keydown', onKeydown)
   element.addEventListener('beforeinput', onBeforeInput)
   element.addEventListener('paste', onPaste)
   element.addEventListener('drop', onDrop)
   placeCaret(element, options.point)
   element.addEventListener('blur', onBlur)

   return { element, stop }
}
