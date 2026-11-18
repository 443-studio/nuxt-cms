import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { AnySQLiteColumn, BaseSQLiteDatabase, SQLiteTable } from 'drizzle-orm/sqlite-core'
import {
   DEFAULT_MEDIA_MAX_FILE_SIZE,
   focalPointIssue,
   formatFileSize,
   isMediaFolderMarker,
   normalizeMediaFolder,
   roundFocalCoordinate,
} from '../../shared/index'
import { withTimestamps } from './entry-values'
import { isAllowedUploadType, mediaFilePath } from './media-rules'
import type { S3MediaConfig } from './media-s3'
import { putS3Object, s3Client, s3ObjectSize, s3ObjectUrl } from './media-s3'
import {
   MEDIA_SYNC_MIME_TYPES,
   mediaMimeForKey,
   mediaSyncExtension,
   mediaSyncFolder,
   readMediaDimensions,
} from './media-sync'

export type CmsSeedMedia =
   | { storage: 'local'; dir: string }
   | ({ storage: 's3'; maxFileSize?: number } & Partial<S3MediaConfig>)
   | { storage: 'filesystem'; dir?: string; maxFileSize?: number }

export interface CmsContentMediaFile {
   key: string
   file: string
   alt?: string | null
   focalX?: number | null
   focalY?: number | null
}

export interface PreparedMediaFile {
   key: string
   path: string
   source: string
   folder: string | null
   mime: string
   size: number
   width: number | null
   height: number | null
   alt?: string | null
   focalX?: number | null
   focalY?: number | null
}

export interface CmsMediaImportResult {
   keys: string[]
   uploaded: string[]
   skipped: string[]
}

export interface PrepareMediaFilesOptions {
   media?: CmsSeedMedia | null
   root?: string
}

type AddIssue = (path: string, message: string) => void

type MediaDb = Pick<BaseSQLiteDatabase<'sync' | 'async', unknown>, 'insert'>

const MEDIA_FILE_PROPERTIES = ['key', 'file', 'alt', 'focalX', 'focalY']

const MAX_KEY_LENGTH = 1024

const MAX_ALT_LENGTH = 1024

const UPLOAD_CONCURRENCY = 4

const S3_ENV_VARS: Record<keyof S3MediaConfig, string> = {
   endpoint: 'NUXT_CMS_MEDIA_ENDPOINT',
   region: 'NUXT_CMS_MEDIA_REGION',
   bucket: 'NUXT_CMS_MEDIA_BUCKET',
   accessKeyId: 'NUXT_CMS_MEDIA_ACCESS_KEY_ID',
   secretAccessKey: 'NUXT_CMS_MEDIA_SECRET_ACCESS_KEY',
}

export const MEDIA_SEED_EXTENSIONS = Object.keys(MEDIA_SYNC_MIME_TYPES).filter((extension) =>
   isAllowedUploadType(MEDIA_SYNC_MIME_TYPES[extension]!)
)

function isRecord(value: unknown): value is Record<string, unknown> {
   return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function mediaSeedKeyIssue(key: string): string | null {
   if (!key.trim()) return 'expected a non-empty media key, like "hero/photo.webp"'
   if (key.length > MAX_KEY_LENGTH) return `the key is longer than ${MAX_KEY_LENGTH} characters`
   const segments = key.split('/')
   if (
      key.startsWith('/') ||
      /[\0-\x1f\x7f\\]/.test(key) ||
      segments.some((segment) => !segment || segment === '.' || segment === '..')
   )
      return 'invalid key; use a relative path with "/" between folders, like "hero/photo.webp"'
   const name = segments[segments.length - 1]!
   if (name.startsWith('.') || isMediaFolderMarker(key))
      return 'the file name cannot start with "."'
   const folder = mediaSyncFolder(key)
   const normalized = folder ? normalizeMediaFolder(folder) : null
   if (folder && normalized !== folder) {
      const example = JSON.stringify(normalized ?? 'photos')
      return `folder ${JSON.stringify(
         folder
      )} is not a media library folder; use lowercase slug segments, at most 4 levels, like ${example}`
   }
   const mime = mediaMimeForKey(key)
   if (!mime || !isAllowedUploadType(mime)) {
      const extension = mediaSyncExtension(key)
      const type = extension ? JSON.stringify(`.${extension}`) : '(no extension)'
      return `unsupported file type ${type}; allowed: ${MEDIA_SEED_EXTENSIONS.join(', ')}`
   }
   return null
}

function storageIssue(media: CmsSeedMedia | null | undefined): string | null {
   if (!media) return 'no media storage given; pass `media` (loadCmsProject returns it)'
   if (media.storage === 'local')
      return `local media storage is read-only: put the files in the ${
         media.dir || 'publicBaseUrl'
      } folder and use their path as the key, or switch cms.media.storage to "s3" or "filesystem"`
   if (media.storage === 'filesystem')
      return media.dir ? null : 'filesystem media storage has no dir (cms.media.dir)'
   const missing = (['endpoint', 'bucket', 'accessKeyId', 'secretAccessKey'] as const).filter(
      (key) => !media[key]
   )
   if (!missing.length) return null
   return `s3 media storage is not configured: missing ${missing
      .map((key) => `${key} (${S3_ENV_VARS[key]})`)
      .join(', ')}; set them in cms.media in nuxt.config or in the env`
}

function maxFileSizeOf(media: CmsSeedMedia | null | undefined): number {
   if (!media || media.storage === 'local') return DEFAULT_MEDIA_MAX_FILE_SIZE
   return media.maxFileSize ?? DEFAULT_MEDIA_MAX_FILE_SIZE
}

async function fileSize(path: string): Promise<number | null | 'not-a-file'> {
   try {
      const info = await stat(path)
      return info.isFile() ? info.size : 'not-a-file'
   } catch {
      return null
   }
}

async function prepareMediaFile(
   item: unknown,
   path: string,
   root: string,
   maxFileSize: number,
   add: AddIssue
): Promise<PreparedMediaFile | null> {
   if (!isRecord(item)) {
      add(path, 'expected an object like { "key": "hero/photo.webp", "file": "media/photo.webp" }')
      return null
   }
   let valid = true
   const issue = (at: string, message: string) => {
      valid = false
      add(at, message)
   }
   for (const name of Object.keys(item)) {
      if (!MEDIA_FILE_PROPERTIES.includes(name))
         issue(
            `${path}.${name}`,
            `unknown property ${JSON.stringify(name)}; allowed: ${MEDIA_FILE_PROPERTIES.map((p) =>
               JSON.stringify(p)
            ).join(', ')}`
         )
   }
   const key = item.key
   if (typeof key !== 'string')
      issue(`${path}.key`, 'expected the media key string, like "hero/photo.webp"')
   else {
      const message = mediaSeedKeyIssue(key)
      if (message) issue(`${path}.key`, message)
   }
   const alt = item.alt
   if (
      alt !== undefined &&
      alt !== null &&
      (typeof alt !== 'string' || alt.length > MAX_ALT_LENGTH)
   )
      issue(`${path}.alt`, `expected a string of at most ${MAX_ALT_LENGTH} characters, or null`)
   const focal = focalPointIssue(item.focalX, item.focalY)
   if (focal) issue(`${path}.focalX`, focal)

   let source = ''
   let size = 0
   if (typeof item.file !== 'string' || !item.file.trim()) {
      issue(`${path}.file`, 'expected the path of a local file, relative to the project root')
   } else {
      source = resolve(root, item.file)
      const found = await fileSize(source)
      if (found === null) issue(`${path}.file`, `file not found: ${source}`)
      else if (found === 'not-a-file') issue(`${path}.file`, `not a file: ${source}`)
      else if (found === 0) issue(`${path}.file`, `the file is empty: ${source}`)
      else if (found > maxFileSize)
         issue(
            `${path}.file`,
            `the file is ${formatFileSize(found)}, more than maxFileSize (${formatFileSize(
               maxFileSize
            )})`
         )
      else size = found
   }
   if (!valid) return null

   const mediaKey = key as string
   const mime = mediaMimeForKey(mediaKey)!
   const dimensions = await readMediaDimensions(source, mime, size)
   const prepared: PreparedMediaFile = {
      key: mediaKey,
      path,
      source,
      folder: mediaSyncFolder(mediaKey),
      mime,
      size,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
   }
   if (alt !== undefined) prepared.alt = alt as string | null
   if (item.focalX !== undefined || item.focalY !== undefined) {
      prepared.focalX = item.focalX == null ? null : roundFocalCoordinate(item.focalX as number)
      prepared.focalY = item.focalY == null ? null : roundFocalCoordinate(item.focalY as number)
   }
   return prepared
}

export async function prepareMediaFiles(
   value: unknown,
   options: PrepareMediaFilesOptions,
   add: AddIssue
): Promise<{ files: PreparedMediaFile[]; declared: Set<string> }> {
   const declared = new Set<string>()
   if (value === undefined) return { files: [], declared }
   if (!Array.isArray(value)) {
      add('media', 'expected an array of { "key", "file", "alt"?, "focalX"?, "focalY"? }')
      return { files: [], declared }
   }
   const storage = storageIssue(options.media)
   if (storage && value.length) add('media', storage)
   const maxFileSize = maxFileSizeOf(options.media)
   if (!Number.isInteger(maxFileSize) || maxFileSize <= 0)
      add('media', `maxFileSize must be a positive integer number of bytes, got ${maxFileSize}`)
   const root = options.root ?? process.cwd()
   const owners = new Map<string, string>()
   const files: PreparedMediaFile[] = []
   for (const [index, item] of value.entries()) {
      const path = `media.${index}`
      const key = isRecord(item) && typeof item.key === 'string' ? item.key : null
      if (key !== null) {
         declared.add(key)
         const owner = owners.get(key)
         if (owner) add(`${path}.key`, `same key as ${owner}`)
         else owners.set(key, path)
      }
      const prepared = await prepareMediaFile(item, path, root, maxFileSize, add)
      if (prepared) files.push(prepared)
   }
   return { files, declared }
}

async function writeFilesystemMedia(
   dir: string,
   file: PreparedMediaFile,
   force: boolean
): Promise<boolean> {
   const target = mediaFilePath(dir, file.key)
   if (!target) throw new Error(`[nuxt-cms] seed: ${file.path}.key: invalid key ${file.key}`)
   if (!force && (await fileSize(target)) === file.size) return false
   await mkdir(dirname(target), { recursive: true })
   const temp = `${target}.${randomUUID()}.upload`
   try {
      await copyFile(file.source, temp)
      await rename(temp, target)
   } catch (error) {
      await rm(temp, { force: true })
      throw error
   }
   return true
}

async function bucketErrorCode(res: Response): Promise<string> {
   const text = await res.text().catch(() => '')
   const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1]
   return code ? ` ${code}` : ''
}

async function forEachLimited<T>(items: T[], limit: number, run: (item: T) => Promise<void>) {
   let next = 0
   let failure: unknown = null
   const worker = async () => {
      while (next < items.length && failure === null) {
         const item = items[next++]!
         try {
            await run(item)
         } catch (error) {
            failure ??= error
         }
      }
   }
   await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
   if (failure !== null) throw failure
}

export async function uploadMediaFiles(
   media: CmsSeedMedia | null | undefined,
   files: PreparedMediaFile[],
   options: { force?: boolean } = {}
): Promise<CmsMediaImportResult> {
   const result: CmsMediaImportResult = {
      keys: files.map((file) => file.key),
      uploaded: [],
      skipped: [],
   }
   if (!files.length) return result
   const issue = storageIssue(media)
   if (issue) throw new Error(`[nuxt-cms] seed: ${issue}`)
   const force = options.force ?? false
   const written = new Set<string>()
   if (media!.storage === 'filesystem') {
      const dir = media!.dir!
      await forEachLimited(files, UPLOAD_CONCURRENCY, async (file) => {
         if (await writeFilesystemMedia(dir, file, force)) written.add(file.key)
      })
   } else {
      const config = media as S3MediaConfig & { region?: string }
      const s3 = { ...config, region: config.region || 'auto' }
      const client = s3Client(s3)
      await forEachLimited(files, UPLOAD_CONCURRENCY, async (file) => {
         const url = s3ObjectUrl(s3, file.key)
         if (!force && (await s3ObjectSize(client, url)) === file.size) return
         const body = new Uint8Array(await readFile(file.source))
         const res = await putS3Object(client, url, body, file.mime)
         if (!res.ok)
            throw new Error(
               `[nuxt-cms] seed: ${file.path}: uploading ${file.key} to the bucket failed (${
                  res.status
               }${await bucketErrorCode(res)})`
            )
         written.add(file.key)
      })
   }
   for (const file of files)
      (written.has(file.key) ? result.uploaded : result.skipped).push(file.key)
   return result
}

export function requireMediaTable(tables: Record<string, unknown>): SQLiteTable {
   const table = tables.cms_media as SQLiteTable | undefined
   if (!table)
      throw new Error('[nuxt-cms] No cms_media table in the schema. Run `nuxi prepare` first.')
   return table
}

export function mediaRowStatements(
   db: MediaDb,
   tables: Record<string, unknown>,
   files: PreparedMediaFile[]
): PromiseLike<unknown>[] {
   if (!files.length) return []
   const table = requireMediaTable(tables)
   const keyColumn = (table as unknown as Record<string, AnySQLiteColumn>).key!
   return files.map((file) => {
      const set: Record<string, unknown> = {
         folder: file.folder,
         mime: file.mime,
         size: file.size,
         width: file.width,
         height: file.height,
      }
      if (file.alt !== undefined) set.alt = file.alt
      if (file.focalX !== undefined) set.focalX = file.focalX
      if (file.focalY !== undefined) set.focalY = file.focalY
      return db
         .insert(table)
         .values(
            withTimestamps(table, { key: file.key, alt: null, focalX: null, focalY: null, ...set })
         )
         .onConflictDoUpdate({ target: keyColumn, set })
   })
}
