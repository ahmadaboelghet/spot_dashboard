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
const firebaseConfig = {
    apiKey: "AIzaSyAbN4awHvNUZWC-uCgU_hR7iYiHk-3dpv8",
    authDomain: "learnaria-483e7.firebaseapp.com",
    projectId: "learnaria-483e7",
    storageBucket: "learnaria-483e7.firebasestorage.app",
    messagingSenderId: "573038013067",
    appId: "1:573038013067:web:db6a78e8370d33b07a828e",
    measurementId: "G-T68CEZS4YC"
};

let app, firestoreDB;
try {
    if (typeof firebase !== 'undefined') {
        app = firebase.initializeApp(firebaseConfig);
        firestoreDB = firebase.firestore();
        firestoreDB.enablePersistence().catch(err => console.log("Persistence:", err.code));
    }
} catch (e) { console.error("Firebase Error:", e); }

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
                    if(['groups', 'students', 'assignments', 'schedules'].includes(store)) s.createIndex(store === 'groups' ? 'teacherId' : 'groupId', store === 'groups' ? 'teacherId' : 'groupId', {unique:false});
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
        locationPlaceholder: "سنتر كوليدج"
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
        locationPlaceholder: "Center College"
    }
};

// ==========================================
// 4. UTILS
// ==========================================
function generateUniqueId() { return `off_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`; }
function isValidEgyptianPhoneNumber(p) { return /^01[0125]\d{8}$/.test(p?.trim()); }
function formatPhoneNumber(p) { return isValidEgyptianPhoneNumber(p) ? `+20${p.trim().substring(1)}` : null; }

function playBeep() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 800; gain.gain.value = 0.1;
        osc.start(); osc.stop(ctx.currentTime + 0.1);
        if(navigator.vibrate) navigator.vibrate(50);
    } catch(e){}
}

function showToast(msg, type='success') {
    const div = document.createElement('div');
    div.className = `message-box ${type === 'error' ? 'border-red-500 text-red-500' : ''}`;
    div.innerHTML = type === 'error' ? `<i class="ri-error-warning-line"></i> ${msg}` : `<i class="ri-checkbox-circle-line"></i> ${msg}`;
    document.body.appendChild(div);
    setTimeout(()=> div.remove(), 3000);
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
    if(!localDB) await openDB();
    const count = await new Promise(r => {
        const req = localDB.transaction('syncQueue').objectStore('syncQueue').count();
        req.onsuccess = () => r(req.result);
    });
    const el = document.getElementById('syncIndicator');
    if(el) {
        if(count > 0) el.innerHTML = `<i class="ri-refresh-line animate-spin text-yellow-500"></i> ${count}`;
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
                } catch(e) { console.error(e); }
            }
            isSyncing = false;
            updateSyncUI();
        };
    } catch(e) { isSyncing = false; }
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
    if(dailyInput) dailyInput.valueAsDate = new Date();

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

    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tab = e.currentTarget.dataset.tab;
            if(!SELECTED_GROUP_ID && tab !== 'profile') {
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

    document.getElementById('addNewGroupButton').addEventListener('click', () => switchTab('profile'));

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
        if(el) el.disabled = !enable;
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
    if(!container) return;
    container.innerHTML = '';
    translations[currentLang].days.forEach((day, index) => {
        const label = document.createElement('label');
        label.className = 'day-checkbox-container cursor-pointer flex items-center gap-2 bg-white dark:bg-black border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-xl hover:border-brand transition-all';
        label.innerHTML = `
            <input type="checkbox" class="day-checkbox w-4 h-4 accent-brand rounded" value="${index}">
            <span class="text-sm font-bold text-gray-700 dark:text-gray-300 select-none">${day}</span>
        `;
        label.querySelector('input').addEventListener('change', function() {
            if(this.checked) label.classList.add('bg-brand/10', 'border-brand');
            else label.classList.remove('bg-brand/10', 'border-brand');
        });
        container.appendChild(label);
    });
}

async function saveRecurringSchedule() {
    if (!TEACHER_ID || !SELECTED_GROUP_ID) return;
    const existing = await getAllFromDB('schedules', 'groupId', SELECTED_GROUP_ID);
    if(existing && existing.length > 0) {
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
    if(!container) return;
    
    container.innerHTML = `<p class="text-center text-gray-500 py-4"><i class="ri-loader-4-line animate-spin"></i> Loading...</p>`;

    try {
        // 1. جلب البيانات (كما هو في السابق)
        let scheds = await getAllFromDB('schedules', 'groupId', SELECTED_GROUP_ID);
        
        // Sync check (لو مفيش داتا محلياً، نجرب السيرفر)
        if(scheds.length === 0 && navigator.onLine) {
            try {
                const snap = await firestoreDB.collection(`teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/recurringSchedules`).get();
                scheds = snap.docs.map(doc => ({ id: doc.id, groupId: SELECTED_GROUP_ID, ...doc.data() }));
                for(const s of scheds) await putToDB('schedules', s);
            } catch(e){}
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
            allInputs.forEach(el => { if(el) el.disabled = true; });
            
        } else {
            // 🔓 حالة الفتح: لا يوجد مواعيد
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed', 'bg-gray-400');
            btn.innerHTML = translations[currentLang].saveRecurringScheduleButton || "إضافة للجدول";
            
            // تفعيل كل الخانات
            allInputs.forEach(el => { if(el) el.disabled = false; });
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
                 if(confirm(translations[currentLang].confirmScheduleDelete)) {
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
                if(navigator.onLine) {
                    firestoreDB.collection('teachers').doc(fmt).set({ password: password }, { merge: true });
                }
            }
        }

        // 4. تسجيل الدخول ناجح
        TEACHER_ID = fmt;
        localStorage.setItem('learnaria-tid', TEACHER_ID);

        document.getElementById('loginSection').classList.add('hidden');
        document.getElementById('mainContent').classList.remove('hidden');
        document.getElementById('logoutButton').classList.remove('hidden');

        if(data) {
            document.getElementById('dashboardTitle').innerText = `${translations[currentLang].pageTitle} - ${data.name || ''}`;
            document.getElementById('teacherNameInput').value = data.name || '';
            document.getElementById('teacherSubjectInput').value = data.subject || '';
            document.getElementById('profilePasswordInput').value = data.password || '';
        }

        await loadGroups();
        switchTab('daily');

    } catch (error) {
        if(error.message !== "Offline first login") {
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
            const remoteGroups = snap.docs.map(doc => ({id: doc.id, teacherId: TEACHER_ID, ...doc.data()}));
            for(const g of remoteGroups) {
                await putToDB('groups', g);
            }
            renderGroupsDropdown(remoteGroups);
        } catch(e) {
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
        if(currentVal === g.id) opt.selected = true;
        sel.appendChild(opt);
    });
}

async function createGroup() {
    const name = document.getElementById('newGroupName').value;
    if(!name) return;
    const id = generateUniqueId();
    await putToDB('groups', { id, teacherId: TEACHER_ID, name });
    await addToSyncQueue({ type: 'add', path: `teachers/${TEACHER_ID}/groups`, id, data: { name } });
    document.getElementById('newGroupName').value = '';
    loadGroups();
}

// ------------------------------------------------------------------
// ✅✅ NEW LOAD GROUP DATA WITH SAFE SYNC & FAIL-SAFE LOGIC ✅✅
// ------------------------------------------------------------------
async function loadGroupData() {
    if(!SELECTED_GROUP_ID) {
        toggleStudentInputs(false); // ✅ ضمان الإغلاق لو مفيش مجموعة
        return;
    }
    
    // ✅ تفعيل خانات الإضافة بمجرد اختيار مجموعة
    toggleStudentInputs(true);
    
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

        } catch(e) {
            console.error("Sync error:", e);
        }
    }

    // تحديث مبدئي إذا لم يكن هناك تبويب نشط
    if(!document.querySelector('.tab-button.active')) switchTab('daily');
}

// ✅ دالة حفظ الطلاب للـ Cache في الخلفية
async function saveStudentsToLocalDB(students) {
    try {
        for(const s of students) await putToDB('students', s);
    } catch(e) { console.error("Cache update failed", e); }
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

    if(tabId === 'daily') renderDailyList();
    if(tabId === 'students') renderStudents();
    if(tabId === 'payments') {
        const pm = document.getElementById('paymentMonthInput');
        if(!pm.value) pm.value = new Date().toISOString().slice(0, 7);
        renderPaymentsList();
    }
    if(tabId === 'exams') loadExams();

    if(tabId === 'schedule') {
        fetchRecurringSchedules();
        createTimePicker('recurringTimeContainer');
        createTimePicker('exceptionNewTimeContainer');
        renderDayCheckboxes();
        const profileSubject = document.getElementById('teacherSubjectInput').value;
        if(profileSubject) {
            document.getElementById('recurringSubject').value = profileSubject;
        }
    }
}

// ==========================================
// 8. DAILY & SCANNER
// ==========================================
async function renderDailyList() {
    const date = document.getElementById('dailyDateInput').value;
    const list = document.getElementById('dailyStudentsList');
    list.innerHTML = '';

    document.getElementById('headerStudent').innerText = translations[currentLang].tableHeaderStudent;
    document.getElementById('headerAttendance').innerText = translations[currentLang].tableHeaderAttendance;
    document.getElementById('headerHomework').innerText = translations[currentLang].tableHeaderHomework;

    const hStudent = document.getElementById('headerStudent');
    const hAtt = document.getElementById('headerAttendance');
    const hHw = document.getElementById('headerHomework');

    if (hasHomeworkToday) {
        hStudent.className = "col-span-6 transition-all duration-300";
        hAtt.className = "col-span-3 text-center transition-all duration-300";
        hHw.classList.remove('hidden');
    } else {
        hStudent.className = "col-span-8 transition-all duration-300";
        hAtt.className = "col-span-4 text-center transition-all duration-300";
        hHw.classList.add('hidden');
    }

    if(!date || !allStudents.length) {
        list.innerHTML = `<p class="text-center text-gray-500 py-4">${translations[currentLang].noStudentsInGroup}</p>`;
        return;
    }

    const attId = `${SELECTED_GROUP_ID}_${date}`;
    const hwId = `${SELECTED_GROUP_ID}_HW_${date}`;
    const [attDoc, hwDoc] = await Promise.all([getFromDB('attendance', attId), getFromDB('assignments', hwId)]);

    const attMap = {};
    if(attDoc?.records) attDoc.records.forEach(r => attMap[r.studentId] = r.status);

    const hwMap = {};
    if(hwDoc?.scores) {
        Object.entries(hwDoc.scores).forEach(([sid, val]) => hwMap[sid] = val.submitted);
        hasHomeworkToday = true;
        document.getElementById('homeworkToggle').checked = true;
        hStudent.className = "col-span-6 transition-all duration-300";
        hAtt.className = "col-span-3 text-center transition-all duration-300";
        hHw.classList.remove('hidden');
    }

    let presentCount = 0;
    allStudents.forEach(s => {
        const status = attMap[s.id] || 'absent';
        if(status !== 'absent') presentCount++;
        const hwStatus = hwMap[s.id];

        const studentColSpan = hasHomeworkToday ? 'col-span-6' : 'col-span-8';
        const attColSpan = hasHomeworkToday ? 'col-span-3' : 'col-span-4';

        const row = document.createElement('div');
        row.dataset.sid = s.id;
        row.className = `grid grid-cols-12 items-center p-3 rounded-lg border transition-colors ${status === 'present' ? 'bg-green-50 border-green-500 dark:bg-green-900/20' : 'bg-white dark:bg-darkSurface border-transparent hover:bg-gray-50 dark:hover:bg-white/5'}`;

        let html = `
            <div class="${studentColSpan} font-bold text-sm truncate px-2 text-gray-800 dark:text-gray-200 transition-all duration-300">${s.name}</div>
            <div class="${attColSpan} flex justify-center transition-all duration-300">
                <select class="att-select bg-gray-50 dark:bg-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded text-xs py-1 px-1 outline-none">
                    <option value="present" ${status==='present'?'selected':''}>${translations[currentLang].present}</option>
                    <option value="absent" ${status==='absent'?'selected':''}>${translations[currentLang].absent}</option>
                    <option value="late" ${status==='late'?'selected':''}>${translations[currentLang].late}</option>
                </select>
            </div>
        `;

        if(hasHomeworkToday) {
            html += `
            <div class="col-span-3 flex justify-center fade-in-up">
                <input type="checkbox" class="hw-check w-5 h-5 accent-brand rounded cursor-pointer" ${hwStatus ? 'checked' : ''}>
            </div>`;
        }

        row.innerHTML = html;

        row.querySelector('.att-select').addEventListener('change', (e) => {
            if(e.target.value === 'present') row.classList.add('bg-green-50', 'border-green-500', 'dark:bg-green-900/20');
            else { row.classList.remove('bg-green-50', 'border-green-500', 'dark:bg-green-900/20'); row.classList.add('bg-white', 'dark:bg-darkSurface', 'border-transparent'); }
        });
        list.appendChild(row);
    });
    document.getElementById('attendanceCountBadge').innerText = `${presentCount}/${allStudents.length}`;
}

async function saveDailyData() {
    if(!TEACHER_ID || !SELECTED_GROUP_ID) return;
    
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
            if(hasHomeworkToday && status !== 'absent') {
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
        if(hasHomeworkToday) {
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
    if(videoElement && videoElement.srcObject) videoElement.srcObject.getTracks().forEach(t => t.stop());
    document.getElementById('scannerModal').classList.add('hidden');
    if(videoElement) videoElement.style.transform = "";
    if(animationFrameId) cancelAnimationFrame(animationFrameId);
}

function tickScanner() {
    if(isScannerPaused || document.getElementById('scannerModal').classList.contains('hidden')) return;
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

function handleScan(dataStr) {
    try {
        const data = JSON.parse(dataStr);
        if(data.groupId !== SELECTED_GROUP_ID) return;
        const student = allStudents.find(s => s.id === data.studentId);
        if(!student) return;

        playBeep();
        isScannerPaused = true;

        const overlay = document.getElementById('scannerOverlay');
        const feedback = document.getElementById('scannedStudentName');
        document.getElementById('feedbackNameText').innerText = student.name;

        feedback.classList.remove('opacity-0', 'translate-y-10', 'scale-90');
        overlay.classList.add('success');

        setTimeout(() => {
            feedback.classList.add('opacity-0', 'translate-y-10', 'scale-90');
            overlay.classList.remove('success');
        }, 1500);

        if(currentScannerMode === 'daily') processDailyScan(student);
        else if (currentScannerMode === 'payments') {
            processPaymentScan(student);
            setTimeout(() => { isScannerPaused = false; requestAnimationFrame(tickScanner); }, 1500);
        }
    } catch(e) { isScannerPaused = false; requestAnimationFrame(tickScanner); }
}

function processDailyScan(student) {
    const row = document.querySelector(`#dailyStudentsList > div[data-sid="${student.id}"]`);
    if(row) {
        const sel = row.querySelector('.att-select');
        sel.value = 'present';
        sel.dispatchEvent(new Event('change'));
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if(hasHomeworkToday) {
        currentPendingStudentId = student.id;
        document.getElementById('hwStudentName').innerText = student.name;
        document.getElementById('hwConfirmModal').classList.remove('hidden');
    } else {
        setTimeout(() => { isScannerPaused = false; requestAnimationFrame(tickScanner); }, 1200);
    }
}

function resolveHomework(isSubmitted) {
    if(currentPendingStudentId) {
        const row = document.querySelector(`#dailyStudentsList > div[data-sid="${currentPendingStudentId}"]`);
        if(row) {
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

    if(row) {
        const checkbox = row.querySelector('.payment-check');
        const input = row.querySelector('.payment-input');

        if(!checkbox.checked) {
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

    if(filtered.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-500">${translations[currentLang].noStudentsInGroup}</p>`;
        return;
    }

    filtered.forEach(s => {
        const div = document.createElement('div');
        div.className = "record-item";
        div.innerHTML = `
            <div>
                <p class="font-bold text-gray-800 dark:text-white">${s.name}</p>
                <p class="text-xs text-gray-500">${s.parentPhoneNumber || ''}</p>
            </div>
            <div class="flex gap-2">
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

        // --- Actions ---
        // 1. Copy Link Logic
        div.querySelector('.link-btn').onclick = () => {
            const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
            const pNum = s.parentPhoneNumber ? s.parentPhoneNumber.trim() : "";
            const link = `${baseUrl}/parent.html?t=${encodeURIComponent(TEACHER_ID)}&g=${encodeURIComponent(SELECTED_GROUP_ID)}&s=${encodeURIComponent(s.id)}&n=${encodeURIComponent(s.name)}&p=${encodeURIComponent(pNum)}`;

            navigator.clipboard.writeText(link)
                .then(() => showToast("تم نسخ رابط المتابعة الموحد"))
                .catch(() => showToast("فشل النسخ", "error"));
        };

        // 2. Others
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
    if(!msg) return showToast(translations[currentLang].writeMsgFirst, "error");

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
    document.getElementById('idStudentName').innerText = student.name;
    const teacherName = document.getElementById('teacherNameInput').value || "المعلم";
    document.getElementById('idTeacherName').innerText = teacherName;
    const subjectName = document.getElementById('teacherSubjectInput').value || "";
    document.getElementById('idSubjectName').innerText = subjectName;

    document.getElementById('idQrcode').innerHTML = '';
    new QRCode(document.getElementById('idQrcode'), {
        text: JSON.stringify({ teacherId: TEACHER_ID, groupId: SELECTED_GROUP_ID, studentId: student.id }),
        width: 200,
        height: 200,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });

    document.getElementById('qrCodeModal').classList.remove('hidden');
}

async function addNewStudent() {
    // ✅ زيادة أمان: التأكد من وجود مجموعة
    if(!SELECTED_GROUP_ID) {
        showToast(translations[currentLang].selectGroupFirst || "الرجاء اختيار مجموعة أولاً", "error");
        return;
    }

    const nameInput = document.getElementById('newStudentName');
    const phoneInput = document.getElementById('newParentPhoneNumber');
    const name = nameInput.value;
    const phone = phoneInput.value;
    if(!name) return;
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
    if(!confirm(translations[currentLang].confirmDelete)) return;
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

    if(!month || !allStudents.length) return;

    const payId = `${SELECTED_GROUP_ID}_PAY_${month}`;
    const doc = await getFromDB('payments', payId);
    const map = {};
    if(doc?.records) {
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
            if(e.target.checked) {
                if(!input.value || input.value == 0) input.value = defaultVal;
                div.classList.add('bg-green-50', 'border-green-500', 'dark:bg-green-900/20');
                input.classList.add('text-green-600', 'font-bold');
            } else {
                input.value = '';
                div.classList.remove('bg-green-50', 'border-green-500', 'dark:bg-green-900/20');
                input.classList.remove('text-green-600', 'font-bold');
            }
        });

        input.addEventListener('input', (e) => {
            if(e.target.value > 0) {
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
    if(!month) return showToast(translations[currentLang].paymentMonthMissing, 'error');
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
    if(!name) return;
    const id = generateUniqueId();
    // ✅ FIX: Saving DATE so it appears in parent app
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
    loadExams();
}
async function renderExamGrades() {
    const examId = document.getElementById('examSelect').value;
    const container = document.getElementById('examGradesList');
    container.innerHTML = '';
    if(!examId) return;
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
    if(!examId) return;
    const scores = {};
    document.querySelectorAll('.exam-score-input').forEach(inp => { if(inp.value !== '') scores[inp.dataset.sid] = { score: inp.value }; });
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
    if(!name) return;
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
    if(localStorage.getItem('learnaria-dark') === 'true') {
        document.body.classList.add('dark-mode');
        updateThemeIcon();
    }

    // 2. استرجاع بيانات المعلم (تسجيل الدخول التلقائي)
    const storedID = localStorage.getItem('learnaria-tid');
    
    if(storedID) {
        // لو لقينا ID، نرجعه للمتغير ونخفي شاشة الدخول
        TEACHER_ID = storedID;
        
        // محاولة جلب بيانات المعلم من الداتابيز المحلية لتعبئة البروفايل
        try {
            const teacherData = await getFromDB('teachers', TEACHER_ID);
            if(teacherData) {
                document.getElementById('dashboardTitle').innerText = `${translations[currentLang].pageTitle} - ${teacherData.name || ''}`;
                document.getElementById('teacherNameInput').value = teacherData.name || '';
                document.getElementById('teacherSubjectInput').value = teacherData.subject || '';
                document.getElementById('profilePasswordInput').value = teacherData.password || '';
            }
        } catch(e) { console.log("Auto-login fetch error:", e); }

        // إخفاء شاشة تسجيل الدخول وإظهار المحتوى
        document.getElementById('loginSection').classList.add('hidden');
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
        if(translations[currentLang][key]) el.innerText = translations[currentLang][key];
    });
    document.querySelectorAll('[data-key-placeholder]').forEach(el => {
        const key = el.dataset.keyPlaceholder;
        if(translations[currentLang][key]) el.placeholder = translations[currentLang][key];
    });
    if(SELECTED_GROUP_ID && !document.getElementById('tab-daily').classList.contains('hidden')) renderDailyList();
    if(SELECTED_GROUP_ID && !document.getElementById('tab-students').classList.contains('hidden')) renderStudents();
    loadGroups();
    renderDayCheckboxes();
}