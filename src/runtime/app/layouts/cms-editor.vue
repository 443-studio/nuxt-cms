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
   provideFormConfig,
   provideTheme,
} from '@xleddyl/443-components-vue'
import { provideCmsRouteLocation } from '../composables/cms-route'
import { loadCmsSettings } from '../composables/cms-settings'
import { useCmsTheme } from '../composables/cms-theme'
import { cmsSubmitError } from '../utils/ui'

const theme = useCmsTheme()
provideTheme(theme)
provideCmsRouteLocation()
provideFormConfig({ submitError: cmsSubmitError })

await loadCmsSettings()
</script>

<style src="../../assets/admin.css" />
