import type { FunctionalComponent } from 'vue'
import { h, markRaw } from 'vue'
import { useConfirm } from '@xleddyl/443-components-vue'
import CmsConfirmGroups from '../components/cms/ConfirmGroups.vue'

export interface CmsConfirmLink {
   title: string
   meta: string
   to: string
}

export interface CmsConfirmGroup {
   title: string
   links: CmsConfirmLink[]
   note?: string
}

export interface CmsConfirmOptions {
   title: string
   description?: string
   confirmLabel?: string
   groups?: CmsConfirmGroup[]
}

export function useCmsConfirm() {
   const confirm = useConfirm()
   return (options: CmsConfirmOptions) => {
      const groups = options.groups
      const body: FunctionalComponent | undefined = groups?.length
         ? (_props, { attrs }) => h(CmsConfirmGroups, { ...attrs, groups })
         : undefined
      return confirm.delete(options.title, {
         description: options.description,
         confirmLabel: options.confirmLabel,
         body: body ? markRaw(body) : undefined,
      })
   }
}
