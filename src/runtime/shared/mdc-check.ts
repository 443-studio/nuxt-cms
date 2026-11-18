import type { CmsMdcCheck, CmsMdcCheckIssue } from './blocks-mdc'
import type { CmsConfig, CmsI18n, CmsValidate, FieldConfig } from './index'
import { buildEntrySchema, entryValidationWarnings } from './validation'

export function mdcSchemaCheck(
   entry: { fields: Record<string, FieldConfig>; validate?: CmsValidate },
   i18n: CmsI18n,
   config?: CmsConfig
): CmsMdcCheck {
   const schema = buildEntrySchema({ fields: entry.fields, validate: entry.validate, config }, i18n)
   return (values) => {
      const issues: CmsMdcCheckIssue[] = []
      const result = schema.safeParse(values)
      if (!result.success)
         for (const issue of result.error.issues)
            issues.push({ path: issue.path, message: issue.message })
      for (const warning of entryValidationWarnings(entry, values, i18n))
         issues.push({ path: warning.path, message: warning.message, level: 'warning' })
      return issues
   }
}
