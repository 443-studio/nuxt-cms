import { buildSchema, parse, validate } from 'graphql'
import { describe, expect, it } from 'vitest'
import { collectBlockComponents } from '../src/blocks-codegen'
import { validateCmsContent } from '../src/runtime/seed'
import { collectionQuery, singleQuery } from '../src/queries-codegen'
import { validateConfig } from '../src/schema-codegen'
import { renderTypesFile } from '../src/types-codegen'
import { blockSignature } from '../src/runtime/shared/block-signature'
import { pasteBlocks } from '../src/runtime/shared/clipboard'
import { renderGraphqlSdl } from '../src/runtime/shared/graphql-sdl'
import type { CmsConfig, FieldConfig } from '../src/runtime/shared/index'
import { normalizeCmsConfig, publicBlocks } from '../src/runtime/shared/index'
import { blockSummary } from '../src/runtime/shared/preview'
import { searchCmsLabels } from '../src/runtime/shared/search'
import { translationProgress } from '../src/runtime/shared/translations'
import { buildEntrySchema } from '../src/runtime/shared/validation'
import { I18N } from './fixtures'

function emptyBlocksConfig(): CmsConfig {
   return normalizeCmsConfig(
      {
         homepage: {
            id: 'homepage',
            label: 'Homepage',
            kind: 'single',
            fields: {
               sections: {
                  label: 'Sections',
                  type: 'blocks',
                  blocks: {
                     divider: { label: 'Divider', component: 'SectionDivider' },
                     spacer: { label: 'Spacer', fields: {} },
                     text: {
                        label: 'Text',
                        fields: {
                           body: { label: 'Body', type: 'text', translatable: true },
                           inner: {
                              label: 'Inner',
                              type: 'blocks',
                              blocks: { rule: { label: 'Rule', fields: {} } },
                           },
                        },
                     },
                  },
               },
            },
         },
         events: {
            id: 'events',
            label: 'Events',
            kind: 'collection',
            titleField: 'title',
            fields: {
               title: { label: 'Title', type: 'text', required: true },
               body: {
                  label: 'Body',
                  type: 'blocks',
                  blocks: { divider: { label: 'Divider', fields: {} } },
               },
            },
         },
      } as unknown as CmsConfig,
      I18N
   )
}

const config = emptyBlocksConfig()
const sections = config.homepage!.fields.sections as FieldConfig

describe('blocks without fields', () => {
   it('fills omitted block fields with an empty map when normalizing', () => {
      expect(sections.blocks!.divider!.fields).toEqual({})
   })

   it('passes the config validation, with fields omitted or empty', () => {
      expect(validateConfig(config, I18N)).toEqual([])
      const raw = {
         homepage: {
            id: 'homepage',
            label: 'Homepage',
            kind: 'single',
            fields: {
               sections: {
                  label: 'Sections',
                  type: 'blocks',
                  blocks: { divider: { label: 'Divider' } },
               },
            },
         },
      } as unknown as CmsConfig
      expect(validateConfig(raw, I18N)).toEqual([])
   })

   it('still refuses fields that are not an object', () => {
      const broken = emptyBlocksConfig()
      ;(broken.events!.fields.body!.blocks!.divider as unknown as { fields: unknown }).fields = []
      expect(validateConfig(broken, I18N)).toContain(
         "cms.config entry 'events', field 'body', block 'divider': fields must be an object of fields ({} for a block without fields)"
      )
   })

   it('generates a valid GraphQL schema where the block type holds only type', () => {
      const sdl = renderGraphqlSdl(config)
      const schema = buildSchema(sdl)
      expect(sdl).toContain(
         'type HomepageSectionsDivider implements HomepageSectionsBlock {\n  type: String!\n}'
      )
      expect(sdl).toContain('interface HomepageSectionsBlock {\n  type: String!\n}')
      expect(sdl).toContain(
         'type EventsBodyDivider implements EventsBodyBlock {\n  type: String!\n}'
      )
      expect(sdl).toContain(
         'type HomepageSectionsTextInnerRule implements HomepageSectionsTextInnerBlock {\n  type: String!\n}'
      )
      const single = singleQuery(config, 'homepage', config.homepage!)
      const list = collectionQuery(config, 'events', config.events!)
      expect(validate(schema, parse(single))).toEqual([])
      expect(validate(schema, parse(list))).toEqual([])
      expect(single).not.toContain('... on HomepageSectionsDivider')
      expect(single).toContain('inner { __typename type }')
      expect(list).toContain('body { __typename type }')
   })

   it('generates an empty props interface and the block type with its type literal', () => {
      const types = renderTypesFile(config)
      expect(types).toContain('export interface HomepageSectionsDividerProps {}')
      expect(types).toContain(
         "export interface HomepageSectionsDivider extends HomepageSectionsDividerProps {\n  __typename?: 'HomepageSectionsDivider'\n  type: 'divider'\n}"
      )
      expect(types).toContain(
         'export type HomepageSectionsBlock = HomepageSectionsDivider | HomepageSectionsSpacer | HomepageSectionsText'
      )
   })

   it('collects the component of a block without fields', () => {
      expect(collectBlockComponents(config)).toContainEqual(
         expect.objectContaining({ block: 'divider', component: 'SectionDivider' })
      )
   })

   it('validates, pastes, signs and summarizes an item with no values', () => {
      const schema = buildEntrySchema({ ...config.homepage!, config }, I18N)
      const values = { sections: [{ type: 'divider' }, { type: 'spacer', hidden: true }] }
      const parsed = schema.safeParse(values)
      expect(parsed.success).toBe(true)
      expect(parsed.data).toMatchObject(values)
      expect(publicBlocks(sections, values.sections)).toEqual([{ type: 'divider' }])
      const pasted = pasteBlocks([], 0, [{ type: 'divider', stray: 'x' }], sections, I18N)
      expect(pasted.list).toEqual([{ type: 'divider' }])
      expect(blockSignature(sections.blocks!.divider!)).toBe(
         blockSignature(sections.blocks!.spacer!)
      )
      expect(blockSummary(sections.blocks!.divider!, { type: 'divider' }, 'en', 'en')).toBe('')
      expect(translationProgress(config.homepage!.fields, values, I18N).it).toMatchObject({
         total: 0,
         state: 'complete',
      })
      expect(searchCmsLabels(config, 'divider').hits[0]).toMatchObject({ type: 'block' })
   })

   it('seeds a block without fields and refuses values for it', async () => {
      const issues = await validateCmsContent({
         config,
         i18n: I18N,
         snapshot: {
            singles: {
               homepage: {
                  sections: [
                     { type: 'divider' },
                     { type: 'spacer', hidden: true },
                     { type: 'divider', label: 'x' },
                  ],
               },
            },
            collections: { events: [{ title: 'Fair', body: [{ type: 'divider' }] }] },
         },
      })
      expect(issues).toEqual([
         {
            path: 'singles.homepage.sections.2.label',
            message: 'unknown field "label"; allowed: "type", "hidden"',
         },
      ])
   })
})
