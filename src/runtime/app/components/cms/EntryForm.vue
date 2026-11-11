<template>
   <KForm
      :id="formId"
      ref="formRef"
      :form="form"
      :focus-on-error="false"
      :disabled="lock ? true : undefined"
      class="cms-form"
   >
      <KAlert v-if="lock" tone="neutral" :icon="cmsIcon('lock-closed')" :title="lock" />
      <component :is="tabbed ? KTabs : 'div'" v-bind="tabsBinding" class="cms-form-body">
         <template #[panelSlot]>
            <CmsFormSections ref="sectionsRef" :layout="layout" :shown="isShown">
               <template #field="{ fieldKey: key }">
                  <KFormField
                     :name="key"
                     :label="fields[key]!.label"
                     :description="fields[key]!.description"
                     :icon="cmsIcon(fieldIcon(fields[key]!))"
                     :required="fields[key]!.required"
                     :disabled="locked.includes(key) || undefined"
                     :data-cms-field="key"
                     :class="{ 'cms-search-focus': highlighted === key }"
                  >
                     <template
                        v-if="hasLocaleSwitch(fields[key]!) && i18n.locales.length > 1"
                        #label-actions
                     >
                        <CmsLocaleSwitch
                           :model-value="localeFor(key)"
                           :progress="fieldProgress(key)"
                           @update:model-value="(locale: string) => setLocale(key, locale)"
                        />
                     </template>
                     <CmsFieldInput
                        v-model="state[key]"
                        :field="fields[key]!"
                        :locale="localeFor(key)"
                        :slug-source="slugSource(fields[key]!)"
                        :entry-name="entryName"
                        :field-key="key"
                     />
                  </KFormField>
               </template>
            </CmsFormSections>
         </template>
      </component>
      <KStack v-if="footer && !lock" direction="row" justify="end" gap="sm">
         <KButton type="submit" label="Save" :loading="loading" />
         <KButton
            v-if="drafts && canPublish"
            type="submit"
            :label="published ? 'Make draft' : 'Publish'"
            :loading="loading"
            @click="togglePublished"
         />
      </KStack>
   </KForm>
</template>

<script setup lang="ts">
import type { CmsConfig, CmsEntry, CmsFormLayout, CmsTab, FieldConfig } from '#nuxt-cms'
import {
   fieldTab,
   hasTranslatableBlockFields,
   isFieldVisible,
   isLocalizedLinkField,
   isTranslatableField,
   resolveFormLayout,
   slugSourceValue,
} from '#nuxt-cms'
import type { FormErrors } from '@xleddyl/443-components-vue'
import {
   Alert as KAlert,
   Button as KButton,
   Form as KForm,
   FormField as KFormField,
   Stack as KStack,
   Tabs as KTabs,
   useForm,
} from '@xleddyl/443-components-vue'
import { computed, nextTick, onMounted, ref, watch } from '#imports'
import cmsConfig from '#cms-config'
import type { CmsSearchFocus } from '../../../shared/search'
import { translationProgress } from '../../../shared/translations'
import { buildEntrySchema, entryValidationWarnings } from '../../../shared/validation'
import { useCmsFieldFocus } from '../../composables/cms-field-focus'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { entryFormLayout, useCmsSettingsState } from '../../composables/cms-settings'
import type { CmsResponseIssue } from '../../utils/ui'
import { cmsIcon, fieldIcon } from '../../utils/ui'

const props = withDefaults(
   defineProps<{
      fields: CmsEntry['fields']
      tabs?: CmsTab[]
      entryName?: string
      drafts?: boolean
      loading?: boolean
      formId?: string
      footer?: boolean
      focus?: CmsSearchFocus | null
      path?: string
      lock?: string | null
      canPublish?: boolean
      locked?: string[]
   }>(),
   { footer: true, lock: null, canPublish: true, locked: () => [] }
)

const state = defineModel<Record<string, unknown>>({ required: true })

const emit = defineEmits<{ submit: []; error: [] }>()

const { i18n } = useCmsRuntime()

const activeLocale = ref<Record<string, string>>({})

const tabList = computed(() => props.tabs ?? [])

const activeTab = ref(tabList.value[0]?.id ?? '')

watch(tabList, (tabs) => {
   if (!tabs.some((tab) => tab.id === activeTab.value)) activeTab.value = tabs[0]?.id ?? ''
})

const tabbed = computed(() => tabList.value.length > 1)

const panelSlot = computed(() => (tabbed.value ? 'panel' : 'default'))

const tabsBinding = computed(() =>
   tabbed.value
      ? {
           items: tabList.value.map((tab) => ({ value: tab.id, label: tab.label })),
           label: 'Entry fields',
           modelValue: activeTab.value,
           panelFocusable: false,
           'onUpdate:modelValue': (value: string | number | undefined) => {
              activeTab.value = String(value ?? '')
           },
        }
      : {}
)

const settings = useCmsSettingsState()

const layout = computed<CmsFormLayout>(() =>
   props.entryName
      ? entryFormLayout(props.entryName, settings.value, props.fields)
      : resolveFormLayout(props.fields, undefined)
)

function isShown(key: string) {
   const field = props.fields[key]
   if (!field || !isFieldVisible(field, state.value, props.fields)) return false
   if (!tabList.value.length) return true
   return fieldTab(field, tabList.value) === activeTab.value
}

const sectionsRef = ref<{ reveal: (key: string) => void } | null>(null)

function revealField(key: string) {
   sectionsRef.value?.reveal(key)
}

function firstErrorKey(errors: FormErrors) {
   const keys = Object.keys(errors).filter((key) => errors[key])
   return (
      Object.keys(props.fields).find((key) => keys.includes(key)) ?? keys[0]?.split('.')[0] ?? ''
   )
}

function onError(key: string) {
   const field = key ? props.fields[key] : undefined
   if (field && tabList.value.length) {
      const tab = fieldTab(field, tabList.value)
      if (tab) activeTab.value = tab
   }
   if (key) void nextTick(() => revealField(key))
   emit('error')
}

function slugSource(field: FieldConfig) {
   if (!field.from) return undefined
   return slugSourceValue(props.fields[field.from], state.value[field.from], i18n.defaultLocale)
}

function hasLocaleSwitch(field: FieldConfig) {
   return (
      isTranslatableField(field) || isLocalizedLinkField(field) || hasTranslatableBlockFields(field)
   )
}

function fieldProgress(key: string) {
   return translationProgress(props.fields, state.value, i18n, [key])
}

function localeFor(key: string) {
   return activeLocale.value[key] ?? i18n.defaultLocale
}

function setLocale(key: string, locale: string) {
   activeLocale.value = { ...activeLocale.value, [key]: locale }
}

const validate = computed(() =>
   props.entryName ? (cmsConfig as CmsConfig)[props.entryName]?.validate : undefined
)

const schema = computed(() =>
   buildEntrySchema(
      {
         fields: props.fields,
         drafts: props.drafts,
         validate: validate.value,
         path: props.path,
         config: cmsConfig as CmsConfig,
      },
      i18n
   )
)

function warnings(values: Record<string, unknown>) {
   return entryValidationWarnings(
      { fields: props.fields, validate: validate.value },
      values,
      i18n,
      props.path
   )
}

const form = useForm({
   values: state,
   validator: schema,
   warnings,
   onSubmit: () => emit('submit'),
   onInvalid: (errors) => onError(firstErrorKey(errors)),
})

const published = computed({
   get: () => state.value.status === 'published',
   set: (value: boolean) => {
      state.value.status = value ? 'published' : 'draft'
   },
})

function togglePublished() {
   published.value = !published.value
}

const formRef = ref<{ $el: HTMLFormElement } | null>(null)
const { highlighted, reveal } = useCmsFieldFocus()

function applyFocus(focus: CmsSearchFocus) {
   if (focus.tab && tabList.value.some((tab) => tab.id === focus.tab)) activeTab.value = focus.tab
   const key = focus.field
   const field = key ? props.fields[key] : undefined
   if (!key || !field) return
   const tab = tabList.value.length ? fieldTab(field, tabList.value) : undefined
   if (tab) activeTab.value = tab
   if (focus.locale && hasLocaleSwitch(field) && i18n.locales.includes(focus.locale)) {
      setLocale(key, focus.locale)
   }
   void nextTick(() => {
      revealField(key)
      reveal(() => formRef.value?.$el, key)
   })
}

onMounted(() => {
   if (props.focus) applyFocus(props.focus)
})

function setIssues(issues: CmsResponseIssue[]) {
   const fieldIssues = issues.filter((issue) => issue.path.length)
   if (!fieldIssues.length) return
   form.setIssues(fieldIssues)
   onError(String(fieldIssues[0]!.path[0]))
}

defineExpose({ setIssues })
</script>
