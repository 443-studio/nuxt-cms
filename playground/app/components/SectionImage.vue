<template>
   <figure class="mx-auto w-full max-w-3xl px-6 py-8">
      <CmsImage
         :media="image"
         :alt="image?.alt ?? caption ?? ''"
         class="aspect-[3/2] w-full rounded-xl object-cover"
      />
      <figcaption v-if="caption" v-cms-field="'caption'" class="site-label mt-3 text-center">
         {{ caption }}
      </figcaption>
   </figure>
</template>

<script setup lang="ts">
import type { NewsBodyImageProps } from '#cms-types'

defineProps<NewsBodyImageProps>()
</script>
