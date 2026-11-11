<template>
   <component :is="nuxtComponent" v-if="image && nuxtComponent" v-bind="nuxtBindings" />
   <img v-else-if="image" v-bind="plainBindings" />
</template>

<script setup lang="ts">
import type { PropType, StyleValue } from 'vue'
import { cmsImageProvider, cmsNuxtImg, cmsNuxtPicture } from '#cms-image'
import { computed, useAttrs } from '#imports'
import type { CmsImageMedia } from '../../shared/media-focal'
import {
   cmsImageSize,
   focalObjectPosition,
   imgixFocalModifiers,
   isRenderableImage,
} from '../../shared/media-focal'
import { useCmsRuntime } from '../composables/cms-runtime'

defineOptions({ inheritAttrs: false })

const props = defineProps({
   media: { type: Object as PropType<CmsImageMedia | null>, default: null },
   alt: { type: String, default: undefined },
   width: { type: [Number, String], default: undefined },
   height: { type: [Number, String], default: undefined },
   loading: { type: String as PropType<'lazy' | 'eager'>, default: 'lazy' },
   decoding: { type: String as PropType<'async' | 'auto' | 'sync'>, default: 'async' },
   picture: { type: Boolean, default: false },
   provider: { type: String, default: undefined },
   modifiers: { type: Object as PropType<Record<string, unknown>>, default: undefined },
})

const attrs = useAttrs()
const { mediaStorage } = useCmsRuntime()

const image = computed(() => (isRenderableImage(props.media) ? props.media : null))

const size = computed(() => cmsImageSize(image.value, { width: props.width, height: props.height }))

const objectPosition = computed(() => focalObjectPosition(image.value))

const positioned = computed<{ style?: StyleValue }>(() =>
   objectPosition.value
      ? { style: [attrs.style as StyleValue, { objectPosition: objectPosition.value }] }
      : {}
)

const provider = computed(() => props.provider ?? cmsImageProvider)

const nuxtComponent = computed(() => {
   if (!cmsNuxtImg) return null
   if (!props.provider && mediaStorage === 'filesystem' && (provider.value ?? 'ipx') === 'ipx')
      return null
   return props.picture ? cmsNuxtPicture : cmsNuxtImg
})

const common = computed(() => ({
   src: image.value?.url ?? undefined,
   alt: props.alt ?? image.value?.alt ?? '',
   width: size.value.width,
   height: size.value.height,
   loading: props.loading,
   decoding: props.decoding,
}))

const NUXT_IMAGE_ATTRS = new Set([
   'sizes',
   'densities',
   'format',
   'quality',
   'fit',
   'preset',
   'placeholder',
   'placeholderClass',
   'placeholder-class',
   'background',
   'preload',
   'imgAttrs',
   'img-attrs',
])

const plainBindings = computed(() => ({
   ...Object.fromEntries(Object.entries(attrs).filter(([key]) => !NUXT_IMAGE_ATTRS.has(key))),
   ...common.value,
   ...positioned.value,
}))

const nuxtBindings = computed(() => {
   const focal = provider.value === 'imgix' ? imgixFocalModifiers(image.value) : {}
   const modifiers = { ...focal, ...props.modifiers }
   const base = {
      ...attrs,
      ...common.value,
      provider: props.provider,
      modifiers: Object.keys(modifiers).length ? modifiers : undefined,
   }
   if (!props.picture) return { ...base, ...positioned.value }
   const imgAttrs = (attrs.imgAttrs ?? attrs['img-attrs'] ?? {}) as Record<string, unknown>
   if (!objectPosition.value) return base
   return {
      ...base,
      imgAttrs: {
         ...imgAttrs,
         style: [imgAttrs.style as StyleValue, { objectPosition: objectPosition.value }],
      },
   }
})
</script>
