import type { H3Event } from 'h3'
import type { NitroApp } from 'nitropack/types'
import { useRuntimeConfig } from '#imports'
import type { CmsHookContext, CmsRuntimeHooks } from '../../shared/hooks'
import { CMS_ENTRY_CHANGE_HOOK, CMS_MEDIA_CHANGE_HOOK } from '../../shared/hooks'
import type { CmsWebhookPayload } from '../../webhooks'
import {
   deliverWebhooks,
   entryWebhookPayload,
   mediaWebhookPayload,
   webhookTargets,
} from '../utils/webhooks'

function targetsFor(event: H3Event) {
   const { webhooks } = useRuntimeConfig(event).cms as { webhooks?: unknown }
   return webhookTargets(webhooks)
}

function deliver(payload: CmsWebhookPayload, { event }: CmsHookContext) {
   const targets = targetsFor(event)
   return targets.length ? deliverWebhooks(targets, payload) : undefined
}

export default (nitroApp: NitroApp) => {
   const hooks = nitroApp.hooks as unknown as {
      hook: <Name extends keyof CmsRuntimeHooks>(name: Name, fn: CmsRuntimeHooks[Name]) => void
   }
   hooks.hook(CMS_ENTRY_CHANGE_HOOK, (change, context) =>
      deliver(entryWebhookPayload(change), context)
   )
   hooks.hook(CMS_MEDIA_CHANGE_HOOK, (change, context) =>
      deliver(mediaWebhookPayload(change), context)
   )
}
