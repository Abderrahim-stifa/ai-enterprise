
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

  try {
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
        "Content-Type":
          response.headers.get("Content-Type") ||
          "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  } catch {
    return Response.json(
      {
        status: "error",
        message: "تعذر الاتصال بخدمة التحليل. حاول مرة أخرى."
      },
      { status: 502 }
    );
  }
}
