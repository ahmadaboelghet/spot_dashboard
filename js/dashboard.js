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
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.replace('#', '');
            if (hash && ['overview', 'daily', 'students', 'exams', 'payments', 'schedule', 'profile', 'cards'].includes(hash)) {
                if (SELECTED_GROUP_ID || hash === 'profile' || hash === 'cards') {
                    switchTab(hash);
                }
            }
        });

        // Check actual internet connectivity periodically (every 15s) to recover from ISP disconnects
        setInterval(updateOnlineStatus, 15000);

        // ✅ PHASE 3: Missing Unload Flush — save pending data before page unloads
        window.addEventListener('beforeunload', () => {
            flushPendingSaves(); // Best-effort, fire-and-forget
            if (savePaymentsTimeout) {
                clearTimeout(savePaymentsTimeout);
                savePaymentsTimeout = null;
                savePayments(true); // Best-effort, fire-and-forget
            }
        });
    } catch (err) {
        console.error("🔥 Fatal initialization error:", err);
        sentryCaptureError(err, { action: "appInit" });
        // Recovery fallback: remove anti-flash class and show landing section so page is not blank
        document.documentElement.classList.remove('is-logged-in');
        const landing = document.getElementById('landingSection');
        if (landing) landing.classList.remove('hidden');
    }
});

let currentDailyFilter = 'all';
let currentExamFilter = 'all';
let currentPaymentFilter = 'all';

function setupFilters() {
    const handleFilterClick = (containerId, filterVarSetter, renderFunc, searchInputId) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        const buttons = container.querySelectorAll('.filter-chip');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => {
                    b.classList.remove('active', 'bg-brand', 'text-black', 'shadow-glow', 'scale-105', 'border-transparent', 'font-bold');
                    b.classList.add('bg-white', 'dark:bg-darkSurface', 'text-gray-600', 'dark:text-gray-400', 'border-gray-200', 'dark:border-gray-700', 'shadow-sm', 'font-semibold', 'hover:border-brand', 'hover:text-brand', 'dark:hover:border-brand', 'dark:hover:text-brand');
                });
                btn.classList.add('active', 'bg-brand', 'text-black', 'shadow-glow', 'scale-105', 'border-transparent', 'font-bold');
                btn.classList.remove('bg-white', 'dark:bg-darkSurface', 'text-gray-600', 'dark:text-gray-400', 'border-gray-200', 'dark:border-gray-700', 'shadow-sm', 'font-semibold', 'hover:border-brand', 'hover:text-brand', 'dark:hover:border-brand', 'dark:hover:text-brand');
                
                filterVarSetter(btn.dataset.filter);
                const currentSearch = document.getElementById(searchInputId)?.value || '';
                renderFunc(currentSearch);
            });
        });
    };

    handleFilterClick('dailyFilterChips', val => currentDailyFilter = val, renderDailyList, 'dailyStudentSearchInput');
    handleFilterClick('examFilterChips', val => currentExamFilter = val, renderExamGrades, 'examStudentSearchInput');
    handleFilterClick('paymentFilterChips', val => currentPaymentFilter = val, renderPaymentsList, 'paymentStudentSearchInput');
}

function setupListeners() {
    document.getElementById('setTeacherButton')?.addEventListener('click', loginTeacher);
    document.getElementById('logoutButton')?.addEventListener('click', logout);

    // ✅✅ FIX: Disable student inputs by default on load
    toggleStudentInputs(false);
    setupPhoneInput('teacherPhoneInput');
    setupPhoneInput('newParentPhoneNumber');
    setupPhoneInput('profileParentPhone');
    
    // Setup Premium Filters
    setupFilters();
    
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn?.addEventListener('click', (e) => {
            // Allow Ctrl+Click, Cmd+Click, Shift+Click, or Middle-click to behave naturally (open in new tab)
            if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) {
                return;
            }

            const tab = e.currentTarget.dataset.tab;
            if (!SELECTED_GROUP_ID && tab !== 'profile' && tab !== 'cards') {
                e.preventDefault();
                showToast(translations[currentLang].selectGroupPlaceholder, 'error');
                return;
            }

            e.preventDefault();
            window.location.hash = tab;
            switchTab(tab);
        });
    });

    document.getElementById('saveProfileButton')?.addEventListener('click', saveProfile);
    document.getElementById('openChangePasswordBtn')?.addEventListener('click', openChangePasswordModal);
    document.getElementById('createNewGroupBtn')?.addEventListener('click', createGroup);

    const handleGroupSelectionChange = async (groupId) => {
        sessionScannedStudents.clear();
        // ✅ PHASE 3: Context Switch Data Loss — flush any pending saves before switching groups
        await flushPendingSaves();
        if (savePaymentsTimeout) {
            clearTimeout(savePaymentsTimeout);
            savePaymentsTimeout = null;
            await savePayments(true);
        }

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
    document.getElementById('dailyDateInput')?.addEventListener('change', (e) => {
    sessionScannedStudents.clear(); // <--- أضف هذا السطر
    renderDailyList();
});
    document.getElementById('saveDailyBtn')?.addEventListener('click', saveDailyData);


    document.getElementById('addNewStudentButton')?.addEventListener('click', addNewStudent);

    // ✅ PERF FIX 4: Helper shared by all list search inputs — toggles DOM nodes, no re-render
    function _filterListBySearch(containerSelector, filter) {
        const norm = filter.trim().toLowerCase();
        const container = typeof containerSelector === 'string'
            ? document.querySelector(containerSelector)
            : containerSelector;
        if (!container) return;
        let hasVisible = false;
        container.querySelectorAll('[data-search-key]').forEach(el => {
            const key = el.dataset.searchKey || '';
            const match = !norm || key.includes(norm);
            el.classList.toggle('hidden', !match);
            if (match) hasVisible = true;
        });
        // أظهر/اخفى رسالة "لا نتائج"
        let noResultEl = container.querySelector('[data-no-results]');
        if (noResultEl) noResultEl.classList.toggle('hidden', hasVisible);
    }

    let studentSearchTimeout;
    document.getElementById('studentSearchInput')?.addEventListener('input', (e) => {
        clearTimeout(studentSearchTimeout);
        studentSearchTimeout = setTimeout(() => {
            const filter = e.target.value;
            const norm = filter.trim().toLowerCase();
            // لو الـ container جاهز نعمل DOM filter، غير كده نعمل full render
            const container = document.getElementById('studentsListDisplay');
            if (container && container.querySelectorAll('[data-search-key]').length > 0) {
                _filterListBySearch(container, filter);
            } else {
                renderStudents(filter);
            }
        }, 150);
    });

    let dailySearchTimeout;
    document.getElementById('dailyStudentSearchInput')?.addEventListener('input', (e) => {
        clearTimeout(dailySearchTimeout);
        dailySearchTimeout = setTimeout(() => {
            // ✅ PHASE 2: Prevent data wipe by using DOM filter instead of full render
            const filter = e.target.value;
            const container = document.getElementById('dailyStudentsList');
            if (container && container.querySelectorAll('[data-search-key]').length > 0) {
                _filterListBySearch(container, filter);
            } else {
                renderDailyList(filter);
            }
        }, 300);
    });

    let examSearchTimeout;
    document.getElementById('examStudentSearchInput')?.addEventListener('input', (e) => {
        clearTimeout(examSearchTimeout);
        examSearchTimeout = setTimeout(() => {
            const filter = e.target.value;
            const container = document.getElementById('examGradesList');
            if (container && container.querySelectorAll('[data-search-key]').length > 0) {
                _filterListBySearch(container, filter);
            } else {
                renderExamGrades(filter);
            }
        }, 150);
    });

    let paymentSearchTimeout;
    document.getElementById('paymentStudentSearchInput')?.addEventListener('input', (e) => {
        clearTimeout(paymentSearchTimeout);
        paymentSearchTimeout = setTimeout(() => {
            const filter = e.target.value;
            const container = document.getElementById('paymentsList');
            if (container && container.querySelectorAll('[data-search-key]').length > 0) {
                _filterListBySearch(container, filter);
            } else {
                renderPaymentsList(filter);
            }
        }, 150);
    });

    document.getElementById('addRecurringScheduleButton')?.addEventListener('click', saveRecurringSchedule);
    document.getElementById('updateSingleClassButton')?.addEventListener('click', updateSingleClass);
    document.getElementById('cancelSingleClassButton')?.addEventListener('click', cancelSingleClass);

    document.getElementById('scanPaymentsBtn')?.addEventListener('click', () => startScanner('payments'));
    document.getElementById('paymentMonthInput')?.addEventListener('change', renderPaymentsList);
    document.getElementById('savePaymentsBtn')?.addEventListener('click', savePayments);

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
                        <span class="font-black text-gray-800 dark:text-white text-lg">${escapeHtml(s.subject)}</span>
                        <span class="bg-brand/20 text-yellow-800 dark:text-brand text-xs px-2 py-0.5 rounded-full font-bold">${escapeHtml(timeText)}</span>
                    </div>
                    <div class="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                        <i class="ri-repeat-line"></i> <span>${translations[currentLang].repeatsOn} ${escapeHtml(dayNames)}</span>
                    </div>
                </div>
                <button class="btn-icon w-8 h-8 bg-red-50 text-red-500 hover:bg-red-100 dark:bg-red-900/20 rounded-lg" data-id="${escapeHtml(s.id)}"><i class="ri-delete-bin-line"></i></button>
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

    if (!password) {
        return showToast(currentLang === 'ar' ? 'يرجى إدخال كلمة المرور أولاً!' : 'Please enter your password first!', 'error');
    }

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
            if (authErr.code === 'auth/user-not-found' || authErr.code === 'auth/invalid-credential' || authErr.code === 'auth/invalid-login-credentials') {
                if (!navigator.onLine) {
                    showToast(translations[currentLang].offlineFirstLogin || "Internet required for first login", "error");
                    throw new Error("Offline first login");
                }

                // التأكد من وجوده في الداتابيز القديمة
                const doc = await firestoreDB.collection('teachers').doc(fmt).get();

                if (!doc.exists) {
                    // It's either an unregistered user OR a center owner who typed the wrong password
                    // (since centers don't exist in teachers collection and Auth failed).
                    showToast(currentLang === 'ar' ? 'كلمة المرور غير صحيحة أو الحساب غير موجود' : 'Wrong password or account not registered', "error");
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
                try {
                    await firebase.auth().createUserWithEmailAndPassword(fakeEmail, password);
                } catch (createErr) {
                    if (createErr.code === 'auth/email-already-in-use') {
                        // User is in Auth but wrong password was used (and storedPass was empty so it bypassed the check)
                        showToast(translations[currentLang].wrongPassword, "error");
                        btn.innerHTML = originalText;
                        btn.disabled = false;
                        return;
                    }
                    throw createErr;
                }

                // فور نجاح النقل إلى Firebase Auth المشفّر، نحذف حقل الباسورد القديم نهائياً من Firestore
                await firestoreDB.collection('teachers').doc(fmt).update({
                    password: firebase.firestore.FieldValue.delete()
                }).catch(err => console.warn("Could not delete legacy password field:", err));

            } else if (authErr.code === 'auth/wrong-password') {
                showToast(translations[currentLang].wrongPassword, "error");
                btn.innerHTML = originalText;
                btn.disabled = false;
                return;
            } else if (authErr.code === 'auth/network-request-failed' || !navigator.onLine) {
                showToast(currentLang === 'ar' ? 'لا يوجد اتصال بالإنترنت. يرجى التحقق من الشبكة والمحاولة مجدداً.' : 'No internet connection. Please check your network and try again.', "error");
                btn.innerHTML = originalText;
                btn.disabled = false;
                return;
            } else {
                console.error(authErr);
                showToast(currentLang === 'ar' ? 'حدث خطأ أثناء تسجيل الدخول. يرجى المحاولة مرة أخرى.' : 'Login error. Please try again.', "error");
                btn.innerHTML = originalText;
                btn.disabled = false;
                return;
            }
        }

        // 3. تحديث البيانات محلياً بعد نجاح الدخول (جلب مباشر من السيرفر لضمان التحقق من centerId)
        let data = null;
        let isCenter = false;

        // 🔄 Fix Race Condition: Wait for Auth token to propagate to Firestore
        let doc = null;
        try {
            doc = await firestoreDB.collection('teachers').doc(fmt).get();
        } catch (e) {
            if (e.code === 'permission-denied' || e.message.includes('permissions')) {
                console.warn("Permission denied on first try, waiting for Auth propagation...");
                await new Promise(r => setTimeout(r, 1000));
                doc = await firestoreDB.collection('teachers').doc(fmt).get();
            } else {
                throw e;
            }
        }

        if (doc && doc.exists) {
            data = { id: doc.id, ...doc.data() };
            // إذا كان لا يزال هناك حقل password قديم، نحذفه فوراً من Firestore ومن الذاكرة المحلية
            if (data.password !== undefined) {
                firestoreDB.collection('teachers').doc(fmt).update({
                    password: firebase.firestore.FieldValue.delete()
                }).catch(err => console.warn("Could not delete legacy password field:", err));
                delete data.password;
            }
            await putToDB('teachers', data);
        } else {
            // Check if it's a center
            console.log("Checking if center exists for ID:", fmt);
            const centerDoc = await firestoreDB.collection('centers').doc(fmt).get();
            console.log("centerDoc.exists:", centerDoc.exists, "centerDoc.id:", centerDoc.id);
            if (centerDoc.exists) {
                data = { id: centerDoc.id, ...centerDoc.data() };
                isCenter = true;
                if (data.password !== undefined) {
                    firestoreDB.collection('centers').doc(fmt).update({
                        password: firebase.firestore.FieldValue.delete()
                    }).catch(err => console.warn("Could not delete legacy center password field:", err));
                    delete data.password;
                }
                console.log("Center data loaded:", data);
            } else {
                console.error("centerDoc does NOT exist for ID:", fmt);
                throw new Error("Account not found in Database");
            }
        }

        if (!isCenter && data && data.centerId) {
            const centerDoc = await firestoreDB.collection('centers').doc(data.centerId).get();
            const centerName = centerDoc.exists ? (centerDoc.data().name || data.centerId) : data.centerId;
            showToast(currentLang === 'ar' ? `أنت مسجل كمعلم تابع لسنتر (${centerName}). يجب تسجيل الدخول من خلال لوحة تحكم السنتر الخاصة به.` : `You are registered as a teacher linked to center (${centerName}). You must login via its center dashboard.`, "error");
            await firebase.auth().signOut();
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }

        if (isCenter) {
            TEACHER_CENTER_ID = data.id;
            localStorage.setItem('learnaria-remember', 'true');
            localStorage.setItem('learnaria-cid', TEACHER_CENTER_ID);
            // Clear any old teacher id just in case
            localStorage.removeItem('learnaria-tid');
            
            showToast("مرحباً بك في لوحة تحكم السنتر!", "success");
            btn.innerHTML = originalText;
            btn.disabled = false;
            
            setTimeout(() => {
                window.location.href = 'center_dashboard.html';
            }, 1000);
            return;
        }

        // 4. تسجيل الدخول ناجح
        TEACHER_ID = fmt;
        TEACHER_CENTER_ID = data && data.centerId ? data.centerId : null;
        localStorage.setItem('learnaria-remember', 'true');
        localStorage.setItem('learnaria-tid', TEACHER_ID);
        if (TEACHER_CENTER_ID) localStorage.setItem('learnaria-cid', TEACHER_CENTER_ID);
        updateHomeLinks();
        loadChatHistory(); // ✅ PHASE 1: Load Chat History on manual login
        buildCrossGroupLookupMap(); // ─── Req #4: Build after auth — guaranteed permissions
        
        // Sentry: تسجيل هوية المستخدم لربط الأخطاء بحسابه
        if (typeof Sentry !== 'undefined') {
            if (typeof Sentry.setUser === "function") { Sentry.setUser({ id: TEACHER_ID, username: data?.name || TEACHER_ID }); } else if (Sentry.onLoad) { Sentry.onLoad(function() { Sentry.setUser({ id: TEACHER_ID, username: data?.name || TEACHER_ID }); }); }
            if (typeof Sentry.addBreadcrumb === 'function') { Sentry.addBreadcrumb({ category: 'auth', message: 'Teacher logged in', level: 'info' }); }
        logEvent('login', { method: 'email', teacher_name: data?.name || 'unknown' });
        }

        document.getElementById('landingSection').classList.add('hidden');
        document.getElementById('logoutButton').classList.remove('hidden');
        document.getElementById('navHomeButton')?.classList.add('hidden');

        if (data) {
            document.getElementById('dashboardTitle').innerText = `${translations[currentLang].welcomeTeacherGreeting}${data.name || ''}`;
            const portalWelcome = document.getElementById('portalWelcomeTeacher');
            if (portalWelcome) portalWelcome.innerText = `${translations[currentLang].welcomeTeacherGreeting}${data.name || ''} 👋`;
            
            const nameInput = document.getElementById('teacherNameInput');
            if (nameInput) nameInput.value = data.name || '';
            const subjectInput = document.getElementById('teacherSubjectInput');
            if (subjectInput) subjectInput.value = data.subject || '';
        }

        await loadGroups();
        checkGroupSelectionPortal();

    } catch (error) {
        if (error.message !== "Offline first login") {
            console.error("Login Error:", error);
            sentryCaptureError(error, { action: "login", teacherId: fmt });
            if (error.message.includes("Missing or insufficient permissions") || error.code === 'permission-denied') {
                showToast(currentLang === 'ar' ? 'كلمة المرور غير صحيحة، أو الحساب غير مسجل لدينا.' : 'Wrong password, or account is not registered.', "error");
            } else {
                showToast("خطأ: " + error.message, "error");
            }
        }
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
async function logout() {
    const confirmMsg = currentLang === 'ar' ? 'هل أنت متأكد من تسجيل الخروج؟' : 'Are you sure you want to log out?';
    const confirmed = await showCustomConfirm(confirmMsg, '', 'ri-logout-box-r-line');
    if (!confirmed) return;

    const isCenterTeacher = localStorage.getItem('learnaria-cid');

    try {
        if (firebase.auth().currentUser) {
            await firebase.auth().signOut();
        }
    } catch(e) {
        sentryBreadcrumb("Teacher logged out", "auth");
    logEvent('logout');
    if (typeof Sentry !== 'undefined' && Sentry.setUser) Sentry.setUser(null);
        console.error("Firebase signout error:", e);
    }

    localStorage.removeItem('learnaria-remember');
    removeSessionItem('learnaria-tid');
    removeSessionItem('learnaria-gid');
    removeSessionItem('learnaria-tab');

    try {
        indexedDB.deleteDatabase(DB_NAME);
    } catch(e) {}

    if (isCenterTeacher) {
        window.location.href = 'center_dashboard.html';
    } else {
        window.location.href = 'dashboard.html';
    }
}

async function loadGroups() {
    if (!TEACHER_ID) return;
    
    let groups = await getAllFromDB('groups', 'teacherId', TEACHER_ID);
    renderGroupsDropdown(groups);

    if (navigator.onLine && typeof firebase.auth === 'function' && firebase.auth().currentUser) {
        // Sync in background to not block UI loading
        (async () => {
            try {
                const snap = await firestoreDB.collection(`teachers/${TEACHER_ID}/groups`).get();
                const remoteGroups = snap.docs.map(doc => ({ id: doc.id, teacherId: TEACHER_ID, ...doc.data() }));
                for (const g of remoteGroups) {
                    await putToDB('groups', g);
                }
                renderGroupsDropdown(remoteGroups);

                // TASK 3: Background Hydration - Prefetch all students for cross-group scanning cache (Sequential to prevent network throttling)
                const allSyncedStudents = [];
                for (const g of remoteGroups) {
                    try {
                        const stuSnap = await firestoreDB.collection(`teachers/${TEACHER_ID}/groups/${g.id}/students`).get();
                        const students = stuSnap.docs.map(d => ({ id: d.id, groupId: g.id, ...d.data() }));
                        allSyncedStudents.push(...students);
                    } catch (err) {
                        console.warn(`Failed to fetch students for group ${g.id}:`, err);
                    }
                }
                
                if (allSyncedStudents.length > 0) {
                    await putAllToDB('students', allSyncedStudents);
                    await buildCrossGroupLookupMap();
                }
            } catch (e) {
                console.error("Failed to sync groups and students:", e);
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
                    <div onclick="window.handleGroupSelectionChange('${escapeHtml(g.id)}')" 
                         class="group aspect-square flex flex-col justify-between p-6 bg-white dark:bg-zinc-800/40 hover:bg-white dark:hover:bg-zinc-800 border border-gray-200/50 dark:border-zinc-800 rounded-3xl cursor-pointer transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-gray-200/50 dark:hover:shadow-black/30 active:scale-95 text-right">
                        
                        <!-- Top: Folder Icon in subtle container -->
                        <div class="w-10 h-10 rounded-xl bg-gray-100 dark:bg-zinc-700/50 text-gray-400 group-hover:text-brand group-hover:bg-brand/10 flex items-center justify-center transition-colors self-start">
                            <i class="ri-folder-shared-line text-lg"></i>
                        </div>
                        
                        <!-- Bottom: Group Title & CTA -->
                        <div>
                            <h4 class="font-black text-gray-800 dark:text-white text-sm group-hover:text-brand transition-colors leading-tight line-clamp-2 break-words" title="${escapeHtml(g.name)}">${escapeHtml(g.name)}</h4>
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
    logEvent("group_created", { group_name: name });
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
        logEvent("group_deleted", { group_id: SELECTED_GROUP_ID });
        console.error("Error deleting group:", e);
        sentryCaptureError(e, { action: "deleteGroup", groupId: SELECTED_GROUP_ID });
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

function deduplicateStudents(students) {
    if (!Array.isArray(students)) return [];
    const seenIds = new Set();
    const seenNames = new Set();
    return students.filter(s => {
        if (!s || !s.id) return false;
        if (seenIds.has(s.id)) return false;
        const nameKey = `${(s.name || '').trim().toLowerCase()}_${(s.parentPhoneNumber || '').trim()}`;
        if (s.name && seenNames.has(nameKey)) return false;
        seenIds.add(s.id);
        if (s.name) seenNames.add(nameKey);
        return true;
    });
}

// ------------------------------------------------------------------
// ✅✅ NEW LOAD GROUP DATA WITH SAFE SYNC & FAIL-SAFE LOGIC ✅✅
// ------------------------------------------------------------------
async function loadGroupData() {
    // FIX #6: Reset all global state to prevent cross-group data pollution
    allStudents = [];
    hasHomeworkToday = true;
    currentPendingStudentId = null;

    // Clear all student search inputs when switching groups
    ['studentSearchInput', 'dailyStudentSearchInput', 'examStudentSearchInput', 'paymentStudentSearchInput'].forEach(id => {
        const inp = document.getElementById(id);
        if (inp) inp.value = '';
    });

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
            allStudents = deduplicateStudents(localData);
            refreshCurrentTab(); // تحديث سريع
        }
    } catch (error) {
        console.warn("Local load skipped:", error);
    }

    // 2. جلب البيانات من السيرفر (Sync)
    if (navigator.onLine && typeof firebase.auth === 'function' && firebase.auth().currentUser) {
        // FIX #7: Capture group ID before async ops to detect race conditions
        const capturedGroupId = SELECTED_GROUP_ID;
        try {
            // FIX #9: Get pending syncQueue items to avoid overwriting local changes
            const { items: sqItems } = await getAllSyncQueueItemsWithKeys().catch(() => ({ items: [] }));
            const pendingDeletePaths = new Set(
                sqItems.filter(item => item.type === 'delete').map(item => item.path)
            );
            const pendingWritePaths = new Set(
                sqItems.filter(item => item.type === 'set' || item.type === 'update' || item.type === 'add').map(item => item.path)
            );

            // جلب كل البيانات بالتوازي لتسريع العملية بشكل كبير جداً بدلاً من جلبها بالتتابع
            // FIX #12: Use limit(60) without orderBy (avoids index requirement); sort client-side below
            const [sSnap, aSnap, asSnap, pSnap] = await Promise.all([
                firestoreDB.collection(`teachers/${TEACHER_ID}/groups/${capturedGroupId}/students`).get(),
                firestoreDB.collection(`teachers/${TEACHER_ID}/groups/${capturedGroupId}/dailyAttendance`).limit(60).get(),
                firestoreDB.collection(`teachers/${TEACHER_ID}/groups/${capturedGroupId}/assignments`).limit(60).get(),
                firestoreDB.collection(`teachers/${TEACHER_ID}/groups/${capturedGroupId}/payments`).limit(24).get()
            ]);

            // FIX #7: Race condition guard — bail if group changed during fetch
            if (SELECTED_GROUP_ID !== capturedGroupId) {
                console.warn('⚠️ Group changed during Firestore fetch, discarding stale data.');
                return;
            }

            // أ. الطلاب
            const remoteStudents = sSnap.docs.map(d => ({ id: d.id, groupId: capturedGroupId, ...d.data() }));

            // FIX #9: Filter out students with pending delete actions (Phantom Resurrection)
            const filteredRemoteStudents = remoteStudents.filter(s => {
                const studentPath = `teachers/${TEACHER_ID}/groups/${capturedGroupId}/students/${s.id}`;
                return !pendingDeletePaths.has(studentPath);
            });

            allStudents = deduplicateStudents(filteredRemoteStudents);
            await saveStudentsToLocalDB(filteredRemoteStudents);

            // FIX #10: Immortal Local Data — delete local students not on server
            try {
                const localStudents = await getAllFromDB('students', 'groupId', capturedGroupId);
                const remoteIdSet = new Set(remoteStudents.map(s => s.id));
                for (const ls of localStudents) {
                    if (!remoteIdSet.has(ls.id)) {
                        await deleteFromDB('students', ls.id);
                    }
                }
            } catch (cleanupErr) {
                console.warn('Local student cleanup error:', cleanupErr);
            }

            refreshCurrentTab();

            // FIX #7: Race condition guard again after async local ops
            if (SELECTED_GROUP_ID !== capturedGroupId) return;

            // ب. الحضور الأخير
            const attendanceDocs = aSnap.docs.map(d => {
                const data = d.data();
                return {
                    id: `${capturedGroupId}_${d.id}`,
                    groupId: capturedGroupId,
                    date: data.date || d.id,
                    ...data
                };
            // FIX #12: Sort client-side by date desc (avoids needing Firestore index)
            }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

            // FIX #11: Offline Overwrite Mirage — don't overwrite if pending sync writes exist
            const attToSave = attendanceDocs.filter(doc => {
                const path = `teachers/${TEACHER_ID}/groups/${capturedGroupId}/dailyAttendance/${doc.date}`;
                return !pendingWritePaths.has(path);
            });
            if (attToSave.length > 0) await putAllToDB('attendance', attToSave);

            // ج. التكاليف/الواجبات
            const assignmentsDocs = asSnap.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    groupId: capturedGroupId,
                    date: data.date || d.id.split('_').pop(),
                    ...data
                };
            // FIX #12: Sort client-side by date desc (avoids needing Firestore index)
            }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

            // FIX #11: Offline Overwrite Mirage for assignments
            const assignToSave = assignmentsDocs.filter(doc => {
                const path = `teachers/${TEACHER_ID}/groups/${capturedGroupId}/assignments/${doc.id}`;
                return !pendingWritePaths.has(path);
            });
            if (assignToSave.length > 0) await putAllToDB('assignments', assignToSave);

            // د. المدفوعات
            const paymentsDocs = pSnap.docs.map(d => ({
                id: `${capturedGroupId}_PAY_${d.id}`,
                month: d.id,
                ...d.data()
            }));
            await putAllToDB('payments', paymentsDocs);
            
            refreshCurrentTab();
        } catch (e) {
            console.error("Sync error:", e);
            refreshCurrentTab();
        }
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
    
    // ✅ FIX 6: collect all modified students, batch-write once at the end
    const studentsToUpdateInDB = [];
    
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
                
                // تحديث البيانات محلياً (سيتم الكتابة للـ DB بـ batch بعد انتهاء الـ Promise.all)
                student.parentFcmToken = token;
                studentsToUpdateInDB.push(student);
            }
        } catch (e) {
            console.error("Error syncing notification status for student: " + student.id, e);
        }
    }));

    // ✅ FIX 6: Batch write — transaction واحدة بدلاً من N transactions
    if (studentsToUpdateInDB.length > 0) {
        await putAllToDB('students', studentsToUpdateInDB);
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
            // Filter only EXAMS using domain helper
            const exams = allAssignments.filter(e =>
                isExamAssignment(e) &&
                e.scores && Object.keys(e.scores).length > 0
            ).sort((a, b) => {
                const dateDiff = new Date(b.date || 0) - new Date(a.date || 0);
                if (dateDiff !== 0) return dateDiff;
                return (b.id || '').localeCompare(a.id || '');
            });

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
                                <p class="text-sm font-black text-gray-800 dark:text-white truncate">${escapeHtml(g.name)}</p>
                                <p class="text-[10px] text-gray-500 font-bold">${escapeHtml(lastExam.name)}</p>
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
        const currentMonth = getLocalMonthString(); // YYYY-MM
        const monthPayments = await getFromDB('payments', `${SELECTED_GROUP_ID}_PAY_${currentMonth}`);
        const records = monthPayments?.records || [];
        // ✅ إصلاح: تحويل سجل الدفع لخريطة (Map) لتسريع البحث بدلاً من O(N^2)
        const paymentMap = {};
        records.forEach(r => paymentMap[r.studentId] = r.paid);
        
        const paidCount = allStudents.filter(s => {
            if (!s || !s.id) return false;
            return paymentMap[s.id] === true;
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
                isExamAssignment(e) &&
                !e.isTransferHistory &&
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

            // تحويل السجلات لماب لتسريع البحث بدلاً من O(N^2)
            const sessionsWithMap = sortedAttendance.map(session => {
                const map = {};
                if (session.records) {
                    session.records.forEach(r => map[r.studentId] = r);
                }
                return { ...session, recordMap: map };
            });

            allStudents.forEach(student => {
                let absentCount = 0;
                let studentSessionCount = 0;

                sessionsWithMap.forEach(session => {
                    const record = session.recordMap[student.id];
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
                            <p class="text-sm font-black text-gray-800 dark:text-white truncate max-w-[150px] text-right">${escapeHtml(s.name)}</p>
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

    // Fire confetti from the center
    confetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.6 },
        colors: ['#F2CE5A', '#4ade80', '#3b82f6', '#ec4899']
    });

    setTimeout(() => {
        overlay.classList.add('hidden');
    }, 2500);
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
    
    // Reset right main content scroll position to top on tab switch
    const rightContent = document.getElementById('rightMainContent');
    if (rightContent) rightContent.scrollTop = 0;
    
    const btn = document.querySelector(`.tab-button[data-tab="${tabId}"]`);
    if (btn) btn.classList.add('active');

    setSessionItem('learnaria-tab', tabId);

    // ✅ تحديث وضع السكانر أوتوماتيكياً لو الكاميرا شغالة وتغيرت التابة
    if (tabId === 'payments') {
        currentScannerMode = 'payments';
    } else if (tabId === 'daily') {
        currentScannerMode = 'daily';
    }

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
        if (!pm.value) pm.value = getLocalMonthString();
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
let _dailyRenderVersion = 0; // ✅ عداد لمنع تكرار الطلاب عند التحميل المتوازي (Race Condition Guard)
async function renderDailyList(filter = "") {
    const thisRenderVersion = ++_dailyRenderVersion;
    if (typeof filter !== 'string') filter = "";
    try {
        const dateInput = document.getElementById('dailyDateInput');
        if (dateInput && !dateInput.value) {
            dateInput.valueAsDate = new Date();
        }
        const date = dateInput ? dateInput.value : getLocalDateString();
        const list = document.getElementById('dailyStudentsList');
        list.innerHTML = '';

        // تحديث عناوين الجدول
        const hStudent = document.getElementById('headerStudent');
        const hAtt = document.getElementById('headerAttendance');
        const hHw = document.getElementById('headerHomework');

        if (hStudent) hStudent.innerText = translations[currentLang].tableHeaderStudent;
        if (hAtt) hAtt.innerText = translations[currentLang].tableHeaderAttendance;
        if (hHw) hHw.innerText = translations[currentLang].tableHeaderHomework;

        const hwDoneFilter = document.querySelector('#dailyFilterChips [data-filter="hw_done"]');
        const hwMissingFilter = document.querySelector('#dailyFilterChips [data-filter="hw_missing"]');

        if (hasHomeworkToday) {
            if (hStudent) hStudent.className = "col-span-6 transition-all duration-300";
            if (hAtt) hAtt.className = "col-span-3 text-center transition-all duration-300";
            if (hHw) hHw.classList.remove('hidden');
            if (hwDoneFilter) hwDoneFilter.style.display = '';
            if (hwMissingFilter) hwMissingFilter.style.display = '';
        } else {
            if (hStudent) hStudent.className = "col-span-8 transition-all duration-300";
            if (hAtt) hAtt.className = "col-span-4 text-center transition-all duration-300";
            if (hHw) hHw.classList.add('hidden');
            if (hwDoneFilter) hwDoneFilter.style.display = 'none';
            if (hwMissingFilter) hwMissingFilter.style.display = 'none';
            
            if (currentDailyFilter === 'hw_done' || currentDailyFilter === 'hw_missing') {
                currentDailyFilter = 'all';
                document.querySelectorAll('#dailyFilterChips .filter-chip').forEach(c => {
                    c.classList.remove('active', 'bg-brand', 'text-black', 'shadow-glow', 'scale-105', 'border-transparent', 'font-bold');
                    c.classList.add('bg-white', 'dark:bg-darkSurface', 'text-gray-600', 'dark:text-gray-400', 'border-gray-200', 'dark:border-gray-700', 'shadow-sm', 'font-semibold', 'hover:border-brand', 'hover:text-brand', 'dark:hover:border-brand', 'dark:hover:text-brand');
                });
                const allChip = document.querySelector('#dailyFilterChips [data-filter="all"]');
                if (allChip) {
                    allChip.classList.add('active', 'bg-brand', 'text-black', 'shadow-glow', 'scale-105', 'border-transparent', 'font-bold');
                    allChip.classList.remove('bg-white', 'dark:bg-darkSurface', 'text-gray-600', 'dark:text-gray-400', 'border-gray-200', 'dark:border-gray-700', 'shadow-sm', 'font-semibold', 'hover:border-brand', 'hover:text-brand', 'dark:hover:border-brand', 'dark:hover:text-brand');
                }
                filter = "";
            }
        }

        if (!allStudents || !allStudents.length) {
            list.innerHTML = `<p class="text-center text-gray-500 py-4">${translations[currentLang].noStudentsInGroup}</p>`;
            return;
        }

        const normalizedFilter = filter.trim().toLowerCase();
        const searchPhoneFilter = normalizedFilter.startsWith('+20') ? normalizedFilter.replace('+20', '0') : normalizedFilter;
        const studentsToRender = allStudents.filter(s => {
            const pPhone = (s.parentPhoneNumber || "").replace(/^\+20/, '0');
            return (s.name || "").toLowerCase().includes(normalizedFilter) ||
                   pPhone.includes(searchPhoneFilter) ||
                   ((s.childId || s.id || "").toLowerCase().includes(normalizedFilter));
        });

        if (studentsToRender.length === 0) {
            list.innerHTML = `<p class="text-center text-gray-500 py-4">${currentLang === 'ar' ? 'لا يوجد نتائج للبحث' : 'No search results found'}</p>`;
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
            // ✅ فحص: لو نداء جديد بدأ أثناء الانتظار، نوقف النداء القديم فوراً
            if (thisRenderVersion !== _dailyRenderVersion) return;
            attDoc = results[0];
            hwDoc = results[1];
        } catch (dbErr) {
            console.error("Database fetch failed in daily list:", dbErr);
        }

        const attMap = {};
        if (attDoc?.records) attDoc.records.forEach(r => { if (r) attMap[r.studentId] = r; });

        const hwMap = {};
        let hasAnySubmitted = false;
        if (hwDoc?.scores) {
            Object.entries(hwDoc.scores).forEach(([sid, val]) => {
                hwMap[sid] = (val && typeof val === 'object') ? val.submitted : false;
                if (hwMap[sid]) hasAnySubmitted = true;
            });
            // Update UI components
        }

        // ✅ PHASE 2 & 3: Hydrate liveSessionData ONLY if group or date changed.
        // If we just re-rendered (e.g. filter change), we MUST preserve memory state
        // otherwise we wipe out rapid scans that haven't saved yet.
        if (liveSessionData.groupId !== SELECTED_GROUP_ID || liveSessionData.date !== date) {
            liveSessionData.groupId = SELECTED_GROUP_ID;
            liveSessionData.date = date;
            liveSessionData.attendance = {};
            liveSessionData.homework = {};

            // Seed with defaults for all students in group, override with DB data
            allStudents.forEach(s => {
                const attRec = attMap[s.id] || {};
                const attStatus = typeof attRec === 'string' ? attRec : (attRec.status || 'absent');
                liveSessionData.attendance[s.id] = {
                    status: attStatus,
                    time: attRec.time || null
                };
                // ✅ Fix: homework can only be submitted if the student is present
                const hwSubmittedFromDB = (hwMap[s.id] || false) && attStatus === 'present';
                liveSessionData.homework[s.id] = {
                    submitted: hwSubmittedFromDB,
                    score: hwDoc?.scores?.[s.id]?.score || null
                };
            });
        }

        const hwToggle = document.getElementById('homeworkToggle');
        if (hwToggle) {
            // Always keep enabled so teachers can correct mistakes
            hwToggle.disabled = false;
            // Sync the DOM checkbox state with the JS state
            hwToggle.checked = hasHomeworkToday;
        }

        // If DB data shows someone submitted, ensure state is ON
        if (hwDoc?.scores && !hasHomeworkToday && hasAnySubmitted) {
            hasHomeworkToday = true;
            if (hwToggle) hwToggle.checked = true;
            if (hStudent) hStudent.className = "col-span-6 transition-all duration-300";
            if (hAtt) hAtt.className = "col-span-3 text-center transition-all duration-300";
            if (hHw) hHw.classList.remove('hidden');
        }

        let presentCount = 0;
        const fragment = document.createDocumentFragment();

        let finalStudents = studentsToRender.filter(s => {
            if (currentDailyFilter === 'all') return true;
            // ✅ PHASE 4: Read strictly from Memory State
            const memAtt = liveSessionData.attendance[s.id] || {};
            const status = memAtt.status || 'absent';
            const memHw = liveSessionData.homework[s.id] || {};
            const hwSubmitted = memHw.submitted || false;
            
            if (currentDailyFilter === 'present') return status === 'present';
            if (currentDailyFilter === 'absent') return status === 'absent';
            if (currentDailyFilter === 'hw_done') return hwSubmitted === true;
            if (currentDailyFilter === 'hw_missing') return !hwSubmitted;
            return true;
        });

        finalStudents.forEach(s => {
            // ✅ PHASE 4: Read strictly from Memory State
            const memAtt = liveSessionData.attendance[s.id] || {};
            const status = memAtt.status || 'absent';
            if (status === 'present') presentCount++;

            const memHw = liveSessionData.homework[s.id] || {};
            const hwSubmitted = memHw.submitted || false;
            const isAbsent = status === 'absent';

            const studentColSpan = hasHomeworkToday ? 'col-span-6' : 'col-span-8';
            const attColSpan = hasHomeworkToday ? 'col-span-3' : 'col-span-4';

            const row = document.createElement('div');
            row.dataset.sid = s.id;
            
            // ✅ PHASE 2: Add search key for DOM filtering
            const pPhone = s.parentPhoneNumber ? s.parentPhoneNumber.replace(/^\+20/, '0') : '';
            row.dataset.searchKey = `${(s.name || '').toLowerCase()} ${pPhone} ${(s.childId || s.id || '').toLowerCase()}`;

            // تنسيق الصف حسب الحالة
            row.className = `daily-student-row grid grid-cols-12 items-center p-3 rounded-lg border transition-colors mb-1 ${status === 'present'
                ? 'bg-green-50 border-green-500 dark:bg-green-900/20'
                : 'bg-white dark:bg-darkSurface border-transparent hover:bg-gray-50 dark:hover:bg-white/5'
                }`;

            let html = `
                <div class="${studentColSpan} font-bold text-sm truncate px-2 text-gray-800 dark:text-gray-200 transition-all duration-300"> ${escapeHtml(s.name)}</div>
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
            fragment.appendChild(row);
        });
        // ✅ فحص نهائي قبل الإضافة: لو نداء أحدث بدأ، نتجاهل هذا النداء القديم
        if (thisRenderVersion !== _dailyRenderVersion) return;
        list.innerHTML = ''; // مسح القائمة مباشرة قبل الإضافة لمنع التكرار
        list.appendChild(fragment);

        // ✅ FIX 5: EVENT DELEGATION — listener واحد على الـ container بدلاً من listener لكل صف
        // نحذف أي listener قديم أولاً عشان ما يتكررش عند إعادة الرندر
        const oldHandler = list._delegatedHandler;
        if (oldHandler) list.removeEventListener('change', oldHandler);

        const delegatedHandler = (e) => {
            const row = e.target.closest('[data-sid]');
            if (!row) return;
            const studentId = row.dataset.sid;

            // Handle att-select change
            if (e.target.classList.contains('att-select')) {
                const val = e.target.value;
                
                // ✅ PHASE 1: Sync manual DOM change to Memory State
                if (!liveSessionData.attendance[studentId]) {
                    liveSessionData.attendance[studentId] = { status: 'absent', time: null };
                }
                liveSessionData.attendance[studentId].status = val;
                if (val === 'present' && !liveSessionData.attendance[studentId].time) {
                    liveSessionData.attendance[studentId].time = new Date().toISOString();
                }

                const hwCheck = row.querySelector('.hw-check');

                if (val === 'present') {
                    row.classList.add('bg-green-50', 'border-green-500', 'dark:bg-green-900/20');
                    row.classList.remove('bg-white', 'dark:bg-darkSurface', 'border-transparent');
                    if (hwCheck) hwCheck.disabled = false;
                } else {
                    row.classList.remove('bg-green-50', 'border-green-500', 'dark:bg-green-900/20');
                    row.classList.add('bg-white', 'dark:bg-darkSurface', 'border-transparent');
                    // FIX #15: Disable but do NOT uncheck — preserve previously submitted homework
                    if (hwCheck) hwCheck.disabled = true;
                }

                updateAttendanceCount();
                scheduleThrottledSave();
            }

            // Handle hw-check change
            if (e.target.classList.contains('hw-check')) {
                // ✅ PHASE 1: Sync manual DOM change to Memory State
                if (!liveSessionData.homework[studentId]) {
                    liveSessionData.homework[studentId] = { submitted: false, score: null };
                }
                liveSessionData.homework[studentId].submitted = e.target.checked;
                
                scheduleThrottledSave();
            }
        };

        list.addEventListener('change', delegatedHandler);
        list._delegatedHandler = delegatedHandler; // نحفظ مرجع للـ listener عشان نقدر نشيله المرة الجاية

        // دالة صغيرة لتحديث العداد
        function updateAttendanceCount() {
            const count = document.querySelectorAll('.att-select option[value="present"]:checked').length;
            document.getElementById('attendanceCountBadge').innerText = `${count}/${allStudents.length}`;
        }

        updateAttendanceCount(); // تشغيل العداد أول مرة
    } catch (error) {
        console.error("Error rendering daily class list:", error);
        sentryCaptureError(error, { action: "renderDailyList", groupId: SELECTED_GROUP_ID });
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
        const [filteredAttRaw, filteredHwRaw] = await Promise.all([
            getAllFromDB('attendance', 'groupId', SELECTED_GROUP_ID).catch(() => []),
            getAllFromDB('assignments', 'groupId', SELECTED_GROUP_ID).catch(() => [])
        ]);

        // --- أ. معالجة الحضور ---
        let attLabels = ["-", "-", "-", "-", "-", "-", "-"];
        let attData = [0, 0, 0, 0, 0, 0, 0];

        const filteredAtt = filteredAttRaw
            .filter(d => d.date && !d.isTransferHistory)
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
            .filter(d => isHomeworkAssignment(d) && d.date && !d.isTransferHistory)
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

    } catch (e) { console.error("Analytics Critical Error:", e);
    sentryCaptureError(e, { action: "groupAnalytics", groupId: SELECTED_GROUP_ID }); }
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
        if (!TEACHER_ID) {
            if (!isSilent) console.warn("⚠️ لا يوجد معرف مدرس. تم إلغاء الحفظ.");
            return;
        }

        // ✅ PHASE 3: Extract strictly from memory to prevent cross-group injection
        const targetGroupId = liveSessionData.groupId;
        const targetDate = liveSessionData.date;

        if (!targetGroupId || !targetDate) {
            if (!isSilent) console.warn("⚠️ Save aborted: No live session data active.");
            return;
        }

        if (!isSilent && saveBtn) {
            oldText = saveBtn.innerText;
            saveBtn.innerHTML = '<i class="ri-loader-4-line animate-spin"></i>';
            saveBtn.disabled = true;
        }

        const promises = [];

        // ✅ PHASE 2: Read from liveSessionData instead of DOM
        if (Object.keys(liveSessionData.attendance).length === 0) {
            if (!isSilent) {
                console.warn("ℹ️ No session data found for daily save; skipping.");
            }
        } else {
            // --- Attendance ---
            const attendanceRecords = [];
            for (const [studentId, attRec] of Object.entries(liveSessionData.attendance)) {
                attendanceRecords.push({
                    studentId: studentId,
                    status: attRec.status,
                    time: attRec.status === 'present' ? (attRec.time || new Date().toISOString()) : null
                });
            }

            if (attendanceRecords.length > 0) {
                const attendanceId = `${targetGroupId}_${targetDate}`;
                const attendanceData = {
                    id: attendanceId,
                    teacherId: TEACHER_ID,
                    groupId: targetGroupId,
                    date: targetDate,
                    records: attendanceRecords
                };

                sentryBreadcrumb("Attendance save queued", "attendance", { groupId: targetGroupId });
                logEvent("attendance_saved", { group_id: targetGroupId });
                console.log("📝 Queuing attendance save from memory:", {
                    path: `teachers/${TEACHER_ID}/groups/${targetGroupId}/dailyAttendance/${targetDate}`,
                    localId: attendanceId,
                    recordsCount: attendanceRecords.length
                });

                promises.push(putToDB('attendance', attendanceData));
                promises.push(
                    addToSyncQueue({
                        type: 'set',
                        path: `teachers/${TEACHER_ID}/groups/${targetGroupId}/dailyAttendance/${targetDate}`,
                        data: {
                            date: targetDate,
                            records: attendanceRecords,
                            _noNotify: false
                        }
                    })
                );
            }

            // --- Homework (daily) ---
            if (typeof hasHomeworkToday !== 'undefined' && hasHomeworkToday) {
                const hwId = `${targetGroupId}_HW_${targetDate}`;
                const scores = {};

                for (const [studentId, hwRec] of Object.entries(liveSessionData.homework)) {
                    scores[studentId] = {
                        submitted: !!hwRec.submitted
                    };
                }

                // ✅ Fix: Only persist if at least one student actually submitted.
                // Prevents creating phantom homework records that pollute analytics.
                const hasRealSubmission = Object.values(scores).some(v => v.submitted === true);
                if (!hasRealSubmission) {
                    console.log("ℹ️ Skipping homework save — no student submitted yet.");
                } else {
                    let hwData = await getFromDB('assignments', hwId);
                    if (hwData) {
                        for (const sid in scores) {
                            if (!hwData.scores) hwData.scores = {};
                            hwData.scores[sid] = { ...hwData.scores[sid], ...scores[sid] };
                        }
                        hwData.type = 'homework';
                    } else {
                        hwData = {
                            id: hwId,
                            teacherId: TEACHER_ID,
                            groupId: targetGroupId,
                            name: `واجب ${targetDate}`,
                            date: targetDate,
                            scores,
                            type: 'homework'
                        };
                    }

                    console.log("📝 Queuing homework save:", {
                        path: `teachers/${TEACHER_ID}/groups/${targetGroupId}/assignments/${hwId}`,
                        localId: hwId,
                        studentsCount: Object.keys(scores).length
                    });

                    promises.push(putToDB('assignments', hwData));
                    promises.push(
                        addToSyncQueue({
                            type: 'set',
                            path: `teachers/${TEACHER_ID}/groups/${targetGroupId}/assignments/${hwId}`,
                            data: { ...hwData, _noNotify: false }
                        })
                    );
                }
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
        sentryCaptureError(error, { action: "saveDailyData", groupId: SELECTED_GROUP_ID, teacherId: TEACHER_ID });
        if (!isSilent) showToast("حدث خطأ أثناء الحفظ", "error");
    } finally {
        if (!isSilent && saveBtn) {
            saveBtn.innerText = oldText || "حفظ الكل";
            saveBtn.disabled = false;
        }
    }
}

// ==========================================
// 9. STUDENTS (With Link & Messages)
// ==========================================
function renderStudents(filter = "") {
    const container = document.getElementById('studentsListDisplay');
    container.innerHTML = '';
    const normalizedFilter = filter.trim().toLowerCase();
    const searchPhoneFilter = normalizedFilter.startsWith('+20') ? normalizedFilter.replace('+20', '0') : normalizedFilter;
    const filtered = allStudents.filter(s => {
        const pPhone = (s.parentPhoneNumber || "").replace(/^\+20/, '0');
        return (s.name || "").toLowerCase().includes(normalizedFilter) ||
               pPhone.includes(searchPhoneFilter) ||
               ((s.childId || s.id || "").toLowerCase().includes(normalizedFilter));
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-10 opacity-40 animate-fade-in text-center">
                <i class="ri-user-search-line text-6xl mb-2 text-gray-400"></i>
                <p class="font-black text-gray-500 tracking-widest uppercase text-xs">${translations[currentLang].studentsNoResults}</p>
                <p class="text-[10px] text-gray-400 mt-1">${translations[currentLang].studentsStartAdding}</p>
            </div>
        `;
        return;
    }
    const fragment = document.createDocumentFragment();

    filtered.forEach(s => {
        const pNum = s.parentPhoneNumber ? s.parentPhoneNumber.trim() : "";
        const fullDirectLink = `${PARENT_APP_BASE_URL}?t=${encodeURIComponent(TEACHER_ID)}&g=${encodeURIComponent(SELECTED_GROUP_ID)}&s=${encodeURIComponent(s.id)}&n=${encodeURIComponent(s.name)}&p=${encodeURIComponent(pNum)}`;

        const div = document.createElement('div');
        div.className = "record-item cursor-pointer";
        // ✅ PERF FIX 4: index for DOM-walk search
        const pPhone = s.parentPhoneNumber ? s.parentPhoneNumber.replace(/^\+20/, '0') : '';
        div.dataset.searchKey = `${(s.name || '').toLowerCase()} ${pPhone} ${(s.childId || s.id || '').toLowerCase()}`;
        div.onclick = (e) => {
            if (!e.target.closest('button')) openStudentProfile(s.id);
        };
        const fcmTitle = s.parentFcmToken ? translations[currentLang].fcmEnabledTitle : translations[currentLang].fcmDisabledTitle;
        const msgTitle = translations[currentLang].sendMessageTooltip;
        const displayPhone = s.parentPhoneNumber ? (s.parentPhoneNumber.startsWith('+2') ? s.parentPhoneNumber.substring(2) : s.parentPhoneNumber) : '';
        div.innerHTML = `
            <div class="flex-1">
                <div class="flex items-center gap-2">
                    <p class="font-bold text-gray-800 dark:text-white"> ${escapeHtml(s.name)}</p>
                    <i class="ri-notification-3-fill ${s.parentFcmToken ? 'text-green-500' : 'text-red-500'}" title="${fcmTitle}"></i>
                </div>
                <p class="text-xs text-gray-500">${escapeHtml(displayPhone)}</p>
            </div>
            <div class="flex gap-2">
                <button class="btn-icon w-10 h-10 bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 msg-btn" title="${msgTitle}">
                    <i class="ri-chat-1-line"></i>
                </button>
                <button class="btn-icon w-10 h-10 bg-green-50 hover:bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400 act-btn" title="تفعيل حساب الأب (باسورد: elnazer@123456)">
                    <i class="ri-user-add-line"></i>
                </button>
                <button class="btn-icon w-10 h-10 bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300 move-btn" title="نقل الطالب لمجموعة أخرى">
                    <i class="ri-arrow-right-up-line"></i>
                </button>
                <button class="btn-icon w-10 h-10 bg-red-50 hover:bg-red-100 text-red-500 dark:bg-red-900/20 del-btn">
                    <i class="ri-delete-bin-line"></i>
                </button>
            </div>
        `;
        div.querySelector('.msg-btn').onclick = () => openMessageModal(s);
        div.querySelector('.act-btn').onclick = () => activateParentAccountUI(s.parentPhoneNumber);
        div.querySelector('.move-btn').onclick = (e) => { e.stopPropagation(); openMoveStudentModal(s); };
        div.querySelector('.del-btn').onclick = () => deleteStudent(s.id);

        fragment.appendChild(div);
    });

    container.appendChild(fragment);
}

function openMessageModal(student) {
    currentMessageStudentId = student.id;
    document.getElementById('msgStudentName').innerText = `${student.name}`;
    document.getElementById('customMessageInput').value = '';
    document.getElementById('messageModal').classList.remove('hidden');
}

async function sendCustomMessageAction() {
    if (!firebase.auth().currentUser) {
        showToast("انتهت جلستك، يرجى تسجيل الدخول مجدداً ⚠️", "error");
        return;
    }

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



async function addNewStudent() {
    // ✅ زيادة أمان: التأكد من وجود مجموعة
    if (!SELECTED_GROUP_ID) {
        showToast(translations[currentLang].selectGroupFirst || "الرجاء اختيار مجموعة أولاً", "error");
        return;
    }

    const nameInput = document.getElementById('newStudentName');
    const phoneInput = document.getElementById('newParentPhoneNumber');
    const name = nameInput.value.trim();
    let phone = phoneInput.value.trim();
    if (phone) {
        // Remove spaces, dashes, or parentheses
        const cleanDigits = phone.replace(/[\s\-\(\)]/g, '');
        
        // Regex to check Egyptian format: 010, 011, 012, 015 followed by 8 digits
        const egRegex = /^01[0125]\d{8}$/;
        // Regex to check international Egyptian format: +2010, +2011, +2012, +2015 followed by 8 digits
        const egIntRegex = /^\+201[0125]\d{8}$/;
        // General international format: starts with + followed by 7-15 digits
        const intRegex = /^\+\d{7,15}$/;

        if (egRegex.test(cleanDigits)) {
            phone = '+2' + cleanDigits;
        } else if (egIntRegex.test(cleanDigits)) {
            phone = cleanDigits;
        } else if (cleanDigits.startsWith('+') && intRegex.test(cleanDigits)) {
            phone = cleanDigits;
        } else {
            showToast(currentLang === 'ar' ? 'عفواً، رقم هاتف ولي الأمر غير صالح. يرجى إدخال رقم صحيح (مثال: 01xxxxxxxxx)' : 'Sorry, the parent phone number is invalid. Please enter a valid number (e.g. 01xxxxxxxxx)', 'error');
            return;
        }
    }
    if (!name) return;

    // Check for duplicate student name and phone in the current group
    const normName = name.trim().toLowerCase();
    const isDuplicate = allStudents.some(s => {
        const sName = (s.name || '').trim().toLowerCase();
        if (phone) {
            return sName === normName && s.parentPhoneNumber === phone;
        } else {
            return sName === normName && (!s.parentPhoneNumber || s.parentPhoneNumber === '');
        }
    });

    if (isDuplicate) {
        showToast(currentLang === 'ar' ? 'عفواً، هذا الطالب مسجل بالفعل بنفس الاسم ورقم الهاتف في هذه المجموعة!' : 'Sorry, this student is already registered with the same name and phone number in this group!', "error");
        return;
    }

    // Check if phone number is associated with existing students across the database
    let existingStudentsOfParent = [];
    if (phone) {
        try {
            const allLocalStudents = await getAllFromDB('students');
            const seenChildIds = new Set();
            allLocalStudents.forEach(s => {
                const cId = s.childId || s.id;
                if (s.parentPhoneNumber === phone && !seenChildIds.has(cId)) {
                    seenChildIds.add(cId);
                    existingStudentsOfParent.push({
                        id: s.id,
                        childId: cId,
                        name: s.name,
                        cardId: s.cardId,
                        parentPhoneNumber: s.parentPhoneNumber
                    });
                }
            });
        } catch (e) {
            console.error("Error querying local students for parent phone check", e);
        }
    }

    let childId = 'ST-' + Math.random().toString(36).substring(2, 9).toUpperCase();
    let nameToUse = name;
    let cardIdToUse = null;

    if (existingStudentsOfParent.length > 0) {
        const result = await showStudentLinkModal(name, phone, existingStudentsOfParent);
        if (result.action === 'cancel') {
            return;
        } else if (result.action === 'link') {
            childId = result.student.childId;
            nameToUse = result.student.name;
            cardIdToUse = null; // Do not copy sibling's cardId
        }
    }

    const id = generateUniqueId();
    const data = { id, groupId: SELECTED_GROUP_ID, name: nameToUse, parentPhoneNumber: phone, cardId: cardIdToUse, childId };
    await putToDB('students', data);
    await addToSyncQueue({ type: 'add', path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/students`, id, data });
    nameInput.value = ''; phoneInput.value = '';
    allStudents.push(data);
    // ─── Req #4: Keep O(1) map in sync for the new student ───────────────────
    if (data.cardId) crossGroupLookupMap.set(data.cardId, data);
    if (data.parentPhoneNumber) crossGroupLookupMap.set(data.parentPhoneNumber.trim().replace(/^\+2/, ''), data);
    crossGroupLookupMap.set(data.id, data);
    renderStudents();
    
    // Instead of just a toast, let's open the card link modal
    openCardLinkModal(data);
}

function showStudentLinkModal(name, phone, existingStudents) {
    return new Promise((resolve) => {
        const modal = document.getElementById('studentLinkSelectorModal');
        const overlay = document.getElementById('studentLinkSelectorOverlay');
        const content = document.getElementById('studentLinkSelectorContent');
        const listContainer = document.getElementById('existingStudentsSelectorList');
        const addNewBtn = document.getElementById('addNewChildConfirmBtn');
        const cancelBtn = document.getElementById('cancelChildSelectionBtn');

        // Render existing students
        listContainer.innerHTML = '';
        existingStudents.forEach(est => {
            const btn = document.createElement('button');
            btn.className = "w-full text-right p-4 rounded-2xl bg-gray-50 dark:bg-white/5 hover:bg-brand/10 dark:hover:bg-brand/10 border border-gray-100 dark:border-white/5 hover:border-brand/30 dark:hover:border-brand/30 transition-all flex items-center justify-between group";
            btn.innerHTML = `
                <div class="flex flex-col text-right">
                    <span class="font-bold text-gray-900 dark:text-white group-hover:text-brand transition-colors">${est.name}</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-xs font-bold text-brand px-3 py-1.5 rounded-xl bg-brand/10">ربط وتحديد ✔️</span>
                </div>
            `;
            btn.onclick = () => {
                closeModal();
                resolve({ action: 'link', student: est });
            };
            listContainer.appendChild(btn);
        });

        const closeModal = () => {
            content.classList.remove('scale-100', 'opacity-100');
            content.classList.add('scale-95', 'opacity-0');
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }, 300);
        };

        // Open animation
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => {
            content.classList.remove('scale-95', 'opacity-0');
            content.classList.add('scale-100', 'opacity-100');
        }, 10);

        addNewBtn.onclick = () => {
            closeModal();
            resolve({ action: 'create_new' });
        };

        cancelBtn.onclick = () => {
            closeModal();
            resolve({ action: 'cancel' });
        };

        overlay.onclick = () => {
            closeModal();
            resolve({ action: 'cancel' });
        };
    });
}

let studentPendingCardLink = null;

function openCardLinkModal(student) {
    studentPendingCardLink = student;
    document.getElementById('cardLinkStudentName').innerText = student.name;
    document.getElementById('cardLinkModal').classList.remove('hidden');
}

function closeCardLinkModal() {
    studentPendingCardLink = null;
    document.getElementById('cardLinkModal').classList.add('hidden');
}

let isLinkingCard = false; // 1. قفل لمنع التكرار (يجب أن يكون خارج الدالة)

async function linkCardToStudent(student, cardId) {
    // لو الفنكشن شغالة حالياً ومخلصتش، ارفض أي سكان جديد (يمنع التكرار)
    if (isLinkingCard) return; 
    isLinkingCard = true;

    // توحيد حالة الحروف للكارت (عشان لو الاسكانر قراه سمول يظبط)
    const safeCardId = cardId.toUpperCase().trim();

    // ✅ إضافة الحماية للكاميرا والإدخال اليدوي معاً
    if (!safeCardId.startsWith('NAZ-') || safeCardId.length < 8) {
        showToast('❌ عذراً، هذا ليس كارت "الناظر" صالح للاستخدام!', 'error');
        isLinkingCard = false;
        return;
    }
    // 2. إظهار حالة التحميل للمستخدم عشان ميسحبش سكان تاني
    const modalTitle = document.getElementById('cardLinkStudentName');
    const originalTitle = modalTitle ? modalTitle.innerText : '';
    if (modalTitle) {
        modalTitle.innerHTML = `<i class="ri-loader-4-line animate-spin text-brand"></i> جاري ربط الكارت...`;
    }

    try {
        const allGroups = await getAllFromDB('groups');
        const allStudentsFromDB = await getAllFromDB('students');
        
        // التحقق من تكرار الكارت محلياً
        const conflictStudent = allStudentsFromDB.find(s => 
            s.cardId && s.cardId.toUpperCase() === safeCardId && s.id !== student.id
        );
        
        if (conflictStudent) {
            const conflictGroup = allGroups.find(g => g.id === conflictStudent.groupId);
            const groupName = conflictGroup ? conflictGroup.name : '';
            showToast(`⛔ الكارت مربوط بالطالب "${conflictStudent.name}" في مجموعة "${groupName}"!`, 'error');
            closeCardLinkModal();
            return;
        }

        // التحقق من السيرفر
        const ownerId = TEACHER_CENTER_ID || TEACHER_ID;
        if (navigator.onLine) {
            const cardRef = firestoreDB.collection('cards').doc(safeCardId);
            const cardSnap = await cardRef.get();
            
            if (cardSnap.exists) {
                const cardData = cardSnap.data();
                if (cardData.ownerId && cardData.ownerId !== ownerId) {
                    showToast(`⛔ هذا الكارت مسجل مسبقاً في مؤسسة أخرى!`, 'error');
                    closeCardLinkModal();
                    return;
                }
            } else {
                await cardRef.set({
                    id: safeCardId,
                    ownerId: ownerId,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }

        // حفظ البيانات
        student.cardId = safeCardId;
        await putToDB('students', student);
        await addToSyncQueue({ 
            type: 'update', 
            path: `teachers/${TEACHER_ID}/groups/${student.groupId}/students/${student.id}`, 
            data: { cardId: safeCardId } 
        });

        // تحديث الميموري والقائمة الخلفية
        const idx = allStudents.findIndex(s => s.id === student.id);
        if (idx !== -1) {
            allStudents[idx].cardId = safeCardId;
            if (document.getElementById('tab-students') && !document.getElementById('tab-students').classList.contains('hidden')) {
                renderStudents();
            }
        }
        
        // 3. ✨ التحديث الفوري لبروفايل الطالب المفتوح (يمنع الحاجة للريفريش) ✨
        if (currentProfileId === student.id) {
            const cardBadgeText = document.getElementById('profileCardText');
            const cardBadgeIcon = document.getElementById('profileCardIcon');
            if (cardBadgeText && cardBadgeIcon) {
                cardBadgeText.innerText = safeCardId;
                cardBadgeText.classList.remove('text-gray-500');
                cardBadgeText.classList.add('text-brand');
                cardBadgeIcon.className = 'ri-qr-code-line text-brand';
            }
        }

        closeCardLinkModal();
        logEvent("student_added", { group_id: SELECTED_GROUP_ID });
        showToast(translations[currentLang].studentAdded || 'تم ربط الكارت بنجاح!', 'success');
        
    } catch (err) {
        console.error('Card link error:', err);
        showToast('حدث خطأ أثناء ربط الكارت', 'error');
    } finally {
        // إرجاع العنوان وفك القفل للعملية القادمة
        if (modalTitle) modalTitle.innerText = originalTitle;
        isLinkingCard = false;
        
        // إرجاع وضع الاسكانر لطبيعته
        const activeTab = document.querySelector('.tab-button.active')?.dataset.tab;
        currentScannerMode = activeTab === 'payments' ? 'payments' : 'daily';
    }
}

function startCardLinkScanner() {
    document.getElementById('cardLinkModal').classList.add('hidden');
    // We do NOT clear studentPendingCardLink here, because the scanner needs it!
    startScanner('link-card');
}

async function deleteStudent(id) {
    const confirmed = await showCustomConfirm(translations[currentLang].confirmDelete, '', 'ri-user-unfollow-line');
    if (!confirmed) return;
    await deleteFromDB('students', id);
    await addToSyncQueue({ type: 'delete', path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/students/${id}` });
    allStudents = allStudents.filter(s => s.id !== id);
    renderStudents();
}

// ─── Move Student to Another Group ─────────────────────────────────────────
let _moveStudentTarget = null; // student object being moved

// ✅ FIX: Missing function to trigger Move Modal directly from the Student Profile UI
window.triggerMoveStudentFromProfile = function() {
    if (!currentProfileId) return;
    const student = allStudents.find(s => s.id === currentProfileId);
    if (student) {
        openMoveStudentModal(student);
    } else {
        showToast('⚠️ لم يتم العثور على الطالب', 'error');
    }
};

async function openMoveStudentModal(student) {
    _moveStudentTarget = student;

    // Populate student name in modal
    const el = document.getElementById('moveModal_studentName');
    if (el) el.textContent = student.name;

    // Load all groups of this teacher (excluding the current one)
    const select = document.getElementById('moveModal_groupSelect');
    if (!select) return;
    select.innerHTML = '<option value="">جاري تحميل المجموعات...</option>';

    try {
        const allGroups = await getAllFromDB('groups', 'teacherId', TEACHER_ID);
        const otherGroups = allGroups.filter(g => g.id !== SELECTED_GROUP_ID);

        select.innerHTML = '';
        if (otherGroups.length === 0) {
            select.innerHTML = '<option value="">لا توجد مجموعات أخرى</option>';
        } else {
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = 'اختر المجموعة...';
            select.appendChild(placeholder);
            otherGroups.forEach(g => {
                const opt = document.createElement('option');
                opt.value = g.id;
                opt.textContent = g.name || g.id;
                select.appendChild(opt);
            });
        }
    } catch (err) {
        select.innerHTML = '<option value="">⚠️ خطأ في التحميل</option>';
        console.error('openMoveStudentModal error', err);
    }

    // Reset status & show modal
    const status = document.getElementById('moveModal_status');
    if (status) { status.textContent = ''; status.className = 'text-sm font-bold mt-3 h-5'; }
    document.getElementById('moveStudentModal').classList.remove('hidden');
}

window.closeMoveStudentModal = function () {
    document.getElementById('moveStudentModal').classList.add('hidden');
    _moveStudentTarget = null;
};

window.confirmMoveStudent = async function () {
    const student = _moveStudentTarget;
    const select  = document.getElementById('moveModal_groupSelect');
    const status  = document.getElementById('moveModal_status');
    const confirmBtn = document.getElementById('moveModal_confirmBtn');
    const targetGroupId = select?.value;

    if (!student || !targetGroupId) {
        if (status) { status.textContent = 'اختر مجموعة أولاً'; status.className = 'text-sm font-bold mt-3 h-5 text-red-500'; }
        return;
    }

    // Source group is the student's own groupId (works from profile view too)
    const sourceGroupId = student.groupId || SELECTED_GROUP_ID;

    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<i class="ri-loader-4-line animate-spin"></i> جاري النقل...';
    if (status) { status.textContent = ''; status.className = 'text-sm font-bold mt-3 h-5'; }

    try {
        // Get target group name for feedback toast
        const targetGroup = await getFromDB('groups', targetGroupId);
        const targetGroupName = targetGroup?.name || targetGroupId;

        // ── 1. Write student to new group in IndexedDB ───────────────────────
        const newStudentData = { ...student, groupId: targetGroupId };
        await putToDB('students', newStudentData);

        // ── 2. Queue Firestore: ADD student to target group ──────────────────
        await addToSyncQueue({
            type: 'set',
            path: `teachers/${TEACHER_ID}/groups/${targetGroupId}/students/${student.id}`,
            data: newStudentData
        });

        // ── 3. Queue Firestore: DELETE student from source group ─────────────
        await addToSyncQueue({
            type: 'delete',
            path: `teachers/${TEACHER_ID}/groups/${sourceGroupId}/students/${student.id}`
        });

        // ── 4. Copy historical records to the new group ──────────────────────
        // Records in the old group are KEPT as archive — we only copy, not delete.
        // New sessions created in the target group are flagged with isTransferHistory:true
        // so analytics functions can safely ignore them.
        if (status) { status.textContent = '📂 جاري نقل السجلات التاريخية...'; }

        // ─── 4a. Attendance (records[] array schema) ──────────────────────────
        try {
            const sourceAtt = await getAllFromDB('attendance', 'groupId', sourceGroupId);
            for (const srcDoc of sourceAtt) {
                if (!srcDoc.date) continue;
                const studentRecord = (srcDoc.records || []).find(r => r.studentId === student.id);
                if (!studentRecord) continue;

                const targetAttId = `${targetGroupId}_${srcDoc.date}`;
                let targetDoc = await getFromDB('attendance', targetAttId);

                if (targetDoc) {
                    // Session exists → just push the student record if not already there
                    if (!targetDoc.records) targetDoc.records = [];
                    const alreadyIn = targetDoc.records.find(r => r.studentId === student.id);
                    if (!alreadyIn) targetDoc.records.push(studentRecord);
                } else {
                    // Session doesn't exist → create it, flag as transfer history
                    targetDoc = {
                        id: targetAttId,
                        date: srcDoc.date,
                        teacherId: TEACHER_ID,
                        groupId: targetGroupId,
                        isTransferHistory: true,
                        records: [studentRecord]
                    };
                }

                // Save locally WITHOUT the silent flag to prevent IndexedDB pollution
                await putToDB('attendance', targetDoc);
                
                // Inject the silent flag ONLY for the sync queue payload
                await addToSyncQueue({
                    type: 'set',
                    path: `teachers/${TEACHER_ID}/groups/${targetGroupId}/dailyAttendance/${srcDoc.date}`,
                    data: { ...targetDoc, _noNotify: true }
                });
            }
        } catch (e) { console.warn('Move: attendance copy failed', e); }

        // ─── 4b. Assignments & Exams (scores{} object schema) ─────────────────
        try {
            const sourceAssign = await getAllFromDB('assignments', 'groupId', sourceGroupId);
            for (const srcDoc of sourceAssign) {
                if (!srcDoc.date && !srcDoc.name) continue;
                const studentScore = (srcDoc.scores || {})[student.id];
                if (studentScore === undefined) continue;

                const targetAssignId = srcDoc.id.replace(sourceGroupId, targetGroupId);
                let targetDoc = await getFromDB('assignments', targetAssignId);

                if (targetDoc) {
                    // Assignment exists → just add the student's score
                    if (!targetDoc.scores) targetDoc.scores = {};
                    targetDoc.scores[student.id] = studentScore;
                } else {
                    // Assignment doesn't exist → create it, flag as transfer history
                    targetDoc = {
                        ...srcDoc,
                        id: targetAssignId,
                        groupId: targetGroupId,
                        isTransferHistory: true,
                        scores: { [student.id]: studentScore }
                    };
                }

                // Save locally WITHOUT the silent flag to prevent IndexedDB pollution
                await putToDB('assignments', targetDoc);
                
                // Inject the silent flag ONLY for the sync queue payload
                await addToSyncQueue({
                    type: 'set',
                    path: `teachers/${TEACHER_ID}/groups/${targetGroupId}/assignments/${targetAssignId}`,
                    data: { ...targetDoc, _noNotify: true }
                });
            }
        } catch (e) { console.warn('Move: assignments/exams copy failed', e); }

        // ─── 4c. Payments (records[] array schema) ────────────────────────────
        // Payments have NO groupId field — filter by ID prefix instead
        try {
            const allPayments = await getAllFromDB('payments');
            const sourcePayments = allPayments.filter(p => p.id && p.id.startsWith(sourceGroupId + '_PAY_'));
            for (const srcDoc of sourcePayments) {
                // Extract month from the ID (format: GROUP_ID_PAY_YYYY-MM)
                const month = srcDoc.id.split('_PAY_')[1];
                if (!month) continue;
                
                if (!srcDoc.records) continue;
                const studentPaymentIndex = srcDoc.records.findIndex(r => r.studentId === student.id);
                if (studentPaymentIndex === -1) continue;
                const studentPayment = srcDoc.records[studentPaymentIndex];

                const targetPayId = `${targetGroupId}_PAY_${month}`;
                let targetDoc = await getFromDB('payments', targetPayId);

                if (targetDoc) {
                    if (!targetDoc.records) targetDoc.records = [];
                    const alreadyIn = targetDoc.records.find(r => r.studentId === student.id);
                    if (!alreadyIn) targetDoc.records.push(studentPayment);
                } else {
                    targetDoc = {
                        id: targetPayId,
                        month,
                        groupId: targetGroupId,
                        records: [studentPayment]
                    };
                }

                // Save TARGET locally WITHOUT the silent flag to prevent IndexedDB pollution
                await putToDB('payments', targetDoc);
                
                // Inject the silent flag ONLY for the TARGET sync queue payload
                await addToSyncQueue({
                    type: 'set',
                    path: `teachers/${TEACHER_ID}/groups/${targetGroupId}/payments/${month}`,
                    data: { ...targetDoc, _noNotify: true }
                });

                // ✅ FIX: Remove from source group to prevent double-counting in income
                srcDoc.records.splice(studentPaymentIndex, 1);
                
                // Save SOURCE locally WITHOUT silent flag
                await putToDB('payments', srcDoc);
                
                // Sync SOURCE removal to server WITH silent flag
                await addToSyncQueue({
                    type: 'update',
                    path: `teachers/${TEACHER_ID}/groups/${sourceGroupId}/payments/${month}`,
                    data: { records: srcDoc.records, _noNotify: true }
                });
            }
        } catch (e) { console.warn('Move: payments transfer failed', e); }

        // ── 5. Clear Payment Caches to fix Income calculation bugs ───────────
        _lastMonthCalculated = null;
        _lastGroupCalculated = null;
        _cachedOtherGroupsTotal = 0;
        if (typeof calculateOverallIncome === 'function') {
            calculateOverallIncome();
        }

        // ── 6. Remove from current session's allStudents array ───────────────
        allStudents = allStudents.filter(s => s.id !== student.id);

        // ── 7. Update crossGroupLookupMap ────────────────────────────────────
        if (crossGroupLookupMap) {
            const updatedEntry = newStudentData;
            if (student.id)                crossGroupLookupMap.set(String(student.id).toUpperCase().trim(), updatedEntry);
            if (student.cardId)            crossGroupLookupMap.set(String(student.cardId).toUpperCase().trim(), updatedEntry);
            if (student.parentPhoneNumber) crossGroupLookupMap.set(String(student.parentPhoneNumber).trim().replace(/^\+2/, ''), updatedEntry);
        }

        renderStudents();
        window.closeMoveStudentModal();
        showToast(`✅ تم نقل ${student.name} إلى مجموعة "${targetGroupName}" مع كل سجلاته بنجاح`, 'success');

    } catch (err) {
        console.error('confirmMoveStudent error', err);
        if (status) { status.textContent = '❌ حدث خطأ: ' + err.message; status.className = 'text-sm font-bold mt-3 h-5 text-red-500'; }
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<i class="ri-check-double-line"></i> تأكيد النقل';
    }
};
// ────────────────────────────────────────────────────────────────────────────



async function activateParentAccountUI(phone) {
    if (!phone) {
        showToast("لا يوجد رقم هاتف مسجل لهذا الطالب!", "error");
        return;
    }
    const confirmed = await showCustomConfirm("هل أنت متأكد من تفعيل حساب الأب لكبار السن؟ كلمة المرور ستكون elnazer@123456", "تفعيل الحساب", "ri-user-add-line");
    if (!confirmed) return;
    
    showToast("جاري التفعيل...", "info");
    try {
        const activateFunc = firebase.functions().httpsCallable('activateParentAccount');
        const res = await activateFunc({ phone: phone });
        if (res.data.success) {
            showToast(res.data.message, "success");
        }
    } catch (e) {
        console.error(e);
        showToast("حدث خطأ أثناء التفعيل: " + e.message, "error");
    }
}

// --- Payments ---
 let _paymentsRenderVersion = 0; // ✅ عداد لمنع تكرار الطلاب عند التحميل المتوازي (Race Condition Guard)

// ── Memory-first total calculator ─────────────────────────────────────────
function recalculateGroupTotalFromMemory() {
    let total = 0;
    Object.values(livePaymentData.records).forEach(r => {
        if (r.paid) total += (parseInt(r.amount) || 0);
    });
    const groupTotalDisplay = document.getElementById('groupTotalDisplay');
    if (groupTotalDisplay) groupTotalDisplay.innerText = `${total.toLocaleString()} ج.م`;
    calculateOverallIncome(total);
}

async function renderPaymentsList(filter = "") {
    const thisRenderVersion = ++_paymentsRenderVersion;
    if (typeof filter !== 'string') filter = "";
    const month = document.getElementById('paymentMonthInput').value;
    const defaultAmountInput = document.getElementById('defaultAmountInput');
    const container = document.getElementById('paymentsList');

    container.innerHTML = '';

    if (!month || !allStudents.length) return;

    const payId = `${SELECTED_GROUP_ID}_PAY_${month}`;
    const doc = await getFromDB('payments', payId);
    // ✅ فحص: لو نداء جديد بدأ أثناء الانتظار، نوقف النداء القديم فوراً
    if (thisRenderVersion !== _paymentsRenderVersion) return;

    // ── Hydrate livePaymentData (only when group or month changes) ────────────
    if (livePaymentData.groupId !== SELECTED_GROUP_ID || livePaymentData.month !== month) {
        livePaymentData.groupId = SELECTED_GROUP_ID;
        livePaymentData.month   = month;
        livePaymentData.records = {};
        const dbMap = {};
        if (doc?.records) {
            doc.records.forEach(r => { dbMap[r.studentId] = r.amount; });
        }
        allStudents.forEach(s => {
            const amt = dbMap[s.id];
            livePaymentData.records[s.id] = { amount: parseInt(amt) || 0, paid: !!(amt && amt > 0) };
        });
    }

    // ── Initial total from memory ─────────────────────────────────────────────
    recalculateGroupTotalFromMemory();

    // ── Filter & render ───────────────────────────────────────────────────────
    const normalizedFilter = filter.trim().toLowerCase();
    const searchPhoneFilter = normalizedFilter.startsWith('+20') ? normalizedFilter.replace('+20', '0') : normalizedFilter;
    const studentsToRender = allStudents.filter(s => {
        const pPhone = (s.parentPhoneNumber || "").replace(/^\+20/, '0');
        return (s.name || "").toLowerCase().includes(normalizedFilter) ||
               pPhone.includes(searchPhoneFilter) ||
               ((s.childId || s.id || "").toLowerCase().includes(normalizedFilter));
    });

    if (studentsToRender.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-500 py-4">${currentLang === 'ar' ? 'لا يوجد نتائج للبحث' : 'No search results found'}</p>`;
        return;
    }

    let finalStudents = studentsToRender.filter(s => {
        if (currentPaymentFilter === 'all') return true;
        const rec = livePaymentData.records[s.id];
        const isPaid = rec && rec.paid;
        if (currentPaymentFilter === 'paid') return isPaid;
        if (currentPaymentFilter === 'unpaid') return !isPaid;
        return true;
    });

    if (finalStudents.length === 0 && studentsToRender.length > 0) {
        container.innerHTML = `<p class="text-center text-gray-500 py-4">${currentLang === 'ar' ? 'لا يوجد نتائج للفلتر' : 'No results for filter'}</p>`;
        return;
    }

    const fragment = document.createDocumentFragment();

    finalStudents.forEach(s => {
        const rec    = livePaymentData.records[s.id] || { amount: 0, paid: false };
        const amount = rec.amount || '';
        const isPaid = rec.paid;

        const div = document.createElement('div');
        div.className = `record-item flex justify-between items-center p-3 border rounded-xl transition-colors ${isPaid ? 'bg-green-50 border-green-500 dark:bg-green-900/20' : 'bg-white dark:bg-darkSurface border-gray-100 dark:border-gray-700'}`;
        div.dataset.sid = s.id;
        const _pPay = s.parentPhoneNumber ? s.parentPhoneNumber.replace(/^\+20/, '0') : '';
        div.dataset.searchKey = `${(s.name || '').toLowerCase()} ${_pPay} ${(s.childId || s.id || '').toLowerCase()}`;

        div.innerHTML = `
<span onclick="openStudentProfile('${escapeHtml(s.id)}')" 
      class="font-bold text-gray-700 dark:text-gray-200 flex-1 min-w-0 break-words cursor-pointer hover:text-[#F2CE5A] transition-colors leading-snug">
    ${escapeHtml(s.name)}
</span>
<div class="flex items-center gap-2 sm:gap-3 justify-end shrink-0">
    <input type="number"
           class="payment-input input-field h-9 w-20 sm:w-24 text-center text-sm ${isPaid ? 'text-green-600 font-bold' : 'text-gray-400'}"
           placeholder="0" value="${escapeHtml(amount)}" min="0">
    <input type="checkbox" class="payment-check w-6 h-6 accent-green-600 cursor-pointer shrink-0" ${isPaid ? 'checked' : ''}>
</div>
        `;

        const checkbox = div.querySelector('.payment-check');
        const input    = div.querySelector('.payment-input');

        input.addEventListener('change', () => {
            const newVal = parseInt(input.value) || 0;
            if (checkbox.checked) {
                // Update memory first
                livePaymentData.records[s.id] = { amount: newVal, paid: newVal > 0 };
                recalculateGroupTotalFromMemory();
                clearTimeout(savePaymentsTimeout);
                savePaymentsTimeout = setTimeout(silentSavePayments, 1000);
            }
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
                const amt = parseInt(input.value) || parseInt(defaultVal) || 0;
                if (!input.value || input.value == 0) input.value = defaultVal;
                // State first
                livePaymentData.records[s.id] = { amount: amt, paid: true };
                // Then DOM
                div.classList.add('bg-green-50', 'border-green-500', 'dark:bg-green-900/20');
                input.classList.add('text-green-600', 'font-bold');
            } else {
                // State first
                livePaymentData.records[s.id] = { amount: 0, paid: false };
                // Then DOM
                input.value = '';
                div.classList.remove('bg-green-50', 'border-green-500', 'dark:bg-green-900/20');
                input.classList.remove('text-green-600', 'font-bold');
            }

            recalculateGroupTotalFromMemory();
            clearTimeout(savePaymentsTimeout);
            savePaymentsTimeout = setTimeout(silentSavePayments, 1000);
        });

        fragment.appendChild(div);
    });

    // ✅ فحص نهائي قبل الإضافة
    if (thisRenderVersion !== _paymentsRenderVersion) return;
    container.innerHTML = '';
    container.appendChild(fragment);
}


let savePaymentsTimeout;

async function silentSavePayments() {
    console.log("🔄 جاري حفظ التحصيل في الخلفية...");
    await savePayments(true);
}

async function savePayments(isSilent = false) {
    const month = document.getElementById('paymentMonthInput').value;
    if (!month) return showToast(translations[currentLang].paymentMonthMissing, 'error');
    
    let btn, originalContent;
    if (!isSilent) {
        btn = document.getElementById('savePaymentsBtn');
        if (btn) {
            originalContent = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = `<i class="ri-loader-4-line animate-spin text-lg"></i> <span>جاري الحفظ وإرسال الإشعارات...</span>`;
        }
    }

    try {
        // ── Memory-first: read from livePaymentData, not the DOM ──────────────
        const targetGroupId = livePaymentData.groupId || SELECTED_GROUP_ID;
        const targetMonth   = livePaymentData.month   || document.getElementById('paymentMonthInput').value;

        const records = [];
        Object.entries(livePaymentData.records).forEach(([sid, rec]) => {
            // Security check: prevent reviving moved/deleted students
            if (!allStudents.some(s => s.id === sid)) return;
            records.push({ studentId: sid, amount: rec.amount || 0, paid: !!(rec.paid) });
        });

        
        await putToDB('payments', { id: `${targetGroupId}_PAY_${targetMonth}`, month: targetMonth, records });
        await addToSyncQueue({ type: 'set', path: `teachers/${TEACHER_ID}/groups/${targetGroupId}/payments/${targetMonth}`, data: { month: targetMonth, records } });
        
        if (!isSilent) showToast(translations[currentLang].saved || "تم حفظ التحصيل بنجاح");
        else console.log("✅ Auto-saved payments successfully (Background)");
    } catch (err) {
        console.error("Error saving payments:", err);
        if (!isSilent) showToast("حدث خطأ أثناء حفظ عملية التحصيل", "error");
    } finally {
        if (!isSilent && btn) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }
}

// --- Exams, Schedules & Settings ---
async function loadExams() {
    const exams = await getAllFromDB('assignments', 'groupId', SELECTED_GROUP_ID);
    const sel = document.getElementById('examSelect');
    sel.innerHTML = `<option value="">${translations[currentLang].selectExamPlaceholder}</option>`;
    exams.filter(isExamAssignment).forEach(e => {
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
        date: getLocalDateString()
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
async function renderExamGrades(filter = "") {
    if (typeof filter !== 'string') filter = "";
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
        const newTotal = parseFloat(e.target.value) || 0;
        // التحقق لو فيه درجات أكبر من النهاية العظمى الجديدة
        let hasError = false;
        document.querySelectorAll('.exam-score-input').forEach(inp => {
            const val = parseFloat(inp.value);
            if (!isNaN(val) && val > newTotal) {
                inp.value = newTotal;
                inp.classList.add('border-red-500');
                hasError = true;
            }
        });
        if (hasError) showToast("تم تعديل بعض الدرجات لتناسب المجموع الجديد", "warning");

        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveExamGrades, 1000);
    };

    const normalizedFilter = filter.trim().toLowerCase();
    const searchPhoneFilter = normalizedFilter.startsWith('+20') ? normalizedFilter.replace('+20', '0') : normalizedFilter;
    const studentsToRender = allStudents.filter(s => {
        const pPhone = (s.parentPhoneNumber || "").replace(/^\+20/, '0');
        return (s.name || "").toLowerCase().includes(normalizedFilter) ||
               pPhone.includes(searchPhoneFilter) ||
               ((s.childId || s.id || "").toLowerCase().includes(normalizedFilter));
    });

    if (studentsToRender.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-500 py-4 col-span-2">${currentLang === 'ar' ? 'لا يوجد نتائج للبحث' : 'No search results found'}</p>`;
        return;
    }

    const fragment = document.createDocumentFragment();

    let finalStudents = studentsToRender.filter(s => {
        if (currentExamFilter === 'all') return true;
        const val = scores[s.id]?.score;
        const isGraded = val !== undefined && val !== null && val !== '';
        
        if (currentExamFilter === 'graded') return isGraded;
        if (currentExamFilter === 'ungraded') return !isGraded;
        return true;
    });

    if (finalStudents.length === 0 && studentsToRender.length > 0) {
        container.innerHTML = `<p class="text-center text-gray-500 py-4 col-span-2">${currentLang === 'ar' ? 'لا يوجد نتائج للفلتر' : 'No results for filter'}</p>`;
        return;
    }

    finalStudents.forEach(s => {
        const val = scores[s.id]?.score || '';
        const div = document.createElement('div');
        div.className = "flex items-center gap-2 p-2 bg-white dark:bg-darkSurface border dark:border-gray-700 rounded-lg cursor-pointer hover:border-brand transition-colors";
        // ✅ PERF FIX 4: index for DOM-walk search
        const _pPhone = s.parentPhoneNumber ? s.parentPhoneNumber.replace(/^\+20/, '0') : '';
        div.dataset.searchKey = `${(s.name || '').toLowerCase()} ${_pPhone} ${(s.childId || s.id || '').toLowerCase()}`;
        div.onclick = (e) => {
            if (!e.target.closest('input')) openStudentProfile(s.id);
        };
        div.innerHTML = `<label class="text-sm font-bold w-1/2 truncate dark:text-white"> ${escapeHtml(s.name)}</label>
                         <div class="relative w-1/2">
                            <input type="number" step="any" min="0" class="exam-score-input input-field w-full h-10 text-center font-bold" 
                                   data-sid="${escapeHtml(s.id)}" value="${escapeHtml(val)}" placeholder="0">
                            <span class="absolute left-3 top-2 text-[10px] text-gray-400">/${escapeHtml(totalMark)}</span>
                         </div>`;

        const inp = div.querySelector('input');
        inp.addEventListener('input', (e) => {
            const currentTotal = parseFloat(totalMarkInput.value) || 0;
            const val = parseFloat(e.target.value);
            if (!isNaN(val) && val > currentTotal) {
                e.target.classList.add('border-red-500');
                showToast(`الدرجة لا يمكن أن تزيد عن ${currentTotal}`, 'error');
                return;
            } else {
                e.target.classList.remove('border-red-500');
            }
            if (!isNaN(val) && val === currentTotal && currentTotal > 0) {
                showCelebration();
            }
            // Wait 3 seconds after the user stops typing before saving/sending notification
            if (saveTimeout) clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveExamGrades, 3000);
        });

        fragment.appendChild(div);
    });
    container.appendChild(fragment);
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
    if (!existing) return;
    existing.scores = scores;
    existing.totalMark = parseFloat(totalMark) || 30;
    existing.type = 'exam';

    await putToDB('assignments', existing);
    await addToSyncQueue({
        type: 'set',
        path: `teachers/${TEACHER_ID}/groups/${SELECTED_GROUP_ID}/assignments/${examId}`,
        data: { 
            id: examId,
            name: existing.name,
            date: existing.date || getLocalDateString(),
            type: 'exam',
            totalMark: existing.totalMark,
            scores 
        }
    });
}

function saveProfile() {
    const nameInput = document.getElementById('teacherNameInput');
    const subjectInput = document.getElementById('teacherSubjectInput');
    const nameError = document.getElementById('teacherNameError');
    const subjectError = document.getElementById('teacherSubjectError');

    // Reset validation states
    nameInput.classList.remove('border-red-500', 'focus:ring-red-500', 'focus:border-red-500');
    subjectInput.classList.remove('border-red-500', 'focus:ring-red-500', 'focus:border-red-500');
    nameError.classList.add('hidden');
    subjectError.classList.add('hidden');

    const name = nameInput.value.trim();
    const subject = subjectInput.value.trim();
    let hasError = false;

    if (!name) {
        nameInput.classList.add('border-red-500', 'focus:ring-red-500', 'focus:border-red-500');
        nameError.innerText = currentLang === 'ar' ? 'اسم المدرس مطلوب' : 'Teacher name is required';
        nameError.classList.remove('hidden');
        hasError = true;
    }
    if (!subject) {
        subjectInput.classList.add('border-red-500', 'focus:ring-red-500', 'focus:border-red-500');
        subjectError.innerText = currentLang === 'ar' ? 'اسم المادة مطلوب' : 'Subject name is required';
        subjectError.classList.remove('hidden');
        hasError = true;
    }

    if (hasError) return;
    
    // حفظ التعديلات محلياً وفي السحابة دون حفظ أي كلمة مرور مكشوفة
    getFromDB('teachers', TEACHER_ID).then(existingTeacher => {
        const updated = { ...(existingTeacher || {}), id: TEACHER_ID, name, subject };
        delete updated.password;
        putToDB('teachers', updated);
        addToSyncQueue({ type: 'update', path: `teachers/${TEACHER_ID}`, data: { name, subject } });
        document.getElementById('dashboardTitle').innerText = `${translations[currentLang].welcomeTeacherGreeting}${name}`;
        showToast(translations[currentLang].saved);
    }).catch(e => console.error("Error saving profile", e));
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
        const user = typeof firebase.auth === 'function' ? firebase.auth().currentUser : null;
        if (!user) {
            showToast("حدث خطأ في الجلسة، يرجى تسجيل الدخول مجدداً", "error");
            return;
        }

        const btn = document.querySelector('#changePasswordModal button[onclick="handleChangePassword()"]');
        const oldText = btn.innerText;
        btn.innerHTML = '<i class="ri-loader-4-line animate-spin"></i>';
        btn.disabled = true;

        // 1. Re-authenticate
        const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);
        await user.reauthenticateWithCredential(credential);

        // 2. Update Password in Firebase Auth
        await user.updatePassword(newPassword);

        // 3. منع تخزين كلمة المرور محلياً وحذف الحقل القديم من Firestore
        const existingTeacher = await getFromDB('teachers', TEACHER_ID);
        if (existingTeacher) {
            delete existingTeacher.password;
            await putToDB('teachers', existingTeacher);
        }
        await addToSyncQueue({ type: 'update', path: `teachers/${TEACHER_ID}`, data: { password: firebase.firestore.FieldValue.delete() } });

        showToast("تم تغيير كلمة المرور بنجاح 🔒", "success");
        closeChangePasswordModal();

        btn.innerText = oldText;
        btn.disabled = false;

    } catch (error) {
        console.error("Change Password Error:", error);
        const btn = document.querySelector('#changePasswordModal button[onclick="handleChangePassword()"]');
        btn.innerText = "تأكيد وتغيير";
        btn.disabled = false;
        
        if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            showToast("كلمة المرور الحالية غير صحيحة", "error");
        } else if (error.code === 'auth/too-many-requests') {
            showToast("محاولات كثيرة خاطئة، يرجى المحاولة لاحقاً", "error");
        } else {
            showToast("حدث خطأ أثناء تغيير كلمة المرور", "error");
        }
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
    document.getElementById('darkModeIcon').classList.toggle('hidden', isDark);
    document.getElementById('lightModeIcon').classList.toggle('hidden', !isDark);
}
// ✅ دالة استرجاع الإعدادات وتسجيل الدخول التلقائي
async function loadPreferences() {
    // 1. استرجاع الوضع الليلي (فحص كلا المفتاحين للمزامنة بين الهوم واللوحة)
    const savedTheme = localStorage.getItem('theme') || localStorage.getItem('learnaria-dark');
    const isDark = (savedTheme === 'dark' || savedTheme === 'true');
    if (isDark) {
        document.body.classList.add('dark-mode');
        updateThemeIcon();
    } else {
        document.body.classList.remove('dark-mode');
        updateThemeIcon();
    }

    // 2. استرجاع بيانات المعلم (تسجيل الدخول التلقائي)
    migrateTeacherID(); // ✨ إصلاح المعرف لو كان بالصيغة القديمة
    const storedID = getSessionItem('learnaria-tid');

    if (storedID) {
        // لو لقينا ID، نرجعه للمتغير ونخفي شاشة الدخول فوراً
        TEACHER_ID = storedID;
        updateHomeLinks();
        loadChatHistory(); // ✅ PHASE 1: Load Chat History on auto-login
        buildCrossGroupLookupMap(); // ─── Req #4: Build after auth — guaranteed permissions
        document.getElementById('landingSection').classList.add('hidden');
        document.getElementById('logoutButton').classList.remove('hidden');
        document.getElementById('navHomeButton')?.classList.add('hidden');

        // محاولة جلب بيانات المعلم من الداتابيز المحلية لتعبئة البروفايل
        let teacherData = null;
        try {
            teacherData = await getFromDB('teachers', TEACHER_ID);
        } catch (e) { console.log("Auto-login fetch error:", e); }

        // ✅ Wait for Firebase Auth session to be ready via built-in LOCAL persistence
        const authUser = await new Promise((resolve) => {
            if (typeof firebase.auth !== 'function') {
                resolve(null);
                return;
            }
            const unsubscribe = firebase.auth().onAuthStateChanged((user) => {
                unsubscribe(); // مرة واحدة فقط
                if (user) {
                    console.log("✅ Firebase Auth session active:", user.email);
                    resolve(user);
                } else {
                    console.log("ℹ️ No active Firebase Auth session found");
                    resolve(null);
                }
            });
        });

        // Now that Auth is ready, if we didn't have teacherData locally, fetch it from Firestore
        if (!teacherData && navigator.onLine && authUser) {
            try {
                const tDoc = await firestoreDB.collection('teachers').doc(TEACHER_ID).get();
                if (tDoc.exists) {
                    teacherData = { id: tDoc.id, ...tDoc.data() };
                    await putToDB('teachers', teacherData); // Caching locally (not a sync write)
                }
            } catch (e) {
                console.error("Failed to fetch teacher from Firestore:", e);
            }
        }

        if (teacherData) {
            document.getElementById('dashboardTitle').innerText = `${translations[currentLang].welcomeTeacherGreeting}${teacherData.name || ''}`;
            const nameInput = document.getElementById('teacherNameInput');
            if (nameInput) nameInput.value = teacherData.name || '';
            const subjectInput = document.getElementById('teacherSubjectInput');
            if (subjectInput) subjectInput.value = teacherData.subject || '';

            const portalWelcome = document.getElementById('portalWelcomeTeacher');
            if (portalWelcome) portalWelcome.innerText = `${translations[currentLang].welcomeTeacherGreeting}${teacherData.name || ''} 👋`;
        }

        // بعد التأكد من وجود جلسة فايربيس، يمكننا رفع البيانات المعلقة بأمان
        if (authUser) {
            processSyncQueue();
        } else {
            console.warn("⚠️ No auth session. Sync queue will wait for next login.");
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

            // Restore last active tab (prioritize hash tab if valid)
            const hashTab = window.location.hash.replace('#', '');
            const isValidHash = ['overview', 'daily', 'students', 'exams', 'payments', 'schedule', 'profile', 'cards'].includes(hashTab);
            const savedTabId = isValidHash ? hashTab : getSessionItem('learnaria-tab');
            if (savedTabId) {
                switchTab(savedTabId);
            } else {
                switchTab('overview');
            }
            checkGroupSelectionPortal();
        } else {
            // Even if no group is selected, check if hash points to profile or cards which don't require group selection
            const hashTab = window.location.hash.replace('#', '');
            if (hashTab === 'profile' || hashTab === 'cards') {
                switchTab(hashTab);
            }
            checkGroupSelectionPortal();
        }

        if (SELECTED_GROUP_ID) {
            const savedAmount = localStorage.getItem(`SPOT_PAY_AMT_${SELECTED_GROUP_ID}`);
            const amountInput = document.getElementById('defaultAmountInput');
            if (amountInput && savedAmount) {
                amountInput.value = savedAmount;
            }
        }
    } else {
        // No ID found, make sure login screen is visible
        document.documentElement.classList.remove('is-logged-in');
        document.getElementById('landingSection').classList.remove('hidden');
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
    localStorage.setItem('lang', currentLang);
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
let goldenTicketTimer = null;

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
            isScannerPaused = true;

            // إخفاء تلقائي بعد 4 ثواني
            if (goldenTicketTimer) clearTimeout(goldenTicketTimer);
            goldenTicketTimer = setTimeout(() => {
                closeGoldenTicket();
            }, 4000);
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
    if (goldenTicketTimer) {
        clearTimeout(goldenTicketTimer);
        goldenTicketTimer = null;
    }
    const modal = document.getElementById('goldenTicketModal');
    if (modal) modal.style.display = 'none';
    isScannerPaused = false;
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


// متغيرات لتخزين مجاميع المجموعات الأخرى في الذاكرة لتجنب بطء الـ Network مع كل ضغطة
let _cachedOtherGroupsTotal = 0;
let _lastMonthCalculated = null;
let _lastGroupCalculated = null;


// دالة حساب الدخل الكلي (نظام هجين: سيرفر وكاش محلي لمنع تضارب المزامنة)
async function calculateOverallIncome(liveGroupTotal = null) {
    const month = document.getElementById('paymentMonthInput').value;
    const display = document.getElementById('overallTotalDisplay');

    if (!month || !TEACHER_ID) return;

    try {
        let groups = await getAllFromDB('groups', 'teacherId', TEACHER_ID);

        if (!groups || groups.length === 0) {
            if (display) display.innerText = "0 ج.م";
            return;
        }

        if (_lastMonthCalculated !== month || _lastGroupCalculated !== SELECTED_GROUP_ID) {
            const otherGroups = groups.filter(g => g.id !== SELECTED_GROUP_ID);
            let totalOtherGroups = 0;
            
            // 1. فحص طابور المزامنة لمعرفة إذا كان هناك ملفات دفع جاري رفعها للسيرفر
            let pendingSyncPaths = new Set();
            try {
                const syncItems = await getAllFromDB('syncQueue');
                if (syncItems) {
                    syncItems.forEach(item => {
                        if (item.path) pendingSyncPaths.add(item.path);
                    });
                }
            } catch(e) {}

            for (const group of otherGroups) {
                const payId = `${group.id}_PAY_${month}`;
                const docPath = `teachers/${TEACHER_ID}/groups/${group.id}/payments/${month}`;
                let groupTotal = 0;
                let useLocal = false;

                // 2. إذا كان ملف الدفع لهذا الجروب في طابور المزامنة، نثق في الكاش المحلي فقط لمنع الدبلجة
                if (pendingSyncPaths.has(docPath)) {
                    useLocal = true;
                }

                // 3. محاولة جلب الداتا من السيرفر (للأجهزة الجديدة/الموبايل)
                if (!useLocal && navigator.onLine) {
                    try {
                        const snap = await firestoreDB.doc(docPath).get();
                        if (snap.exists && snap.data().records) {
                            const records = snap.data().records;
                            groupTotal = records.reduce((sum, r) => sum + (parseInt(r.amount) || 0), 0);
                            
                            // تحديث الكاش المحلي فوراً عشان يشتغل أوفلاين لاحقاً
                            await putToDB('payments', { id: payId, month: month, records: records });
                        }
                    } catch (err) {
                        useLocal = true; // لو النت فصل أو حصل خطأ، نلجأ للكاش
                    }
                } else {
                    useLocal = true;
                }

                // 4. استخدام الكاش المحلي (لو السيرفر متأخر أو النت قاطع)
                if (useLocal) {
                    const doc = await getFromDB('payments', payId);
                    if (doc && doc.records) {
                        groupTotal = doc.records.reduce((sum, r) => sum + (parseInt(r.amount) || 0), 0);
                    }
                }
                
                totalOtherGroups += groupTotal;
            }
            
            _cachedOtherGroupsTotal = totalOtherGroups;
            _lastMonthCalculated = month;
            _lastGroupCalculated = SELECTED_GROUP_ID;
        }

        let currentGroupVal = (liveGroupTotal !== null) ? (parseInt(liveGroupTotal) || 0) : 0;
        const totalIncome = currentGroupVal + _cachedOtherGroupsTotal;

        if (display) display.innerText = `${totalIncome.toLocaleString()} ج.م`;

    } catch (error) {
        console.error('Error calculating overall income:', error);
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
            if (!firebase.auth().currentUser) {
                showToast("انتهت جلستك، يرجى تسجيل الدخول مجدداً ⚠️", "error");
                return;
            }
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
            if (!firebase.auth().currentUser) {
                closeAbsenceModal();
                showToast("انتهت جلستك، يرجى تسجيل الدخول مجدداً ⚠️", "error");
                return;
            }
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
function openProfileCardLinkModal() {
    if (!currentProfileId) return;
    const student = allStudents.find(s => s.id === currentProfileId);
    if (student) {
        openCardLinkModal(student);
    }
}

async function openStudentProfile(studentId) {
    currentProfileId = studentId;
    const student = allStudents.find(s => s.id === studentId);
    if (!student) return;

    // Push history state to enable browser back button support
    history.pushState({ view: 'student-profile', studentId }, '');

    // إظهار الصفحة
    const profilePage = document.getElementById('studentProfilePage');
    profilePage.classList.remove('hidden');
    profilePage.scrollTop = 0; // ✅ Scroll to the top to fix scroll position issue
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

    // Card Badge
    const cardBadgeText = document.getElementById('profileCardText');
    const cardBadgeIcon = document.getElementById('profileCardIcon');
    if (student.cardId) {
        cardBadgeText.innerText = student.cardId;
        cardBadgeText.classList.remove('text-gray-500');
        cardBadgeText.classList.add('text-brand');
        cardBadgeIcon.className = 'ri-qr-code-line text-brand';
    } else {
        cardBadgeText.innerText = 'لم يتم ربط كارت';
        cardBadgeText.classList.remove('text-brand');
        cardBadgeText.classList.add('text-gray-500');
        cardBadgeIcon.className = 'ri-error-warning-line text-gray-400';
    }

    // Avatar
    const avatarEl = document.getElementById('profileAvatar');
    avatarEl.innerText = student.name.charAt(0).toUpperCase();

    // إلغاء وضع التعديل (لو كان مفتوح)
    cancelEditMode();

    // تحميل إحصائيات الحضور
    await loadStudentStats(studentId);
}

// 2. إغلاق البروفايل
function closeStudentProfile(fromPopState = false) {
    document.getElementById('studentProfilePage').classList.add('hidden');
    document.body.style.overflow = 'auto';

    // إظهار الهيدر الرئيسي مرة أخرى
    const mainNav = document.querySelector('.app-bar');
    if (mainNav) mainNav.classList.remove('hidden');

    if (!fromPopState) {
        history.back();
    }
}

// Listen to browser back button to close student profile
window.addEventListener('popstate', (event) => {
    const profilePage = document.getElementById('studentProfilePage');
    if (profilePage && !profilePage.classList.contains('hidden')) {
        closeStudentProfile(true);
    }
});

// 3. تفعيل وضع التعديل
function enableEditMode() {
    const inputs = ['profileName', 'profileParentPhone'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        el.disabled = false;
        el.classList.add('bg-white', 'dark:bg-darkSurface', 'ring-2', 'ring-brand/30', 'border-brand/50');
    });
    document.getElementById('profileEditBtn')?.classList.add('hidden'); // ✅ Hide edit button during editing
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
    document.getElementById('profileEditBtn')?.classList.remove('hidden'); // ✅ Show edit button back
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
            await putToDB('students', allStudents[sIndex]);
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
            if (isHomeworkAssignment(asm)) {
                hwMapByDate[asm.date] = asm;
            }
        });

        // 1. جلب الحضور (من القاعدة المحلية لضمان العمل أوفلاين وسرعة العرض)
        const allAttendance = await getAllFromDB('attendance', 'groupId', SELECTED_GROUP_ID);

        const sortedAttDocs = allAttendance
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
                    // الربط الدقيق مع حالة الواجب الحقيقية
                    const hwDoc = hwMapByDate[data.date];
                    let hwBadge = '';

                    if (!hwDoc) {
                        hwBadge = '<span class="text-gray-400 dark:text-gray-500 font-bold text-xs">— لا يوجد واجب</span>';
                    } else {
                        const hwStatus = hwDoc.scores ? hwDoc.scores[studentId] : null;
                        const isSubmitted = hwStatus && hwStatus.submitted === true;

                        if (record.status !== 'present') {
                            hwBadge = isSubmitted 
                                ? '<span class="text-green-500 font-bold text-xs">✅ تم التسليم</span>' 
                                : '<span class="text-gray-400 dark:text-gray-500 font-bold text-xs">— غائب</span>';
                        } else {
                            hwBadge = isSubmitted 
                                ? '<span class="text-green-500 font-bold text-xs">✅ تم التسليم</span>' 
                                : '<span class="text-red-500 font-black text-xs">❌ لم يسلم</span>';
                        }
                    }

                    historyHTML += `
                        <tr class="hover:bg-white/5 transition-colors border-b border-gray-100 dark:border-gray-800">
                            <td class="p-4 font-bold text-gray-700 dark:text-gray-300">${escapeHtml(data.date)}</td>
                            <td class="p-4 ${statusColor} font-black">${escapeHtml(statusText)}</td>
                            <td class="p-4">
                                ${hwBadge}
                            </td>
                        </tr>
                    `;
                }
            }
        });

        // 2. جلب الدرجات التفصيلية (للامتحانات الحقيقية فقط)
        let examsHTML = '';
        assignments.sort((a, b) => new Date(b.date) - new Date(a.date));

        assignments.filter(isExamAssignment).forEach(asm => {
            examCount++;
            const total = asm.totalMark || 30;
            const scoreData = asm.scores ? asm.scores[studentId] : null;

            let scoreDisplay = '';
            if (scoreData && scoreData.score !== null && scoreData.score !== undefined && scoreData.score !== '') {
                const numScore = parseFloat(scoreData.score);
                const percent = Math.round((numScore / total) * 100);
                const colorClass = percent >= 50 ? 'text-green-500 font-black' : 'text-red-500 font-black';
                scoreDisplay = `
                    <div class="text-right">
                        <span class="text-lg ${colorClass}">${escapeHtml(String(scoreData.score))}</span>
                        <span class="text-xs text-gray-400 font-bold">/${escapeHtml(String(total))}</span>
                    </div>
                `;
            } else {
                scoreDisplay = `
                    <span class="text-xs text-amber-500 font-bold bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-lg">لم تُرصد بعد</span>
                `;
            }

            examsHTML += `
                <div class="p-3 bg-gray-50 dark:bg-black/20 rounded-xl border border-gray-100 dark:border-gray-800 flex justify-between items-center group">
                    <div class="flex flex-col">
                        <span class="font-bold text-gray-700 dark:text-gray-200">${escapeHtml(asm.name)}</span>
                        <span class="text-[11px] text-gray-600 dark:text-gray-300 font-black tracking-tighter">${escapeHtml(asm.date || '')}</span>
                    </div>
                    ${scoreDisplay}
                </div>
            `;
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
                    <span class="font-black text-gray-700 dark:text-gray-300">${escapeHtml(monthStr)}</span>
                    <span class="text-xs font-black ${isPaid ? 'text-green-600' : 'text-red-500'}">
                        ${isPaid ? `✅ مدفوع (${escapeHtml(String(record.amount))})` : '❌ غير مدفوع'}
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