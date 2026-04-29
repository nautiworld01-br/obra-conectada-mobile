const CACHE_VERSION = "__BUILD_ID__";
const APP_SHELL_CACHE = `obra-conectada-shell-${CACHE_VERSION}`;
const STATIC_CACHE = `obra-conectada-static-${CACHE_VERSION}`;
const PRECACHE_URLS = ["./", "./index.html", "./manifest.json", "./icon.png", "./icon-192.png", "./icon-512.png", "./favicon.ico"];
const DEFAULT_NOTIFICATION_URL = "./";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== APP_SHELL_CACHE && key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  const isStaticAsset =
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "image" ||
    request.destination === "font" ||
    url.pathname.endsWith(".json") ||
    url.pathname.endsWith(".ico");

  if (isStaticAsset) {
    event.respondWith(networkFirstStatic(request));
  }
});

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event);
  const title = payload.title || "Obra Conectada";
  const options = {
    body: payload.body || "Voce tem uma nova atualizacao na obra.",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag: payload.tag || "obra-conectada",
    data: {
      url: sanitizeNotificationUrl(payload.url),
      routeKey: payload.routeKey || null,
      entityId: payload.entityId || null,
      eventKey: payload.eventKey || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = buildNotificationClickUrl(event.notification.data || {});

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === self.location.origin && "focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);

    if (response && response.ok) {
      const cache = await caches.open(APP_SHELL_CACHE);
      await cache.put("./", response.clone());
    }

    return response;
  } catch (error) {
    const cache = await caches.open(APP_SHELL_CACHE);
    const cachedResponse = (await cache.match("./")) || (await cache.match("./index.html"));

    if (cachedResponse) {
      return cachedResponse;
    }

    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cachedResponse = await cache.match(request);

  const networkResponsePromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }

      return response;
    })
    .catch(() => null);

  return cachedResponse || networkResponsePromise;
}

async function networkFirstStatic(request) {
  const cache = await caches.open(STATIC_CACHE);

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    throw error;
  }
}

function parsePushPayload(event) {
  if (!event.data) {
    return {};
  }

  try {
    return event.data.json();
  } catch (error) {
    return {
      body: event.data.text(),
    };
  }
}

function sanitizeNotificationUrl(url) {
  if (!url) {
    return DEFAULT_NOTIFICATION_URL;
  }

  try {
    const parsedUrl = new URL(url, self.location.origin);
    if (parsedUrl.origin !== self.location.origin) {
      return DEFAULT_NOTIFICATION_URL;
    }

    return parsedUrl.pathname + parsedUrl.search + parsedUrl.hash;
  } catch (error) {
    return DEFAULT_NOTIFICATION_URL;
  }
}

function buildNotificationClickUrl(data) {
  const url = new URL(sanitizeNotificationUrl(data.url), self.location.origin);

  if (data.routeKey) {
    url.searchParams.set("notifyRoute", data.routeKey);
  }

  if (data.entityId) {
    url.searchParams.set("notifyEntityId", data.entityId);
  }

  if (data.eventKey) {
    url.searchParams.set("notifyEvent", data.eventKey);
  }

  return url.href;
}
