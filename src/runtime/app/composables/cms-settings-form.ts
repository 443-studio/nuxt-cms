import type { MaybeRefOrGetter, Ref } from 'vue'
import { onBeforeUnmount, onMounted, toValue, useId, useState, watch } from '#imports'

export interface CmsSettingsFormAction {
   id: string
   label: string
   submitting: boolean
}

export function useCmsSettingsFormAction() {
   return useState<CmsSettingsFormAction | null>('cms-settings-form-action', () => null)
}

export function useCmsSettingsForm(options: {
   creating?: MaybeRefOrGetter<boolean>
   label?: MaybeRefOrGetter<string>
   submitting: Ref<boolean>
   enabled?: MaybeRefOrGetter<boolean>
}) {
   const id = useId()
   const action = useCmsSettingsFormAction()

   function label() {
      if (options.label !== undefined) return toValue(options.label)
      return toValue(options.creating) ? 'Create' : 'Save'
   }

   function sync() {
      const enabled = toValue(options.enabled) ?? true
      if (enabled) {
         action.value = { id, label: label(), submitting: options.submitting.value }
      } else if (action.value?.id === id) {
         action.value = null
      }
   }

   onMounted(() => {
      watch(() => [label(), options.submitting.value, toValue(options.enabled)], sync, {
         immediate: true,
      })
   })

   onBeforeUnmount(() => {
      if (action.value?.id === id) action.value = null
   })

   return id
}
