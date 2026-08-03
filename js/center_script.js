// ==========================================
// 1. FIREBASE CONFIG & INIT
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
    projectId: "learnaria-483e7",
    storageBucket: "spot-dev-17336.firebasestorage.app",
    messagingSenderId: "581004817275",
    appId: "1:581004817275:web:59c8d43a4c4aeae7fd43de",
    measurementId: "G-E4TN12XLED"
};

let activeConfig;
if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.protocol === "file:") {
    activeConfig = devConfig;
} else {
    activeConfig = prodConfig;
}

// Initialize Firebase
const app = firebase.initializeApp(activeConfig);
const firestoreDB = firebase.firestore();

if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    firebase.auth().useEmulator('http://127.0.0.1:9090/');
    firestoreDB.useEmulator('127.0.0.1', 8088);
    firebase.functions().useEmulator('127.0.0.1', 5011);
    console.log("🔌 Connected to Firebase Local Emulators (Auth, Firestore, Functions)");
}

// ==========================================
// 2. STATE VARIABLES
// ==========================================
let CENTER_ID = localStorage.getItem('learnaria-cid');
let centerData = null;
let centerTeachers = [];

// --- UI State Variables ---
let currentLang = localStorage.getItem('lang') || 'ar';
const translations = {
    ar: {
        centerDashboard: "لوحة تحكم السنتر",
        totalTeachers: "إجمالي المدرسين",
        totalStudents: "إجمالي الطلاب",
        loadingTeachers: "جاري تحميل المدرسين...",
        noTeachers: "لا يوجد مدرسين مرتبطين بهذا السنتر حتى الآن.",
        statistics: "إحصائيات",
        teacher: "المدرس",
        totalAttendance: "إجمالي الحضور",
        student: "طالب",
        revenueApprox: "التحصيل",
        currency: "ج.م",
        totalSessions: "إجمالي الحصص المعطاة",
        session: "حصة",
        errorLoadingStats: "حدث خطأ أثناء جلب الإحصائيات",
        backToHome: "الرئيسية",
        contactUs: "تواصل معنا",
        createTeacherBtn: "إنشاء حساب مدرس",
        createTeacherTitle: "إنشاء حساب مدرس جديد",
        fullNameLabel: "الاسم بالكامل",
        subjectLabel: "المادة",
        phoneLabel: "رقم الهاتف",
        passwordLabel: "كلمة المرور",
        verifyPasswordTitle: "تسجيل الدخول",
        verifyPasswordDesc: "يرجى إدخال كلمة المرور الخاصة بحساب المدرس للمتابعة.",
        passwordPlaceholder: "أدخل كلمة المرور",
        cancelBtn: "إلغاء",
        confirmBtn: "تأكيد"
    },
    en: {
        centerDashboard: "Center Dashboard",
        totalTeachers: "Total Teachers",
        totalStudents: "Total Students",
        loadingTeachers: "Loading teachers...",
        noTeachers: "No teachers linked to this center yet.",
        statistics: "Statistics",
        teacher: "Teacher",
        totalAttendance: "Total Attendance",
        student: "Student",
        revenueApprox: "Revenue",
        currency: "EGP",
        totalSessions: "Total Sessions Given",
        session: "Session",
        errorLoadingStats: "Error loading statistics",
        backToHome: "Home",
        contactUs: "Contact Us",
        passwordLabel: "Password",
        verifyPasswordTitle: "Login",
        verifyPasswordDesc: "Please enter the teacher's password to proceed.",
        passwordPlaceholder: "Enter Password",
        cancelBtn: "Cancel",
        confirmBtn: "Confirm"
    }
};

// ==========================================
// 3. INITIALIZATION
// ==========================================
async function initCenterDashboard() {
    console.log("initCenterDashboard started. CENTER_ID =", CENTER_ID);
    if (!CENTER_ID) {
        alert("Debug: No CENTER_ID found. Redirecting to dashboard.");
        window.location.href = 'dashboard.html';
        return;
    }

    try {
        console.log("Fetching center doc for:", CENTER_ID);
        const centerDoc = await firestoreDB.collection('centers').doc(CENTER_ID).get();
        if (!centerDoc.exists) {
            alert("Debug: centerDoc does not exist for ID: " + CENTER_ID);
            localStorage.removeItem('learnaria-cid');
            window.location.href = 'dashboard.html';
            return;
        }

        centerData = { id: centerDoc.id, ...centerDoc.data() };
        console.log("Center data loaded:", centerData);
        
        // Update UI with center info
        document.getElementById('centerNameTitle').innerText = centerData.name || 'لوحة تحكم السنتر';
        
        // Hide landing, show dashboard
        const landing = document.getElementById('landingSection');
        if (landing) landing.classList.add('hidden');
        
        const main = document.getElementById('mainContent');
        if (main) main.classList.remove('hidden');
        
        const logoutBtn = document.getElementById('logoutButton');
        if (logoutBtn) {
            logoutBtn.classList.remove('hidden');
            logoutBtn.onclick = handleLogout;
        }
        
        await loadCenterData();

    } catch (error) {
        console.error("Error initializing center dashboard:", error);
        alert("حدث خطأ أثناء تحميل بيانات السنتر.");
        
        const logoutBtn = document.getElementById('logoutButton');
        if (logoutBtn) {
            logoutBtn.classList.remove('hidden');
            logoutBtn.onclick = handleLogout;
        }
    }
}

// ==========================================
// 4. LOAD DATA
// ==========================================
async function loadCenterData() {
    // 1. Fetch all teachers in this center
    const teacherRefs = centerData.teachers || [];
    centerTeachers = [];

    let totalStudents = 0;
    
    // UI Elements
    const teachersListEl = document.getElementById('centerTeachersList');
    teachersListEl.innerHTML = `<div class="col-span-full text-center py-10"><i class="ri-loader-4-line animate-spin text-4xl text-brand"></i><p class="mt-2 text-gray-500 font-bold">${translations[currentLang].loadingTeachers}</p></div>`;

    if (teacherRefs.length === 0) {
        teachersListEl.innerHTML = `<div class="col-span-full text-center py-10 text-gray-500 font-bold bg-white dark:bg-darkCard rounded-3xl border border-dashed border-gray-200 dark:border-gray-800"><i class="ri-user-unfollow-line text-4xl mb-2"></i><p>${translations[currentLang].noTeachers}</p></div>`;
        document.getElementById('statTotalTeachers').innerText = '0';
        document.getElementById('statTotalStudents').innerText = '0';
        return;
    }

    let teachersHTML = '';

    for (const tid of teacherRefs) {
        const tDoc = await firestoreDB.collection('teachers').doc(tid).get();
        if (tDoc.exists) {
            const tData = { id: tDoc.id, ...tDoc.data() };
            
            // Calculate stats for this teacher
            // Since we don't want to load every single student doc right now (could be huge),
            // we will just count groups and approximate or if they store student count, use it.
            // Let's fetch groups for this teacher to count students
            const groupsSnapshot = await firestoreDB.collection(`teachers/${tid}/groups`).get();
            let teacherStudentsCount = 0;
            
            for (const gDoc of groupsSnapshot.docs) {
                // If they maintain a studentCount, use it. Else we have to query.
                // Assuming we just query size for now.
                const studentsSnap = await firestoreDB.collection(`teachers/${tid}/groups/${gDoc.id}/students`).get();
                teacherStudentsCount += studentsSnap.size;
            }

            totalStudents += teacherStudentsCount;
            centerTeachers.push({ ...tData, studentsCount: teacherStudentsCount, groupsCount: groupsSnapshot.size });

            const teacherName = tData.profile?.teacherName || (currentLang === 'ar' ? 'مدرس غير مسمى' : 'Unnamed Teacher');
            const teacherSubject = tData.profile?.teacherSubject || (currentLang === 'ar' ? 'مادة غير محددة' : 'No Subject');
            const groupsLabel = currentLang === 'ar' ? 'المجموعات' : 'Groups';
            const detailsLabel = currentLang === 'ar' ? 'التفاصيل والإحصائيات' : 'Details & Stats';
            
            teachersHTML += `
                <div class="glass-card p-6 rounded-[2rem] border border-white/40 dark:border-white/5 hover:border-brand/50 hover:shadow-2xl hover:shadow-brand/10 hover:-translate-y-1 transition-all duration-300 group cursor-pointer" onclick="showTeacherStats(${centerTeachers.length - 1})">
                    <div class="flex items-center gap-4 mb-6">
                        <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-brand/20 to-brand/5 dark:from-brand/30 dark:to-brand/10 text-brand flex items-center justify-center text-2xl font-black shrink-0 shadow-inner group-hover:scale-110 transition-transform duration-300">
                            ${teacherName.charAt(0)}
                        </div>
                        <div>
                            <h3 class="font-black text-xl text-gray-900 dark:text-white mb-1 group-hover:text-brand transition-colors">${teacherName}</h3>
                            <p class="text-xs text-gray-500 dark:text-gray-400 font-bold bg-gray-100 dark:bg-black/30 inline-block px-2 py-1 rounded-md">${teacherSubject}</p>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-4 mb-5">
                        <div class="bg-gray-50/80 dark:bg-black/30 p-4 rounded-2xl text-center border border-gray-100 dark:border-white/5 inner-stat-card">
                            <span class="block text-[10px] text-gray-400 font-bold uppercase mb-1 tracking-wider">${groupsLabel}</span>
                            <span class="font-black text-2xl text-gray-800 dark:text-gray-200 inner-stat-card-text">${groupsSnapshot.size}</span>
                        </div>
                        <div class="bg-gray-50/80 dark:bg-black/30 p-4 rounded-2xl text-center border border-gray-100 dark:border-white/5 inner-stat-card">
                            <span class="block text-[10px] text-gray-400 font-bold uppercase mb-1 tracking-wider">${translations[currentLang].student}</span>
                            <span class="font-black text-2xl text-gray-800 dark:text-gray-200 inner-stat-card-text">${teacherStudentsCount}</span>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-3 mt-4">
                        <button onclick="event.stopPropagation(); showTeacherStats(${centerTeachers.length - 1})" class="w-full py-2.5 bg-brand hover:bg-brandHover text-black rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95">
                            <i class="ri-bar-chart-box-line text-sm"></i>
                            <span>${detailsLabel}</span>
                        </button>
                        <button onclick="event.stopPropagation(); loginAsTeacher('${tData.id}')" class="w-full py-2.5 bg-black dark:bg-brand/10 hover:bg-zinc-900 dark:hover:bg-brand/20 text-brand border border-brand/30 hover:border-brand rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-md active:scale-95">
                            <i class="ri-login-box-line text-sm"></i>
                            <span>${currentLang === 'ar' ? 'دخول كمعلم' : 'Login as Teacher'}</span>
                        </button>
                    </div>
                </div>
            `;
        }
    }

    teachersListEl.innerHTML = teachersHTML;
    document.getElementById('statTotalTeachers').innerText = centerTeachers.length.toString();
    document.getElementById('statTotalStudents').innerText = totalStudents.toString();
}

async function showTeacherStats(index) {
    const tData = centerTeachers[index];
    if (!tData) return;

    const teacherName = tData.profile?.teacherName || (currentLang === 'ar' ? 'مدرس' : 'Teacher');
    const statsTitle = currentLang === 'ar' ? `تفاصيل وإحصائيات ${teacherName}` : `${teacherName} Details & Stats`;
    document.getElementById('modalTeacherName').innerText = statsTitle;
    const modal = document.getElementById('teacherStatsModal');
    const content = document.getElementById('teacherStatsContent');
    
    modal.classList.remove('hidden');
    content.innerHTML = `<div class="text-center py-10"><i class="ri-loader-4-line animate-spin text-4xl text-brand"></i><p class="mt-2 text-gray-500 font-bold">${currentLang === 'ar' ? 'جاري حساب الإحصائيات وجلب المجموعات...' : 'Calculating stats & fetching groups...'}</p></div>`;

    try {
        let totalAttendance = 0;
        let totalSessions = 0;
        let totalRevenue = 0;
        let groupsHTML = `<h4 class="font-black text-gray-800 dark:text-gray-200 text-lg mb-4 mt-6 border-b border-gray-100 dark:border-white/5 pb-2 flex items-center gap-2">
            <i class="ri-node-tree text-brand"></i>
            <span>${currentLang === 'ar' ? 'المجموعات الدراسية' : 'Study Groups'}</span>
        </h4>
        <div class="grid grid-cols-1 gap-3 max-h-[300px] overflow-y-auto pr-1">`;

        // Fetch groups to calculate deep stats
        const groupsSnapshot = await firestoreDB.collection(`teachers/${tData.id}/groups`).get();
        
        if (groupsSnapshot.empty) {
            groupsHTML += `<div class="text-center py-6 text-gray-400 font-bold"><p>${currentLang === 'ar' ? 'لا توجد مجموعات نشطة حالياً.' : 'No active groups currently.'}</p></div>`;
        }

        for (const gDoc of groupsSnapshot.docs) {
            const gData = gDoc.data();
            const gName = gData.name || (currentLang === 'ar' ? 'مجموعة بدون اسم' : 'Unnamed Group');
            
            // Count Students in Group
            const studentsSnap = await firestoreDB.collection(`teachers/${tData.id}/groups/${gDoc.id}/students`).get();
            const groupStudentsCount = studentsSnap.size;
            
            // Count Attendance
            const sessionsSnap = await firestoreDB.collection(`teachers/${tData.id}/groups/${gDoc.id}/sessions`).get();
            totalSessions += sessionsSnap.size;
            for (const sDoc of sessionsSnap.docs) {
                const sData = sDoc.data();
                if (sData.presentCount) totalAttendance += sData.presentCount;
                if (sData.totalRevenue) totalRevenue += sData.totalRevenue;
            }
            
            // Count monthly payments if available
            const paymentsSnap = await firestoreDB.collection(`teachers/${tData.id}/groups/${gDoc.id}/payments`).get();
            for (const pDoc of paymentsSnap.docs) {
                const pData = pDoc.data();
                if (pData.amountPaid) totalRevenue += pData.amountPaid;
            }

            groupsHTML += `
                <div class="p-4 bg-gray-50/50 dark:bg-black/30 rounded-2xl border border-gray-100 dark:border-white/5 flex justify-between items-center hover:border-brand/30 transition-colors">
                    <div>
                        <p class="font-black text-gray-900 dark:text-white text-base">${gName}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400 font-bold mt-1">
                            ${currentLang === 'ar' ? 'الحصص المعطاة' : 'Sessions given'}: ${sessionsSnap.size}
                        </p>
                    </div>
                    <div class="px-3 py-1.5 bg-brand/10 text-brand font-black rounded-xl text-xs flex items-center gap-1.5">
                        <i class="ri-group-line"></i>
                        <span>${groupStudentsCount} ${currentLang === 'ar' ? 'طالب' : 'Students'}</span>
                    </div>
                </div>
            `;
        }
        groupsHTML += `</div>`;

        const totalAttendanceLabel = translations[currentLang].totalAttendance;
        const revenueLabel = translations[currentLang].revenueApprox;
        const currencyLabel = translations[currentLang].currency;
        const totalSessionsLabel = translations[currentLang].totalSessions;
        const sessionLabel = translations[currentLang].session;
        const studentLabel = translations[currentLang].student;

        // Render stats
        content.innerHTML = `
            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div class="glass-card bg-gray-50/80 dark:bg-black/30 p-5 rounded-2xl text-center border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-md transition-shadow">
                        <div class="w-12 h-12 rounded-xl bg-brand/10 mx-auto mb-3 flex items-center justify-center">
                            <i class="ri-calendar-check-line text-2xl text-brand"></i>
                        </div>
                        <span class="block text-[10px] text-gray-400 font-bold uppercase mb-1 tracking-wider">${totalAttendanceLabel}</span>
                        <span class="font-black text-2xl text-gray-800 dark:text-gray-200">${totalAttendance} <span class="text-sm font-normal text-gray-500">${studentLabel}</span></span>
                    </div>
                    <div class="glass-card bg-green-50/80 dark:bg-green-900/10 p-5 rounded-2xl text-center border border-green-100 dark:border-green-900/30 shadow-sm hover:shadow-md transition-shadow">
                        <div class="w-12 h-12 rounded-xl bg-green-500/10 mx-auto mb-3 flex items-center justify-center">
                            <i class="ri-money-dollar-circle-line text-2xl text-green-500"></i>
                        </div>
                        <span class="block text-[10px] text-green-600/70 dark:text-green-400/70 font-bold uppercase mb-1 tracking-wider">${revenueLabel}</span>
                        <span class="font-black text-2xl text-green-700 dark:text-green-400">${totalRevenue} <span class="text-sm font-normal text-green-600/50">${currencyLabel}</span></span>
                    </div>
                </div>
                <div class="glass-card bg-blue-50/80 dark:bg-blue-900/10 p-5 rounded-2xl text-center border border-blue-100 dark:border-blue-900/30 shadow-sm hover:shadow-md transition-shadow">
                    <div class="w-12 h-12 rounded-xl bg-blue-500/10 mx-auto mb-3 flex items-center justify-center">
                        <i class="ri-book-read-line text-2xl text-blue-500"></i>
                    </div>
                    <span class="block text-[10px] text-blue-600/70 dark:text-blue-400/70 font-bold uppercase mb-1 tracking-wider">${totalSessionsLabel}</span>
                    <span class="font-black text-2xl text-blue-700 dark:text-blue-400">${totalSessions} <span class="text-sm font-normal text-blue-600/50">${sessionLabel}</span></span>
                </div>
                
                ${groupsHTML}
            </div>
        `;
    } catch (err) {
        console.error(err);
        content.innerHTML = `<div class="text-center py-10 text-red-500 font-bold">${translations[currentLang].errorLoadingStats}</div>`;
    }
}

// ==========================================
// 6. TEACHER CREATION FROM CENTER
// ==========================================
function openCreateTeacherModal() {
    document.getElementById('createTeacherModal').classList.remove('hidden');
    document.getElementById('createTeacherModal').classList.add('flex');
    document.getElementById('newTeacherStatus').innerText = '';
}

function closeCreateTeacherModal() {
    document.getElementById('createTeacherModal').classList.add('hidden');
    document.getElementById('createTeacherModal').classList.remove('flex');
}

// Add keyup & input listener restriction
document.addEventListener('DOMContentLoaded', () => {
    const phoneInput = document.getElementById('newTeacherPhone');
    if (phoneInput) {
        phoneInput.addEventListener('input', (e) => {
            let val = e.target.value;
            val = val.replace(/[^\d+]/g, '');
            if (val.startsWith('+')) {
                if (val.length > 13) val = val.substring(0, 13);
            } else {
                if (val.length > 11) val = val.substring(0, 11);
            }
            e.target.value = val;
        });
    }
});

async function submitNewTeacher() {
    const statusDiv = document.getElementById('newTeacherStatus');
    const submitBtn = document.getElementById('submitTeacherBtn');
    
    statusDiv.className = 'text-center text-sm font-semibold text-gray-500 h-5 mt-2';
    statusDiv.innerText = currentLang === 'ar' ? 'جاري التحقق من البيانات...' : 'Validating data...';
    
    const name = document.getElementById('newTeacherName').value.trim();
    const subject = document.getElementById('newTeacherSubject').value.trim();
    const phone = document.getElementById('newTeacherPhone').value.trim();
    const password = document.getElementById('newTeacherPassword').value.trim();

    if (!name || !subject || !phone || !password) {
        statusDiv.className = 'text-center text-sm font-semibold text-red-500 h-5 mt-2';
        statusDiv.innerText = currentLang === 'ar' ? 'برجاء ملء جميع الحقول المطلوبة.' : 'Please fill all fields.';
        return;
    }

    const phoneRegex = /^(01[0125]\d{8}|\+201[0125]\d{8})$/;
    if (!phoneRegex.test(phone)) {
        statusDiv.className = 'text-center text-sm font-semibold text-red-500 h-5 mt-2';
        statusDiv.innerText = currentLang === 'ar' ? 'رقم الهاتف المصري غير صحيح.' : 'Invalid Egyptian phone number.';
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="ri-loader-4-line animate-spin text-lg"></i>`;

    try {
        statusDiv.className = 'text-center text-sm font-semibold text-blue-600 h-5 mt-2';
        statusDiv.innerText = currentLang === 'ar' ? 'جاري إنشاء الحساب المدرس وربطه بالسنتر...' : 'Creating teacher and linking to center...';
        
        const formattedPhone = phone.startsWith('01') ? '+2' + phone : phone;
        
        const createTeacherFn = firebase.functions().httpsCallable('createTeacher');
        await createTeacherFn({ teacherName: name, teacherSubject: subject, teacherPhone: formattedPhone, password: password });
        
        statusDiv.className = 'text-center text-sm font-semibold text-green-600 h-5 mt-2';
        statusDiv.innerText = currentLang === 'ar' ? 'تم إنشاء المدرس بنجاح وربطه بالسنتر! 🎉' : 'Teacher created and linked successfully!';
        
        // Reset fields
        document.getElementById('newTeacherName').value = '';
        document.getElementById('newTeacherSubject').value = '';
        document.getElementById('newTeacherPhone').value = '';
        document.getElementById('newTeacherPassword').value = '';
        
        // Refresh center data to display new teacher
        // We need to fetch center document again to get updated teachers array
        const centerDoc = await firestoreDB.collection('centers').doc(CENTER_ID).get();
        if (centerDoc.exists) {
            centerData = { id: centerDoc.id, ...centerDoc.data() };
        }
        await loadCenterData();
        
        setTimeout(() => {
            closeCreateTeacherModal();
        }, 1500);
    } catch (err) {
        console.error(err);
        statusDiv.className = 'text-center text-sm font-semibold text-red-500 h-5 mt-2';
        statusDiv.innerText = 'Error: ' + err.message;
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i class="ri-user-add-line"></i><span>${currentLang === 'ar' ? 'إنشاء حساب المدرس' : 'Create Teacher Account'}</span>`;
    }
}

function handleLogout() {
    localStorage.removeItem('learnaria-cid');
    window.location.href = 'dashboard.html';
}

let pendingLoginTeacherId = null;

function loginAsTeacher(teacherId) {
    pendingLoginTeacherId = teacherId;
    document.getElementById('promptTeacherPassword').value = '';
    document.getElementById('promptPasswordStatus').innerText = '';
    document.getElementById('teacherPasswordPromptModal').classList.remove('hidden');
    document.getElementById('teacherPasswordPromptModal').classList.add('flex');
}

function closePasswordPromptModal() {
    document.getElementById('teacherPasswordPromptModal').classList.add('hidden');
    document.getElementById('teacherPasswordPromptModal').classList.remove('flex');
    pendingLoginTeacherId = null;
}

async function verifyTeacherPasswordAndLogin() {
    const statusDiv = document.getElementById('promptPasswordStatus');
    const password = document.getElementById('promptTeacherPassword').value.trim();

    if (!password) {
        statusDiv.innerText = currentLang === 'ar' ? 'يرجى إدخال كلمة المرور.' : 'Please enter the password.';
        return;
    }

    if (!pendingLoginTeacherId) return;

    statusDiv.className = 'text-center text-xs font-bold text-blue-600 h-5 mb-2';
    statusDiv.innerText = currentLang === 'ar' ? 'جاري التحقق...' : 'Verifying...';

    try {
        // Fetch teacher data to check password
        const tDoc = await firestoreDB.collection('teachers').doc(pendingLoginTeacherId).get();
        if (!tDoc.exists) {
            throw new Error(currentLang === 'ar' ? 'المدرس غير موجود.' : 'Teacher not found.');
        }

        const tData = tDoc.data();
        const storedPass = tData.password ? tData.password.toString().trim() : '';

        if (storedPass !== password) {
            statusDiv.className = 'text-center text-xs font-bold text-red-500 h-5 mb-2';
            statusDiv.innerText = currentLang === 'ar' ? 'كلمة المرور غير صحيحة.' : 'Incorrect password.';
            return;
        }

        // Login success, store session and redirect
        localStorage.setItem('learnaria-tid', pendingLoginTeacherId);
        localStorage.setItem('learnaria-remember', 'true');
        window.location.href = 'dashboard.html';
    } catch (err) {
        console.error(err);
        statusDiv.className = 'text-center text-xs font-bold text-red-500 h-5 mb-2';
        statusDiv.innerText = err.message;
    }
}

// ==========================================
// 6. UI LOGIC (Theme, Lang, Network)
// ==========================================
function updateOnlineStatus() {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    if (!statusDot || !statusText) return;

    if (navigator.onLine) {
        statusDot.classList.remove('bg-red-500', 'bg-gray-400');
        statusDot.classList.add('bg-green-500');
        statusText.innerText = currentLang === 'ar' ? 'متصل' : 'Online';
        statusText.classList.remove('text-red-500', 'text-gray-400');
        statusText.classList.add('text-green-600', 'dark:text-green-400');
    } else {
        statusDot.classList.remove('bg-green-500', 'bg-gray-400');
        statusDot.classList.add('bg-red-500');
        statusText.innerText = currentLang === 'ar' ? 'غير متصل' : 'Offline';
        statusText.classList.remove('text-green-600', 'dark:text-green-400');
        statusText.classList.add('text-red-500');
    }
}

function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('learnaria-dark', isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeIcon();
}

function updateThemeIcon() {
    const isDark = document.body.classList.contains('dark-mode');
    document.getElementById('darkModeIcon')?.classList.toggle('hidden', isDark);
    document.getElementById('lightModeIcon')?.classList.toggle('hidden', !isDark);
}

function toggleLang() {
    currentLang = currentLang === 'ar' ? 'en' : 'ar';
    localStorage.setItem('lang', currentLang);
    applyLanguage();
    
    // Refresh texts
    updateOnlineStatus();
    loadCenterData(); // Re-render lists
}

function applyLanguage() {
    document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
    const langBtn = document.getElementById('languageToggleButton');
    if (langBtn) langBtn.innerText = currentLang === 'ar' ? 'EN' : 'ع';

    document.querySelectorAll('[data-key]').forEach(el => {
        const key = el.dataset.key;
        if (translations[currentLang] && translations[currentLang][key]) {
            el.innerHTML = translations[currentLang][key];
        }
    });

    document.querySelectorAll('[data-key-placeholder]').forEach(el => {
        const key = el.dataset.keyPlaceholder;
        if (translations[currentLang] && translations[currentLang][key]) {
            el.placeholder = translations[currentLang][key];
        }
    });
}

function setupUIEventListeners() {
    // Theme setup
    const savedTheme = localStorage.getItem('theme') || localStorage.getItem('learnaria-dark');
    if (savedTheme === 'dark' || savedTheme === 'true') {
        document.body.classList.add('dark-mode');
    }
    updateThemeIcon();
    
    // Event listeners
    document.getElementById('darkModeToggleButton')?.addEventListener('click', toggleDarkMode);
    document.getElementById('languageToggleButton')?.addEventListener('click', toggleLang);
    
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    
    // Initial calls
    applyLanguage();
    updateOnlineStatus();
}

// Start
firebase.auth().onAuthStateChanged((user) => {
    console.log("center_script: onAuthStateChanged fired. User:", user);
    setupUIEventListeners();
    if (user) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initCenterDashboard);
        } else {
            initCenterDashboard();
        }
    } else {
        // If not logged in, redirect
        console.error("No authenticated user found. Redirecting...");
        alert("Debug: No authenticated user found in center_script.js. Redirecting...");
        localStorage.removeItem('learnaria-cid');
        localStorage.removeItem('learnaria-remember');
        window.location.href = 'dashboard.html';
    }
});
