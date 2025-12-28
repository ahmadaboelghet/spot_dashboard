/**
 * SPOT TEACHER - FINAL INTEGRATED VERSION
 * Features: Smart Scanner + Full Recurring Schedule (Days Selection) + Exceptions + Offline Sync
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
        firestoreDB.enablePersistence().catch(err => console.log("Persistence Error:", err.code));
    }
} catch (e) { console.error("Firebase Init Error:", e); }

// ==========================================
// 2. LOCAL DATABASE (IndexedDB)
// ==========================================
const DB_NAME = 'LearnariaDB';
const DB_VERSION = 6; 
let localDB;

function openDB() {
    if (localDB) return Promise.resolve(localDB);
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onupgradeneeded = event => {
            const db = event.target.result;
            const stores = ['teachers', 'groups', 'students', 'assignments', 'attendance', 'payments', 'schedules', 'scheduleExceptions', 'syncQueue'];
            
            stores.forEach(name => {
                if (!db.objectStoreNames.contains(name)) {
                    if (name === 'syncQueue') {
                        db.createObjectStore(name, { autoIncrement: true });
                    } else {
                        const store = db.createObjectStore(name, { keyPath: 'id' });
                        if(['groups', 'students', 'assignments', 'schedules'].includes(name)) {
                             try { 
                                 const idx = name === 'groups' ? 'teacherId' : 'groupId';
                                 store.createIndex(idx, idx, { unique: false }); 
                             } catch(e){}
                        }
                    }
                }
            });
        };

        request.onsuccess = event => {
            localDB = event.target.result;
            resolve(localDB);
        };
        request.onerror = event => reject(event.target.error);
    });
}

// --- DB HELPERS ---
async function getFromDB(store, key) {
    if (!localDB) await openDB();
    return new Promise((resolve, reject) => {
        const tx = localDB.transaction(store, 'readonly');
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function getAllFromDB(store, indexName, key) {
    if (!localDB) await openDB();
    return new Promise((resolve, reject) => {
        const tx = localDB.transaction(store, 'readonly');
        const s = tx.objectStore(store);
        const req = indexName ? s.index(indexName).getAll(key) : s.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function putToDB(store, data) {
    if (!localDB) await openDB();
    const tx = localDB.transaction(store, 'readwrite');
    tx.objectStore(store).put(data);
    return tx.complete;
}

async function deleteFromDB(store, key) {
    if (!localDB) await openDB();
    const tx = localDB.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    return tx.complete;
}

// ==========================================
// 3. GLOBAL STATE
// ==========================================
let TEACHER_ID = null;
let SELECTED_GROUP_ID = null;
let allStudents = [];
let currentLang = 'ar';
let isSyncing = false;

// Scanner
let currentScannerMode = null; 
let isScannerPaused = false;
let videoElement;
let animationFrameId;

// Daily Logic
let hasHomeworkToday = false;
let currentPendingStudentId = null; 

const translations = {
    ar: {
        pageTitle: "Spot - المعلم الذكي",
        teacherLoginTitle: "تسجيل دخول المعلم",
        teacherLoginPrompt: "أدخل رقم هاتفك للبدء",
        loadDashboardButton: "دخول",
        tabDaily: "الحصة اليومية",
        tabProfile: "الملف",
        tabStudents: "الطلاب",
        tabGrades: "الامتحانات",
        tabPayments: "التحصيل",
        tabSchedule: "الجدول",
        dailyClassTitle: "إدارة الحصة",
        selectDateLabel: "تاريخ اليوم",
        homeworkToggleLabel: "واجب اليوم؟",
        startSmartScan: "بدء الرصد الذكي (QR)",
        liveLogTitle: "سجل الحصة المباشر",
        saveAllButton: "حفظ الكل",
        // Schedule Keys
        scheduleTitle: "إدارة الجدول",
        addRecurringScheduleTitle: "إضافة موعد ثابت",
        subjectLabel: "المادة",
        timeLabel: "الوقت",
        locationLabel: "المكان",
        selectDaysLabel: "الأيام (التكرار الأسبوعي)",
        saveRecurringScheduleButton: "إضافة للجدول",
        mySchedulesLabel: "مواعيدي",
        modifySingleClassTitle: "تعديل طارئ",
        modifyClassPrompt: "تغيير موعد حصة معينة أو إلغاؤها.",
        classDateLabel: "تاريخ الحصة",
        newTimeLabel: "الموعد الجديد",
        updateClassButton: "تحديث الموعد",
        cancelClassButton: "إلغاء الحصة",
        days: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
        noSchedulesYet: "لا توجد مواعيد مسجلة.",
        repeatsOn: "كل:",
        fillScheduleForm: "أدخل المادة والوقت واختر يوماً واحداً على الأقل.",
        scheduleSavedSuccess: "تم حفظ الجدول!",
        scheduleDeletedSuccess: "تم حذف الموعد.",
        classUpdatedSuccess: "تم تحديث الحصة ليوم {date}.",
        classCancelledSuccess: "تم إلغاء حصة يوم {date}.",
        confirmScheduleDelete: "حذف هذا الموعد المتكرر؟",
        // Common
        present: "حاضر",
        absent: "غائب",
        late: "متأخر",
        paid: "مدفوع",
        saved: "تم الحفظ بنجاح!",
        error: "حدث خطأ!",
        studentAdded: "تمت الإضافة",
        phonePlaceholder: "مثال: 010xxxxxxx",
        fullNamePlaceholder: "الاسم",
        subjectPlaceholder: "المادة",
        locationPlaceholder: "المكان (اختياري)",
        groupNamePlaceholder: "اسم المجموعة",
        confirmDelete: "تأكيد الحذف؟",
        online: "متصل",
        offline: "غير متصل",
        syncing: "جاري المزامنة...",
        synced: "تمت المزامنة",
        pending: "معلق",
        scanOverlayText: "وجه الكود داخل الإطار",
        paymentMonthMissing: "اختر الشهر أولاً",
        homeworkQuestion: "هل سلم الواجب؟",
        yes: "نعم",
        no: "لا"
    },
    en: {
        pageTitle: "Spot - Smart Teacher",
        teacherLoginTitle: "Teacher Login",
        loadDashboardButton: "Login",
        tabDaily: "Daily Class",
        tabProfile: "Profile",
        tabStudents: "Students",
        tabGrades: "Exams",
        tabPayments: "Payments",
        tabSchedule: "Schedule",
        dailyClassTitle: "Class Manager",
        homeworkToggleLabel: "Homework Today?",
        startSmartScan: "Smart Scan",
        liveLogTitle: "Live Log",
        saveAllButton: "Save All",
        scheduleTitle: "Schedule",
        addRecurringScheduleTitle: "Add Recurring Class",
        subjectLabel: "Subject",
        timeLabel: "Time",
        locationLabel: "Location",
        selectDaysLabel: "Select Days:",
        saveRecurringScheduleButton: "Add to Schedule",
        mySchedulesLabel: "My Schedules",
        modifySingleClassTitle: "Modify Single Class",
        modifyClassPrompt: "Change time or cancel class for a specific date.",
        classDateLabel: "Class Date",
        newTimeLabel: "New Time",
        updateClassButton: "Update Time",
        cancelClassButton: "Cancel Class",
        days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        noSchedulesYet: "No schedules.",
        repeatsOn: "Every:",
        fillScheduleForm: "Fill data and select a day.",
        scheduleSavedSuccess: "Schedule Saved!",
        scheduleDeletedSuccess: "Schedule Deleted.",
        classUpdatedSuccess: "Class updated for {date}.",
        classCancelledSuccess: "Class cancelled for {date}.",
        confirmScheduleDelete: "Delete schedule?",
        present: "Present",
        absent: "Absent",
        late: "Late",
        paid: "Paid",
        saved: "Saved!",
        error: "Error!",
        studentAdded: "Added",
        phonePlaceholder: "010xxxxxxx",
        fullNamePlaceholder: "Full Name",
        subjectPlaceholder: "Subject",
        locationPlaceholder: "Location",
        groupNamePlaceholder: "Group Name",
        confirmDelete: "Confirm?",
        online: "Online",
        offline: "Offline",
        syncing: "Syncing...",
        synced: "Synced",
        pending: "Pending",
        scanOverlayText: "Align code",
        paymentMonthMissing: "Select Month",
        homeworkQuestion: "Submitted HW?",
        yes: "Yes",
        no: "No"
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
    if (navigator.onLine) {
        if(indicator) {
            indicator.querySelector('.status-text').innerText = translations[currentLang].online;
            indicator.querySelector('.status-dot').className = 'status-dot w-2.5 h-2.5 rounded-full bg-green-500';
        }
        processSyncQueue();
    } else {
        if(indicator) {
            indicator.querySelector('.status-text').innerText = translations[currentLang].offline;
            indicator.querySelector('.status-dot').className = 'status-dot w-2.5 h-2.5 rounded-full bg-red-500';
        }
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
    loadPreferences();
    updateOnlineStatus();

    const dailyInput = document.getElementById('dailyDateInput');
    if(dailyInput) dailyInput.valueAsDate = new Date();

    // Init UI for Schedule
    createTimePicker('recurringTimeContainer');
    createTimePicker('exceptionNewTimeContainer');
    renderDayCheckboxes();

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
});

function setupListeners() {
    // Auth
    document.getElementById('setTeacherButton').addEventListener('click', loginTeacher);
    document.getElementById('logoutButton').addEventListener('click', logout);

    // Navigation
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tab = e.currentTarget.dataset.tab;
            if(!SELECTED_GROUP_ID && tab !== 'profile') { 
                showToast(translations[currentLang].selectGroupLabel, 'error'); 
                return; 
            }
            switchTab(tab);
        });
    });

    // Profile & Group
    document.getElementById('saveProfileButton').addEventListener('click', saveProfile);
    document.getElementById('createNewGroupBtn').addEventListener('click', createGroup);
    document.getElementById('groupSelect').addEventListener('change', async (e) => {
        SELECTED_GROUP_ID = e.target.value;
        await loadGroupData();
    });
    document.getElementById('addNewGroupButton').addEventListener('click', () => switchTab('profile'));

    // Daily
    document.getElementById('startSmartScanBtn').addEventListener('click', () => startScanner('daily'));
    document.getElementById('homeworkToggle').addEventListener('change', (e) => hasHomeworkToday = e.target.checked);
    document.getElementById('dailyDateInput').addEventListener('change', renderDailyList);
    document.getElementById('saveDailyBtn').addEventListener('click', saveDailyData);
    document.getElementById('hwYesBtn').addEventListener('click', () => resolveHomework(true));
    document.getElementById('hwNoBtn').addEventListener('click', () => resolveHomework(false));

    // Students
    document.getElementById('addNewStudentButton').addEventListener('click', addNewStudent);
    document.getElementById('studentSearchInput').addEventListener('input', (e) => renderStudents(e.target.value));

    // SCHEDULE BUTTONS (Linked to new HTML logic)
    document.getElementById('addRecurringScheduleButton').addEventListener('click', saveRecurringSchedule);
    document.getElementById('updateSingleClassButton').addEventListener('click', updateSingleClass);
    document.getElementById('cancelSingleClassButton').addEventListener('click', cancelSingleClass);

    // Payments & Exams
    document.getElementById('scanPaymentsBtn').addEventListener('click', () => startScanner('payments'));
    document.getElementById('paymentMonthInput').addEventListener('change', renderPaymentsList);
    document.getElementById('savePaymentsBtn').addEventListener('click', savePayments);
    document.getElementById('addNewExamBtn').addEventListener('click', addNewExam);
    document.getElementById('examSelect').addEventListener('change', renderExamGrades);
    document.getElementById('saveExamGradesBtn').addEventListener('click', saveExamGrades);

    // Utils
    document.getElementById('closeScannerModal').addEventListener('click', stopScanner);
    document.getElementById('closeQrModal').addEventListener('click', () => document.getElementById('qrCodeModal').classList.add('hidden'));
    document.getElementById('printIdButton').addEventListener('click', () => window.print());
    document.getElementById('darkModeToggleButton').addEventListener('click', toggleDarkMode);
    document.getElementById('languageToggleButton').addEventListener('click', toggleLang);
}

// ==========================================
// 6. SCHEDULE LOGIC (THE MISSING PART)
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
        let schedules = await getAllFromDB('schedules', 'groupId', SELECTED_GROUP_ID);
        if(schedules.length === 0 && navigator.onLine) {
            try {
                const snap = await firestoreDB.collection(`teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/recurringSchedules`).get();
                schedules = snap.docs.map(doc => ({ id: doc.id, groupId: SELECTED_GROUP_ID, ...doc.data() }));
                for(const s of schedules) await putToDB('schedules', s);
            } catch(e){}
        }
        
        container.innerHTML = '';
        if (schedules.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-400 py-4">${translations[currentLang].noSchedulesYet}</p>`;
            return;
        }

        schedules.forEach(s => {
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
            div.querySelector('button').addEventListener('click', async () => {
                 if(confirm(translations[currentLang].confirmScheduleDelete)) {
                     await deleteFromDB('schedules', s.id);
                     await addToSyncQueue({ type: 'delete', path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/recurringSchedules/${s.id}` });
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
    
    if (!date || !newTime) return showToast("اختر التاريخ والوقت الجديد", 'error');
    
    const id = `${SELECTED_GROUP_ID}_${date}`;
    const data = { id, groupId: SELECTED_GROUP_ID, date, newTime, type: 'modified' };
    
    await putToDB('scheduleExceptions', data);
    await addToSyncQueue({ type: 'set', path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/exceptions/${id}`, data });
    showToast(translations[currentLang].classUpdatedSuccess.replace('{date}', date));
}

async function cancelSingleClass() {
    if (!TEACHER_ID || !SELECTED_GROUP_ID) return;
    const date = document.getElementById('exceptionDate').value;
    if (!date) return showToast("اختر التاريخ", 'error');
    
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
    const phone = document.getElementById('teacherPhoneInput').value;
    const fmt = formatPhoneNumber(phone);
    if (!fmt) return showToast(translations[currentLang].phonePlaceholder, 'error');
    
    TEACHER_ID = fmt;
    localStorage.setItem('learnaria-tid', TEACHER_ID);
    
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('mainContent').classList.remove('hidden');
    document.getElementById('logoutButton').classList.remove('hidden');

    let data = await getFromDB('teachers', TEACHER_ID);
    if (!data && navigator.onLine) {
        try {
            const doc = await firestoreDB.collection('teachers').doc(TEACHER_ID).get();
            if (doc.exists) { 
                data = { id: doc.id, ...doc.data() }; 
                await putToDB('teachers', data); 
            }
        } catch(e){}
    }
    
    if(data) {
        document.getElementById('dashboardTitle').innerText = `${translations[currentLang].pageTitle} - ${data.name}`;
        document.getElementById('teacherNameInput').value = data.name || '';
        document.getElementById('teacherSubjectInput').value = data.subject || '';
    }

    await loadGroups();
    switchTab('profile');
}

function logout() { localStorage.removeItem('learnaria-tid'); location.reload(); }

async function loadGroups() {
    let groups = await getAllFromDB('groups', 'teacherId', TEACHER_ID);
    if(groups.length === 0 && navigator.onLine) {
        try {
            const snap = await firestoreDB.collection(`teachers/${TEACHER_ID}/groups`).get();
            const remote = snap.docs.map(doc => ({id: doc.id, teacherId: TEACHER_ID, ...doc.data()}));
            for(const g of remote) await putToDB('groups', g);
            groups = remote;
        } catch(e){}
    }
    const sel = document.getElementById('groupSelect');
    sel.innerHTML = `<option value="" disabled selected>${translations[currentLang].selectGroupLabel}</option>`;
    groups.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.innerText = g.name;
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

async function loadGroupData() {
    if(!SELECTED_GROUP_ID) return;
    document.querySelectorAll('.tab-button').forEach(b => b.disabled = false);
    
    allStudents = await getAllFromDB('students', 'groupId', SELECTED_GROUP_ID);
    if(allStudents.length === 0 && navigator.onLine) {
        try {
            const snap = await firestoreDB.collection(`teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/students`).get();
            const remote = snap.docs.map(d => ({id:d.id, groupId:SELECTED_GROUP_ID, ...d.data()}));
            await Promise.all(remote.map(s => putToDB('students', s)));
            allStudents = remote;
        } catch(e){}
    }
    switchTab('daily');
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
    }
}

// ==========================================
// 8. DAILY & SCANNER
// ==========================================
async function renderDailyList() {
    const date = document.getElementById('dailyDateInput').value;
    const list = document.getElementById('dailyStudentsList');
    list.innerHTML = '';
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
    let isHwEnabled = false;
    if(hwDoc?.scores) {
        isHwEnabled = true;
        Object.entries(hwDoc.scores).forEach(([sid, val]) => hwMap[sid] = val.submitted);
    }
    document.getElementById('homeworkToggle').checked = isHwEnabled;
    hasHomeworkToday = isHwEnabled;

    let presentCount = 0;
    allStudents.forEach(s => {
        const status = attMap[s.id] || 'absent';
        if(status !== 'absent') presentCount++;
        const hwStatus = hwMap[s.id];
        const row = document.createElement('div');
        row.dataset.sid = s.id;
        row.className = `grid grid-cols-12 items-center p-3 rounded-lg border transition-colors ${status === 'present' ? 'bg-green-50 border-green-500 dark:bg-green-900/20' : 'bg-white dark:bg-black border-transparent hover:bg-gray-50'}`;
        row.innerHTML = `
            <div class="col-span-6 font-bold text-sm truncate px-2 text-gray-800 dark:text-gray-200">${s.name}</div>
            <div class="col-span-3 flex justify-center">
                <select class="att-select bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded text-xs py-1 px-1 outline-none">
                    <option value="present" ${status==='present'?'selected':''}>${translations[currentLang].present}</option>
                    <option value="absent" ${status==='absent'?'selected':''}>${translations[currentLang].absent}</option>
                    <option value="late" ${status==='late'?'selected':''}>${translations[currentLang].late}</option>
                </select>
            </div>
            <div class="col-span-3 flex justify-center">
                <input type="checkbox" class="hw-check w-5 h-5 accent-brand rounded cursor-pointer" ${!hasHomeworkToday ? 'disabled opacity-30' : ''} ${hwStatus ? 'checked' : ''}>
            </div>
        `;
        row.querySelector('.att-select').addEventListener('change', (e) => {
            if(e.target.value === 'present') row.classList.add('bg-green-50', 'border-green-500', 'dark:bg-green-900/20');
            else { row.classList.remove('bg-green-50', 'border-green-500', 'dark:bg-green-900/20'); row.classList.add('bg-white', 'dark:bg-black', 'border-transparent'); }
        });
        list.appendChild(row);
    });
    document.getElementById('attendanceCountBadge').innerText = `${presentCount}/${allStudents.length}`;
}

async function saveDailyData() {
    if(!TEACHER_ID || !SELECTED_GROUP_ID) return;
    const date = document.getElementById('dailyDateInput').value;
    const attRecords = [];
    const hwScores = {};
    document.querySelectorAll('#dailyStudentsList > div').forEach(row => {
        const sid = row.dataset.sid;
        attRecords.push({ studentId: sid, status: row.querySelector('.att-select').value });
        if(hasHomeworkToday) hwScores[sid] = { submitted: row.querySelector('.hw-check').checked, score: row.querySelector('.hw-check').checked ? 10 : 0 };
    });
    await putToDB('attendance', { id: `${SELECTED_GROUP_ID}_${date}`, date, records: attRecords });
    await addToSyncQueue({ type: 'set', path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/dailyAttendance/${date}`, data: { date, records: attRecords } });
    if(hasHomeworkToday) {
        const hwData = { id: `${SELECTED_GROUP_ID}_HW_${date}`, groupId: SELECTED_GROUP_ID, name: `Homework ${date}`, date, scores: hwScores, type: 'daily' };
        await putToDB('assignments', hwData);
        await addToSyncQueue({ type: 'set', path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/assignments/${hwData.id}`, data: hwData });
    }
    showToast(translations[currentLang].saved);
    renderDailyList();
}

async function startScanner(mode) {
    currentScannerMode = mode;
    isScannerPaused = false;
    document.getElementById('scannerModal').classList.remove('hidden');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        videoElement.srcObject = stream;
        await videoElement.play();
        requestAnimationFrame(tickScanner);
    } catch (e) { alert("Camera Error"); stopScanner(); }
}

function stopScanner() {
    isScannerPaused = true;
    if(videoElement && videoElement.srcObject) videoElement.srcObject.getTracks().forEach(t => t.stop());
    document.getElementById('scannerModal').classList.add('hidden');
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
        feedback.innerText = student.name;
        feedback.classList.remove('opacity-0', 'translate-y-4');
        overlay.classList.add('border-green-500');

        setTimeout(() => {
            feedback.classList.add('opacity-0', 'translate-y-4');
            overlay.classList.remove('border-green-500');
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
    if(row) {
        const chk = row.querySelector('input[type="checkbox"]');
        if(!chk.checked) {
            chk.checked = true;
            row.classList.add('bg-green-50', 'border-green-500', 'dark:bg-green-900/20');
        }
    }
}

// ==========================================
// 9. OTHER TABS (Students, Payments, Exams)
// ==========================================
function renderStudents(filter = "") {
    const container = document.getElementById('studentsListDisplay');
    container.innerHTML = '';
    const filtered = allStudents.filter(s => s.name.toLowerCase().includes(filter.toLowerCase()));
    if(filtered.length === 0) { container.innerHTML = `<p class="text-center text-gray-500">${translations[currentLang].noStudentsInGroup}</p>`; return; }
    filtered.forEach(s => {
        const div = document.createElement('div');
        div.className = "record-item";
        div.innerHTML = `
            <div>
                <p class="font-bold text-gray-800 dark:text-white">${s.name}</p>
                <p class="text-xs text-gray-500">${s.parentPhoneNumber || ''}</p>
            </div>
            <div class="flex gap-2">
                <button class="btn-icon w-10 h-10 bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300 qr-btn" data-sid="${s.id}"><i class="ri-qr-code-line"></i></button>
                <button class="btn-icon w-10 h-10 bg-red-50 hover:bg-red-100 text-red-500 dark:bg-red-900/20 del-btn" data-sid="${s.id}"><i class="ri-delete-bin-line"></i></button>
            </div>
        `;
        div.querySelector('.qr-btn').addEventListener('click', () => showStudentQR(s));
        div.querySelector('.del-btn').addEventListener('click', () => deleteStudent(s.id));
        container.appendChild(div);
    });
}

function showStudentQR(student) {
    document.getElementById('idStudentName').innerText = student.name;
    document.getElementById('idTeacherName').innerText = document.getElementById('dashboardTitle').innerText.split('-')[1]?.trim() || "";
    document.getElementById('idQrcode').innerHTML = '';
    new QRCode(document.getElementById('idQrcode'), {
        text: JSON.stringify({ teacherId: TEACHER_ID, groupId: SELECTED_GROUP_ID, studentId: student.id }),
        width: 150, height: 150,
        colorDark : "#000000", colorLight : "#ffffff", correctLevel : QRCode.CorrectLevel.H
    });
    document.getElementById('qrCodeModal').classList.remove('hidden');
}

async function addNewStudent() {
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

async function renderPaymentsList() {
    const month = document.getElementById('paymentMonthInput').value;
    const container = document.getElementById('paymentsList');
    container.innerHTML = '';
    if(!month || !allStudents.length) return;
    const payId = `${SELECTED_GROUP_ID}_PAY_${month}`;
    const doc = await getFromDB('payments', payId);
    const map = {};
    if(doc?.records) doc.records.forEach(r => map[r.studentId] = r.paid);
    allStudents.forEach(s => {
        const paid = map[s.id] === true;
        const div = document.createElement('div');
        div.className = `record-item ${paid ? 'bg-green-50 border-green-500 dark:bg-green-900/20' : ''}`;
        div.dataset.sid = s.id;
        div.innerHTML = `<span class="font-bold text-gray-700 dark:text-gray-200">${s.name}</span><input type="checkbox" class="w-6 h-6 accent-green-600 cursor-pointer" ${paid ? 'checked' : ''}>`;
        div.querySelector('input').addEventListener('change', (e) => {
             if(e.target.checked) div.classList.add('bg-green-50', 'border-green-500', 'dark:bg-green-900/20');
             else div.classList.remove('bg-green-50', 'border-green-500', 'dark:bg-green-900/20');
        });
        container.appendChild(div);
    });
}

async function savePayments() {
    const month = document.getElementById('paymentMonthInput').value;
    if(!month) return showToast(translations[currentLang].paymentMonthMissing, 'error');
    const records = [];
    document.querySelectorAll('#paymentsList > div').forEach(div => {
        records.push({ studentId: div.dataset.sid, paid: div.querySelector('input').checked });
    });
    await putToDB('payments', { id: `${SELECTED_GROUP_ID}_PAY_${month}`, month, records });
    await addToSyncQueue({ type: 'set', path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/payments/${month}`, data: { month, records } });
    showToast(translations[currentLang].saved);
}

async function loadExams() {
    const exams = await getAllFromDB('assignments', 'groupId', SELECTED_GROUP_ID);
    const sel = document.getElementById('examSelect');
    sel.innerHTML = '<option value="">-- اختر الامتحان --</option>';
    exams.filter(e => e.type === 'exam').forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id;
        opt.innerText = e.name;
        sel.appendChild(opt);
    });
}
async function addNewExam() {
    const name = document.getElementById('newExamName').value;
    if(!name) return;
    const id = generateUniqueId();
    const data = { id, groupId: SELECTED_GROUP_ID, name, type: 'exam', scores: {} };
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
        div.className = "flex items-center gap-2 p-2 bg-white dark:bg-black border rounded-lg";
        div.innerHTML = `<label class="text-sm font-bold w-1/2 truncate dark:text-white">${s.name}</label><input type="number" class="exam-score-input input-field w-1/2 h-10" data-sid="${s.id}" value="${val}" placeholder="الدرجة">`;
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

// ==========================================
// 10. PREFERENCES & LANG
// ==========================================
function saveProfile() {
    const name = document.getElementById('teacherNameInput').value;
    const subject = document.getElementById('teacherSubjectInput').value;
    if(!name) return;
    putToDB('teachers', { id: TEACHER_ID, name, subject });
    addToSyncQueue({ type: 'set', path: `teachers/${TEACHER_ID}`, data: { name, subject } });
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

function loadPreferences() {
    if(localStorage.getItem('learnaria-dark') === 'true') {
        document.body.classList.add('dark-mode');
        updateThemeIcon();
    }
    if(localStorage.getItem('learnaria-tid')) document.getElementById('teacherPhoneInput').value = localStorage.getItem('learnaria-tid').replace('+20','0');
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
    renderDayCheckboxes(); 
}