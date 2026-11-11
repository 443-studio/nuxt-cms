export interface CachedValue<T> {
   get(): Promise<T>
   invalidate(): void
}

export function cachedValue<T>(
   load: () => Promise<T>,
   ttlMs: number,
   now: () => number = Date.now
): CachedValue<T> {
   let value: { data: T; expiresAt: number } | null = null
   let pending: Promise<T> | null = null
   let generation = 0

   return {
      async get() {
         if (value && value.expiresAt > now()) return value.data
         if (pending) return pending
         const started = generation
         pending = load()
            .then((data) => {
               if (started === generation) value = { data, expiresAt: now() + ttlMs }
               return data
            })
            .finally(() => {
               if (started === generation) pending = null
            })
         return pending
      },
      invalidate() {
         generation += 1
         value = null
         pending = null
      },
   }
}
