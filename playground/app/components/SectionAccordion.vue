<template>
   <section class="mx-auto w-full max-w-3xl px-6 py-8">
      <CmsField v-if="heading" name="heading" as="h2" class="site-display text-2xl font-semibold">
         {{ heading }}
      </CmsField>
      <div class="mt-4 flex flex-col gap-2">
         <CmsBlocks :blocks="panels" />
      </div>
   </section>
</template>

<script setup lang="ts">
import type { NewsBodyAccordionProps } from '#cms-types'

defineProps<NewsBodyAccordionProps>()
</script>
