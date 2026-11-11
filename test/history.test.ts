import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CmsHistoryStatus } from '../src/runtime/shared/history'
import { createCmsHistory } from '../src/runtime/shared/history'

function setup(initial: Record<string, unknown>, options: { max?: number; omit?: string[] } = {}) {
   const state = { value: initial }
   const selected = { value: null as number | null }
   const updates: CmsHistoryStatus[] = []
   const history = createCmsHistory({
      state: () => state.value,
      selected: () => selected.value,
      restore: (values, index) => {
         state.value = values
         selected.value = index
      },
      delay: 300,
      onUpdate: (status) => updates.push(status),
      ...options,
   })
   function set(next: Record<string, unknown>) {
      state.value = next
      history.observe()
   }
   function edit(key: string, value: unknown, coalesce?: string) {
      history.change(coalesce)
      set({ ...state.value, [key]: value })
   }
   return { state, selected, history, updates, set, edit }
}

describe('editor history', () => {
   beforeEach(() => {
      vi.useFakeTimers()
   })

   afterEach(() => {
      vi.useRealTimers()
   })

   it('starts clean', () => {
      const { history } = setup({ title: 'a' })
      expect(history.canUndo()).toBe(false)
      expect(history.canRedo()).toBe(false)
      expect(history.undo()).toBe(false)
      expect(history.redo()).toBe(false)
   })

   it('undoes and redoes discrete changes', () => {
      const { state, history, edit } = setup({ title: 'a', body: null })
      edit('body', [{ type: 'text' }])
      edit('body', [{ type: 'text' }, { type: 'image' }])
      expect(history.canUndo()).toBe(true)
      history.undo()
      expect(state.value.body).toEqual([{ type: 'text' }])
      expect(history.canRedo()).toBe(true)
      history.undo()
      expect(state.value).toEqual({ title: 'a', body: null })
      expect(history.canUndo()).toBe(false)
      history.redo()
      history.redo()
      expect(state.value.body).toEqual([{ type: 'text' }, { type: 'image' }])
      expect(history.canRedo()).toBe(false)
   })

   it('restores the selection of each step', () => {
      const { state, selected, history, edit } = setup({ body: ['a', 'b', 'c'] })
      selected.value = 2
      history.change()
      state.value = { body: ['a', 'b'] }
      selected.value = null
      history.observe()
      history.undo()
      expect(state.value.body).toEqual(['a', 'b', 'c'])
      expect(selected.value).toBe(2)
      history.redo()
      expect(state.value.body).toEqual(['a', 'b'])
      expect(selected.value).toBeNull()
      edit('body', ['a'])
      expect(selected.value).toBeNull()
   })

   it('coalesces rapid typing into one step', () => {
      const { state, history, edit } = setup({ title: '' })
      edit('title', 'h', 'title')
      edit('title', 'he', 'title')
      edit('title', 'hey', 'title')
      expect(history.canUndo()).toBe(true)
      vi.advanceTimersByTime(300)
      edit('title', 'hey!', 'title')
      vi.advanceTimersByTime(300)
      history.undo()
      expect(state.value.title).toBe('hey')
      history.undo()
      expect(state.value.title).toBe('')
      expect(history.canUndo()).toBe(false)
   })

   it('flushes pending typing before undo and on a different field', () => {
      const { state, history, edit } = setup({ title: '', slug: '' })
      edit('title', 'abc', 'title')
      edit('slug', 'x', 'slug')
      history.undo()
      expect(state.value).toEqual({ title: 'abc', slug: '' })
      history.undo()
      expect(state.value).toEqual({ title: '', slug: '' })
   })

   it('drops the redo branch after a new change', () => {
      const { state, history, edit } = setup({ n: 0 })
      edit('n', 1)
      edit('n', 2)
      history.undo()
      edit('n', 3)
      expect(history.canRedo()).toBe(false)
      history.undo()
      expect(state.value.n).toBe(1)
   })

   it('keeps at most max steps', () => {
      const { state, history, edit } = setup({ n: 0 }, { max: 3 })
      for (let n = 1; n <= 5; n++) edit('n', n)
      while (history.undo());
      expect(state.value.n).toBe(2)
   })

   it('folds outside changes into the current step', () => {
      const { state, history, edit, set } = setup(
         { title: 'a', status: 'draft' },
         { omit: ['status'] }
      )
      edit('title', 'b')
      set({ ...state.value, status: 'published' })
      set({ ...state.value, title: 'B' })
      expect(history.canRedo()).toBe(false)
      history.undo()
      expect(state.value).toEqual({ title: 'a', status: 'published' })
      history.redo()
      expect(state.value).toEqual({ title: 'B', status: 'published' })
   })

   it('returns to the same JSON so a saved state reads as clean', () => {
      const saved = { title: 'a', body: [{ type: 'text', text: 'x' }], status: 'draft' }
      const { state, history, edit } = setup(structuredClone(saved), { omit: ['status'] })
      const snapshot = JSON.stringify(state.value)
      edit('body', [{ type: 'text', text: 'y' }])
      expect(JSON.stringify(state.value)).not.toBe(snapshot)
      history.undo()
      expect(JSON.stringify(state.value)).toBe(snapshot)
   })

   it('ignores no-op changes', () => {
      const { history, edit } = setup({ title: 'a' })
      edit('title', 'a')
      history.flush()
      expect(history.canUndo()).toBe(false)
   })

   it('reports status changes and clears its timer on dispose', () => {
      const { history, updates, edit } = setup({ title: '' })
      edit('title', 'a', 'title')
      expect(updates).toEqual([{ canUndo: true, canRedo: false }])
      history.dispose()
      expect(vi.getTimerCount()).toBe(0)
      history.undo()
      expect(updates.at(-1)).toEqual({ canUndo: false, canRedo: true })
   })
})
