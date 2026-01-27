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
    // الكشف عن البيئة (لو العنوان localhost أو 127.0.0.1 يبقى إحنا بنجرب)
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.protocol === "file:") {
        console.log("🚧 Running in DEVELOPMENT mode (Test DB)");
        activeConfig = devConfig;
        
        // علامة أمان: خط أحمر فوق عشان تعرف إنك في التست وماتقلقش وانت بتمسح
        document.body.style.borderTop = "5px solid red"; 
    } else {
        console.log("🟢 Running in PRODUCTION mode (Live DB)");
        activeConfig = prodConfig;
    }

    if (typeof firebase !== 'undefined') {
        // تشغيل التطبيق بالكونفيج المختار
        app = firebase.initializeApp(activeConfig);
        
        // تفعيل الخدمات
        firestoreDB = firebase.firestore();
        storage = firebase.storage();
        functions = firebase.functions(); // مهم عشان الشات بوت يشتغل

        // تفعيل الكاش (Offline Persistence)
        firestoreDB.enablePersistence().catch(err => {
            if (err.code == 'failed-precondition') {
                console.log('Multiple tabs open, persistence can only be enabled in one tab at a time.');
            } else if (err.code == 'unimplemented') {
                console.log('The current browser does not support all of the features required to enable persistence');
            }
        });
    }
} catch (e) { 
    console.error("Firebase Initialization Error:", e); 
}

// ==========================================
// 2. LOCAL DATABASE (IndexedDB) - FIXED
// ==========================================
const DB_NAME = 'LearnariaDB';
const DB_VERSION = 6;
let localDB = null;

function openDB() {
    return new Promise((resolve, reject) => {
        if (localDB) {
            resolve(localDB);
            return;
        }

        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = e => {
            const db = e.target.result;
            ['teachers', 'groups', 'students', 'assignments', 'attendance', 'payments', 'schedules', 'scheduleExceptions', 'syncQueue'].forEach(store => {
                if (!db.objectStoreNames.contains(store)) {
                    const params = store === 'syncQueue' ? { autoIncrement: true } : { keyPath: 'id' };
                    const s = db.createObjectStore(store, params);
                    if (['groups', 'students', 'assignments', 'schedules'].includes(store)) s.createIndex(store === 'groups' ? 'teacherId' : 'groupId', store === 'groups' ? 'teacherId' : 'groupId', { unique: false });
                }
            });
        };

        req.onsuccess = e => {
            localDB = e.target.result;
            localDB.onclose = () => { localDB = null; };
            localDB.onversionchange = () => { localDB.close(); localDB = null; };
            resolve(localDB);
        };

        req.onerror = e => reject(e.target.error);
    });
}

// --- DB HELPERS (With Retry Logic) ---
async function getFromDB(store, key) {
    try {
        await openDB();
        return new Promise((res, rej) => {
            const tx = localDB.transaction(store, 'readonly').objectStore(store).get(key);
            tx.onsuccess = () => res(tx.result);
            tx.onerror = () => rej(tx.error);
        });
    } catch (e) {
        if (e.name === 'InvalidStateError' || !localDB) {
            localDB = null;
            await openDB();
            return new Promise((res, rej) => {
                const tx = localDB.transaction(store, 'readonly').objectStore(store).get(key);
                tx.onsuccess = () => res(tx.result); tx.onerror = () => rej(tx.error);
            });
        }
        throw e;
    }
}

async function putToDB(store, data) {
    try {
        await openDB();
        const tx = localDB.transaction(store, 'readwrite');
        tx.objectStore(store).put(data);
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        if (e.name === 'InvalidStateError' || !localDB) {
            localDB = null;
            await openDB();
            const tx = localDB.transaction(store, 'readwrite');
            tx.objectStore(store).put(data);
            return new Promise((resolve, reject) => {
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        }
        throw e;
    }
}

async function getAllFromDB(store, idx, key) {
    try {
        await openDB();
        return new Promise((res, rej) => {
            const s = localDB.transaction(store, 'readonly').objectStore(store);
            const req = idx ? s.index(idx).getAll(key) : s.getAll();
            req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
        });
    } catch (e) {
        if (e.name === 'InvalidStateError' || !localDB) {
            localDB = null;
            await openDB();
            return new Promise((res, rej) => {
                const s = localDB.transaction(store, 'readonly').objectStore(store);
                const req = idx ? s.index(idx).getAll(key) : s.getAll();
                req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
            });
        }
        throw e;
    }
}

async function deleteFromDB(store, key) {
    try {
        await openDB();
        const tx = localDB.transaction(store, 'readwrite');
        tx.objectStore(store).delete(key);
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        localDB = null;
        await openDB();
        const tx = localDB.transaction(store, 'readwrite');
        tx.objectStore(store).delete(key);
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }
}

// ==========================================
// 3. STATE & TRANSLATIONS
// ==========================================
let TEACHER_ID = null, SELECTED_GROUP_ID = null, allStudents = [], currentLang = 'ar';
let isSyncing = false;
let currentScannerMode = null, isScannerPaused = false, videoElement, animationFrameId;
let hasHomeworkToday = false, currentPendingStudentId = null, currentMessageStudentId = null;

const translations = {
    ar: {
        pageTitle: "Spot - المعلم الذكي",
        teacherLoginTitle: "تسجيل دخول المعلم",
        teacherLoginPrompt: "أدخل رقمك للبدء",
        loginButton: "دخول",
        loginVerifying: "جاري التحقق...",
        passwordLabel: "كلمة المرور",
        phonePlaceholder: "01xxxxxxxxx",
        passwordPlaceholder: "كلمة المرور",
        welcomeTitle: "لوحة تحكم المعلم الذكي",
        currentGroupLabel: "المجموعة الحالية",
        selectGroupPlaceholder: "اختر مجموعة...",
        addGroupTitle: "مجموعة جديدة",
        groupNamePlaceholder: "اسم المجموعة",
        addBtn: "إضافة",
        tabProfile: "الملف",
        tabDaily: "الحصة اليومية",
        tabStudents: "الطلاب",
        tabGrades: "الامتحانات",
        tabPayments: "التحصيل",
        tabSchedule: "الجدول",
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
        examsTitle: "الامتحانات والدرجات",
        newAssignmentNameLabel: "اسم الامتحان / الواجب",
        addNewAssignmentButton: "إنشاء",
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
        modifyClassPrompt: "تغيير أو إلغاء حصة محددة.",
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
        wrongPassword: "كلمة المرور خاطئة! حاول مرة أخرى.",
        present: "حاضر",
        absent: "غائب",
        late: "متأخر",
        accountNotRegistered: "هذا الحساب غير مسجل! يرجى التواصل مع الإدارة.",
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
        landingHeroSubtitle: "تطبيق <strong>Spot</strong> هو مساعدك الشخصي الذكي. رصد غياب بالـ QR، متابعة درجات، تحصيل مصروفات، وتواصل فوري مع أولياء الأمور.. كل ده وأنت بتشرب قهوتك ☕",
        featureSmartAttendance: "غياب ذكي",
        featureSmartAttendanceSub: "سكانر سريع جداً",
        featureInstantConnect: "تواصل فوري",
        featureInstantConnectSub: "رابط لولي الأمر",
        featureFinance: "تحصيل مالي",
        featureFinanceSub: "متابعة دقيقة",
        featureReports: "تقارير",
        featureReportsSub: "إحصائيات شاملة",
        footerText: "© 2026 Spot System. Made with <i class='ri-heart-fill text-red-500'></i> for Teachers.",
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
        inviteCopyFail: "فشل النسخ"
    },
    en: {
        pageTitle: "Spot - Smart Teacher",
        teacherLoginTitle: "Teacher Login",
        teacherLoginPrompt: "Enter phone to start",
        loginButton: "Login",
        loginVerifying: "Verifying...",
        passwordLabel: "Password",
        phonePlaceholder: "01xxxxxxxxx",
        passwordPlaceholder: "Password",
        welcomeTitle: "Smart Teacher Dashboard",
        currentGroupLabel: "Current Group",
        selectGroupPlaceholder: "Select Group...",
        addGroupTitle: "New Group",
        groupNamePlaceholder: "Group Name",
        addBtn: "Add",
        tabProfile: "Profile",
        tabDaily: "Daily Class",
        tabStudents: "Students",
        tabGrades: "Exams",
        tabPayments: "Payments",
        tabSchedule: "Schedule",
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
        examsTitle: "Exams & Grades",
        newAssignmentNameLabel: "Exam / Assignment Name",
        addNewAssignmentButton: "Create",
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
        modifyClassPrompt: "Change or cancel specific class.",
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
        wrongPassword: "Wrong Password! Try again.",
        present: "Present",
        absent: "Absent",
        late: "Late",
        accountNotRegistered: "Account not registered! Please contact admin.",
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
        landingHeroSubtitle: "<strong>Spot</strong> is your smart personal assistant. QR Attendance, Grade Tracking, Fee Collection, and Instant Parent Communication.. all while you sip your coffee ☕",
        featureSmartAttendance: "Smart Attendance",
        featureSmartAttendanceSub: "Super Fast Scanner",
        featureInstantConnect: "Instant Connect",
        featureInstantConnectSub: "Parent Link",
        featureFinance: "Finance",
        featureFinanceSub: "Accurate Tracking",
        featureReports: "Reports",
        featureReportsSub: "Full Analytics",
        footerText: "© 2026 Spot System. Made with <i class='ri-heart-fill text-red-500'></i> for Teachers.",
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
        tabBot: "Spot AI",
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
        botInviteTitle: "Spot AI Link",
        botInviteDesc: "Share this link and code with your students to start studying.",
        teacherCodeLabel: "Teacher Code",
        copyInviteBtn: "Copy Invite Message",
        inviteCopied: "Invite message copied! Send it to students 🚀",
        inviteCopyFail: "Copy failed"

    }
};

// ==========================================
// 4. UTILS
// ==========================================
function generateUniqueId() { return `off_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`; }
function isValidEgyptianPhoneNumber(p) { return /^01[0125]\d{8}$/.test(p?.trim()); }
function formatPhoneNumber(p) { return isValidEgyptianPhoneNumber(p) ? `+20${p.trim().substring(1)}` : null; }

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

// --- SYNC ---
async function addToSyncQueue(action) {
    await putToDB('syncQueue', action);
    updateOnlineStatus();
}

function updateOnlineStatus() {
    const indicator = document.getElementById('statusIndicator');
    if (!indicator) return;

    const dot = indicator.querySelector('.status-dot');
    const text = indicator.querySelector('.status-text');

    if (navigator.onLine) {
        indicator.classList.remove('offline');
        indicator.classList.add('online');
        text.innerText = translations[currentLang].online;
        dot.className = 'status-dot w-2.5 h-2.5 rounded-full';
        processSyncQueue();
    } else {
        indicator.classList.remove('online');
        indicator.classList.add('offline');
        text.innerText = translations[currentLang].offline;
        dot.className = 'status-dot w-2.5 h-2.5 rounded-full';
    }
    updateSyncUI();
}

async function updateSyncUI() {
    if (!localDB) await openDB();
    const count = await new Promise(r => {
        const req = localDB.transaction('syncQueue').objectStore('syncQueue').count();
        req.onsuccess = () => r(req.result);
    });
    const el = document.getElementById('syncIndicator');
    if (el) {
        if (count > 0) el.innerHTML = `<i class="ri-refresh-line animate-spin text-yellow-500"></i> ${count}`;
        else el.innerHTML = `<i class="ri-check-double-line text-green-500"></i>`;
    }
}

async function processSyncQueue() {
    if (!navigator.onLine || isSyncing) return;
    isSyncing = true;
    try {
        if (!localDB) await openDB();
        const tx = localDB.transaction('syncQueue', 'readwrite');
        const store = tx.objectStore('syncQueue');
        const req = store.getAll();

        req.onsuccess = async () => {
            const items = req.result;
            const keys = await new Promise(r => { const k = store.getAllKeys(); k.onsuccess = () => r(k.result); });

            for (let i = 0; i < items.length; i++) {
                const { type, path, data, id, options } = items[i];
                try {
                    if (type === 'set') await firestoreDB.doc(path).set(data, options || { merge: true });
                    else if (type === 'add') await firestoreDB.collection(path).doc(id).set(data, { merge: true });
                    else if (type === 'delete') await firestoreDB.doc(path).delete();
                    await deleteFromDB('syncQueue', keys[i]);
                } catch (e) { console.error(e); }
            }
            isSyncing = false;
            updateSyncUI();
        };
    } catch (e) { isSyncing = false; }
}

// ==========================================
// 5. INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    videoElement = document.getElementById('scannerVideo');
    await openDB();
    setupListeners();
    await loadPreferences();
    updateOnlineStatus();

    const dailyInput = document.getElementById('dailyDateInput');
    if (dailyInput) dailyInput.valueAsDate = new Date();

    createTimePicker('recurringTimeContainer');
    createTimePicker('exceptionNewTimeContainer');
    renderDayCheckboxes();

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
});

function setupListeners() {
    document.getElementById('setTeacherButton').addEventListener('click', loginTeacher);
    document.getElementById('logoutButton').addEventListener('click', logout);

    // ✅✅ FIX: Disable student inputs by default on load
    toggleStudentInputs(false);
    setupPhoneInput('teacherPhoneInput');
    setupPhoneInput('newParentPhoneNumber');
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tab = e.currentTarget.dataset.tab;
            if (!SELECTED_GROUP_ID && tab !== 'profile') {
                showToast(translations[currentLang].selectGroupPlaceholder, 'error');
                return;
            }
            switchTab(tab);
        });
    });

    document.getElementById('saveProfileButton').addEventListener('click', saveProfile);
    document.getElementById('createNewGroupBtn').addEventListener('click', createGroup);

    document.getElementById('groupSelect').addEventListener('change', async (e) => {
        SELECTED_GROUP_ID = e.target.value;
        switchTab('daily');
        await loadGroupData();
    });

    document.getElementById('addNewGroupButton').addEventListener('click', () => {
        // 1. الانتقال لتابة الملف الشخصي (Profile)
        switchTab('profile');

        // 2. الانتظار لحظة صغيرة (عشان التابة تفتح) ثم التركيز على حقل الاسم
        setTimeout(() => {
            const inputField = document.getElementById('newGroupName');
            if (inputField) {
                inputField.focus(); // وضع المؤشر داخل الخانة
                inputField.select(); // (اختياري) تظليل النص لو كان فيه نص قديم
            }
        }, 100); // 100 مللي ثانية كافية جداً
    });

    document.getElementById('startSmartScanBtn').addEventListener('click', () => startScanner('daily'));
    document.getElementById('homeworkToggle').addEventListener('change', (e) => {
        hasHomeworkToday = e.target.checked;
        renderDailyList();
    });
    document.getElementById('dailyDateInput').addEventListener('change', renderDailyList);
    document.getElementById('saveDailyBtn').addEventListener('click', saveDailyData);
    document.getElementById('hwYesBtn').addEventListener('click', () => resolveHomework(true));
    document.getElementById('hwNoBtn').addEventListener('click', () => resolveHomework(false));

    document.getElementById('addNewStudentButton').addEventListener('click', addNewStudent);
    document.getElementById('studentSearchInput').addEventListener('input', (e) => renderStudents(e.target.value));

    document.getElementById('addRecurringScheduleButton').addEventListener('click', saveRecurringSchedule);
    document.getElementById('updateSingleClassButton').addEventListener('click', updateSingleClass);
    document.getElementById('cancelSingleClassButton').addEventListener('click', cancelSingleClass);

    document.getElementById('scanPaymentsBtn').addEventListener('click', () => startScanner('payments'));
    document.getElementById('paymentMonthInput').addEventListener('change', renderPaymentsList);
    document.getElementById('savePaymentsBtn').addEventListener('click', savePayments);
    document.getElementById('addNewExamBtn').addEventListener('click', addNewExam);
    document.getElementById('examSelect').addEventListener('change', renderExamGrades);
    document.getElementById('saveExamGradesBtn').addEventListener('click', saveExamGrades);

    document.getElementById('closeScannerModal').addEventListener('click', stopScanner);
    document.getElementById('closeQrModal').addEventListener('click', () => document.getElementById('qrCodeModal').classList.add('hidden'));
    document.getElementById('printIdButton').addEventListener('click', () => window.print());
    document.getElementById('darkModeToggleButton').addEventListener('click', toggleDarkMode);
    document.getElementById('languageToggleButton').addEventListener('click', toggleLang);

    document.getElementById('closeMsgModal').addEventListener('click', () => {
        document.getElementById('messageModal').classList.add('hidden');
    });
    document.getElementById('confirmSendMsgBtn').addEventListener('click', sendCustomMessageAction);
    document.getElementById('shareIdBtn').addEventListener('click', shareCardAction);
    document.getElementById('botFileInput').addEventListener('change', handleBotFileUpload);
}

// ✅✅ NEW HELPER: Enable/Disable Student Inputs
function toggleStudentInputs(enable) {
    const inputs = [
        'newStudentName',
        'newParentPhoneNumber',
        'addNewStudentButton'
    ];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = !enable;
    });
}

// ==========================================
// 6. SCHEDULE LOGIC
// ==========================================
function createTimePicker(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
        <select id="${containerId}-hour" class="input-field text-center">
            ${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${String(i + 1).padStart(2, '0')}</option>`).join('')}
        </select>
        <select id="${containerId}-minute" class="input-field text-center">
            ${Array.from({ length: 60 }, (_, i) => `<option value="${i}">${String(i).padStart(2, '0')}</option>`).join('')}
        </select>
        <select id="${containerId}-period" class="input-field text-center">
            <option value="AM">AM</option>
            <option value="PM">PM</option>
        </select>
    `;
}

function getTimeFromPicker(containerId) {
    const h = document.getElementById(`${containerId}-hour`);
    const m = document.getElementById(`${containerId}-minute`);
    const p = document.getElementById(`${containerId}-period`);
    if (!h || !m || !p) return '';
    let hour = parseInt(h.value, 10);
    if (p.value === 'PM' && hour < 12) hour += 12;
    if (p.value === 'AM' && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:${m.value}`;
}

function formatTime12Hour(timeString) {
    if (!timeString || !timeString.includes(':')) return timeString;
    const [hourString, minute] = timeString.split(':');
    const hour = parseInt(hourString, 10);
    const period = hour >= 12 ? 'PM' : 'AM';
    const convertedHour = hour % 12 || 12;
    return `${String(convertedHour).padStart(2, '0')}:${minute} ${period}`;
}

function renderDayCheckboxes() {
    const container = document.getElementById('daysOfWeekContainer');
    if (!container) return;
    container.innerHTML = '';
    translations[currentLang].days.forEach((day, index) => {
        const label = document.createElement('label');
        label.className = 'day-checkbox-container cursor-pointer flex items-center gap-2 bg-white dark:bg-black border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-xl hover:border-brand transition-all';
        label.innerHTML = `
            <input type="checkbox" class="day-checkbox w-4 h-4 accent-brand rounded" value="${index}">
            <span class="text-sm font-bold text-gray-700 dark:text-gray-300 select-none">${day}</span>
        `;
        label.querySelector('input').addEventListener('change', function () {
            if (this.checked) label.classList.add('bg-brand/10', 'border-brand');
            else label.classList.remove('bg-brand/10', 'border-brand');
        });
        container.appendChild(label);
    });
}

async function saveRecurringSchedule() {
    if (!TEACHER_ID || !SELECTED_GROUP_ID) return;
    const existing = await getAllFromDB('schedules', 'groupId', SELECTED_GROUP_ID);
    if (existing && existing.length > 0) {
        showToast("كل مجموعة لها موعد مكرر واحد فقط!", 'error');
        return;
    }
    const subject = document.getElementById('recurringSubject').value.trim();
    const location = document.getElementById('recurringLocation').value.trim();
    const time = getTimeFromPicker('recurringTimeContainer');
    const selectedDays = Array.from(document.querySelectorAll('#daysOfWeekContainer input:checked')).map(cb => parseInt(cb.value));

    if (!subject || !time || selectedDays.length === 0) {
        showToast(translations[currentLang].fillScheduleForm, 'error');
        return;
    }

    const id = generateUniqueId();
    const data = { id, groupId: SELECTED_GROUP_ID, subject, time, location, days: selectedDays };

    await putToDB('schedules', data);
    await addToSyncQueue({ type: 'add', path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/recurringSchedules`, id, data });

    showToast(translations[currentLang].scheduleSavedSuccess);
    document.getElementById('recurringSubject').value = '';
    document.querySelectorAll('#daysOfWeekContainer input').forEach(cb => { cb.checked = false; cb.parentElement.classList.remove('bg-brand/10', 'border-brand'); });

    fetchRecurringSchedules();
}

async function fetchRecurringSchedules() {
    if (!SELECTED_GROUP_ID) return;

    const container = document.getElementById('recurringSchedulesDisplay');
    if (!container) return;

    container.innerHTML = `<p class="text-center text-gray-500 py-4"><i class="ri-loader-4-line animate-spin"></i> Loading...</p>`;

    try {
        // 1. جلب البيانات (كما هو في السابق)
        let scheds = await getAllFromDB('schedules', 'groupId', SELECTED_GROUP_ID);

        // Sync check (لو مفيش داتا محلياً، نجرب السيرفر)
        if (scheds.length === 0 && navigator.onLine) {
            try {
                const snap = await firestoreDB.collection(`teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/recurringSchedules`).get();
                scheds = snap.docs.map(doc => ({ id: doc.id, groupId: SELECTED_GROUP_ID, ...doc.data() }));
                for (const s of scheds) await putToDB('schedules', s);
            } catch (e) { }
        }

        // ============================================================
        // 2. ⭐ التعديل الجديد: قفل/فتح الخانات والزرار بناءً على العدد ⭐
        // ============================================================
        const btn = document.getElementById('addRecurringScheduleButton');
        // تجميع كل الخانات (نصوص، قوائم وقت، مربعات اختيار)
        const allInputs = [
            document.getElementById('recurringSubject'),
            document.getElementById('recurringLocation'),
            ...document.querySelectorAll('#recurringTimeContainer select'),
            ...document.querySelectorAll('#daysOfWeekContainer input')
        ];

        if (scheds.length > 0) {
            // 🔒 حالة القفل: يوجد موعد بالفعل
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed', 'bg-gray-400'); // شكل باهت
            btn.innerHTML = '<i class="ri-lock-2-fill"></i> مسجل بالفعل'; // تغيير النص

            // تعطيل كل الخانات
            allInputs.forEach(el => { if (el) el.disabled = true; });

        } else {
            // 🔓 حالة الفتح: لا يوجد مواعيد
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-gray-400');
            btn.innerHTML = translations[currentLang].saveRecurringScheduleButton || "إضافة للجدول";

            // تفعيل كل الخانات
            allInputs.forEach(el => { if (el) el.disabled = false; });
        }
        // ============================================================

        // 3. عرض البيانات (Render) - نفس الكود القديم
        container.innerHTML = '';
        if (scheds.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-400 py-4">${translations[currentLang].noSchedulesYet || "No schedules"}</p>`;
            return;
        }

        scheds.forEach(s => {
            const dayNames = s.days.map(d => translations[currentLang].days[d]).join('، ');
            const timeText = formatTime12Hour(s.time);
            const div = document.createElement('div');
            div.className = 'record-item flex justify-between items-start bg-white dark:bg-darkSurface p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm mb-2';
            div.innerHTML = `
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="font-black text-gray-800 dark:text-white text-lg">${s.subject}</span>
                        <span class="bg-brand/20 text-yellow-800 dark:text-brand text-xs px-2 py-0.5 rounded-full font-bold">${timeText}</span>
                    </div>
                    <div class="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                        <i class="ri-repeat-line"></i> <span>${translations[currentLang].repeatsOn} ${dayNames}</span>
                    </div>
                </div>
                <button class="btn-icon w-8 h-8 bg-red-50 text-red-500 hover:bg-red-100 dark:bg-red-900/20 rounded-lg" data-id="${s.id}"><i class="ri-delete-bin-line"></i></button>
            `;

            // عند الحذف، نعيد تحميل الدالة فيتفك القفل تلقائياً
            div.querySelector('button').addEventListener('click', async () => {
                if (confirm(translations[currentLang].confirmScheduleDelete)) {
                    await deleteFromDB('schedules', s.id);
                    await addToSyncQueue({ type: 'delete', path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/recurringSchedules/${s.id}` });
                    // إعادة التحميل عشان الزرار يفتح تاني
                    fetchRecurringSchedules();
                }
            });
            container.appendChild(div);
        });
    } catch (e) { console.error(e); }
}

async function updateSingleClass() {
    if (!TEACHER_ID || !SELECTED_GROUP_ID) return;
    const date = document.getElementById('exceptionDate').value;
    const newTime = getTimeFromPicker('exceptionNewTimeContainer');

    if (!date || !newTime) return showToast("Check inputs", 'error');

    const id = `${SELECTED_GROUP_ID}_${date}`;
    const data = { id, groupId: SELECTED_GROUP_ID, date, newTime, type: 'modified' };

    await putToDB('scheduleExceptions', data);
    await addToSyncQueue({ type: 'set', path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/exceptions/${id}`, data });
    showToast(translations[currentLang].classUpdatedSuccess.replace('{date}', date));
}

async function cancelSingleClass() {
    if (!TEACHER_ID || !SELECTED_GROUP_ID) return;
    const date = document.getElementById('exceptionDate').value;
    if (!date) return showToast("Check date", 'error');

    const id = `${SELECTED_GROUP_ID}_${date}`;
    const data = { id, groupId: SELECTED_GROUP_ID, date, type: 'cancelled' };

    await putToDB('scheduleExceptions', data);
    await addToSyncQueue({ type: 'set', path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/exceptions/${id}`, data });
    showToast(translations[currentLang].classCancelledSuccess.replace('{date}', date));
}

// ==========================================
// 7. CORE LOGIC (Auth, Load, Switch)
// ==========================================

async function loginTeacher() {
    const phoneInput = document.getElementById('teacherPhoneInput');
    const passInput = document.getElementById('teacherPasswordInput');
    const phone = phoneInput.value;
    const password = passInput.value.trim();

    // تنسيق الرقم المصري
    const fmt = formatPhoneNumber(phone);
    if (!fmt) return showToast(translations[currentLang].phonePlaceholder, 'error');

    const btn = document.getElementById('setTeacherButton');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="ri-loader-4-line animate-spin"></i> ${translations[currentLang].loginVerifying}`;
    btn.disabled = true;

    try {
        // 1. البحث في الداتابيز المحلية أولاً
        let data = await getFromDB('teachers', fmt);

        // 2. لو مش موجود محلياً، نسأل السيرفر (أونلاين)
        if (!data) {
            if (!navigator.onLine) {
                showToast(translations[currentLang].offlineFirstLogin || "Internet required for first login", "error");
                throw new Error("Offline first login");
            }

            const doc = await firestoreDB.collection('teachers').doc(fmt).get();

            if (!doc.exists) {
                showToast(translations[currentLang].accountNotRegistered, "error");
                passInput.value = '';
                btn.innerHTML = originalText;
                btn.disabled = false;
                return;
            }

            // لو موجود -> نحفظه عندنا محلياً
            data = { id: doc.id, ...doc.data() };
            await putToDB('teachers', data);
        }

        // 3. التحقق من الباسورد
        if (data) {
            const storedPass = data.password ? data.password.toString().trim() : "";

            if (storedPass !== "" && storedPass !== password) {
                showToast(translations[currentLang].wrongPassword, "error");
                btn.innerHTML = originalText;
                btn.disabled = false;
                return;
            }

            // السماح بتعيين كلمة مرور لأول مرة
            if (storedPass === "" && password !== "") {
                data.password = password;
                await putToDB('teachers', data);
                if (navigator.onLine) {
                    firestoreDB.collection('teachers').doc(fmt).set({ password: password }, { merge: true });
                }
            }
        }

        // 4. تسجيل الدخول ناجح
        TEACHER_ID = fmt;
        localStorage.setItem('learnaria-tid', TEACHER_ID);

        document.getElementById('landingSection').classList.add('hidden');
        document.getElementById('mainContent').classList.remove('hidden');
        document.getElementById('logoutButton').classList.remove('hidden');

        if (data) {
            document.getElementById('dashboardTitle').innerText = `${translations[currentLang].pageTitle} - ${data.name || ''}`;
            document.getElementById('teacherNameInput').value = data.name || '';
            document.getElementById('teacherSubjectInput').value = data.subject || '';
            document.getElementById('profilePasswordInput').value = data.password || '';
        }

        await loadGroups();
        switchTab('daily');

    } catch (error) {
        if (error.message !== "Offline first login") {
            console.error("Login Error:", error);
            showToast(translations[currentLang].error, "error");
        }
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
function logout() { localStorage.removeItem('learnaria-tid'); location.reload(); }

async function loadGroups() {
    let groups = await getAllFromDB('groups', 'teacherId', TEACHER_ID);
    renderGroupsDropdown(groups);

    if (navigator.onLine) {
        try {
            const snap = await firestoreDB.collection(`teachers/${TEACHER_ID}/groups`).get();
            const remoteGroups = snap.docs.map(doc => ({ id: doc.id, teacherId: TEACHER_ID, ...doc.data() }));
            for (const g of remoteGroups) {
                await putToDB('groups', g);
            }
            renderGroupsDropdown(remoteGroups);
        } catch (e) {
            console.error("Failed to sync groups:", e);
        }
    }
}

function renderGroupsDropdown(groupsList) {
    const sel = document.getElementById('groupSelect');
    const currentVal = sel.value;
    sel.innerHTML = `<option value="" disabled ${!currentVal ? 'selected' : ''}>${translations[currentLang].selectGroupPlaceholder}</option>`;

    groupsList.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.innerText = g.name;
        if (currentVal === g.id) opt.selected = true;
        sel.appendChild(opt);
    });
}

async function createGroup() {
    const name = document.getElementById('newGroupName').value;
    if (!name) return;

    // 1. إنشاء الـ ID وحفظه
    const id = generateUniqueId();

    await putToDB('groups', { id, teacherId: TEACHER_ID, name });
    await addToSyncQueue({ type: 'add', path: `teachers/${TEACHER_ID}/groups`, id, data: { name } });

    document.getElementById('newGroupName').value = '';

    // 2. إعادة تحميل القوائم والانتظار حتى تنتهي
    await loadGroups();

    // 3. ✨ السحر هنا: تحديد المجموعة الجديدة تلقائياً ✨
    SELECTED_GROUP_ID = id; // تحديث المتغير العام
    document.getElementById('groupSelect').value = id; // تحديث شكل القائمة (Dropdown)

    // 4. الانتقال لتابة الحصة وتحميل بيانات المجموعة الفارغة
    switchTab('daily');
    await loadGroupData(); // تفعيل أزرار الإضافة (عشان لو عايز يضيف طلاب علطول)

    showToast(translations[currentLang].groupCreatedSuccess);
}

// ------------------------------------------------------------------
// ✅✅ NEW LOAD GROUP DATA WITH SAFE SYNC & FAIL-SAFE LOGIC ✅✅
// ------------------------------------------------------------------
async function loadGroupData() {
    const scanBtn = document.getElementById('startSmartScanBtn');
    const goldBtn = document.getElementById('openGoldenSettingsBtn');

    if (!SELECTED_GROUP_ID) {
        toggleStudentInputs(false);
        if (scanBtn) scanBtn.disabled = true;
        if (goldBtn) goldBtn.disabled = true;// ✅ ضمان الإغلاق لو مفيش مجموعة
        return;
    }

    // ✅ تفعيل خانات الإضافة بمجرد اختيار مجموعة
    toggleStudentInputs(true);
    if (scanBtn) scanBtn.disabled = false;
    if (goldBtn) goldBtn.disabled = false;

    document.querySelectorAll('.tab-button').forEach(b => b.disabled = false);

    // 1. محاولة جلب البيانات محلياً (داخل try-catch)
    try {
        const localData = await getAllFromDB('students', 'groupId', SELECTED_GROUP_ID);
        if (localData && Array.isArray(localData) && localData.length > 0) {
            allStudents = localData;
            refreshCurrentTab(); // تحديث سريع
        }
    } catch (error) {
        console.warn("Local load skipped:", error);
    }

    // 2. جلب البيانات من السيرفر (Sync)
    if (navigator.onLine) {
        try {
            const snap = await firestoreDB.collection(`teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/students`).get();
            const remoteStudents = snap.docs.map(d => ({
                id: d.id,
                groupId: SELECTED_GROUP_ID,
                ...d.data()
            }));

            allStudents = remoteStudents;
            refreshCurrentTab();
            saveStudentsToLocalDB(remoteStudents);

        } catch (e) {
            console.error("Sync error:", e);
        }
    }

    // تحديث مبدئي إذا لم يكن هناك تبويب نشط
    if (!document.querySelector('.tab-button.active')) switchTab('daily');
}

// ✅ دالة حفظ الطلاب للـ Cache في الخلفية
async function saveStudentsToLocalDB(students) {
    try {
        for (const s of students) await putToDB('students', s);
    } catch (e) { console.error("Cache update failed", e); }
}

// ✅ دالة تحديث الشاشة حسب التبويب المفتوح (تم تصحيح الشرط)
function refreshCurrentTab() {
    try {
        // التحقق من أن التبويب "غير مخفي" بدلاً من البحث عن كلاس "active" في المحتوى
        if (!document.getElementById('tab-students').classList.contains('hidden')) {
            if (typeof renderStudents === 'function') renderStudents();
        }
        else if (!document.getElementById('tab-daily').classList.contains('hidden')) {
            if (typeof renderDailyList === 'function') renderDailyList();
        }
    } catch (e) { console.error("Render error:", e); }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-button').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.remove('hidden');
    document.querySelector(`.tab-button[data-tab="${tabId}"]`).classList.add('active');

    if (tabId === 'daily') renderDailyList();
    if (tabId === 'students') renderStudents();
    if (tabId === 'payments') {
        const pm = document.getElementById('paymentMonthInput');
        if (!pm.value) pm.value = new Date().toISOString().slice(0, 7);
        renderPaymentsList();
    }
    if (tabId === 'exams') loadExams();

    if (tabId === 'schedule') {
        fetchRecurringSchedules();
        createTimePicker('recurringTimeContainer');
        createTimePicker('exceptionNewTimeContainer');
        renderDayCheckboxes();
        const profileSubject = document.getElementById('teacherSubjectInput').value;
        if (profileSubject) {
            document.getElementById('recurringSubject').value = profileSubject;
        }
    }
    if (tabId === 'bot') {
        
        loadBotFiles(); // دي الدالة اللي هنعملها تحت
    }
}

// ==========================================
// 8. DAILY & SCANNER
// ==========================================
async function renderDailyList() {
    const date = document.getElementById('dailyDateInput').value;
    const list = document.getElementById('dailyStudentsList');
    list.innerHTML = '';

    // تحديث عناوين الجدول
    const hStudent = document.getElementById('headerStudent');
    const hAtt = document.getElementById('headerAttendance');
    const hHw = document.getElementById('headerHomework');

    document.getElementById('headerStudent').innerText = translations[currentLang].tableHeaderStudent;
    document.getElementById('headerAttendance').innerText = translations[currentLang].tableHeaderAttendance;
    document.getElementById('headerHomework').innerText = translations[currentLang].tableHeaderHomework;

    if (hasHomeworkToday) {
        hStudent.className = "col-span-6 transition-all duration-300";
        hAtt.className = "col-span-3 text-center transition-all duration-300";
        hHw.classList.remove('hidden');
    } else {
        hStudent.className = "col-span-8 transition-all duration-300";
        hAtt.className = "col-span-4 text-center transition-all duration-300";
        hHw.classList.add('hidden');
    }

    if (!date || !allStudents.length) {
        list.innerHTML = `<p class="text-center text-gray-500 py-4">${translations[currentLang].noStudentsInGroup}</p>`;
        return;
    }

    // جلب البيانات المخزنة
    const attId = `${SELECTED_GROUP_ID}_${date}`;
    const hwId = `${SELECTED_GROUP_ID}_HW_${date}`;
    const [attDoc, hwDoc] = await Promise.all([getFromDB('attendance', attId), getFromDB('assignments', hwId)]);

    const attMap = {};
    if (attDoc?.records) attDoc.records.forEach(r => attMap[r.studentId] = r.status);

    const hwMap = {};
    if (hwDoc?.scores) {
        Object.entries(hwDoc.scores).forEach(([sid, val]) => hwMap[sid] = val.submitted);
        // تفعيل الواجب تلقائياً لو فيه داتا محفوظة
        if (!hasHomeworkToday) {
            hasHomeworkToday = true;
            document.getElementById('homeworkToggle').checked = true;
            hStudent.className = "col-span-6 transition-all duration-300";
            hAtt.className = "col-span-3 text-center transition-all duration-300";
            hHw.classList.remove('hidden');
        }
    }

    let presentCount = 0;

    allStudents.forEach(s => {
        const status = attMap[s.id] || 'absent'; // الافتراضي غائب لو مفيش تسجيل
        if (status === 'present') presentCount++;

        const hwSubmitted = hwMap[s.id];
        const isAbsent = status === 'absent';

        const studentColSpan = hasHomeworkToday ? 'col-span-6' : 'col-span-8';
        const attColSpan = hasHomeworkToday ? 'col-span-3' : 'col-span-4';

        const row = document.createElement('div');
        row.dataset.sid = s.id;

        // تنسيق الصف حسب الحالة
        row.className = `grid grid-cols-12 items-center p-3 rounded-lg border transition-colors mb-1 ${status === 'present'
                ? 'bg-green-50 border-green-500 dark:bg-green-900/20'
                : 'bg-white dark:bg-darkSurface border-transparent hover:bg-gray-50 dark:hover:bg-white/5'
            }`;

        let html = `
            <div class="${studentColSpan} font-bold text-sm truncate px-2 text-gray-800 dark:text-gray-200 transition-all duration-300">${s.name}</div>
            <div class="${attColSpan} flex justify-center transition-all duration-300">
                <select class="att-select bg-gray-50 dark:bg-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded text-xs py-1 px-1 outline-none cursor-pointer">
                    <option value="present" ${status === 'present' ? 'selected' : ''}>${translations[currentLang].present}</option>
                    <option value="absent" ${status === 'absent' ? 'selected' : ''}>${translations[currentLang].absent}</option>
                    </select>
            </div>
        `;

        if (hasHomeworkToday) {
            html += `
            <div class="col-span-3 flex justify-center fade-in-up">
                <input type="checkbox" class="hw-check w-5 h-5 accent-brand rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" 
                    ${hwSubmitted ? 'checked' : ''} 
                    ${isAbsent ? 'disabled' : ''}>
            </div>`;
        }

        row.innerHTML = html;

        // --- Logic: تغيير الحالة يقفل/يفتح الواجب ---
        const attSelect = row.querySelector('.att-select');
        const hwCheck = row.querySelector('.hw-check');

        attSelect.addEventListener('change', (e) => {
            const val = e.target.value;

            // 1. تغيير ألوان الصف
            if (val === 'present') {
                row.classList.add('bg-green-50', 'border-green-500', 'dark:bg-green-900/20');
                row.classList.remove('bg-white', 'dark:bg-darkSurface', 'border-transparent');

                // ✅ لو حضر: نفتح خانة الواجب
                if (hwCheck) hwCheck.disabled = false;

            } else { // absent
                row.classList.remove('bg-green-50', 'border-green-500', 'dark:bg-green-900/20');
                row.classList.add('bg-white', 'dark:bg-darkSurface', 'border-transparent');

                // ✅ لو غاب: نقفل خانة الواجب ونشيل علامة الصح (reset)
                if (hwCheck) {
                    hwCheck.checked = false;
                    hwCheck.disabled = true;
                }
            }

            // تحديث عداد الحضور المباشر
            updateAttendanceCount();
        });

        list.appendChild(row);
    });

    // دالة صغيرة لتحديث العداد
    function updateAttendanceCount() {
        const count = document.querySelectorAll('.att-select option[value="present"]:checked').length;
        document.getElementById('attendanceCountBadge').innerText = `${count}/${allStudents.length}`;
    }

    updateAttendanceCount(); // تشغيل العداد أول مرة
}

async function saveDailyData() {
    if (!TEACHER_ID || !SELECTED_GROUP_ID) return;

    // إظهار اللودر فوراً
    const saveBtn = document.getElementById('saveDailyBtn');
    const oldText = saveBtn.innerText;
    saveBtn.innerHTML = '<i class="ri-loader-4-line animate-spin"></i>';
    saveBtn.disabled = true;

    try {
        const date = document.getElementById('dailyDateInput').value;
        const attRecords = [];
        const hwScores = {};

        document.querySelectorAll('#dailyStudentsList > div').forEach(row => {
            const sid = row.dataset.sid;
            // 1. نجيب حالة الحضور الأول
            const status = row.querySelector('.att-select').value;

            // حفظ سجل الحضور (ده شغال للكل عادي)
            attRecords.push({ studentId: sid, status: status });

            // 2. اللوجيك الجديد: حفظ الواجب فقط لو الطالب "مش غائب"
            if (hasHomeworkToday && status !== 'absent') {
                hwScores[sid] = {
                    submitted: row.querySelector('.hw-check').checked,
                    score: null
                };
            }
        });

        // ✅ التعديل هنا: تجميع كل العمليات في مصفوفة واحدة
        const promises = [];

        // 1. حفظ الحضور محلياً وسحابياً
        promises.push(putToDB('attendance', { id: `${SELECTED_GROUP_ID}_${date}`, date, records: attRecords }));
        promises.push(addToSyncQueue({ type: 'set', path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/dailyAttendance/${date}`, data: { date, records: attRecords } }));

        // 2. حفظ الواجب محلياً وسحابياً (لو موجود)
        if (hasHomeworkToday) {
            const hwData = { id: `${SELECTED_GROUP_ID}_HW_${date}`, groupId: SELECTED_GROUP_ID, name: `واجب ${date}`, date, scores: hwScores, type: 'daily' };
            promises.push(putToDB('assignments', hwData));
            promises.push(addToSyncQueue({ type: 'set', path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/assignments/${hwData.id}`, data: hwData }));
        }

        // ✅ تنفيذ الكل في نفس اللحظة (أسرع بكتير)
        await Promise.all(promises);

        showToast(translations[currentLang].saved);
        renderDailyList();

    } catch (error) {
        console.error(error);
        showToast("حدث خطأ أثناء الحفظ", "error");
    } finally {
        saveBtn.innerText = oldText;
        saveBtn.disabled = false;
    }
}

async function startScanner(mode) {
    currentScannerMode = mode;
    isScannerPaused = false;
    document.getElementById('scannerModal').classList.remove('hidden');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        videoElement.srcObject = stream;
        const videoTrack = stream.getVideoTracks()[0];
        const settings = videoTrack.getSettings();
        if (settings.facingMode === 'user') videoElement.style.transform = "scaleX(-1)";
        else videoElement.style.transform = "";

        await videoElement.play();
        requestAnimationFrame(tickScanner);
    } catch (e) { alert("Camera Error"); stopScanner(); }
}

function stopScanner() {
    isScannerPaused = true;
    if (videoElement && videoElement.srcObject) videoElement.srcObject.getTracks().forEach(t => t.stop());
    document.getElementById('scannerModal').classList.add('hidden');
    if (videoElement) videoElement.style.transform = "";
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
}

function tickScanner() {
    if (isScannerPaused || document.getElementById('scannerModal').classList.contains('hidden')) return;
    if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
        const canvas = document.createElement('canvas');
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
        if (code) handleScan(code.data);
    }
    animationFrameId = requestAnimationFrame(tickScanner);
}

function handleScan(scannedText) {
    // 1. تنظيف النص المقروء
    const qrCode = scannedText.replace(/"/g, '').trim();

    // 2. البحث في طلاب المجموعة الحالية
    const matchedStudents = allStudents.filter(s =>
        (s.parentPhoneNumber && s.parentPhoneNumber.trim() === qrCode) ||
        s.id === qrCode
    );

    if (matchedStudents.length === 0) {
        return;
    }

    // 3. لقينا طالب! نشغل الصوت ونوقف الكاميرا لحظة
    playBeep();
    isScannerPaused = true;

    // حالة 1: طالب واحد فقط (ده الطبيعي)
    if (matchedStudents.length === 1) {
        const student = matchedStudents[0];
        showScanSuccessUI(student);

        if (currentScannerMode === 'daily') {
            // 👇👇 ضيف السطر ده هنا 👇👇
            checkGoldenTicket(student.name); // 🎰 تفعيل التذكرة الذهبية
            // 👆👆 ------------------ 👆👆
            processDailyScan(student);
        }
        else if (currentScannerMode === 'payments') processPaymentScan(student);

    }
    // حالة 2: أكتر من طالب بنفس الرقم (إخوات)
    else {
        const student = matchedStudents[0];

        showToast(`تم العثور على ${matchedStudents.length} طلاب (إخوة)، تم اختيار ${student.name}`);

        showScanSuccessUI(student);

        if (currentScannerMode === 'daily') {
            // 👇👇 وهنا كمان عشان لو إخوات 👇👇
            checkGoldenTicket(student.name); // 🎰 تفعيل التذكرة الذهبية
            // 👆👆 --------------------- 👆👆
            processDailyScan(student);
        }
        else if (currentScannerMode === 'payments') processPaymentScan(student);
    }
}

// --- دالة مساعدة للمؤثرات البصرية (عشان الكود يبقى نظيف) ---
function showScanSuccessUI(student) {
    const overlay = document.getElementById('scannerOverlay');
    const feedback = document.getElementById('scannedStudentName');

    // تحديث الاسم اللي بيظهر في نص الشاشة
    document.getElementById('feedbackNameText').innerText = student.name;

    // إظهار الرسالة الخضراء
    feedback.classList.remove('opacity-0', 'translate-y-10', 'scale-90');
    overlay.classList.add('success');

    // إخفائها بعد ثانية ونص
    setTimeout(() => {
        feedback.classList.add('opacity-0', 'translate-y-10', 'scale-90');
        overlay.classList.remove('success');
    }, 1500);
}

function processDailyScan(student) {
    const row = document.querySelector(`#dailyStudentsList > div[data-sid="${student.id}"]`);
    if (row) {
        const sel = row.querySelector('.att-select');
        sel.value = 'present';
        sel.dispatchEvent(new Event('change'));
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (hasHomeworkToday) {
        currentPendingStudentId = student.id;
        document.getElementById('hwStudentName').innerText = student.name;
        document.getElementById('hwConfirmModal').classList.remove('hidden');
    } else {
        setTimeout(() => { isScannerPaused = false; requestAnimationFrame(tickScanner); }, 1200);
    }
}

function resolveHomework(isSubmitted) {
    if (currentPendingStudentId) {
        const row = document.querySelector(`#dailyStudentsList > div[data-sid="${currentPendingStudentId}"]`);
        if (row) {
            const chk = row.querySelector('.hw-check');
            chk.checked = isSubmitted;
        }
    }
    document.getElementById('hwConfirmModal').classList.add('hidden');
    currentPendingStudentId = null;
    isScannerPaused = false;
    requestAnimationFrame(tickScanner);
}

function processPaymentScan(student) {
    const row = document.querySelector(`#paymentsList > div[data-sid="${student.id}"]`);
    const defaultAmountInput = document.getElementById('defaultAmountInput');

    if (row) {
        const checkbox = row.querySelector('.payment-check');
        const input = row.querySelector('.payment-input');

        if (!checkbox.checked) {
            checkbox.checked = true;
            input.value = defaultAmountInput.value || 0;
            checkbox.dispatchEvent(new Event('change'));
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.classList.add('ring-4', 'ring-green-300');
            setTimeout(() => row.classList.remove('ring-4', 'ring-green-300'), 1000);
        }
    }
}

// ==========================================
// 9. STUDENTS (With Link & Messages)
// ==========================================
function renderStudents(filter = "") {
    const container = document.getElementById('studentsListDisplay');
    container.innerHTML = '';
    const filtered = allStudents.filter(s => s.name.toLowerCase().includes(filter.toLowerCase()));

    if (filtered.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-500">${translations[currentLang].noStudentsInGroup}</p>`;
        return;
    }
    const DOMAIN_URL = "https://ahmadaboelghet.github.io/spot_dashboard/";
    filtered.forEach(s => {
        const pNum = s.parentPhoneNumber ? s.parentPhoneNumber.trim() : "";
        const fullDirectLink = `${DOMAIN_URL}/parent.html?t=${encodeURIComponent(TEACHER_ID)}&g=${encodeURIComponent(SELECTED_GROUP_ID)}&s=${encodeURIComponent(s.id)}&n=${encodeURIComponent(s.name)}&p=${encodeURIComponent(pNum)}`;

        const div = document.createElement('div');
        div.className = "record-item";
        div.innerHTML = `
            <div>
                <p class="font-bold text-gray-800 dark:text-white">${s.name}</p>
                <p class="text-xs text-gray-500">${s.parentPhoneNumber || ''}</p>
            </div>
            <div class="flex gap-2">
                <button class="btn-icon w-10 h-10 bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 invite-btn" title="إرسال رابط المتابعة واتساب">
                    <i class="ri-whatsapp-line"></i>
                </button>
                <button class="btn-icon w-10 h-10 bg-yellow-50 text-yellow-600 hover:bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-400 link-btn" title="نسخ رابط ولي الأمر">
                    <i class="ri-link-m"></i>
                </button>
                <button class="btn-icon w-10 h-10 bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 msg-btn" title="إرسال رسالة">
                    <i class="ri-chat-1-line"></i>
                </button>
                <button class="btn-icon w-10 h-10 bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300 qr-btn">
                    <i class="ri-qr-code-line"></i>
                </button>
                <button class="btn-icon w-10 h-10 bg-red-50 hover:bg-red-100 text-red-500 dark:bg-red-900/20 del-btn">
                    <i class="ri-delete-bin-line"></i>
                </button>
            </div>
        `;
        div.querySelector('.invite-btn').onclick = () => {
            if (!pNum) {
                showToast("لا يوجد رقم هاتف لولي الأمر", "error");
                return;
            }
            const msg = `مرحباً ولي أمر الطالب  *${s.name}*\n\nلمتابعة مستوى الطالب (الغياب، الدرجات، والمصاريف) لحظياً، يرجى الدخول على الرابط الخاص به:\n${fullDirectLink}\n\nدمتم بخير`;
            let waPhone = pNum.replace(/\s+/g, '');
            if (!waPhone.startsWith('+')) waPhone = '+2' + waPhone;

            window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`, '_blank');
        };

        div.querySelector('.link-btn').onclick = () => {
            navigator.clipboard.writeText(fullDirectLink)
                .then(() => showToast(translations[currentLang].linkCopied))
                .catch(() => showToast(translations[currentLang].copyFailed, "error"));
        };

        div.querySelector('.msg-btn').onclick = () => openMessageModal(s);
        div.querySelector('.qr-btn').onclick = () => showStudentQR(s);
        div.querySelector('.del-btn').onclick = () => deleteStudent(s.id);

        container.appendChild(div);
    });
}

function openMessageModal(student) {
    currentMessageStudentId = student.id;
    document.getElementById('msgStudentName').innerText = `${student.name}`;
    document.getElementById('customMessageInput').value = '';
    document.getElementById('messageModal').classList.remove('hidden');
}

async function sendCustomMessageAction() {
    const msg = document.getElementById('customMessageInput').value.trim();
    if (!msg) return showToast(translations[currentLang].writeMsgFirst, "error");

    const btn = document.getElementById('confirmSendMsgBtn');
    const originalContent = btn.innerHTML;
    btn.innerHTML = `<i class="ri-loader-4-line animate-spin"></i> ${translations[currentLang].sendingMsg}`;
    btn.disabled = true;

    try {
        const sendFunction = firebase.functions().httpsCallable('sendCustomMessage');
        await sendFunction({
            teacherId: TEACHER_ID,
            groupId: SELECTED_GROUP_ID,
            studentId: currentMessageStudentId,
            messageBody: msg
        });
        showToast(translations[currentLang].msgSentSuccess);
        document.getElementById('messageModal').classList.add('hidden');
    } catch (error) {
        console.error(error);
        showToast(translations[currentLang].msgSendFail, "error");
    } finally {
        btn.innerHTML = originalContent;
        btn.disabled = false;
    }
}

async function shareCardAction() {
    const card = document.getElementById('printableIdCard');
    const btn = document.getElementById('shareIdBtn');
    const originalText = btn.innerHTML;

    btn.innerHTML = `<i class="ri-loader-4-line animate-spin text-xl"></i> جاري التجهيز...`;
    btn.disabled = true;

    try {
        const canvas = await html2canvas(card, {
            scale: 3,
            backgroundColor: "#ffffff",
            useCORS: true
        });

        canvas.toBlob(async (blob) => {
            const file = new File([blob], "student_id_card.png", { type: "image/png" });

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        title: 'Spot Student ID',
                        text: 'بطاقة الطالب الرقمية - Spot System'
                    });
                } catch (err) {
                    if (err.name !== 'AbortError') console.error(err);
                }
            } else {
                const link = document.createElement('a');
                link.download = `Spot_ID_${Date.now()}.png`;
                link.href = canvas.toDataURL();
                link.click();
                showToast("تم تحميل الصورة بنجاح");
            }

            btn.innerHTML = originalText;
            btn.disabled = false;
        });

    } catch (error) {
        console.error("Share Error:", error);
        showToast("فشل إنشاء الصورة", "error");
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function showStudentQR(student) {
    // 1. عرض اسم الطالب
    document.getElementById('idStudentName').innerText = student.name;

    // 2. تجهيز البيانات (رقم التليفون)
    const qrContent = student.parentPhoneNumber ? student.parentPhoneNumber.trim() : student.id;

    // 3. عرض الرقم تحت الـ QR (عشان لو الكاميرا معلجة المدرس يكتبه)
    document.getElementById('idStudentPhone').innerText = qrContent;

    // 4. توليد الـ QR Code
    document.getElementById('idQrcode').innerHTML = '';
    new QRCode(document.getElementById('idQrcode'), {
        text: qrContent,
        width: 180, // صغرته سنة عشان يبان أشيك
        height: 180,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });

    // 5. فتح المودال
    document.getElementById('qrCodeModal').classList.remove('hidden');
}

async function addNewStudent() {
    // ✅ زيادة أمان: التأكد من وجود مجموعة
    if (!SELECTED_GROUP_ID) {
        showToast(translations[currentLang].selectGroupFirst || "الرجاء اختيار مجموعة أولاً", "error");
        return;
    }

    const nameInput = document.getElementById('newStudentName');
    const phoneInput = document.getElementById('newParentPhoneNumber');
    const name = nameInput.value;
    const phone = phoneInput.value;
    if (!name) return;
    const id = generateUniqueId();
    const data = { id, groupId: SELECTED_GROUP_ID, name, parentPhoneNumber: phone };
    await putToDB('students', data);
    await addToSyncQueue({ type: 'add', path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/students`, id, data });
    nameInput.value = ''; phoneInput.value = '';
    allStudents.push(data);
    renderStudents();
    showToast(translations[currentLang].studentAdded);
}

async function deleteStudent(id) {
    if (!confirm(translations[currentLang].confirmDelete)) return;
    await deleteFromDB('students', id);
    await addToSyncQueue({ type: 'delete', path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/students/${id}` });
    allStudents = allStudents.filter(s => s.id !== id);
    renderStudents();
}

// --- Payments ---
async function renderPaymentsList() {
    const month = document.getElementById('paymentMonthInput').value;
    const defaultAmountInput = document.getElementById('defaultAmountInput');
    const container = document.getElementById('paymentsList');
    container.innerHTML = '';

    if (!month || !allStudents.length) return;

    const payId = `${SELECTED_GROUP_ID}_PAY_${month}`;
    const doc = await getFromDB('payments', payId);
    const map = {};
    if (doc?.records) {
        doc.records.forEach(r => map[r.studentId] = r.amount);
    }

    allStudents.forEach(s => {
        let amount = map[s.id];
        const isPaid = amount && amount > 0;

        const div = document.createElement('div');
        div.className = `record-item flex justify-between items-center p-3 border rounded-xl transition-colors ${isPaid ? 'bg-green-50 border-green-500 dark:bg-green-900/20' : 'bg-white dark:bg-darkSurface border-gray-100 dark:border-gray-700'}`;
        div.dataset.sid = s.id;

        div.innerHTML = `
            <span class="font-bold text-gray-700 dark:text-gray-200 w-1/3 truncate">${s.name}</span>
            <div class="flex items-center gap-3 justify-end w-2/3">
                <input type="number"
                       class="payment-input input-field h-9 w-24 text-center text-sm ${isPaid ? 'text-green-600 font-bold' : 'text-gray-400'}"
                       placeholder="0" value="${amount || ''}" min="0">
                <input type="checkbox" class="payment-check w-6 h-6 accent-green-600 cursor-pointer" ${isPaid ? 'checked' : ''}>
            </div>
        `;

        const checkbox = div.querySelector('.payment-check');
        const input = div.querySelector('.payment-input');

        checkbox.addEventListener('change', (e) => {
            const defaultVal = defaultAmountInput.value || 0;
            if (e.target.checked) {
                if (!input.value || input.value == 0) input.value = defaultVal;
                div.classList.add('bg-green-50', 'border-green-500', 'dark:bg-green-900/20');
                input.classList.add('text-green-600', 'font-bold');
            } else {
                input.value = '';
                div.classList.remove('bg-green-50', 'border-green-500', 'dark:bg-green-900/20');
                input.classList.remove('text-green-600', 'font-bold');
            }
        });

        input.addEventListener('input', (e) => {
            if (e.target.value > 0) {
                checkbox.checked = true;
                div.classList.add('bg-green-50', 'border-green-500', 'dark:bg-green-900/20');
            } else {
                checkbox.checked = false;
                div.classList.remove('bg-green-50', 'border-green-500', 'dark:bg-green-900/20');
            }
        });
        container.appendChild(div);
    });
}

async function savePayments() {
    const month = document.getElementById('paymentMonthInput').value;
    if (!month) return showToast(translations[currentLang].paymentMonthMissing, 'error');
    const records = [];
    document.querySelectorAll('#paymentsList > div').forEach(div => {
        const val = div.querySelector('.payment-input').value;
        const amount = val ? parseFloat(val) : 0;
        records.push({ studentId: div.dataset.sid, amount: amount, paid: amount > 0 });
    });
    await putToDB('payments', { id: `${SELECTED_GROUP_ID}_PAY_${month}`, month, records });
    await addToSyncQueue({ type: 'set', path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/payments/${month}`, data: { month, records } });
    showToast(translations[currentLang].saved);
}

// --- Exams, Schedules & Settings ---
async function loadExams() {
    const exams = await getAllFromDB('assignments', 'groupId', SELECTED_GROUP_ID);
    const sel = document.getElementById('examSelect');
    sel.innerHTML = `<option value="">${translations[currentLang].selectExamPlaceholder}</option>`;
    exams.filter(e => e.type === 'exam').forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id; opt.innerText = e.name;
        sel.appendChild(opt);
    });
}
async function addNewExam() {
    const name = document.getElementById('newExamName').value;
    if (!name) return;

    // 1. إنشاء الـ ID وحفظه
    const id = generateUniqueId();

    const data = {
        id,
        groupId: SELECTED_GROUP_ID,
        name,
        type: 'exam',
        scores: {},
        date: new Date().toISOString().slice(0, 10)
    };

    await putToDB('assignments', data);
    await addToSyncQueue({ type: 'add', path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/assignments`, id, data });

    document.getElementById('newExamName').value = '';

    // 2. إعادة تحميل قائمة الامتحانات
    await loadExams();

    // 3. ✨ السحر هنا: تحديد الامتحان الجديد تلقائياً ✨
    const examSelect = document.getElementById('examSelect');
    examSelect.value = id; // اختيار الامتحان الجديد في القائمة

    // 4. عرض جدول الدرجات فوراً
    renderExamGrades();

    showToast(translations[currentLang].examCreatedSuccess);
}
async function renderExamGrades() {
    const examId = document.getElementById('examSelect').value;
    const container = document.getElementById('examGradesList');
    container.innerHTML = '';
    if (!examId) return;
    const exam = await getFromDB('assignments', examId);
    const scores = exam.scores || {};
    allStudents.forEach(s => {
        const val = scores[s.id]?.score || '';
        const div = document.createElement('div');
        div.className = "flex items-center gap-2 p-2 bg-white dark:bg-darkSurface border dark:border-gray-700 rounded-lg";
        div.innerHTML = `<label class="text-sm font-bold w-1/2 truncate dark:text-white">${s.name}</label><input type="number" class="exam-score-input input-field w-1/2 h-10" data-sid="${s.id}" value="${val}" placeholder="${translations[currentLang].gradePlaceholder}">`;
        container.appendChild(div);
    });
}
async function saveExamGrades() {
    const examId = document.getElementById('examSelect').value;
    if (!examId) return;
    const scores = {};
    document.querySelectorAll('.exam-score-input').forEach(inp => { if (inp.value !== '') scores[inp.dataset.sid] = { score: inp.value }; });
    const existing = await getFromDB('assignments', examId);
    existing.scores = scores;
    await putToDB('assignments', existing);
    await addToSyncQueue({ type: 'set', path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/assignments/${examId}`, data: { scores } });
    showToast(translations[currentLang].saved);
}

function saveProfile() {
    const name = document.getElementById('teacherNameInput').value;
    const subject = document.getElementById('teacherSubjectInput').value;
    const password = document.getElementById('profilePasswordInput').value.trim();
    if (!name) return;
    putToDB('teachers', { id: TEACHER_ID, name, subject, password });
    addToSyncQueue({ type: 'set', path: `teachers/${TEACHER_ID}`, data: { name, subject, password } });
    document.getElementById('dashboardTitle').innerText = `${translations[currentLang].pageTitle} - ${name}`;
    showToast(translations[currentLang].saved);
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('learnaria-dark', document.body.classList.contains('dark-mode'));
    updateThemeIcon();
}
function updateThemeIcon() {
    const isDark = document.body.classList.contains('dark-mode');
    document.getElementById('darkModeIcon').classList.toggle('hidden', isDark);
    document.getElementById('lightModeIcon').classList.toggle('hidden', !isDark);
}
// ✅ دالة استرجاع الإعدادات وتسجيل الدخول التلقائي
async function loadPreferences() {
    // 1. استرجاع الوضع الليلي
    if (localStorage.getItem('learnaria-dark') === 'true') {
        document.body.classList.add('dark-mode');
        updateThemeIcon();
    }

    // 2. استرجاع بيانات المعلم (تسجيل الدخول التلقائي)
    const storedID = localStorage.getItem('learnaria-tid');

    if (storedID) {
        // لو لقينا ID، نرجعه للمتغير ونخفي شاشة الدخول
        TEACHER_ID = storedID;

        // محاولة جلب بيانات المعلم من الداتابيز المحلية لتعبئة البروفايل
        try {
            const teacherData = await getFromDB('teachers', TEACHER_ID);
            if (teacherData) {
                document.getElementById('dashboardTitle').innerText = `${translations[currentLang].pageTitle} - ${teacherData.name || ''}`;
                document.getElementById('teacherNameInput').value = teacherData.name || '';
                document.getElementById('teacherSubjectInput').value = teacherData.subject || '';
                document.getElementById('profilePasswordInput').value = teacherData.password || '';
            }
        } catch (e) { console.log("Auto-login fetch error:", e); }

        // إخفاء شاشة تسجيل الدخول وإظهار المحتوى
        document.getElementById('landingSection').classList.add('hidden');
        document.getElementById('mainContent').classList.remove('hidden');
        document.getElementById('logoutButton').classList.remove('hidden');

        // تحميل المجموعات والذهاب للحصة اليومية
        await loadGroups();
        switchTab('daily');
    }
}
function toggleLang() {
    currentLang = currentLang === 'ar' ? 'en' : 'ar';
    document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
    document.getElementById('languageToggleButton').innerText = currentLang === 'ar' ? 'EN' : 'ع';

    document.querySelectorAll('[data-key]').forEach(el => {
        const key = el.dataset.key;
        if (translations[currentLang][key]) {
            // ✅ التعديل الضروري هنا: استخدمنا innerHTML بدل innerText
            el.innerHTML = translations[currentLang][key];
        }
    });

    document.querySelectorAll('[data-key-placeholder]').forEach(el => {
        const key = el.dataset.keyPlaceholder;
        if (translations[currentLang][key]) el.placeholder = translations[currentLang][key];
    });

    if (SELECTED_GROUP_ID && !document.getElementById('tab-daily').classList.contains('hidden')) renderDailyList();
    if (SELECTED_GROUP_ID && !document.getElementById('tab-students').classList.contains('hidden')) renderStudents();

    loadGroups();
    renderDayCheckboxes();
    updateOnlineStatus();
}

function setupPhoneInput(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    input.addEventListener('input', function (e) {
        let val = this.value;

        const arabicMap = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
        val = val.replace(/[٠-٩]/g, match => arabicMap[match]);

        val = val.replace(/\D/g, '');

        if (val.length >= 2) {
            if (!val.startsWith('01')) {

            }
        }

        if (val.length > 11) {
            val = val.slice(0, 11);
        }

        this.value = val;
    });

    input.setAttribute("maxLength", "11");
    input.setAttribute("inputmode", "numeric");
}

// ==========================================
// 🎰 نظام التذكرة الذهبية (الإصدار الكامل والآمن)
// ==========================================

// المتغير اللي شايل الإعدادات
let goldenConfig = {
    isEnabled: false,
    winRate: 5,
    prizes: ["قلم هدية 🖊️", "شوكولاتة 🍫"]
};

// 1. دالة تحميل الإعدادات عند فتح التطبيق
function loadGoldenSettings() {
    const saved = localStorage.getItem('spot_golden_config');
    if (saved) {
        try {
            goldenConfig = JSON.parse(saved);
        } catch (e) {
            console.error("Error parsing saved config", e);
        }
    }
    // تحديث شكل الشريط فوراً
    updateGoldenButtonUI();
}

// 2. دالة حفظ الإعدادات
function saveGoldenSettingsUI() {
    const isEnabled = document.getElementById('goldenToggle').checked;
    const winRateVal = document.getElementById('winRateInput').value;
    const winRate = winRateVal ? parseInt(winRateVal) : 0;

    // تحويل النص لمصفوفة وفلترة السطور الفارغة
    const prizesText = document.getElementById('prizesInput').value;
    const prizes = prizesText.split('\n').map(p => p.trim()).filter(p => p !== '');

    if (prizes.length === 0) {
        showToast("يجب إضافة جائزة واحدة على الأقل!", "error");
        return;
    }

    // تحديث المتغير العام
    goldenConfig = { isEnabled, winRate, prizes };

    // حفظ في الذاكرة
    localStorage.setItem('spot_golden_config', JSON.stringify(goldenConfig));

    // إخفاء المودال
    document.getElementById('goldenSettingsModal').classList.add('hidden');

    // تحديث شكل الشريط
    updateGoldenButtonUI();

    showToast("تم تحديث إعدادات التذكرة الذهبية! 🎰");
}

// 3. دالة تحديث شكل شريط التذكرة الذهبية (الإضاءة والنسبة)
function updateGoldenButtonUI() {
    const dot = document.getElementById('goldenActiveIndicator');
    const badge = document.getElementById('winRateBadge');
    const btnBar = document.getElementById('openGoldenSettingsBtn');

    // أمان: لو العناصر مش موجودة نخرج
    if (!dot || !badge || !btnBar) return;

    if (goldenConfig && goldenConfig.isEnabled) {
        // ✅ حالة التشغيل
        dot.classList.remove('hidden');
        badge.innerText = goldenConfig.winRate + '%';
        badge.classList.remove('hidden');

        // نور الشريط
        btnBar.classList.add('bg-yellow-50/80', 'dark:bg-yellow-900/30', '!border-yellow-500');
    } else {
        // ⛔ حالة الإيقاف
        dot.classList.add('hidden');
        badge.classList.add('hidden');

        // طفي الشريط
        btnBar.classList.remove('bg-yellow-50/80', 'dark:bg-yellow-900/30', '!border-yellow-500');
    }
}

// 4. دالة فتح لوحة التحكم
function openGoldenSettings() {
    document.getElementById('goldenToggle').checked = goldenConfig.isEnabled;
    document.getElementById('winRateInput').value = goldenConfig.winRate;
    document.getElementById('winRateDisplay').innerText = goldenConfig.winRate + '%';
    document.getElementById('prizesInput').value = goldenConfig.prizes.join('\n');

    document.getElementById('goldenSettingsModal').classList.remove('hidden');
}

// 5. دالة التحقق من الفوز (النسخة الآمنة - Safe Version)
function checkGoldenTicket(studentName) {
    // لو النظام مقفول أو مفيش جوائز، نخرج فوراً
    if (!goldenConfig || !goldenConfig.isEnabled || !goldenConfig.prizes || !goldenConfig.prizes.length) return;

    const luck = Math.floor(Math.random() * 100) + 1;

    if (luck <= goldenConfig.winRate) {
        const randomPrize = goldenConfig.prizes[Math.floor(Math.random() * goldenConfig.prizes.length)];

        // تشغيل الزينة (لو الدالة موجودة)
        if (typeof launchConfetti === 'function') {
            launchConfetti();
        }

        const prizeNameEl = document.getElementById('prizeName');
        const modalEl = document.getElementById('goldenTicketModal');

        // التأكد من وجود العناصر قبل الكتابة فيها
        if (prizeNameEl && modalEl) {
            prizeNameEl.innerText = randomPrize;
            modalEl.style.display = 'flex';
        }

        console.log(`🎰 Winner! Student: ${studentName}, Prize: ${randomPrize}`);
    }
}

// 6. دالة تشغيل الزينة (Confetti Safe Launcher)
function launchConfetti() {
    // حماية: لو المكتبة مش موجودة نخرج بهدوء بدل ما نضرب Error
    if (typeof confetti === 'undefined') return;

    var duration = 3 * 1000;
    var animationEnd = Date.now() + duration;
    var defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 10000 };

    function random(min, max) { return Math.random() * (max - min) + min; }

    var interval = setInterval(function () {
        var timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) return clearInterval(interval);
        var particleCount = 50 * (timeLeft / duration);
        confetti(Object.assign({}, defaults, { particleCount, origin: { x: random(0.1, 0.3), y: Math.random() - 0.2 } }));
        confetti(Object.assign({}, defaults, { particleCount, origin: { x: random(0.7, 0.9), y: Math.random() - 0.2 } }));
    }, 250);
}

// 7. دالة إغلاق النافذة
function closeGoldenTicket() {
    const modal = document.getElementById('goldenTicketModal');
    if (modal) modal.style.display = 'none';
}

// 8. تفعيل المستمعين (Listeners)
document.addEventListener('DOMContentLoaded', () => {
    loadGoldenSettings();

    // زرار الإعدادات
    const openBtn = document.getElementById('openGoldenSettingsBtn');
    if (openBtn) openBtn.addEventListener('click', openGoldenSettings);

    // زرار إغلاق الإعدادات
    const closeBtn = document.getElementById('closeGoldenSettings');
    if (closeBtn) closeBtn.addEventListener('click', () => {
        document.getElementById('goldenSettingsModal').classList.add('hidden');
    });

    // زرار الحفظ
    const saveBtn = document.getElementById('saveGoldenSettings');
    if (saveBtn) saveBtn.addEventListener('click', saveGoldenSettingsUI);

    // تحديث رقم النسبة
    const rateInput = document.getElementById('winRateInput');
    if (rateInput) {
        rateInput.addEventListener('input', (e) => {
            document.getElementById('winRateDisplay').innerText = e.target.value + '%';
        });
    }
});

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
    const storageRef = firebase.storage().ref().child(`teachers/${TEACHER_ID}/${file.name}`);
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
            div.className = 'flex items-center justify-between p-3 bg-white dark:bg-darkSurface border border-gray-100 dark:border-gray-700 rounded-xl transition-all hover:border-brand';

            div.innerHTML = `
                <div class="flex items-center gap-3 overflow-hidden">
                    <div class="w-10 h-10 rounded-lg bg-red-50 text-red-500 flex items-center justify-center flex-shrink-0">
                        <i class="ri-file-pdf-2-fill text-xl"></i>
                    </div>
                    <div class="truncate">
                        <p class="font-bold text-sm text-gray-800 dark:text-gray-200 truncate">${itemRef.name}</p>
                        <p class="text-[10px] text-green-600 font-bold flex items-center gap-1">
                            <i class="ri-check-double-line"></i> جاهز للاستخدام
                        </p>
                    </div>
                </div>
                <button class="btn-icon w-8 h-8 bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-500 dark:bg-white/5 dark:hover:bg-red-900/20 transition-colors" title="حذف">
                    <i class="ri-delete-bin-line"></i>
                </button>
            `;

            // زرار الحذف
            div.querySelector('button').onclick = async () => {
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

أنا فعلت ليكم "المساعد الذكي" (Spot AI) عشان يساعدكم في المذاكرة ويجاوب على أسئلتكم من الملازم بتاعتي طول الـ 24 ساعة! 🤖📚

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

// دالة فتح وقفل الشات (مربوطة بـ window عشان HTML يشوفها)
window.toggleSpotChat = function() {
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
window.sendSpotMessage = async function() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;

    // 1. التأكد من تسجيل الدخول
    const currentTeacherId = localStorage.getItem('learnaria-tid'); 

    if (!currentTeacherId) {
        addMessageToUI("⚠️ لازم تكون مسجل دخول عشان أقدر أساعدك!", 'bot');
        return;
    }

    // 2. عرض رسالة المستخدم
    addMessageToUI(msg, 'user');
    input.value = '';

    // 3. إظهار مؤشر الكتابة
    document.getElementById('typingIndicator').classList.remove('hidden');
    scrollToBottom();

    try {
        // 4. استدعاء الـ Function (بالطريقة القديمة المتوافقة مع كودك) 👇👇
        // بدل httpsCallable(functions, ...)
        const chatFn = firebase.functions().httpsCallable('chatWithSpot'); 
        
        const result = await chatFn({ 
            message: msg, 
            teacherId: currentTeacherId, 
            role: 'teacher' 
        });

        // 5. إخفاء المؤشر وعرض الرد
        document.getElementById('typingIndicator').classList.add('hidden');
        
        // تنسيق الرد
        const cleanResponse = result.data.response.replace(/\n/g, '<br>'); 
        addMessageToUI(cleanResponse, 'bot');

    } catch (error) {
        document.getElementById('typingIndicator').classList.add('hidden');
        addMessageToUI("❌ حصل خطأ في الاتصال، حاول تاني.", 'bot');
        console.error("Spot Chat Error:", error);
    }
};

// 🧹 دالة التنظيف (الإصدار "العبقري" لإصلاح كل أخطاء الباك سلاش)
function cleanJSON(text) {
    if (!text) return null;

    // 1. تنظيف الـ HTML والماركداون
    let clean = text.replace(/<br\s*\/?>/gi, ' ')
                    .replace(/```json/gi, '')
                    .replace(/```/g, '')
                    .trim();

    // 2. 🔥 الإصلاح الذكي (Smart Fix for Bad Escapes)
    // بيمشي على أي (\) ويشوف الحرف اللي وراها
    clean = clean.replace(/\\(.)/g, function(match, char) {
        // دي الحروف الوحيدة المسموح يجي قبلها شرطة في الـ JSON
        const validEscapes = ["\"", "\\", "/", "b", "f", "n", "r", "t", "u"];
        
        if (validEscapes.includes(char)) {
            return match; // لو الحرف مسموح (زي \n أو \\)، سيبه زي ما هو
        } else {
            return "\\\\" + char; // لو مش مسموح (زي \d أو \p)، زود شرطة كمان (\\d)
        }
    });

    // 3. استخراج الـ JSON
    const startIndex = clean.indexOf('{');
    const endIndex = clean.lastIndexOf('}');
    
    if (startIndex !== -1 && endIndex !== -1) {
        return clean.substring(startIndex, endIndex + 1);
    }
    
    return null;
}

// 🎨 دالة العرض (مع التقاط الأخطاء)
function addMessageToUI(text, sender) {
    const container = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = "mb-6 animate-fade-in-up w-full"; 

    let examData = null;

    if (sender === 'bot') {
        const jsonStr = cleanJSON(text);
        if (jsonStr) {
            try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.isExam) examData = parsed;
            } catch (e) {
                // ليس امتحان، تجاهل الخطأ
            }
        }
    }

    if (sender === 'user') {
        // رسالة المستخدم
        div.innerHTML = `
            <div class="flex justify-end items-end gap-2">
                <div class="bg-gradient-to-tr from-yellow-500 to-yellow-600 text-black px-5 py-3 rounded-2xl rounded-tr-none font-bold text-sm shadow-md max-w-[85%]">
                    ${text}
                </div>
            </div>`;
    } 
    else if (examData) {
        // 📝 كارت الامتحان (زرار طباعة الامتحان)
        div.innerHTML = `
            <div class="flex gap-3 justify-start items-start w-full">
                <div class="w-10 h-10 bg-white dark:bg-zinc-800 rounded-full flex items-center justify-center flex-shrink-0 text-yellow-600 border border-gray-100 shadow-sm">
                    <i class="ri-file-list-3-line text-xl"></i>
                </div>
                <div class="bg-white dark:bg-zinc-900 border border-yellow-400 rounded-2xl rounded-tl-none overflow-hidden w-full md:w-[85%] shadow-xl">
                    <div class="p-5">
                        <h3 class="font-black text-xl text-gray-800 dark:text-white mb-2">${examData.title}</h3>
                        <p class="text-xs text-gray-500 mb-6">عدد الأسئلة: ${examData.questions.length}</p>
                        <button onclick='printExam(${JSON.stringify(examData).replace(/'/g, "&apos;")})' 
                                class="w-full bg-gray-900 hover:bg-black text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md">
                            <i class="ri-printer-fill text-lg"></i>
                            <span>طباعة الامتحان (PDF)</span>
                        </button>
                    </div>
                </div>
            </div>`;
    } 
    else {
        // 🤖 رسالة الشرح العادية (زرار حفظ المذكرة PDF)
        
        // تشفير النص عشان نقدر نبعته للدالة من غير مشاكل
        const safeText = encodeURIComponent(text);

        div.innerHTML = `
            <div class="flex gap-3 justify-start items-start group">
                 <div class="w-8 h-8 bg-white dark:bg-zinc-800 rounded-full flex items-center justify-center flex-shrink-0 text-yellow-600 border border-gray-100 shadow-sm">
                    <i class="ri-robot-2-fill"></i>
                </div>
                <div class="flex flex-col gap-2 max-w-[90%]">
                    <div class="bg-white dark:bg-zinc-900 p-4 rounded-2xl rounded-tl-none shadow-sm border border-gray-100 dark:border-zinc-800 text-sm text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
                        ${text}
                    </div>
                    
                    <button onclick="printStudyNote(decodeURIComponent('${safeText}'))" 
                            class="self-start text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 border cursor-pointer
                                   bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100
                                   dark:bg-zinc-800 dark:text-gray-200 dark:border-zinc-700 dark:hover:bg-zinc-700">
                        <i class="ri-file-pdf-2-line text-red-500"></i>
                        <span>حفظ كـ مذكرة (PDF)</span>
                    </button>
                </div>
            </div>`;
    }
    
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}
// دالة تحويل الرسالة لـ PDF 🖨️
window.downloadMessageAsPDF = function(elementId) {
    const element = document.getElementById(elementId);
    
    // إعدادات الملف
    const opt = {
        margin:       [10, 10, 10, 10], // الهوامش
        filename:     `Spot_Exam_${new Date().toLocaleDateString()}.pdf`, // اسم الملف
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true }, // scale 2 عشان الجودة تبقي عالية
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // بدء التحويل (بيظهر لودينج صغير)
    showToast("جاري إنشاء ملف الـ PDF... 📄");
    
    html2pdf().set(opt).from(element).save().then(() => {
        showToast("تم تحميل الملف بنجاح! ✅");
    }).catch(err => {
        console.error(err);
        showToast("حدث خطأ أثناء التحميل", "error");
    });
};

function scrollToBottom() {
    const container = document.getElementById('chatMessages');
    container.scrollTop = container.scrollHeight;
}

window.printExam = function(examData) {
    const printWindow = window.open('', '_blank');
    
    const toArabicNum = (n) => n.toLocaleString('ar-EG');
    const getOptionLabel = (i) => ['(أ)', '(ب)', '(ج)', '(د)'][i] || `(${i+1})`;

    const htmlContent = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
        <title>${examData.title}</title>
        <meta charset="UTF-8">
        
        <script src="https://polyfill.io/v3/polyfill.min.js?features=es6"></script>
        <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
        
        <link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap" rel="stylesheet">
        
        <style>
            body { font-family: 'IBM Plex Sans Arabic', sans-serif; padding: 40px; max-width: 900px; margin: 0 auto; background: #fff; }
            mjx-container { font-size: 115% !important; direction: ltr; display: inline-block; }
            
            .exam-header { text-align: center; border-bottom: 3px double #000; padding-bottom: 20px; margin-bottom: 40px; }
            .exam-title { font-family: 'Amiri', serif; font-size: 28px; font-weight: 900; margin-bottom: 15px; }
            .student-info { display: flex; justify-content: space-between; font-size: 18px; font-weight: bold; font-family: 'Amiri', serif; }

            .question-container { display: flex; gap: 15px; margin-bottom: 30px; page-break-inside: avoid; align-items: flex-start; }
            .q-num-box { background-color: #0056b3; color: white; width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: bold; margin-top: 5px; flex-shrink: 0; }
            .q-body { width: 100%; }
            .q-text { font-size: 20px; font-weight: 700; margin-bottom: 10px; color: #222; }

            /* تنسيق الرسم الهندسي */
            .diagram-box {
                margin: 15px 0;
                display: flex;
                justify-content: center;
            }
            .diagram-box svg {
                max-width: 250px; /* حجم مناسب للرسمة */
                height: auto;
                border: 1px dashed #ccc; /* إطار خفيف عشان تبان */
                padding: 10px;
                border-radius: 8px;
            }
            /* تنسيق النصوص داخل الرسمة */
            .diagram-box text { font-family: sans-serif; font-weight: bold; }

            .mcq-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px 30px; }
            .option-row { display: flex; align-items: center; gap: 10px; font-size: 18px; }
            .opt-char { color: #0056b3; font-weight: 900; font-family: 'Amiri', serif; }

            .footer { position: fixed; bottom: 20px; left: 0; right: 0; text-align: center; font-size: 14px; color: #666; border-top: 1px solid #eee; padding-top: 10px; }
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
        <div class="exam-header">
            <div class="exam-title">${examData.title}</div>
            <div class="student-info">
                <span>اسم الطالب: ...........................................</span>
                <span>الدرجة: .......... / ${toArabicNum(examData.questions.length)}</span>
            </div>
        </div>

        ${examData.questions.map((q, i) => `
            <div class="question-container">
                <div class="q-num-box">${toArabicNum(i + 1)}</div>
                <div class="q-body">
                    <div class="q-text">${q.q}</div>
                    
                    ${q.diagram ? `<div class="diagram-box">${q.diagram}</div>` : ''}

                    ${q.type === 'mcq' ? `
                        <div class="mcq-grid">
                            ${q.options.map((opt, idx) => `
                                <div class="option-row">
                                    <span class="opt-char">${getOptionLabel(idx)}</span>
                                    <span>${opt}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <div style="border-bottom: 1px dashed #ccc; height: 40px; margin-top:10px;"></div>
                        <div style="border-bottom: 1px dashed #ccc; height: 40px;"></div>
                    `}
                </div>
            </div>
        `).join('')}

        <div class="footer">
            Generated by Spot AI ✨<br>Enjoy 🤓
        </div>
    </body>
    </html>`;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
};

// 🖨️ دالة طباعة المذكرات (نسخة الرياضيات الاحترافية)
window.printStudyNote = function(content) {
    const printWindow = window.open('', '_blank');
    
    // معالجة النص لتحويله لـ HTML منسق
    const formattedContent = content
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
        <title>ملخص درس - Spot AI</title>
        <meta charset="UTF-8">
        
        <script src="https://polyfill.io/v3/polyfill.min.js?features=es6"></script>
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
            <div class="sub-header">ملخص الدرس بواسطة المساعد الذكي Spot AI</div>
        </div>

        <div class="content">
            ${formattedContent}
        </div>

        <div style="height: 100px;"></div>

        <div class="footer">
            Generated by Spot AI ✨<br>
            Enjoy 🤓
        </div>
    </body>
    </html>`;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
};