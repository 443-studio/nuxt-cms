<template>
   <KButton
      v-if="formAction"
      type="submit"
      size="sm"
      :form="formAction.id"
      :loading="formAction.submitting"
   >
      {{ formAction.label }}
   </KButton>
</template>

<script setup lang="ts">
import { Button as KButton } from '@xleddyl/443-components-vue'
import { useCmsSettingsFormAction } from '../../composables/cms-settings-form'

const formAction = useCmsSettingsFormAction()
</script>
