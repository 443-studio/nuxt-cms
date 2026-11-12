import { describe, expect, it } from 'vitest'
import { renderImageFile, resolveCmsImageSetup } from '../src/image-codegen'
import {
   cmsImageSize,
   focalObjectPosition,
   focalPointIssue,
   focalPointOf,
   imgixFocalModifiers,
   isFocalCoordinate,
   isRenderableImage,
   roundFocalCoordinate,
} from '../src/runtime/shared/media-focal'
import { mediaUpdateSchema } from '../src/runtime/shared/validation'

describe('focal point values', () => {
   it('accepts coordinates from 0 to 1 only', () => {
      expect(isFocalCoordinate(0)).toBe(true)
      expect(isFocalCoordinate(1)).toBe(true)
      expect(isFocalCoordinate(0.42)).toBe(true)
      expect(isFocalCoordinate(-0.01)).toBe(false)
      expect(isFocalCoordinate(1.01)).toBe(false)
      expect(isFocalCoordinate(Number.NaN)).toBe(false)
      expect(isFocalCoordinate('0.5')).toBe(false)
      expect(isFocalCoordinate(null)).toBe(false)
   })

   it('clamps and rounds a coordinate to four decimals', () => {
      expect(roundFocalCoordinate(0.123456)).toBe(0.1235)
      expect(roundFocalCoordinate(-2)).toBe(0)
      expect(roundFocalCoordinate(3)).toBe(1)
   })

   it('reads a point only when both coordinates are valid', () => {
      expect(focalPointOf({ focalX: 0.2, focalY: 0.8 })).toEqual({ x: 0.2, y: 0.8 })
      expect(focalPointOf({ focalX: 0.2, focalY: null })).toBeNull()
      expect(focalPointOf({ focalX: 2, focalY: 0.5 })).toBeNull()
      expect(focalPointOf(null)).toBeNull()
   })

   it('requires both coordinates together', () => {
      expect(focalPointIssue(undefined, undefined)).toBeNull()
      expect(focalPointIssue(null, null)).toBeNull()
      expect(focalPointIssue(0.5, 0.5)).toBeNull()
      expect(focalPointIssue(0.5, null)).toBe('focalX and focalY must be set together')
      expect(focalPointIssue(undefined, 0.5)).toBe('focalX and focalY must be set together')
      expect(focalPointIssue(0.5, 1.5)).toBe('focalX and focalY must be numbers from 0 to 1')
   })
})

describe('mediaUpdateSchema', () => {
   it('accepts a focal point, a reset and no focal point at all', () => {
      expect(mediaUpdateSchema.parse({ key: 'a.jpg', focalX: 0.3, focalY: 0.7 })).toMatchObject({
         focalX: 0.3,
         focalY: 0.7,
      })
      expect(mediaUpdateSchema.parse({ key: 'a.jpg', focalX: null, focalY: null })).toMatchObject({
         focalX: null,
         focalY: null,
      })
      expect(mediaUpdateSchema.parse({ key: 'a.jpg', alt: 'Lake' })).toEqual({
         key: 'a.jpg',
         alt: 'Lake',
      })
   })

   it('refuses out of range, partial or non numeric focal values', () => {
      for (const body of [
         { key: 'a.jpg', focalX: 1.2, focalY: 0.5 },
         { key: 'a.jpg', focalX: 0.5, focalY: -0.1 },
         { key: 'a.jpg', focalX: 0.5 },
         { key: 'a.jpg', focalX: 0.5, focalY: null },
         { key: 'a.jpg', focalX: '0.5', focalY: '0.5' },
      ]) {
         expect(mediaUpdateSchema.safeParse(body).success).toBe(false)
      }
   })
})

describe('focal rendering helpers', () => {
   it('turns the focal point into an object-position', () => {
      expect(focalObjectPosition({ focalX: 0.25, focalY: 0.8 })).toBe('25% 80%')
      expect(focalObjectPosition({ focalX: 0.3333, focalY: 0 })).toBe('33.33% 0%')
      expect(focalObjectPosition({ focalX: null, focalY: null })).toBeUndefined()
   })

   it('builds the imgix focal point crop modifiers', () => {
      expect(imgixFocalModifiers({ focalX: 0.25, focalY: 0.8 })).toEqual({
         crop: 'focalpoint',
         focalPointXPosition: 0.25,
         focalPointYPosition: 0.8,
      })
      expect(imgixFocalModifiers({ focalX: null, focalY: null })).toEqual({})
   })

   it('sizes an image from the media dimensions and keeps the aspect ratio', () => {
      const media = { width: 1600, height: 900 }
      expect(cmsImageSize(media)).toEqual({ width: 1600, height: 900 })
      expect(cmsImageSize(media, { width: 800 })).toEqual({ width: 800, height: 450 })
      expect(cmsImageSize(media, { height: '450' })).toEqual({ width: 800, height: 450 })
      expect(cmsImageSize(media, { width: 300, height: 300 })).toEqual({ width: 300, height: 300 })
      expect(cmsImageSize({ width: null, height: null }, { width: 800 })).toEqual({
         width: 800,
         height: undefined,
      })
      expect(cmsImageSize(null)).toEqual({ width: undefined, height: undefined })
   })

   it('renders only images that have a url', () => {
      expect(isRenderableImage({ url: '/images/a.jpg', type: 'image' })).toBe(true)
      expect(isRenderableImage({ url: '/images/a.jpg' })).toBe(true)
      expect(isRenderableImage({ url: '/images/a.mp4', type: 'video' })).toBe(false)
      expect(isRenderableImage({ url: null, type: 'image' })).toBe(false)
      expect(isRenderableImage(null)).toBe(false)
   })
})

describe('renderImageFile', () => {
   it('exports NuxtImg and NuxtPicture when @nuxt/image is installed', () => {
      const out = renderImageFile(resolveCmsImageSetup(true, { image: { provider: 'imgix' } }))
      expect(out).toContain("import { NuxtImg, NuxtPicture } from '#components'")
      expect(out).toContain('export const cmsNuxtImg: Component | null = NuxtImg')
      expect(out).toContain('export const cmsNuxtPicture: Component | null = NuxtPicture')
      expect(out).toContain('export const cmsImageProvider: string | null = "imgix"')
   })

   it('exports null components without @nuxt/image', () => {
      const out = renderImageFile(resolveCmsImageSetup(false, { image: { provider: 'imgix' } }))
      expect(out).not.toContain('#components')
      expect(out).toContain('export const cmsNuxtImg: Component | null = null')
      expect(out).toContain('export const cmsNuxtPicture: Component | null = null')
      expect(out).toContain('export const cmsImageProvider: string | null = null')
   })

   it('leaves the provider unset when @nuxt/image picks its default', () => {
      expect(resolveCmsImageSetup(true, {})).toEqual({ nuxtImage: true, provider: null })
   })
})
