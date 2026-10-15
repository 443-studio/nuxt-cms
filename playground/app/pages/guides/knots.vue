<template>
   <KRoot class="site">
      <div class="mx-auto w-full max-w-3xl px-6 py-14">
         <h1 class="site-display text-4xl font-bold">{{ page?.title ?? 'Knots' }}</h1>
         <NuxtLink to="/guides" class="site-label mt-10 inline-block">back to guides</NuxtLink>
      </div>
   </KRoot>
</template>

<script setup lang="ts">
const { data: page } = await useCmsPage('/guides/knots')
</script>
