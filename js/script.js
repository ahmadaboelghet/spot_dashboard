const firebaseConfig = {
  apiKey: "AIzaSyAbN4awHvNUZWC-uCgU_hR7iYiHk-3dpv8",
  authDomain: "learnaria-483e7.firebaseapp.com",
  projectId: "learnaria-483e7",
  storageBucket: "learnaria-483e7.firebasestorage.app",
  messagingSenderId: "573038013067",
  appId: "1:573038013067:web:db6a78e8370d33b07a828e",
  measurementId: "G-T68CEZS4YC"
};

const app = firebase.initializeApp(firebaseConfig);
const firestoreDB = firebase.firestore();

const DB_NAME = 'LearnariaDB';
const DB_VERSION = 3; 
let localDB;

function openDB() {
    if (localDB) {
        return Promise.resolve(localDB);
    }
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = event => {
            const db = event.target.result;
            try {
                if (!db.objectStoreNames.contains('teachers')) {
                    db.createObjectStore('teachers', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('groups')) {
                    const store = db.createObjectStore('groups', { keyPath: 'id' });
                    store.createIndex('teacherId', 'teacherId', { unique: false });
                }
                if (!db.objectStoreNames.contains('students')) {
                    const store = db.createObjectStore('students', { keyPath: 'id' });
                    store.createIndex('groupId', 'groupId', { unique: false });
                }
                if (!db.objectStoreNames.contains('assignments')) {
                    const store = db.createObjectStore('assignments', { keyPath: 'id' });
                    store.createIndex('groupId', 'groupId', { unique: false });
                }
                if (!db.objectStoreNames.contains('attendance')) {
                     db.createObjectStore('attendance', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('payments')) {
                     db.createObjectStore('payments', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('schedules')) {
                     const store = db.createObjectStore('schedules', { keyPath: 'id' });
                     store.createIndex('groupId', 'groupId', { unique: false });
                }
                if (!db.objectStoreNames.contains('scheduleExceptions')) {
                     db.createObjectStore('scheduleExceptions', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('syncQueue')) {
                    db.createObjectStore('syncQueue', { autoIncrement: true });
                }
            } catch (e) {
                console.error("Error during DB upgrade:", e);
                reject(e);
            }
        };
        request.onsuccess = event => {
            localDB = event.target.result;
            console.log("Database opened successfully.");
            resolve(localDB);
        };
        request.onerror = event => {
            const error = event.target.error;
            console.error(`IndexedDB error: ${error.name} - ${error.message}`);
            alert("Could not open the local database. This can happen in private browsing mode or if storage permissions are denied. The app may not work correctly offline.");
            reject(error);
        };
    });
}

async function getFromDB(storeName, key) {
    if (!localDB) await openDB();
    const tx = localDB.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    return new Promise((resolve, reject) => {
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = (event) => reject(event.target.error);
    });
}

async function getAllFromDB(storeName, indexName, key) {
    if (!localDB) await openDB();
    const tx = localDB.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    return new Promise((resolve, reject) => {
        const req = index.getAll(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = (event) => reject(event.target.error);
    });
}

async function putToDB(storeName, data) {
    if (!localDB) await openDB();
    const tx = localDB.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.put(data);
    return tx.complete;
}

async function deleteFromDB(storeName, key) {
    if (!localDB) await openDB();
    const tx = localDB.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.delete(key);
    return tx.complete;
}

let TEACHER_ID = null;
let SELECTED_GROUP_ID = null;
let allStudents = [];
let currentLang = 'ar';
let isSyncing = false;

let statusIndicator, syncIndicator;
let qrCodeModal, scannerModal, videoElement;
let currentScannerMode = null; 
let animationFrameId = null;
let isScannerPaused = false;
let areEventListenersSetup = false;
let isAddingStudent = false;

const translations = {
    ar: {
        pageTitle: "Spot - لوحة تحكم المعلم",
        teacherDashboardTitle: "لوحة تحكم المعلم",
        teacherLoginTitle: "1. تسجيل دخول المعلم",
        teacherLoginPrompt: "الرجاء إدخال رقم هاتفك لتحميل بياناتك.",
        loadDashboardButton: "تحميل لوحة التحكم",
        myProfileTitle: "ملفي الشخصي",
        myNameLabel: "اسمي:",
        mySubjectLabel: "المادة التي أدرسها:",
        saveProfileButton: "حفظ ملفي الشخصي",
        manageGroupsTitle: "2. إدارة المجموعات",
        newGroupNameLabel: "اسم المجموعة الجديدة:",
        addNewGroupButton: "إضافة مجموعة جديدة",
        selectGroupLabel: "اختر مجموعة لإدارتها:",
        manageStudentsTitle: "إدارة الطلاب",
        studentNameLabel: "اسم الطالب:",
        parentPhoneLabel: "رقم هاتف ولي الأمر:",
        addNewStudentButton: "إضافة طالب جديد",
        searchStudentLabel: "البحث عن طالب:",
        allStudentsLabel: "كل الطلاب في هذه المجموعة:",
        attendanceTitle: "الحضور اليومي",
        selectDateLabel: "اختر التاريخ:",
        markAttendanceLabel: "تسجيل الحضور:",
        saveAttendanceButton: "حفظ الحضور اليومي",
        gradesTitle: "إدارة الدرجات",
        selectAssignmentLabel: "اختر الواجب:",
        newAssignmentNameLabel: "أو أضف اسم واجب جديد:",
        newAssignmentDateLabel: "تاريخ الواجب الجديد:",
        addNewAssignmentButton: "إضافة واجب جديد",
        enterGradesLabel: "أدخل الدرجات:",
        saveGradesButton: "حفظ درجات الواجب",
        tabPayments: "التحصيل",
        paymentsTitle: "متابعة تحصيل المصروفات",
        selectMonthLabel: "اختر الشهر:",
        markPaymentsLabel: "تسجيل الدفع:",
        savePaymentsButton: "حفظ بيانات التحصيل",
        paymentMonthMissing: "الرجاء اختيار الشهر.",
        paymentsSavedSuccess: "تم حفظ بيانات الدفع بنجاح!",
        paymentsSavedError: "فشل حفظ البيانات.",
        paidLabel: "تم الدفع",
        notPaidLabel: "لم يدفع",
        scanPaymentsQR: "مسح دفع المصروفات بـ QR",
        scheduleTitle: "إدارة جدول الحصص",
        addRecurringScheduleTitle: "إضافة جدول متكرر جديد",
        subjectLabel: "المادة:",
        timeLabel: "الوقت:",
        locationLabel: "المكان:",
        selectDaysLabel: "اختر أيام الأسبوع:",
        saveRecurringScheduleButton: "حفظ الجدول المتكرر",
        mySchedulesLabel: "جداولي المتكررة:",
        modifySingleClassTitle: "تعديل حصة واحدة",
        modifyClassPrompt: "هل تحتاج إلى تغيير أو إلغاء حصة واحدة؟ اختر التاريخ وقم بالتغيير.",
        classDateLabel: "تاريخ الحصة:",
        newTimeLabel: "الوقت الجديد (اختياري):",
        updateClassButton: "تحديث الحصة",
        cancelClassButton: "إلغاء هذه الحصة",
        phonePlaceholder: "مثال: 01001234567",
        fullNamePlaceholder: "أدخل اسمك الكامل",
        subjectPlaceholder: "مثال: فيزياء، رياضيات",
        locationPlaceholder: "مثال: أونلاين، سنتر الياسمين",
        groupNamePlaceholder: "مثال: الصف الأول - صباحي",
        newStudentPlaceholder: "أدخل اسم الطالب الجديد",
        parentPhonePlaceholder: "مثال: 01001234567",
        searchPlaceholder: "اكتب اسمًا للبحث...",
        assignmentNamePlaceholder: "مثال: اختبار قصير 1",
        selectGroupOption: "-- اختر مجموعة --",
        welcomeMessage: "مرحباً،",
        completeProfileMessage: "الرجاء إكمال معلومات ملفك الشخصي.",
        profileSavedSuccess: "تم حفظ الملف الشخصي بنجاح!",
        profileSavedError: "فشل حفظ الملف الشخصي.",
        nameAndSubjectMissing: "الرجاء إدخال اسمك والمادة التي تدرسها.",
        groupAddedSuccess: "تمت إضافة المجموعة بنجاح!",
        groupAddedError: "فشل إضافة المجموعة.",
        groupNameMissing: "الرجاء إدخال اسم المجموعة.",
        studentAddedSuccess: "تمت إضافة طالب جديد للمجموعة!",
        studentAddedError: "فشل إضافة الطالب.",
        studentAndParentMissing: "الرجاء إدخال اسم الطالب ورقم هاتف ولي الأمر.",
        studentDeletedSuccess: "تم حذف الطالب بنجاح!",
        studentDeletedError: "فشل حذف الطالب.",
        deleteConfirmation: "هل أنت متأكد من حذف",
        attendanceDateMissing: "الرجاء اختيار تاريخ.",
        attendanceSavedSuccess: "تم حفظ الحضور بنجاح!",
        attendanceSavedError: "فشل حفظ الحضور.",
        selectAssignmentOption: "اختر واجبًا",
        assignmentAddedSuccess: "تمت إضافة واجب جديد!",
        assignmentNameDateMissing: "الرجاء إدخال اسم الواجب وتاريخه.",
        selectAssignmentFirst: "الرجاء اختيار واجب أولاً.",
        gradesSavedSuccess: "تم حفظ الدرجات بنجاح!",
        gradesSavedError: "فشل حفظ الدرجات.",
        scheduleSavedSuccess: "تم حفظ الجدول المتكرر بنجاح!",
        scheduleSavedError: "فشل حفظ الجدول.",
        fillScheduleForm: "الرجاء تعبئة المادة والوقت واختيار يوم واحد على الأقل.",
        scheduleDeletedSuccess: "تم حذف الجدول بنجاح!",
        scheduleDeletedError: "فشل حذف الجدول.",
        confirmScheduleDelete: "هل أنت متأكد من حذف هذا الجدول المتكرر بالكامل؟",
        classUpdatedSuccess: "تم تغيير موعد حصة {date} إلى {time}.",
        classUpdatedError: "فشل تحديث الحصة.",
        classDateAndTimeMissing: "الرجاء تحديد تاريخ الحصة والوقت الجديد.",
        classCancelledSuccess: "تم إلغاء حصة يوم {date}.",
        classCancelledError: "فشل إلغاء الحصة.",
        classDateMissing: "الرجاء اختيار تاريخ الحصة التي تريد إلغاءها.",
        confirmCancelClass: "هل أنت متأكد من إلغاء حصة يوم {date}؟",
        noStudentsInGroup: "لا يوجد طلاب في هذه المجموعة بعد.",
        parentLabel: "ولي الأمر:",
        notAvailable: "غير متوفر",
        deleteButton: "حذف",
        absent: "غائب",
        present: "حاضر",
        late: "متأخر",
        scorePlaceholder: "الدرجة",
        noDateSelected: "الرجاء اختيار تاريخ.",
        noStudentsAvailable: "لا يوجد طلاب في هذه المجموعة.",
        noAssignmentSelected: "الرجاء اختيار واجب.",
        loadingSchedules: "جاري تحميل الجداول...",
        noSchedulesYet: "لا توجد جداول متكررة لهذه المجموعة بعد.",
        repeatsOn: "تتكرر في:",
        days: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
        tabProfile: "الملف الشخصي",
        tabStudents: "الطلاب",
        tabAttendance: "الحضور",
        tabGrades: "الدرجات",
        tabSchedule: "الجدول",
        onlineStatus: "متصل",
        offlineStatus: "غير متصل",
        syncStatusSynced: "تمت المزامنة",
        syncStatusSyncing: "جاري المزامنة...",
        syncStatusPending: "{count} تغييرات بانتظار المزامنة",
        scanAttendanceQR: "مسح الحضور بـ QR",
        scanHomeworkQR: "مسح تسليم الواجب بـ QR",
        phoneMissing: "الرجاء إدخال رقم الهاتف.",
        invalidPhoneFormat: "الرجاء إدخال رقم هاتف مصري صحيح (11 رقم يبدأ بـ 01).",
        logoutButton: "تسجيل الخروج"
    },
    en: {
        pageTitle: "Spot - Teacher Dashboard",
        teacherDashboardTitle: "Teacher Dashboard",
        teacherLoginTitle: "1. Teacher Login",
        teacherLoginPrompt: "Please enter your phone number to load your data.",
        loadDashboardButton: "Load My Dashboard",
        myProfileTitle: "My Profile",
        myNameLabel: "My Name:",
        mySubjectLabel: "Subject I Teach:",
        saveProfileButton: "Save My Profile",
        manageGroupsTitle: "2. Manage Groups",
        newGroupNameLabel: "New Group Name:",
        addNewGroupButton: "Add New Group",
        selectGroupLabel: "Select a Group to Manage:",
        manageStudentsTitle: "Manage Students",
        studentNameLabel: "Student Name:",
        parentPhoneLabel: "Parent Phone Number:",
        addNewStudentButton: "Add New Student",
        searchStudentLabel: "Search for a Student:",
        allStudentsLabel: "All Students in this Group:",
        attendanceTitle: "Daily Attendance",
        selectDateLabel: "Select Date:",
        markAttendanceLabel: "Mark Attendance:",
        saveAttendanceButton: "Save Daily Attendance",
        gradesTitle: "Grades Management",
        selectAssignmentLabel: "Select Assignment:",
        newAssignmentNameLabel: "Or Add New Assignment Name:",
        newAssignmentDateLabel: "New Assignment Date:",
        addNewAssignmentButton: "Add New Assignment",
        enterGradesLabel: "Enter Grades:",
        saveGradesButton: "Save Assignment Grades",
        tabPayments: "Payments",
        paymentsTitle: "Fees Collection",
        selectMonthLabel: "Select Month:",
        markPaymentsLabel: "Mark Payments:",
        savePaymentsButton: "Save Payments",
        paymentMonthMissing: "Please select a month.",
        paymentsSavedSuccess: "Payments saved successfully!",
        paymentsSavedError: "Failed to save payments.",
        paidLabel: "Paid",
        notPaidLabel: "Not Paid",
        scanPaymentsQR: "Scan Fees Payment with QR",
        scheduleTitle: "Class Schedule Management",
        addRecurringScheduleTitle: "Add New Recurring Schedule",
        subjectLabel: "Subject:",
        timeLabel: "Time:",
        locationLabel: "Location:",
        selectDaysLabel: "Select Days of the Week:",
        saveRecurringScheduleButton: "Save Recurring Schedule",
        mySchedulesLabel: "My Recurring Schedules:",
        modifySingleClassTitle: "Modify a Single Class",
        modifyClassPrompt: "Need to change or cancel a single class? Select the date and make your change.",
        classDateLabel: "Date of Class:",
        newTimeLabel: "New Time (Optional):",
        updateClassButton: "Update Class",
        cancelClassButton: "Cancel This Class",
        phonePlaceholder: "e.g., 01001234567",
        fullNamePlaceholder: "Enter your full name",
        subjectPlaceholder: "e.g., Physics, Math",
        locationPlaceholder: "e.g., Online, Jasmine Center",
        groupNamePlaceholder: "e.g., Grade 10 - Morning",
        newStudentPlaceholder: "Enter new student name",
        parentPhonePlaceholder: "e.g., 01001234567",
        searchPlaceholder: "Type a name to search...",
        assignmentNamePlaceholder: "e.g., Quiz 1",
        selectGroupOption: "-- Select a Group --",
        welcomeMessage: "Welcome,",
        completeProfileMessage: "Please complete your profile information.",
        profileSavedSuccess: "Profile saved successfully!",
        profileSavedError: "Failed to save profile.",
        nameAndSubjectMissing: "Please enter your name and the subject you teach.",
        groupAddedSuccess: "Group added successfully!",
        groupAddedError: "Failed to add group.",
        groupNameMissing: "Please enter a group name.",
        studentAddedSuccess: "New student added to group!",
        studentAddedError: "Failed to add student.",
        studentAndParentMissing: "Please enter both student name and parent phone number.",
        studentDeletedSuccess: "Student deleted successfully!",
        studentDeletedError: "Failed to delete student.",
        deleteConfirmation: "Are you sure you want to delete",
        attendanceDateMissing: "Please select a date.",
        attendanceSavedSuccess: "Attendance saved successfully!",
        attendanceSavedError: "Failed to save attendance.",
        selectAssignmentOption: "Select an Assignment",
        assignmentAddedSuccess: "New assignment added!",
        assignmentNameDateMissing: "Please enter assignment name and date.",
        selectAssignmentFirst: "Please select an assignment first.",
        gradesSavedSuccess: "Grades saved successfully!",
        gradesSavedError: "Failed to save grades.",
        scheduleSavedSuccess: "Recurring schedule saved successfully!",
        scheduleSavedError: "Failed to save the schedule.",
        fillScheduleForm: "Please fill in subject, time, and select at least one day.",
        scheduleDeletedSuccess: "Schedule deleted successfully!",
        scheduleDeletedError: "Failed to delete schedule.",
        confirmScheduleDelete: "Are you sure you want to delete this entire recurring schedule?",
        classUpdatedSuccess: "Class on {date} has been rescheduled to {time}.",
        classUpdatedError: "Failed to update class.",
        classDateAndTimeMissing: "Please select the date of the class and the new time.",
        classCancelledSuccess: "Class on {date} has been cancelled.",
        classCancelledError: "Failed to cancel class.",
        classDateMissing: "Please select the date of the class you want to cancel.",
        confirmCancelClass: "Are you sure you want to cancel the class on {date}?",
        noStudentsInGroup: "No students in this group yet.",
        parentLabel: "Parent:",
        notAvailable: "N/A",
        deleteButton: "Delete",
        absent: "Absent",
        present: "Present",
        late: "Late",
        scorePlaceholder: "Score",
        noDateSelected: "Please select a date.",
        noStudentsAvailable: "No students available in this group.",
        noAssignmentSelected: "Please select an assignment.",
        loadingSchedules: "Loading schedules...",
        noSchedulesYet: "No recurring schedules set for this group yet.",
        repeatsOn: "Repeats on:",
        days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        tabProfile: "Profile",
        tabStudents: "Students",
        tabAttendance: "Attendance",
        tabGrades: "Grades",
        tabSchedule: "Schedule",
        onlineStatus: "Online",
        offlineStatus: "Offline",
        syncStatusSynced: "Synced",
        syncStatusSyncing: "Syncing...",
        syncStatusPending: "{count} changes pending",
        scanAttendanceQR: "Scan Attendance with QR",
        scanHomeworkQR: "Scan Homework with QR",
        phoneMissing: "Please enter your phone number.",
        invalidPhoneFormat: "Please enter a valid Egyptian phone number (11 digits, starting with 01).",
        logoutButton: "Logout"
    }
};

// ======================= START: UTILITY FUNCTIONS =======================
function isValidEgyptianPhoneNumber(phone) {
    if (!phone) return false;
    const regex = /^01[0125]\d{8}$/;
    return regex.test(phone.trim());
}

function formatPhoneNumber(phone) {
    const trimmedPhone = phone.trim();
    if (isValidEgyptianPhoneNumber(trimmedPhone)) {
        return `+20${trimmedPhone.substring(1)}`;
    }
    return null;
}

function toEnglishNumerals(str) {
    const persian = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    const arabic = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    let result = String(str);
    for (let i = 0; i < 10; i++) {
        result = result.replace(new RegExp(persian[i], 'g'), i).replace(new RegExp(arabic[i], 'g'), i);
    }
    return result;
}

function setupPhoneNumberInput(inputId) {
    const phoneInput = document.getElementById(inputId);
    if (phoneInput) {
        phoneInput.setAttribute('maxlength', '11');

        phoneInput.addEventListener('input', (e) => {
            let value = e.target.value;
            value = toEnglishNumerals(value);
            value = value.replace(/\D/g, '');
            if (value.length > 11) {
                value = value.substring(0, 11);
            }
            e.target.value = value;
        });
    }
}

function formatTime12Hour(timeString) {
    if (!timeString || !timeString.includes(':')) return timeString;
    const [hourString, minute] = timeString.split(':');
    const hour = parseInt(hourString, 10);
    const period = hour >= 12 ? 'PM' : 'AM';
    const convertedHour = hour % 12 || 12;
    return `${String(convertedHour).padStart(2, '0')}:${minute} ${period}`;
}

function createTimePicker(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <select id="${containerId}-hour" class="input-field">
            ${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${String(i + 1).padStart(2, '0')}</option>`).join('')}
        </select>
        <select id="${containerId}-minute" class="input-field">
            ${Array.from({ length: 60 }, (_, i) => `<option value="${i}">${String(i).padStart(2, '0')}</option>`).join('')}
        </select>
        <select id="${containerId}-period" class="input-field">
            <option value="AM">AM</option>
            <option value="PM">PM</option>
        </select>
    `;
}

function getTimeFromPicker(containerId) {
    const hourSelect = document.getElementById(`${containerId}-hour`);
    const minuteSelect = document.getElementById(`${containerId}-minute`);
    const periodSelect = document.getElementById(`${containerId}-period`);

    if (!hourSelect || !minuteSelect || !periodSelect) return '';

    let hour = parseInt(hourSelect.value, 10);
    const minute = minuteSelect.value;
    const period = periodSelect.value;

    if (period === 'PM' && hour < 12) {
        hour += 12;
    }
    if (period === 'AM' && hour === 12) {
        hour = 0;
    }

    return `${String(hour).padStart(2, '0')}:${minute}`;
}
// =======================  END: UTILITY FUNCTIONS  =======================


function showMessageBox(messageKey, ...args) {
    let message = translations[currentLang][messageKey] || messageKey;
    if (args.length > 0) {
        message = message.replace(/{(\w+)}/g, (match, key) => {
            const argIndex = Object.keys(args[0]).indexOf(key);
            return argIndex !== -1 ? args[0][key] : match;
        });
    }

    const existingBox = document.querySelector('.message-box');
    if (existingBox) {
        existingBox.remove();
    }
    const messageBox = document.createElement('div');
    messageBox.className = 'message-box';
    messageBox.innerText = message;
    document.body.appendChild(messageBox);
    setTimeout(() => { messageBox.style.opacity = 1; }, 50);
    setTimeout(() => {
        messageBox.style.opacity = 0;
        messageBox.addEventListener('transitionend', () => messageBox.remove());
    }, 3000);
}


function generateUniqueId() {
    return `offline_${new Date().getTime()}_${Math.random().toString(36).substr(2, 9)}`;
}

function updateOnlineStatus() {
    const onlineText = translations[currentLang].onlineStatus || 'Online';
    const offlineText = translations[currentLang].offlineStatus || 'Offline';
    if (navigator.onLine) {
        statusIndicator.classList.add('online');
        statusIndicator.classList.remove('offline');
        statusIndicator.querySelector('.status-text').textContent = onlineText;
    } else {
        statusIndicator.classList.remove('online');
        statusIndicator.classList.add('offline');
        statusIndicator.querySelector('.status-text').textContent = offlineText;
    }
    updateSyncIndicator();
}

async function updateSyncIndicator() {
    const syncingText = translations[currentLang].syncStatusSyncing;
    const syncedText = translations[currentLang].syncStatusSynced;
    const pendingTextTemplate = translations[currentLang].syncStatusPending;
    if (isSyncing) {
        syncIndicator.innerHTML = `
            <svg class="icon-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h5M20 20v-5h-5M4 4l5 5M20 20l-5-5"></path></svg>
            <span>${syncingText}</span>
        `;
        return;
    }
    try {
        if (!localDB) await openDB();
        const tx = localDB.transaction('syncQueue', 'readonly');
        const store = tx.objectStore('syncQueue');
        const countReq = store.count();
        countReq.onsuccess = () => {
            const count = countReq.result;
            if (count > 0) {
                const pendingText = pendingTextTemplate.replace('{count}', count);
                syncIndicator.innerHTML = `
                    <svg class="h-5 w-5 text-amber-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"></path></svg>
                    <span>${pendingText}</span>
                `;
            } else {
                syncIndicator.innerHTML = `
                    <svg class="h-5 w-5 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                    <span>${syncedText}</span>
                `;
            }
        };
    } catch (error) {
        console.error("Could not update sync indicator:", error);
    }
}

async function addToSyncQueue(action) {
    await putToDB('syncQueue', action);
    if (!navigator.onLine) {
        showMessageBox("تم الحفظ محليًا وسيتم المزامنة عند توفر الإنترنت.");
    }
    updateSyncIndicator();
}

async function processSyncQueue() {
    if (!navigator.onLine || isSyncing) return;
    isSyncing = true;
    await updateSyncIndicator();
    let syncedActions = false;
    try {
        if (!localDB) await openDB();
        
        const tx = localDB.transaction('syncQueue', 'readwrite');
        const store = tx.objectStore('syncQueue');

        const getAllKeysPromise = new Promise((resolve, reject) => {
            const request = store.getAllKeys();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        const getAllValuesPromise = new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        const [keys, values] = await Promise.all([getAllKeysPromise, getAllValuesPromise]);
        const actions = values.map((val, i) => ({ ...val, key: keys[i] }));

        if (actions.length > 0) {
            for (const action of actions) {
                const { type, path, data, id, key, options } = action;
                
                if (type === 'set') {
                    await firestoreDB.doc(path).set(data, options || { merge: true });
                } else if (type === 'add') {
                    await firestoreDB.collection(path).doc(id).set(data, { merge: true });
                } else if (type === 'delete') {
                    console.log(`%c Firestore Deleting Path: ${path}`, 'color: red; font-weight: bold;');
                    await firestoreDB.doc(path).delete();
                }
                
                await deleteFromDB('syncQueue', key);
            }
            syncedActions = true;
        }
    } catch (error) {
        console.error("Error processing sync queue:", error);
        
    } finally {
        isSyncing = false;
        await updateSyncIndicator();
        if (syncedActions) {
            console.log("Sync complete. Refreshing UI data...");
            await fetchGroups();
            if (SELECTED_GROUP_ID) {
                await fetchStudents();
                await fetchAssignments();
                await fetchRecurringSchedules();
            }
        }
    }
}

function setLanguage(lang) {
    currentLang = lang;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-key]').forEach(elem => {
        const key = elem.getAttribute('data-key');
        if (translations[lang][key]) elem.innerText = translations[lang][key];
    });
    document.querySelectorAll('[data-key-placeholder]').forEach(elem => {
        const key = elem.getAttribute('data-key-placeholder');
        if (translations[lang][key]) elem.placeholder = translations[lang][key];
    });
    document.getElementById('languageToggleButton').innerText = lang === 'ar' ? 'EN' : 'ع';
    updateOnlineStatus();
    renderDayCheckboxes();
    if (TEACHER_ID) {
        fetchGroups();
    }
    if (SELECTED_GROUP_ID) {
        (async () => {
            await fetchStudents();
            fetchAssignments();
            fetchRecurringSchedules();
            renderAttendanceInputs();
            renderGradesInputs();
            renderPaymentInputs(); 
        })();
    }
}

function toggleLanguage() {
    const newLang = currentLang === 'ar' ? 'en' : 'ar';
    setLanguage(newLang);
    localStorage.setItem('learnaria-lang', newLang);
}

function loadInitialPreferences() {
    const savedLang = localStorage.getItem('learnaria-lang') || 'ar';
    setLanguage(savedLang);
    const isDarkMode = localStorage.getItem('learnaria-darkMode') === 'true';
    if (isDarkMode) {
        document.body.classList.add('dark-mode');
    }
    updateDarkModeIcons(isDarkMode);
    const lastTeacherId = localStorage.getItem('learnaria-teacherId');
    if(lastTeacherId) {
        let displayPhone = lastTeacherId;
        if (displayPhone.startsWith('+20')) {
            displayPhone = '0' + displayPhone.substring(3);
        }
        document.getElementById('teacherPhoneInput').value = displayPhone;
        setTeacher();
    }
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDarkMode = document.body.classList.contains('dark-mode');
    localStorage.setItem('learnaria-darkMode', isDarkMode);
    updateDarkModeIcons(isDarkMode);
}

function updateDarkModeIcons(isDarkMode) {
    const darkIcon = document.getElementById('darkModeIcon');
    const lightIcon = document.getElementById('lightModeIcon');
    if (isDarkMode) {
        darkIcon.classList.add('hidden');
        lightIcon.classList.remove('hidden');
    } else {
        darkIcon.classList.remove('hidden');
        lightIcon.classList.add('hidden');
    }
}

function initializeTabs() {
    const tabsNav = document.getElementById('tabs-nav');
    const tabButtons = tabsNav.querySelectorAll('.tab-button');
    const tabContents = document.getElementById('tabs-content').querySelectorAll('.tab-content');
    tabsNav.addEventListener('click', (e) => {
        const targetButton = e.target.closest('.tab-button');
        if (!targetButton || targetButton.disabled) return;
        const tabName = targetButton.dataset.tab;
        tabButtons.forEach(button => button.classList.remove('active'));
        targetButton.classList.add('active');
        tabContents.forEach(content => {
            if (content.id === `tab-${tabName}`) {
                content.classList.remove('hidden');
            } else {
                content.classList.add('hidden');
            }
        });
    });
}

function logout() {
    localStorage.removeItem('learnaria-teacherId');
    location.reload();
}

function setupAllEventListeners() {
    if (areEventListenersSetup) {
        return;
    }

    document.getElementById('setTeacherButton').addEventListener('click', setTeacher);
    document.getElementById('saveProfileButton').addEventListener('click', saveTeacherProfile);
    document.getElementById('addNewGroupButton').addEventListener('click', addNewGroup);
    document.getElementById('groupSelect').addEventListener('change', handleGroupSelection);
    document.getElementById('addNewStudentButton').addEventListener('click', addNewStudent);
    document.getElementById('studentSearchInput').addEventListener('input', handleStudentSearch);
    document.getElementById('attendanceDateInput').addEventListener('change', renderAttendanceInputs);
    document.getElementById('saveDailyAttendanceButton').addEventListener('click', saveDailyAttendance);
    document.getElementById('assignmentSelect').addEventListener('change', renderGradesInputs);
    document.getElementById('addNewAssignmentButton').addEventListener('click', addNewAssignment);
    document.getElementById('saveAssignmentGradesButton').addEventListener('click', saveAssignmentGrades);
    document.getElementById('addRecurringScheduleButton').addEventListener('click', saveRecurringSchedule);
    document.getElementById('updateSingleClassButton').addEventListener('click', updateSingleClass);
    document.getElementById('cancelSingleClassButton').addEventListener('click', cancelSingleClass);
    document.getElementById('darkModeToggleButton').addEventListener('click', toggleDarkMode);
    document.getElementById('languageToggleButton').addEventListener('click', toggleLanguage);
    document.getElementById('logoutButton').addEventListener('click', logout);
    document.getElementById('closeQrModal').addEventListener('click', () => qrCodeModal.classList.add('hidden'));
    document.getElementById('closeScannerModal').addEventListener('click', stopScanner);
    document.getElementById('scanAttendanceButton').addEventListener('click', () => startScanner('attendance'));
    document.getElementById('scanHomeworkButton').addEventListener('click', () => startScanner('homework'));
    document.getElementById('printIdButton').addEventListener('click', () => window.print());
    
    // Payments Listeners
    document.getElementById('paymentMonthInput').addEventListener('change', renderPaymentInputs);
    document.getElementById('savePaymentsButton').addEventListener('click', saveMonthlyPayments);
    document.getElementById('scanPaymentsButton').addEventListener('click', () => startScanner('payments'));

     const studentsListContainer = document.getElementById('studentsListDisplay');
    if (studentsListContainer) {
        studentsListContainer.addEventListener('click', function(event) {
            const target = event.target;
            const studentElement = target.closest('.record-item');
            if (!studentElement) return;

            const studentId = studentElement.dataset.studentId;

            if (target.classList.contains('delete-student-btn')) {
                if (studentId) {
                    deleteStudent(studentId);
                }
            }

            if (target.classList.contains('show-qr-btn')) {
                const student = allStudents.find(s => s.id === studentId);
                if (student) {
                    showStudentQRCode(student);
                }
            }
        });
    }

    setupPhoneNumberInput('teacherPhoneInput');
    setupPhoneNumberInput('newParentPhoneNumber');

    addEnterKeyListeners();

    areEventListenersSetup = true;
    console.log("All event listeners have been set up successfully, and will not be set up again.");
}

document.addEventListener('DOMContentLoaded', async function() {
    statusIndicator = document.getElementById('statusIndicator');
    syncIndicator = document.getElementById('syncIndicator');
    qrCodeModal = document.getElementById('qrCodeModal');
    scannerModal = document.getElementById('scannerModal');
    videoElement = document.getElementById('scannerVideo');
    
    try {
        await openDB();
    } catch (error) {
        console.error("Initial database open failed. App might be unstable.");
    }
    
    setupAllEventListeners();

    createTimePicker('recurringTimeContainer');
    createTimePicker('exceptionNewTimeContainer');

    initializeTabs();
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();
    
    window.addEventListener('online', processSyncQueue);
    loadInitialPreferences();
    processSyncQueue();
});

function renderDayCheckboxes() {
    const container = document.getElementById('daysOfWeekContainer');
    const days = translations[currentLang].days;
    container.innerHTML = '';
    days.forEach((day, index) => {
        const label = document.createElement('label');
        label.className = 'day-checkbox-container';
        label.innerHTML = `
            <input type="checkbox" class="day-checkbox" value="${index}">
            <span>${day}</span>
        `;
        container.appendChild(label);
    });
}

function addEnterKeyListeners() {
    const listenForEnter = (elementId, actionFunction) => {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener('keydown', function(event) {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    actionFunction();
                }
            });
        }
    };
    listenForEnter('teacherPhoneInput', setTeacher);
    listenForEnter('newGroupName', addNewGroup);
    listenForEnter('newParentPhoneNumber', addNewStudent);
    listenForEnter('newAssignmentDate', addNewAssignment);
}

async function setTeacher() {
    try {
        const phoneInput = document.getElementById('teacherPhoneInput').value;
        
        if (!isValidEgyptianPhoneNumber(phoneInput)) {
            showMessageBox('invalidPhoneFormat');
            return;
        }
        const formattedPhone = formatPhoneNumber(phoneInput);
        if (!formattedPhone) {
             showMessageBox('invalidPhoneFormat');
             return;
        }
        TEACHER_ID = formattedPhone;

        localStorage.setItem('learnaria-teacherId', TEACHER_ID);
        document.getElementById('teacherPhoneInput').disabled = true;
        document.getElementById('setTeacherButton').disabled = true;
        document.getElementById('logoutButton').classList.remove('hidden');
        let teacherData = await getFromDB('teachers', TEACHER_ID);
        if (navigator.onLine) {
            const teacherDoc = await firestoreDB.collection('teachers').doc(TEACHER_ID).get();
            if (teacherDoc.exists) {
                const remoteData = { id: teacherDoc.id, ...teacherDoc.data() };
                teacherData = remoteData;
                await putToDB('teachers', remoteData);
            }
        }
        const welcomeMsg = translations[currentLang].welcomeMessage;
        if (teacherData) {
            document.getElementById('dashboardTitle').innerText = `${welcomeMsg} ${teacherData.name || TEACHER_ID}`;
            document.getElementById('teacherNameInput').value = teacherData.name || '';
            document.getElementById('teacherSubjectInput').value = teacherData.subject || '';
        } else {
            document.getElementById('dashboardTitle').innerText = `${welcomeMsg} ${TEACHER_ID}`;
            showMessageBox('completeProfileMessage');
        }
        document.getElementById('mainContent').classList.remove('hidden');
        fetchGroups();
    } catch (error) {
        console.error("Error setting teacher:", error);
        showMessageBox("فشل تحميل بيانات المدرس.");
    }
}

async function saveTeacherProfile() {
    try {
        if (!TEACHER_ID) return;
        const teacherName = document.getElementById('teacherNameInput').value.trim();
        const teacherSubject = document.getElementById('teacherSubjectInput').value.trim();
        if (!teacherName || !teacherSubject) {
            showMessageBox('nameAndSubjectMissing');
            return;
        }
        const profileData = { id: TEACHER_ID, name: teacherName, subject: teacherSubject };
        await putToDB('teachers', profileData);
        showMessageBox('profileSavedSuccess');
        document.getElementById('dashboardTitle').innerText = `${translations[currentLang].welcomeMessage} ${teacherName}`;
        await addToSyncQueue({
            type: 'set',
            path: `teachers/${TEACHER_ID}`,
            data: { name: teacherName, subject: teacherSubject }
        });
        processSyncQueue();
    } catch (error) {
        console.error("Error saving profile:", error);
        showMessageBox('profileSavedError');
    }
}

async function fetchGroups() {
    try {
        if (!TEACHER_ID) return;
        let groups = await getAllFromDB('groups', 'teacherId', TEACHER_ID);
        renderGroupSelect(groups);
        if (navigator.onLine) {
            const snapshot = await firestoreDB.collection(`teachers/${TEACHER_ID}/groups`).get();
            const remoteGroups = snapshot.docs.map(doc => ({ id: doc.id, teacherId: TEACHER_ID, ...doc.data() }));
            await Promise.all(remoteGroups.map(group => putToDB('groups', group)));
            renderGroupSelect(remoteGroups);
        }
    } catch (error) {
        console.error('Error fetching groups:', error);
    }
}

function renderGroupSelect(groups) {
    const groupSelect = document.getElementById('groupSelect');
    const currentGroup = groupSelect.value;
    groupSelect.innerHTML = `<option value="">${translations[currentLang].selectGroupOption}</option>`;
    groups.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.innerText = group.name;
        groupSelect.appendChild(option);
    });
    if (currentGroup && groups.some(g => g.id === currentGroup)) {
        groupSelect.value = currentGroup;
    }
}

async function addNewGroup() {
    try {
        if (!TEACHER_ID) return;
        const groupName = document.getElementById('newGroupName').value.trim();
        if (!groupName) {
            showMessageBox('groupNameMissing');
            return;
        }
        const newGroupId = generateUniqueId();
        const newGroupData = { id: newGroupId, teacherId: TEACHER_ID, name: groupName };
        await putToDB('groups', newGroupData);
        showMessageBox('groupAddedSuccess');
        document.getElementById('newGroupName').value = '';
        await fetchGroups();
        await addToSyncQueue({
            type: 'add',
            path: `teachers/${TEACHER_ID}/groups`,
            id: newGroupId,
            data: { name: groupName }
        });
        processSyncQueue();
    } catch (error) {
        console.error("Error adding new group:", error);
        showMessageBox('groupAddedError');
    }
}

async function handleGroupSelection() {
    SELECTED_GROUP_ID = document.getElementById('groupSelect').value;
    const tabs = document.querySelectorAll('#tabs-nav .tab-button');

    const subjectInput = document.getElementById('recurringSubject');
    const teacherSubject = document.getElementById('teacherSubjectInput').value;
    if (subjectInput) {
        subjectInput.value = teacherSubject;
        subjectInput.disabled = true; 
    }

    if (SELECTED_GROUP_ID) {
        tabs.forEach(tab => {
            if (tab.dataset.tab !== 'profile') {
                tab.disabled = false;
            }
        });
        await fetchStudents();
        fetchAssignments();
        fetchRecurringSchedules();
        document.getElementById('attendanceDateInput').value = new Date().toISOString().split('T')[0];
        
        // Initialize Payment Month
        document.getElementById('paymentMonthInput').value = new Date().toISOString().slice(0, 7);
        
        renderAttendanceInputs();
        renderGradesInputs();
        renderPaymentInputs();
        
        document.querySelector('.tab-button[data-tab="students"]').click();
    } else {
        tabs.forEach(tab => {
            if (tab.dataset.tab !== 'profile') {
                tab.disabled = true;
            }
        });
        document.querySelector('.tab-button[data-tab="profile"]').click();
    }
}

async function fetchStudents() {
    try {
        if (!SELECTED_GROUP_ID) {
            allStudents = [];
            renderStudentsList(document.getElementById('studentsListDisplay'), allStudents);
            return;
        }
        allStudents = await getAllFromDB('students', 'groupId', SELECTED_GROUP_ID);
        renderStudentsList(document.getElementById('studentsListDisplay'), allStudents);
        if (navigator.onLine) {
            const snapshot = await firestoreDB.collection(`teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/students`).get();
            const remoteStudents = snapshot.docs.map(doc => ({ id: doc.id, groupId: SELECTED_GROUP_ID, ...doc.data() }));
            await Promise.all(remoteStudents.map(student => putToDB('students', student)));
            allStudents = remoteStudents;
            renderStudentsList(document.getElementById('studentsListDisplay'), allStudents);
        }
    } catch (error) {
        console.error('Error fetching students:', error);
    }
}

function renderStudentsList(containerElement, students) {
    containerElement.innerHTML = '';
    if (students.length === 0) {
        containerElement.innerHTML = `<p class="text-grey-600 text-center p-4">${translations[currentLang].noStudentsInGroup}</p>`;
        return;
    }
    const parentLabel = translations[currentLang].parentLabel;
    const notAvailable = translations[currentLang].notAvailable;
    const deleteBtnText = translations[currentLang].deleteButton;

    students.forEach(student => {
        const studentElement = document.createElement('div');
        studentElement.className = 'record-item';
        
        studentElement.dataset.studentId = student.id;
        
        studentElement.innerHTML = `
            <div class="flex items-center">
                <button class="show-qr-btn bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold p-2 rounded-md mx-2">ID</button>
                <div>
                    <p class="font-semibold text-grey-800">${student.name}</p>
                    <p class="text-sm text-grey-600">${parentLabel} ${student.parentPhoneNumber || notAvailable}</p>
                </div>
            </div>
            <button class="delete-student-btn bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-2 rounded text-sm">${deleteBtnText}</button>
        `;
        containerElement.appendChild(studentElement);
    });
}

function handleStudentSearch(event) {
    const searchTerm = event.target.value.toLowerCase();
    if (!searchTerm) {
        renderStudentsList(document.getElementById('studentsListDisplay'), allStudents);
        return;
    }
    const filteredStudents = allStudents.filter(student => student.name.toLowerCase().includes(searchTerm));
    renderStudentsList(document.getElementById('studentsListDisplay'), filteredStudents);
}

async function addNewStudent() {
    try {
        if (!TEACHER_ID || !SELECTED_GROUP_ID) return;
        const studentName = document.getElementById('newStudentName').value.trim();
        const parentPhoneInput = document.getElementById('newParentPhoneNumber').value;

        if (!studentName) {
            showMessageBox('studentAndParentMissing');
            return;
        }

        if (!isValidEgyptianPhoneNumber(parentPhoneInput)) {
            showMessageBox('invalidPhoneFormat');
            return;
        }
        const formattedParentPhone = formatPhoneNumber(parentPhoneInput);
        if (!formattedParentPhone) {
            showMessageBox('invalidPhoneFormat');
            return;
        }

        const newStudentId = generateUniqueId();
        const newStudentData = {
            id: newStudentId,
            groupId: SELECTED_GROUP_ID,
            name: studentName,
            parentPhoneNumber: formattedParentPhone
        };

        await putToDB('students', newStudentData);
        
        await addToSyncQueue({
            type: 'add',
            path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/students`,
            id: newStudentId,
            data: { name: studentName, parentPhoneNumber: formattedParentPhone }
        });
        
        processSyncQueue();
        
        showMessageBox('studentAddedSuccess');
        
        document.getElementById('newStudentName').value = '';
        document.getElementById('newParentPhoneNumber').value = '';
        
        await fetchStudents();
        renderAttendanceInputs();
        renderGradesInputs();
        renderPaymentInputs();

    } catch (error) {
        console.error("Error adding student:", error);
        showMessageBox('studentAddedError');
    }
}
async function deleteStudent(studentId) {
    const studentToDelete = allStudents.find(s => s.id === studentId);
    if (!studentToDelete) return;
    const confirmMsg = `${translations[currentLang].deleteConfirmation} ${studentToDelete.name}?`;
    if (!confirm(confirmMsg)) {
        return;
    }

    try {
        if (!TEACHER_ID || !SELECTED_GROUP_ID || !studentId) return;

        await deleteFromDB('students', studentId);
        await addToSyncQueue({
            type: 'delete',
            path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/students/${studentId}`
        });
        processSyncQueue();
        showMessageBox('studentDeletedSuccess');
        
        await fetchStudents();
        renderAttendanceInputs();
        renderGradesInputs();
        renderPaymentInputs();

    } catch (error) {
        console.error("Error deleting student:", error);
        showMessageBox('studentDeletedError');
    }
}

async function renderAttendanceInputs() {
    try {
        const attendanceDate = document.getElementById('attendanceDateInput').value;
        const container = document.getElementById('attendanceStudentsContainer');
        container.innerHTML = ''; 
        if (!attendanceDate) {
            container.innerHTML = `<p class="text-grey-600 text-center p-4">${translations[currentLang].noDateSelected}</p>`;
            return;
        }
        if (!allStudents || allStudents.length === 0) {
            container.innerHTML = `<p class="text-grey-600 text-center p-4">${translations[currentLang].noStudentsAvailable}</p>`;
            return;
        }
        const attendanceId = `${SELECTED_GROUP_ID}_${attendanceDate}`;
        const doc = await getFromDB('attendance', attendanceId);
        let existingAttendance = {};
        if (doc && doc.records) {
            doc.records.forEach(record => {
                existingAttendance[record.studentId] = record.status;
            });
        }
        const absent = translations[currentLang].absent;
        const present = translations[currentLang].present;
        const late = translations[currentLang].late;
        allStudents.forEach(student => {
            const row = document.createElement('div');
            row.className = 'student-row';
            row.innerHTML = `
                <span class="student-name">${student.name}</span>
                <select class="attendance-status-select" data-student-id="${student.id}">
                    <option value="absent">${absent}</option>
                    <option value="present">${present}</option>
                    <option value="late">${late}</option>
                </select>
            `;
            container.appendChild(row);
            const select = row.querySelector('.attendance-status-select');
            select.value = existingAttendance[student.id] || 'absent';
        });
    } catch (error) {
        console.error("Error rendering attendance:", error);
    }
}

async function saveDailyAttendance() {
    try {
        if (!TEACHER_ID || !SELECTED_GROUP_ID) return;
        const attendanceDate = document.getElementById('attendanceDateInput').value;
        if (!attendanceDate) {
            showMessageBox('attendanceDateMissing');
            return;
        }
        const records = [];
        document.querySelectorAll('#attendanceStudentsContainer .attendance-status-select').forEach(select => {
            records.push({ studentId: select.dataset.studentId, status: select.value });
        });
        const attendanceId = `${SELECTED_GROUP_ID}_${attendanceDate}`;
        const attendanceData = {
            id: attendanceId,
            date: attendanceDate,
            records: records
        };
        await putToDB('attendance', attendanceData);
        showMessageBox('attendanceSavedSuccess');
        await addToSyncQueue({
            type: 'set',
            path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/dailyAttendance/${attendanceDate}`,
            data: { date: attendanceDate, records: records }
        });
        processSyncQueue();
    } catch (error) {
        console.error("Error saving attendance:", error);
        showMessageBox('attendanceSavedError');
    }
}

async function fetchAssignments() {
    try {
        if (!SELECTED_GROUP_ID) return;
        const localAssignments = await getAllFromDB('assignments', 'groupId', SELECTED_GROUP_ID);
        renderAssignmentSelect(localAssignments);
        if (navigator.onLine) {
            const snapshot = await firestoreDB.collection(`teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/assignments`).get();
            const remoteAssignments = snapshot.docs.map(doc => ({ id: doc.id, groupId: SELECTED_GROUP_ID, ...doc.data() }));
            await Promise.all(remoteAssignments.map(asm => putToDB('assignments', asm)));
            renderAssignmentSelect(remoteAssignments);
        }
    } catch (error) {
        console.error('Error fetching assignments:', error);
    }
}

function renderAssignmentSelect(assignments) {
    const select = document.getElementById('assignmentSelect');
    const currentAssignment = select.value;
    select.innerHTML = `<option value="">${translations[currentLang].selectAssignmentOption}</option>`;
    assignments.sort((a, b) => b.date.localeCompare(a.date));
    assignments.forEach(doc => {
        const option = document.createElement('option');
        option.value = doc.id;
        option.innerText = `${doc.name} (${doc.date})`;
        select.appendChild(option);
    });
    if (currentAssignment && assignments.some(a => a.id === currentAssignment)) {
       select.value = currentAssignment;
    }
}

async function renderGradesInputs() {
    try {
        const assignmentId = document.getElementById('assignmentSelect').value;
        const container = document.getElementById('gradesStudentsContainer');
        container.innerHTML = '';
        if (!assignmentId) {
            container.innerHTML = `<p class="text-grey-600 text-center p-4">${translations[currentLang].noAssignmentSelected}</p>`;
            return;
        }
        if (!allStudents || allStudents.length === 0) {
            container.innerHTML = `<p class="text-grey-600 text-center p-4">${translations[currentLang].noStudentsAvailable}</p>`;
            return;
        }
        let existingScores = {};
        const assignmentDoc = await getFromDB('assignments', assignmentId);
        if (assignmentDoc && assignmentDoc.scores) {
            existingScores = assignmentDoc.scores;
        }
        allStudents.forEach(student => {
            const studentData = existingScores[student.id] || { score: '', submitted: false };
            const row = document.createElement('div');
            row.className = 'student-row';
            row.innerHTML = `
                <span class="student-name">${student.name}</span>
                <div class="flex items-center">
                    <label class="homework-checkbox-container">
                        <input type="checkbox" class="homework-checkbox" data-student-id="${student.id}" ${studentData.submitted ? 'checked' : ''}>
                        <span>سلّم الواجب</span>
                    </label>
                    <input type="number" class="grade-input" data-student-id="${student.id}" min="0" max="100" placeholder="${translations[currentLang].scorePlaceholder}" value="${studentData.score || ''}">
                </div>
            `;
            container.appendChild(row);
        });
    } catch (error) {
        console.error("Error rendering grades inputs:", error);
    }
}

async function addNewAssignment() {
    try {
        if (!TEACHER_ID || !SELECTED_GROUP_ID) return;
        const name = document.getElementById('newAssignmentName').value.trim();
        const date = document.getElementById('newAssignmentDate').value;
        if (!name || !date) {
            showMessageBox('assignmentNameDateMissing');
            return;
        }
        const newAssignmentId = generateUniqueId();
        const newAssignmentData = {
            id: newAssignmentId,
            groupId: SELECTED_GROUP_ID,
            name: name,
            date: date,
            scores: {}
        };
        await putToDB('assignments', newAssignmentData);
        showMessageBox('assignmentAddedSuccess');
        await fetchAssignments();
        document.getElementById('assignmentSelect').value = newAssignmentId;
        renderGradesInputs();
        document.getElementById('newAssignmentName').value = '';
        document.getElementById('newAssignmentDate').value = '';
        await addToSyncQueue({
            type: 'add',
            path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/assignments`,
            id: newAssignmentId,
            data: { name, date, scores: {} }
        });
        processSyncQueue();
    } catch (error) {
        console.error("Error adding assignment:", error);
        showMessageBox("assignmentAddedError");
    }
}

async function saveAssignmentGrades() {
    try {
        const assignmentId = document.getElementById('assignmentSelect').value;
        if (!TEACHER_ID || !SELECTED_GROUP_ID || !assignmentId) {
            showMessageBox('selectAssignmentFirst');
            return;
        }

        const assignment = await getFromDB('assignments', assignmentId);
        if (!assignment) {
            showMessageBox('gradesSavedError');
            console.error("Could not find assignment to save grades for:", assignmentId);
            return;
        }

        const updatedScores = assignment.scores ? { ...assignment.scores } : {};

        document.querySelectorAll('#gradesStudentsContainer .student-row').forEach(row => {
            const gradeInput = row.querySelector('.grade-input');
            const checkbox = row.querySelector('.homework-checkbox');
            if (gradeInput && checkbox) {
                const studentId = gradeInput.dataset.studentId;
                updatedScores[studentId] = {
                    score: gradeInput.value !== '' ? parseInt(gradeInput.value, 10) : '',
                    submitted: checkbox.checked
                };
            }
        });

        assignment.scores = updatedScores;
        await putToDB('assignments', assignment);
        showMessageBox('gradesSavedSuccess');

        await addToSyncQueue({
            type: 'set',
            path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/assignments/${assignmentId}`,
            data: { scores: updatedScores },
            options: { merge: true }
        });
        processSyncQueue();

    } catch (error) {
        console.error("Error saving grades:", error);
        showMessageBox("gradesSavedError");
    }
}
async function saveRecurringSchedule() {
    if (!TEACHER_ID || !SELECTED_GROUP_ID) return;
    
    const subject = document.getElementById('recurringSubject').value.trim();
    const time = getTimeFromPicker('recurringTimeContainer');
    const location = document.getElementById('recurringLocation').value.trim();
    const selectedDays = Array.from(document.querySelectorAll('#daysOfWeekContainer input:checked')).map(cb => parseInt(cb.value));

    if (!subject || !time || selectedDays.length === 0) {
        showMessageBox('fillScheduleForm');
        return;
    }

    const newScheduleId = generateUniqueId();
    const scheduleData = {
        id: newScheduleId,
        groupId: SELECTED_GROUP_ID,
        subject,
        time,
        location,
        days: selectedDays
    };

    try {
        await putToDB('schedules', scheduleData);
        await addToSyncQueue({
            type: 'add',
            path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/recurringSchedules`,
            id: newScheduleId,
            data: { subject, time, location, days: selectedDays }
        });
        processSyncQueue();
        showMessageBox('scheduleSavedSuccess');
        
        createTimePicker('recurringTimeContainer'); // Reset the time picker
        document.getElementById('recurringLocation').value = '';
        document.querySelectorAll('#daysOfWeekContainer input:checked').forEach(cb => cb.checked = false);
        
        fetchRecurringSchedules();

    } catch (error) {
        console.error('Error saving recurring schedule:', error);
        showMessageBox('scheduleSavedError');
    }
}

async function fetchRecurringSchedules() {
    if (!SELECTED_GROUP_ID) return;
    const container = document.getElementById('recurringSchedulesDisplay');
    container.innerHTML = `<p class="text-grey-600 text-center p-4">${translations[currentLang].loadingSchedules}</p>`;
    
    try {
        let schedules = await getAllFromDB('schedules', 'groupId', SELECTED_GROUP_ID);
        renderSchedules(schedules);

        if (navigator.onLine) {
            const snapshot = await firestoreDB.collection(`teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/recurringSchedules`).get();
            const remoteSchedules = snapshot.docs.map(doc => ({ id: doc.id, groupId: SELECTED_GROUP_ID, ...doc.data() }));
            
            await Promise.all(remoteSchedules.map(schedule => putToDB('schedules', schedule)));
            
            renderSchedules(remoteSchedules);
        }
    } catch (error) {
        console.error('Error fetching recurring schedules:', error);
        container.innerHTML = '<p class="text-primary-red text-center">Failed to load schedules.</p>';
    }
}

function renderSchedules(schedules) {
    const container = document.getElementById('recurringSchedulesDisplay');
    container.innerHTML = '';

    if (!schedules || schedules.length === 0) {
        container.innerHTML = `<p class="text-grey-600 text-center p-4">${translations[currentLang].noSchedulesYet}</p>`;
        return;
    }

    schedules.forEach(schedule => {
        const dayNames = schedule.days.map(dayIndex => translations[currentLang].days[dayIndex] || '').join(', ');
        const locationText = schedule.location ? ` - ${schedule.location}` : '';

        const timeText = formatTime12Hour(schedule.time); 

        const element = document.createElement('div');
        element.className = 'record-item';
        element.innerHTML = `
            <div>
                <p class="font-semibold text-grey-800">${schedule.subject} at ${timeText}${locationText}</p>
                <p class="text-sm text-grey-600">${translations[currentLang].repeatsOn} ${dayNames}</p>
            </div>
            <button class="delete-schedule-btn bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-2 rounded text-sm" data-schedule-id="${schedule.id}">${translations[currentLang].deleteButton}</button>
        `;
        container.appendChild(element);

        element.querySelector('.delete-schedule-btn').addEventListener('click', function() {
            if (confirm(translations[currentLang].confirmScheduleDelete)) {
                deleteRecurringSchedule(this.dataset.scheduleId);
            }
        });
    });
}
async function deleteRecurringSchedule(scheduleId) {
    if (!TEACHER_ID || !SELECTED_GROUP_ID || !scheduleId) return;
    try {
        await deleteFromDB('schedules', scheduleId);
        await addToSyncQueue({
            type: 'delete',
            path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/recurringSchedules/${scheduleId}`
        });
        processSyncQueue();
        showMessageBox('scheduleDeletedSuccess');
        fetchRecurringSchedules();
    } catch (error) {
        console.error('Error deleting schedule:', error);
        showMessageBox('scheduleDeletedError');
    }
}

async function updateSingleClass() {
    if (!TEACHER_ID || !SELECTED_GROUP_ID) return;
    const date = document.getElementById('exceptionDate').value;
    const newTime = getTimeFromPicker('exceptionNewTimeContainer');

    if (!date || !newTime) {
        showMessageBox('classDateAndTimeMissing');
        return;
    }
    
    // Logic to update the class...
    console.log(`Updating class on ${date} to ${newTime}`);
    showMessageBox('classUpdatedSuccess', { date: date, time: formatTime12Hour(newTime) });
}
async function cancelSingleClass() { }

function playBeepSound() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (!audioContext) return;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.15);
}

function playErrorSound() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (!audioContext) return;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.2);
}

function showStudentQRCode(student) {
    const data = { teacherId: TEACHER_ID, groupId: SELECTED_GROUP_ID, studentId: student.id };
    document.getElementById('idQrcode').innerHTML = '';
    new QRCode(document.getElementById('idQrcode'), {
        text: JSON.stringify(data),
        width: 180,
        height: 180,
        correctLevel : QRCode.CorrectLevel.H
    });
    const teacherName = document.getElementById('teacherNameInput').value || 'Teacher';
    document.getElementById('idTeacherName').innerText = `Teacher: ${teacherName}`;
    document.getElementById('idStudentName').innerText = student.name;
    qrCodeModal.classList.remove('hidden');
}

async function startScanner(mode) {
    isScannerPaused = false;
    currentScannerMode = mode;
    scannerModal.classList.remove('hidden');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        videoElement.srcObject = stream;
        await videoElement.play();
        animationFrameId = requestAnimationFrame(tick);
    } catch (err) {
        console.error("Camera Error:", err);
        showMessageBox("لا يمكن الوصول للكاميرا. الرجاء التأكد من السماح للمتصفح باستخدامها.");
        stopScanner();
    }
}

function stopScanner() {
    isScannerPaused = false;
    if (videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
    }
    scannerModal.classList.add('hidden');
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
}

function tick() {
    if (isScannerPaused) {
        animationFrameId = requestAnimationFrame(tick);
        return;
    }
    if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
        const canvasElement = document.createElement('canvas');
        const canvas = canvasElement.getContext('2d');
        canvasElement.height = videoElement.videoHeight;
        canvasElement.width = videoElement.videoWidth;
        canvas.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
        const imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
        if (code) {
            isScannerPaused = true;
            processScannedData(code.data);
            setTimeout(() => {
                isScannerPaused = false;
            }, 2000);
        }
    }
    animationFrameId = requestAnimationFrame(tick);
}

function processScannedData(dataString) {
    const overlay = document.getElementById('scannerOverlay');
    try {
        const data = JSON.parse(dataString);
        if (data.teacherId === TEACHER_ID && data.groupId === SELECTED_GROUP_ID && data.studentId) {
            const student = allStudents.find(s => s.id === data.studentId);
            if (student) {
                playBeepSound();
                const nameDisplay = document.getElementById('scannedStudentName');
                nameDisplay.innerText = student.name;
                nameDisplay.style.opacity = '1';
                overlay.classList.add('success');
                setTimeout(() => {
                    overlay.classList.remove('success');
                    nameDisplay.style.opacity = '0';
                }, 1500);
                if (currentScannerMode === 'attendance') {
                    const selectElement = document.querySelector(`#attendanceStudentsContainer .attendance-status-select[data-student-id="${data.studentId}"]`);
                    if (selectElement) {
                        selectElement.value = 'present';
                        selectElement.closest('.student-row').style.backgroundColor = '#d1fecb';
                    }
                } else if (currentScannerMode === 'homework') {
                    const checkboxElement = document.querySelector(`#gradesStudentsContainer .homework-checkbox[data-student-id="${data.studentId}"]`);
                    if (checkboxElement) {
                        checkboxElement.checked = true;
                        checkboxElement.closest('.student-row').style.backgroundColor = '#d1fecb';
                    }
                } else if (currentScannerMode === 'payments') {
                     const checkboxElement = document.querySelector(`#paymentsStudentsContainer .payment-checkbox[data-student-id="${data.studentId}"]`);
                     if (checkboxElement) {
                         checkboxElement.checked = true;
                         // Manually trigger the visual update
                         const row = checkboxElement.closest('.student-row');
                         const statusText = row.querySelector('.payment-status-text');
                         if(statusText) {
                             statusText.innerText = translations[currentLang].paidLabel;
                             statusText.className = "mx-2 text-sm font-semibold text-green-600 payment-status-text";
                         }
                         row.style.backgroundColor = '#d1fecb';
                     }
                }
            } else {
                throw new Error("Student not found in this group.");
            }
        } else {
            throw new Error("Invalid QR Code for this group/teacher.");
        }
    } catch (error) {
        console.error("QR Scan Error:", error.message);
        playErrorSound();
        overlay.classList.add('error');
        setTimeout(() => {
            overlay.classList.remove('error');
        }, 1500);
    }
}

// ======================= NEW PAYMENT FUNCTIONS =======================

async function renderPaymentInputs() {
    try {
        const month = document.getElementById('paymentMonthInput').value;
        const container = document.getElementById('paymentsStudentsContainer');
        container.innerHTML = ''; 

        if (!month) {
            container.innerHTML = `<p class="text-grey-600 text-center p-4">${translations[currentLang].paymentMonthMissing}</p>`;
            return;
        }
        if (!allStudents || allStudents.length === 0) {
            container.innerHTML = `<p class="text-grey-600 text-center p-4">${translations[currentLang].noStudentsAvailable}</p>`;
            return;
        }

        const paymentId = `${SELECTED_GROUP_ID}_${month}`;
        
        const doc = await getFromDB('payments', paymentId);
        let existingPayments = {};
        if (doc && doc.records) {
            doc.records.forEach(record => {
                existingPayments[record.studentId] = record.paid;
            });
        }

        const paidLabel = translations[currentLang].paidLabel;

        allStudents.forEach(student => {
            const isPaid = existingPayments[student.id] === true;
            
            const row = document.createElement('div');
            row.className = 'student-row';
            
            if(isPaid) row.style.backgroundColor = '#d1fecb';

            row.innerHTML = `
                <span class="student-name">${student.name}</span>
                <label class="flex items-center cursor-pointer">
                    <span class="mx-2 text-sm font-semibold ${isPaid ? 'text-green-600' : 'text-gray-500'} payment-status-text">
                        ${isPaid ? paidLabel : ''}
                    </span>
                    <input type="checkbox" class="payment-checkbox w-5 h-5 accent-green-600" 
                           data-student-id="${student.id}" 
                           ${isPaid ? 'checked' : ''}>
                </label>
            `;
            
            const checkbox = row.querySelector('.payment-checkbox');
            checkbox.addEventListener('change', (e) => {
                const statusText = row.querySelector('.payment-status-text');
                if(e.target.checked) {
                    statusText.innerText = translations[currentLang].paidLabel;
                    statusText.className = "mx-2 text-sm font-semibold text-green-600 payment-status-text";
                    row.style.backgroundColor = '#d1fecb';
                } else {
                    statusText.innerText = "";
                    row.style.backgroundColor = 'transparent';
                }
            });

            container.appendChild(row);
        });
    } catch (error) {
        console.error("Error rendering payments:", error);
    }
}

async function saveMonthlyPayments() {
    try {
        if (!TEACHER_ID || !SELECTED_GROUP_ID) return;
        
        const month = document.getElementById('paymentMonthInput').value;
        if (!month) {
            showMessageBox('paymentMonthMissing');
            return;
        }

        const records = [];
        document.querySelectorAll('#paymentsStudentsContainer .payment-checkbox').forEach(checkbox => {
            records.push({ 
                studentId: checkbox.dataset.studentId, 
                paid: checkbox.checked 
            });
        });

        const paymentId = `${SELECTED_GROUP_ID}_${month}`;
        const paymentData = {
            id: paymentId,
            month: month,
            records: records
        };

        await putToDB('payments', paymentData);
        
        showMessageBox('paymentsSavedSuccess');

        await addToSyncQueue({
            type: 'set',
            path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/payments/${month}`,
            data: { month: month, records: records }
        });
        
        processSyncQueue();

    } catch (error) {
        console.error("Error saving payments:", error);
        showMessageBox('paymentsSavedError');
    }
}