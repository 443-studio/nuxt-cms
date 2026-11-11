<template>
   <KSpinner v-if="loading" />

   <template v-else>
      <KSettingsGroup
         label="Search results"
         description="How the pages of the site show up in search engines and browser tabs."
      >
         <template v-if="multilingual" #actions>
            <CmsLocaleSwitch v-model="locale" :progress="progress" />
         </template>
         <KGrid :columns="2">
            <KFormField label="Site name">
               <CmsTranslatableField v-model="state.name" :field="NAME_FIELD" :locale="locale" />
            </KFormField>
            <KFormField
               label="Title template"
               :description="`${TITLE_PLACEHOLDER} is the page title, ${SITE_NAME_PLACEHOLDER} the site name.`"
               :error="templateError"
            >
               <KInput v-model="titleTemplate" :placeholder="DEFAULT_TITLE_TEMPLATE" />
            </KFormField>
         </KGrid>
         <KFormField
            label="Default description"
            description="Used by the pages that have no description of their own."
         >
            <CmsTranslatableField
               v-model="state.description"
               :field="DESCRIPTION_FIELD"
               :locale="locale"
            />
         </KFormField>
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
         description="Every page gets noindex, robots.txt disallows everything and the sitemap is empty. For a staging site or one not launched yet."
      >
         <template #actions>
            <KSwitch v-model="state.hidden" aria-label="Hide the site from search engines" />
         </template>
      </KSettingsGroup>

      <KStack direction="row" justify="end" gap="sm">
         <KButton
            label="Save"
            size="sm"
            :loading="saving"
            :disabled="!dirty || !!templateError"
            @click="save"
         />
      </KStack>
   </template>
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
   Button as KButton,
   FormField as KFormField,
   Grid as KGrid,
   Input as KInput,
   SettingsGroup as KSettingsGroup,
   Spinner as KSpinner,
   Stack as KStack,
   Switch as KSwitch,
} from '@xleddyl/443-components-vue'
import { computed, onMounted, ref } from '#imports'
import { translationProgress } from '../../../shared/translations'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { useCmsToast } from '../../composables/cms-toast'
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
const toast = useCmsToast()

const multilingual = i18n.locales.length > 1
const locale = ref(i18n.defaultLocale)
const loading = ref(true)
const saving = ref(false)
const state = ref<CmsSiteSettings>({ ...EMPTY_SITE_SETTINGS })
const saved = ref(JSON.stringify(state.value))

const titleTemplate = computed<string | number | null | undefined>({
   get: () => state.value.titleTemplate ?? '',
   set: (value) => {
      state.value.titleTemplate = value == null || value === '' ? null : String(value)
   },
})

const templateError = computed(() => {
   const template = state.value.titleTemplate?.trim()
   return template ? titleTemplateErrors(template)[0] ?? false : false
})

const dirty = computed(() => JSON.stringify(state.value) !== saved.value)

const progress = computed(() =>
   translationProgress(PROGRESS_FIELDS, state.value as unknown as Record<string, unknown>, i18n)
)

function apply(settings: CmsSiteSettings) {
   state.value = { ...EMPTY_SITE_SETTINGS, ...settings }
   saved.value = JSON.stringify(state.value)
}

async function load() {
   try {
      apply(await cmsApi<CmsSiteSettings>(ENDPOINT))
   } catch (error) {
      toast.add({
         title: 'Site settings not loaded',
         description: errorMessage(error),
         color: 'error',
      })
   } finally {
      loading.value = false
   }
}

async function save() {
   saving.value = true
   try {
      apply(await cmsApi<CmsSiteSettings>(ENDPOINT, { method: 'PUT', body: state.value }))
      toast.add({ title: 'Site settings saved', color: 'success' })
   } catch (error) {
      toast.add({
         title: 'Site settings not saved',
         description: errorMessage(error),
         color: 'error',
      })
   } finally {
      saving.value = false
   }
}

onMounted(load)
</script>
