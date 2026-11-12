import { computed, shallowRef } from '#imports'
import type { CmsClipboardNotice } from '../../shared/clipboard'
import { clipboardText, parseClipboardText } from '../../shared/clipboard'
import type { CmsBlockValue } from '../../shared/preview'
import { showCmsNotice } from './cms-toast'

const memory = shallowRef<string | null>(null)

async function readSystemClipboard(): Promise<string | null> {
   try {
      return await navigator.clipboard.readText()
   } catch {
      return null
   }
}

export function useCmsClipboard() {
   const items = computed(() => parseClipboardText(memory.value))

   function copy(list: readonly CmsBlockValue[], event?: ClipboardEvent) {
      const text = clipboardText(list)
      memory.value = text
      if (event?.clipboardData) {
         event.clipboardData.setData('text/plain', text)
         event.preventDefault()
         return
      }
      void navigator.clipboard?.writeText(text).catch(() => {})
   }

   async function read(text?: string | null): Promise<CmsBlockValue[] | null> {
      const source = text === undefined ? await readSystemClipboard() : text
      const parsed = parseClipboardText(source)
      if (parsed) {
         memory.value = source
         return parsed
      }
      return items.value
   }

   function notify(notice: CmsClipboardNotice) {
      showCmsNotice(notice)
   }

   return { items, copy, read, notify }
}
