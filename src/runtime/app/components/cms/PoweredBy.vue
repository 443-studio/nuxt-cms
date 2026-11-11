<template>
   <span>
      Powered by
      <a
         class="cms-powered-by-link"
         href="https://github.com/443-studio/nuxt-cms"
         target="_blank"
         rel="noopener"
         >nuxt-cms{{ version ? ` v${version}` : '' }}</a
      >
   </span>
</template>

<script setup lang="ts">
import { useCmsRuntime } from '../../composables/cms-runtime'

const version = useCmsRuntime().version
</script>
