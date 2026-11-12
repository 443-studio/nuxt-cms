<template>
   <NuxtLink
      v-if="link?.href"
      :to="link.href"
      :external="link.external || undefined"
      :target="link.newTab ? '_blank' : undefined"
      :rel="link.newTab ? 'noopener noreferrer' : undefined"
   >
      <slot :link="link">{{ link.label ?? link.href }}</slot>
   </NuxtLink>
</template>

<script setup lang="ts">
import type { CmsLink as CmsLinkData } from '../../shared/index'

defineProps<{ link?: CmsLinkData | null }>()

defineSlots<{ default?: (props: { link: CmsLinkData }) => unknown }>()
</script>
