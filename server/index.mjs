export async function handleRequest(request, context) {
  if (context.path === "settings" && request.method === "GET") {
    const settings = context.settings.get() || {};
    return Response.json({
      ok: true,
      data: {
        url: settings.url || "",
        username: settings.username || "",
        passwordConfigured: Boolean(settings.password)
      }
    });
  }

  const targetPath = resolveTargetPath(context.path);
  if (!targetPath) {
    return Response.json({ ok: false, error: { message: "Transmission module route not found." } }, { status: 404 });
  }

  const target = new URL(targetPath, request.url);
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
  return fetch(target, {
    method: request.method,
    headers: request.headers,
    body,
    redirect: "manual"
  });
}

function resolveTargetPath(routePath) {
  if (/^torrents(?:\/[^/]+(?:\/(?:start|stop))?)?$/.test(routePath)) {
    return `/api/transmission/${routePath}`;
  }

  if (routePath === "settings/save" || routePath === "settings/test") {
    return `/api/integrations/transmission/${routePath.slice("settings/".length)}`;
  }

  return null;
}
