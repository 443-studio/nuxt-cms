<template>
   <div class="cms-confirm-groups">
      <section v-for="group in groups" :key="group.title" class="cms-confirm-group">
         <h3 class="cms-confirm-group-title" :title="group.title">{{ group.title }}</h3>
         <ul class="cms-confirm-list">
            <li v-for="link in group.links" :key="link.to + link.meta">
               <NuxtLink :to="link.to" class="cms-confirm-link" @click="emit('close')">
                  <span class="cms-confirm-link-title">{{ link.title }}</span>
                  <span class="cms-confirm-link-meta">{{ link.meta }}</span>
               </NuxtLink>
            </li>
         </ul>
      </section>
   </div>
</template>

<script setup lang="ts">
import type { CmsConfirmGroup } from '../../composables/cms-confirm'

defineProps<{ groups: CmsConfirmGroup[] }>()

const emit = defineEmits<{ close: [] }>()
</script>
