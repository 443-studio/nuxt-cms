import { describe, expect, it } from 'vitest'
import { cloneState, mergeSavedState } from '../src/runtime/shared/save-state'

describe('mergeSavedState', () => {
   const submitted = { title: { en: 'Hello' }, slug: null, status: 'draft', body: [{ type: 'a' }] }
   const saved = {
      title: { en: 'Hello' },
      slug: 'hello',
      status: 'published',
      body: [{ type: 'a' }],
   }

   it('takes the saved row when nothing changed during the save', () => {
      const result = mergeSavedState(submitted, cloneState(submitted), saved)
      expect(result).toEqual({ state: saved, clean: true })
      expect(result.state).not.toBe(saved)
   })

   it('keeps the edits made during the save and takes the server values of the rest', () => {
      const current = { ...cloneState(submitted), body: [{ type: 'a' }, { type: 'b' }] }
      const result = mergeSavedState(submitted, current, saved)
      expect(result.clean).toBe(false)
      expect(result.state).toEqual({
         title: { en: 'Hello' },
         slug: 'hello',
         status: 'published',
         body: [{ type: 'a' }, { type: 'b' }],
      })
   })

   it('keeps an edit of a field the server also changed', () => {
      const current = { ...cloneState(submitted), slug: 'typed' }
      expect(mergeSavedState(submitted, current, saved).state.slug).toBe('typed')
   })

   it('is clean when the edits during the save match what the server stored', () => {
      const current = { ...cloneState(submitted), slug: 'hello' }
      expect(mergeSavedState(submitted, current, saved).clean).toBe(true)
   })

   it('treats undefined and null as the same value', () => {
      const result = mergeSavedState({ a: null }, { a: undefined }, { a: 1 })
      expect(result).toEqual({ state: { a: 1 }, clean: true })
   })
})

describe('cloneState', () => {
   it('copies deeply', () => {
      const state = { body: [{ type: 'a' }] }
      const copy = cloneState(state)
      state.body[0]!.type = 'b'
      expect(copy).toEqual({ body: [{ type: 'a' }] })
   })
})
