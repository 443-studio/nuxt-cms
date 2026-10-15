<template>
   <KRoot class="cms-scope cms-canvas" :theme="theme" preset="default">
      <slot />
      <KOverlayHost />
   </KRoot>
</template>

<script setup lang="ts">
import {
   OverlayHost as KOverlayHost,
   Root as KRoot,
   provideTheme,
} from '@xleddyl/443-components-vue'
import { useCmsTheme } from '../composables/cms-theme'
import { loadCmsSettings } from '../composables/cms-settings'

const theme = useCmsTheme()
provideTheme(theme)

await loadCmsSettings()
</script>
