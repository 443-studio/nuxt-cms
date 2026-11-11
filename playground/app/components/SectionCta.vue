<template>
   <section class="mx-auto w-full max-w-3xl px-6 py-8">
      <div class="site-card flex flex-col items-start gap-3 p-6">
         <h2 class="site-display text-2xl font-semibold">{{ heading }}</h2>
         <p v-if="text" class="text-(--k-text-muted)">{{ text }}</p>
         <CmsLink
            :link="link"
            class="inline-flex items-center gap-2 rounded-lg bg-(--k-accent) px-4 py-2 text-sm font-medium text-(--k-accent-contrast)"
         />
      </div>
   </section>
</template>

<script setup lang="ts">
import type { NewsBodyCtaProps } from '#cms-types'

defineProps<NewsBodyCtaProps>()
</script>
