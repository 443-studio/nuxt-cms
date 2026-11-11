<template>
   <div
      class="site-card flex min-w-0 flex-col p-5 [&_section]:px-0 [&_section]:py-3 [&_figure]:px-0 [&_figure]:py-3 [&_blockquote]:py-3"
   >
      <CmsBlocks :blocks="content" />
   </div>
</template>

<script setup lang="ts">
import type { NewsBodyColumnsColumnsColumnProps } from '#cms-types'

defineProps<NewsBodyColumnsColumnsColumnProps>()
</script>
