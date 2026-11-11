export default defineNitroPlugin((nitroApp) => {
   if (!import.meta.dev) return
   nitroApp.hooks.hook('cms:entry:change', ({ entry, action, ids, user }) => {
      console.info(`[cms] ${entry} ${action} ${ids.join(', ')} by ${user.email}`)
   })
   nitroApp.hooks.hook('cms:media:change', ({ action, keys, folder }) => {
      console.info(`[cms] media ${action} ${keys.join(', ') || folder}`)
   })
})
