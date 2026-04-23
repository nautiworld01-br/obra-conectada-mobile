import { Platform } from "react-native";
import { env } from "./env";
import { getErrorMessage } from "./errorMessage";
import { supabase } from "./supabase";

export type PushNotificationState =
  | "unsupported"
  | "missing_vapid_key"
  | "permission_prompt"
  | "permission_denied"
  | "subscribed"
  | "not_subscribed";

export type PushSubscriptionRecord = {
  id: string;
  endpoint: string;
  status: "active" | "revoked" | "expired" | "failed_permanent";
  updated_at: string;
  last_seen_at: string;
};

export function getPushSupportState(): PushNotificationState {
  if (!isPushSupported()) {
    return "unsupported";
  }

  if (!env.pushVapidPublicKey) {
    return "missing_vapid_key";
  }

  if (Notification.permission === "denied") {
    return "permission_denied";
  }

  if (Notification.permission === "default") {
    return "permission_prompt";
  }

  return "not_subscribed";
}

export async function getCurrentPushSubscriptionRecord(userId: string) {
  if (!supabase) {
    throw new Error("Supabase nao configurado.");
  }

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, status, updated_at, last_seen_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .is("revoked_at", null)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as PushSubscriptionRecord | null;
}

export async function subscribeToPushNotifications(userId: string) {
  if (!supabase) {
    throw new Error("Supabase nao configurado.");
  }

  if (!isPushSupported()) {
    throw new Error("Este navegador nao suporta notificacoes push da PWA.");
  }

  if (!env.pushVapidPublicKey) {
    throw new Error("Chave publica VAPID nao configurada no app.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Permissao de notificacoes nao concedida.");
  }

  const registration = await ensureServiceWorkerRegistration();
  const existingSubscription = await registration.pushManager.getSubscription();
  const subscription =
    existingSubscription ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(env.pushVapidPublicKey),
    }));

  const serialized = serializePushSubscription(subscription);
  await registerPushSubscription(serialized);
}

async function registerPushSubscription(serialized: { endpoint: string; p256dh: string; auth: string }) {
  if (!supabase) {
    throw new Error("Supabase nao configurado.");
  }

  const { error } = await supabase.functions.invoke("register-push-subscription", {
    body: {
      endpoint: serialized.endpoint,
      p256dh: serialized.p256dh,
      auth: serialized.auth,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
    },
  });

  if (error) {
    throw new Error(`Falha ao salvar inscricao push: ${await getFunctionErrorMessage(error)}`);
  }
}

export async function reconcilePushSubscription(userId: string) {
  if (!supabase || !isPushSupported() || Notification.permission !== "granted") {
    return;
  }

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) {
    return;
  }

  const serialized = serializePushSubscription(subscription);
  await registerPushSubscription(serialized);
}

export async function unsubscribeFromPushNotifications(userId: string) {
  if (!supabase) {
    throw new Error("Supabase nao configurado.");
  }

  const registration = isPushSupported() ? await navigator.serviceWorker.getRegistration() : null;
  const subscription = await registration?.pushManager.getSubscription();
  const endpoint = subscription?.endpoint;

  if (subscription) {
    await subscription.unsubscribe();
  }

  let query = supabase
    .from("push_subscriptions")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("status", "active");

  if (endpoint) {
    query = query.eq("endpoint", endpoint);
  }

  const { error } = await query;
  if (error) {
    throw error;
  }
}

export async function sendSelfTestPushNotification() {
  if (!supabase) {
    throw new Error("Supabase nao configurado.");
  }

  const { data, error } = await supabase.functions.invoke("self-test-push", {
    body: {},
  });

  if (error) {
    throw new Error(`Falha ao enviar notificacao de teste: ${await getFunctionErrorMessage(error)}`);
  }

  return data as { sent: number; total: number };
}

function isPushSupported() {
  return (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

async function ensureServiceWorkerRegistration() {
  const currentRegistration = await navigator.serviceWorker.getRegistration();
  if (currentRegistration) {
    return currentRegistration;
  }

  return navigator.serviceWorker.register("./sw.js");
}

function serializePushSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;

  if (!json.endpoint || !p256dh || !auth) {
    throw new Error("Inscricao push incompleta retornada pelo navegador.");
  }

  return {
    endpoint: json.endpoint,
    p256dh,
    auth,
  };
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

async function getFunctionErrorMessage(error: unknown) {
  const context = error && typeof error === "object" && "context" in error ? (error as { context?: unknown }).context : null;

  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
        return body.error;
      }
    } catch (_jsonError) {
      try {
        const text = await context.clone().text();
        if (text) {
          return text;
        }
      } catch (_textError) {
        // Fall back to the SDK error below.
      }
    }
  }

  return getErrorMessage(error);
}
