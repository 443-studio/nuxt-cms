import type { CmsConfig, CmsEntry } from '#nuxt-cms'
import type { FormErrors } from '@xleddyl/443-components-vue'
import { useForm } from '@xleddyl/443-components-vue'
import type { MaybeRefOrGetter, Ref } from 'vue'
import { computed, toValue } from '#imports'
import cmsConfig from '#cms-config'
import { buildEntrySchema, entryValidationWarnings } from '../../shared/validation'
import { useCmsRuntime } from './cms-runtime'

export interface CmsEntryFormOptions {
   state: Ref<Record<string, unknown>>
   fields: MaybeRefOrGetter<CmsEntry['fields']>
   entryName?: MaybeRefOrGetter<string | undefined>
   drafts?: MaybeRefOrGetter<boolean | undefined>
   path?: MaybeRefOrGetter<string | undefined>
   onSubmit: (values: Record<string, unknown>) => unknown
   onInvalid?: (errors: FormErrors) => unknown
   guard?: boolean
}

export function useCmsEntryForm(options: CmsEntryFormOptions) {
   const { i18n } = useCmsRuntime()

   const validate = computed(() => {
      const name = toValue(options.entryName)
      return name ? (cmsConfig as CmsConfig)[name]?.validate : undefined
   })

   const schema = computed(() =>
      buildEntrySchema(
         {
            fields: toValue(options.fields),
            drafts: toValue(options.drafts),
            validate: validate.value,
            path: toValue(options.path),
            config: cmsConfig as CmsConfig,
         },
         i18n
      )
   )

   function warnings(values: Record<string, unknown>) {
      return entryValidationWarnings(
         { fields: toValue(options.fields), validate: validate.value },
         values,
         i18n,
         toValue(options.path)
      )
   }

   return useForm({
      values: options.state,
      validator: schema,
      warnings,
      onSubmit: options.onSubmit,
      onInvalid: options.onInvalid,
      guard: options.guard,
   })
}

export type CmsEntryForm = ReturnType<typeof useCmsEntryForm>
