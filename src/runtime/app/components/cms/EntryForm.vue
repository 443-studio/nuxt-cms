<template>
   <KForm :id="formId" ref="formRef" :form="form" :focus-on-error="false" class="cms-form">
      <component :is="tabbed ? KTabs : 'div'" v-bind="tabsBinding" class="cms-form-body">
         <template #[panelSlot]>
            <div class="cms-form-main">
               <component
                  :is="section.title ? KAccordion : 'div'"
                  v-for="section in sections"
                  :key="section.id"
                  v-bind="sectionBinding(section)"
                  class="cms-form-section"
               >
                  <div class="cms-form-rows" :class="{ 'cms-form-section-body': section.title }">
                     <div
                        v-for="row in section.rows"
                        :key="row.join('|')"
                        class="cms-form-row"
                        :style="{ '--cms-row-cols': row.length }"
                     >
                        <KFormField
                           v-for="key in row"
                           :key="key"
                           :name="key"
                           :label="fields[key]!.label"
                           :description="fields[key]!.description"
                           :icon="cmsIcon(fieldIcon(fields[key]!))"
                           :required="fields[key]!.required"
                           :data-cms-field="key"
                           :class="{ 'cms-search-focus': highlighted === key }"
                        >
                           <template
                              v-if="hasLocaleSwitch(fields[key]!) && i18n.locales.length > 1"
                              #label-actions
                           >
                              <CmsLocaleSwitch
                                 :model-value="localeFor(key)"
                                 :value="
                                    isTranslatableField(fields[key]!)
                                       ? (state[key] as Record<string, string> | null)
                                       : null
                                 "
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
                     </div>
                  </div>
               </component>
            </div>
         </template>
      </component>
      <KStack v-if="footer" direction="row" justify="end" gap="sm">
         <KButton type="submit" label="Save" :loading="loading" />
         <KButton
            v-if="drafts"
            type="submit"
            :label="published ? 'Make draft' : 'Publish'"
            :loading="loading"
            @click="togglePublished"
         />
      </KStack>
   </KForm>
</template>

<script setup lang="ts">
import type {
   CmsConfig,
   CmsEntry,
   CmsFormLayout,
   CmsLayoutSection,
   CmsTab,
   FieldConfig,
} from '#nuxt-cms'
import {
   fieldTab,
   hasTranslatableBlockFields,
   isFieldVisible,
   isTranslatableField,
   resolveFormLayout,
   slugSourceValue,
} from '#nuxt-cms'
import type { FormErrors } from '@xleddyl/443-components-vue'
import {
   Accordion as KAccordion,
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
import { buildEntrySchema, entryValidationWarnings } from '../../../shared/validation'
import { useCmsFieldFocus } from '../../composables/cms-field-focus'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { entryFormLayout, useCmsSettingsState } from '../../composables/cms-settings'
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
   }>(),
   { footer: true }
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
   if (!field || !isFieldVisible(field, state.value)) return false
   if (!tabList.value.length) return true
   return fieldTab(field, tabList.value) === activeTab.value
}

type ShownSection = CmsLayoutSection & { id: string }

const sections = computed<ShownSection[]>(() =>
   layout.value.main
      .map((section: CmsLayoutSection, index: number) => ({
         ...section,
         id: `${index}-${section.title ?? ''}`,
         rows: section.rows
            .map((row) => row.filter((key) => isShown(key)))
            .filter((row) => row.length),
      }))
      .filter((section) => section.rows.length)
)

const toggled = ref<Record<string, boolean>>({})

function isCollapsed(section: ShownSection) {
   if (!section.title) return false
   return toggled.value[section.id] ?? !!section.collapsed
}

function toggleSection(id: string) {
   const section = sections.value.find((s) => s.id === id)
   if (section) toggled.value = { ...toggled.value, [id]: !isCollapsed(section) }
}

function sectionBinding(section: ShownSection) {
   if (!section.title) return {}
   return {
      items: [{ value: section.id, title: section.title, description: section.description }],
      variant: 'outline' as const,
      contentVariant: 'neutral' as const,
      modelValue: isCollapsed(section) ? null : section.id,
      'onUpdate:modelValue': () => toggleSection(section.id),
   }
}

function revealField(key: string) {
   for (const section of sections.value) {
      if (section.rows.some((row) => row.includes(key)) && isCollapsed(section)) {
         toggled.value = { ...toggled.value, [section.id]: false }
      }
   }
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
   return isTranslatableField(field) || hasTranslatableBlockFields(field)
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
      { fields: props.fields, drafts: props.drafts, validate: validate.value, path: props.path },
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
</script>
