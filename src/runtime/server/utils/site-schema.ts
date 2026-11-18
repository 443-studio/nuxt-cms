import { z } from 'zod'
import type { CmsI18n } from '../../shared/index'
import { SITE_TEXT_LIMITS, titleTemplateErrors } from '../../shared/index'

function localeTextSchema(max: number, locales: string[]) {
   return z
      .record(z.string(), z.string().max(max))
      .nullable()
      .superRefine((value, context) => {
         for (const locale of Object.keys(value ?? {})) {
            if (!locales.includes(locale))
               context.addIssue({ code: 'custom', message: `Unknown locale: ${locale}` })
         }
      })
      .transform((value) => {
         const entries = Object.entries(value ?? {})
            .map(([locale, text]) => [locale, text.trim()] as const)
            .filter(([, text]) => text)
         return entries.length ? Object.fromEntries(entries) : null
      })
}

export function siteSettingsLocales(i18n: CmsI18n): string[] {
   return i18n.locales.length ? i18n.locales : [i18n.defaultLocale]
}

export function siteSettingsSchema(i18n: CmsI18n) {
   const locales = siteSettingsLocales(i18n)
   return z
      .object({
         name: localeTextSchema(SITE_TEXT_LIMITS.name, locales),
         titleTemplate: z
            .string()
            .max(SITE_TEXT_LIMITS.titleTemplate)
            .nullable()
            .transform((value) => value?.trim() || null)
            .superRefine((value, context) => {
               for (const message of value ? titleTemplateErrors(value) : [])
                  context.addIssue({ code: 'custom', message })
            }),
         description: localeTextSchema(SITE_TEXT_LIMITS.description, locales),
         image: z.string().min(1).max(1024).nullable(),
         hidden: z.boolean(),
      })
      .strict()
}
