<template>
   <NewsArticle v-if="item" :item="item">
      <CmsBlocks :blocks="item.body" />
      <template #footer>
         <div class="mx-auto w-full max-w-3xl px-6 pb-14">
            <NuxtLink to="/news" class="site-label">all news</NuxtLink>
         </div>
      </template>
   </NewsArticle>
   <KRoot v-else class="site">
      <div class="mx-auto w-full max-w-3xl px-6 py-14">
         <h1 class="site-display text-4xl font-bold">Not found</h1>
         <NuxtLink to="/news" class="site-label mt-6 inline-block">all news</NuxtLink>
      </div>
   </KRoot>
</template>

<script setup lang="ts">
const route = useRoute()
const { data: item } = await useCmsContent('news', String(route.params.slug))
</script>
