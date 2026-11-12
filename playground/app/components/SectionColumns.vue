<template>
   <section class="mx-auto w-full max-w-3xl px-6 py-8">
      <CmsField v-if="heading" name="heading" as="h2" class="site-display text-2xl font-semibold">
         {{ heading }}
      </CmsField>
      <div class="mt-4 grid gap-6" :class="count === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'">
         <CmsBlocks :blocks="columns" />
      </div>
   </section>
</template>

<script setup lang="ts">
import type { NewsBodyColumnsProps } from '#cms-types'

const props = defineProps<NewsBodyColumnsProps>()

const count = computed(() => props.columns?.length ?? 0)
</script>
