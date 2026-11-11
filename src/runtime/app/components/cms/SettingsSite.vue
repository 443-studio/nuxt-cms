<template>
   <KSkeletonForm v-if="!loaded" :fields="4" :columns="2" />

   <KForm v-else :id="formId" :form="form" class="cms-stack is-loose">
      <KSettingsGroup
         label="Search results"
         description="How the pages of the site show up in search engines and browser tabs."
      >
         <template v-if="multilingual" #actions>
            <CmsLocaleSwitch v-model="locale" :progress="progress" />
         </template>
         <div class="cms-stack">
            <div class="cms-form-grid">
               <KFormField label="Site name" name="name">
                  <CmsTranslatableField v-model="state.name" :field="NAME_FIELD" :locale="locale" />
               </KFormField>
               <KFormField
                  label="Title template"
                  name="titleTemplate"
                  :description="`${TITLE_PLACEHOLDER} is the page title, ${SITE_NAME_PLACEHOLDER} the site name.`"
               >
                  <KInput v-model="titleTemplate" :placeholder="DEFAULT_TITLE_TEMPLATE" />
               </KFormField>
            </div>
            <KFormField
               label="Default description"
               name="description"
               description="Used by the pages that have no description of their own."
            >
               <CmsTranslatableField
                  v-model="state.description"
                  :field="DESCRIPTION_FIELD"
                  :locale="locale"
               />
            </KFormField>
         </div>
      </KSettingsGroup>

      <KSettingsGroup
         label="Share image"
         description="Shown when a page without its own image is shared. 1200 x 630 pixels works best."
      >
         <CmsMediaField v-model="state.image" media-type="image" />
      </KSettingsGroup>

      <KSettingsGroup
         row
         label="Hide the site from search engines"
         description="Every page is sent with noindex and the sitemap is empty. For a staging site or one not launched yet."
      >
         <template #actions>
            <KSwitch v-model="state.hidden" aria-label="Hide the site from search engines" />
         </template>
      </KSettingsGroup>
   </KForm>
</template>

<script setup lang="ts">
import type { CmsSiteSettings, FieldConfig } from '#nuxt-cms'
import {
   DEFAULT_TITLE_TEMPLATE,
   EMPTY_SITE_SETTINGS,
   SITE_NAME_PLACEHOLDER,
   TITLE_PLACEHOLDER,
   titleTemplateErrors,
} from '#nuxt-cms'
import {
   Form as KForm,
   FormField as KFormField,
   Input as KInput,
   SettingsGroup as KSettingsGroup,
   SkeletonForm as KSkeletonForm,
   Switch as KSwitch,
   toast,
   useForm,
} from '@xleddyl/443-components-vue'
import { computed, onMounted, ref } from '#imports'
import { translationProgress } from '../../../shared/translations'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { useCmsSettingsForm } from '../../composables/cms-settings-form'
import { cmsApi } from '../../utils/api'
import { errorMessage } from '../../utils/ui'

const NAME_FIELD: FieldConfig = { label: 'Site name', type: 'text' }
const DESCRIPTION_FIELD: FieldConfig = {
   label: 'Default description',
   type: 'text',
   textarea: true,
}
const PROGRESS_FIELDS: Record<string, FieldConfig> = {
   name: { ...NAME_FIELD, translatable: true },
   description: { ...DESCRIPTION_FIELD, translatable: true },
}
const ENDPOINT = '/api/cms/site'

const { i18n } = useCmsRuntime()

const multilingual = i18n.locales.length > 1
const locale = ref(i18n.defaultLocale)
const loaded = ref(false)
const state = ref<CmsSiteSettings>({ ...EMPTY_SITE_SETTINGS })

const titleTemplate = computed<string | number | null | undefined>({
   get: () => state.value.titleTemplate ?? '',
   set: (value) => {
      state.value.titleTemplate = value == null || value === '' ? null : String(value)
   },
})

const progress = computed(() =>
   translationProgress(PROGRESS_FIELDS, state.value as unknown as Record<string, unknown>, i18n)
)

const form = useForm({
   values: state,
   schema: {
      titleTemplate: {
         validate: (value: string | null) => {
            const template = value?.trim()
            return template ? titleTemplateErrors(template)[0] : undefined
         },
      },
   },
   onSubmit: async (values) => {
      const saved = await cmsApi<CmsSiteSettings>(ENDPOINT, { method: 'PUT', body: values })
      form.reset({ ...EMPTY_SITE_SETTINGS, ...saved })
      toast.success('Site settings saved')
   },
})

const formId = useCmsSettingsForm({ submitting: form.submitting, enabled: loaded })

onMounted(async () => {
   try {
      form.reset({ ...EMPTY_SITE_SETTINGS, ...(await cmsApi<CmsSiteSettings>(ENDPOINT)) })
      loaded.value = true
   } catch (error) {
      toast.error('Site settings not loaded', { description: errorMessage(error) })
   }
})
</script>
