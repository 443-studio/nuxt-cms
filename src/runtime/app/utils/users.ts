import type { CmsAccount } from '#nuxt-cms'
import type { Tone } from '@xleddyl/443-components-vue'

interface RoleOption {
   key: string
   label: string
   description?: string | null
}

export const UNKNOWN_ROLE_HINT =
   'This role is not in cms.roles anymore, so the account has no access. Pick a new role.'

export function lastSignIn(account: CmsAccount) {
   if (!account.lastLoginAt) return 'Never signed in'
   return `Last sign-in ${new Date(account.lastLoginAt).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
   })}`
}

export function isKnownRole(role: string, options: readonly RoleOption[]) {
   return options.some((option) => option.key === role)
}

export function roleBadge(
   role: string,
   options: readonly RoleOption[],
   label: (key: string) => string
): { label: string; tone: Tone } {
   return isKnownRole(role, options)
      ? { label: label(role), tone: 'neutral' }
      : { label: `Unknown role: ${role}`, tone: 'warning' }
}
