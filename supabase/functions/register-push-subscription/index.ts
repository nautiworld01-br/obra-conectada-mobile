import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RegisterPushSubscriptionPayload = {
  endpoint?: string;
  p256dh?: string;
  auth?: string;
  userAgent?: string;
  platform?: string;
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

    const payload = await request.json().catch(() => ({})) as RegisterPushSubscriptionPayload;
    if (!payload.endpoint || !payload.p256dh || !payload.auth) {
      return json({ error: "Inscricao push incompleta." }, 400);
    }

    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const supabaseAnonKey = getRequiredEnv("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
    const { data: userData, error: userError } = await userClient.auth.getUser();

    if (userError || !userData.user) {
      return json({ error: "Sessao invalida." }, 401);
    }

    const { data, error } = await adminClient
      .from("push_subscriptions")
      .upsert(
        {
          user_id: userData.user.id,
          endpoint: payload.endpoint,
          p256dh: payload.p256dh,
          auth: payload.auth,
          user_agent: payload.userAgent ?? null,
          platform: payload.platform ?? null,
          status: "active",
          last_seen_at: new Date().toISOString(),
          last_failure_at: null,
          failure_code: null,
          revoked_at: null,
        },
        { onConflict: "endpoint" },
      )
      .select("id, user_id, endpoint, status, updated_at, last_seen_at")
      .single();

    if (error) {
      return json({ error: error.message }, 500);
    }

    return json({ subscription: data });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Falha inesperada ao registrar inscricao push." },
      500,
    );
  }
});

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Variavel obrigatoria ausente: ${name}`);
  }

  return value;
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
