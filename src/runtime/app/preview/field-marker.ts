import type { Directive } from 'vue'
import { shallowRef } from '#imports'
import type { CmsPreviewTheme } from '../../shared/preview'

export const CMS_FIELD_ATTRIBUTE = 'data-cms-field'

export const cmsFieldMarking = shallowRef(false)

export const cmsPreviewEditable = shallowRef(false)

export const cmsPreviewTheme = shallowRef<CmsPreviewTheme>('system')

export function cmsTokenRoot(theme: CmsPreviewTheme) {
   return { class: 'k-root', 'data-preset': 'default', 'data-theme': theme }
}

function mark(element: HTMLElement, name: unknown) {
   if (!cmsFieldMarking.value) return
   if (typeof name === 'string' && name) element.setAttribute(CMS_FIELD_ATTRIBUTE, name)
   else element.removeAttribute(CMS_FIELD_ATTRIBUTE)
}

export const vCmsField: Directive<HTMLElement, string> = {
   mounted: (element, binding) => mark(element, binding.value),
   updated: (element, binding) => {
      if (binding.value !== binding.oldValue) mark(element, binding.value)
   },
   getSSRProps: () => ({}),
}
