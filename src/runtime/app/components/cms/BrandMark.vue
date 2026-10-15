<template>
   <KBrand
      :name="cmsBrand.title"
      :subtitle="subtitle"
      :size="size"
      :logo="logo"
      :hide-text="hideText"
      show-name
   >
      <template #mark>
         <svg class="cms-brand-glyph" viewBox="0 0 16 16" fill="none">
            <path
               d="M4.5 5.5h7M4.5 8h7M4.5 10.5h4"
               stroke="currentColor"
               stroke-width="1.5"
               stroke-linecap="round"
            />
         </svg>
      </template>
   </KBrand>
</template>

<script setup lang="ts">
import { Brand as KBrand } from '@xleddyl/443-components-vue'
import { cmsBrand } from '#cms-brand'

withDefaults(
   defineProps<{
      size?: 'sm' | 'md' | 'lg'
      subtitle?: string
      hideText?: boolean
   }>(),
   { size: 'md' }
)

const logo =
   cmsBrand.logo.kind === 'svg'
      ? cmsBrand.logo.markup
      : cmsBrand.logo.kind === 'image'
        ? cmsBrand.logo.src
        : undefined
</script>
