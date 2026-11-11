<template>
   <section class="mx-auto w-full max-w-3xl px-6 py-8">
      <CmsField v-if="heading" name="heading" as="h2" class="site-display text-2xl font-semibold">
         {{ heading }}
      </CmsField>
      <div v-cms-field="'body'" class="prose mt-3 text-(--k-text-muted)" v-html="body" />
   </section>
</template>

<script setup lang="ts">
import type { NewsBodyTextProps } from '#cms-types'

defineProps<NewsBodyTextProps>()
</script>
