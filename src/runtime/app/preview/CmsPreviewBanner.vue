<template>
   <div
      v-if="!dismissed"
      class="cms-preview-banner k-root"
      data-preset="default"
      data-theme="dark"
      role="status"
   >
      <span class="cms-preview-banner-badge">Preview</span>
      <span class="cms-preview-banner-text">
         Unpublished version, not visible to visitors.
         <span v-if="expires">Link expires {{ expires }}.</span>
      </span>
      <button
         type="button"
         class="cms-preview-banner-close"
         aria-label="Hide the preview notice"
         title="Hide"
         @click="dismissed = true"
      >
         <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
               d="M4 4l8 8M12 4l-8 8"
               stroke="currentColor"
               stroke-width="1.6"
               stroke-linecap="round"
            />
         </svg>
      </button>
   </div>
</template>

<script setup lang="ts">
import tokensCss from '@xleddyl/443-components-vue/tokens.css?inline'
import { computed, onMounted, ref, watch } from 'vue'
import type { CmsPreviewMode } from '../../shared/index'

const props = defineProps<{ mode: CmsPreviewMode }>()

const dismissed = ref(false)

onMounted(() => {
   if (document.querySelector('style[data-cms-tokens]')) return
   const style = document.createElement('style')
   style.textContent = tokensCss
   style.dataset.cmsTokens = ''
   document.head.appendChild(style)
})

watch(
   () => props.mode.id,
   () => {
      dismissed.value = false
   }
)

const expires = computed(() => {
   const date = new Date(props.mode.expiresAt)
   if (Number.isNaN(date.getTime())) return ''
   return `on ${date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
})
</script>

<style scoped>
.cms-preview-banner {
   position: fixed;
   right: 16px;
   bottom: 16px;
   left: 16px;
   z-index: 2147483000;
   display: flex;
   align-items: center;
   gap: 10px;
   width: max-content;
   max-width: calc(100vw - 32px);
   margin-inline: auto;
   padding: 8px 8px 8px 10px;
   border-radius: var(--k-radius-xl);
   background: var(--k-elevated);
   color: var(--k-text);
   box-shadow: var(--k-shadow-overlay);
   font: 500 13px/1.4 var(--k-font-sans);
}

.cms-preview-banner-badge {
   flex: none;
   padding: 2px 8px;
   border-radius: var(--k-radius-full);
   background: var(--k-warning);
   color: var(--k-text-inverted);
   font-size: 11px;
   font-weight: 700;
   letter-spacing: 0.04em;
   text-transform: uppercase;
}

.cms-preview-banner-text {
   min-width: 0;
}

.cms-preview-banner-close {
   display: grid;
   flex: none;
   place-items: center;
   width: 24px;
   height: 24px;
   padding: 0;
   border: 0;
   border-radius: var(--k-radius-full);
   background: transparent;
   color: var(--k-text-muted);
   cursor: pointer;
   transition:
      background-color var(--k-duration) var(--k-ease),
      color var(--k-duration) var(--k-ease);
}

.cms-preview-banner-close:hover,
.cms-preview-banner-close:focus-visible {
   background: var(--k-hover);
   color: var(--k-text);
}

.cms-preview-banner-close:focus-visible {
   outline: 2px solid var(--k-ring);
   outline-offset: 2px;
}
</style>
