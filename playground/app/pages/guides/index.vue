<template>
   <KRoot class="site">
      <div class="mx-auto w-full max-w-3xl px-6 py-14">
         <h1 class="site-display text-4xl font-bold">{{ page?.title ?? 'Guides' }}</h1>
         <NuxtLink to="/" class="site-label mt-10 inline-block">back home</NuxtLink>
      </div>
   </KRoot>
</template>

<script setup lang="ts">
const { data: page } = await useCmsPage('/guides')
</script>
