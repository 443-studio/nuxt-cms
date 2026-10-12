import {
   createError,
   defineEventHandler,
   getRequestHeader,
   getValidatedQuery,
   readRawBody,
} from 'h3'
import { z } from 'zod'
import { runBatch, useDb } from '#cms-db'
import { isCollectionKind } from '../../shared/index'
import {
   canTransferCsv,
   IMPORT_MAX_BYTES,
   IMPORT_MODES,
   importSource,
   TRANSFER_FORMATS,
} from '../../shared/transfer'
import { mapConstraintErrors } from '../utils/db-errors'
import {
   checkImportRows,
   importPreview,
   importWriteStatements,
   validateImportRows,
} from '../utils/import'
import { mediaLookup } from '../utils/media-check'
import { getContentI18n, getRegistryEntry } from '../utils/registry'
import { requireAdmin } from '../utils/require-admin'

const querySchema = z.object({
   format: z.enum(TRANSFER_FORMATS),
   mode: z.enum(IMPORT_MODES).default('create'),
   dryRun: z.stringbool().default(true),
})

function tooLarge(): never {
   throw createError({
      statusCode: 413,
      statusMessage: `The file is larger than ${IMPORT_MAX_BYTES / 1024 / 1024} MB`,
   })
}

export default defineEventHandler(async (event) => {
   await requireAdmin(event)
   const { name, entry, table } = getRegistryEntry(event)
   if (!isCollectionKind(entry)) {
      throw createError({ statusCode: 405, statusMessage: 'Only collections can be imported' })
   }
   const { format, mode, dryRun } = await getValidatedQuery(event, querySchema.parse)
   if (format === 'csv' && !canTransferCsv(entry)) {
      throw createError({
         statusCode: 400,
         statusMessage: 'CSV needs an entry without blocks and many-to-many fields',
      })
   }
   if (Number(getRequestHeader(event, 'content-length') ?? 0) > IMPORT_MAX_BYTES) tooLarge()
   const text = (await readRawBody(event, 'utf8')) ?? ''
   if (new TextEncoder().encode(text).length > IMPORT_MAX_BYTES) tooLarge()
   if (!text.trim()) throw createError({ statusCode: 400, statusMessage: 'The file is empty' })

   const i18n = getContentI18n()
   const source = importSource(entry, format, text, i18n)
   const db = useDb()
   const rows = await checkImportRows(validateImportRows(entry, source.rows, i18n), {
      db,
      name,
      entry,
      table,
      mode,
      media: source.errors.length ? null : await mediaLookup(),
   })
   const preview = importPreview(entry, rows, {
      format,
      mode,
      defaultLocale: i18n.defaultLocale,
      errors: source.errors,
   })
   if (dryRun) return preview
   if (preview.errors.length || preview.valid !== preview.total || !preview.total) {
      throw createError({
         statusCode: 400,
         statusMessage: 'The file has errors: check it again and fix them before importing',
         data: preview,
      })
   }

   await mapConstraintErrors(() =>
      runBatch((tx) => importWriteStatements(tx, name, entry, table, rows))
   )
   return { ...preview, imported: true }
})
