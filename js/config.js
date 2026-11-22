
// ==========================================
// CONFIGURATION & GLOBAL HELPERS
// ==========================================
// Base URL for Parent Web App (can be toggled if needed)
const PARENT_APP_BASE_URL = "https://www.elnazer-edu.com/parent.html";

/**
 * Reusable HTML Escaping helper to prevent Stored & Reflected XSS
 * @param {any} str
 * @return {string}
 */
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Sanitize intentional SVG diagrams by stripping <script> tags and on* attributes
 * @param {string} svg
 * @return {string}
 */
function sanitizeSvg(svg) {
    if (!svg || typeof svg !== 'string') return '';
    return svg
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/\bon\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '');
}

// ==========================================
// SENTRY ERROR TRACKING HELPER
// ==========================================
function sentryCaptureError(error, context = {}) {
    if (typeof Sentry !== 'undefined') {
        if (typeof Sentry.withScope === 'function') {
            Sentry.withScope(scope => {
                Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v));
                if (TEACHER_ID) scope.setUser({ id: TEACHER_ID });
                if (SELECTED_GROUP_ID) scope.setTag('groupId', SELECTED_GROUP_ID);
                Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
            });
        } else if (typeof Sentry.captureException === 'function') {
            Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
        }
    }
}
function sentryBreadcrumb(message, category = 'action', data = {}) {
    if (typeof Sentry !== 'undefined') {
        if (typeof Sentry.addBreadcrumb === 'function') {
            Sentry.addBreadcrumb({ message, category, data, level: 'info' });
        }
    }
}

// ==========================================
// FIREBASE ANALYTICS HELPER
// ==========================================
// ✅ FIX 8: Cache analytics instance once — avoid re-instantiating on every call
let _analyticsInstance = null;
function _getAnalytics() {
    if (_analyticsInstance) return _analyticsInstance;
    try {
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
            _analyticsInstance = firebase.analytics();
        }
    } catch (e) { /* analytics not available */ }
    return _analyticsInstance;
}

function logEvent(eventName, params = {}) {
    try {
        const enriched = {
            teacher_id: TEACHER_ID || 'unknown',
            group_id: SELECTED_GROUP_ID || 'none',
            ...params
        };
        const analytics = _getAnalytics();
        if (analytics) analytics.logEvent(eventName, enriched);
    } catch (e) { /* Analytics not critical, fail silently */ }
}


/**
 * SPOT TEACHER - FINAL INTEGRATED VERSION
 * Features: Smart Login + Parent Link + Unified Payments + Mirror Fix + Messages + Sync Fix + Fail-Safe Loading + Auto-Switch + UI Protection
 * FIXES: 
 * 1. Exams now include a DATE field so they appear in Parent App.
 * 2. Daily Homework saves score as NULL to be distinguished from Exams.
 */

// ==========================================
// 1. FIREBASE CONFIG
// ==========================================
const prodConfig = {
    apiKey: "AIzaSyAbN4awHvNUZWC-uCgU_hR7iYiHk-3dpv8",
    authDomain: "learnaria-483e7.firebaseapp.com",
    projectId: "learnaria-483e7",
    storageBucket: "learnaria-483e7.firebasestorage.app",
    messagingSenderId: "573038013067",
    appId: "1:573038013067:web:db6a78e8370d33b07a828e",
    measurementId: "G-T68CEZS4YC"
};

const devConfig = {
    apiKey: "AIzaSyAvWZpOmVqXxJhpcnuUod-kGn_JEFN7XFE",
    authDomain: "spot-dev-17336.firebaseapp.com",
    projectId: "spot-dev-17336",
    storageBucket: "spot-dev-17336.firebasestorage.app",
    messagingSenderId: "581004817275",
    appId: "1:581004817275:web:59c8d43a4c4aeae7fd43de",
    measurementId: "G-E4TN12XLED"
};

// ==========================================
// 2. SMART INITIALIZATION (Auto-Switch)
// ==========================================
let app, firestoreDB, storage, functions;
let activeConfig; // المتغير اللي شايل الكونفيج المختار

try {
    // الكشف عن البيئة (لو العنوان localhost أو 127.0.0.1 أو سيرفر الـ dev يبقى إحنا في بيئة التطوير)
    const isDevEnv = location.hostname === "localhost" || 
                     location.hostname === "127.0.0.1" || 
                     location.hostname.includes("spot-dev") ||
                     location.protocol === "file:";

    if (isDevEnv) {
        console.log("🚧 Running in DEVELOPMENT mode (Connected to Spot-dev: spot-dev-17336)");
        activeConfig = devConfig;

        // علامة أمان: خط أحمر فوق عشان تعرف إنك في التست وماتقلقش وانت بتمسح
        document.body.style.borderTop = "5px solid red";
    } else {
        console.log("🟢 Running in PRODUCTION mode (Connected to Live DB: learnaria-483e7)");
        activeConfig = prodConfig;
    }

    if (typeof firebase !== 'undefined') {
        // تشغيل التطبيق بالكونفيج المختار
        app = firebase.initializeApp(activeConfig);

        // Connect to Emulators ONLY if explicitly requested via ?emulator=true in URL
        if ((location.hostname === "localhost" || location.hostname === "127.0.0.1") && location.search.includes('emulator=true')) {
            firebase.auth().useEmulator('http://localhost:9090/');
            firebase.firestore().useEmulator('localhost', 8088);
            firebase.functions().useEmulator('localhost', 5011);
            console.log("🔌 Connected to Firebase Local Emulators");
        }

        // تفعيل الخدمات
        firestoreDB = firebase.firestore();
        storage = firebase.storage();
        functions = firebase.functions(); // مهم عشان الشات بوت يشتغل

        // تفعيل استمرارية الجلسة محلياً عبر Firebase Auth
        if (typeof firebase.auth === 'function') {
            firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(err => {
                console.warn("Failed to set Firebase Auth persistence:", err);
            });
        }

        // تفعيل Analytics (Production only)
        let analyticsInstance = null;
        if (!(location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:')) {
            try { analyticsInstance = firebase.analytics(); } catch(e) { /* not available */ }
        }

        // تفعيل الكاش (Offline Persistence) مع دعم التبويبات المتعددة لمنع الأخطاء
        firestoreDB.enablePersistence({ synchronizeTabs: true }).catch(err => {
            if (err.code == 'failed-precondition') {
                console.log('Multiple tabs open, persistence can only be enabled in one tab at a time.');
            } else if (err.code == 'unimplemented') {
                console.log('The current browser does not support all of the features required to enable persistence');
            }
        });
    }
} catch (e) {
    console.error("Firebase Initialization Error:", e);
    sentryCaptureError(e, { action: "firebaseInit" });
}

// ==========================================
// 3. STATE & TRANSLATIONS
// ==========================================
let TEACHER_ID = null, TEACHER_CENTER_ID = null, SELECTED_GROUP_ID = null, allStudents = [], currentLang = localStorage.getItem('lang') || 'ar';
let isSyncing = false;
let syncRetryCount = 0;
let currentScannerMode = null, isScannerPaused = false, videoElement, animationFrameId;
let sessionScannedStudents = new Set();
let hasHomeworkToday = true, currentPendingStudentId = null, currentCrossGroupStudent = null, currentMessageStudentId = null, saveTimeout = null, groupAnalyticsChartInstance = null, groupHomeworkChartInstance = null;

// ✅ PHASE 2: Memory-as-State — single source of truth for the current session
// Structure: liveSessionData.attendance = { studentId: { status, time } }
//            liveSessionData.homework   = { studentId: { submitted, score } }
//            liveSessionData.date       = 'YYYY-MM-DD'
//            liveSessionData.groupId    = 'xxx'
const liveSessionData = { attendance: {}, homework: {}, date: null, groupId: null };

// Single Source of Truth for the payments tab — avoids DOM-as-state bugs
// Structure: livePaymentData.records = { studentId: { amount, paid } }
const livePaymentData = { groupId: null, month: null, records: {} };

// ── Domain Helpers: Explicit Distinction Between Exams & Homework ─────────
function isExamAssignment(asm) {
    if (!asm) return false;
    if (asm.type === 'exam') return true;
    if (asm.type === 'homework' || asm.type === 'daily') return false;
    if ((asm.name || '').includes('واجب') || (asm.name || '').match(/^Homework/i)) return false;
    return asm.totalMark !== undefined;
}

function isHomeworkAssignment(asm) {
    if (!asm) return false;
    if (asm.type === 'homework' || asm.type === 'daily') return true;
    if ((asm.name || '').includes('واجب') || (asm.name || '').match(/^Homework/i)) return true;
    return false;
}

// ✅ PHASE 2: Throttled-save state — guarantees a save fires at most every 4s under rapid scans
let _saveThrottleTimer = null;      // debounce arm (resets on each scan)
let _saveThrottleForced = null;     // max-interval arm (fires regardless after 4s)
let _saveThrottleRunning = false;   // prevent re-entrant save

// Session & Remember Me Helpers
function getSessionItem(key) {
    let val = localStorage.getItem(key);
    if (!val) {
        val = sessionStorage.getItem(key);
        if (val) {
            localStorage.setItem(key, val); // Migrate old sessionStorage to localStorage
            sessionStorage.removeItem(key);
        }
    }
    return val;
}
function setSessionItem(key, value) {
    localStorage.setItem(key, value);
}
function removeSessionItem(key) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
}

const translations = {
    ar: {
        pageTitle: "الناظر - لوحة تحكم المعلم",
        welcomeTeacherGreeting: "أهلاً بك، مستر ",
        teacherLoginTitle: "بوابة الناظر التعليمية",
        teacherLoginPrompt: "سجل دخولك الآن للبدء في إدارة صفوفك الذكية",
        loginBrandingTitle: 'إدارتك كلها في <span class="text-brand">مكان واحد.</span>',
        loginButton: "دخول",
        loginVerifying: "جاري التحقق...",
        passwordLabel: "كلمة المرور",
        phonePlaceholder: "01xxxxxxxxx",
        passwordPlaceholder: "كلمة المرور",
        welcomeTitle: "لوحة تحكم المعلم",
        currentGroupLabel: "المجموعة الحالية",
        selectGroupPlaceholder: "اختر مجموعة...",
        addGroupTitle: "مجموعة جديدة",
        groupNamePlaceholder: "اسم المجموعة",
        addBtn: "إضافة",
        tabProfile: "الملف",
        tabOverview: "المتابعة الذكية",
        tabDaily: "الحصة اليومية",
        tabStudents: "الطلاب",
        tabGrades: "الامتحانات",
        tabPayments: "التحصيل",
        tabSchedule: "الجدول",
        tabBot: "المساعد الذكي",
        dailyClassTitle: "إدارة الحصة",
        selectDateLabel: "تاريخ اليوم",
        homeworkToggleLabel: "يوجد واجب؟",
        homeworkToggleSub: "تفعيل المطالبة بالتسليم",
        startSmartScan: "بدء الرصد الذكي",
        liveLogTitle: "سجل الحصة المباشر",
        saveAllButton: "حفظ الكل",
        tableHeaderStudent: "الطالب",
        tableHeaderAttendance: "الحضور",
        tableHeaderHomework: "الواجب",
        myProfileTitle: "بياناتي",
        fullNamePlaceholder: "الاسم",
        subjectPlaceholder: "المادة",
        changePasswordPlaceholder: "تغيير كلمة المرور",
        saveProfileButton: "حفظ التغييرات",
        manageStudentsTitle: "الطلاب",
        newStudentPlaceholder: "اسم الطالب الجديد",
        parentPhonePlaceholder: "رقم ولي الأمر",
        addNewStudentButton: "إضافة للقائمة",
        searchPlaceholder: "بحث عن طالب...",
        msgModalTitle: "رسالة لولي الأمر",
        msgPlaceholder: "اكتب ملاحظاتك هنا (مثلاً: الطالب تحسن مستواه...)",
        sendMsgBtn: "إرسال",
        sendingMsg: "جاري الإرسال...",
        cancelBtn: "إلغاء",
        editGroupNameTitle: "تعديل اسم المجموعة",
        enterNewGroupName: "أدخل الاسم الجديد للمجموعة:",
        groupUpdatedSuccess: "تم تحديث اسم المجموعة بنجاح",
        yes: "نعم",
        no: "لا",
        examsTitle: "الامتحانات والدرجات",
        newAssignmentNameLabel: "اسم الامتحان / الواجب",
        addNewExamSectionTitle: "إضافة امتحان جديد",
        addNewAssignmentButton: "إنشاء الامتحان",
        selectExamPlaceholder: "-- اختر الامتحان --",
        saveGradesButton: "حفظ الدرجات",
        gradePlaceholder: "الدرجة",
        selectMonthLabel: "شهر التحصيل",
        amountLabel: "قيمة المصاريف",
        defaultAmountPlaceholder: "مثلاً 150",
        savePaymentsButton: "حفظ التحصيل",
        addRecurringScheduleTitle: "إضافة موعد ثابت",
        subjectLabel: "المادة",
        timeLabel: "الوقت",
        locationLabel: "المكان",
        selectDaysLabel: "الأيام",
        saveRecurringScheduleButton: "إضافة للجدول",
        mySchedulesLabel: "مواعيدي",
        modifySingleClassTitle: "تعديل طارئ",
        modifyClassPrompt: "تغيير أو إلغاء حصة محددة (سيتم إرسال إشعار فوري لأولياء الأمور).",
        classDateLabel: "تاريخ الحصة",
        newTimeLabel: "الموعد الجديد",
        updateClassButton: "تحديث",
        days: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
        repeatsOn: "كل:",
        scanOverlayText: "وجه الكود داخل الإطار",
        closeCamera: "إغلاق الكاميرا",
        homeworkQuestion: "هل سلم الواجب؟",
        yes: "نعم",
        no: "لا",
        printBtn: "طباعة",
        closeBtn: "إغلاق",
        saved: "تم الحفظ بنجاح!",
        error: "حدث خطأ!",
        studentAdded: "تمت الإضافة",
        confirmDelete: "تأكيد الحذف؟",
        online: "متصل",
        offline: "غير متصل",
        noStudentsInGroup: "لا يوجد طلاب في هذه المجموعة.",
        fillScheduleForm: "أدخل المادة والوقت واختر يوماً واحداً على الأقل.",
        scheduleSavedSuccess: "تم حفظ الجدول!",
        confirmScheduleDelete: "حذف هذا الموعد؟",
        classUpdatedSuccess: "تم تحديث الحصة ليوم {date}.",
        classCancelledSuccess: "تم إلغاء حصة يوم {date}.",
        paymentMonthMissing: "اختر الشهر أولاً",
        writeMsgFirst: "الرجاء كتابة رسالة",
        msgSentSuccess: "تم إرسال الرسالة بنجاح",
        msgSendFail: "فشل الإرسال. تأكد من الإنترنت",
        wrongPassword: "عفواً، رقم الهاتف أو كلمة المرور غير صحيحة.",
        present: "حاضر",
        absent: "غائب",
        late: "متأخر",
        accountNotRegistered: "عفواً، رقم الهاتف أو كلمة المرور غير صحيحة.",
        offlineFirstLogin: "يجب الاتصال بالإنترنت لتسجيل الدخول لأول مرة",
        selectGroupFirst: "الرجاء اختيار مجموعة أولاً",
        newStudentPlaceholder: "اسم الطالب",
        parentPhonePlaceholder: "رقم ولي الأمر",
        groupNamePlaceholder: "اسم المجموعة",
        newAssignmentNameLabel: "اسم الامتحان",
        locationPlaceholder: "سنتر كوليدج",
        groupCreatedSuccess: "تم إنشاء المجموعة بنجاح!",
        examCreatedSuccess: "تم إضافة الامتحان بنجاح!",
        linkCopied: "تم نسخ رابط المتابعة بنجاح 📋",
        copyFailed: "فشل النسخ ❌",
        landingNewVersion: "🚀 الإصدار الجديد متاح الآن",
        landingHeroTitle: "إدارتك كلها في <br> <span class='text-transparent bg-clip-text bg-gradient-to-r from-brand to-yellow-600'>مكان واحد.</span>",
        landingHeroSubtitle: "تطبيق <strong>الناظر</strong> هو مساعدك الشخصي الذكي. رصد غياب بالـ QR، متابعة درجات، تحصيل مصروفات، وتواصل فوري مع أولياء الأمور.. كل ده وأنت بتشرب قهوتك ☕",
        featureSmartAttendance: "غياب ذكي",
        featureSmartAttendanceSub: "سكانر سريع جداً",
        featureInstantConnect: "تواصل فوري",
        featureInstantConnectSub: "رابط لولي الأمر",
        featureFinance: "تحصيل مالي",
        featureFinanceSub: "متابعة دقيقة",
        featureReports: "تقارير",
        featureReportsSub: "إحصائيات شاملة",
        footerText: "© 2026 نظام الناظر. Made with <i class='ri-heart-fill text-red-500'></i> for Teachers.",
        goldenSettingsBtn: "إعدادات التذكرة الذهبية",
        goldenSettingsTitle: "إعدادات التذكرة الذهبية",
        goldenEnable: "تفعيل النظام",
        goldenWinRate: "نسبة الحظ (Win Rate)",
        goldenHint: "كلما زادت النسبة، زاد عدد الطلاب الفائزين.",
        goldenPrizesLabel: "قائمة الجوائز (جائزة في كل سطر)",
        goldenPrizesPlaceholder: "مثال: قلم هدية\nخصم 10 جنيه\nشوكولاتة",
        goldenSave: "حفظ الإعدادات 💾",
        goldenModalTitle: "🌟 مبروووووك! 🌟",
        goldenFoundMsg: "لقد عثرت على تذكرة ذهبية!",
        goldenClaim: "استلم الجائزة",
        tabBot: "المساعد الذكي",
        botFeedTitle: "تغذية البوت (الملازم)",
        botFeedHint: "أي ملف (PDF، صور، صوت) هترفع هنا، البوت هيذاكره فوراً ويجاوب منه على أسئلة الطلاب.",
        botDropArea: "اضغط للرفع أو اسحب الملف هنا",
        botFileHint: "PDF, Images & Audio (MP3, WAV)",
        botLibraryTitle: "مكتبة المعرفة",
        botLibraryEmpty: "المكتبة فارغة",
        botProcessing: "جاري المعالجة بواسطة الذكاء الاصطناعي...",
        botFileReady: "جاهز للاستخدام",
        deleteConfirm: "هل أنت متأكد من حذف هذا الملف من ذاكرة البوت؟",
        uploadSuccess: "تم الرفع! جاري المعالجة...",
        uploadError: "فشل الرفع",
        mustBePDF: "نوع الملف غير مدعوم. مسموح بـ PDF، صور، أو صوت فقط",
        loginFirst: "يجب تسجيل الدخول أولاً",

        // كارت الدعوة
        botInviteTitle: "رابط البوت الذكي",
        botInviteDesc: "شارك هذا الرابط والكود مع طلابك ليبدأوا المذاكرة معك.",
        teacherCodeLabel: "كود المدرس",
        copyInviteBtn: "نسخ رسالة الدعوة",
        inviteCopied: "تم نسخ رسالة الدعوة! ابعتها للطلاب فوراً 🚀",
        inviteCopyFail: "فشل النسخ",
        addNewStudentSectionTitle: "إضافة طالب جديد",
        studentFollowUp: "متابعة الطالب {name}",
        deleteGroupConfirm: "هل أنت متأكد من حذف هذه المجموعة نهائياً؟ سيتم حذف جميع الطلاب والبيانات المرتبطة بها!",
        deleteGroupSuccess: "تم حذف المجموعة بنجاح",
        overviewHonorRoll: "لوحة الشرف",
        overviewTopStudents: "أوائل المجموعة",
        overviewAbsenceAlert: "تنبيه الغياب المتكرر",
        overviewStudentsAtRisk: "طلاب في خطر",
        overviewWeeklySummary: "الملخص الأسبوعي",
        overviewAttendanceRate: "نسبة الحضور",
        overviewAvgAttendanceDesc: "متوسط الحضور لآخر 3 حصص",
        overviewGroupCurve: "منحنى مستوى المجموعة",
        overviewCollectionStatus: "حالة التحصيل (الشهر الحالي)",
        overviewPaymentStats: "إحصائيات الدفع لهذا الشهر",
        overviewPaidCount: "سددوا",
        overviewUnpaidCount: "متبقي",
        portalGroupDesc: "من فضلك اختر المجموعة الدراسية التي ترغب في إدارتها الآن للبدء، أو يمكنك إضافة مجموعة جديدة للعمل عليها.",
        portalGroupsHeader: "المجموعات الدراسية",
        portalAddGroupBtn: "إضافة مجموعة جديدة",
        loginRememberMe: "تذكرني",
        loginForgotPassword: "نسيت كلمة المرور؟",
        loginNoAccountContact: "ليس لديك حساب؟ تواصل لإنشاء حساب جديد",
        loginOfflineHint: "لوحة التحكم تدعم المزامنة السريعة للغياب والدرجات بدون إنترنت وتحديثها فور استرجاع الاتصال.",
        loginSupportText: "تواجه مشكلة؟ <a href=\"https://wa.me/+201009856266\" target=\"_blank\" class=\"text-brand hover:underline font-bold\">تواصل مع الدعم الفني</a>",
        widgetSmartAttendance: "حضور ذكي",
        widgetSmartAttendanceDesc: "تم رصد حضور أحمد ممدوح ✅",
        widgetAttendanceRate: "نسبة الحضور اليوم",
        widgetAttendanceRateDesc: "96.4% (مستقر)",
        widgetInstantNotifications: "إشعارات فورية",
        widgetInstantNotificationsDesc: "تم إرسال غياب الطالب لولي الأمر 📱",
        widgetFeeCollection: "تحصيل المصروفات",
        widgetFeeCollectionDesc: "تم تسديد شهر يونيو 💳",
        btnNew: "جديد",
        btnEdit: "تعديل",
        btnDelete: "حذف",
        changePasswordButtonLabel: "تغيير كلمة المرور",
        newExamTotalMarkPlaceholder: "الدرجة النهائية",
        totalMarkLabel: "الدرجة النهائية",
        paymentsGroupCollection: "تحصيل المجموعة",
        paymentsTotalMonthlyIncome: "إجمالي الدخل (الشهر)",
        tabCards: "كروت الطلاب",
        cardsTitle: "مولد كروت الطلاب (الذكية)",
        cardsSubtitle: "قم بتوليد كروت فارغة لربطها بالطلاب لاحقاً بكل سهولة.",
        cardsCountLabel: "عدد الكروت المطلوب توليدها (أقصى حد 200 في المرة)",
        cardsCountPlaceholder: "أدخل العدد (مثال: 9)",
        cardsGenerateAndPrintBtn: "توليد وطباعة الكروت",
        cardsGeneratedSuccess: "تم توليد كروت الطلاب بنجاح! 🎉",
        cardsTotalGeneratedPrefix: "العدد الإجمالي: ",
        cardsTotalGeneratedSuffix: " كارت. تم فتح نافذة الطباعة تلقائياً.",
        cardsReprintBtn: "إعادة طباعة نفس الكروت 🖨️",
        profileFollowUpPanel: "لوحة المتابعة",
        profileStudentTitlePrefix: "الطالب",
        profileStudentDetailsLabel: "بيانات الطالب",
        profileStudentCard: "كارت الطالب",
        profileAttendancePercentageLabel: "نسبة الحضور",
        profileExamsGradesTitle: "درجات الامتحانات",
        profileNoExamsYet: "لا يوجد امتحانات حالياً",
        profileMonthlyAttendanceRecord: "سجل الحضور الشهري",
        profilePaymentsStatusTitle: "حالة المصروفات",
        profileLastSessionsLog: "سجل آخر 20 حصة",
        profileHistoryTableDate: "التاريخ",
        profileHistoryTableStatus: "الحالة",
        profileHistoryTableHomework: "الواجب",
        studentsNoResults: "لم يتم العثور على طلاب",
        studentsStartAdding: "ابدأ بإضافة أول بطل لمجموعتك من الأسفل ✨",
        fcmEnabledTitle: "الإشعارات مفعلة",
        fcmDisabledTitle: "الإشعارات لسه مش مفعلة",
        sendMessageTooltip: "إرسال رسالة",
        changePasswordModalTitle: "تغيير كلمة المرور",
        changePasswordModalSub: "تأمين الحساب",
        changePasswordCurrentLabel: "كلمة المرور الحالية",
        changePasswordCurrentPlaceholder: "أدخل كلمة المرور الحالية",
        changePasswordNewLabel: "كلمة المرور الجديدة",
        changePasswordNewPlaceholder: "أدخل كلمة المرور الجديدة",
        changePasswordConfirmLabel: "تأكيد كلمة المرور الجديدة",
        changePasswordConfirmPlaceholder: "أعد إدخال كلمة المرور الجديدة",
        changePasswordSubmitBtn: "تأكيد وتغيير"
    },
    en: {
        pageTitle: "Elnazer - Teacher Dashboard",
        welcomeTeacherGreeting: "Welcome, Mr. ",
        teacherLoginTitle: "Elnazer Portal",
        teacherLoginPrompt: "Login to start managing your smart classes",
        loginBrandingTitle: 'All your class management in <span class="text-brand">one place.</span>',
        loginButton: "Login",
        loginVerifying: "Verifying...",
        passwordLabel: "Password",
        phonePlaceholder: "01xxxxxxxxx",
        passwordPlaceholder: "Password",
        welcomeTitle: "Teacher Dashboard",
        currentGroupLabel: "Current Group",
        selectGroupPlaceholder: "Select Group...",
        addGroupTitle: "New Group",
        groupNamePlaceholder: "Group Name",
        addBtn: "Add",
        tabProfile: "Profile",
        tabOverview: "Smart Overview",
        tabDaily: "Daily Class",
        tabStudents: "Students",
        tabGrades: "Exams",
        tabPayments: "Payments",
        tabSchedule: "Schedule",
        tabBot: "AI Assistant",
        dailyClassTitle: "Class Manager",
        selectDateLabel: "Today's Date",
        homeworkToggleLabel: "Homework?",
        homeworkToggleSub: "Enable submission tracking",
        startSmartScan: "Smart Scan",
        liveLogTitle: "Live Log",
        saveAllButton: "Save All",
        tableHeaderStudent: "Student",
        tableHeaderAttendance: "Status",
        tableHeaderHomework: "Homework",
        myProfileTitle: "My Profile",
        fullNamePlaceholder: "Full Name",
        subjectPlaceholder: "Subject",
        changePasswordPlaceholder: "Change Password",
        saveProfileButton: "Save Changes",
        manageStudentsTitle: "Students",
        newStudentPlaceholder: "New Student Name",
        parentPhonePlaceholder: "Parent Phone",
        addNewStudentButton: "Add to List",
        searchPlaceholder: "Search student...",
        msgModalTitle: "Message to Parent",
        msgPlaceholder: "Write your notes here...",
        sendMsgBtn: "Send",
        sendingMsg: "Sending...",
        cancelBtn: "Cancel",
        editGroupNameTitle: "Edit Group Name",
        enterNewGroupName: "Enter new group name:",
        groupUpdatedSuccess: "Group name updated successfully",
        yes: "Yes",
        no: "No",
        examsTitle: "Exams & Grades",
        newAssignmentNameLabel: "Exam / Assignment Name",
        addNewExamSectionTitle: "Add New Exam",
        addNewAssignmentButton: "Create Exam",
        selectExamPlaceholder: "-- Select Exam --",
        saveGradesButton: "Save Grades",
        gradePlaceholder: "Score",
        selectMonthLabel: "Collection Month",
        amountLabel: "Amount",
        defaultAmountPlaceholder: "e.g. 150",
        savePaymentsButton: "Save Payments",
        addRecurringScheduleTitle: "Add Recurring Class",
        subjectLabel: "Subject",
        timeLabel: "Time",
        locationLabel: "Location",
        selectDaysLabel: "Days",
        saveRecurringScheduleButton: "Add to Schedule",
        mySchedulesLabel: "My Schedules",
        modifySingleClassTitle: "Emergency Edit",
        modifyClassPrompt: "Change or cancel a specific class (Parents will be notified immediately).",
        classDateLabel: "Class Date",
        newTimeLabel: "New Time",
        updateClassButton: "Update",
        days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        repeatsOn: "Every:",
        scanOverlayText: "Align code in frame",
        closeCamera: "Close Camera",
        homeworkQuestion: "Submitted Homework?",
        yes: "Yes",
        no: "No",
        printBtn: "Print",
        closeBtn: "Close",
        deleteGroupConfirm: "Are you sure you want to delete this group permanently? All students and related data will be deleted!",
        deleteGroupSuccess: "Group deleted successfully",
        saved: "Saved Successfully!",
        error: "Error Occurred!",
        studentAdded: "Student Added",
        confirmDelete: "Confirm Delete?",
        online: "Online",
        offline: "Offline",
        noStudentsInGroup: "No students in this group.",
        fillScheduleForm: "Fill subject, time and select a day.",
        scheduleSavedSuccess: "Schedule Saved!",
        confirmScheduleDelete: "Delete this schedule?",
        classUpdatedSuccess: "Class updated for {date}.",
        classCancelledSuccess: "Class cancelled for {date}.",
        paymentMonthMissing: "Select Month First",
        writeMsgFirst: "Please write a message",
        msgSentSuccess: "Message sent successfully",
        msgSendFail: "Sending failed. Check internet.",
        wrongPassword: "Sorry, incorrect phone number or password.",
        present: "Present",
        absent: "Absent",
        late: "Late",
        accountNotRegistered: "Sorry, incorrect phone number or password.",
        offlineFirstLogin: "Internet connection required for first login",
        selectGroupFirst: "Please select a group first",
        newStudentPlaceholder: "Student Name",
        parentPhonePlaceholder: "Parent Phone",
        groupNamePlaceholder: "Group Name",
        newAssignmentNameLabel: "Exam Name",
        locationPlaceholder: "Center College",
        groupCreatedSuccess: "Group created successfully!",
        examCreatedSuccess: "Exam added successfully!",
        linkCopied: "Follow-up link copied successfully 📋",
        copyFailed: "Copy failed ❌",
        landingNewVersion: "🚀 New Version Available",
        landingHeroTitle: "Manage Everything in <br> <span class='text-transparent bg-clip-text bg-gradient-to-r from-brand to-yellow-600'>One Place.</span>",
        landingHeroSubtitle: "<strong>Elnazer</strong> is your smart personal assistant. QR Attendance, Grade Tracking, Fee Collection, and Instant Parent Communication.. all while you sip your coffee ☕",
        featureSmartAttendance: "Smart Attendance",
        featureSmartAttendanceSub: "Super Fast Scanner",
        featureInstantConnect: "Instant Connect",
        featureInstantConnectSub: "Parent Link",
        featureFinance: "Finance",
        featureFinanceSub: "Accurate Tracking",
        featureReports: "Reports",
        featureReportsSub: "Full Analytics",
        footerText: "© 2026 Elnazer System. Made with <i class='ri-heart-fill text-red-500'></i> for Teachers.",
        goldenSettingsBtn: "Golden Ticket Settings",
        goldenSettingsTitle: "Golden Ticket Settings",
        goldenEnable: "Enable System",
        goldenWinRate: "Win Rate (%)",
        goldenHint: "Higher rate means more winners.",
        goldenPrizesLabel: "Prizes List (one per line)",
        goldenPrizesPlaceholder: "e.g. Gift Pen\n10 LE Discount\nChocolate",
        goldenSave: "Save Settings 💾",
        goldenModalTitle: "🌟 Congratulations! 🌟",
        goldenFoundMsg: "You found a Golden Ticket!",
        goldenClaim: "Claim Prize",
        // ... (Old Translations) ...

        // 👇👇 Spot AI Additions 👇👇
        tabBot: "Elnazer AI",
        botFeedTitle: "Feed the Bot (Materials)",
        botFeedHint: "Upload PDFs, Images, or Audio here. The bot will study them instantly to answer student questions.",
        botDropArea: "Click to upload or drag file here",
        botFileHint: "PDF, Images & Audio (MP3, WAV)",
        botLibraryTitle: "Knowledge Library",
        botLibraryEmpty: "Library is empty",
        botProcessing: "Processing by AI...",
        botFileReady: "Ready to use",
        deleteConfirm: "Are you sure you want to delete this file?",
        uploadSuccess: "Uploaded! Processing...",
        uploadError: "Upload Failed",
        mustBePDF: "Unsupported file type. Allowed: PDF, Images, Audio",
        loginFirst: "Login required first",

        // Invite Card
        botInviteTitle: "Elnazer AI Link",
        botInviteDesc: "Share this link and code with your students to start studying.",
        teacherCodeLabel: "Teacher Code",
        copyInviteBtn: "Copy Invite Message",
        inviteCopied: "Invite message copied! Send it to students 🚀",
        inviteCopyFail: "Copy failed",
        addNewStudentSectionTitle: "Add New Student",
        studentFollowUp: "Student Dashboard: {name}",
        overviewHonorRoll: "Honor Roll",
        overviewTopStudents: "Top Performers",
        overviewAbsenceAlert: "Absence Alert",
        overviewStudentsAtRisk: "Students at Risk",
        overviewWeeklySummary: "Weekly Summary",
        overviewAttendanceRate: "Attendance Rate",
        overviewAvgAttendanceDesc: "Avg Attendance (Last 3 Classes)",
        overviewGroupCurve: "Group Performance Curve",
        overviewCollectionStatus: "Collection Status (Current Month)",
        overviewPaymentStats: "Payment Stats for this Month",
        overviewPaidCount: "Paid",
        overviewUnpaidCount: "Remaining",
        portalGroupDesc: "Please select the group you wish to manage now to start, or you can add a new group to work on.",
        portalGroupsHeader: "Study Groups",
        portalAddGroupBtn: "Add New Group",
        loginRememberMe: "Remember Me",
        loginForgotPassword: "Forgot Password?",
        loginNoAccountContact: "Don't have an account? Contact to create one",
        loginOfflineHint: "The dashboard supports fast offline sync of attendance and grades, updating instantly when connection is restored.",
        loginSupportText: "Having trouble? <a href=\"https://wa.me/+201009856266\" target=\"_blank\" class=\"text-brand hover:underline font-bold\">Contact Technical Support</a>",
        widgetSmartAttendance: "Smart Attendance",
        widgetSmartAttendanceDesc: "Ahmed Mamdouh's attendance recorded ✅",
        widgetAttendanceRate: "Today's Attendance Rate",
        widgetAttendanceRateDesc: "96.4% (Stable)",
        widgetInstantNotifications: "Instant Notifications",
        widgetInstantNotificationsDesc: "Student absence sent to parent 📱",
        widgetFeeCollection: "Fee Collection",
        widgetFeeCollectionDesc: "June fee successfully paid 💳",
        btnNew: "New",
        btnEdit: "Edit",
        btnDelete: "Delete",
        changePasswordButtonLabel: "Change Password",
        newExamTotalMarkPlaceholder: "Total Score",
        totalMarkLabel: "Total Mark",
        paymentsGroupCollection: "Group Payments",
        paymentsTotalMonthlyIncome: "Total Monthly Income",
        tabCards: "Student Cards",
        cardsTitle: "Smart Student Cards Generator",
        cardsSubtitle: "Generate empty cards to link to students later with ease.",
        cardsCountLabel: "Number of cards to generate (max 200 at once)",
        cardsCountPlaceholder: "Enter quantity (e.g. 9)",
        cardsGenerateAndPrintBtn: "Generate & Print Cards",
        cardsGeneratedSuccess: "Student cards generated successfully! 🎉",
        cardsTotalGeneratedPrefix: "Total cards: ",
        cardsTotalGeneratedSuffix: " cards. Print window opened automatically.",
        cardsReprintBtn: "Reprint same cards 🖨️",
        profileFollowUpPanel: "Follow-up Panel",
        profileStudentTitlePrefix: "Student",
        profileStudentDetailsLabel: "Student Details",
        profileStudentCard: "Student Card",
        profileAttendancePercentageLabel: "Attendance Rate",
        profileExamsGradesTitle: "Exam Grades",
        profileNoExamsYet: "No exams recorded yet",
        profileMonthlyAttendanceRecord: "Monthly Attendance Record",
        profilePaymentsStatusTitle: "Payments Status",
        profileLastSessionsLog: "Last 20 Sessions Log",
        profileHistoryTableDate: "Date",
        profileHistoryTableStatus: "Status",
        profileHistoryTableHomework: "Homework",
        studentsNoResults: "No students found",
        studentsStartAdding: "Start by adding the first hero to your group below ✨",
        fcmEnabledTitle: "Notifications active",
        fcmDisabledTitle: "Notifications not active yet",
        sendMessageTooltip: "Send Message",
        changePasswordModalTitle: "Change Password",
        changePasswordModalSub: "Secure Account",
        changePasswordCurrentLabel: "Current Password",
        changePasswordCurrentPlaceholder: "Enter current password",
        changePasswordNewLabel: "New Password",
        changePasswordNewPlaceholder: "Enter new password",
        changePasswordConfirmLabel: "Confirm New Password",
        changePasswordConfirmPlaceholder: "Re-enter new password",
        changePasswordSubmitBtn: "Confirm & Change"
    }
};

// ==========================================
// 4. UTILS
// ==========================================
function generateUniqueId() { return `off_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`; }

// FIX #1: Local timezone date helpers (replaces new Date().toISOString().slice(...) which uses UTC)
function getLocalDateString(date = new Date()) {
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffset).toISOString().slice(0, 10);
}

function getLocalMonthString(date = new Date()) {
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffset).toISOString().slice(0, 7);
}


function generateCardId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'NAZ-';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
// ✅ تحسين: تنظيف الرقم من المسافات قبل الفحص
function isValidEgyptianPhoneNumber(p) {
    if (!p) return false;
    const clean = p.replace(/\s+/g, '').replace(/[^\d]/g, ''); // شيل أي مسافة أو علامة
    return /^01[0125]\d{8}$/.test(clean);
}

function formatPhoneNumber(p) {
    if (!p) return null;
    const clean = p.replace(/\s+/g, '').replace(/[^\d]/g, '');
    // نعيد الرقم بصيغة +20 الدولية لأنها الصيغة اللي فيها الداتا التاريخية
    return isValidEgyptianPhoneNumber(clean) ? `+20${clean.substring(1)}` : null;
}

function checkGroupSelectionPortal() {
    const portal = document.getElementById('groupSelectorPortal');
    const main = document.getElementById('mainContent');
    if (!TEACHER_ID) {
        if (portal) portal.classList.add('hidden');
        if (main) main.classList.add('hidden');
        return;
    }
    
    if (!SELECTED_GROUP_ID) {
        if (portal) portal.classList.remove('hidden');
        if (main) main.classList.add('hidden');
    } else {
        if (portal) portal.classList.add('hidden');
        if (main) main.classList.remove('hidden');
    }
}

window.openAddNewGroupFlow = function() {
    // 1. Hide portal and show main content
    const portal = document.getElementById('groupSelectorPortal');
    const main = document.getElementById('mainContent');
    if (portal) portal.classList.add('hidden');
    if (main) main.classList.remove('hidden');
    
    // 2. Switch to profile tab
    switchTab('profile');
    
    // 3. Focus and select group name input
    setTimeout(() => {
        const inputField = document.getElementById('newGroupName');
        if (inputField) {
            inputField.focus();
            inputField.select();
        }
    }, 150);
};

// ✅ دالة لإصلاح المعرف المخزن لو كان بالصيغة القديمة (بدون +20)
function migrateTeacherID() {
    let tid = localStorage.getItem('learnaria-tid');
    let cid = localStorage.getItem('learnaria-cid');
    
    if (tid && tid.startsWith('01')) {
        const migrated = `+20${tid.substring(1)}`;
        console.log(`🔄 Migrating Teacher ID in localStorage: ${tid} -> ${migrated}`);
        localStorage.setItem('learnaria-tid', migrated);
        TEACHER_ID = migrated;
    } else if (tid) {
        TEACHER_ID = tid;
    }
    
    if (cid) {
        TEACHER_CENTER_ID = cid;
    }
}

// ✅ كشف نوع الجهاز لضبط المراية
document.addEventListener('DOMContentLoaded', function () {
    // بنشوف هل الجهاز موبايل (أندرويد أو آيفون)
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // لو مش موبايل (يعني لابتوب)، ضيف الكلاس ده للـ Body
    if (!isMobile) {
        document.body.classList.add('desktop-device');
    }
});

function playBeep() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 800; gain.gain.value = 0.1;
        osc.start(); osc.stop(ctx.currentTime + 0.1);
        if (navigator.vibrate) navigator.vibrate(50);
    } catch (e) { }
}

function showToast(msg, type = 'success') {
    const div = document.createElement('div');
    div.className = `message-box ${type === 'error' ? 'border-red-500 text-red-500' : ''}`;
    div.innerHTML = type === 'error' ? `<i class="ri-error-warning-line"></i> ${msg}` : `<i class="ri-checkbox-circle-line"></i> ${msg}`;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}

// ✅ CUSTOM PREMIUM PROMPT & CONFIRM (REPLACES BROWSER DIALOGS)
function showCustomPrompt(title, desc, defaultValue = '', icon = 'ri-edit-line', isConfirm = false) {
    return new Promise((resolve) => {
        const modal = document.getElementById('customInputModal');
        const content = document.getElementById('customInputContent');
        const overlay = document.getElementById('customInputOverlay');
        const inputContainer = document.getElementById('customInputContainer');
        const input = document.getElementById('customInputField');
        const titleEl = document.getElementById('customInputTitle');
        const descEl = document.getElementById('customInputDesc');
        const iconEl = document.getElementById('customInputIcon');
        const confirmBtn = document.getElementById('customInputConfirmBtn');
        const cancelBtn = document.getElementById('customInputCancelBtn');

        titleEl.innerText = title;
        descEl.innerText = desc;
        input.value = defaultValue;
        iconEl.className = `${icon} text-brand text-2xl`;

        if (isConfirm) {
            inputContainer.classList.add('hidden');
            confirmBtn.innerText = translations[currentLang].yes || 'نعم';
        } else {
            inputContainer.classList.remove('hidden');
            confirmBtn.innerText = translations[currentLang].saveProfileButton || 'حفظ';
        }

        modal.classList.remove('hidden');
        setTimeout(() => {
            content.classList.remove('scale-95', 'opacity-0');
            content.classList.add('scale-100', 'opacity-100');
            if (!isConfirm) {
                input.focus();
                input.select();
            }
        }, 10);

        const close = (value) => {
            content.classList.remove('scale-100', 'opacity-100');
            content.classList.add('scale-95', 'opacity-0');
            setTimeout(() => {
                modal.classList.add('hidden');
                resolve(value);
            }, 300);

            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
            overlay.onclick = null;
            input.onkeydown = null;
        };

        confirmBtn.onclick = () => close(isConfirm ? true : input.value);
        cancelBtn.onclick = () => close(isConfirm ? false : null);
        overlay.onclick = () => close(isConfirm ? false : null);
        input.onkeydown = (e) => {
            if (!isConfirm) {
                if (e.key === 'Enter') close(input.value);
                if (e.key === 'Escape') close(null);
            }
        };
    });
}

async function showCustomConfirm(title, desc, icon = 'ri-question-line') {
    return await showCustomPrompt(title, desc, '', icon, true);
}

// ✅ NOTIFICATION STATUS MODAL FUNCTIONS
function openNotificationStatusModal() {
    console.log("🔔 Opening Notification Modal. Total students:", typeof allStudents !== 'undefined' ? allStudents.length : 'undefined');
    const modal = document.getElementById('notificationStatusModal');
    const content = document.getElementById('notificationStatusModalContent');

    if (!modal || !content) {
        console.error("❌ Notification Modal elements not found!");
        return;
    }

    // Reset lists
    document.getElementById('activatedStudentsList').innerHTML = '';
    document.getElementById('notActivatedStudentsList').innerHTML = '';

    const activated = [];
    const notActivated = [];

    if (Array.isArray(allStudents)) {
        allStudents.forEach(s => {
            if (s.parentFcmToken) activated.push(s);
            else notActivated.push(s);
        });
    }

    document.getElementById('activatedCount').innerText = activated.length;
    document.getElementById('notActivatedCount').innerText = notActivated.length;

    renderNotificationSubList(activated, 'activatedStudentsList', true);
    renderNotificationSubList(notActivated, 'notActivatedStudentsList', false);

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
    }, 10);
}

function closeNotificationStatusModal() {
    const modal = document.getElementById('notificationStatusModal');
    const content = document.getElementById('notificationStatusModalContent');
    if (!modal || !content) return;

    content.classList.remove('scale-100', 'opacity-100');
    content.classList.add('scale-95', 'opacity-0');

    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 300);
}

function renderNotificationSubList(list, containerId, isActivated) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (list.length === 0) {
        container.innerHTML = `
            <div class="col-span-full py-6 px-4 border border-dashed border-gray-200 dark:border-white/10 rounded-2xl text-center">
                <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest">لا يوجد طلاب</p>
            </div>
        `;
        return;
    }

    list.forEach(s => {
        const div = document.createElement('div');
        div.className = `group p-4 rounded-[1.2rem] border transition-all flex items-center justify-between bg-white dark:bg-white/5 border-gray-100 dark:border-white/10 hover:border-brand/40 shadow-sm hover:shadow-md`;

        div.innerHTML = `
            <div class="text-right">
                <h5 class="text-sm font-black text-gray-800 dark:text-gray-200 group-hover:text-brand transition-colors tracking-tight">${s.name || 'مجهول'}</h5>
                <p class="text-[10px] text-gray-400 font-bold mt-0.5">${s.parentPhoneNumber ? (s.parentPhoneNumber.startsWith('+2') ? s.parentPhoneNumber.substring(2) : s.parentPhoneNumber) : '---'}</p>
            </div>
            <div class="w-10 h-10 rounded-xl ${isActivated ? 'bg-green-50 text-green-500' : 'bg-red-50 text-red-400'} dark:bg-zinc-800 flex items-center justify-center border border-gray-100 dark:border-zinc-800">
                <i class="${isActivated ? 'ri-checkbox-circle-fill' : 'ri-error-warning-fill'} text-xl"></i>
            </div>
        `;
        container.appendChild(div);
    });
}
