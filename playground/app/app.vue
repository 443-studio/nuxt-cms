<template>
   <NuxtLayout>
      <NuxtPage />
   </NuxtLayout>
   <footer
      v-if="!route.path.startsWith('/cms') && (footer?.menu?.length || footer?.privacy?.href)"
      class="site border-t border-(--k-line)"
   >
      <nav class="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-6">
         <template v-for="(item, index) in footer?.menu ?? []" :key="index">
            <CmsLink :link="item.link" class="site-label hover:text-(--k-text)" />
         </template>
         <CmsLink :link="footer?.privacy" class="site-label ml-auto hover:text-(--k-text)">
            privacy
         </CmsLink>
      </nav>
   </footer>
</template>

<script setup lang="ts">
const route = useRoute()
const { data: footer } = await useCmsSingle('footer')
</script>
