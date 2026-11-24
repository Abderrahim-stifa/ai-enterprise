// مقارنة نصين بزمن ثابت لتجنب تسريب معلومات عبر زمن الاستجابة.
function safeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(String(a));
  const y = enc.encode(String(b));
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) {
    diff |= (x[i] || 0) ^ (y[i] || 0);
  }
  return diff === 0;
}


export async function onRequestPost({ request, env }) {
  if (!env.API_SECRET) {
    return Response.json(
      { error: "Server configuration missing" },
      { status: 503 }
    );
  }

  // رمز الدخول (هو نفسه API_SECRET). بدونه لا يُرسل أي طلب إلى Worker.
  const code = request.headers.get("X-Access-Code") || "";

  if (!safeEqual(code, env.API_SECRET)) {
    return Response.json(
      { status: "error", message: "رمز الدخول غير صحيح." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
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
