import { defineEventHandler } from 'h3'
import { hasPreviewQuery } from '../../shared/index'
import { hasPreviewHeader, markPreviewResponse } from '../utils/preview-links'

export default defineEventHandler((event) => {
   if (hasPreviewQuery(event.path) || hasPreviewHeader(event)) markPreviewResponse(event)
})
