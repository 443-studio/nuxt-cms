<template>
   <BlogPost v-if="match?.entry === 'blog'" :item="match.item" :locale="locale">
      <CmsBlocks :blocks="match.item.body" />
      <template #footer>
         <div class="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 pb-14">
            <p v-if="match.item.author" class="text-sm text-(--k-text-muted)">
               Written by {{ match.item.author.name }}
            </p>
            <div class="flex gap-4">
               <NuxtLink to="/blog" class="site-label">all posts</NuxtLink>
               <NuxtLink
                  v-for="alternate in alternates"
                  :key="alternate.locale"
                  :to="alternate.path"
                  :hreflang="alternate.locale"
                  class="site-label"
               >
                  {{ alternate.locale }}
               </NuxtLink>
            </div>
         </div>
      </template>
   </BlogPost>
   <NewsArticle v-else-if="match?.entry === 'news'" :item="match.item" :locale="locale">
      <CmsBlocks :blocks="match.item.body" />
   </NewsArticle>
</template>

<script setup lang="ts">
const route = useRoute()
const locale = route.path.startsWith('/it/') ? 'it' : 'en'

const { data: match } = await useCmsRoute(route.path, { locale })

if (!match.value) {
   throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
}

useCmsSeo(() => match.value?.item, { locale })

const alternates = computed(() =>
   (match.value?.item.paths ?? []).filter((alternate) => alternate.locale !== locale)
)
</script>
