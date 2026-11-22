
export async function onRequestPost({ request, env }) {
  if (!env.API_SECRET) {
    return Response.json(
      { error: "Server configuration missing" },
      { status: 503 }
    );
  }

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    return Response.json(
      { error: "Content-Type must be application/json" },
      { status: 415 }
    );
  }

  const body = await request.text();

  if (body.length > 100_000) {
    return Response.json(
      { error: "Request too large" },
      { status: 413 }
    );
  }

  const response = await fetch(
    "https://ai-enterprise-api.abderrahim-stifa.workers.dev/api/ceo",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.API_SECRET}`
      },
      body
    }
  );

  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("Content-Type") || "application/json",
      "Cache-Control": "no-store"
    }
  });
}
