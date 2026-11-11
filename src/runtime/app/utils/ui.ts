import type { FieldConfig, FieldType } from '#nuxt-cms'
import { isBuiltinIcon } from '@xleddyl/443-components-vue'

export const CMS_SETTINGS_QUERY = 'settings'

export function cmsSettingsLink(section: string, path = '/cms') {
   return `${path}?${CMS_SETTINGS_QUERY}=${encodeURIComponent(section)}`
}

export function errorMessage(error: unknown): string | undefined {
   const err = error as { data?: { message?: string }; message?: string }
   return err.data?.message ?? err.message
}

export interface CmsResponseIssue {
   path: (string | number)[]
   message: string
}

export function errorIssues(error: unknown): CmsResponseIssue[] {
   const issues = (error as { data?: { data?: { issues?: unknown } } })?.data?.data?.issues
   if (!Array.isArray(issues)) return []
   return issues.filter(
      (issue): issue is CmsResponseIssue =>
         !!issue &&
         typeof issue === 'object' &&
         Array.isArray((issue as CmsResponseIssue).path) &&
         typeof (issue as CmsResponseIssue).message === 'string'
   )
}

const FIELD_ICONS: Record<FieldType, string> = {
   text: 'bars-3-bottom-left',
   richtext: 'document-text',
   number: 'hashtag',
   boolean: 'check-circle',
   date: 'calendar',
   datetime: 'clock',
   email: 'at-symbol',
   slug: 'link',
   select: 'chevron-up-down',
   tags: 'tag',
   json: 'code-bracket',
   media: 'photo',
   relation: 'arrows-right-left',
   link: 'arrow-top-right-on-square',
   blocks: 'squares-2x2',
}

export function fieldIcon(field: FieldConfig) {
   if (field.type === 'select' && field.multiple) return 'list-bullet'
   return FIELD_ICONS[field.type]
}

export function cmsIcon(name: string) {
   return name.includes(':') || isBuiltinIcon(name) ? name : `heroicons:${name}`
}
