<template>
   <details class="site-card group px-5 py-3">
      <summary class="flex cursor-pointer list-none items-center justify-between gap-3 font-medium">
         <CmsField name="title">{{ title }}</CmsField>
         <span class="text-(--k-text-muted) transition group-open:rotate-180">⌄</span>
      </summary>
      <div
         class="[&_section]:px-0 [&_section]:py-3 [&_figure]:px-0 [&_figure]:py-3 [&_blockquote]:py-3"
      >
         <CmsBlocks :blocks="content" />
      </div>
   </details>
</template>

<script setup lang="ts">
import type { NewsBodyAccordionPanelsPanelProps } from '#cms-types'

defineProps<NewsBodyAccordionPanelsPanelProps>()
</script>
