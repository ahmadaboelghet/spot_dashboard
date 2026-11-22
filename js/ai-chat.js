// ==========================================
// 10. SPOT BOT (AI MANAGER) 🤖
// ==========================================

// رفع الملف وتشغيل الـ Pipeline
async function handleBotFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const allowedTypes = [
        'application/pdf',
        'image/jpeg', 'image/png', 'image/webp',
        'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-m4a', 'audio/mp4', 'audio/aac', 'audio/ogg'
    ];

    if (!allowedTypes.includes(file.type) && !file.type.startsWith('audio/')) {
        showToast("نوع الملف غير مدعوم. مسموح بـ PDF، صور، أو صوت فقط", "error");
        return;
    }

    if (!TEACHER_ID) {
        showToast("يجب تسجيل الدخول أولاً", "error");
        return;
    }

    // إظهار شريط التقدم
    const progressContainer = document.getElementById('uploadProgressContainer');
    const progressBar = document.getElementById('uploadProgressBar');
    const percentText = document.getElementById('uploadPercent');
    const nameText = document.getElementById('uploadFileName');

    progressContainer.classList.remove('hidden');
    nameText.innerText = file.name;
    progressBar.style.width = '0%';
    percentText.innerText = '0%';

    // المسار السحري اللي بيشغل الـ Cloud Function
    // teachers/{teacherId}/{filename}
    const storageRef = firebase.storage().ref().child(`teachers/${TEACHER_ID}/${Date.now()}_${file.name}`);
    const uploadTask = storageRef.put(file);

    uploadTask.on('state_changed',
        (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            progressBar.style.width = progress + '%';
            percentText.innerText = Math.floor(progress) + '%';
        },
        (error) => {
            console.error(error);
            showToast("فشل الرفع", "error");
            progressContainer.classList.add('hidden');
        },
        () => {
            // اكتمل الرفع
            showToast("تم الرفع! جاري المعالجة...", "success");

            // تصفير الانبوت
            document.getElementById('botFileInput').value = '';

            // إخفاء الشريط بعد ثانية
            setTimeout(() => {
                progressContainer.classList.add('hidden');
                loadBotFiles(); // تحديث القائمة
            }, 2000);
        }
    );
}

// تحميل الملفات المرفوعة
async function loadBotFiles() {
    const listContainer = document.getElementById('botFilesList');
    listContainer.innerHTML = '<div class="flex justify-center p-4"><i class="ri-loader-4-line animate-spin text-2xl"></i></div>';

    if (!TEACHER_ID) return;

    try {
        // بنجيب الملفات من Storage مباشرة عشان نعرض الأسماء الحقيقية
        const storageRef = firebase.storage().ref().child(`teachers/${TEACHER_ID}`);
        const result = await storageRef.listAll();

        if (result.items.length === 0) {
            listContainer.innerHTML = `
                <div class="text-center py-8 opacity-50">
                    <i class="ri-folder-open-line text-4xl mb-2"></i>
                    <p>المكتبة فارغة</p>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = '';

        result.items.forEach(itemRef => {
            // تحديد نوع الملف
            const isImg = itemRef.name.match(/\.(jpg|jpeg|png|webp)$/i);
            const isAudio = itemRef.name.match(/\.(mp3|wav|m4a|aac|ogg)$/i); // 👈 كشف الصوت

            let iconClass = "ri-file-pdf-2-fill text-red-500";
            let bgClass = "bg-red-50";

            if (isImg) {
                iconClass = "ri-image-2-fill text-blue-500";
                bgClass = "bg-blue-50";
            } else if (isAudio) { // 👈 ستايل الصوت
                iconClass = "ri-mic-2-fill text-purple-500";
                bgClass = "bg-purple-50";
            }
            const div = document.createElement('div');
            div.className = 'flex items-center justify-between p-3 bg-white dark:bg-darkSurface border border-gray-100 dark:border-gray-700 rounded-xl transition-all hover:border-brand shadow-sm';

            div.innerHTML = `
                <div class="flex items-center gap-3 overflow-hidden">
                    <div class="w-10 h-10 rounded-lg ${bgClass} flex items-center justify-center flex-shrink-0 shadow-sm">
                        <i class="${iconClass} text-xl"></i>
                    </div>
                    <div class="truncate">
                        <p class="font-bold text-sm text-gray-800 dark:text-gray-200 truncate mb-1">${itemRef.name}</p>
                        <div class="flex gap-2">
                             <button onclick="openExamModal('${itemRef.name}')" class="text-[10px] bg-yellow-400 text-black px-3 py-1 rounded-md font-black hover:bg-yellow-500 transition-all shadow-sm">إنشاء امتحان ذكي ✨</button>
                        </div>
                    </div>
                </div>
                <button class="btn-delete-file w-8 h-8 bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:bg-white/5 rounded-lg transition-colors" title="حذف">
                    <i class="ri-delete-bin-line"></i>
                </button>
            `;

            // زرار الحذف
            div.querySelector('.btn-delete-file').onclick = async () => {
                if (confirm("هل أنت متأكد من حذف هذا الملف من ذاكرة البوت؟")) {
                    try {
                        await itemRef.delete();
                        showToast("تم الحذف بنجاح");

                        // ملاحظة: الحذف هنا من Storage بس
                        // الـ Cloud Function مش هتمسح الـ Link من Firestore أوتوماتيك (إلا لو عملنا Trigger للحذف)
                        // بس مش مشكلة كبيرة دلوقتي، البوت هيحاول يفتح لينك مكسور وهيتجاهله

                        loadBotFiles(); // تحديث القائمة
                    } catch (err) {
                        showToast("خطأ في الحذف", "error");
                    }
                }
            };

            listContainer.appendChild(div);
        });

    } catch (error) {
        console.error(error);
        listContainer.innerHTML = `<p class="text-center text-red-500">حدث خطأ في تحميل الملفات</p>`;
    }
}

// دالة نسخ رسالة الدعوة
function copyBotInvite() {
    if (!TEACHER_ID) return;

    // رقم البوت (تويليو ساندبوكس حالياً - غيره لما تطلع لايف)
    const botNumber = "+14155238886";

    // رسالة الدعوة الاحترافية
    const inviteMsg = `
👋 أهلاً يا شباب!

أنا فعلت ليكم "المساعد الذكي" (الناظر AI) عشان يساعدكم في المذاكرة ويجاوب على أسئلتكم من الملازم بتاعتي طول الـ 24 ساعة! 🤖📚

1️⃣ ادخلوا كلموا البوت هنا:
https://wa.me/${botNumber.replace('+', '')}?text=join%20off-drive

2️⃣ أول ما يرد عليكم، ابعتوا له "كود المدرس" ده عشان يعرف إنكم تبعي:
*${TEACHER_ID}*

جربوه واسألوه في أي حاجة في المنهج! 🚀
`;

    // النسخ للحافظة
    navigator.clipboard.writeText(inviteMsg).then(() => {
        showToast("تم نسخ رسالة الدعوة! ابعتها للطلاب فوراً 🚀");
    }).catch(err => {
        showToast("فشل النسخ", "error");
    });
}

// ==========================================
// 4️⃣ منطق الشات (Spot Chat Logic)
// ==========================================
let isChatOpen = false;

// 🏆 نظام إعدادات الامتحان المتطور (Exam Advanced System)
let currentExamFile = "";
let currentExamDifficulty = "سهل";

window.openExamModal = function (fileName) {
    currentExamFile = fileName;
    document.getElementById('examFileNameDisplay').innerText = fileName;
    document.getElementById('examSettingsModal').classList.remove('hidden');
    // Reset inputs
    document.getElementById('examScopeInput').value = "";
};

window.closeExamModal = function () {
    document.getElementById('examSettingsModal').classList.add('hidden');
};

window.setExamDifficulty = function (val) {
    currentExamDifficulty = val;
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        if (btn.getAttribute('data-val') === val) {
            btn.classList.add('bg-gray-50', 'dark:bg-black', 'border-brand');
        } else {
            btn.classList.remove('bg-gray-50', 'dark:bg-black', 'border-brand');
        }
    });
};

window.confirmGenerateExam = function () {
    const scope = document.getElementById('examScopeInput').value.trim();
    const count = document.getElementById('examCountInput').value;
    const lang = document.querySelector('input[name="examLang"]:checked').value;
    const langText = lang === 'ar' ? 'باللغة العربية (الأرقام والرموز س، ص...)' : 'in English (xyz, 123...)';

    let prompt = `[FILE_REF: teachers/${TEACHER_ID}/${currentExamFile}]
من فضلك اعمل لي امتحان احترافي جداً لملف (${currentExamFile}) بالمواصفات دي:
- المستوى: ${currentExamDifficulty}
- عدد الأسئلة: ${count}
- اللغة والتنسيق: ${langText}
- النطاق المطلوب: ${scope ? scope : 'كامل المحتوى المتاح في الملف'}`;

    closeExamModal();
    if (!isChatOpen) toggleSpotChat();
    const input = document.getElementById('chatInput');
    input.value = prompt;
    sendSpotMessage();
};

// 🛠️ دالة إنشاء من ملف (مستدعية من المكتبة - نسخة مبسطة لغرض التوافق)
window.generateFromMaterial = function (fileName, type) {
    if (type === 'امتحان') {
        window.openExamModal(fileName);
    } else {
        if (!isChatOpen) toggleSpotChat();
        const input = document.getElementById('chatInput');
        input.value = `[FILE_REF: teachers/${TEACHER_ID}/${fileName}]
من فضلك اعمل لي ${type} احترافي جداً من ملف (${fileName})`;
        sendSpotMessage();
    }
};

// دالة السكرول الأسفل (آمنة)
function scrollToBottom() {
    try {
        const container = document.getElementById('chatMessages');
        if (container) {
            container.scrollTo({
                top: container.scrollHeight,
                behavior: 'smooth'
            });
        }
    } catch (e) {
        console.warn("Scroll error:", e);
    }
}
window.scrollToBottom = scrollToBottom; // جعلها عالمية للآمان

// دالة فتح وقفل الشات (مربوطة بـ window عشان HTML يشوفها)
window.toggleSpotChat = function () {
    const windowEl = document.getElementById('spotChatWindow');
    const inputEl = document.getElementById('chatInput');

    if (!isChatOpen) {
        // فتح
        windowEl.classList.remove('scale-0', 'opacity-0', 'pointer-events-none');
        windowEl.classList.add('scale-100', 'opacity-100', 'pointer-events-auto');
        setTimeout(() => inputEl.focus(), 300);
    } else {
        // غلق
        windowEl.classList.remove('scale-100', 'opacity-100', 'pointer-events-auto');
        windowEl.classList.add('scale-0', 'opacity-0', 'pointer-events-none');
    }
    isChatOpen = !isChatOpen;
};

// دالة إرسال الرسالة
window.sendSpotMessage = async function () {
    if (!firebase.auth().currentUser) {
        showToast("انتهت جلستك، يرجى تسجيل الدخول مجدداً ⚠️", "error");
        return;
    }

    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;

    const currentTeacherId = localStorage.getItem('learnaria-tid');
    if (!currentTeacherId) {
        addMessageToUI("⚠️ لازم تكون مسجل دخول عشان أقدر أساعدك!", 'bot', 'chat');
        return;
    }

    addMessageToUI(msg, 'user', 'chat');
    input.value = '';
    input.style.height = '48px';

    document.getElementById('typingIndicator').classList.remove('hidden');
    scrollToBottom();

    try {
        // Fix deadline-exceeded error: Increase client timeout to 5 minutes (300,000 ms)
        const chatFn = firebase.app().functions('europe-west1').httpsCallable('chatWithSpot', { timeout: 300000 });
        const result = await chatFn({
            message: msg,
            teacherId: currentTeacherId,
            role: 'teacher'
        });

        document.getElementById('typingIndicator').classList.add('hidden');
        const responseData = result.data || {};
        const responseText = responseData.response || '';
        const responseType = responseData.type || 'chat';
        if (responseData.teacherName) window.lastTeacherName = responseData.teacherName;
        
        if (!responseText) {
            addMessageToUI("❌ لم يتم استلام رد، من فضلك حاول مرة تانية.", 'bot', 'chat');
            return;
        }
        addMessageToUI(responseText, 'bot', responseType);

    } catch (error) {
        document.getElementById('typingIndicator').classList.add('hidden');
        addMessageToUI("❌ حصل خطأ في الاتصال، حاول تاني.", 'bot', 'chat');
        console.error("Spot Chat Error:", error);
    }
};

// دالة تنظيف وبارسة JSON (نسختين آمنتين)
function cleanJSON(text) {
    if (!text) return null;

    let clean = text
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

    const startIndex = clean.indexOf('{');
    const endIndex = clean.lastIndexOf('}');
    if (startIndex === -1 || endIndex === -1) return null;

    const jsonStr = clean.substring(startIndex, endIndex + 1);

    // Pass 1: Try parsing as-is
    try { JSON.parse(jsonStr); return jsonStr; } catch (_) {}

    // Pass 2: Fix bad backslash escaping (\sqrt → \\sqrt)
    try {
        const fixed = jsonStr.replace(/\\(.)/g, (match, char) => {
            const valid = ['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u'];
            return valid.includes(char) ? match : '\\\\' + char;
        });
        JSON.parse(fixed);
        return fixed;
    } catch (_) {}

    return null;
}

// دالة عرض الرسائل (مع Exam Card و Note Card و Chat Bubble)
function addMessageToUI(text, sender, type, saveToHistory = true) {
    // ✅ PHASE 1: Chat History Persistence
    if (saveToHistory && typeof TEACHER_ID !== 'undefined' && TEACHER_ID) {
        const key = `spot_chat_${TEACHER_ID}`;
        let history = [];
        try { history = JSON.parse(localStorage.getItem(key)) || []; } catch (e) {}
        history.push({ text, sender, type });
        history = history.slice(-10);
        localStorage.setItem(key, JSON.stringify(history));
    }

    const container = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = "mb-6 animate-fade-in-up w-full";

    // رسالة المستخدم
    if (sender === 'user') {
        div.innerHTML = `
            <div class="flex justify-end items-end gap-2">
                <div class="bg-gradient-to-tr from-yellow-500 to-yellow-600 text-black px-5 py-3 rounded-2xl rounded-tr-none font-bold text-sm shadow-md max-w-[85%] break-words whitespace-pre-wrap">
                    ${escapeHtml(text)}
                </div>
            </div>`;
        container.appendChild(div);
        scrollToBottom();
        return;
    }

    // BOT: Exam Card
    if (type === 'exam') {
        const jsonStr = cleanJSON(text);
        let examData = null;
        if (jsonStr) { try { examData = JSON.parse(jsonStr); } catch (_) {} }

        // ── Handle server-side error response (e.g. no files uploaded) ──────
        if (examData && examData.isExam && examData.error) {
            div.innerHTML = `
                <div class="flex gap-3 justify-start items-start w-full">
                    <div class="w-10 h-10 bg-red-50 dark:bg-red-900/30 rounded-full flex items-center justify-center flex-shrink-0 text-red-500 shadow">
                        <i class="ri-error-warning-fill text-xl"></i>
                    </div>
                    <div class="bg-white dark:bg-zinc-800 border-2 border-red-300 dark:border-red-700 rounded-2xl rounded-tl-none p-4 shadow-md max-w-[85%]">
                        <p class="text-sm font-bold text-red-600 dark:text-red-400">${escapeHtml(examData.message || 'حدث خطأ في إنشاء الامتحان.')}</p>
                        <p class="text-xs text-gray-500 mt-2">💡 تأكد من رفع الملازم أولاً من قسم <strong>"تغذية البوت"</strong> ثم أعد الطلب.</p>
                    </div>
                </div>`;
            container.appendChild(div);
            scrollToBottom();
            return;
        }

        // ── Render a successful exam card ────────────────────────────────────
        if (examData && examData.isExam && examData.questions?.length > 0) {
            div.innerHTML = `
                <div class="flex gap-3 justify-start items-start w-full">
                    <div class="w-10 h-10 bg-yellow-50 dark:bg-yellow-900/30 rounded-full flex items-center justify-center flex-shrink-0 text-yellow-600 shadow">
                        <i class="ri-file-list-3-fill text-xl"></i>
                    </div>
                    <div class="bg-white dark:bg-zinc-900 border-2 border-yellow-400 rounded-2xl rounded-tl-none w-full md:max-w-[90%] shadow-xl overflow-hidden">
                        <div class="bg-gradient-to-r from-yellow-500 to-yellow-400 px-5 py-4">
                            <h3 class="font-black text-xl text-black">${escapeHtml(examData.title || 'امتحان')}</h3>
                            <div class="flex gap-4 mt-1 text-black/70 text-xs font-semibold">
                                <span><i class="ri-question-line"></i> ${escapeHtml(examData.questions?.length || 0)} سؤال</span>
                                ${examData.difficulty ? `<span class="bg-black/20 px-2 py-0.5 rounded uppercase tracking-wider"><i class="ri-pulse-line"></i> ${escapeHtml(examData.difficulty)}</span>` : ''}
                                ${examData.totalMarks ? `<span><i class="ri-award-line"></i> ${escapeHtml(examData.totalMarks)} درجة</span>` : ''}
                                ${examData.duration ? `<span><i class="ri-time-line"></i> ${escapeHtml(examData.duration)}</span>` : ''}
                            </div>
                        </div>
                        <div class="p-5">
                            <p class="text-xs text-gray-500 mb-4">تم إنشاء الامتحان بنجاح ✅ اضغط للطباعة وحفظ كـ PDF</p>
                            <button class="btn-print-exam w-full bg-gray-900 hover:bg-black text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md">
                                <i class="ri-printer-fill text-yellow-400 text-lg"></i>
                                طباعة / حفظ كـ PDF
                            </button>
                        </div>
                    </div>
                </div>`;
            div.querySelector('.btn-print-exam').addEventListener('click', () => window.printExam(examData));
            container.appendChild(div);
            scrollToBottom();
            return;
        }
    }


    // BOT: Note Card
    if (type === 'note') {
        const noteContent = text;
        div.innerHTML = `
            <div class="flex gap-3 justify-start items-start w-full">
                <div class="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center flex-shrink-0 text-blue-600 shadow">
                    <i class="ri-book-2-fill text-xl"></i>
                </div>
                <div class="bg-white dark:bg-zinc-900 border-2 border-blue-300 dark:border-blue-700 rounded-2xl rounded-tl-none w-full md:max-w-[90%] shadow-xl overflow-hidden">
                    <div class="bg-gradient-to-r from-blue-600 to-blue-500 px-5 py-4">
                        <h3 class="font-black text-lg text-white">مذكرة تعليمية احترافية 📚</h3>
                        <p class="text-blue-100 text-xs mt-1">تم الإنشاء بواسطة Spot AI</p>
                    </div>
                    <div class="p-5 flex flex-col gap-3">
                        <div class="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto border border-gray-100 dark:border-zinc-700 rounded-xl p-3 bg-gray-50 dark:bg-zinc-800 font-mono">
                            ${escapeHtml(text.substring(0, 500))}${text.length > 500 ? '...' : ''}
                        </div>
                        <button class="btn-print-note w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md text-sm">
                            <i class="ri-printer-fill text-white text-lg"></i>
                            طباعة المذكرة / حفظ كـ PDF
                        </button>
                    </div>
                </div>
            </div>`;
        div.querySelector('.btn-print-note').addEventListener('click', () => window.printStudyNote(noteContent));
        container.appendChild(div);
        scrollToBottom();
        return;
    }

    // BOT: Chat Bubble (default)
    // إزالة أي URLs من النص (لنظافة الرد)
    const cleanText = text
        .replace(/https?:\/\/[^\s\n<]+/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    // لو فيه جيسون (exam فشل parseه)، اعرض parse error بشكل clean
    let displayText = cleanText || text;
    // لو الرد كان JSON خام (تعذر parseه) صفحه لرسالة error لطيفة
    if ((type === 'exam') && displayText.includes('{')) {
        displayText = '❌ تعذّر استخراج بيانات الامتحان. الذكاء رد بصيغة غير صحيحة.';
    }

    div.innerHTML = `
        <div class="flex gap-3 justify-start items-start w-full">
            <div class="w-8 h-8 bg-zinc-200 dark:bg-zinc-800 rounded-full flex items-center justify-center flex-shrink-0 text-gray-600 dark:text-gray-300 text-xs shadow-sm">
                <i class="ri-robot-2-fill"></i>
            </div>
            <div class="bg-white dark:bg-zinc-800 p-4 rounded-2xl rounded-tl-none shadow-sm border border-gray-100 dark:border-zinc-700 text-sm text-gray-700 dark:text-gray-200 leading-relaxed break-words whitespace-pre-wrap max-w-[85%]">
                ${escapeHtml(displayText)}
            </div>
        </div>`;

    container.appendChild(div);
    scrollToBottom();
}

// ✅ PHASE 1: Load Chat History from Local Storage
async function loadChatHistory() {
    if (!TEACHER_ID) return;
    const key = `spot_chat_${TEACHER_ID}`;
    let history = [];
    try { history = JSON.parse(localStorage.getItem(key)) || []; } catch (e) {}
    
    const container = document.getElementById('chatMessages');
    if (container) container.innerHTML = '';
    
    history.forEach(msg => {
        addMessageToUI(msg.text, msg.sender, msg.type, false);
    });
}

// 🖨️ دالة طباعة الامتحانات (MathJax + Cairo + SVG)
window.printExam = function (examData) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) { alert('يرجى السماح بالنوافذ المنبثقة'); return; }

    const getOptionLabel = (i) => ['أ)', 'ب)', 'ج)', 'د)'][i] || `${i + 1})`;
    const toNum = (n) => String(n + 1);

    const questionsHtml = (examData.questions || []).map((q, i) => `
        <div class="q-wrap">
            <div class="q-num">${toNum(i)}</div>
            <div class="q-body">
                <div class="q-text">${escapeHtml(q.q || '')}</div>
                ${q.diagram ? `<div class="diagram-box">${sanitizeSvg(q.diagram)}</div>` : ''}
                ${q.type === 'mcq' && q.options ? `
                    <div class="mcq-grid">
                        ${q.options.map((opt, j) => `
                            <div class="opt-row">
                                <span class="opt-char">${getOptionLabel(j)}</span>
                                <span>${escapeHtml(opt)}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : q.type === 'tf' ? `
                    <div style="display: flex; justify-content: flex-end; gap: 40px; margin-top: 10px; font-weight: bold; border: 1px dashed #eee; padding: 10px; border-radius: 8px;">
                        <span>(  صح  )</span>
                        <span>(  خطأ  )</span>
                    </div>
                ` : `
                    <div class="essay-lines">
                        ${Array.from({ length: q.lines || 3 }).map(() => '<div class="essay-line"></div>').join('')}
                    </div>
                `}
            </div>
        </div>
    `).join('');

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <title>${escapeHtml(examData.title || 'امتحان')}</title>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&family=Amiri:wght@400;700&display=swap" rel="stylesheet">
    <script>
        window.MathJax = {
            tex: {
                inlineMath: [['$', '$']],
                displayMath: [['$$', '$$']],
                processEscapes: true
            },
            options: { skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre'] },
            startup: {
                pageReady() {
                    return MathJax.startup.defaultPageReady().then(() => {
                        setTimeout(() => window.print(), 1500);
                    });
                }
            }
        };
    <\/script>
    <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"><\/script>
    <style>
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        @page { size: A4; margin: 1cm; }
        * { box-sizing: border-box; }
        body {
            font-family: 'Cairo', 'Amiri', sans-serif;
            direction: rtl; text-align: right;
            padding: 0; margin: 0; font-size: 14px;
            background: #fff; color: #111;
        }
        mjx-container { direction: ltr !important; display: inline-block !important; }
        .exam-header { text-align: center; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 15px; }
        .exam-title { font-family: 'Amiri', serif; font-size: 22px; font-weight: 900; color: #1a1a2e; margin-bottom: 4px; }
        .exam-meta { display: flex; justify-content: space-between; font-size: 14px; font-weight: 700; color: #555; flex-wrap: wrap; gap: 5px; }
        .student-info { display: flex; justify-content: space-between; font-size: 15px; font-weight: 700; margin-top: 10px; }
        .field-line { border-bottom: 1px solid #333; display: inline-block; min-width: 180px; }
        .q-wrap { display: flex; gap: 8px; margin-bottom: 10px; page-break-inside: avoid; align-items: flex-start; }
        .q-num { background: #1a1a2e; color: #fff; min-width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 13px; flex-shrink: 0; margin-top: 2px; }
        .q-body { flex: 1; }
        .q-text { font-size: 16px; font-weight: 700; line-height: 1.4; margin-bottom: 6px; }
        .diagram-box { display: flex; justify-content: center; margin: 8px 0; }
        .diagram-box svg { max-width: 200px; height: auto; border: 1px dashed #aaa; padding: 6px; border-radius: 6px; }
        .diagram-box text { font-family: 'Cairo', sans-serif; font-weight: bold; }
        .mcq-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 15px; margin-top: 4px; }
        .opt-row { display: flex; align-items: center; gap: 8px; font-size: 14px; }
        .opt-char { font-weight: 900; color: #1a1a2e; min-width: 20px; }
        .essay-line { border-bottom: 1px dashed #ccc; height: 22px; margin-top: 4px; }
        .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #aaa; border-top: 1px solid #eee; padding-top: 10px; }
    </style>
</head>
<body>
    <div class="exam-header">
        <div class="exam-title">${escapeHtml(examData.title || 'امتحان')}</div>
        <div class="exam-meta">
            ${examData.subject ? `<span>${escapeHtml(examData.subject)}</span>` : ''}
            ${examData.grade ? `<span>${escapeHtml(examData.grade)}</span>` : ''}
            ${examData.duration ? `<span>${escapeHtml(examData.duration)}</span>` : ''}
            ${examData.totalMarks ? `<span>الدرجة الكاملة: ${escapeHtml(examData.totalMarks)}</span>` : ''}
        </div>
        <div class="student-info">
            <span>اسم الطالب: <span class="field-line">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></span>
            <span>الدرجة: <span class="field-line">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></span>
        </div>
    </div>
    ${questionsHtml}
    <div class="footer">
        <div style="font-size: 18px; color: #1a1a2e; font-weight: 900; margin-bottom: 10px; font-family: 'Amiri', serif;">
            مع أطيب التمنيات بالتوفيق والنجاح
        </div>
        <div style="font-size: 16px; color: #333; font-weight: 700;">
            ${escapeHtml(window.lastTeacherName || document.getElementById('teacherNameInput')?.value ? `مستر/ ${window.lastTeacherName || document.getElementById('teacherNameInput').value}` : 'مع تحيات منصة الناظر التعليمية')}
        </div>
        <div style="margin-top: 20px; font-size: 10px; color: #aaa;">نظام الناظر لإدارة التعليم الذكي ✨</div>
    </div>
</body>
</html>`;

    printWindow.document.write(html);
    printWindow.document.close();
};


// 🖨️ دالة طباعة المذكرات (نسخة الرياضيات الاحترافية)
window.printStudyNote = function (content) {
    const printWindow = window.open('', '_blank');

    // معالجة النص لتحويله لـ HTML منسق بعد حماية الرموز
    const safeContent = escapeHtml(content || '');
    const formattedContent = safeContent
        // تحويل العناوين الرئيسية (## عنوان)
        .replace(/## (.*?)\n/g, '<h2 class="section-title"><i class="ri-focus-3-line"></i> $1</h2>')
        // تحويل النقاط المرقمة
        .replace(/(\d+)\.\s\*\*(.*?)\*\*/g, '<div class="sub-point"><span class="num">$1</span> <strong>$2</strong></div>')
        // تحويل "مثال:" لصندوق ملون
        .replace(/مثال:(.*?)\n/g, '<div class="example-box"><strong><span class="ex-icon">💡</span> مثال:</strong> $1</div>')
        // تحويل "ملاحظة:" لصندوق تحذيري
        .replace(/ملاحظة هامة:(.*?)\n/g, '<div class="note-box"><strong>⚠️ ملاحظة هامة:</strong> $1</div>')
        // تحويل الخط العريض (**نص**)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // تحويل السطر الجديد
        .replace(/\n/g, '<br>');

    const htmlContent = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
        <title>ملخص درس - الناظر AI</title>
        <meta charset="UTF-8">
        
        <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
        
        <link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">
        
        <style>
            body { 
                font-family: 'IBM Plex Sans Arabic', sans-serif;
                padding: 40px; 
                max-width: 850px; 
                margin: 0 auto; 
                background: #fff;
                color: #333;
                line-height: 1.8;
            }

            /* إعدادات المعادلات */
            mjx-container { font-size: 110% !important; direction: ltr; display: inline-block; }

            /* الهيدر */
            .header {
                text-align: center;
                border-bottom: 3px solid #facc15;
                padding-bottom: 20px;
                margin-bottom: 30px;
                background: linear-gradient(to bottom, #fff, #fefce8);
                border-radius: 15px;
                padding-top: 20px;
            }
            .logo-text { font-size: 26px; font-weight: 900; color: #000; }
            .sub-header { font-size: 14px; color: #666; margin-top: 5px; }

            /* العناوين */
            .section-title {
                color: #b45309;
                font-family: 'IBM Plex Sans Arabic', sans-serif;
                margin-top: 30px;
                border-bottom: 2px dashed #fcd34d;
                padding-bottom: 5px;
                font-size: 22px;
                display: flex;
                align-items: center;
                gap: 10px;
            }

            /* تنسيق النصوص */
            strong { color: #000; font-weight: 800; }

            /* النقاط الفرعية */
            .sub-point {
                margin-top: 15px;
                font-size: 18px;
                display: flex;
                align-items: flex-start;
                gap: 10px;
            }
            .num {
                background: #000; color: #fff;
                min-width: 25px; height: 25px;
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                font-size: 14px; margin-top: 5px;
            }

            /* صندوق الأمثلة */
            .example-box {
                background-color: #f0f9ff;
                border-right: 4px solid #0ea5e9;
                padding: 15px;
                margin: 15px 0;
                border-radius: 8px;
                color: #0369a1;
            }
            
            /* صندوق الملاحظات */
            .note-box {
                background-color: #fef2f2;
                border-right: 4px solid #ef4444;
                padding: 15px;
                margin: 15px 0;
                border-radius: 8px;
                color: #991b1b;
            }

            /* الفوتر */
            .footer {
                position: fixed;
                bottom: 20px;
                left: 0; right: 0;
                text-align: center;
                font-size: 14px;
                color: #888;
                border-top: 1px solid #eee;
                padding-top: 10px;
                font-family: 'IBM Plex Sans Arabic', sans-serif;
                background: #fff;
            }
        </style>

        <script>
            window.MathJax = {
                tex: { inlineMath: [['$', '$']] },
                startup: {
                    pageReady: () => {
                        return MathJax.startup.defaultPageReady().then(() => {
                            setTimeout(() => window.print(), 1000);
                        });
                    }
                }
            };
        </script>
    </head>
    <body>
        <div class="header">
            <div class="logo-text">مذكرة تعليمية ذكية 📚</div>
            <div class="sub-header">ملخص الدرس بواسطة مساعد الناظر الذكي AI</div>
        </div>

        <div class="content">
            ${formattedContent}
        </div>

        <div style="height: 100px;"></div>

        <div class="footer">
            نظام الناظر لإدارة التعليم الذكي ✨
        </div>
    </body>
    </html>`;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
};