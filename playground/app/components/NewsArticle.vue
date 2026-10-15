<template>
   <KRoot class="site">
      <article class="py-14">
         <header class="mx-auto w-full max-w-3xl px-6">
            <span class="site-label">{{ item.publishedAt?.slice(0, 10) }}</span>
            <h1 class="site-display mt-2 text-4xl font-bold">{{ item.title }}</h1>
            <p v-if="item.excerpt" class="mt-4 text-(--k-text-muted)">{{ item.excerpt }}</p>
         </header>
         <figure v-if="item.cover?.url" class="mx-auto mt-8 w-full max-w-5xl px-6">
            <img
               :src="item.cover.url"
               :alt="item.cover.alt ?? ''"
               class="aspect-[21/9] w-full rounded-xl object-cover"
            />
         </figure>
         <slot />
      </article>
      <slot name="footer" />
   </KRoot>
</template>

<script setup lang="ts">
import type { News } from '#cms-types'

defineProps<{
   item: Pick<News, 'title' | 'excerpt' | 'publishedAt' | 'cover'>
   locale?: string
}>()
</script>
