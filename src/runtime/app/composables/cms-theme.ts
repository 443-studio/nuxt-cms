import type { ThemePreference } from '@xleddyl/443-components-vue'
import { useCookie } from '#imports'

export type CmsTheme = ThemePreference

export function useCmsTheme() {
   return useCookie<CmsTheme>('cms-theme', {
      default: () => 'system',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
      path: '/',
   })
}
