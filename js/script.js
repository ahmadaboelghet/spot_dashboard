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
const motivationQuotes = [
    "بطل اليوم.. عالم الغد! 🚀",
    "كل خطوة صغيرة بتقربك من حلمك الكبير. ✨",
    "عافر.. النجاح طعمه يستاهل. 💪",
    "مكانك في القمة محجوز، مستنيك توصله! 🏔️",
    "الذكاء مش بس وراثة، الذكاء اجتهاد وتدريب. 🧠",
    "أنت أقوى مما تخيل.. كمل طريقك.🌟"
];

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
let hasHomeworkToday = false, currentPendingStudentId = null, currentCrossGroupStudent = null, currentMessageStudentId = null, saveTimeout = null, groupAnalyticsChartInstance = null, groupHomeworkChartInstance = null;

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
        inviteCopyFail: "فشل النسخ",
        addNewStudentSectionTitle: "إضافة طالب جديد",
        studentFollowUp: "متابعة الطالب {name}",
        deleteGroupConfirm: "هل أنت متأكد من حذف هذه المجموعة نهائياً؟ سيتم حذف جميع الطلاب والبيانات المرتبطة بها!",
        deleteGroupSuccess: "تم حذف المجموعة بنجاح"
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
        inviteCopyFail: "Copy failed",
        addNewStudentSectionTitle: "Add New Student",
        studentFollowUp: "Student Dashboard: {name}"
    }
};

// ==========================================
// 4. UTILS
// ==========================================
function generateUniqueId() { return `off_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`; }
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

// ✅ دالة لإصلاح المعرف المخزن لو كان بالصيغة القديمة (بدون +20)
function migrateTeacherID() {
    let tid = localStorage.getItem('learnaria-tid');
    if (tid && tid.startsWith('01')) {
        const migrated = `+20${tid.substring(1)}`;
        console.log(`🔄 Migrating Teacher ID in localStorage: ${tid} -> ${migrated}`);
        localStorage.setItem('learnaria-tid', migrated);
        TEACHER_ID = migrated;
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

// --- SYNC (Robust Queue with Retry Metadata) ---
const MAX_SYNC_RETRIES = 5;

async function addToSyncQueue(action) {
    const enriched = {
        ...action,
        createdAt: action.createdAt || Date.now(),
        attempts: action.attempts || 0,
        lastError: action.lastError || null,
        failed: action.failed || false,
    };

    try {
        await putToDB('syncQueue', enriched);
        updateOnlineStatus();
    } catch (e) {
        console.error("❌ Failed to enqueue sync action:", {
            action,
            error: e && e.message ? e.message : e
        });
        // ملاحظة مهمة: حتى لو فشل الحفظ في syncQueue، بيانات IndexedDB الأصلية (attendance, assignments, ...etc)
        // تظل كما هي ولم يتم حذفها في أي مكان.
    }
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

// دالة الحفظ الصامت (بدون Loading Screen يوقف الشغل)
async function silentSave() {
    console.log("🔄 جاري الحفظ التلقائي في الخلفية...");
    await saveDailyData(true); // true دي عشان نعرف الدالة إن ده حفظ صامت
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

async function getAllSyncQueueItemsWithKeys() {
    await openDB();
    return new Promise((resolve, reject) => {
        try {
            const tx = localDB.transaction('syncQueue', 'readonly');
            const store = tx.objectStore('syncQueue');

            const reqItems = store.getAll();
            const reqKeys = store.getAllKeys();

            const result = { items: null, keys: null };

            reqItems.onsuccess = () => {
                result.items = reqItems.result || [];
                if (result.keys !== null) resolve(result);
            };
            reqItems.onerror = (e) => {
                reject(e.target.error || new Error("Failed to read syncQueue items"));
            };

            reqKeys.onsuccess = () => {
                result.keys = reqKeys.result || [];
                if (result.items !== null) resolve(result);
            };
            reqKeys.onerror = (e) => {
                reject(e.target.error || new Error("Failed to read syncQueue keys"));
            };

            tx.onerror = (e) => {
                reject(tx.error || e.target.error || new Error("Transaction error reading syncQueue"));
            };
        } catch (e) {
            reject(e);
        }
    });
}

async function processSyncQueue() {
    if (isSyncing) return;

    if (!navigator.onLine) {
        console.warn("🌐 processSyncQueue aborted: navigator reports offline.");
        return;
    }

    isSyncing = true;
    try {
        const { items, keys } = await getAllSyncQueueItemsWithKeys();

        if (!items || items.length === 0) {
            isSyncing = false;
            await updateSyncUI();
            return;
        }

        console.log(`🚀 Starting sync of ${items.length} queued actions (raw)...`);

        // نبني قائمة entries فيها action + key + index عشان نقدر نحل التعارضات
        const entries = items.map((action, idx) => ({
            action,
            key: keys[idx],
            index: idx
        }));

        // 1️⃣ تجميع حسب الـ path
        const groupedByPath = new Map();
        for (const entry of entries) {
            const { action } = entry;
            const pathKey = action.path || action.collectionPath || '';
            if (!pathKey) continue;
            if (!groupedByPath.has(pathKey)) groupedByPath.set(pathKey, []);
            groupedByPath.get(pathKey).push(entry);
        }

        const supersededKeys = new Set();
        const filteredEntries = [];

        // 2️⃣ حل التعارضات (مثلاً set + delete لنفس dailyAttendance)
        groupedByPath.forEach((list, pathKey) => {
            const hasSetOrUpdate = list.some(e => e.action.type === 'set' || e.action.type === 'update');
            const isDailyAttendanceDoc = pathKey.includes('/dailyAttendance/');

            if (hasSetOrUpdate) {
                // احتفظ بآخر set/update فقط
                let lastSetEntry = null;
                for (const e of list) {
                    if (e.action.type === 'set' || e.action.type === 'update') {
                        if (!lastSetEntry || e.index > lastSetEntry.index) {
                            lastSetEntry = e;
                        }
                    }
                }

                if (lastSetEntry) {
                    filteredEntries.push(lastSetEntry);
                }

                for (const e of list) {
                    if (lastSetEntry && e.key === lastSetEntry.key) continue;

                    // لو فيه delete لنفس dailyAttendance مع وجود set -> نرميه من الـ Queue من غير ما ننفذه
                    if (e.action.type === 'delete' && isDailyAttendanceDoc) {
                        console.warn("🚫 Dropping conflicting DELETE for dailyAttendance (SET exists):", {
                            path: pathKey,
                            queueKey: e.key
                        });
                    }

                    supersededKeys.add(e.key);
                }
            } else {
                // مفيش set/update لنفس الـ path
                // لو كله Deletes لنفس الـ doc، نخلي آخر واحدة بس
                const deletes = list.filter(e => e.action.type === 'delete');
                const others = list.filter(e => e.action.type !== 'delete');

                if (deletes.length > 1) {
                    let lastDelete = deletes[0];
                    for (const d of deletes) {
                        if (d.index > lastDelete.index) lastDelete = d;
                    }
                    filteredEntries.push(lastDelete);
                    for (const d of deletes) {
                        if (d.key !== lastDelete.key) supersededKeys.add(d.key);
                    }
                } else if (deletes.length === 1) {
                    filteredEntries.push(deletes[0]);
                }

                // أي Actions تانية (add مثلا) نضيفها زي ما هي
                for (const e of others) {
                    filteredEntries.push(e);
                }
            }
        });

        // مسح العناصر المتجاوزة من الـ Queue (اللي اتستبدلت بإصدارات أحدث لنفس الـ path)
        for (const key of supersededKeys) {
            try {
                await deleteFromDB('syncQueue', key);
                console.log("🧹 Removed superseded queue item:", { key });
            } catch (cleanupErr) {
                console.error("⚠️ Failed to remove superseded queue item:", { key, error: cleanupErr });
            }
        }

        console.log(`✅ After conflict resolution: ${filteredEntries.length} actions will be sent to Firestore.`);

        // 3️⃣ تنفيذ الـ Actions بعد حل التعارضات
        for (const entry of filteredEntries) {
            const action = entry.action;
            const key = entry.key;

            const attempts = action.attempts || 0;
            if (action.failed || attempts >= MAX_SYNC_RETRIES) {
                console.warn("⏭️ Skipping permanently failed sync item:", {
                    type: action.type,
                    path: action.path,
                    attempts,
                    lastError: action.lastError
                });
                continue;
            }

            if (!navigator.onLine) {
                console.warn("🌐 Went offline mid-sync. Stopping further processing.");
                break;
            }

            const { type, path, data, id, options } = action;

            try {
                console.log("📡 Syncing action:", { type, path, attempts });

                if (type === 'set' || type === 'update') {
                    console.log("➡️ FIRESTORE SET (doc):", {
                        path,
                        options: options || { merge: true },
                        payloadPreview: data && typeof data === 'object'
                            ? { keys: Object.keys(data), date: data.date }
                            : data
                    });
                    await firestoreDB.doc(path).set(data, options || { merge: true });
                } else if (type === 'add') {
                    console.log("➡️ FIRESTORE SET (add to collection):", {
                        collectionPath: path,
                        docId: id,
                        payloadPreview: data && typeof data === 'object'
                            ? { keys: Object.keys(data), date: data.date }
                            : data
                    });
                    await firestoreDB.collection(path).doc(id).set(data, { merge: true });
                } else if (type === 'delete') {
                    console.log("🗑️ FIRESTORE DELETE:", { path });
                    await firestoreDB.doc(path).delete();
                } else {
                    console.warn("⚠️ Unknown syncQueue action type. Skipping:", action);
                    continue;
                }

                await deleteFromDB('syncQueue', key);
                console.log("✅ Sync success, removed from queue:", { type, path });
            } catch (err) {
                const message = err && err.message ? err.message : String(err);
                console.error("❌ Sync error for item:", {
                    type,
                    path,
                    attempts,
                    error: message
                });

                const updated = {
                    ...action,
                    attempts: attempts + 1,
                    lastError: message,
                    failed: attempts + 1 >= MAX_SYNC_RETRIES
                };

                try {
                    await putToDB('syncQueue', updated);
                } catch (metaErr) {
                    console.error("⚠️ Failed to update retry metadata for sync item:", metaErr);
                }
            }
        }
    } catch (e) {
        console.error("🔥 Fatal error in processSyncQueue:", e);
    } finally {
        isSyncing = false;
        await updateSyncUI();
    }
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

        // محاولة استرجاع المبلغ المحفوظ لهذه المجموعة
        const savedAmount = localStorage.getItem(`SPOT_PAY_AMT_${SELECTED_GROUP_ID}`);
        const amountInput = document.getElementById('defaultAmountInput');

        if (amountInput) {
            // لو لقينا مبلغ محفوظ نكتبه، لو ملقيناش نسيبها فاضية
            amountInput.value = savedAmount || '';
        }

        switchTab('daily');
        await loadGroupData();
    });

    const amountInput = document.getElementById('defaultAmountInput');
    if (amountInput) {
        amountInput.addEventListener('input', (e) => {
            if (SELECTED_GROUP_ID) {
                localStorage.setItem(`SPOT_PAY_AMT_${SELECTED_GROUP_ID}`, e.target.value);
            }
        });
    }

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
    document.getElementById('deleteGroupButton').addEventListener('click', deleteCurrentGroup);

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

    document.getElementById('addNewExamBtn').addEventListener('click', addNewExam);
    document.getElementById('examSelect').addEventListener('change', renderExamGrades);


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
    document.getElementById('defaultAmountInput').value = '';
    showToast(translations[currentLang].groupCreatedSuccess);
}

async function deleteCurrentGroup() {
    if (!SELECTED_GROUP_ID) {
        showToast(translations[currentLang].selectGroupFirst, 'error');
        return;
    }

    if (!confirm(translations[currentLang].deleteGroupConfirm)) return;

    try {
        const idToDelete = SELECTED_GROUP_ID;

        // 1. حذف من الداتابيز المحلية
        await deleteFromDB('groups', idToDelete);

        // 2. إرسال أمر الحذف للسيرفر
        await addToSyncQueue({
            type: 'delete',
            path: `teachers/${TEACHER_ID}/groups/${idToDelete}`
        });

        showToast(translations[currentLang].deleteGroupSuccess);

        // 3. تصفير الحالة والعودة للبداية
        SELECTED_GROUP_ID = null;
        document.getElementById('groupSelect').value = "";

        // إعادة تحميل المجموعات
        await loadGroups();

        // إخفاء الأيقونات والتابات المفتوحة (لأن مفيش مجموعة مختارة)
        switchTab('profile');

    } catch (e) {
        console.error("Error deleting group:", e);
        showToast("Error during delete", 'error');
    }
}

// ------------------------------------------------------------------
// ✅✅ NEW LOAD GROUP DATA WITH SAFE SYNC & FAIL-SAFE LOGIC ✅✅
// ------------------------------------------------------------------
async function loadGroupData() {
    allStudents = []; // 🔄 إعادة تعيين القائمة فوراً لمنع التداخل
    if (window.groupAnalyticsChartInstance) { window.groupAnalyticsChartInstance.destroy(); window.groupAnalyticsChartInstance = null; }
    if (window.groupHomeworkChartInstance) { window.groupHomeworkChartInstance.destroy(); window.groupHomeworkChartInstance = null; }

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
            // أ. الطلاب
            const sSnap = await firestoreDB.collection(`teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/students`).get();
            const remoteStudents = sSnap.docs.map(d => ({ id: d.id, groupId: SELECTED_GROUP_ID, ...d.data() }));
            allStudents = remoteStudents;
            saveStudentsToLocalDB(remoteStudents);

            // ب. الحضور الأخير (للتخزين المحلي) - زيادة الليمت لضمان مزامنة التاريخ بالكامل
            const aSnap = await firestoreDB.collection(`teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/dailyAttendance`).limit(60).get();
            for (const d of aSnap.docs) {
                await putToDB('attendance', { id: `${SELECTED_GROUP_ID}_${d.id}`, groupId: SELECTED_GROUP_ID, ...d.data() });
            }

            // ج. التكاليف/الواجبات (للتخزين المحلي)
            const asSnap = await firestoreDB.collection(`teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/assignments`).limit(60).get();
            for (const d of asSnap.docs) {
                await putToDB('assignments', { id: d.id, groupId: SELECTED_GROUP_ID, ...d.data() });
            }

            // د. المدفوعات (للتخزين المحلي)
            const pSnap = await firestoreDB.collection(`teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/payments`).limit(24).get();
            for (const d of pSnap.docs) {
                await putToDB('payments', { id: `${SELECTED_GROUP_ID}_PAY_${d.id}`, month: d.id, ...d.data() });
            }

            refreshCurrentTab();
        } catch (e) {
            console.error("Sync error:", e);
        }
    }

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
            updateGroupAnalyticsChart();
        }
    } catch (e) { console.error("Render error:", e); }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-button').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.remove('hidden');
    document.querySelector(`.tab-button[data-tab="${tabId}"]`).classList.add('active');

    if (tabId === 'daily') {
        renderDailyList();
        updateGroupAnalyticsChart();
    }
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
        row.className = `grid grid-cols-12 items-center p-3 rounded-lg border transition-colors mb-1 cursor-pointer ${status === 'present'
            ? 'bg-green-50 border-green-500 dark:bg-green-900/20'
            : 'bg-white dark:bg-darkSurface border-transparent hover:bg-gray-50 dark:hover:bg-white/5'
            }`;

        row.onclick = (e) => {
            if (!e.target.closest('select') && !e.target.closest('input')) {
                openStudentProfile(s.id);
            }
        };

        let html = `
            <div class="${studentColSpan} font-bold text-sm truncate px-2 text-gray-800 dark:text-gray-200 transition-all duration-300"> ${s.name}</div>
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
            saveTimeout = setTimeout(() => {
                silentSave(); // هيحفظ التغيير ده لوحده بعد 3 ثواني
            }, 3000);
        });
        if (hwCheck) {
            hwCheck.addEventListener('change', () => {
                // ✅✅ الإضافة السحرية: حفظ تلقائي للواجب اليدوي ✅✅
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(() => {
                    silentSave();
                }, 3000);
            });
        }
        list.appendChild(row);
    });

    // دالة صغيرة لتحديث العداد
    function updateAttendanceCount() {
        const count = document.querySelectorAll('.att-select option[value="present"]:checked').length;
        document.getElementById('attendanceCountBadge').innerText = `${count}/${allStudents.length}`;
    }

    updateAttendanceCount(); // تشغيل العداد أول مرة
}

// 📈 دالة الرسوم البيانية للمجموعة (جديد)
async function updateGroupAnalyticsChart() {
    const attCtx = document.getElementById('groupAttendanceChart');
    const hwCtx = document.getElementById('groupHomeworkChart');

    if (!attCtx || !hwCtx || !SELECTED_GROUP_ID || !TEACHER_ID) return;

    try {
        console.log("📊 Fetching analytics for Group:", SELECTED_GROUP_ID);

        // 1. جلب البيانات (تجنب الـ Index عن طريق الجلب بدون ترتيب والترتيب يدوياً)
        const [attSnap, hwSnap] = await Promise.all([
            firestoreDB.collection(`teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/dailyAttendance`)
                .limit(100).get().catch(e => { console.error("Att Query Fail:", e); return { empty: true }; }),
            firestoreDB.collection(`teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/assignments`)
                .limit(100).get().catch(e => { console.error("HW Query Fail:", e); return { empty: true }; })
        ]);

        // --- أ. معالجة الحضور ---
        let attLabels = ["-", "-", "-", "-", "-", "-", "-"];
        let attData = [0, 0, 0, 0, 0, 0, 0];

        if (!attSnap.empty) {
            const filteredAtt = attSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(d => d.date)
                .sort((a, b) => new Date(b.date) - new Date(a.date)) // descending
                .slice(0, 7) // newest 7
                .reverse(); // reverse for chart

            if (filteredAtt.length > 0) {
                attLabels = [];
                attData = [];
                filteredAtt.forEach(d => {
                    const parts = (d.date || "").split('-');
                    const label = parts.length === 3 ? `${parts[2]}/${parts[1]}` : (d.date || "??");
                    attLabels.push(label);
                    const records = d.records || [];
                    const percent = records.length > 0 ? Math.round((records.filter(r => r.status === 'present').length / records.length) * 100) : 0;
                    attData.push(percent);
                });
            }
        }

        if (window.groupAnalyticsChartInstance) window.groupAnalyticsChartInstance.destroy();
        window.groupAnalyticsChartInstance = renderBarChart(attCtx, attLabels, attData, 'الحضور %', 'rgba(242, 206, 90, 0.7)', '#F2CE5A');

        // --- ب. معالجة الواجبات (فلترة يدوية لتجنب الـ Index) ---
        let hwLabels = ["-", "-", "-", "-", "-", "-", "-"];
        let hwData = [0, 0, 0, 0, 0, 0, 0];

        if (!hwSnap.empty) {
            const filteredHw = hwSnap.docs
                .map(d => d.data())
                .filter(d => d.type === 'daily')
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, 7)
                .reverse();

            if (filteredHw.length > 0) {
                hwLabels = [];
                hwData = [];
                filteredHw.forEach(d => {
                    const parts = (d.date || "").split('-');
                    const label = parts.length === 3 ? `${parts[2]}/${parts[1]}` : (d.date || "??");
                    hwLabels.push(label);
                    const scores = d.scores || {};
                    const sids = Object.keys(scores);
                    const percent = sids.length > 0 ? Math.round((sids.filter(sid => scores[sid].submitted).length / sids.length) * 100) : 0;
                    hwData.push(percent);
                });
            }
        }

        if (window.groupHomeworkChartInstance) window.groupHomeworkChartInstance.destroy();
        window.groupHomeworkChartInstance = renderBarChart(hwCtx, hwLabels, hwData, 'الواجب %', 'rgba(59, 130, 246, 0.7)', '#3B82F6');

    } catch (e) { console.error("Analytics Critical Error:", e); }
}

// دالة مساعدة لرسم التشارت الموحد
function renderBarChart(ctx, labels, data, label, bgColor, borderColor) {
    return new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                backgroundColor: bgColor,
                borderColor: borderColor,
                borderWidth: 1,
                borderRadius: 6,
                barThickness: context => {
                    const width = context.chart.width;
                    return width < 400 ? 15 : 25;
                }
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1E1E1E',
                    titleFont: { family: 'Cairo', size: 11 },
                    bodyFont: { family: 'Cairo', size: 13, weight: 'bold' },
                    callbacks: { label: (c) => `${c.label}: ${c.raw}%` }
                }
            },
            scales: {
                y: {
                    beginAtZero: true, max: 100,
                    grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false },
                    ticks: { font: { family: 'Cairo', size: 10 }, callback: v => v + '%' }
                },
                x: { grid: { display: false }, ticks: { font: { family: 'Cairo', size: 10 } } }
            }
        }
    });
}

async function saveDailyData(isSilent = false) {
    const saveBtn = document.getElementById('saveDailyBtn');
    let oldText = "";

    try {
        if (!TEACHER_ID || !SELECTED_GROUP_ID) {
            if (!isSilent) console.warn("⚠️ لا يوجد معرف مدرس أو مجموعة. تم إلغاء الحفظ.");
            return;
        }

        const dateInput = document.getElementById('dailyDateInput');
        if (!dateInput) {
            console.warn("⚠️ Save aborted: Date input not found in DOM.");
            return;
        }
        const date = dateInput.value;
        if (!date) {
            if (!isSilent) showToast("يرجى اختيار التاريخ", "error");
            return;
        }

        if (!isSilent && saveBtn) {
            oldText = saveBtn.innerText;
            saveBtn.innerHTML = '<i class="ri-loader-4-line animate-spin"></i>';
            saveBtn.disabled = true;
        }

        const promises = [];
        const studentRows = document.querySelectorAll('#dailyStudentsList > div');

        if (studentRows.length === 0) {
            if (!isSilent) {
                console.warn("ℹ️ No student rows found for daily save; skipping.");
            }
        } else {
            // --- Attendance ---
            const attendanceRecords = [];
            studentRows.forEach(div => {
                const attSelect = div.querySelector('.att-select');
                if (attSelect) {
                    attendanceRecords.push({
                        studentId: div.dataset.sid,
                        status: attSelect.value
                    });
                }
            });

            if (attendanceRecords.length > 0) {
                const attendanceId = `${SELECTED_GROUP_ID}_${date}`;
                const attendanceData = {
                    id: attendanceId,
                    teacherId: TEACHER_ID,
                    groupId: SELECTED_GROUP_ID,
                    date,
                    records: attendanceRecords
                };

                console.log("📝 Queuing attendance save:", {
                    path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/dailyAttendance/${date}`,
                    localId: attendanceId,
                    recordsCount: attendanceRecords.length
                });

                promises.push(putToDB('attendance', attendanceData));
                promises.push(
                    addToSyncQueue({
                        type: 'set',
                        path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/dailyAttendance/${date}`,
                        data: {
                            date,
                            records: attendanceRecords
                        }
                    })
                );
            }

            // --- Homework (daily) ---
            if (typeof hasHomeworkToday !== 'undefined' && hasHomeworkToday) {
                const hwId = `${SELECTED_GROUP_ID}_HW_${date}`;
                const scores = {};

                studentRows.forEach(div => {
                    const chk = div.querySelector('.hw-check');
                    if (chk) {
                        scores[div.dataset.sid] = {
                            submitted: chk.checked,
                            score: null
                        };
                    }
                });

                const hwData = {
                    id: hwId,
                    teacherId: TEACHER_ID,
                    groupId: SELECTED_GROUP_ID,
                    name: `واجب ${date}`,
                    date,
                    scores,
                    type: 'daily'
                };

                console.log("📝 Queuing homework save:", {
                    path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/assignments/${hwId}`,
                    localId: hwId,
                    studentsCount: Object.keys(scores).length
                });

                promises.push(putToDB('assignments', hwData));
                promises.push(
                    addToSyncQueue({
                        type: 'set',
                        path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/assignments/${hwId}`,
                        data: hwData
                    })
                );
            }
        }

        if (promises.length > 0) {
            await Promise.all(promises);

            if (!isSilent) {
                showToast(translations[currentLang]?.saved || "تم الحفظ");
            } else {
                console.log("✅ Auto-saved successfully (Background)");
            }
        } else if (!isSilent) {
            showToast("لا يوجد بيانات للحفظ حالياً", "info");
        }

    } catch (error) {
        console.error("❌ Save Error (saveDailyData):", error);
        if (!isSilent) showToast("حدث خطأ أثناء الحفظ", "error");
    } finally {
        if (!isSilent && saveBtn) {
            saveBtn.innerText = oldText || "حفظ الكل";
            saveBtn.disabled = false;
        }
    }
}

// ==========================================
// 🔦 منطق الفلاش والماسح الضوئي المحدث 📸
// ==========================================

let isTorchOn = false; // متغير لحالة الفلاش

async function startScanner(mode) {
    currentScannerMode = mode;
    isScannerPaused = false;
    document.getElementById('scannerModal').classList.remove('hidden');

    // زر الفلاش
    const flashBtn = document.getElementById('toggleFlashBtn');
    if (flashBtn) flashBtn.classList.add('hidden'); // إخفاء مبدئي

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" }
        });

        videoElement.srcObject = stream;

        // إعدادات الفيديو
        const videoTrack = stream.getVideoTracks()[0];
        const settings = videoTrack.getSettings();

        // ضبط المراية (Mirroring)
        if (settings.facingMode === 'user') videoElement.style.transform = "scaleX(-1)";
        else videoElement.style.transform = "";

        // ✅ تشغيل زر الفلاش لو الموبايل بيدعمه
        const capabilities = videoTrack.getCapabilities();
        if (capabilities.torch) {
            if (flashBtn) {
                flashBtn.classList.remove('hidden');

                // إعادة تعيين الأيقونة واللون
                isTorchOn = false;
                updateFlashBtnUI(flashBtn);

                flashBtn.onclick = async () => {
                    isTorchOn = !isTorchOn;
                    await videoTrack.applyConstraints({
                        advanced: [{ torch: isTorchOn }]
                    });
                    updateFlashBtnUI(flashBtn);
                };
            }
        }

        await videoElement.play();
        requestAnimationFrame(tickScanner);
    } catch (e) {
        console.error(e);
        alert("لا يمكن الوصول للكاميرا");
        stopScanner();
    }
}

function updateFlashBtnUI(btn) {
    if (isTorchOn) {
        btn.classList.add('bg-yellow-400', 'text-black', 'border-yellow-500');
        btn.classList.remove('bg-white/20', 'text-white', 'border-white/30');
    } else {
        btn.classList.remove('bg-yellow-400', 'text-black', 'border-yellow-500');
        btn.classList.add('bg-white/20', 'text-white', 'border-white/30');
    }
}

function stopScanner() {
    isScannerPaused = true;
    isTorchOn = false; // إطفاء الفلاش منطقياً

    if (videoElement && videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(t => {
            t.stop(); // هذا يغلق الكاميرا والفلاش تلقائياً
        });
    }
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

// ==========================================
// 🚀 التعديل الجوهري: هندلة الطالب الغريب وتسجيله فوراً
// ==========================================

async function handleScan(scannedText) {
    const qrCode = scannedText.replace(/"/g, '').trim();

    // 1. البحث في المجموعة الحالية (الأولوية)
    const matchedStudents = allStudents.filter(s =>
        (s.parentPhoneNumber && s.parentPhoneNumber.trim() === qrCode) ||
        s.id === qrCode
    );

    // 🛑 الحالة: الطالب مش في المجموعة دي (Cross-Group Logic)
    if (matchedStudents.length === 0) {

        isScannerPaused = true; // إيقاف الكاميرا مؤقتاً

        try {
            // بحث شامل في كل الطلاب (Global Search)
            const allLocalStudents = await getAllFromDB('students');
            const globalMatch = allLocalStudents.find(s =>
                (s.parentPhoneNumber && s.parentPhoneNumber.trim() === qrCode) ||
                s.id === qrCode
            );

            if (globalMatch) {
                playBeep();

                // ✅ التحقق: هل المدرس مفعل خيار الواجب؟
                if (hasHomeworkToday) {
                    currentCrossGroupStudent = globalMatch; // حفظ الطالب مؤقتاً

                    // تجهيز وعرض المودال
                    document.getElementById('hwStudentName').innerText = globalMatch.name;
                    document.getElementById('hwConfirmModal').classList.remove('hidden');
                    return; // نخرج من الدالة وننتظر قرار المدرس (نعم/لا)
                }

                // لو مفيش واجب، نسجل حضور فوراً
                await saveCrossGroupAttendance(globalMatch, false);

                // إشعار للمدرس
                let groupName = "مجموعة أخرى";
                const groupDoc = await getFromDB('groups', globalMatch.groupId);
                if (groupDoc) groupName = groupDoc.name;

                showToast(`⚠️ تنبيه: الطالب "${globalMatch.name}" في (${groupName})`, 'warning');
                setTimeout(() => {
                    showToast(`✅ تم تسجيل الحضور (ضيف)!`, 'success');
                }, 1200);

            } else {
                // كود غير معروف تماماً
                // showToast("كود غير معروف", "error");
            }

        } catch (err) {
            console.error("Cross-Group Error:", err);
        }

        // إعادة تشغيل الكاميرا بعد مهلة قصيرة
        setTimeout(() => {
            isScannerPaused = false;
            requestAnimationFrame(tickScanner);
        }, 2500);

        return;
    }

    // ✅ الحالة الطبيعية: الطالب موجود في المجموعة الحالية
    playBeep();
    isScannerPaused = true;

    // منطق التوأم (اختيار من لم يحضر بعد)
    let studentToMark = matchedStudents[0];
    if (matchedStudents.length > 1) {
        const absentSibling = matchedStudents.find(s => {
            const row = document.querySelector(`#dailyStudentsList > div[data-sid="${s.id}"]`);
            return row && row.querySelector('.att-select').value !== 'present';
        });
        if (absentSibling) studentToMark = absentSibling;
    }

    showScanSuccessUI(studentToMark);

    // توجيه حسب الوضع
    if (currentScannerMode === 'daily') {
        checkGoldenTicket(studentToMark.name);
        processDailyScan(studentToMark);
        // ✅✅ الإضافة الجديدة: الحفظ التلقائي الذكي ✅✅
        // لو المدرس بيعمل scan ورا بعض بسرعة، بنلغي الحفظ القديم ونستنى الجديد
        clearTimeout(saveTimeout);

        // بنقوله: استنى 3 ثواني، لو مفيش حد تاني جه، احفظ اللي فات كله
        saveTimeout = setTimeout(() => {
            silentSave();
        }, 3000);
    }
    else if (currentScannerMode === 'payments') {
        processPaymentScan(studentToMark);
    }
}

// ✅ دالة مساعدة لتسجيل الحضور في مجموعة أخرى (بدون فتحها)
async function saveCrossGroupAttendance(student, homeworkSubmitted) {
    const date = document.getElementById('dailyDateInput').value;
    const groupId = student.groupId;

    // 1️⃣ تسجيل الحضور (Attendance)
    const attId = `${groupId}_${date}`;

    // جلب أو إنشاء سجل الحضور
    let attDoc = await getFromDB('attendance', attId);
    if (!attDoc) {
        attDoc = { id: attId, date: date, records: [] };
    }

    // تحديث حالة الطالب
    const existingRec = attDoc.records.find(r => r.studentId === student.id);
    if (existingRec) {
        existingRec.status = 'present';
    } else {
        attDoc.records.push({ studentId: student.id, status: 'present' });
    }

    // حفظ الحضور (Local & Sync)
    await putToDB('attendance', attDoc);
    await addToSyncQueue({
        type: 'set',
        path: `teachers/${TEACHER_ID}/groups/${groupId}/dailyAttendance/${date}`,
        data: { date: date, records: attDoc.records }
    });

    // 2️⃣ تسجيل الواجب (Homework) - إذا تم التسليم
    if (homeworkSubmitted) {
        const hwId = `${groupId}_HW_${date}`;

        // جلب أو إنشاء سجل الواجب
        let hwDoc = await getFromDB('assignments', hwId);
        if (!hwDoc) {
            hwDoc = {
                id: hwId,
                groupId: groupId,
                name: `واجب ${date}`,
                date: date,
                scores: {},
                type: 'daily'
            };
        }

        // التأكد من وجود كائن الدرجات
        if (!hwDoc.scores) hwDoc.scores = {};

        // تسجيل التسليم (submitted: true)
        hwDoc.scores[student.id] = { submitted: true, score: null };

        // حفظ الواجب (Local & Sync)
        await putToDB('assignments', hwDoc);
        await addToSyncQueue({
            type: 'set',
            path: `teachers/${TEACHER_ID}/groups/${groupId}/assignments/${hwId}`,
            data: hwDoc
        });

        console.log(`✅ Cross-Homework Saved for ${student.name}`);
    }

    console.log(`✅ Cross-Attendance Saved for ${student.name}`);
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

async function resolveHomework(isSubmitted) {
    // ✅ الحالة 1: الطالب من مجموعة أخرى (Cross-Group)
    if (currentCrossGroupStudent) {
        // حفظ الحضور + الواجب (حسب الاختيار)
        await saveCrossGroupAttendance(currentCrossGroupStudent, isSubmitted);

        // جلب اسم المجموعة للعرض
        let groupName = "مجموعة أخرى";
        try {
            const gDoc = await getFromDB('groups', currentCrossGroupStudent.groupId);
            if (gDoc) groupName = gDoc.name;
        } catch (e) { }

        // رسائل تأكيد
        showToast(`⚠️ الطالب "${currentCrossGroupStudent.name}" مسجل في (${groupName})`, 'warning');
        setTimeout(() => {
            if (isSubmitted) showToast(`✅ تم تسجيل الحضور واستلام الواجب!`);
            else showToast(`✅ تم تسجيل الحضور (بدون واجب)`);
        }, 1000);

        // تنظيف وإعادة تشغيل
        currentCrossGroupStudent = null;
        document.getElementById('hwConfirmModal').classList.add('hidden');

        setTimeout(() => {
            isScannerPaused = false;
            requestAnimationFrame(tickScanner);
        }, 1500);
        return;
    }

    // ✅ الحالة 2: الطالب من المجموعة الحالية (Logic القديم)
    if (currentPendingStudentId) {
        const row = document.querySelector(`#dailyStudentsList > div[data-sid="${currentPendingStudentId}"]`);
        if (row) {
            const chk = row.querySelector('.hw-check');
            if (chk) {
                chk.checked = isSubmitted;
                // تلوين الصف لو تم التسليم (اختياري)
                if (isSubmitted) row.classList.add('bg-green-50');
            }
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
            const val = defaultAmountInput.value;

            // ✅✅ التعديل الجديد: منع الـ Scan لو المبلغ مش محدد ✅✅
            if (!val) {
                showToast(`⚠️ لا يمكن تحصيل المصاريف لـ "${student.name}"`, "error");
                setTimeout(() => showToast("يرجى تحديد المبلغ أولاً في الخانة العلوية", "error"), 1000);

                // تشغيل صوت خطأ لو متاح، أو هزة للصف
                row.classList.add('shake-anim');
                defaultAmountInput.focus(); // توجيه المؤشر للخانة الفاضية
                setTimeout(() => row.classList.remove('shake-anim'), 500);
                return; // وقف التنفيذ
            }

            // لو المبلغ موجود، كمل عادي
            checkbox.checked = true;
            input.value = val;

            checkbox.dispatchEvent(new Event('change'));
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.classList.add('ring-4', 'ring-green-300');
            setTimeout(() => row.classList.remove('ring-4', 'ring-green-300'), 1000);
        } else {
            showToast(`تم دفع المصاريف مسبقاً للطالب: ${student.name}`);
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
        div.className = "record-item cursor-pointer";
        div.onclick = (e) => {
            if (!e.target.closest('button')) openStudentProfile(s.id);
        };
        div.innerHTML = `
            <div class="flex-1">
                <p class="font-bold text-gray-800 dark:text-white"> ${s.name}</p>
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
            const msg = `مرحباً ولي أمر الطالب *${s.name}*\n\nلمتابعة مستوى الطالب (الغياب، الدرجات، والمصاريف) لحظياً، يرجى الدخول على الرابط الخاص به:\n${fullDirectLink}\n\n *يرجي ارسال اللينك لولي الامر وعدم فتحه اطلاقا من قبل الطالب*\n\nدمتم بخير`;
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
    const randomQuote = motivationQuotes[Math.floor(Math.random() * motivationQuotes.length)];

    // ب. الإمساك بالعنصر وتغيير محتواه
    const quoteElement = document.getElementById('idStudentPhone');
    quoteElement.innerText = randomQuote;

    quoteElement.classList.remove('font-mono', 'tracking-wider', 'text-gray-400');
    // quoteElement.classList.add('text-gray-600', 'italic', 'text-sm');
    quoteElement.classList.add('text-gray-600', 'font-bold');
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
    const groupTotalDisplay = document.getElementById('groupTotalDisplay');

    container.innerHTML = '';
    let currentGroupTotal = 0; // ده العداد الحي للمجموعة

    if (!month || !allStudents.length) return;

    const payId = `${SELECTED_GROUP_ID}_PAY_${month}`;
    const doc = await getFromDB('payments', payId);
    const map = {};
    if (doc?.records) {
        doc.records.forEach(r => map[r.studentId] = r.amount);
    }

    // 1. الحساب المبدئي عند التحميل
    allStudents.forEach(s => {
        let amount = map[s.id];
        if (amount && amount > 0) currentGroupTotal += parseInt(amount);
    });

    // عرض الأرقام الأولية
    groupTotalDisplay.innerText = `${currentGroupTotal.toLocaleString()} ج.م`;
    calculateOverallIncome(currentGroupTotal); // ✅ بنبعت الرقم المبدئي

    // 2. رسم القائمة
    allStudents.forEach(s => {
        let amount = map[s.id];
        const isPaid = amount && amount > 0;

        const div = document.createElement('div');
        div.className = `record-item flex justify-between items-center p-3 border rounded-xl transition-colors ${isPaid ? 'bg-green-50 border-green-500 dark:bg-green-900/20' : 'bg-white dark:bg-darkSurface border-gray-100 dark:border-gray-700'}`;
        div.dataset.sid = s.id;

        div.innerHTML = `
<span onclick="openStudentProfile('${s.id}')" 
      class="font-bold text-gray-700 dark:text-gray-200 w-1/3 truncate cursor-pointer hover:text-[#F2CE5A] transition-colors">
    ${s.name}
</span>            <div class="flex items-center gap-3 justify-end w-2/3">
                <input type="number"
                       class="payment-input input-field h-9 w-24 text-center text-sm ${isPaid ? 'text-green-600 font-bold' : 'text-gray-400'}"
                       placeholder="0" value="${amount || ''}" min="0">
                <input type="checkbox" class="payment-check w-6 h-6 accent-green-600 cursor-pointer" ${isPaid ? 'checked' : ''}>
            </div>
        `;

        const checkbox = div.querySelector('.payment-check');
        const input = div.querySelector('.payment-input');

        input.addEventListener('focus', (e) => {
            oldVal = parseInt(e.target.value) || 0; // حفظ القيمة قبل التعديل
        });

        input.addEventListener('change', (e) => {
            const newVal = parseInt(e.target.value) || 0;
            if (checkbox.checked) {
                currentGroupTotal = (currentGroupTotal - oldVal) + newVal;
                groupTotalDisplay.innerText = `${currentGroupTotal.toLocaleString()} ج.م`;
                calculateOverallIncome(currentGroupTotal);
            }
            oldVal = newVal;
            // Auto-save payments
            if (saveTimeout) clearTimeout(saveTimeout);
            saveTimeout = setTimeout(savePayments, 1000);
        });

        checkbox.addEventListener('change', (e) => {
            const defaultVal = defaultAmountInput.value;
            if (e.target.checked && !defaultVal) {
                e.target.checked = false;
                showToast("⚠️ يرجى إدخال مبلغ التحصيل أولاً", "error");
                defaultAmountInput.focus();
                return;
            }

            if (e.target.checked) {
                if (!input.value || input.value == 0) input.value = defaultVal;
                div.classList.add('bg-green-50', 'border-green-500', 'dark:bg-green-900/20');
                input.classList.add('text-green-600', 'font-bold');
                currentGroupTotal += parseInt(input.value || 0);
            } else {
                currentGroupTotal -= parseInt(input.value || 0);
                input.value = '';
                div.classList.remove('bg-green-50', 'border-green-500', 'dark:bg-green-900/20');
                input.classList.remove('text-green-600', 'font-bold');
            }
            groupTotalDisplay.innerText = `${currentGroupTotal.toLocaleString()} ج.م`;
            calculateOverallIncome(currentGroupTotal);

            // Auto-save payments
            if (saveTimeout) clearTimeout(saveTimeout);
            saveTimeout = setTimeout(savePayments, 1000);
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
    const totalMark = document.getElementById('newExamTotalMark').value || 30;
    if (!name) return;

    // 1. إنشاء الـ ID وحفظه
    const id = generateUniqueId();

    const data = {
        id,
        groupId: SELECTED_GROUP_ID,
        name,
        totalMark: parseInt(totalMark),
        type: 'exam',
        scores: {},
        date: new Date().toISOString().slice(0, 10)
    };

    await putToDB('assignments', data);
    await addToSyncQueue({ type: 'add', path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/assignments`, id, data });

    document.getElementById('newExamName').value = '';
    document.getElementById('newExamTotalMark').value = '';

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
    const totalMarkInput = document.getElementById('examTotalMarkInput');
    container.innerHTML = '';
    if (!examId) return;

    const exam = await getFromDB('assignments', examId);
    const scores = exam.scores || {};
    const totalMark = exam.totalMark || 30;

    totalMarkInput.value = totalMark;

    // تفعيل الحفظ التلقائي للدرجة النهائية (مع التحقق من الدرجات الحالية)
    totalMarkInput.onchange = (e) => {
        const newTotal = parseInt(e.target.value) || 0;
        // التحقق لو فيه درجات أكبر من النهاية العظمى الجديدة
        let hasError = false;
        document.querySelectorAll('.exam-score-input').forEach(inp => {
            if (parseInt(inp.value) > newTotal) {
                inp.value = newTotal;
                inp.classList.add('border-red-500');
                hasError = true;
            }
        });
        if (hasError) showToast("تم تعديل بعض الدرجات لتناسب المجموع الجديد", "warning");

        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveExamGrades, 1000);
    };

    allStudents.forEach(s => {
        const val = scores[s.id]?.score || '';
        const div = document.createElement('div');
        div.className = "flex items-center gap-2 p-2 bg-white dark:bg-darkSurface border dark:border-gray-700 rounded-lg cursor-pointer hover:border-brand transition-colors";
        div.onclick = (e) => {
            if (!e.target.closest('input')) openStudentProfile(s.id);
        };
        div.innerHTML = `<label class="text-sm font-bold w-1/2 truncate dark:text-white"> ${s.name}</label>
                         <div class="relative w-1/2">
                            <input type="number" class="exam-score-input input-field w-full h-10 text-center font-bold" 
                                   data-sid="${s.id}" value="${val}" placeholder="0">
                            <span class="absolute left-3 top-2 text-[10px] text-gray-400">/${totalMark}</span>
                         </div>`;

        const inp = div.querySelector('input');
        inp.addEventListener('input', (e) => {
            const currentTotal = parseInt(totalMarkInput.value) || 0;
            if (parseInt(e.target.value) > currentTotal) {
                e.target.value = currentTotal;
                showToast(`الدرجة لا يمكن أن تزيد عن ${currentTotal}`, 'error');
            }
            if (saveTimeout) clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveExamGrades, 1500);
        });

        container.appendChild(div);
    });
}
async function saveExamGrades() {
    const examId = document.getElementById('examSelect').value;
    const totalMark = document.getElementById('examTotalMarkInput').value;
    if (!examId) return;

    const scores = {};
    document.querySelectorAll('.exam-score-input').forEach(inp => {
        if (inp.value !== '') scores[inp.dataset.sid] = { score: inp.value };
    });

    const existing = await getFromDB('assignments', examId);
    existing.scores = scores;
    existing.totalMark = parseInt(totalMark) || 30;

    await putToDB('assignments', existing);
    await addToSyncQueue({
        type: 'set',
        path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/assignments/${examId}`,
        data: { scores, totalMark: existing.totalMark }
    });
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
    migrateTeacherID(); // ✨ إصلاح المعرف لو كان بالصيغة القديمة
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

        if (SELECTED_GROUP_ID) {
            const savedAmount = localStorage.getItem(`SPOT_PAY_AMT_${SELECTED_GROUP_ID}`);
            const amountInput = document.getElementById('defaultAmountInput');
            if (amountInput && savedAmount) {
                amountInput.value = savedAmount;
            }
        }
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
    if (SELECTED_GROUP_ID && !document.getElementById('tab-schedule').classList.contains('hidden')) {
        fetchRecurringSchedules(); // لتحديث أيام الأسبوع في الجدول
    }
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
                    <div class="w-10 h-10 rounded-lg ${bgClass} ${iconClass.split(' ')[1]} flex items-center justify-center flex-shrink-0">
                        <i class="${iconClass} text-xl"></i>
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
    input.style.height = '48px'; // إعادة الارتفاع للأصلي

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
    clean = clean.replace(/\\(.)/g, function (match, char) {
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
                <div class="bg-gradient-to-tr from-yellow-500 to-yellow-600 text-black px-5 py-3 rounded-2xl rounded-tr-none font-bold text-sm shadow-md max-w-[85%] break-words whitespace-pre-wrap">
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
        // 🤖 رد البوت العادي
        div.innerHTML = `
            <div class="flex gap-3 justify-start items-start w-full group">
                <div class="w-8 h-8 bg-zinc-200 dark:bg-zinc-800 rounded-full flex items-center justify-center flex-shrink-0 text-gray-600 dark:text-gray-300 text-xs shadow-sm">
                    <i class="ri-robot-2-fill"></i>
                </div>
                <div class="flex flex-col gap-2 max-w-[85%]">
                    <div class="bg-white dark:bg-zinc-800 p-4 rounded-2xl rounded-tl-none shadow-sm border border-gray-100 dark:border-zinc-700 text-sm text-gray-700 dark:text-gray-200 leading-relaxed break-words whitespace-pre-wrap">
                        ${text}
                    </div>
                </div>
            </div>`;

        // إذا كان النص يحتوي على رابط PDF (الذي يولده الباك إند)، نظهر زرار تحميل واضح
        if (text.includes("https://storage.googleapis.com") || text.includes("firebasestorage")) {
            const urlMatch = text.match(/https?:\/\/[^\s\n]+/);
            if (urlMatch) {
                const pdfUrl = urlMatch[0];
                const btnDiv = div.querySelector('.flex.flex-col.gap-2');
                const downloadBtn = document.createElement('a');
                downloadBtn.href = pdfUrl;
                downloadBtn.target = "_blank";
                downloadBtn.className = "self-start bg-zinc-900 hover:bg-black text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md mt-1";
                downloadBtn.innerHTML = `<i class="ri-file-download-fill text-yellow-500"></i> حفظ وتحميل الـ PDF`;
                btnDiv.appendChild(downloadBtn);
            }
        } else {
            // للمذكرات العادية التي ليس لها ملف مرفوع بعد، نظهر زر الطباعة/الحفظ المحلي
            const safeText = encodeURIComponent(text);
            const btnDiv = div.querySelector('.flex.flex-col.gap-2');
            const printBtn = document.createElement('button');
            printBtn.onclick = () => window.printStudyNote(decodeURIComponent(safeText));
            printBtn.className = "self-start bg-gray-50 dark:bg-zinc-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-zinc-700 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all hover:bg-gray-100 dark:hover:bg-zinc-700 mt-1";
            printBtn.innerHTML = `<i class="ri-printer-line text-blue-500"></i> طباعة / حفظ كـ PDF`;
            btnDiv.appendChild(printBtn);
        }
    }

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}
// دالة تحويل الرسالة لـ PDF 🖨️
window.downloadMessageAsPDF = function (elementId) {
    const element = document.getElementById(elementId);

    // إعدادات الملف
    const opt = {
        margin: [10, 10, 10, 10], // الهوامش
        filename: `Spot_Exam_${new Date().toLocaleDateString()}.pdf`, // اسم الملف
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true }, // scale 2 عشان الجودة تبقي عالية
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
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

window.printExam = function (examData) {
    const printWindow = window.open('', '_blank');

    const toArabicNum = (n) => n.toLocaleString('ar-EG');
    const getOptionLabel = (i) => ['(أ)', '(ب)', '(ج)', '(د)'][i] || `(${i + 1})`;

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
window.printStudyNote = function (content) {
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

// دالة حساب الدخل الكلي (بذكاء 🧠)
async function calculateOverallIncome(liveGroupTotal = null) {
    const month = document.getElementById('paymentMonthInput').value;
    const display = document.getElementById('overallTotalDisplay');

    if (!month) return;

    try {
        let groups = await getAllFromDB('groups');

        if (!groups || groups.length === 0) {
            display.innerText = "0 ج.م";
            return;
        }

        // مصفوفة وعود لحساب كل مجموعة بالتوازي
        const promises = groups.map(async (group) => {
            // ✅ اللوجيك الجديد:
            // لو دي المجموعة اللي أنا فاتحها دلوقتي + باعتلها رقم مباشر (Live)
            // استخدم الرقم المباشر ومتروحش للداتابيز القديمة
            if (group.id === SELECTED_GROUP_ID && liveGroupTotal !== null) {
                return parseInt(liveGroupTotal) || 0;
            }

            // باقي المجموعات: هاتها من الداتابيز عادي
            const payId = `${group.id}_PAY_${month}`;
            const doc = await getFromDB('payments', payId);

            if (doc && doc.records) {
                return doc.records.reduce((sum, r) => sum + (parseInt(r.amount) || 0), 0);
            }
            return 0;
        });

        // تجميع النتائج
        const results = await Promise.all(promises);
        const totalIncome = results.reduce((acc, curr) => acc + curr, 0);

        display.innerText = `${totalIncome.toLocaleString()} ج.م`;

    } catch (error) {
        console.error(error);
    }
}
// ==========================================
// 🔔 منطق نافذة الغياب الجديدة (Modal Logic - No Auth Version)
// ==========================================

function setupAbsenceModalListeners() {
    const sendBtn = document.getElementById('sendAbsenceBtn');
    const confirmBtn = document.getElementById('confirmSendAbsenceBtn');
    const overlay = document.getElementById('absenceModalOverlay');

    // 1. فتح النافذة (نتأكد إن الزرار موجود الأول)
    if (sendBtn) {
        sendBtn.onclick = () => {
            const modal = document.getElementById('absenceModal');
            const overlay = document.getElementById('absenceModalOverlay');
            const content = document.getElementById('absenceModalContent');

            if (modal && overlay && content) {
                modal.classList.remove('hidden');
                setTimeout(() => {
                    overlay.classList.remove('opacity-0');
                    content.classList.remove('opacity-0', 'scale-95');
                    content.classList.add('opacity-100', 'scale-100');
                }, 10);
            }
        };
    }

    // 2. إغلاق النافذة
    window.closeAbsenceModal = function () {
        const modal = document.getElementById('absenceModal');
        const overlay = document.getElementById('absenceModalOverlay');
        const content = document.getElementById('absenceModalContent');

        if (modal && overlay && content) {
            overlay.classList.add('opacity-0');
            content.classList.remove('opacity-100', 'scale-100');
            content.classList.add('opacity-0', 'scale-95');
            setTimeout(() => {
                modal.classList.add('hidden');
            }, 300);
        }
    };

    // 3. تأكيد الإرسال
    if (confirmBtn) {
        confirmBtn.onclick = async () => {
            const originalText = confirmBtn.innerText;

            confirmBtn.innerHTML = '<i class="ri-loader-4-line animate-spin"></i> جاري الإرسال...';
            confirmBtn.disabled = true;

            try {
                const dateInput = document.getElementById('dailyDateInput');

                // تحقق مزدوج من البيانات قبل الإرسال
                if (!dateInput || !dateInput.value) {
                    showToast("يرجى اختيار التاريخ", "error");
                    return;
                }

                if (!TEACHER_ID || !SELECTED_GROUP_ID) {
                    showToast("بيانات المدرس أو المجموعة غير متوفرة", "error");
                    return;
                }

                const sendAbsenceFn = firebase.functions().httpsCallable('sendAbsenceNotifications');

                // ✅ التعديل هنا: إرسال teacherId يدوياً
                const result = await sendAbsenceFn({
                    groupId: SELECTED_GROUP_ID,
                    date: dateInput.value,
                    teacherId: TEACHER_ID // لازم نبعته عشان مفيش Auth
                });

                closeAbsenceModal();

                if (result.data.success) {
                    showToast(`✅ ${result.data.message}`);
                } else {
                    showToast(result.data.message || "لا يوجد غياب", "warning");
                }

            } catch (error) {
                console.error("Absence Send Error:", error);
                closeAbsenceModal();
                showToast("فشل إرسال التنبيهات", "error");
            } finally {
                confirmBtn.innerHTML = originalText;
                confirmBtn.disabled = false;
            }
        };
    }

    // إغلاق عند الضغط على الخلفية
    if (overlay) {
        overlay.onclick = closeAbsenceModal;
    }
}

// تشغيل الدالة بعد تحميل الصفحة
document.addEventListener('DOMContentLoaded', setupAbsenceModalListeners);

// ==========================================
// 👤 منطق بروفايل الطالب (Student Profile)
// ==========================================

let currentProfileId = null;
let attendanceChartInstance = null;

// 1. فتح البروفايل عند الضغط على اسم الطالب
async function openStudentProfile(studentId) {
    currentProfileId = studentId;
    const student = allStudents.find(s => s.id === studentId);
    if (!student) return;

    // إظهار الصفحة
    document.getElementById('studentProfilePage').classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // منع السكرول في الخلفية

    // تعبئة البيانات الأساسية
    const followUpText = translations[currentLang].studentFollowUp || "لوحة متابعة الطالب {name}";
    document.getElementById('profileHeaderTitle').innerHTML = followUpText.replace('{name}', `<span class="text-brand">${student.name}</span>`);
    document.getElementById('profileName').value = student.name;
    document.getElementById('profileParentPhone').value = student.parentPhoneNumber || '';

    // Avatar
    const avatarEl = document.getElementById('profileAvatar');
    avatarEl.innerText = student.name.charAt(0).toUpperCase();

    // إلغاء وضع التعديل (لو كان مفتوح)
    cancelEditMode();

    // تحميل إحصائيات الحضور
    await loadStudentStats(studentId);
}

// 2. إغلاق البروفايل
function closeStudentProfile() {
    document.getElementById('studentProfilePage').classList.add('hidden');
    document.body.style.overflow = 'auto';
}

// 3. تفعيل وضع التعديل
function enableEditMode() {
    const inputs = ['profileName', 'profileParentPhone'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        el.disabled = false;
        el.classList.add('bg-white', 'dark:bg-darkSurface', 'ring-2', 'ring-brand/30', 'border-brand/50');
    });
    document.getElementById('saveProfileBtn').classList.remove('hidden');
    document.getElementById('profileName').focus();
}

// 4. إلغاء التعديل
function cancelEditMode() {
    const inputs = ['profileName', 'profileParentPhone'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        el.disabled = true;
        el.classList.remove('bg-white', 'dark:bg-darkSurface', 'ring-2', 'ring-brand/30', 'border-brand/50');
    });
    document.getElementById('saveProfileBtn').classList.add('hidden');
}

// 5. حفظ التعديلات في الفايربيس
async function saveStudentChanges() {
    if (!currentProfileId || !TEACHER_ID || !SELECTED_GROUP_ID) return;

    const newName = document.getElementById('profileName').value;
    const newParentPhone = document.getElementById('profileParentPhone').value;

    const btn = document.querySelector('#saveProfileBtn button:last-child');
    const oldText = btn.innerText;
    btn.innerText = 'جاري الحفظ...';
    btn.disabled = true;

    try {
        const studentRef = `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/students/${currentProfileId}`;

        await addToSyncQueue({
            type: 'update',
            path: studentRef,
            data: {
                name: newName,
                parentPhoneNumber: newParentPhone
            }
        });

        // تحديث الداتا محلياً فوراً
        const sIndex = allStudents.findIndex(s => s.id === currentProfileId);
        if (sIndex !== -1) {
            allStudents[sIndex].name = newName;
            allStudents[sIndex].parentPhoneNumber = newParentPhone;
        }

        showToast("تم تحديث البيانات بنجاح ✅");
        cancelEditMode();
        renderDailyList(); // تحديث القائمة الرئيسية لو الاسم اتغير

    } catch (error) {
        console.error(error);
        showToast("فشل الحفظ", "error");
    } finally {
        btn.innerText = oldText;
        btn.disabled = false;
    }
}

// 6. تحميل الإحصائيات الشاملة للطالب
async function loadStudentStats(studentId) {
    if (!SELECTED_GROUP_ID) return;

    let presentTotal = 0;
    let absentTotal = 0;
    let examCount = 0;
    let historyHTML = '';
    const monthlyStats = {}; // { '2023-10': { present: 0, absent: 0 } }

    try {
        // 0. جلب كل الامتحانات والواجبات مسبقاً للربط
        const assignments = await getAllFromDB('assignments', 'groupId', SELECTED_GROUP_ID);
        const hwMapByDate = {}; // للوصول السريع لحالة الواجب في الحصص
        assignments.forEach(asm => {
            if (asm.type === 'daily') {
                hwMapByDate[asm.date] = asm.scores ? asm.scores[studentId] : null;
            }
        });

        // 1. جلب الحضور (جلب آخر 50 بدون orderBy لتجنب الـ Index)
        const attSnap = await firestoreDB.collection(`teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/dailyAttendance`)
            .limit(100)
            .get();

        const sortedAttDocs = attSnap.docs
            .map(d => d.data())
            .sort((a, b) => new Date(b.date) - new Date(a.date)) // تنازلي (الأحدث أولاً)
            .slice(0, 50);

        sortedAttDocs.forEach(data => {
            const record = (data.records || []).find(r => r.studentId === studentId);
            const monthKey = (data.date || "").substring(0, 7); // YYYY-MM
            if (!monthKey) return;

            if (!monthlyStats[monthKey]) monthlyStats[monthKey] = { present: 0, absent: 0 };

            if (record) {
                const statusColor = record.status === 'present' ? 'text-green-500' : 'text-red-500';
                const statusText = record.status === 'present' ? translations[currentLang].present : translations[currentLang].absent;

                if (record.status === 'present') {
                    presentTotal++;
                    monthlyStats[monthKey].present++;
                } else {
                    absentTotal++;
                    monthlyStats[monthKey].absent++;
                }

                if (sortedAttDocs.indexOf(data) < 20) {
                    // الربط مع حالة الواجب الحقيقية من الـ assignments
                    const hwStatus = hwMapByDate[data.date];
                    const isSubmitted = hwStatus && hwStatus.submitted;

                    historyHTML += `
                        <tr class="hover:bg-white/5 transition-colors border-b border-gray-100 dark:border-gray-800">
                            <td class="p-4 font-bold text-gray-700 dark:text-gray-300">${data.date}</td>
                            <td class="p-4 ${statusColor} font-black">${statusText}</td>
                            <td class="p-4 text-gray-400 dark:text-gray-500 text-xs font-bold">
                                ${isSubmitted ? '<span class="text-green-500">✅ تم التسليم</span>' : '<span class="text-red-500">❌ لم يسلم</span>'}
                            </td>
                        </tr>
                    `;
                }
            }
        });

        // 2. جلب الدرجات التفصيلية (للامتحانات الحقيقية فقط)
        let examsHTML = '';
        assignments.sort((a, b) => new Date(b.date) - new Date(a.date));

        assignments.forEach(asm => {
            // تجاهل الواجبات من قائمة "الامتحانات"
            if (asm.type === 'daily' || (asm.name && asm.name.includes('واجب'))) return;

            const scoreData = asm.scores ? asm.scores[studentId] : null;
            if (scoreData) {
                examCount++;
                const total = asm.totalMark || 30;
                const percent = Math.round((scoreData.score / total) * 100);
                const colorClass = percent >= 50 ? 'text-green-500' : 'text-red-500';

                examsHTML += `
                    <div class="p-3 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-100 dark:border-gray-800 flex justify-between items-center group">
                        <div class="flex flex-col">
                            <span class="font-bold text-gray-700 dark:text-gray-200">${asm.name}</span>
                            <span class="text-[11px] text-gray-600 dark:text-gray-300 font-black tracking-tighter">${asm.date || ''}</span>
                        </div>
                        <div class="text-right">
                            <span class="text-lg font-black ${colorClass}">${scoreData.score}</span>
                            <!-- مؤقتاً تم إخفاء الدرجة النهائية للتبسيط -->
                        </div>
                    </div>
                `;
            }
        });

        // 3. جلب حالة المدفوعات (آخر 6 شهور)
        let paymentsHTML = '';
        const currentYear = new Date().getFullYear();
        const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
        const currentMonthIdx = new Date().getMonth();

        // عرض آخر 5 شهور
        for (let i = 0; i < 5; i++) {
            let mIdx = currentMonthIdx - i;
            let year = currentYear;
            if (mIdx < 0) { mIdx += 12; year--; }
            const monthStr = `${year}-${months[mIdx]}`;

            const payId = `${SELECTED_GROUP_ID}_PAY_${monthStr}`;
            const payDoc = await getFromDB('payments', payId);
            const record = payDoc?.records?.find(r => r.studentId === studentId);
            const isPaid = record && record.amount > 0;

            paymentsHTML += `
                <div class="p-3 rounded-xl border flex justify-between items-center ${isPaid ? 'bg-green-50/50 border-green-200 dark:bg-green-900/10 dark:border-green-800' : 'bg-red-50/50 border-red-200 dark:bg-red-900/10 dark:border-red-800'}">
                    <span class="font-black text-gray-700 dark:text-gray-300">${monthStr}</span>
                    <span class="text-xs font-black ${isPaid ? 'text-green-600' : 'text-red-500'}">
                        ${isPaid ? `✅ مدفوع (${record.amount})` : '❌ غير مدفوع'}
                    </span>
                </div>
            `;
        }

        // 4. بناء سجل الحضور الشهري
        let monthlyHTML = '';
        Object.keys(monthlyStats).sort().reverse().forEach(month => {
            const stats = monthlyStats[month];
            const total = stats.present + stats.absent;
            const percent = total > 0 ? Math.round((stats.present / total) * 100) : 0;

            monthlyHTML += `
                <div class="p-4 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-100 dark:border-gray-800">
                    <div class="flex justify-between items-center mb-2">
                        <span class="font-black text-gray-800 dark:text-gray-200 uppercase tracking-tighter">${month}</span>
                        <span class="text-xs font-black px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded-md">${percent}%</span>
                    </div>
                    <div class="flex gap-1 h-2 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                        <div class="bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]" style="width: ${percent}%"></div>
                        <div class="bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]" style="width: ${100 - percent}%"></div>
                    </div>
                    <div class="flex justify-between mt-3 px-1 text-xs font-black">
                        <div class="flex items-center gap-1.5">
                            <div class="w-2 h-2 rounded-full bg-green-500"></div>
                            <span class="text-green-600 dark:text-green-400">حضر: ${stats.present}</span>
                        </div>
                        <div class="flex items-center gap-1.5">
                            <div class="w-2 h-2 rounded-full bg-red-500"></div>
                            <span class="text-red-600 dark:text-red-400">غاب: ${stats.absent}</span>
                        </div>
                    </div>
                </div>
            `;
        });

        // تحديث الواجهة
        document.getElementById('profileAttendanceHistory').innerHTML = historyHTML || '<tr><td colspan="3" class="p-4 text-center text-gray-400 font-bold">لا يوجد سجل حضور حالياً</td></tr>';
        document.getElementById('profileExamGradesList').innerHTML = examsHTML || '<div class="text-center py-10 text-gray-400 dark:text-gray-500 font-black uppercase tracking-widest text-[11px]"><i class="ri-inbox-line text-4xl block mb-2 opacity-20"></i>لا يوجد امتحانات</div>';
        document.getElementById('profileMonthlyAttendance').innerHTML = monthlyHTML || '<div class="text-center py-10 text-gray-400 dark:text-gray-500 font-black uppercase tracking-widest text-[11px]">لا يوجد حضر شهري</div>';
        document.getElementById('profilePaymentsStatus').innerHTML = paymentsHTML || '<div class="text-center py-10 text-gray-400 dark:text-gray-500 font-black uppercase tracking-widest text-[11px]">لا يوجد سجل مدفوعات</div>';

        document.getElementById('statExams').innerText = examCount;

        const totalSessions = presentTotal + absentTotal;
        const overallPercent = totalSessions > 0 ? Math.round((presentTotal / totalSessions) * 100) : 0;
        document.getElementById('attendancePercentage').innerText = overallPercent + '%';

    } catch (e) {
        console.error("Error loading stats:", e);
    }
}

// 7. رسم الدونات شارت (Chart.js)
function renderAttendanceChart(present, absent) {
    const ctx = document.getElementById('attendanceDoughnutChart').getContext('2d');
    const total = present + absent;
    const percentage = total === 0 ? 0 : Math.round((present / total) * 100);

    document.getElementById('attendancePercentage').innerText = `${percentage}%`;

    if (window.attendanceChartInstance) {
        window.attendanceChartInstance.destroy();
    }

    window.attendanceChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['حضور', 'غياب'],
            datasets: [{
                data: [present, absent],
                backgroundColor: ['#10B981', '#EF4444'], // أخضر وأحمر
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            cutout: '80%', // سمك الدونات
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            }
        }
    });
}
// ==========================================
// 🚨 EMERGENCY RESTORE SYSTEM (V5 - FINAL SHIELD) 🚨
// ==========================================
async function emergencyRestore(mode = 'upload') {
    try {
        await openDB();
        const stats = {};
        const fullData = {};
        const stores = ['teachers', 'groups', 'students', 'assignments', 'attendance', 'payments', 'schedules', 'scheduleExceptions'];

        for (const s of stores) {
            const data = await getAllFromDB(s);
            stats[s] = data.length;
            fullData[s] = data;
        }

        if (mode === 'download') {
            const blob = new Blob([JSON.stringify(fullData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `SPOT_BACKUP_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            alert("✅ تم تحميل نسخة احتياطية من كل بيانات الموبايل بنجاح. احتفظ بهذا الملف!");
            return;
        }

        const statsMsg = `📊 تقرير الجرد (V5):\n` +
            `- الحضور: ${stats.attendance} سجل\n` +
            `- الطلاب والمجموعات: ${stats.students + stats.groups} سجل\n` +
            `- المصاريف والواجبات: ${stats.payments + stats.assignments} سجل\n\n` +
            `⚠️ النسخة دي بتستعيد الحضور بدقة أعلى. هل تريد البدء؟`;

        if (!confirm(statsMsg)) return;

        const btn = document.getElementById('restoreBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="ri-loader-4-line animate-spin"></i> جاري استعادة الحضور...';

        let uploaded = 0;
        const groupToTeacherMap = {};

        for (const t of fullData.teachers) {
            await firestoreDB.collection('teachers').doc(t.id).set(t, { merge: true });
            uploaded++;
        }
        for (const g of fullData.groups) {
            const tid = g.teacherId || (fullData.teachers.length > 0 ? fullData.teachers[0].id : null);
            if (tid) {
                groupToTeacherMap[g.id] = tid;
                await firestoreDB.doc(`teachers/${tid}/groups/${g.id}`).set(g, { merge: true });
                uploaded++;
            }
        }

        for (const att of fullData.attendance) {
            try {
                const id = att.id;
                // التاريخ YYYY-MM-DD دائماً 10 حروف
                const date = att.date || (id.length >= 10 ? id.substring(id.length - 10) : null);
                const gid = att.groupId || (id.length > 11 ? id.substring(0, id.length - 11) : null);
                const tid = att.teacherId || groupToTeacherMap[gid] || (fullData.teachers.length > 0 ? fullData.teachers[0].id : null);

                if (tid && gid && date && date.includes('-')) {
                    await firestoreDB.doc(`teachers/${tid}/groups/${gid}/dailyAttendance/${date}`).set(att, { merge: true });
                    uploaded++;
                }
            } catch (err) { console.error("Skip Att:", err); }
        }

        for (const s of fullData.students) {
            const gid = s.groupId;
            const tid = s.teacherId || groupToTeacherMap[gid] || (fullData.teachers.length > 0 ? fullData.teachers[0].id : null);
            if (tid && gid) {
                await firestoreDB.doc(`teachers/${tid}/groups/${gid}/students/${s.id}`).set(s, { merge: true });
                uploaded++;
            }
        }

        for (const ass of fullData.assignments) {
            const gid = ass.groupId;
            const tid = ass.teacherId || groupToTeacherMap[gid] || (fullData.teachers.length > 0 ? fullData.teachers[0].id : null);
            if (tid && gid) {
                await firestoreDB.doc(`teachers/${tid}/groups/${gid}/assignments/${ass.id}`).set(ass, { merge: true });
                uploaded++;
            }
        }

        for (const p of fullData.payments) {
            const id = p.id;
            const splitIdx = id.indexOf('_PAY_');
            if (splitIdx !== -1) {
                const gid = id.substring(0, splitIdx);
                const month = id.substring(splitIdx + 5);
                const tid = groupToTeacherMap[gid] || (fullData.teachers.length > 0 ? fullData.teachers[0].id : null);
                if (tid && gid && month) {
                    await firestoreDB.doc(`teachers/${tid}/groups/${gid}/payments/${month}`).set(p, { merge: true });
                    uploaded++;
                }
            }
        }

        alert(`✅ مبروك! تم استعادة ${uploaded} سجل بنجاح.`);
        location.reload();

    } catch (e) {
        alert("❌ فشل الاستعادة V5: " + e.message);
    } finally {
        const btn = document.getElementById('restoreBtn');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="ri-error-warning-fill"></i> زرار طوارئ: استعادة البيانات من الجهاز للسيرفر';
        }
    }
}
