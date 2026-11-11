import { describe, expect, it, vi } from 'vitest'
import { cachedValue } from '../src/runtime/server/utils/cached-value'

describe('cachedValue', () => {
   it('loads once until the ttl runs out', async () => {
      let clock = 0
      const load = vi.fn(async () => clock)
      const cache = cachedValue(load, 100, () => clock)
      expect(await cache.get()).toBe(0)
      clock = 99
      expect(await cache.get()).toBe(0)
      clock = 100
      expect(await cache.get()).toBe(100)
      expect(load).toHaveBeenCalledTimes(2)
   })

   it('shares one load between concurrent reads', async () => {
      const load = vi.fn(async () => 'value')
      const cache = cachedValue(load, 100)
      await Promise.all([cache.get(), cache.get(), cache.get()])
      expect(load).toHaveBeenCalledTimes(1)
   })

   it('reloads after invalidate and drops a load started before it', async () => {
      let version = 1
      let release: () => void = () => {}
      const load = vi.fn(async () => {
         const seen = version
         if (seen === 1) await new Promise<void>((done) => (release = done))
         return seen
      })
      const cache = cachedValue(load, 1000)
      const stale = cache.get()
      version = 2
      cache.invalidate()
      expect(await cache.get()).toBe(2)
      release()
      expect(await stale).toBe(1)
      expect(await cache.get()).toBe(2)
   })

   it('does not keep a failed load', async () => {
      const load = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue('up')
      const cache = cachedValue(load, 1000)
      await expect(cache.get()).rejects.toThrow('down')
      expect(await cache.get()).toBe('up')
   })
})
