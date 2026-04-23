import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const DEBOUNCE_MS = 15_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type DailyLogEventPayload = {
  logId?: string;
  projectId?: string;
  observedUpdatedAt?: string;
};

type DailyLogRow = {
  id: string;
  project_id: string;
  created_by: string;
  updated_at: string;
};

type ProjectMemberRow = {
  user_id: string;
};

type ProfileRow = {
  full_name: string | null;
};

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

Deno.serve(async (request) => {
  try {
    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return json({ error: "Metodo nao permitido." }, 405);
    }

    const authorization = request.headers.get("Authorization");
    if (!authorization) {
      return json({ error: "Usuario nao autenticado." }, 401);
    }

    const payload = await request.json().catch(() => ({})) as DailyLogEventPayload;
    if (!payload.logId || !payload.projectId || !payload.observedUpdatedAt) {
      return json({ error: "Payload de diario invalido." }, 400);
    }

    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const supabaseAnonKey = getRequiredEnv("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const vapidPublicKey = getRequiredEnv("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = getRequiredEnv("VAPID_PRIVATE_KEY");
    const vapidSubject = getRequiredEnv("VAPID_SUBJECT");

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: userData, error: userError } = await userClient.auth.getUser();

    if (userError || !userData.user) {
      return json({ error: "Sessao invalida." }, 401);
    }

    const { data: membership } = await userClient
      .from("project_members")
      .select("user_id")
      .eq("project_id", payload.projectId)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (!membership) {
      return json({ error: "Usuario nao pertence a este projeto." }, 403);
    }

    const { data: initialLog, error: initialLogError } = await adminClient
      .from("daily_logs")
      .select("id, project_id, created_by, updated_at")
      .eq("id", payload.logId)
      .eq("project_id", payload.projectId)
      .maybeSingle<DailyLogRow>();

    if (initialLogError || !initialLog) {
      return json({ error: initialLogError?.message ?? "Diario nao encontrado." }, 404);
    }

    if (initialLog.created_by !== userData.user.id) {
      return json({ error: "Autor do diario nao confere com a sessao." }, 403);
    }

    if (initialLog.updated_at !== payload.observedUpdatedAt) {
      await logSkipped(adminClient, initialLog.created_by, payload.logId, "daily_log_updated:stale_start");
      return json({ status: "skipped", reason: "stale_start" });
    }

    await logSkipped(adminClient, initialLog.created_by, initialLog.id, "daily_log_updated:queued");

    const backgroundTask = handleDebouncedDailyLogPush(adminClient, payload, {
      vapidPublicKey,
      vapidPrivateKey,
      vapidSubject,
    });
    const edgeRuntime = (globalThis as unknown as {
      EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
    }).EdgeRuntime;
    edgeRuntime?.waitUntil ? edgeRuntime.waitUntil(backgroundTask) : void backgroundTask;

    return json({ status: "queued" }, 202);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Falha inesperada na Edge Function." },
      500,
    );
  }
});

async function handleDebouncedDailyLogPush(
  adminClient: ReturnType<typeof createClient>,
  payload: Required<DailyLogEventPayload>,
  vapid: { vapidPublicKey: string; vapidPrivateKey: string; vapidSubject: string },
) {
  try {
    await delay(DEBOUNCE_MS);

    const { data: currentLog, error: currentLogError } = await adminClient
      .from("daily_logs")
      .select("id, project_id, created_by, updated_at")
      .eq("id", payload.logId)
      .eq("project_id", payload.projectId)
      .maybeSingle<DailyLogRow>();

    if (currentLogError || !currentLog) {
      await logSkipped(
        adminClient,
        currentLog?.created_by ?? null,
        payload.logId,
        `daily_log_updated:not_found:${currentLogError?.message ?? "missing"}`,
      );
      return;
    }

    if (currentLog.updated_at !== payload.observedUpdatedAt) {
      await logSkipped(adminClient, currentLog.created_by, payload.logId, "daily_log_updated:debounced");
      return;
    }

    webpush.setVapidDetails(vapid.vapidSubject, vapid.vapidPublicKey, vapid.vapidPrivateKey);

    const { data: recipients, error: recipientsError } = await adminClient
      .from("project_members")
      .select("user_id")
      .eq("project_id", currentLog.project_id)
      .neq("user_id", currentLog.created_by)
      .returns<ProjectMemberRow[]>();

    if (recipientsError) {
      await logSkipped(adminClient, currentLog.created_by, currentLog.id, `daily_log_updated:recipients:${recipientsError.message}`);
      return;
    }

    const recipientIds = (recipients ?? []).map((recipient) => recipient.user_id);
    if (!recipientIds.length) {
      await logSkipped(adminClient, currentLog.created_by, currentLog.id, "daily_log_updated:no_recipients");
      return;
    }

    const { data: subscriptions, error: subscriptionsError } = await adminClient
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth")
      .in("user_id", recipientIds)
      .eq("status", "active")
      .is("revoked_at", null)
      .returns<PushSubscriptionRow[]>();

    if (subscriptionsError) {
      await logSkipped(adminClient, currentLog.created_by, currentLog.id, `daily_log_updated:subscriptions:${subscriptionsError.message}`);
      return;
    }

    if (!subscriptions?.length) {
      await logSkipped(adminClient, currentLog.created_by, currentLog.id, "daily_log_updated:no_subscriptions");
      return;
    }

    const authorName = await getAuthorName(adminClient, currentLog.created_by);
    await Promise.all(
      subscriptions.map((subscription) =>
        sendToSubscription(adminClient, subscription, {
          title: "Diario de obra atualizado",
          body: `${authorName} atualizou o diario de obra`,
          tag: `daily-log-updated:${currentLog.id}`,
          eventKey: `daily_log_updated:${currentLog.id}:${subscription.user_id}`,
          routeKey: "dia-a-dia",
          entityId: currentLog.id,
          url: "/obra-conectada-mobile/",
        })
      ),
    );
  } catch (error) {
    await logSkipped(
      adminClient,
      null,
      payload.logId,
      `daily_log_updated:unexpected:${error instanceof Error ? error.message : "unknown"}`,
    );
  }
}

async function sendToSubscription(
  adminClient: ReturnType<typeof createClient>,
  subscription: PushSubscriptionRow,
  payload: {
    title: string;
    body: string;
    tag: string;
    eventKey: string;
    routeKey: string;
    entityId: string;
    url: string;
  },
) {
  const previousAttempt = await adminClient
    .from("push_delivery_attempts")
    .select("id")
    .eq("event_key", payload.eventKey)
    .eq("status", "sent")
    .maybeSingle();

  if (previousAttempt.data) {
    await adminClient.from("push_delivery_attempts").insert({
      user_id: subscription.user_id,
      subscription_id: subscription.id,
      event_key: payload.eventKey,
      tag: payload.tag,
      status: "duplicate",
    });
    return { sent: false };
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      JSON.stringify(payload),
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
      event_key: payload.eventKey,
      tag: payload.tag,
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
      event_key: payload.eventKey,
      tag: payload.tag,
      status: "failed",
      response_code: statusCode,
      error_message: error instanceof Error ? error.message : "Falha desconhecida no envio push.",
    });

    return { sent: false };
  }
}

async function getAuthorName(adminClient: ReturnType<typeof createClient>, authorId: string) {
  const { data } = await adminClient
    .from("profiles")
    .select("full_name")
    .eq("id", authorId)
    .maybeSingle<ProfileRow>();

  return data?.full_name?.trim() || "Um membro";
}

async function logSkipped(
  adminClient: ReturnType<typeof createClient>,
  userId: string | null,
  logId: string,
  reason: string,
) {
  await adminClient.from("push_delivery_attempts").insert({
    user_id: userId,
    event_key: `daily_log_updated:${logId}`,
    tag: `daily-log-updated:${logId}`,
    status: "skipped",
    error_message: reason,
  });
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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
