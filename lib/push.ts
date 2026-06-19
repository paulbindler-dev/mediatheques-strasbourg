import webpush from 'web-push'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

export type PushPayload = { title: string; body: string; url?: string }

export async function sendPush(
  endpoint: string,
  p256dh: string,
  authKey: string,
  payload: PushPayload,
) {
  return webpush.sendNotification(
    { endpoint, keys: { p256dh, auth: authKey } },
    JSON.stringify(payload),
  )
}
