import { AwsClient } from 'aws4fetch'

export interface S3MediaConfig {
   endpoint: string
   region: string
   bucket: string
   accessKeyId: string
   secretAccessKey: string
}

export function encodeKey(key: string) {
   return key.split('/').map(encodeURIComponent).join('/')
}

export function s3Client(media: S3MediaConfig) {
   return new AwsClient({
      accessKeyId: media.accessKeyId,
      secretAccessKey: media.secretAccessKey,
      region: media.region,
      service: 's3',
   })
}

export function s3BucketUrl(media: S3MediaConfig) {
   return `${media.endpoint.replace(/\/+$/, '')}/${media.bucket}`
}

export function s3ObjectUrl(media: S3MediaConfig, key: string) {
   return `${s3BucketUrl(media)}/${encodeKey(key)}`
}

export function putS3Object(
   client: AwsClient,
   url: string,
   body: Uint8Array<ArrayBuffer>,
   contentType: string
) {
   return client.fetch(url, {
      method: 'PUT',
      body,
      headers: { 'content-type': contentType, 'content-length': String(body.byteLength) },
   })
}

export async function s3ObjectSize(client: AwsClient, url: string): Promise<number | null> {
   const res = await client.fetch(url, { method: 'HEAD' })
   if (!res.ok) return null
   const length = Number(res.headers.get('content-length'))
   return Number.isFinite(length) ? length : null
}
