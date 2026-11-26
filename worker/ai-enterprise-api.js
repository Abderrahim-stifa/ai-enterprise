// Worker: ai-enterprise-api
// الصق هذا الملف كاملاً في Cloudflare: Workers & Pages > ai-enterprise-api > Edit code، ثم Deploy.
// يحتاج: ربط Workers AI باسم AI، وسر API_SECRET (موجودان مسبقاً).

// ====== إعدادات سهلة التغيير ======
const MODEL = "@cf/google/gemma-4-26b-a4b-it"; // مجاني على خطة Workers Free (يُراجع في وثائق Cloudflare)
const FALLBACK_MODEL = "@cf/meta/llama-3.2-3b-instruct"; // احتياطي مجاني، يُستعمل فقط إذا فشل النموذج الأول
const ALLOWED_ORIGIN = "https://ai-enterprise.pages.dev";
const AGENT_MAX_TOKENS = 700;
const CEO_MAX_TOKENS = 900;
const TEMPERATURE = 0.3;

// ====== ملف معطيات الشركة (مصدر واحد لجميع الوكلاء) ======
// عدّل هذا النص فقط عندما تتغير الحقائق. لا تكتب هنا أرقاماً غير مؤكدة.
const COMPANY_DATA = `
الشركة: AI ENTERPRISE (الشعار: Technology. Innovation. Business).
الوضع: مشروع في مرحلة التأسيس بالمغرب. غير مسجل قانونياً بعد. لا يوجد زبناء مؤكدون ولا موظفون ولا مداخيل.

ماذا نبيع:
- برامج تسيير تُبرمج حسب حاجة كل زبون (محلات، مقاهي، مطاعم سريعة، متاجر...).
- وبرامج جاهزة نعطيها للزبون بترخيص استعمال. أمثلة منجزة من طرف صاحب المشروع: برنامج كاشير للمقهى والمطعم السريع (CAFE-POS)، برنامج لمحل ملابس، برنامج لمحل أجهزة منزلية.
- CAFE-POS: يعمل على Windows 7 (32 بيت)، طابعة Xprinter XP-Q807K عبر USB، واجهة بالعربية والفرنسية والإسبانية والإنجليزية، أدوار (كاشير، مسيّر، مسؤول)، مخزون وتقارير. مشكلة معروفة غير محلولة: درج النقود يفتح بقوة، لذلك لا يُضمن الدرج.

نموذج الترخيص:
- الزبون يدفع مرة واحدة ويستعمل النسخة مدى الحياة على موقع واحد.
- الشركة تحتفظ بالملكية الفكرية. للزبون حق الاستعمال فقط دون إعادة بيع. لا يُسلَّم الكود المصدري.
- إذا ضاعت نسخة الزبون يشتريها من جديد بنصف الثمن.
- إصدار جديد بميزات جديدة بنصف الثمن للزبون السابق.

السوق واللغة: المغرب، العملة الدرهم، العربية والفرنسية.
سياسة التكلفة: مجاني أولاً، دون أي خدمة مدفوعة.
القطاع المستهدف الأول والمدينة والأثمنة: لم تُحدد بعد.
`;

const COMMON_RULES = `
قواعد صارمة:
- اعتمد فقط على معطيات الشركة وطلب المستخدم. لا تخترع أرقاماً أو أثماناً أو زبناء أو إنجازات.
- لا تفترض أن الشركة مسجلة قانونياً.
- ميّز بين: حقيقة مؤكدة، افتراض، توصية.
- أنت تقترح فقط. لا تدّعِ أنك نفذت شيئاً أو تواصلت مع أحد.
- اكتب بعربية واضحة ومختصرة، وبلا تكرار.
- لا تكتب JSON ولا Markdown ثقيلاً. نص عادي بعناوين قصيرة.
- لا تتجاوز 170 كلمة.
`;

// الوكلاء الأربعة المتخصصون + المدير. المفاتيح تطابق ما تعرضه الواجهة.
const AGENTS = {
  CRO: {
    name: "المبيعات",
    job: "تقترح كيف نجد أول زبناء ونكتب عروضاً وردوداً على الزبناء المحتملين، بخطوات ملموسة يمكن البدء بها هذا الأسبوع."
  },
  CMO: {
    name: "المحتوى والتسويق",
    job: "تقترح محتوى (إعلانات، سكريبتات فيديو قصير، رسائل واتساب) ورسائل تسويقية بسيطة ومجانية تناسب السوق المغربي."
  },
  CFO: {
    name: "المحاسبة والأثمنة",
    job: "تقترح منهجية لتحديد الأثمنة وهامش الربح وتتبع المصاريف والمداخيل، دون اختراع أرقام: اذكر المعطيات الناقصة التي يجب أن يحددها صاحب المشروع."
  },
  CTO: {
    name: "المساعد التقني",
    job: "تقترح الخطوات التقنية: ما ينقص البرامج قبل البيع (مثل مشكلة الدرج)، التوثيق، الاختبار، وحماية النسخ بمفتاح مرتبط بالجهاز."
  }
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json; charset=utf-8"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS_HEADERS });
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

// يستخرج النص من أشكال الاستجابة المحتملة لنماذج Workers AI.
function extractText(result) {
  let text =
    (typeof result === "string" ? result : null) ??
    result?.response ??
    result?.result?.response ??
    result?.choices?.[0]?.message?.content ??
    result?.choices?.[0]?.text ??
    "";

  if (Array.isArray(text)) {
    text = text.map(part => (typeof part === "string" ? part : part?.text || "")).join("");
  }
  if (typeof text !== "string") return "";

  // إزالة كتل التفكير إن ظهرت في النص.
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

// حالة المحاولات (للتشخيص فقط، تُعرض لصاحب الرمز بعد المصادقة).
async function callModel(env, model, system, user, maxTokens) {
  const result = await env.AI.run(model, {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    max_tokens: maxTokens,
    temperature: TEMPERATURE,
    ...(model === FALLBACK_MODEL ? { repetition_penalty: 1.3 } : {})
  });

  const text = extractText(result);

  if (!text) {
    const keys = result && typeof result === "object" ? Object.keys(result).join(",") : typeof result;
    throw new Error("رد فارغ من النموذج. مفاتيح الرد: " + keys);
  }
  return text;
}

async function runModel(env, system, user, maxTokens, info) {
  try {
    return await callModel(env, MODEL, system, user, maxTokens);
  } catch (primaryError) {
    console.error("Primary model failed:", primaryError);
    info.errors.push(`${MODEL}: ${String(primaryError?.message || primaryError).slice(0, 300)}`);

    // احتياطي مجاني (وليس مدفوعاً). إذا فشل أيضاً نرمي الخطأ.
    const text = await callModel(env, FALLBACK_MODEL, system, user, maxTokens);
    info.fallback = true;
    return text;
  }
}

function agentSystemPrompt(key) {
  const agent = AGENTS[key];
  return `أنت وكيل "${agent.name}" في شركة AI ENTERPRISE. مهمتك: ${agent.job}

معطيات الشركة:
${COMPANY_DATA}
${COMMON_RULES}
اكتب ثلاثة أقسام بهذه العناوين، وتحت كل عنوان محتوى فعلي مختلف عن غيره:
الخلاصة: جملتان عن الأولوية في تخصصك.
التوصيات: ثلاث توصيات مرقمة، كل واحدة فعل ملموس مختلف تماماً عن الأخرى وتخص تخصصك فقط (لا تذكر مواضيع الأقسام الأخرى).
أسئلة لصاحب المشروع: حتى سؤالين محددين.
لا تكرر أي جملة أو فكرة.`;
}

function ceoSystemPrompt() {
  return `أنت المدير التنفيذي لشركة AI ENTERPRISE. اقرأ تقارير الوكلاء ثم اكتب تقريراً قصيراً خاصاً بك، بمحتوى حقيقي مبني على طلب صاحب المشروع.

معطيات الشركة:
${COMPANY_DATA}
${COMMON_RULES}
اكتب أربعة أقسام بهذه العناوين فقط، وتحت كل عنوان محتوى فعلي (لا تعد كتابة وصف العنوان):
1) الوضع الحالي
2) القرار الأهم هذا الأسبوع
3) خطة 7 أيام
4) أسئلة لصاحب المشروع

في "خطة 7 أيام" اكتب خمس خطوات فعلية قصيرة، كل خطوة جملة واحدة تبدأ بفعل.
لا تنسخ جمل الوكلاء. لا تكرر أي جملة.`;
}

async function buildReport(env, task, context, info) {
  const userMessage =
    `طلب صاحب المشروع:\n${task}\n\nمعلومات إضافية:\n${context || "لا توجد."}`;

  const keys = Object.keys(AGENTS);

  // استدعاء منفصل لكل وكيل، بالتوازي.
  const settled = await Promise.allSettled(
    keys.map(key => runModel(env, agentSystemPrompt(key), userMessage, AGENT_MAX_TOKENS, info))
  );

  const departments = {};
  const failed = [];
  const successfulReports = [];

  settled.forEach((item, index) => {
    const key = keys[index];
    const agent = AGENTS[key];

    if (item.status === "fulfilled") {
      departments[key] = {
        name: agent.name,
        status: "اقتراح يحتاج إلى مراجعة",
        analysis: item.value,
        note: "تحليل مولّد آلياً وليس إثباتاً لحالة الشركة."
      };
      successfulReports.push(`[${agent.name}]\n${item.value}`);
    } else {
      console.error(`Agent ${key} failed:`, item.reason);
      failed.push(key);
      departments[key] = {
        name: agent.name,
        status: "لم يكتمل",
        analysis: "تعذر إنتاج تقرير هذا الوكيل. أعد المحاولة.",
        note: ""
      };
    }
  });

  // إذا فشل الجميع فالسبب غالباً الحصة أو توفر الخدمة.
  if (successfulReports.length === 0) {
    throw new Error("فشل جميع الوكلاء.");
  }

  // المدير يلخص تقارير الوكلاء الناجحين في استدعاء خامس.
  let ceo;
  try {
    ceo = await runModel(
      env,
      ceoSystemPrompt(),
      `${userMessage}\n\nتقارير الوكلاء:\n${successfulReports.join("\n\n")}`,
      CEO_MAX_TOKENS,
      info
    );
  } catch (error) {
    console.error("CEO synthesis failed:", error);
    ceo = "تعذر إنتاج تقرير المدير. تقارير الوكلاء متاحة أدناه.";
    failed.push("CEO");
  }

  return {
    status: failed.length ? "partial" : "completed",
    mode: "analysis",
    warning:
      "هذا التقرير يتضمن تحليلات واقتراحات مولّدة آلياً. يجب التحقق منها قبل اعتماد القرارات.",
    ceo,
    departments,
    failed,
    model: info.fallback ? `${FALLBACK_MODEL} (احتياطي)` : MODEL,
    used_model: info.fallback ? FALLBACK_MODEL : MODEL,
    diagnostics: info.errors.length ? [...new Set(info.errors)].slice(0, 3) : undefined,
    input_received: { task, context_provided: Boolean(context) }
  };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "POST") {
      return json({ status: "error", message: "استعمل POST لإرسال المهمة." }, 405);
    }

    const origin = request.headers.get("Origin");
    if (origin && origin !== ALLOWED_ORIGIN) {
      return json({ status: "error", message: "هذا المصدر غير مسموح له بالاتصال." }, 403);
    }

    if (!env.API_SECRET) {
      return json({ status: "error", message: "إعداد المصادقة غير مكتمل على الخادم." }, 500);
    }

    const authorization = request.headers.get("Authorization");
    if (authorization !== `Bearer ${env.API_SECRET}`) {
      return json({ status: "error", message: "غير مصرح بالوصول." }, 401);
    }

    if (!env.AI || typeof env.AI.run !== "function") {
      return json({ status: "error", message: "خدمة الذكاء الاصطناعي غير متاحة حالياً." }, 503);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ status: "error", message: "صيغة البيانات المرسلة غير صالحة." }, 400);
    }

    const task = cleanText(body?.task, 8000);
    const context = cleanText(body?.context, 4000);

    if (!task) {
      return json({ status: "error", message: "خاصك تدخل المهمة المطلوبة." }, 400);
    }

    const info = { errors: [], fallback: false };

    try {
      return json(await buildReport(env, task, context, info));
    } catch (error) {
      // التفاصيل في سجلات Cloudflare فقط. لا فاتورة ولا تحويل لخدمة مدفوعة.
      console.error("AI ENTERPRISE Worker error:", error);

      return json({
        status: "error",
        message:
          "تعذر إنشاء التقرير. غالباً نفدت الحصة المجانية لليوم (تتجدد 00:00 UTC) أو الخدمة غير متاحة. حاول لاحقاً.",
        retryable: true,
        // تفاصيل للتشخيص. لا تصل إلا بعد التحقق من رمز الدخول.
        diagnostics: [...new Set([
          ...info.errors,
          String(error?.message || error).slice(0, 300)
        ])].slice(0, 4)
      }, 503);
    }
  }
};
