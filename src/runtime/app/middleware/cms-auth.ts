import { defineNuxtRouteMiddleware, navigateTo, useUserSession } from '#imports'
import { useCmsPermissions } from '../composables/cms-permissions'

function requiredPermission(
   name: string | symbol | null | undefined,
   entry: string | null,
   id: string | null
) {
   if (name === 'cms-admin-media') return 'media.read'
   if (!entry) return null
   return id === null && String(name ?? '').endsWith('-new') ? `${entry}.create` : `${entry}.read`
}

export default defineNuxtRouteMiddleware((to) => {
   const { loggedIn } = useUserSession()
   if (!loggedIn.value) {
      return navigateTo('/cms/login')
   }
   const entry =
      typeof to.meta.cmsEntry === 'string'
         ? to.meta.cmsEntry
         : typeof to.params.collection === 'string'
           ? to.params.collection
           : null
   const id = typeof to.params.id === 'string' ? to.params.id : null
   const permission = requiredPermission(to.name, entry, id)
   if (!permission || useCmsPermissions().can(permission)) return
   if (permission.endsWith('.create') && entry) return navigateTo(`/cms/${entry}`)
   return navigateTo('/cms')
})
