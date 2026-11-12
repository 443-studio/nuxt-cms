import { defineComponent, h } from '#imports'
import { CMS_FIELD_ATTRIBUTE, cmsFieldMarking } from '../preview/field-marker'

export default defineComponent({
   name: 'CmsField',
   props: {
      name: { type: String, required: true },
      as: { type: String, default: 'span' },
   },
   setup(props, { slots }) {
      return () =>
         h(
            props.as,
            cmsFieldMarking.value ? { [CMS_FIELD_ATTRIBUTE]: props.name } : null,
            slots.default?.()
         )
   },
})
