export interface CmsImageSetup {
   nuxtImage: boolean
   provider: string | null
}

export function resolveCmsImageSetup(
   installed: boolean,
   options: { image?: { provider?: unknown } }
): CmsImageSetup {
   const provider = options.image?.provider
   return {
      nuxtImage: installed,
      provider: installed && typeof provider === 'string' && provider ? provider : null,
   }
}

export function renderImageFile(setup: CmsImageSetup): string {
   const lines = [`import type { Component } from 'vue'`]
   if (setup.nuxtImage) lines.push(`import { NuxtImg, NuxtPicture } from '#components'`)
   lines.push(
      ``,
      `export const cmsNuxtImg: Component | null = ${setup.nuxtImage ? 'NuxtImg' : 'null'}`,
      `export const cmsNuxtPicture: Component | null = ${setup.nuxtImage ? 'NuxtPicture' : 'null'}`,
      `export const cmsImageProvider: string | null = ${JSON.stringify(setup.provider)}`,
      ``
   )
   return lines.join('\n')
}
