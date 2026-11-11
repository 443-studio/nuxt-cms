<template>
   <blockquote class="mx-auto w-full max-w-3xl border-l-2 border-(--k-line-strong) px-6 py-8">
      <CmsField name="text" as="p" class="site-display text-xl whitespace-pre-line italic">
         {{ text }}
      </CmsField>
      <footer v-if="author" v-cms-field="'author'" class="site-label mt-3">{{ author }}</footer>
   </blockquote>
</template>

<script setup lang="ts">
import type { NewsBodyQuoteProps } from '#cms-types'

defineProps<NewsBodyQuoteProps>()
</script>
