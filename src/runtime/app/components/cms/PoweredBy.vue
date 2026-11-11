<template>
   <span>
      Powered by
      <KButton
         variant="link"
         size="xs"
         href="https://github.com/443-studio/nuxt-cms"
         target="_blank"
         external
         :label="version ? `nuxt-cms v${version}` : 'nuxt-cms'"
      />
   </span>
</template>

<script setup lang="ts">
import { Button as KButton } from '@xleddyl/443-components-vue'
import { useCmsRuntime } from '../../composables/cms-runtime'

const version = useCmsRuntime().version
</script>
