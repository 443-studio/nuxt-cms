<template>
   <KModal
      v-model:open="open"
      title="Share preview"
      description="Anyone with the link can see the saved version of this item on the site, even while it is a draft or scheduled. No account needed. Changes you save later show up in the link too; unsaved changes never do."
      size="md"
   >
      <KStack gap="lg">
         <KAlert
            v-if="dirty"
            tone="warning"
            role="status"
            title="Unsaved changes"
            description="The link shows the last saved version. Save first to share your latest edits."
         />

         <KAlert
            v-if="created"
            tone="accent"
            role="status"
            :icon="cmsIcon('link')"
            title="Link ready"
            class="cms-share-created"
         >
            <p>Copy it now: for security it is stored hashed and does not show again.</p>
            <KInput
               :model-value="created"
               readonly
               aria-label="Preview link"
               class="cms-share-url k-mono"
            />
            <template #actions>
               <KCopyButton
                  :value="created"
                  label="Copy link"
                  copied-label="Copied"
                  show-label
                  variant="soft"
                  tone="accent"
               />
               <KButton label="Done" size="sm" @click="created = null" />
            </template>
         </KAlert>

         <KStack gap="md">
            <KGrid :columns="i18n.locales.length > 1 ? 2 : 1">
               <KFormField label="Expires after">
                  <KSegmentedControl
                     v-model="duration"
                     :options="durationOptions"
                     size="sm"
                     required
                  />
               </KFormField>
               <KFormField v-if="i18n.locales.length > 1" label="Language">
                  <KSelect v-model="locale" :options="localeOptions" />
               </KFormField>
            </KGrid>
            <KStack direction="row" justify="end" gap="sm">
               <KButton
                  v-if="dirty"
                  label="Save and create link"
                  size="sm"
                  :loading="busy"
                  @click="saveAndCreate"
               />
               <KButton
                  :label="dirty ? 'Create link from saved version' : 'Create link'"
                  size="sm"
                  :variant="dirty ? 'soft' : 'solid'"
                  :tone="dirty ? 'neutral' : 'accent'"
                  :loading="busy"
                  @click="create"
               />
            </KStack>
         </KStack>

         <KStack gap="sm">
            <span class="k-label">Active links</span>
            <KRecordList
               :items="linkItems"
               :loading="loading"
               :skeleton-rows="2"
               label="Active links"
               empty-text="No active links for this item."
               empty-variant="hint"
            >
               <template #action="{ item }">
                  <KButton
                     label="Revoke"
                     variant="ghost"
                     tone="danger"
                     size="sm"
                     @click="revokeById(item.id)"
                  />
               </template>
            </KRecordList>
         </KStack>
      </KStack>
   </KModal>
</template>

<script setup lang="ts">
import type { CmsCreatedPreviewLink, CmsPreviewLink, CmsPreviewLinkDuration } from '#nuxt-cms'
import { DEFAULT_PREVIEW_LINK_DURATION, PREVIEW_LINK_DURATIONS } from '#nuxt-cms'
import type { RecordListItem } from '@xleddyl/443-components-vue'
import {
   Alert as KAlert,
   Button as KButton,
   CopyButton as KCopyButton,
   FormField as KFormField,
   Grid as KGrid,
   Input as KInput,
   Modal as KModal,
   RecordList as KRecordList,
   SegmentedControl as KSegmentedControl,
   Select as KSelect,
   Stack as KStack,
   toast,
} from '@xleddyl/443-components-vue'
import { computed, ref, watch } from '#imports'
import { useCmsConfirm } from '../../composables/cms-confirm'
import { useCmsRuntime } from '../../composables/cms-runtime'
import { cmsApi } from '../../utils/api'
import { cmsIcon, errorMessage } from '../../utils/ui'

const props = defineProps<{
   entryName: string
   itemId: string
   dirty: boolean
   locale?: string
   save: () => Promise<boolean>
}>()

const open = defineModel<boolean>('open', { required: true })

const { i18n } = useCmsRuntime()
const confirmAction = useCmsConfirm()

const durationOptions = PREVIEW_LINK_DURATIONS.map(({ value, label }) => ({ value, label }))
const localeOptions = i18n.locales.map((code) => ({ value: code, label: code.toUpperCase() }))

const duration = ref<CmsPreviewLinkDuration>(DEFAULT_PREVIEW_LINK_DURATION)
const locale = ref(props.locale ?? i18n.defaultLocale)
const links = ref<CmsPreviewLink[]>([])
const loading = ref(false)
const busy = ref(false)
const created = ref<string | null>(null)

const endpoint = () =>
   `/api/cms/preview-links/${encodeURIComponent(props.entryName)}/${encodeURIComponent(
      props.itemId
   )}`

function formatDate(value: string) {
   return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

async function load() {
   loading.value = true
   try {
      links.value = await cmsApi<CmsPreviewLink[]>(endpoint())
   } catch (error) {
      links.value = []
      toast.error('Could not load the preview links', { description: errorMessage(error) })
   } finally {
      loading.value = false
   }
}

watch(open, (value) => {
   if (!value) {
      created.value = null
      return
   }
   locale.value = props.locale ?? i18n.defaultLocale
   void load()
})

async function copy(url: string) {
   try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied')
   } catch {
      toast.success('Link created', { description: 'Copy it from the box.' })
   }
}

async function create() {
   busy.value = true
   try {
      const result = await cmsApi<CmsCreatedPreviewLink>(endpoint(), {
         method: 'POST',
         body: { duration: duration.value, locale: i18n.locales.length ? locale.value : null },
      })
      created.value = new URL(result.url, window.location.origin).href
      links.value = [...links.value, result.link].sort((a, b) =>
         a.expiresAt.localeCompare(b.expiresAt)
      )
      await copy(created.value)
   } catch (error) {
      toast.error('Could not create the link', { description: errorMessage(error) })
   } finally {
      busy.value = false
   }
}

async function saveAndCreate() {
   if (await props.save()) await create()
}

const linkItems = computed<RecordListItem[]>(() =>
   links.value.map((link) => ({
      id: link.id,
      title: link.path,
      description: `Expires ${formatDate(link.expiresAt)}${
         link.createdBy ? ` · by ${link.createdBy}` : ''
      }`,
      badge: i18n.locales.length > 1 && link.locale ? { label: link.locale } : undefined,
   }))
)

function revokeById(id: RecordListItem['id']) {
   const link = links.value.find((item) => item.id === id)
   if (link) void revoke(link)
}

async function revoke(link: CmsPreviewLink) {
   if (
      !(await confirmAction({
         title: 'Revoke this link?',
         description: `The link to ${link.path} stops working right away.`,
         confirmLabel: 'Revoke',
      }))
   )
      return
   try {
      await cmsApi(`${endpoint()}/${encodeURIComponent(link.id)}`, { method: 'DELETE' })
      links.value = links.value.filter((item) => item.id !== link.id)
      toast.success('Link revoked')
   } catch (error) {
      toast.error('Revoke failed', { description: errorMessage(error) })
   }
}
</script>
