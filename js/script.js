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
const DB_VERSION = 10;
let localDB = null;
const motivationQuotes = [
    "بطل اليوم.. عالم الغد! 🚀",
    "كل خطوة صغيرة بتقربك من حلمك الكبير. ✨",
    "عافر.. النجاح طعمه يستاهل. 💪",
    "مكانك في القمة محجوز، مستنيك توصله! 🏔️",
    "الذكاء مش بس وراثة، الذكاء اجتهاد وتدريب. 🧠",
    "أنت أقوى مما تخيل.. كمل طريقك.🌟"
];

// --- FIRESTORE WRAPPERS (Replacing LocalDB) ---
async function getFromDB(store, key) {
    try {
        if (store === 'teachers') {
            const doc = await firestoreDB.collection('teachers').doc(key).get();
            return doc.exists ? doc.data() : null;
        }
        if (store === 'assignments') {
            const doc = await firestoreDB.doc(`teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/assignments/${key}`).get();
            return doc.exists ? doc.data() : null;
        }
        if (store === 'groups') {
            const doc = await firestoreDB.doc(`teachers/${TEACHER_ID}/groups/${key}`).get();
            return doc.exists ? doc.data() : null;
        }
        return null;
    } catch (e) {
        console.error("getFromDB Error:", e);
        return null;
    }
}

async function putToDB(store, data) {
    // Fallback for un-migrated putToDB calls
    console.warn(`putToDB called for ${store} - using fallback firestore set`);
    if (store === 'assignments' && data.id) {
        await firestoreDB.doc(`teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/assignments/${data.id}`).set(data, { merge: true });
    } else if (store === 'groups' && data.id) {
        await firestoreDB.doc(`teachers/${TEACHER_ID}/groups/${data.id}`).set(data, { merge: true });
    }
}

async function getAllFromDB(store, idx, key) {
    try {
        if (store === 'groups') {
            const snap = await firestoreDB.collection(`teachers/${TEACHER_ID}/groups`).get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
        
        if (!SELECTED_GROUP_ID) return [];

        let path = '';
        if (store === 'students') path = `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/students`;
        else if (store === 'attendance') path = `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/dailyAttendance`;
        else if (store === 'assignments') path = `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/assignments`;
        else if (store === 'payments') path = `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/payments`;
        else if (store === 'schedules') path = `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/schedules`;
        
        if (!path) return [];
        
        const snap = await firestoreDB.collection(path).get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.error("getAllFromDB Error:", e);
        return [];
    }
}

async function putAllToDB() { /* Deprecated */ }
function addToSyncQueue() { /* Deprecated */ }
function updateSyncUI() { /* Deprecated */ }

// دالة الحفظ الصامت (بدون Loading Screen يوقف الشغل)
async function silentSave() {
    console.log("🔄 جاري الحفظ التلقائي في الخلفية...");
    await saveDailyData(true); // true دي عشان نعرف الدالة إن ده حفظ صامت
}

// ==========================================
// 5. INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        videoElement = document.getElementById('scannerVideo');
        applyLanguage();
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
    } catch (err) {
        console.error("🔥 Fatal initialization error:", err);
        // Recovery fallback: remove anti-flash class and show landing section so page is not blank
        document.documentElement.classList.remove('is-logged-in');
        const landing = document.getElementById('landingSection');
        if (landing) landing.classList.remove('hidden');
    }
});

function setupListeners() {
    document.getElementById('setTeacherButton')?.addEventListener('click', loginTeacher);
    document.getElementById('logoutButton')?.addEventListener('click', logout);

    // ✅✅ FIX: Disable student inputs by default on load
    toggleStudentInputs(false);
    setupPhoneInput('teacherPhoneInput');
    setupPhoneInput('newParentPhoneNumber');
    setupPhoneInput('profileParentPhone');
    
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn?.addEventListener('click', (e) => {
            const tab = e.currentTarget.dataset.tab;
            if (!SELECTED_GROUP_ID && tab !== 'profile') {
                showToast(translations[currentLang].selectGroupPlaceholder, 'error');
                return;
            }
            switchTab(tab);
        });
    });

    document.getElementById('saveProfileButton')?.addEventListener('click', saveProfile);
    document.getElementById('openChangePasswordBtn')?.addEventListener('click', openChangePasswordModal);
    document.getElementById('createNewGroupBtn')?.addEventListener('click', createGroup);

    const handleGroupSelectionChange = async (groupId) => {
        SELECTED_GROUP_ID = groupId;
        
        if (SELECTED_GROUP_ID) {
            setSessionItem('learnaria-gid', SELECTED_GROUP_ID);
        } else {
            removeSessionItem('learnaria-gid');
        }

        // Sync the main dropdown element
        const sel = document.getElementById('groupSelect');
        if (sel) sel.value = SELECTED_GROUP_ID || "";

        // محاولة استرجاع المبلغ المحفوظ لهذه المجموعة
        const savedAmount = localStorage.getItem(`SPOT_PAY_AMT_${SELECTED_GROUP_ID}`);
        const amountInput = document.getElementById('defaultAmountInput');

        if (amountInput) {
            amountInput.value = savedAmount || '';
        }

        checkGroupSelectionPortal();
        switchTab('overview');
        await loadGroupData();
    };
    
    window.handleGroupSelectionChange = handleGroupSelectionChange;

    document.getElementById('groupSelect')?.addEventListener('change', (e) => {
        handleGroupSelectionChange(e.target.value);
    });

    const amountInput = document.getElementById('defaultAmountInput');
    if (amountInput) {
        amountInput.addEventListener('input', (e) => {
            if (SELECTED_GROUP_ID) {
                localStorage.setItem(`SPOT_PAY_AMT_${SELECTED_GROUP_ID}`, e.target.value);
            }
        });
    }

    document.getElementById('addNewGroupButton')?.addEventListener('click', () => {
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
    document.getElementById('deleteGroupButton')?.addEventListener('click', deleteCurrentGroup);
    document.getElementById('editGroupButton')?.addEventListener('click', editCurrentGroupName);

    document.getElementById('startSmartScanBtn')?.addEventListener('click', () => startScanner('daily'));
    document.getElementById('homeworkToggle')?.addEventListener('change', (e) => {
        hasHomeworkToday = e.target.checked;
        renderDailyList();
    });
    document.getElementById('dailyDateInput')?.addEventListener('change', renderDailyList);
    document.getElementById('saveDailyBtn')?.addEventListener('click', saveDailyData);
    document.getElementById('hwYesBtn')?.addEventListener('click', () => resolveHomework(true));
    document.getElementById('hwNoBtn')?.addEventListener('click', () => resolveHomework(false));

    document.getElementById('addNewStudentButton')?.addEventListener('click', addNewStudent);
    document.getElementById('studentSearchInput')?.addEventListener('input', (e) => renderStudents(e.target.value));

    document.getElementById('addRecurringScheduleButton')?.addEventListener('click', saveRecurringSchedule);
    document.getElementById('updateSingleClassButton')?.addEventListener('click', updateSingleClass);
    document.getElementById('cancelSingleClassButton')?.addEventListener('click', cancelSingleClass);

    document.getElementById('scanPaymentsBtn')?.addEventListener('click', () => startScanner('payments'));
    document.getElementById('paymentMonthInput')?.addEventListener('change', renderPaymentsList);

    document.getElementById('addNewExamBtn')?.addEventListener('click', addNewExam);
    document.getElementById('examSelect')?.addEventListener('change', renderExamGrades);


    document.getElementById('closeScannerModal')?.addEventListener('click', stopScanner);
    document.getElementById('closeQrModal')?.addEventListener('click', () => document.getElementById('qrCodeModal').classList.add('hidden'));
    document.getElementById('printIdButton')?.addEventListener('click', () => window.print());
    document.getElementById('darkModeToggleButton')?.addEventListener('click', toggleDarkMode);
    document.getElementById('languageToggleButton')?.addEventListener('click', toggleLang);

    document.getElementById('closeMsgModal')?.addEventListener('click', () => {
        document.getElementById('messageModal').classList.add('hidden');
    });
    document.getElementById('confirmSendMsgBtn')?.addEventListener('click', sendCustomMessageAction);
    document.getElementById('shareIdBtn')?.addEventListener('click', shareCardAction);
    document.getElementById('botFileInput')?.addEventListener('change', handleBotFileUpload);
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
        const fakeEmail = `${fmt.substring(1)}@spot.com`; // e.g. 20123456789@spot.com

        try {
            // 1. محاولة تسجيل الدخول بنظام Firebase Auth المشفّر
            await firebase.auth().signInWithEmailAndPassword(fakeEmail, password);
        } catch (authErr) {
            // 2. إذا لم يكن مسجلاً في Auth بعد (نحتاج لعمل Migration له من النظام القديم)
            if (authErr.code === 'auth/user-not-found' || authErr.code === 'auth/invalid-credential') {
                if (!navigator.onLine) {
                    showToast(translations[currentLang].offlineFirstLogin || "Internet required for first login", "error");
                    throw new Error("Offline first login");
                }

                // التأكد من وجوده في الداتابيز القديمة
                const doc = await firestoreDB.collection('teachers').doc(fmt).get();
                if (!doc.exists) {
                    showToast(translations[currentLang].accountNotRegistered, "error");
                    passInput.value = '';
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                    return;
                }

                const data = doc.data();
                const storedPass = data.password ? data.password.toString().trim() : "";

                // التحقق من الباسورد القديم
                if (storedPass !== "" && storedPass !== password) {
                    showToast(translations[currentLang].wrongPassword, "error");
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                    return;
                }

                // ✅ تمت المصادقة بنجاح بالطريقة القديمة -> سنقوم بإنشاء حساب Auth مشفّر له فوراً (Seamless Migration)
                await firebase.auth().createUserWithEmailAndPassword(fakeEmail, password);

                // حفظ الباسورد لو كانت دي أول مرة يفتح الحساب (للتوافق القديم)
                if (storedPass === "" && password !== "") {
                    await firestoreDB.collection('teachers').doc(fmt).set({ password: password }, { merge: true });
                }

            } else if (authErr.code === 'auth/wrong-password') {
                showToast(translations[currentLang].wrongPassword, "error");
                btn.innerHTML = originalText;
                btn.disabled = false;
                return;
            } else {
                console.error(authErr);
                showToast("خطأ في تسجيل الدخول: " + authErr.message, "error");
                btn.innerHTML = originalText;
                btn.disabled = false;
                return;
            }
        }

        // 3. تحديث البيانات محلياً بعد نجاح الدخول
        let data = await getFromDB('teachers', fmt);
        if (!data) {
            const doc = await firestoreDB.collection('teachers').doc(fmt).get();
            if (doc.exists) {
                data = { id: doc.id, ...doc.data() };
                await putToDB('teachers', data);
            }
        }

        // 4. تسجيل الدخول ناجح
        TEACHER_ID = fmt;
        localStorage.setItem('learnaria-remember', 'true');
        localStorage.setItem('learnaria-tid', TEACHER_ID);

        document.getElementById('landingSection').classList.add('hidden');
        document.getElementById('logoutButton').classList.remove('hidden');

        if (data) {
            document.getElementById('dashboardTitle').innerText = `${translations[currentLang].welcomeTeacherGreeting}${data.name || ''}`;
            const portalWelcome = document.getElementById('portalWelcomeTeacher');
            if (portalWelcome) portalWelcome.innerText = `${translations[currentLang].welcomeTeacherGreeting}${data.name || ''} 👋`;
            
            document.getElementById('teacherNameInput').value = data.name || '';
            document.getElementById('teacherSubjectInput').value = data.subject || '';
            document.getElementById('profilePasswordInput').value = data.password || '';
        }

        await loadGroups();
        checkGroupSelectionPortal();

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
function logout() {
    localStorage.removeItem('learnaria-remember');
    removeSessionItem('learnaria-tid');
    removeSessionItem('learnaria-gid');
    removeSessionItem('learnaria-tab');
    location.reload();
}

async function loadGroups() {
    let groups = await getAllFromDB('groups', 'teacherId', TEACHER_ID);
    renderGroupsDropdown(groups);

    if (navigator.onLine) {
        // Sync in background to not block UI loading
        (async () => {
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
        })();
    }
}

function renderGroupsDropdown(groupsList) {
    const sel = document.getElementById('groupSelect');
    const currentVal = SELECTED_GROUP_ID || sel.value;
    
    const placeholderText = translations[currentLang].selectGroupPlaceholder;
    sel.innerHTML = `<option value="" disabled ${!currentVal ? 'selected' : ''}>${placeholderText}</option>`;

    groupsList.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.innerText = g.name;
        if (currentVal === g.id) opt.selected = true;
        sel.appendChild(opt);
    });

    // Populate Group Quick-Cards Grid (Launchpad Square Folder Tiles)
    const cardsContainer = document.getElementById('promptGroupCardsGrid');
    if (cardsContainer) {
        if (groupsList.length === 0) {
            cardsContainer.className = "flex flex-col items-center justify-center py-12 border-2 border-dashed border-gray-200 dark:border-zinc-800 rounded-3xl w-full col-span-full gap-3 bg-gray-50/50 dark:bg-black/10";
            const noGroupsMsg = currentLang === 'ar' ? 'لا توجد مجموعات مضافة حالياً' : 'No groups added currently';
            cardsContainer.innerHTML = `
                <i class="ri-folder-open-line text-4xl text-gray-400 dark:text-zinc-600"></i>
                <p class="text-xs font-bold text-gray-400 dark:text-zinc-500">${noGroupsMsg}</p>
            `;
        } else {
            cardsContainer.className = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 w-full col-span-full";
            
            cardsContainer.innerHTML = groupsList.map((g, idx) => {
                const enterGroupMsg = currentLang === 'ar' ? 'دخول المجموعة ←' : 'Enter Group ←';
                return `
                    <div onclick="window.handleGroupSelectionChange('${g.id}')" 
                         class="group aspect-square flex flex-col justify-between p-6 bg-white dark:bg-zinc-800/40 hover:bg-white dark:hover:bg-zinc-800 border border-gray-200/50 dark:border-zinc-800 rounded-3xl cursor-pointer transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-gray-200/50 dark:hover:shadow-black/30 active:scale-95 text-right">
                        
                        <!-- Top: Folder Icon in subtle container -->
                        <div class="w-10 h-10 rounded-xl bg-gray-100 dark:bg-zinc-700/50 text-gray-400 group-hover:text-brand group-hover:bg-brand/10 flex items-center justify-center transition-colors self-start">
                            <i class="ri-folder-shared-line text-lg"></i>
                        </div>
                        
                        <!-- Bottom: Group Title & CTA -->
                        <div>
                            <h4 class="font-black text-gray-800 dark:text-white text-base group-hover:text-brand transition-colors leading-tight truncate" title="${g.name}">${g.name}</h4>
                            <p class="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 font-bold">${enterGroupMsg}</p>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
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

    // 4. الانتقال لتابة المتابعة الذكية وتحميل البيانات
    switchTab('overview');
    await loadGroupData(); // تفعيل أزرار الإضافة (عشان لو عايز يضيف طلاب علطول)
    document.getElementById('defaultAmountInput').value = '';
    showToast(translations[currentLang].groupCreatedSuccess);
}

async function deleteCurrentGroup() {
    if (!SELECTED_GROUP_ID) {
        showToast(translations[currentLang].selectGroupFirst, 'error');
        return;
    }

    const confirmed = await showCustomConfirm(translations[currentLang].deleteGroupConfirm, '', 'ri-delete-bin-line');
    if (!confirmed) return;

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

        SELECTED_GROUP_ID = null;
        removeSessionItem('learnaria-gid');
        document.getElementById('groupSelect').value = "";

        // إعادة تحميل المجموعات
        await loadGroups();

        checkGroupSelectionPortal();

    } catch (e) {
        console.error("Error deleting group:", e);
        showToast("Error during delete", 'error');
    }
}

async function editCurrentGroupName() {
    if (!SELECTED_GROUP_ID) {
        showToast(translations[currentLang].selectGroupFirst, 'error');
        return;
    }

    // جلب الاسم الحالي
    const currentGroup = await getFromDB('groups', SELECTED_GROUP_ID);
    if (!currentGroup) return;

    const newName = await showCustomPrompt(
        translations[currentLang].editGroupNameTitle,
        translations[currentLang].enterNewGroupName,
        currentGroup.name,
        'ri-group-line'
    );

    if (newName && newName.trim() !== "" && newName !== currentGroup.name) {
        try {
            const updatedName = newName.trim();

            // 1. تحديث في الداتابيز المحلية
            currentGroup.name = updatedName;
            await putToDB('groups', currentGroup);

            // 2. إرسال التحديث للسيرفر
            await addToSyncQueue({
                type: 'update',
                path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}`,
                id: SELECTED_GROUP_ID,
                data: { name: updatedName }
            });

            // 3. تحديث الواجهة
            await loadGroups(); // عشان الدروب داون يتحدث بالاسم الجديد
            document.getElementById('groupSelect').value = SELECTED_GROUP_ID;

            showToast(translations[currentLang].groupUpdatedSuccess);
        } catch (e) {
            console.error("Error updating group name:", e);
            showToast("Error updating name", 'error');
        }
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

    // جلب الطلاب مباشرة من Firebase (سيعتمد على الكاش تلقائياً بفضل Offline Persistence)
    try {
        const snap = await firestoreDB.collection(`teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/students`).get();
        allStudents = snap.docs.map(d => ({ id: d.id, groupId: SELECTED_GROUP_ID, ...d.data() }));
        refreshCurrentTab();
    } catch (error) {
        console.error("Error loading students:", error);
    }

    renderOverview();
    
    // تشغيل فحص مزامنة تفعيل الإشعارات في الخلفية بالتوازي
    syncGroupNotificationStatus();
}

async function syncGroupNotificationStatus() {
    if (!SELECTED_GROUP_ID || !TEACHER_ID || !navigator.onLine) return;
    
    // تصفية الطلاب الذين لديهم رقم هاتف ولكن ليس لديهم توكن إشعارات مسجل في حقل الطالب
    const pendingStudents = allStudents.filter(s => !s.parentFcmToken && s.parentPhoneNumber);
    if (pendingStudents.length === 0) return;
    
    let updatedAny = false;
    
    // تشغيل الفحوصات بالتوازي بدلاً من تشغيلها واحداً تلو الآخر لتجنب قفل الواجهة البرمجية والبطء
    await Promise.all(pendingStudents.map(async (student) => {
        const cleanPhone = student.parentPhoneNumber.trim();
        if (!cleanPhone) return;
        
        let token = null;
        try {
            // 1. الفحص في كولكشن parents
            const parentDoc = await firestoreDB.collection('parents').doc(cleanPhone).get();
            if (parentDoc.exists && parentDoc.data().fcmToken) {
                token = parentDoc.data().fcmToken;
            }
            
            // 2. الفحص في كولكشن users (تطبيق الموبايل)
            if (!token) {
                const userQuery = await firestoreDB.collection('users')
                    .where('phoneNumber', '==', cleanPhone)
                    .limit(1)
                    .get();
                if (!userQuery.empty && userQuery.docs[0].data().fcmToken) {
                    token = userQuery.docs[0].data().fcmToken;
                }
            }
            
            if (token) {
                // تحديث مستند الطالب في الفايربيس بالتوكن الجديد
                const studentRef = `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/students/${student.id}`;
                await addToSyncQueue({
                    type: 'update',
                    path: studentRef,
                    data: { parentFcmToken: token }
                });
                
                // تحديث البيانات محلياً وفي قاعدة البيانات المحلية
                student.parentFcmToken = token;
                await putToDB('students', student);
                updatedAny = true;
            }
        } catch (e) {
            console.error("Error syncing notification status for student: " + student.id, e);
        }
    }));
    
    if (updatedAny) {
        // إعادة رندرة الطلاب لتحديث لون الجرس إلى الأخضر فوراً
        renderStudents();
        if (typeof renderOverview === 'function') renderOverview();
    }
}

// ✅ دالة حفظ الطلاب للـ Cache في الخلفية
async function saveStudentsToLocalDB(students) {
    try {
        await putAllToDB('students', students);
    } catch (e) { console.error("Cache update failed", e); }
}

// ✅ RENDER OVERVIEW (COMMAND CENTER)
async function renderOverview() {
    if (!SELECTED_GROUP_ID) return;

    // Show Skeletons
    const topList = document.getElementById('topPerformersList');
    const riskList = document.getElementById('atRiskStudentsList');
    if (topList) topList.innerHTML = '<div class="skeleton-row h-12 w-full"></div><div class="skeleton-row h-12 w-full"></div><div class="skeleton-row h-12 w-full"></div>';
    if (riskList) riskList.innerHTML = '<div class="skeleton-row h-12 w-full"></div><div class="skeleton-row h-12 w-full"></div>';

    try {
        // 1. Top Performers (from last real exam)
        const allAssignments = await getAllFromDB('assignments', 'groupId', SELECTED_GROUP_ID);
        if (allAssignments && allAssignments.length > 0) {
            // Filter only EXAMS (not daily homework or anything starting with "واجب")
            const exams = allAssignments.filter(e =>
                (e.type === 'exam' || !e.type) &&
                !e.name.includes("واجب") &&
                e.scores && Object.keys(e.scores).length > 0
            ).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

            if (exams.length > 0) {
                const lastExam = exams[0]; // Get the LATEST one
                const scores = lastExam.scores || {};

                // Map scores to student names
                const studentScores = Object.entries(scores).map(([sid, val]) => {
                    const student = allStudents.find(s => s.id === sid);
                    const markValue = (val && typeof val === 'object') ? (val.score || 0) : val;
                    const defaultLoadingText = currentLang === 'ar' ? 'جاري التحميل...' : 'Loading...';
                    const defaultDeletedText = currentLang === 'ar' ? 'طالب محذوف' : 'Deleted student';
                    return { name: student ? student.name : (allStudents.length === 0 ? defaultLoadingText : defaultDeletedText), mark: parseInt(markValue) || 0 };
                });

                if (studentScores.length > 0) {
                    const sortedGrades = studentScores.sort((a, b) => b.mark - a.mark).slice(0, 3);
                    topList.innerHTML = sortedGrades.map((g, idx) => `
                        <div class="flex items-center gap-3 p-3 bg-white dark:bg-black/20 rounded-xl border border-gray-100 dark:border-gray-800 animate-fade-in" style="animation-delay: ${idx * 0.1}s">
                            <div class="w-8 h-8 rounded-full flex items-center justify-center font-black ${idx === 0 ? 'bg-yellow-400 text-black' : (idx === 1 ? 'bg-gray-200 text-gray-700' : 'bg-orange-200 text-orange-800 font-bold')}">
                                ${idx + 1}
                            </div>
                            <div class="flex-1 text-right truncate">
                                <p class="text-sm font-black text-gray-800 dark:text-white truncate">${g.name}</p>
                                <p class="text-[10px] text-gray-500 font-bold">${lastExam.name}</p>
                            </div>
                            <div class="text-left">
                                <span class="text-sm font-black text-brand">${g.mark}</span>
                                <span class="text-[10px] text-gray-400">/${lastExam.totalMark || 30}</span>
                            </div>
                        </div>
                    `).join('');
                } else {
                    const noGradesMsg = currentLang === 'ar' ? 'لم تُرصد درجات لآخر امتحان' : 'No grades recorded for the latest exam';
                    topList.innerHTML = `<p class="text-xs text-gray-400 text-center py-6 font-bold">${noGradesMsg}</p>`;
                }
            } else {
                const noExamsMsg = currentLang === 'ar' ? 'لم يتم إنشاء امتحانات بعد' : 'No exams created yet';
                topList.innerHTML = `<p class="text-xs text-gray-400 text-center py-6 font-bold">${noExamsMsg}</p>`;
            }
        } else {
            const noDataMsg = currentLang === 'ar' ? 'لا توجد بيانات' : 'No data available';
            topList.innerHTML = `<p class="text-xs text-gray-400 text-center py-6 font-bold tracking-widest uppercase">${noDataMsg}</p>`;
        }

        // 4. Monthly Collection Summary
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
        const monthPayments = await getFromDB('payments', `${SELECTED_GROUP_ID}_PAY_${currentMonth}`);
        const records = monthPayments?.records || [];
        // ✅ إصلاح: حساب الطلاب الحاليين فقط وتصحيح استخراج حالة الدفع من مصفوفة records
        const paidCount = allStudents.filter(s => {
            if (!s || !s.id) return false;
            const record = records.find(r => r.studentId === s.id);
            return record && record.paid === true;
        }).length;
        const unpaidCount = Math.max(0, allStudents.length - paidCount);

        const paidCountEl = document.getElementById('paidCountOverview');
        const unpaidCountEl = document.getElementById('unpaidCountOverview');
        if (paidCountEl) paidCountEl.innerText = paidCount;
        if (unpaidCountEl) unpaidCountEl.innerText = unpaidCount;

        // 5. Group Performance Chart (Progress over time)
        const chartContainer = document.getElementById('groupPerformanceChartContainer');
        if (allAssignments && allAssignments.length > 0) {
            const chartExams = allAssignments.filter(e =>
                (e.type === 'exam' || !e.type) &&
                !e.name.includes("واجب") &&
                e.scores && Object.keys(e.scores).length > 0
            ).sort((a, b) => new Date(a.date) - new Date(b.date));

            if (chartExams.length > 0) {
                if (chartContainer) {
                    chartContainer.innerHTML = '<canvas id="groupPerformanceGlobalChart"></canvas>';
                }
                const labels = chartExams.map(e => e.name);
                const dataPoints = chartExams.map(e => {
                    const examScores = e.scores || {};
                    // ✅ إصلاح: حساب متوسط درجات الطلاب الحاليين فقط بالمجموعة
                    const currentStudentScores = allStudents
                        .filter(s => s && s.id)
                        .map(s => examScores[s.id])
                        .filter(v => v !== undefined && v !== null && v !== "");

                    if (currentStudentScores.length === 0) return 0;
                    
                    const sum = currentStudentScores.reduce((acc, scoreObj) => {
                        const markVal = (scoreObj && typeof scoreObj === 'object') ? (scoreObj.score || 0) : scoreObj;
                        return acc + (parseFloat(markVal) || 0);
                    }, 0);
                    
                    return Math.round((sum / (currentStudentScores.length * (parseFloat(e.totalMark) || 30))) * 100);
                });

                // ✅ إصلاح: إذا كان هناك امتحان واحد فقط، نضيف نقطة بداية لتشكيل منحنى بدلاً من نقطة واحدة
                if (chartExams.length === 1) {
                    labels.unshift(currentLang === 'ar' ? 'البداية' : 'Start');
                    dataPoints.unshift(0);
                }

                renderGroupPerformanceChart(labels, dataPoints);
            } else {
                if (chartContainer) {
                    const notEnoughExamsMsg = currentLang === 'ar' ? 'لا توجد امتحانات كافية للتحليل' : 'Not enough exams for analysis';
                    chartContainer.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-gray-400 text-sm font-bold opacity-60"><i class="ri-bar-chart-box-line text-4xl mb-2"></i> ${notEnoughExamsMsg}</div>`;
                }
            }
        } else {
            const noDataMsg = currentLang === 'ar' ? 'لا توجد بيانات' : 'No data available';
            if (chartContainer) {
                chartContainer.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-gray-400 text-sm font-bold opacity-60"><i class="ri-bar-chart-box-line text-4xl mb-2"></i> ${noDataMsg}</div>`;
            }
        }

        // 2. Students at Risk (Absence Trend) & 3. Attendance Rate
        const attendance = await getAllFromDB('attendance', 'groupId', SELECTED_GROUP_ID);
        if (attendance && attendance.length > 0) {
            // Get last 3 session dates
            const sortedAttendance = attendance.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 3);
            const riskStudents = [];

            let totalChecked = 0;
            let totalPresent = 0;

            allStudents.forEach(student => {
                let absentCount = 0;
                let studentSessionCount = 0;

                sortedAttendance.forEach(session => {
                    const record = session.records?.find(r => r.studentId === student.id);
                    if (record) {
                        studentSessionCount++;
                        if (record.status === 'absent') absentCount++;
                        if (record.status === 'present') totalPresent++;
                        totalChecked++;
                    }
                });

                if (studentSessionCount >= 2 && absentCount >= studentSessionCount / 2) {
                    riskStudents.push({ name: student.name, count: absentCount });
                }
            });

            if (riskStudents.length > 0) {
                riskList.innerHTML = riskStudents.sort((a, b) => b.count - a.count).slice(0, 5).map((s, idx) => {
                    const absentText = currentLang === 'ar' ? `غاب ${s.count} حصص` : `Absent ${s.count} classes`;
                    return `
                        <div class="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/30 animate-fade-in" style="animation-delay: ${idx * 0.1}s">
                            <p class="text-sm font-black text-gray-800 dark:text-white truncate max-w-[150px] text-right">${s.name}</p>
                            <span class="text-[10px] font-black bg-red-500 text-white px-2 py-0.5 rounded-lg flex items-center gap-1 shrink-0">
                                ${absentText}
                            </span>
                        </div>
                    `;
                }).join('');
            } else {
                const allCommittedMsg = currentLang === 'ar' ? 'الكل ملتزم بالحضور!' : 'Everyone is committed to attending!';
                riskList.innerHTML = `<div class="text-center py-6"><i class="ri-checkbox-circle-fill text-green-500 text-2xl"></i><p class="text-xs text-green-600 font-bold mt-1">${allCommittedMsg}</p></div>`;
            }

            const rate = totalChecked > 0 ? Math.round((totalPresent / totalChecked) * 100) : 0;
            const rateEl = document.getElementById('avgAttendanceRate');
            if (rateEl) {
                rateEl.innerText = rate + '%';
                // تلوين النسبة حسب القيمة
                rateEl.className = "text-5xl font-black tracking-tighter " + (rate < 50 ? 'text-red-500' : (rate < 80 ? 'text-yellow-500' : 'text-green-500'));
            }
        }
    } catch (e) { console.error("Overview error:", e); }
}

let groupPerfChartInstance = null;
function renderGroupPerformanceChart(labels, data) {
    const ctx = document.getElementById('groupPerformanceGlobalChart');
    if (!ctx) return;

    if (groupPerfChartInstance) groupPerfChartInstance.destroy();

    const isDark = document.body.classList.contains('dark-mode');
    const color = isDark ? '#9ca3af' : '#6b7280';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

    groupPerfChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: currentLang === 'ar' ? 'متوسط الأداء %' : 'Average Performance %',
                data: data,
                borderColor: '#F2CE5A',
                backgroundColor: 'rgba(242, 206, 90, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#F2CE5A'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: isDark ? '#1f2937' : '#ffffff',
                    titleColor: isDark ? '#ffffff' : '#111827',
                    bodyColor: isDark ? '#d1d5db' : '#374151',
                    borderColor: '#F2CE5A',
                    borderWidth: 1,
                    callbacks: {
                        label: function (context) {
                            return (currentLang === 'ar' ? 'متوسط المستوى: ' : 'Average Level: ') + context.parsed.y + '%';
                        }
                    }
                }
            },
            scales: {
                y: {
                    min: 0,
                    max: 100,
                    ticks: { color: color, callback: v => v + '%' },
                    grid: { color: gridColor }
                },
                x: {
                    ticks: { color: color },
                    grid: { display: false }
                }
            }
        }
    });
}

// ✅ CELEBRATION LOGIC (Fireworks for Full Marks)
function showCelebration() {
    const overlay = document.getElementById('celebrationOverlay');
    const container = document.getElementById('lottieContainer');
    if (!overlay || !container || typeof lottie === 'undefined') return;

    overlay.classList.remove('hidden');
    container.innerHTML = '';

    const anim = lottie.loadAnimation({
        container: container,
        renderer: 'svg',
        loop: false,
        autoplay: true,
        path: 'https://assets5.lottiefiles.com/packages/lf20_myejioos.json'
    });

    anim.onComplete = () => {
        setTimeout(() => {
            overlay.classList.add('hidden');
            anim.destroy();
        }, 500);
    };
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
    
    const targetEl = document.getElementById(`tab-${tabId}`);
    if (targetEl) targetEl.classList.remove('hidden');
    
    const btn = document.querySelector(`.tab-button[data-tab="${tabId}"]`);
    if (btn) btn.classList.add('active');

    setSessionItem('learnaria-tab', tabId);

    if (!SELECTED_GROUP_ID && tabId !== 'profile') {
        return; // Don't fetch data if no group is selected
    }

    if (tabId === 'overview') renderOverview();

    if (tabId === 'daily') {
        const dailyInput = document.getElementById('dailyDateInput');
        if (dailyInput) {
            dailyInput.valueAsDate = new Date();
        }
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
    try {
        const dateInput = document.getElementById('dailyDateInput');
        if (dateInput && !dateInput.value) {
            dateInput.valueAsDate = new Date();
        }
        const date = dateInput ? dateInput.value : new Date().toISOString().slice(0, 10);
        const list = document.getElementById('dailyStudentsList');
        list.innerHTML = '';

        // تحديث عناوين الجدول
        const hStudent = document.getElementById('headerStudent');
        const hAtt = document.getElementById('headerAttendance');
        const hHw = document.getElementById('headerHomework');

        if (hStudent) hStudent.innerText = translations[currentLang].tableHeaderStudent;
        if (hAtt) hAtt.innerText = translations[currentLang].tableHeaderAttendance;
        if (hHw) hHw.innerText = translations[currentLang].tableHeaderHomework;

        if (hasHomeworkToday) {
            if (hStudent) hStudent.className = "col-span-6 transition-all duration-300";
            if (hAtt) hAtt.className = "col-span-3 text-center transition-all duration-300";
            if (hHw) hHw.classList.remove('hidden');
        } else {
            if (hStudent) hStudent.className = "col-span-8 transition-all duration-300";
            if (hAtt) hAtt.className = "col-span-4 text-center transition-all duration-300";
            if (hHw) hHw.classList.add('hidden');
        }

        if (!allStudents || !allStudents.length) {
            list.innerHTML = `<p class="text-center text-gray-500 py-4">${translations[currentLang].noStudentsInGroup}</p>`;
            return;
        }

        // جلب البيانات المخزنة بشكل آمن ومحمي
        let attDoc = null;
        let hwDoc = null;
        try {
            const attId = `${SELECTED_GROUP_ID}_${date}`;
            const hwId = `${SELECTED_GROUP_ID}_HW_${date}`;
            const results = await Promise.all([
                getFromDB('attendance', attId).catch(err => { console.warn("Failed fetching att:", err); return null; }),
                getFromDB('assignments', hwId).catch(err => { console.warn("Failed fetching hw:", err); return null; })
            ]);
            attDoc = results[0];
            hwDoc = results[1];
        } catch (dbErr) {
            console.error("Database fetch failed in daily list:", dbErr);
        }

        const attMap = {};
        if (attDoc?.records) attDoc.records.forEach(r => { if (r) attMap[r.studentId] = r.status; });

        const hwMap = {};
        if (hwDoc?.scores) {
            Object.entries(hwDoc.scores).forEach(([sid, val]) => {
                hwMap[sid] = (val && typeof val === 'object') ? val.submitted : false;
            });
            // تفعيل الواجب تلقائياً لو فيه داتا محفوظة
            if (!hasHomeworkToday) {
                hasHomeworkToday = true;
                const hwToggle = document.getElementById('homeworkToggle');
                if (hwToggle) hwToggle.checked = true;
                if (hStudent) hStudent.className = "col-span-6 transition-all duration-300";
                if (hAtt) hAtt.className = "col-span-3 text-center transition-all duration-300";
                if (hHw) hHw.classList.remove('hidden');
            }
        }

        let presentCount = 0;
        const fragment = document.createDocumentFragment();

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
            row.className = `daily-student-row grid grid-cols-12 items-center p-3 rounded-lg border transition-colors mb-1 cursor-pointer ${status === 'present'
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
                <div class="col-span-3 flex justify-center">
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
                clearTimeout(saveTimeout);
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
            fragment.appendChild(row);
        });

        list.appendChild(fragment);

        // دالة صغيرة لتحديث العداد
        function updateAttendanceCount() {
            const count = document.querySelectorAll('.att-select option[value="present"]:checked').length;
            document.getElementById('attendanceCountBadge').innerText = `${count}/${allStudents.length}`;
        }

        updateAttendanceCount(); // تشغيل العداد أول مرة
    } catch (error) {
        console.error("Error rendering daily class list:", error);
    }
}

// 📈 دالة الرسوم البيانية للمجموعة (جديد)
async function updateGroupAnalyticsChart() {
    const attCtx = document.getElementById('groupAttendanceChart');
    const hwCtx = document.getElementById('groupHomeworkChart');

    if (!attCtx || !hwCtx || !SELECTED_GROUP_ID || !TEACHER_ID) return;

    try {
        console.log("📊 Fetching analytics for Group:", SELECTED_GROUP_ID);

        // استخدام localDB للحصول على التحديثات الفورية حتى لو الإنترنت مقطوع أو الـ Sync متأخر
        const [attSnap, hwSnap] = await Promise.all([
            firestoreDB.collection(`teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/dailyAttendance`).limit(60).get().catch(() => ({ docs: [] })),
            firestoreDB.collection(`teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/assignments`).limit(60).get().catch(() => ({ docs: [] }))
        ]);
        const filteredAttRaw = attSnap.docs.map(d => d.data());
        const filteredHwRaw = hwSnap.docs.map(d => d.data());

        // --- أ. معالجة الحضور ---
        let attLabels = ["-", "-", "-", "-", "-", "-", "-"];
        let attData = [0, 0, 0, 0, 0, 0, 0];

        const filteredAtt = filteredAttRaw
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

        if (window.groupAnalyticsChartInstance) window.groupAnalyticsChartInstance.destroy();
        window.groupAnalyticsChartInstance = renderBarChart(attCtx, attLabels, attData, 'الحضور %', 'rgba(242, 206, 90, 0.7)', '#F2CE5A');

        // --- ب. معالجة الواجبات (فلترة يدوية لتجنب الـ Index) ---
        let hwLabels = ["-", "-", "-", "-", "-", "-", "-"];
        let hwData = [0, 0, 0, 0, 0, 0, 0];

        const filteredHw = filteredHwRaw
            .filter(d => d.type === 'daily' && d.date)
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

                promises.push(
                    firestoreDB.collection(`teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/dailyAttendance`)
                        .doc(date).set({ date, records: attendanceRecords }, { merge: true })
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

                console.log("📝 Saving homework to Firestore:", hwId);

                promises.push(
                    firestoreDB.collection(`teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/assignments`)
                        .doc(hwId).set(hwData, { merge: true })
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
            // ✅ تحديث الرسم البياني بعد الحفظ ليعكس التغييرات فوراً
            if (document.getElementById('tab-daily') && !document.getElementById('tab-daily').classList.contains('hidden')) {
                updateGroupAnalyticsChart();
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

    const matchPhone = (dbPhone, qrVal) => {
        if (!dbPhone) return false;
        return dbPhone.trim().replace(/^\+2/, '') === qrVal.trim().replace(/^\+2/, '');
    };

    // 1. البحث في المجموعة الحالية (الأولوية)
    const matchedStudents = allStudents.filter(s =>
        matchPhone(s.parentPhoneNumber, qrCode) ||
        s.id === qrCode
    );

    // 🛑 الحالة: الطالب مش في المجموعة دي (Cross-Group Logic)
    if (matchedStudents.length === 0) {

        isScannerPaused = true; // إيقاف الكاميرا مؤقتاً

        try {
            // بحث شامل في كل الطلاب (Global Search)
            const allLocalStudents = await getAllFromDB('students');
            const globalMatch = allLocalStudents.find(s =>
                matchPhone(s.parentPhoneNumber, qrCode) ||
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
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-10 opacity-40 animate-fade-in text-center">
                <i class="ri-user-search-line text-6xl mb-2 text-gray-400"></i>
                <p class="font-black text-gray-500 tracking-widest uppercase text-xs">لم يتم العثور على طلاب</p>
                <p class="text-[10px] text-gray-400 mt-1">ابدأ بإضافة أول بطل لمجموعتك من الأسفل ✨</p>
            </div>
        `;
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
                <div class="flex items-center gap-2">
                    <p class="font-bold text-gray-800 dark:text-white"> ${s.name}</p>
                    <i class="ri-notification-3-fill ${s.parentFcmToken ? 'text-green-500' : 'text-red-500'}" title="${s.parentFcmToken ? 'الإشعارات مفعلة' : 'الإشعارات لسه مش مفعلة'}"></i>
                </div>
                <p class="text-xs text-gray-500">${s.parentPhoneNumber ? (s.parentPhoneNumber.startsWith('+2') ? s.parentPhoneNumber.substring(2) : s.parentPhoneNumber) : ''}</p>
            </div>
            <div class="flex gap-2">
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
                        title: 'الناظر - بطاقة الطالب',
                        text: 'بطاقة الطالب الرقمية - منصة الناظر التعليمية'
                    });
                } catch (err) {
                    if (err.name !== 'AbortError') console.error(err);
                }
            } else {
                const link = document.createElement('a');
                link.download = `Nazer_ID_${Date.now()}.png`;
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
    let phone = phoneInput.value.trim();
    if (phone) {
        if (phone.startsWith('01') && phone.length === 11) {
            phone = '+2' + phone;
        } else if (!phone.startsWith('+')) {
            phone = '+2' + phone;
        }
    }
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
    const confirmed = await showCustomConfirm(translations[currentLang].confirmDelete, '', 'ri-user-unfollow-line');
    if (!confirmed) return;
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
            if (parseInt(e.target.value) === currentTotal && currentTotal > 0) {
                showCelebration();
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
    if (!name) return;
    
    firestoreDB.collection('teachers').doc(TEACHER_ID).set({ name, subject }, { merge: true })
        .then(() => {
            document.getElementById('dashboardTitle').innerText = `${translations[currentLang].welcomeTeacherGreeting}${name}`;
            showToast(translations[currentLang].saved);
        })
        .catch(e => console.error("Error saving profile", e));
}

function openChangePasswordModal() {
    document.getElementById('currentPasswordInput').value = '';
    document.getElementById('newPasswordInput').value = '';
    document.getElementById('confirmNewPasswordInput').value = '';
    document.getElementById('changePasswordModal').classList.remove('hidden');
    document.getElementById('changePasswordModal').classList.add('flex');
}

function closeChangePasswordModal() {
    document.getElementById('changePasswordModal').classList.add('hidden');
    document.getElementById('changePasswordModal').classList.remove('flex');
}

async function handleChangePassword() {
    const currentPassword = document.getElementById('currentPasswordInput').value;
    const newPassword = document.getElementById('newPasswordInput').value;
    const confirmPassword = document.getElementById('confirmNewPasswordInput').value;

    if (!currentPassword || !newPassword || !confirmPassword) {
        showToast("يرجى ملء جميع الحقول", "error");
        return;
    }

    if (newPassword !== confirmPassword) {
        showToast("كلمة المرور الجديدة غير متطابقة", "error");
        return;
    }

    if (newPassword.length < 6) {
        showToast("كلمة المرور يجب أن تكون 6 أحرف على الأقل", "error");
        return;
    }

    try {
        const btn = document.querySelector('#changePasswordModal button[onclick="handleChangePassword()"]');
        const oldText = btn.innerText;
        btn.innerHTML = '<i class="ri-loader-4-line animate-spin"></i>';
        btn.disabled = true;

        // 1. Re-authenticate with a fresh sign-in to ensure Firebase Auth session is active
        const email = `2${TEACHER_ID.substring(1)}@spot.com`;
        let userCredential;
        try {
            userCredential = await firebase.auth().signInWithEmailAndPassword(email, currentPassword);
        } catch (signInErr) {
            throw { code: 'auth/wrong-password' };
        }
        
        const user = userCredential.user;

        // 2. Update Password in Firebase Auth
        await user.updatePassword(newPassword);

        // 3. Update Password in Firestore (for backward compatibility)
        await firestoreDB.collection('teachers').doc(TEACHER_ID).set({ password: newPassword }, { merge: true });

        showToast("تم تغيير كلمة المرور بنجاح 🔒", "success");
        closeChangePasswordModal();

        btn.innerText = oldText;
        btn.disabled = false;

    } catch (error) {
        console.error("Change Password Error:", error);
        const btn = document.querySelector('#changePasswordModal button[onclick="handleChangePassword()"]');
        btn.innerText = "تأكيد وتغيير";
        btn.disabled = false;
        
        if (error.code === 'auth/wrong-password') {
            showToast("كلمة المرور الحالية غير صحيحة", "error");
        } else if (error.code === 'auth/too-many-requests') {
            showToast("محاولات كثيرة خاطئة، يرجى المحاولة لاحقاً", "error");
        } else {
            showToast("حدث خطأ أثناء تغيير كلمة المرور", "error");
        }
    }
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
    const storedID = getSessionItem('learnaria-tid');

    if (storedID) {
        // لو لقينا ID، نرجعه للمتغير ونخفي شاشة الدخول فوراً
        TEACHER_ID = storedID;
        document.getElementById('landingSection').classList.add('hidden');
        document.getElementById('logoutButton').classList.remove('hidden');

        // محاولة جلب بيانات المعلم من الداتابيز المحلية لتعبئة البروفايل
        let teacherData = null;
        try {
            teacherData = await getFromDB('teachers', TEACHER_ID);
            if (teacherData) {
                document.getElementById('dashboardTitle').innerText = `${translations[currentLang].welcomeTeacherGreeting}${teacherData.name || ''}`;
                document.getElementById('teacherNameInput').value = teacherData.name || '';
                document.getElementById('teacherSubjectInput').value = teacherData.subject || '';
                document.getElementById('profilePasswordInput').value = teacherData.password || '';
            }
        } catch (e) { console.log("Auto-login fetch error:", e); }

        if (teacherData) {
            const portalWelcome = document.getElementById('portalWelcomeTeacher');
            if (portalWelcome) portalWelcome.innerText = `${translations[currentLang].welcomeTeacherGreeting}${teacherData.name || ''} 👋`;
        }

        // تحميل المجموعات والذهاب للمتابعة الذكية
        await loadGroups();
        
        // استرجاع المجموعة الحالية والتبويب المفتوح
        const savedGroupId = getSessionItem('learnaria-gid');
        if (savedGroupId) {
            SELECTED_GROUP_ID = savedGroupId;
            
            // Sync main dropdown
            const sel = document.getElementById('groupSelect');
            if (sel) sel.value = SELECTED_GROUP_ID;

            // Load data for this group
            await loadGroupData();

            // Restore last active tab
            const savedTabId = getSessionItem('learnaria-tab');
            if (savedTabId) {
                switchTab(savedTabId);
            } else {
                switchTab('overview');
            }
            checkGroupSelectionPortal();
        } else {
            checkGroupSelectionPortal();
        }

        if (SELECTED_GROUP_ID) {
            const savedAmount = localStorage.getItem(`SPOT_PAY_AMT_${SELECTED_GROUP_ID}`);
            const amountInput = document.getElementById('defaultAmountInput');
            if (amountInput && savedAmount) {
                amountInput.value = savedAmount;
            }
        }
    }
}
function applyLanguage() {
    document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
    const langBtn = document.getElementById('languageToggleButton');
    if (langBtn) langBtn.innerText = currentLang === 'ar' ? 'EN' : 'ع';

    document.querySelectorAll('[data-key]').forEach(el => {
        const key = el.dataset.key;
        if (translations[currentLang][key]) {
            el.innerHTML = translations[currentLang][key];
        }
    });

    document.querySelectorAll('[data-key-placeholder]').forEach(el => {
        const key = el.dataset.keyPlaceholder;
        if (translations[currentLang][key]) el.placeholder = translations[currentLang][key];
    });

    // Update dynamic welcome greetings with the teacher's name
    const nameInput = document.getElementById('teacherNameInput');
    if (nameInput && nameInput.value) {
        const titleEl = document.getElementById('dashboardTitle');
        if (titleEl) titleEl.innerText = `${translations[currentLang].welcomeTeacherGreeting}${nameInput.value}`;
        const portalWelcome = document.getElementById('portalWelcomeTeacher');
        if (portalWelcome) portalWelcome.innerText = `${translations[currentLang].welcomeTeacherGreeting}${nameInput.value} 👋`;
    }

    updateOnlineStatus();
}

function toggleLang() {
    currentLang = currentLang === 'ar' ? 'en' : 'ar';
    applyLanguage();

    if (SELECTED_GROUP_ID && !document.getElementById('tab-overview').classList.contains('hidden')) renderOverview();
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

        // Clean WhatsApp/country code formatting
        let normalized = val.replace(/[\s\-\(\)]/g, ''); // Remove spaces, dashes, parens
        
        if (normalized.startsWith('+201')) {
            normalized = '01' + normalized.substring(4);
        } else if (normalized.startsWith('201') && normalized.length >= 12) {
            normalized = '01' + normalized.substring(3);
        } else if (normalized.startsWith('00201') && normalized.length >= 14) {
            normalized = '01' + normalized.substring(5);
        }

        val = normalized.replace(/\D/g, '');

        if (val.length > 11) {
            val = val.slice(0, 11);
        }

        this.value = val;
    });

    input.removeAttribute("maxLength");
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

    let prompt = `من فضلك اعمل لي امتحان احترافي جداً لملف (${currentExamFile}) بالمواصفات دي:
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
        input.value = `من فضلك اعمل لي ${type} احترافي جداً من ملف (${fileName})`;
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
        const chatFn = firebase.functions().httpsCallable('chatWithSpot');
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
function addMessageToUI(text, sender, type) {
    const container = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = "mb-6 animate-fade-in-up w-full";

    // رسالة المستخدم
    if (sender === 'user') {
        div.innerHTML = `
            <div class="flex justify-end items-end gap-2">
                <div class="bg-gradient-to-tr from-yellow-500 to-yellow-600 text-black px-5 py-3 rounded-2xl rounded-tr-none font-bold text-sm shadow-md max-w-[85%] break-words whitespace-pre-wrap">
                    ${text}
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

        if (examData && examData.isExam) {
            div.innerHTML = `
                <div class="flex gap-3 justify-start items-start w-full">
                    <div class="w-10 h-10 bg-yellow-50 dark:bg-yellow-900/30 rounded-full flex items-center justify-center flex-shrink-0 text-yellow-600 shadow">
                        <i class="ri-file-list-3-fill text-xl"></i>
                    </div>
                    <div class="bg-white dark:bg-zinc-900 border-2 border-yellow-400 rounded-2xl rounded-tl-none w-full md:max-w-[90%] shadow-xl overflow-hidden">
                        <div class="bg-gradient-to-r from-yellow-500 to-yellow-400 px-5 py-4">
                            <h3 class="font-black text-xl text-black">${examData.title || 'امتحان'}</h3>
                            <div class="flex gap-4 mt-1 text-black/70 text-xs font-semibold">
                                <span><i class="ri-question-line"></i> ${examData.questions?.length || 0} سؤال</span>
                                ${examData.difficulty ? `<span class="bg-black/20 px-2 py-0.5 rounded uppercase tracking-wider"><i class="ri-pulse-line"></i> ${examData.difficulty}</span>` : ''}
                                ${examData.totalMarks ? `<span><i class="ri-award-line"></i> ${examData.totalMarks} درجة</span>` : ''}
                                ${examData.duration ? `<span><i class="ri-time-line"></i> ${examData.duration}</span>` : ''}
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
                            ${text.substring(0, 500).replace(/</g, '&lt;')}${text.length > 500 ? '...' : ''}
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
                ${displayText}
            </div>
        </div>`;

    container.appendChild(div);
    scrollToBottom();
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
                <div class="q-text">${q.q || ''}</div>
                ${q.diagram ? `<div class="diagram-box">${q.diagram}</div>` : ''}
                ${q.type === 'mcq' && q.options ? `
                    <div class="mcq-grid">
                        ${q.options.map((opt, j) => `
                            <div class="opt-row">
                                <span class="opt-char">${getOptionLabel(j)}</span>
                                <span>${opt}</span>
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
    <title>${examData.title || 'امتحان'}</title>
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
        * { box-sizing: border-box; }
        body {
            font-family: 'Cairo', 'Amiri', sans-serif;
            direction: rtl; text-align: right;
            padding: 30px 40px; max-width: 900px; margin: 0 auto;
            background: #fff; color: #111;
        }
        mjx-container { direction: ltr !important; display: inline-block !important; }
        .exam-header { text-align: center; border-bottom: 3px double #1a1a2e; padding-bottom: 20px; margin-bottom: 35px; }
        .exam-title { font-family: 'Amiri', serif; font-size: 30px; font-weight: 900; color: #1a1a2e; margin-bottom: 8px; }
        .exam-meta { display: flex; justify-content: space-between; font-size: 15px; font-weight: 700; color: #555; flex-wrap: wrap; gap: 5px; }
        .student-info { display: flex; justify-content: space-between; font-size: 17px; font-weight: 700; margin-top: 15px; }
        .field-line { border-bottom: 1px solid #333; display: inline-block; min-width: 180px; }
        .q-wrap { display: flex; gap: 14px; margin-bottom: 28px; page-break-inside: avoid; align-items: flex-start; }
        .q-num { background: #1a1a2e; color: #fff; min-width: 34px; height: 34px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 15px; flex-shrink: 0; margin-top: 4px; }
        .q-body { flex: 1; }
        .q-text { font-size: 19px; font-weight: 700; line-height: 1.7; margin-bottom: 12px; }
        .diagram-box { display: flex; justify-content: center; margin: 12px 0; }
        .diagram-box svg { max-width: 260px; height: auto; border: 1px dashed #aaa; padding: 8px; border-radius: 8px; }
        .diagram-box text { font-family: 'Cairo', sans-serif; font-weight: bold; }
        .mcq-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 25px; margin-top: 8px; }
        .opt-row { display: flex; align-items: center; gap: 10px; font-size: 17px; }
        .opt-char { font-weight: 900; color: #1a1a2e; min-width: 24px; }
        .essay-line { border-bottom: 1px dashed #ccc; height: 38px; margin-top: 8px; }
        .footer { text-align: center; margin-top: 50px; font-size: 12px; color: #aaa; border-top: 1px solid #eee; padding-top: 10px; }
    </style>
</head>
<body>
    <div class="exam-header">
        <div class="exam-title">${examData.title || 'امتحان'}</div>
        <div class="exam-meta">
            ${examData.subject ? `<span>${examData.subject}</span>` : ''}
            ${examData.grade ? `<span>${examData.grade}</span>` : ''}
            ${examData.duration ? `<span>${examData.duration}</span>` : ''}
            ${examData.totalMarks ? `<span>الدرجة الكاملة: ${examData.totalMarks}</span>` : ''}
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
            ${window.lastTeacherName || document.getElementById('teacherNameInput')?.value ? `مستر/ ${window.lastTeacherName || document.getElementById('teacherNameInput').value}` : 'مع تحيات منصة الناظر التعليمية'}
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
        <title>ملخص درس - الناظر AI</title>
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

    // إخفاء الهيدر الرئيسي لتجنب التداخل
    const mainNav = document.querySelector('.app-bar');
    if (mainNav) mainNav.classList.add('hidden');

    // تعبئة البيانات الأساسية
    const followUpText = translations[currentLang].studentFollowUp || "لوحة متابعة الطالب {name}";
    document.getElementById('profileHeaderTitle').innerHTML = followUpText.replace('{name}', `<span class="text-brand">${student.name}</span>`);
    document.getElementById('profileName').value = student.name;
    let displayPhone = student.parentPhoneNumber || '';
    if (displayPhone.startsWith('+2')) {
        displayPhone = displayPhone.substring(2);
    }
    document.getElementById('profileParentPhone').value = displayPhone;

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

    // إظهار الهيدر الرئيسي مرة أخرى
    const mainNav = document.querySelector('.app-bar');
    if (mainNav) mainNav.classList.remove('hidden');
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
    let formattedPhone = newParentPhone.trim();
    if (formattedPhone) {
        if (formattedPhone.startsWith('01') && formattedPhone.length === 11) {
            formattedPhone = '+2' + formattedPhone;
        } else if (!formattedPhone.startsWith('+')) {
            formattedPhone = '+2' + formattedPhone;
        }
    }

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
                parentPhoneNumber: formattedPhone
            }
        });

        // تحديث الداتا محلياً فوراً
        const sIndex = allStudents.findIndex(s => s.id === currentProfileId);
        if (sIndex !== -1) {
            allStudents[sIndex].name = newName;
            allStudents[sIndex].parentPhoneNumber = formattedPhone;
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
                            <span class="text-xs text-gray-400 font-bold">/${total}</span>
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

function togglePasswordVisibility() {
    const input = document.getElementById('teacherPasswordInput');
    const icon = document.getElementById('passwordToggleIcon');
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'ri-eye-off-line text-xl';
    } else {
        input.type = 'password';
        icon.className = 'ri-eye-line text-xl';
    }
}

// --- Bulk QR Print Feature ---
window.openBulkPrintModal = function() {
    if (!allStudents || allStudents.length === 0) {
        showToast(translations[currentLang].noDataMsg || "لا يوجد طلاب في المجموعة", "error");
        return;
    }
    document.getElementById('bulkQrPrintModal').classList.remove('hidden');
    document.getElementById('bulkQrPrintModal').classList.add('flex');
}

window.closeBulkPrintModal = function() {
    document.getElementById('bulkQrPrintModal').classList.add('hidden');
    document.getElementById('bulkQrPrintModal').classList.remove('flex');
}

let currentBulkPrintTargetStudents = [];

window.closeBulkQrPrintSuccessModal = async function(success) {
    document.getElementById('bulkQrPrintSuccessModal').classList.add('hidden');
    document.getElementById('bulkQrPrintSuccessModal').classList.remove('flex');
    if (success && currentBulkPrintTargetStudents.length > 0) {
        for (const s of currentBulkPrintTargetStudents) {
            s.qrPrinted = true;
            await putToDB('students', s);
            await addToSyncQueue({ type: 'set', path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/students/${s.id}`, data: { qrPrinted: true } });
        }
        showToast("تم حفظ حالة الطباعة بنجاح!");
    }
    document.getElementById('bulkQrPrintContainer').innerHTML = ''; // Clean up
    currentBulkPrintTargetStudents = [];
}

window.startBulkPrint = async function(mode) {
    let targetStudents = [];
    if (mode === 'new') {
        targetStudents = allStudents.filter(s => !s.qrPrinted);
    } else {
        targetStudents = allStudents;
    }

    if (targetStudents.length === 0) {
        showToast("لا يوجد طلاب في هذه الفئة لطباعة كروت لهم", "error");
        closeBulkPrintModal();
        return;
    }

    currentBulkPrintTargetStudents = targetStudents; // store globally for the modal
    const container = document.getElementById('bulkQrPrintContainer');
    container.innerHTML = '';

    // Generate cards
    targetStudents.forEach(s => {
        const qrContent = s.parentPhoneNumber ? s.parentPhoneNumber.trim() : s.id;
        
        let randomQuote = motivationQuotes[Math.floor(Math.random() * motivationQuotes.length)];
        // إزالة الـ Emojis والإبقاء على الحروف والأرقام والمسافات
        randomQuote = randomQuote.replace(/[^\u0600-\u06FF\u0020-\u007E\s]/g, '').trim();
        
        const card = document.createElement('div');
        card.className = 'qr-card';
        card.innerHTML = `
            <div class="qr-card-header">
                <img src="assets/images/favicon.png" alt="logo">
                <span>الناظر - Al-Nazer</span>
            </div>
            <div class="qr-card-name">${s.name}</div>
            <div class="qr-card-subtitle">Smart Access ID</div>
            <div class="qr-card-code" id="bulk-qr-${s.id}"></div>
            <div class="qr-card-quote">"${randomQuote}"</div>
        `;
        container.appendChild(card);

        // Generate QR code inside the card
        new QRCode(card.querySelector(`#bulk-qr-${s.id}`), {
            text: qrContent,
            width: 120,
            height: 120,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    });

    closeBulkPrintModal();

    // Small delay to allow QR codes to render before printing
    setTimeout(() => {
        window.print();
        
        // Ask for confirmation after printing dialog closes using our custom modal
        const checkSuccess = () => {
            document.getElementById('bulkQrPrintSuccessModal').classList.remove('hidden');
            document.getElementById('bulkQrPrintSuccessModal').classList.add('flex');
        };
        
        // Some browsers support onafterprint nicely
        window.onafterprint = () => {
            window.onafterprint = null;
            setTimeout(checkSuccess, 500);
        };
        
        // Safari / older browsers fallback
        if (window.matchMedia) {
            let mediaQueryList = window.matchMedia('print');
            mediaQueryList.addListener(function(mql) {
                if (!mql.matches) {
                    if (window.onafterprint !== null) {
                        window.onafterprint = null;
                        setTimeout(checkSuccess, 500);
                    }
                }
            });
        }
        
    }, 500);
}
