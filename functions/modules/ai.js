/* eslint-disable max-len */
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { onObjectFinalized, onObjectDeleted } = require("firebase-functions/v2/storage");
const path = require("path");
const os = require("os");
const fs = require("fs");
const twilio = require("twilio");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");

const {
  admin,
  db,
  FieldValue,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  GEMINI_API_KEY,
  verifyTeacherOrAdmin,
} = require("./config");

/**
 * Get current Cairo date formatted as YYYY-MM-DD
 * @return {string}
 */
function getCairoDateString() {
  const d = new Date();
  const cairoTimeStr = d.toLocaleString("en-US", { timeZone: "Africa/Cairo" });
  const c = new Date(cairoTimeStr);
  const y = c.getFullYear();
  const m = String(c.getMonth() + 1).padStart(2, "0");
  const day = String(c.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Lightweight daily rate limiter using Firestore doc aiUsage/{key}_{YYYY-MM-DD}
 * @param {string} key - Identifier (e.g. teacher_ID, student_PHONE)
 * @param {number} maxPerDay - Maximum allowed calls per day
 * @return {Promise<{ allowed: boolean, currentCount: number, maxPerDay: number }>}
 */
async function checkAiRateLimit(key, maxPerDay) {
  const today = getCairoDateString();
  const cleanKey = String(key || "anonymous").replace(/[/\\#?]/g, "_");
  const docRef = db.collection("aiUsage").doc(`${cleanKey}_${today}`);

  try {
    const snap = await docRef.get();
    const currentCount = snap.exists ? (snap.data().count || 0) : 0;
    if (currentCount >= maxPerDay) {
      return { allowed: false, currentCount, maxPerDay };
    }
    await docRef.set({
      count: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
      key: cleanKey,
      date: today,
    }, { merge: true });
    return { allowed: true, currentCount: currentCount + 1, maxPerDay };
  } catch (err) {
    console.error("Rate limiter error:", err);
    // On unexpected error, allow request through to prevent total outage
    return { allowed: true, currentCount: 0, maxPerDay };
  }
}

/**
 * Ensure a Gemini File API file is valid and refreshed before 48-hour expiration.
 * @param {object|string} item - Knowledge base item
 * @param {string} teacherId - Teacher ID
 * @param {string} geminiApiKey - Active Gemini API Key
 * @return {Promise<{ mimeType: string, fileUri: string }|null>}
 */
async function ensureValidGeminiFile(item, teacherId, geminiApiKey) {
  if (!item) return null;

  const itemObj = typeof item === "string" ? { uri: item, fileName: path.basename(item) } : { ...item };
  const now = Date.now();
  const isValid = itemObj.expiresAt && now < itemObj.expiresAt && itemObj.uri;

  if (isValid) {
    return {
      mimeType: itemObj.mimeType || "application/pdf",
      fileUri: itemObj.uri,
    };
  }

  // File is expired or missing expiration info -> Refresh from Firebase Storage
  const storagePath = itemObj.storagePath || (itemObj.fileName ? `teachers/${teacherId}/${itemObj.fileName}` : null);
  if (!storagePath) {
    return itemObj.uri ? { mimeType: itemObj.mimeType || "application/pdf", fileUri: itemObj.uri } : null;
  }

  const fileName = itemObj.fileName || path.basename(storagePath);
  const tempFilePath = path.join(os.tmpdir(), `refresh_${Date.now()}_${fileName}`);

  try {
    const bucket = admin.storage().bucket();
    const file = bucket.file(storagePath);
    const [exists] = await file.exists();
    if (!exists) {
      console.warn(`File does not exist in Firebase Storage: ${storagePath}`);
      return itemObj.uri ? { mimeType: itemObj.mimeType || "application/pdf", fileUri: itemObj.uri } : null;
    }

    await file.download({ destination: tempFilePath });

    const fileManager = new GoogleAIFileManager(geminiApiKey);
    const uploadResult = await fileManager.uploadFile(tempFilePath, {
      mimeType: itemObj.mimeType || "application/pdf",
      displayName: fileName,
    });

    const newUri = uploadResult.file.uri;
    const newExpiresAt = Date.now() + (46 * 60 * 60 * 1000); // 46 hours safety window

    // Update in Firestore
    const teacherRef = db.collection("teachers").doc(teacherId);
    const tDoc = await teacherRef.get();
    if (tDoc.exists) {
      const kb = tDoc.data().knowledgeBase || [];
      const updatedKb = kb.map((kItem) => {
        const isTarget = (typeof kItem === "string")
          ? (kItem === itemObj.uri || kItem.includes(fileName))
          : (kItem.fileName === fileName || kItem.storagePath === storagePath || kItem.uri === itemObj.uri);

        if (isTarget) {
          return {
            uri: newUri,
            mimeType: itemObj.mimeType || (typeof kItem === "object" ? kItem.mimeType : "application/pdf") || "application/pdf",
            fileName: fileName,
            storagePath: storagePath,
            expiresAt: newExpiresAt,
          };
        }
        return kItem;
      });

      await teacherRef.update({ knowledgeBase: updatedKb });
      console.log(`✅ Refreshed expired Gemini file ${fileName} for teacher ${teacherId}: ${newUri}`);
    }

    return {
      mimeType: itemObj.mimeType || "application/pdf",
      fileUri: newUri,
    };
  } catch (err) {
    console.error(`Error refreshing expired Gemini file (${fileName}):`, err);
    return itemObj.uri ? { mimeType: itemObj.mimeType || "application/pdf", fileUri: itemObj.uri } : null;
  } finally {
    if (fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch (_) {}
    }
  }
}

/**
 * 1. معالجة الملفات المرفوعة إلى Storage ورفعها إلى Gemini File API
 */
const processUploadedFile = onObjectFinalized({
  region: "europe-west1",
  cpu: 1,
  memory: "1GiB",
  timeoutSeconds: 540,
  secrets: [GEMINI_API_KEY],
}, async (event) => {
  const fileBucket = event.data.bucket;
  const filePath = event.data.name;

  if (filePath.includes("/generated/")) return console.log("Ignored generated file");

  const contentType = event.data.contentType;
  const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp", "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-m4a", "audio/mp4", "audio/aac", "audio/ogg"];

  if (!contentType || !allowedTypes.some((type) => contentType.startsWith(type))) {
    return console.log(`⚠️ تم تجاهل الملف: ${filePath} (النوع: ${contentType})`);
  }

  const pathParts = filePath.split("/");
  if (pathParts.length < 3 || pathParts[0] !== "teachers") {
    return console.log("⚠️ المسار غير صحيح.");
  }
  const teacherId = pathParts[1];
  const fileName = path.basename(filePath);

  console.log(`📥 معالجة ملف: ${fileName} (النوع: ${contentType})`);

  const bucket = admin.storage().bucket(fileBucket);
  const tempFilePath = path.join(os.tmpdir(), fileName);

  await bucket.file(filePath).download({ destination: tempFilePath });

  try {
    const fileManager = new GoogleAIFileManager(GEMINI_API_KEY.value());
    console.log("⬆️ جاري الرفع لـ Gemini...");

    const uploadResult = await fileManager.uploadFile(tempFilePath, {
      mimeType: contentType,
      displayName: fileName,
    });

    const fileUri = uploadResult.file.uri;
    console.log(`✅ تم الرفع: ${fileUri}`);

    const fileDataObj = {
      uri: fileUri,
      mimeType: contentType,
      fileName: fileName,
      storagePath: filePath,
      expiresAt: Date.now() + (46 * 60 * 60 * 1000), // 46 hours
    };

    await db.collection("teachers").doc(teacherId).set({
      lastUpdate: new Date(),
      knowledgeBase: FieldValue.arrayUnion(fileDataObj),
    }, { merge: true });

    console.log("💾 تم تحديث الداتابيز (URI + Type + storagePath + expiresAt) بنجاح!");
  } catch (error) {
    console.error("❌ خطأ أثناء المعالجة:", error);
  } finally {
    if (fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch (_) {}
    }
  }
});

/**
 * 2. تنظيف ملفات الذاكرة عند حذفها من Storage
 */
const cleanupDeletedFile = onObjectDeleted({
  region: "europe-west1",
  secrets: [GEMINI_API_KEY],
}, async (event) => {
  const filePath = event.data.name;
  if (filePath.includes("/generated/")) return;

  const pathParts = filePath.split("/");
  if (pathParts.length < 3 || pathParts[0] !== "teachers") return;
  const teacherId = pathParts[1];
  const fileName = path.basename(filePath);

  try {
    const fileManager = new GoogleAIFileManager(GEMINI_API_KEY.value());
    const teacherRef = db.collection("teachers").doc(teacherId);
    const doc = await teacherRef.get();

    if (doc.exists) {
      const knowledgeBase = doc.data().knowledgeBase || [];
      const updatedKB = [];
      const urisToDelete = [];

      knowledgeBase.forEach((item) => {
        const isMatch = (typeof item === "string")
          ? item.includes(fileName)
          : (item.fileName === fileName || (item.uri && item.uri.includes(fileName)));

        if (isMatch) {
          const uri = (typeof item === "string") ? item : item.uri;
          if (uri && uri.includes("files/")) {
            const match = uri.match(/files\/[a-zA-Z0-9_-]+/);
            if (match) urisToDelete.push(match[0]);
          }
        } else {
          updatedKB.push(item);
        }
      });

      if (updatedKB.length !== knowledgeBase.length) {
        await teacherRef.update({ knowledgeBase: updatedKB });
        console.log(`🧹 تم مسح الملف ${fileName} من knowledgeBase الخاصة بالمعلم ${teacherId}`);

        for (const fileToDelete of urisToDelete) {
          await fileManager.deleteFile(fileToDelete).catch((e) => console.error("File API Del Error:", e));
        }
      }
    }
  } catch (error) {
    console.error("❌ خطأ أثناء مسح الملف:", error);
  }
});

/**
 * 3. بوت الواتساب (Twilio) - يعمل بنموذج gemini-2.5-flash ومحدد بـ 30 رسالة/يوم
 */
const whatsappWebhook = onRequest({
  secrets: [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, GEMINI_API_KEY],
}, async (req, res) => {
  const signature = req.headers["x-twilio-signature"] || "";
  const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;

  if (!twilio.validateRequest(TWILIO_AUTH_TOKEN.value(), signature, fullUrl, req.body)) {
    return res.status(403).send("Forbidden: Invalid Twilio signature");
  }

  const client = twilio(TWILIO_ACCOUNT_SID.value(), TWILIO_AUTH_TOKEN.value());
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
  // استخدام نموذج فلاش عالي السرعة ومنخفض التكلفة
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const incomingMsg = (req.body && req.body.Body) ? req.body.Body.trim() : "";
  const senderNumber = req.body ? req.body.From : "";

  console.log(`🔥 رسالة من ${senderNumber}: ${incomingMsg}`);

  // فحص حد الاستخدام اليومي للطالب (30 رسالة/يوم)
  const cleanSender = senderNumber.replace(/\D/g, "");
  const rateLimit = await checkAiRateLimit(`student_${cleanSender}`, 30);
  if (!rateLimit.allowed) {
    await client.messages.create({
      body: "عذراً، لقد استهلكت الحد اليومي للرسائل مع المساعد الذكي (30 رسالة/يوم). نلتقي غداً بمزيد من الأسئلة والتفوق! 🌟",
      from: "whatsapp:+14155238886",
      to: senderNumber,
    });
    return res.status(200).send("RATE_LIMITED");
  }

  try {
    const userDoc = await db.collection("bot_users").doc(senderNumber).get();

    // 🅰️ الطالب جديد
    if (!userDoc.exists) {
      const potentialTeacherDoc = await db.collection("teachers").doc(incomingMsg).get();

      if (potentialTeacherDoc.exists) {
        await db.collection("bot_users").doc(senderNumber).set({
          teacherId: incomingMsg,
          joinedAt: new Date(),
          studentName: "Unknown Student",
        });

        const teacherName = potentialTeacherDoc.data().name || "المدرس";
        await client.messages.create({
          body: `✅ تم تفعيل المساعد الذكي بنجاح مع مستر ${teacherName}!\n\nأنا جاهز الآن لمساعدتك في المذاكرة طوال الوقت. يمكنك سؤالي عن أي تفصيلة في المنهج، وسأجيبك فوراً من خلال الملازم، صور السبورة، أو الشرح الصوتي المتاح. 📚🎤\n\nيلا نبدأ.. إيه أول سؤال عندك؟ 🚀`,
          from: "whatsapp:+14155238886",
          to: senderNumber,
        });
      } else {
        await client.messages.create({
          body: `مرحباً بك في Spot AI! 🤖✨\n\nيسعدنا انضمامك لنخبة الطلاب الأذكياء. لكي نقوم بتفعيل مساعدك الشخصي وتجهيز المناهج الخاصة بك، يرجى إرسال *كود المعلم* (رقم هاتفه) الآن.\n\nمستعدون لبدء رحلة التفوق معك! 🚀`,
          mediaUrl: ["https://firebasestorage.googleapis.com/v0/b/learnaria-483e7.firebasestorage.app/o/public%2Flearnaria_logo.png?alt=media&token=6b2f9f1d-ebe9-4c2f-9866-65c85c1f26cc"],
          from: "whatsapp:+14155238886",
          to: senderNumber,
        });
      }
      return res.status(200).send("DONE");
    }

    // 🅱️ الطالب مسجل
    const teacherId = userDoc.data().teacherId;

    if (incomingMsg.toLowerCase() === "خروج" || incomingMsg.toLowerCase() === "exit") {
      await db.collection("bot_users").doc(senderNumber).delete();
      await client.messages.create({
        body: "تم تسجيل الخروج.",
        from: "whatsapp:+14155238886",
        to: senderNumber,
      });
      return res.status(200).send("DONE");
    }

    const teacherDoc = await db.collection("teachers").doc(teacherId).get();
    let promptParts = [];

    if (teacherDoc.exists && teacherDoc.data().knowledgeBase) {
      const knowledgeItems = teacherDoc.data().knowledgeBase;
      console.log(`📚 المدرس (${teacherId}) عنده ${knowledgeItems.length} ملفات.`);

      // نأخذ آخر 3 ملفات ونتأكد من صلاحيتها وتحديثها إذا لزم الأمر
      const recentItems = knowledgeItems.slice(-3);
      const validatedFiles = await Promise.all(
        recentItems.map(async (item) => {
          const fileInfo = await ensureValidGeminiFile(item, teacherId, GEMINI_API_KEY.value());
          return fileInfo ? { fileData: fileInfo } : null;
        })
      );
      promptParts = validatedFiles.filter(Boolean);
    }

    const textPrompt = `
    أنت مساعد ذكي للطلاب. جاوب بناءً *فقط* على الملفات المرفقة.
    حاول أن تكون إجابتك مركزة ومختصرة قدر الإمكان (أقل من 1000 حرف).
    سؤال الطالب: ${incomingMsg}
    `;
    promptParts.push({ text: textPrompt });

    if (promptParts.length === 1) {
      await client.messages.create({
        body: "المدرس لسه مارفعش ملازم للمراجعة. 🕒",
        from: "whatsapp:+14155238886",
        to: senderNumber,
      });
      return res.status(200).send("NO_FILES");
    }

    const result = await model.generateContent(promptParts);
    const responseText = result.response.text();

    const maxChunkSize = 1500;
    if (responseText.length <= maxChunkSize) {
      await client.messages.create({
        body: responseText,
        from: "whatsapp:+14155238886",
        to: senderNumber,
      });
    } else {
      for (let i = 0; i < responseText.length; i += maxChunkSize) {
        const chunk = responseText.substring(i, i + maxChunkSize);
        await client.messages.create({
          body: chunk,
          from: "whatsapp:+14155238886",
          to: senderNumber,
        });
      }
    }

    return res.status(200).send("DONE");
  } catch (error) {
    console.error("❌ خطأ في الواتساب:", error);
    await client.messages.create({
      body: "حدث خطأ غير متوقع. يرجى المحاولة لاحقاً.",
      from: "whatsapp:+14155238886",
      to: senderNumber,
    });
    return res.status(500).send("ERROR");
  }
});

/**
 * 4. دالة الشات الذكي (chatWithSpot)
 * - استخدام gemini-2.5-flash للمحادثات العادية والتلخيص
 * - حجز gemini-2.5-pro حصراً لطلبات الامتحانات والأسئلة الدقيقة (role === teacher && isExamRequest)
 * - فحص حد الاستخدام اليومي (50 طلباً/يوم)
 * - تجديد روابط الملفات تلقائياً عبر ensureValidGeminiFile
 */
const chatWithSpot = onCall({
  cors: true,
  timeoutSeconds: 300,
  memory: "1GiB",
  region: "europe-west1",
  maxInstances: 10,
  secrets: [GEMINI_API_KEY],
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً");
  }

  const { message, teacherId, role, image } = request.data || {};

  if (role === "teacher") {
    await verifyTeacherOrAdmin(request, teacherId);
  }

  // فحص حد الاستخدام اليومي (50 طلباً للمعلم في اليوم)
  const rateLimitKey = `user_${request.auth.uid}`;
  const rateLimit = await checkAiRateLimit(rateLimitKey, 50);
  if (!rateLimit.allowed) {
    return {
      response: "عذراً، لقد تجاوزت الحد الأقصى للاستخدام اليومي للذكاء الاصطناعي (50 طلباً في اليوم). يرجى المحاولة غداً أو التواصل مع الدعم الفني.",
      type: "limit",
      teacherName: "",
    };
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());

  try {
    let promptParts = [];

    const safetySettings = [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
    ];

    // ── 1. جلب وتحديث ملفات المعلم المرفقة ──────────────────────────
    if (teacherId) {
      const teacherDoc = await db.collection("teachers").doc(teacherId).get();
      if (teacherDoc.exists && teacherDoc.data().knowledgeBase) {
        let kb = teacherDoc.data().knowledgeBase;

        const fileRefMatch = message ? message.match(/\[FILE_REF:\s*teachers\/[^/]+\/([^\]]+)\]/) : null;
        if (fileRefMatch) {
          const requestedFileName = fileRefMatch[1].trim();
          kb = kb.filter((item) => {
            if (typeof item === "string") return item.includes(requestedFileName);
            return item.fileName === requestedFileName || (item.uri && item.uri.includes(requestedFileName));
          });
        } else {
          kb = kb.slice(-3);
        }

        const validatedFiles = await Promise.all(
          kb.map(async (item) => {
            const fileInfo = await ensureValidGeminiFile(item, teacherId, GEMINI_API_KEY.value());
            return fileInfo ? { fileData: fileInfo } : null;
          })
        );
        promptParts.push(...validatedFiles.filter(Boolean));
      }
    }

    // ── 2. إرفاق الصورة إن وجدت ─────────────────────────────────────
    if (image) {
      promptParts.push({ inlineData: { mimeType: "image/jpeg", data: image } });
    }

    // ── 3. كشف النية ────────────────────────────────────────────────
    const msgLower = (message || "").toLowerCase();
    const isExamRequest =
      msgLower.includes("امتحان") || msgLower.includes("اختبار") ||
      msgLower.includes("أسئلة") || msgLower.includes("quiz") || msgLower.includes("exam");
    const isNoteRequest =
      msgLower.includes("مذكرة") || msgLower.includes("ملخص") ||
      msgLower.includes("شرح") || msgLower.includes("note") || msgLower.includes("summary");

    // ── 4. بناء التعليمات التوجيهية (System Instructions) ─────────────
    let systemInstruction = "";

    if (role === "teacher" && isExamRequest) {
      systemInstruction = `
You are "Spot", a precision exam extraction engine. Your ONLY job is to copy and transfer content VERBATIM from the attached files — nothing else.

🚨 CRITICAL RULES (RED ALERT — non-negotiable):
1. It is STRICTLY FORBIDDEN to invent, compose, or infer any question or answer that does not exist word-for-word in the attached file.
2. When the teacher requests questions, search the attached file and extract sentences and problems EXACTLY as written — character for character.
3. Transfer all mathematical, geometric, and physics formulas with the exact same symbols and numbers. Do NOT simplify, rephrase, or modify them in any way.
4. All equations and formulas MUST be wrapped in LaTeX notation: $...$ for inline equations or $$...$$ for standalone ones. Use strict LaTeX syntax (e.g., \\sqrt, \\frac, \\times).

🌍 Language rules:
- If the source content is in Arabic: keep Arabic variable symbols (س، ص، ع) and Arabic numerals (١، ٢، ٣).
- If the source content is in English: use Latin symbols (x, y, z) and Western numerals (1, 2, 3).

📋 Output format (JSON ONLY — no extra text, no markdown fences):
{
  "isExam": true,
  "title": "Exam title extracted from the file",
  "subject": "Subject name",
  "grade": "Grade/Class",
  "difficulty": "easy / medium / hard",
  "totalMarks": 30,
  "duration": "45 minutes",
  "questions": [
    {
      "q": "The question text copied verbatim from the source material",
      "diagram": "SVG code for any diagram if present in source, otherwise leave empty string",
      "type": "mcq | tf | essay",
      "marks": 2,
      "options": ["A", "B", "C", "D"],
      "answer": "The model answer based strictly on the source file"
    }
  ]
}`;
    } else if (role === "teacher" && isNoteRequest) {
      systemInstruction = `
You are "Spot", an expert educational content specialist. Your task is to generate professional, comprehensive study notes and summaries from the attached material.

🎯 Your mission: Produce a well-structured, detailed study note based ONLY on the provided content.

📋 Formatting rules (follow strictly):
1. Start with a main title: # Note Title
2. Use ## for major sections and ### for subsections.
3. Use bullet points for explanations: - point
4. Write all equations in LaTeX wrapped in dollar signs: $equation$
5. Before every law or formula, write "**📌 Law:**" followed by the LaTeX expression.
6. Before every example, write "**💡 Example:**"
7. Before every important note or warning, write "**⚠️ Note:**"
8. Do NOT include any URLs or external links in your response.
9. Respond in Arabic for all explanations, but keep scientific symbols in their original form (Latin or Arabic as found in the source).
      `;
    } else if (role === "teacher") {
      systemInstruction = `
You are "Spot", a smart AI assistant for teachers. Communicate in a friendly yet professional tone.
- Answer the teacher's questions by referencing the attached files whenever they are available.
- Write all mathematical equations using LaTeX notation wrapped in dollar signs: $equation$
- Do NOT include any URLs or external links in your response.
- Keep responses concise, accurate, and directly useful to the teacher.
      `;
    } else {
      systemInstruction = "You are a smart, friendly private tutor. Help the student understand the material using the attached files whenever available. Explain concepts in a simple, engaging, and encouraging way. Use clear examples and break down complex ideas step by step. Write equations in LaTeX: $equation$";
    }

    if (message) promptParts.push({ text: `Teacher's request: ${message}` });

    const hasFiles = promptParts.some((p) => p.fileData);
    if (role === "teacher" && isExamRequest && !hasFiles) {
      return {
        response: JSON.stringify({ isExam: true, error: true, message: "لا توجد ملفات مرفقة. يرجى رفع الملازم أولاً قبل طلب الامتحان." }),
        type: "exam",
        teacherName: "",
      };
    }

    // ── 5. اختيار النموذج المناسب وإرسال الطلب ────────────────────────
    // نموذج gemini-2.5-pro مخصص حصرياً للامتحانات لضمان الدقة الكاملة، ونموذج gemini-2.5-flash لباقي المهام
    const chosenModel = (role === "teacher" && isExamRequest) ? "gemini-2.5-pro" : "gemini-2.5-flash";

    const genConfig = {
      temperature: 0.1,
    };

    if (isExamRequest) {
      genConfig.responseMimeType = "application/json";
    }

    const modelInstance = genAI.getGenerativeModel({
      model: chosenModel,
      systemInstruction: systemInstruction,
      generationConfig: genConfig,
    });

    let result;
    try {
      result = await modelInstance.generateContent({
        contents: [{ role: "user", parts: promptParts }],
        safetySettings,
      });
    } catch (e) {
      if (e.message && (e.message.includes("403") || e.message.includes("permission") || e.message.includes("not exist") || e.message.includes("invalid"))) {
        console.warn("⚠️ File API Error (stale URIs):", e.message);

        if (isExamRequest) {
          return {
            response: JSON.stringify({
              isExam: true,
              error: true,
              message: "رابط الملف غير صالح أو تم حذفه. يرجى إعادة رفع الملازم ثم طلب الامتحان.",
            }),
            type: "exam",
            teacherName: "",
          };
        }

        const textOnly = promptParts.filter((p) => p.text);
        result = await modelInstance.generateContent({
          contents: [{ role: "user", parts: textOnly }],
          safetySettings,
        });
      } else {
        throw e;
      }
    }

    // ── 6. جلب اسم المعلم ──────────────────────────────────────────
    let teacherName = "";
    if (teacherId) {
      try {
        const tDoc = await db.collection("teachers").doc(teacherId).get();
        if (tDoc.exists) {
          const tData = tDoc.data();
          teacherName = tData.name || tData.fullName || "";
        }
      } catch (e) {
        console.error("Error fetching teacher name:", e);
      }
    }

    const aiResponse = result.response.text();
    let responseType = "chat";

    if (isExamRequest && aiResponse.includes("\"isExam\": true")) {
      responseType = "exam";
    } else if (isNoteRequest) {
      responseType = "note";
    }

    return {
      response: aiResponse,
      type: responseType,
      teacherName: teacherName,
    };
  } catch (error) {
    console.error("Chat with Spot Error:", error);
    throw new HttpsError("internal", error.message);
  }
});

module.exports = {
  processUploadedFile,
  cleanupDeletedFile,
  whatsappWebhook,
  chatWithSpot,
  ensureValidGeminiFile,
  checkAiRateLimit,
};
