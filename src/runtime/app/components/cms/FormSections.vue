<template>
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
               <template v-for="key in row" :key="key">
                  <slot name="field" :field-key="key" />
               </template>
            </div>
         </div>
      </component>
   </div>
</template>

<script setup lang="ts">
import type { CmsFormLayout, CmsLayoutSection } from '#nuxt-cms'
import { Accordion as KAccordion } from '@xleddyl/443-components-vue'
import { computed, ref } from '#imports'

const props = withDefaults(
   defineProps<{
      layout: CmsFormLayout
      shown?: (key: string) => boolean
   }>(),
   { shown: () => true }
)

defineSlots<{ field(props: { fieldKey: string }): unknown }>()

type ShownSection = CmsLayoutSection & { id: string }

const sections = computed<ShownSection[]>(() =>
   props.layout.main
      .map((section: CmsLayoutSection, index: number) => ({
         ...section,
         id: `${index}-${section.title ?? ''}`,
         rows: section.rows
            .map((row) => row.filter((key) => props.shown(key)))
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

function reveal(key: string) {
   for (const section of sections.value) {
      if (section.rows.some((row) => row.includes(key)) && isCollapsed(section)) {
         toggled.value = { ...toggled.value, [section.id]: false }
      }
   }
}

defineExpose({ reveal })
</script>
