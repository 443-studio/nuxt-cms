import type { CmsClipboardTarget, CmsShortcutTarget } from '../../shared/preview'
import { isApplePlatform } from '../../shared/preview'

const NON_TEXT_INPUTS = new Set([
   'checkbox',
   'radio',
   'button',
   'submit',
   'reset',
   'range',
   'color',
   'file',
   'image',
])

const INTERACTIVE_SELECTOR =
   'a[href], button, select, summary, [role="button"], [role="link"], [role="menuitem"], [role="option"], [role="tab"], [role="checkbox"], [role="switch"]'

const OVERLAY_SELECTOR = 'dialog, [popover], [role="dialog"], [role="alertdialog"], [role="menu"]'

function elementOf(target: EventTarget | null): HTMLElement | null {
   const node = target as Node | null
   if (!node || typeof node !== 'object' || !('nodeType' in node)) return null
   const element = node.nodeType === 1 ? (node as Element) : node.parentElement
   return element && 'isContentEditable' in element ? (element as HTMLElement) : null
}

export function isEditableTarget(target: EventTarget | null): boolean {
   const element = elementOf(target)
   if (!element) return false
   if (element.isContentEditable) return true
   const tag = element.tagName
   if (tag === 'TEXTAREA' || tag === 'SELECT') return true
   return tag === 'INPUT' && !NON_TEXT_INPUTS.has((element as HTMLInputElement).type)
}

export function shortcutTarget(event: KeyboardEvent, selected: boolean): CmsShortcutTarget {
   const element = elementOf(event.target)
   return {
      editable: isEditableTarget(event.target),
      interactive: !!element?.closest(INTERACTIVE_SELECTOR),
      selected,
   }
}

export function clipboardTarget(event: Event, selected: boolean): CmsClipboardTarget {
   const selection = typeof window === 'undefined' ? null : window.getSelection()
   return {
      editable: isEditableTarget(event.target),
      textSelected: !!selection && !selection.isCollapsed && selection.toString().trim() !== '',
      selected,
   }
}

export function isInForeignOverlay(target: EventTarget | null, root: Element | null): boolean {
   const overlay = elementOf(target)?.closest(OVERLAY_SELECTOR)
   return !!overlay && !(root && overlay.contains(root))
}

export function onApplePlatform(): boolean {
   return (
      typeof navigator !== 'undefined' && isApplePlatform(navigator.platform || navigator.userAgent)
   )
}
