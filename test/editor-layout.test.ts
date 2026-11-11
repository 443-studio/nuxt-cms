import { describe, expect, it } from 'vitest'
import {
   CMS_EDITOR_PANEL_LIMITS,
   CMS_EDITOR_RESIZE_STEP,
   clampPanelWidth,
   defaultEditorLayout,
   panelWidthForKey,
   parseEditorLayout,
} from '../src/runtime/shared/editor-layout'

const tree = CMS_EDITOR_PANEL_LIMITS.tree
const inspector = CMS_EDITOR_PANEL_LIMITS.inspector

describe('visual editor layout', () => {
   it('clamps panel widths to their limits', () => {
      expect(clampPanelWidth(10, tree)).toBe(tree.min)
      expect(clampPanelWidth(9999, tree)).toBe(tree.max)
      expect(clampPanelWidth(300.6, tree)).toBe(301)
      expect(clampPanelWidth(Number.NaN, tree)).toBe(tree.initial)
   })

   it('reads a saved layout and falls back on bad data', () => {
      expect(parseEditorLayout(null)).toEqual(defaultEditorLayout())
      expect(parseEditorLayout('{oops')).toEqual(defaultEditorLayout())
      expect(parseEditorLayout('[]')).toEqual(defaultEditorLayout())
      expect(
         parseEditorLayout(
            JSON.stringify({
               tree: { width: 320, collapsed: true },
               inspector: { width: 5000, collapsed: 'yes' },
            })
         )
      ).toEqual({
         tree: { width: 320, collapsed: true },
         inspector: { width: inspector.max, collapsed: false },
      })
      expect(parseEditorLayout(JSON.stringify({ tree: { width: '400' } })).tree.width).toBe(
         tree.initial
      )
   })

   it('resizes with the arrow keys toward the side the panel grows', () => {
      expect(panelWidthForKey('ArrowRight', 300, tree, 'right')).toBe(300 + CMS_EDITOR_RESIZE_STEP)
      expect(panelWidthForKey('ArrowLeft', 300, tree, 'right')).toBe(300 - CMS_EDITOR_RESIZE_STEP)
      expect(panelWidthForKey('ArrowLeft', 400, inspector, 'left')).toBe(
         400 + CMS_EDITOR_RESIZE_STEP
      )
      expect(panelWidthForKey('ArrowLeft', tree.min, tree, 'right')).toBe(tree.min)
      expect(panelWidthForKey('Home', 350, tree, 'right')).toBe(tree.min)
      expect(panelWidthForKey('End', 350, inspector, 'left')).toBe(inspector.max)
      expect(panelWidthForKey('Enter', 350, tree, 'right')).toBeNull()
   })
})
