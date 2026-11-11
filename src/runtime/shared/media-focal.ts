export interface CmsFocalPoint {
   x: number
   y: number
}

export interface CmsFocalMedia {
   focalX?: number | null
   focalY?: number | null
}

const FOCAL_PRECISION = 10_000

export function isFocalCoordinate(value: unknown): value is number {
   return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

export function roundFocalCoordinate(value: number): number {
   return Math.round(Math.min(1, Math.max(0, value)) * FOCAL_PRECISION) / FOCAL_PRECISION
}

export function focalPointOf(media: CmsFocalMedia | null | undefined): CmsFocalPoint | null {
   if (!media) return null
   const { focalX, focalY } = media
   if (!isFocalCoordinate(focalX) || !isFocalCoordinate(focalY)) return null
   return { x: focalX, y: focalY }
}

export function focalPointIssue(focalX: unknown, focalY: unknown): string | null {
   const unset = (value: unknown) => value === null || value === undefined
   if (unset(focalX) && unset(focalY)) return null
   if (unset(focalX) || unset(focalY)) return 'focalX and focalY must be set together'
   if (!isFocalCoordinate(focalX) || !isFocalCoordinate(focalY))
      return 'focalX and focalY must be numbers from 0 to 1'
   return null
}

function percent(value: number): string {
   return `${Math.round(value * 10_000) / 100}%`
}

export function focalObjectPosition(media: CmsFocalMedia | null | undefined): string | undefined {
   const point = focalPointOf(media)
   return point ? `${percent(point.x)} ${percent(point.y)}` : undefined
}

export function imgixFocalModifiers(
   media: CmsFocalMedia | null | undefined
): Record<string, string | number> {
   const point = focalPointOf(media)
   if (!point) return {}
   return { crop: 'focalpoint', focalPointXPosition: point.x, focalPointYPosition: point.y }
}

export interface CmsImageMedia extends CmsFocalMedia {
   url: string | null
   type?: string | null
   alt?: string | null
   width?: number | null
   height?: number | null
}

export interface CmsImageSizeInput {
   width?: number | string | null
   height?: number | string | null
}

function toPixels(value: number | string | null | undefined): number | undefined {
   if (value === null || value === undefined || value === '') return undefined
   const parsed = typeof value === 'number' ? value : Number(value)
   return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

export function cmsImageSize(
   media: Pick<CmsImageMedia, 'width' | 'height'> | null | undefined,
   input: CmsImageSizeInput = {}
): { width: number | undefined; height: number | undefined } {
   const naturalWidth = toPixels(media?.width)
   const naturalHeight = toPixels(media?.height)
   const width = toPixels(input.width)
   const height = toPixels(input.height)
   const ratio = naturalWidth && naturalHeight ? naturalWidth / naturalHeight : undefined
   if (width && height) return { width, height }
   if (width) return { width, height: ratio ? Math.round(width / ratio) : undefined }
   if (height) return { width: ratio ? Math.round(height * ratio) : undefined, height }
   return { width: naturalWidth, height: naturalHeight }
}

export function isRenderableImage(media: CmsImageMedia | null | undefined): media is CmsImageMedia {
   return (
      !!media?.url && (media.type === undefined || media.type === null || media.type === 'image')
   )
}
