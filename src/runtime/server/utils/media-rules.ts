import { isAbsolute, relative, resolve } from 'node:path'

const UPLOAD_TYPE_PREFIXES = ['image/', 'video/', 'audio/', 'font/']
const UPLOAD_TYPE_BLOCKLIST = new Set(['image/svg+xml'])
const UPLOAD_TYPES = new Set([
   'application/pdf',
   'application/zip',
   'application/gzip',
   'application/json',
   'text/plain',
   'text/csv',
   'text/markdown',
   'application/msword',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
   'application/vnd.ms-excel',
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   'application/vnd.ms-powerpoint',
   'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

export function baseContentType(contentType: string) {
   return contentType.split(';')[0]!.trim().toLowerCase()
}

export function isAllowedUploadType(contentType: string) {
   const type = baseContentType(contentType)
   return (
      !UPLOAD_TYPE_BLOCKLIST.has(type) &&
      (UPLOAD_TYPES.has(type) || UPLOAD_TYPE_PREFIXES.some((prefix) => type.startsWith(prefix)))
   )
}

export function mediaFilePath(dir: string, key: string): string | null {
   if (!dir || !key || key.startsWith('/') || /[\0\\]/.test(key)) return null
   const root = resolve(dir)
   const target = resolve(root, ...key.split('/'))
   const rel = relative(root, target)
   if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null
   return target
}
