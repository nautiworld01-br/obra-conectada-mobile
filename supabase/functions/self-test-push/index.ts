import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Metodo nao permitido." }, 405);
  }

  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const supabaseAnonKey = getRequiredEnv("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const vapidPublicKey = getRequiredEnv("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = getRequiredEnv("VAPID_PRIVATE_KEY");
  const vapidSubject = getRequiredEnv("VAPID_SUBJECT");
  const authorization = request.headers.get("Authorization");

  if (!authorization) {
    return json({ error: "Usuario nao autenticado." }, 401);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
  const { data: userData, error: userError } = await userClient.auth.getUser();

  if (userError || !userData.user) {
    return json({ error: "Sessao invalida." }, 401);
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const { data: subscriptions, error: subscriptionsError } = await adminClient
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .eq("user_id", userData.user.id)
    .eq("status", "active")
    .is("revoked_at", null)
    .returns<PushSubscriptionRow[]>();

  if (subscriptionsError) {
    return json({ error: subscriptionsError.message }, 500);
  }

  if (!subscriptions?.length) {
    return json({ error: "Nenhuma inscricao push ativa encontrada para este usuario." }, 404);
  }

  const payload = JSON.stringify({
    title: "Obra Conectada",
    body: "Notificacao de teste ativada com sucesso.",
    tag: "self-test-push",
    eventKey: `self-test-push:${userData.user.id}:${Date.now()}`,
    routeKey: "mais",
    url: "/obra-conectada-mobile/",
  });

  const results = await Promise.all(
    subscriptions.map((subscription) => sendToSubscription(adminClient, subscription, payload)),
  );

  const sent = results.filter((result) => result.sent).length;
  return json({ sent, total: results.length });
});

async function sendToSubscription(
  adminClient: ReturnType<typeof createClient>,
  subscription: PushSubscriptionRow,
  payload: string,
) {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      payload,
    );

    await adminClient.from("push_subscriptions").update({
      last_push_at: new Date().toISOString(),
      last_failure_at: null,
      failure_code: null,
      status: "active",
    }).eq("id", subscription.id);

    await adminClient.from("push_delivery_attempts").insert({
      user_id: subscription.user_id,
      subscription_id: subscription.id,
      event_key: "self-test-push",
      tag: "self-test-push",
      status: "sent",
      response_code: 201,
    });

    return { sent: true };
  } catch (error) {
    const statusCode = getStatusCode(error);
    const permanentFailure = statusCode === 404 || statusCode === 410;

    await adminClient.from("push_subscriptions").update({
      status: permanentFailure ? "expired" : "active",
      revoked_at: permanentFailure ? new Date().toISOString() : null,
      last_failure_at: new Date().toISOString(),
      failure_code: statusCode ? String(statusCode) : "send_error",
    }).eq("id", subscription.id);

    await adminClient.from("push_delivery_attempts").insert({
      user_id: subscription.user_id,
      subscription_id: subscription.id,
      event_key: "self-test-push",
      tag: "self-test-push",
      status: "failed",
      response_code: statusCode,
      error_message: error instanceof Error ? error.message : "Falha desconhecida no envio push.",
    });

    return { sent: false };
  }
}

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Variavel obrigatoria ausente: ${name}`);
  }

  return value;
}

function getStatusCode(error: unknown) {
  if (error && typeof error === "object" && "statusCode" in error) {
    const statusCode = Number((error as { statusCode?: unknown }).statusCode);
    return Number.isFinite(statusCode) ? statusCode : null;
  }

  return null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
