// ==========================================
// 🔦 منطق الفلاش والماسح الضوئي المحدث 📸
// ==========================================

let isTorchOn = false; // متغير لحالة الفلاش

async function startScanner(mode) {
    currentScannerMode = mode;
    isScannerPaused = false;
    _initScanWorker(); // ✅ FIX 7: init Worker once (no-op if already created)
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
        videoElement.srcObject = null;
    }
    document.getElementById('scannerModal').classList.add('hidden');
    if (videoElement) videoElement.style.transform = "";
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
}

let scanCanvas = null;
let scanCtx = null;

// ✅ FIX 7: Web Worker for jsQR — keeps the main thread unblocked
let _scanWorker = null;
let _scanWorkerBusy = false;  // منع إرسال فريم جديد قبل ما الـ Worker يخلص
let _scanWorkerTimeout = null;

function _initScanWorker() {
    if (_scanWorker) return; // already initialized
    try {
        _scanWorker = new Worker('js/scanner-worker.js');
        _scanWorker.onmessage = (e) => {
            clearTimeout(_scanWorkerTimeout);
            _scanWorkerBusy = false;
            if (e.data && e.data.result) {
                handleScan(e.data.result, 'camera');
            }
        };
        _scanWorker.onerror = (err) => {
            clearTimeout(_scanWorkerTimeout);
            console.warn('⚠️ ScanWorker error, falling back to main-thread jsQR:', err.message);
            _scanWorker = null; // falls back silently
            _scanWorkerBusy = false;
        };
    } catch (e) {
        console.warn('⚠️ Worker not supported, falling back to main-thread jsQR:', e);
        _scanWorker = null;
    }
}

function tickScanner() {
    if (isScannerPaused || document.getElementById('scannerModal').classList.contains('hidden')) return;
    
    if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
        if (!scanCanvas) {
            scanCanvas = document.createElement('canvas');
            scanCtx = scanCanvas.getContext('2d', { willReadFrequently: true });
        }
        scanCanvas.width = videoElement.videoWidth;
        scanCanvas.height = videoElement.videoHeight;
        scanCtx.drawImage(videoElement, 0, 0, scanCanvas.width, scanCanvas.height);
        const imageData = scanCtx.getImageData(0, 0, scanCanvas.width, scanCanvas.height);

        if (_scanWorker && !_scanWorkerBusy) {
            // ✅ Worker path: offload to background thread via Transferable
            _scanWorkerBusy = true;
            _scanWorkerTimeout = setTimeout(() => { _scanWorkerBusy = false; }, 500); // Safety timeout
            const buf = imageData.data.buffer.slice(0); // copy عشان نقدر ننقله
            _scanWorker.postMessage(
                { data: new Uint8ClampedArray(buf), width: imageData.width, height: imageData.height, id: Date.now() },
                [buf]
            );
        } else if (!_scanWorker) {
            // ✅ Fallback path: lو الـ Worker مش متاح نشتغل على الـ main thread
            if (typeof jsQR === 'undefined') {
                showToast("خطأ: تعذر تحميل مكتبة قراءة الكاميرا (تأكد من الإنترنت وأغلق الـ AdBlocker)", "error");
                stopScanner();
                return;
            }
            try {
                const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
                if (code) handleScan(code.data, "camera");
            } catch (e) {
                console.error("jsQR Error:", e);
            }
        }
        // لو _scanWorkerBusy == true: نتخطى الفريم ده ونستنى الـ Worker
    }
    setTimeout(() => { animationFrameId = requestAnimationFrame(tickScanner); }, 250);
}

// ==========================================
// 🚀 التعديل الجوهري: هندلة الطالب الغريب وتسجيله فوراً
// ==========================================


// ==========================================
// 🚀 سجل السكان (Scan Audit Log)
// ==========================================
function logScanRecord(rawValue, result, failReason, studentName, scanType, scannerType) {
    if (!navigator.onLine || !TEACHER_ID) return;
    try {
        const payload = {
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            teacherId: TEACHER_ID,
            groupId: SELECTED_GROUP_ID || null,
            rawValue: rawValue || '',
            result: result, // 'success' or 'failed'
            failReason: failReason || null,
            studentName: studentName || null,
            scanType: scanType || null,
            scannerType: scannerType || 'camera'
        };
        firestoreDB.collection('scanLogs').add(payload);
    } catch (e) {
        console.error("Error logging scan:", e);
    }
}

async function handleScan(scannedText, scannerType = "camera") {
    let qrCode = String(scannedText).replace(/"/g, '').trim();
    qrCode = qrCode.replace(/^https?:\/\//i, '').replace(/^URL:/i, '');
    const urlMatch = qrCode.match(/s=([^&]+)/);
    if (urlMatch) qrCode = urlMatch[1];
    
    // TASK 1: Fix Case Sensitivity (hardware scanners sometimes send lowercase, safely cast to string)
    qrCode = String(qrCode).toUpperCase();

    // 🛑 Mode: Card Linking
    if (currentScannerMode === 'link-card') {
        playBeep();
        stopScanner();
        logScanRecord(qrCode, 'success', null, studentPendingCardLink ? studentPendingCardLink.name : 'Unknown', 'link-card', scannerType);
        if (studentPendingCardLink) {
            await linkCardToStudent(studentPendingCardLink, qrCode);
        }
        return;
    }

    const matchPhone = (dbPhone, qrVal) => {
        if (!dbPhone) return false;
        return String(dbPhone).trim().replace(/^\+2/, '') === String(qrVal).trim().replace(/^\+2/, '');
    };

    // ──────────────────────────────────────────────────────────────────────────
    // ✅ NEW: State Interception (The Double-Scan Trick for Fast Group Switch)
    // ──────────────────────────────────────────────────────────────────────────
    const cgModal = document.getElementById('crossGroupAttendanceModal');
    if (cgModal && !cgModal.classList.contains('hidden') && _cgModal_student) {
        // Modal is open, check if the scanned text belongs to the pending student
        // TASK 1: Case Sensitivity in Double-Scan Interceptor with Safe String Cast
        const isSameStudent = (_cgModal_student.id && String(_cgModal_student.id).toUpperCase() === qrCode) ||
                              (_cgModal_student.cardId && String(_cgModal_student.cardId).toUpperCase() === qrCode) ||
                              matchPhone(_cgModal_student.parentPhoneNumber, qrCode);
        
        if (isSameStudent) {
            playBeep();
            // Hot-Key confirmed! Switch group and scan.
            console.log("⚡ Double-scan detected. Switching group via Hot-Key...");
            if (typeof window.switchGroupAndScan === 'function') {
                await window.switchGroupAndScan();
            }
        } else {
            // Scanned someone else while modal is open
            showToast('⚠️ يرجى تأكيد تحويل المجموعة أولاً أو إغلاق النافذة', 'warning');
        }
        return; // Halt further execution in all cases while modal is open
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ✅ TASK 1: Auto-Group Selection
    // If no group is selected yet, look up the student and auto-select their group.
    // ──────────────────────────────────────────────────────────────────────────
    if (!SELECTED_GROUP_ID) {
        // Ensure map is populated
        if (crossGroupLookupMap.size === 0) await buildCrossGroupLookupMap();

        const autoMatch = crossGroupLookupMap.get(qrCode)
                       || crossGroupLookupMap.get(qrCode.replace(/^\+2/, ''));

        if (autoMatch?.groupId) {
            showToast(`🔄 جاري تحديد المجموعة تلقائياً...`, 'info');
            await window.handleGroupSelectionChange(autoMatch.groupId);
            
            // ✅ NEW UX ENHANCEMENT: Instantly show the attendance list
            if (typeof switchTab === 'function') switchTab('daily');
            
            // Wait for tab switch + renderDailyList to finish
            await new Promise(resolve => setTimeout(resolve, 600));
            // Re-process the same scan now that the group is loaded
            await handleScan(scannedText, scannerType);
            return;
        } else {
            showToast(currentLang === 'ar' ? '⚠️ اختر مجموعة أولاً' : '⚠️ Please select a group first', 'error');
            return;
        }
    }

    // 1. Search in the current group (highest priority)
    // TASK 1: Case Sensitivity in Fallback Search with Safe String Cast
    const matchedStudents = allStudents.filter(s =>
        (s.cardId && String(s.cardId).toUpperCase() === qrCode) ||
        matchPhone(s.parentPhoneNumber, qrCode) ||
        (s.id && String(s.id).toUpperCase() === qrCode)
    );

    // ──────────────────────────────────────────────────────────────────────────
    // 🛑 TASK 2: Student NOT in current group → open Cross-Group Modal
    // ──────────────────────────────────────────────────────────────────────────
    if (matchedStudents.length === 0) {
        isScannerPaused = true;

        try {
            // O(1) lookup via in-memory map
            let globalMatch = crossGroupLookupMap.get(qrCode)
                           || crossGroupLookupMap.get(qrCode.replace(/^\+2/, ''));

            if (!globalMatch && crossGroupLookupMap.size === 0) {
                await buildCrossGroupLookupMap();
                globalMatch = crossGroupLookupMap.get(qrCode)
                           || crossGroupLookupMap.get(qrCode.replace(/^\+2/, ''));
            }

            if (globalMatch) {
                playBeep();
                logScanRecord(qrCode, 'success', null, globalMatch.name, 'cross-group-modal', scannerType);
                // Open the targeted modal — no phantom records created yet
                await openCrossGroupModal(globalMatch);
                return;
            }

            // Completely unknown code
            if (navigator.onLine && qrCode.startsWith('NAZ-')) {
                const cardSnap = await firestoreDB.collection('cards').doc(qrCode).get();
                if (cardSnap.exists) {
                    const ownerId = TEACHER_CENTER_ID || TEACHER_ID;
                    if (cardSnap.data().ownerId && cardSnap.data().ownerId !== ownerId) {
                        logScanRecord(qrCode, 'failed', 'another_organization', null, 'cross-group', scannerType);
                        showToast(currentLang === 'ar' ? "⛔ هذا الكارت مسجل في مؤسسة أخرى!" : "⛔ Card belongs to another organization!", "error");
                    } else {
                        logScanRecord(qrCode, 'failed', 'unlinked_card', null, 'cross-group', scannerType);
                        showToast(currentLang === 'ar' ? "⚠️ هذا الكارت غير مربوط بأي طالب حتى الآن!" : "⚠️ Card is not linked to any student yet!", "warning");
                    }
                } else {
                    logScanRecord(qrCode, 'failed', 'invalid_fake_card', null, 'cross-group', scannerType);
                    showToast(currentLang === 'ar' ? "❌ كود غير صحيح أو كارت مزيف!" : "❌ Invalid code or fake card!", "error");
                }
            } else {
                logScanRecord(qrCode, 'failed', 'unknown_card', null, 'cross-group', scannerType);
                showToast(currentLang === 'ar' ? "الطالب غير موجود" : "Student not found", "error");
            }

        } catch (err) {
            logEvent("scan_error", { scan_type: "cross_group", error: err.message });
            console.error("Cross-Group Error:", err);
            sentryCaptureError(err, { action: "crossGroupScan", groupId: SELECTED_GROUP_ID });
        }

        // Resume scanner after unknown code
        setTimeout(() => {
            isScannerPaused = false;
            requestAnimationFrame(tickScanner);
        }, 2500);
        return;
    }

    // ✅ Normal flow: student is in the current group
    playBeep();
    isScannerPaused = true;

    // Twin paradox: prefer the sibling who hasn't been marked yet
    let studentToMark = matchedStudents[0];
    if (matchedStudents.length > 1) {
        const absentSibling = matchedStudents.find(s => liveSessionData.attendance[s.id]?.status !== 'present');
        if (absentSibling) studentToMark = absentSibling;
    }

    if (currentScannerMode === 'daily') {
        showScanSuccessUI(studentToMark, 'attendance');
        let scanType = sessionScannedStudents.has(studentToMark.id) ? 'homework' : 'attendance';
        logScanRecord(qrCode, 'success', null, studentToMark.name, scanType, scannerType);
        checkGoldenTicket(studentToMark.name);
        await processDailyScan(studentToMark, scannerType);
    } else if (currentScannerMode === 'payments') {
        showScanSuccessUI(studentToMark, 'payments');
        logScanRecord(qrCode, 'success', null, studentToMark.name, 'payments', scannerType);
        processPaymentScan(studentToMark);
    }
}


// ✅ PHASE 4: Mutex lock for cross-group attendance
// Prevents race conditions when scanning multiple cross-group students rapidly
let _crossGroupSaveQueue = Promise.resolve();

// ✅ دالة مساعدة لتسجيل الحضور في مجموعة أخرى (بدون فتحها)
async function saveCrossGroupAttendance(student, homeworkSubmitted) {
    const date = document.getElementById('dailyDateInput').value;
    const groupId = student.groupId;

    // Chain the operation onto the queue
    _crossGroupSaveQueue = _crossGroupSaveQueue.then(async () => {
        try {
            // 1️⃣ تسجيل الحضور (Attendance)
            const attId = `${groupId}_${date}`;

            // جلب أو إنشاء سجل الحضور
            let attDoc = await getFromDB('attendance', attId);
            if (!attDoc) {
                attDoc = { id: attId, date: date, teacherId: TEACHER_ID, groupId: groupId, records: [] };
            }

            // تحديث حالة الطالب
            const existingRec = attDoc.records.find(r => r.studentId === student.id);
            if (existingRec) {
                existingRec.status = 'present';
                if (!existingRec.time) existingRec.time = new Date().toISOString();
            } else {
                attDoc.records.push({ studentId: student.id, status: 'present', time: new Date().toISOString() });
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
                        teacherId: TEACHER_ID,
                        groupId: groupId,
                        name: `واجب ${date}`,
                        date: date,
                        scores: {},
                        type: 'homework'
                    };
                }

                // التأكد من وجود كائن الدرجات
                if (!hwDoc.scores) hwDoc.scores = {};

                // تسجيل التسليم (submitted: true)
                hwDoc.scores[student.id] = { submitted: true };
                hwDoc.type = 'homework';

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
        } catch (error) {
            console.error(`❌ Error in saveCrossGroupAttendance for ${student.name}:`, error);
        }
    });

    await _crossGroupSaveQueue;
}

// ════════════════════════════════════════════════════════════════════════════
// ✅ TASK 2: Targeted Cross-Group Attendance Modal Logic
// ════════════════════════════════════════════════════════════════════════════

// Module-level state for the open modal
let _cgModal_student = null;

/**
 * Opens the Cross-Group Attendance Modal for a given student.
 * Fetches the last 3 session dates from IndexedDB for that student's group.
 * @param {Object} student - The student object from crossGroupLookupMap
 */
async function openCrossGroupModal(student) {
    _cgModal_student = student;

    const modal        = document.getElementById('crossGroupAttendanceModal');
    const nameEl       = document.getElementById('cgModal_studentName');
    const grpEl        = document.getElementById('cgModal_groupName');
    const dateSelect   = document.getElementById('cgModal_dateSelect');
    const hwBox        = document.getElementById('cgModal_hwCheckbox');
    const customWrapper = document.getElementById('cgModal_customDateWrapper');
    const customInput  = document.getElementById('cgModal_customDateInput');
    const switchLabel  = document.getElementById('cgModal_switchBtnLabel');

    if (!modal) return;

    // Populate header
    nameEl.textContent = student.name || '—';

    // Fetch group name from IndexedDB
    let groupName = 'مجموعة أخرى';
    try {
        const groupDoc = await getFromDB('groups', student.groupId);
        if (groupDoc?.name) groupName = groupDoc.name;
    } catch (_) {}
    grpEl.textContent = groupName;

    // Reset controls
    hwBox.checked = false;
    customWrapper.classList.add('hidden');
    customInput.value = '';

    // Reset buttons state and DOM structure (Fixes loading spinner getting stuck)
    const switchBtn = document.getElementById('cgModal_switchBtn');
    if (switchBtn) {
        switchBtn.disabled = false;
        switchBtn.innerHTML = `<i class="ri-arrow-left-right-line text-lg"></i> <span id="cgModal_switchBtnLabel">تحويل الحصة إلى: ${groupName}</span>`;
    }

    const confirmBtn = document.getElementById('cgModal_confirmBtn');
    if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<i class="ri-check-double-line"></i> تأكيد التسجيل`;
    }

    // ─── Fetch last 3 recorded session dates for the student's original group ─
    dateSelect.innerHTML = '<option value="">⏳ جاري التحميل...</option>';
    try {
        const allAtt = await getAllFromDB('attendance');
        const groupSessions = allAtt
            .filter(doc => doc.groupId === student.groupId && doc.date)
            .sort((a, b) => b.date.localeCompare(a.date)) // newest first
            .slice(0, 3);

        dateSelect.innerHTML = '';

        if (groupSessions.length === 0) {
            dateSelect.innerHTML = '<option value="">لا توجد جلسات مسجلة</option>';
        } else {
            groupSessions.forEach(session => {
                const opt = document.createElement('option');
                opt.value       = session.date;
                opt.textContent = `📅 ${session.date}`;
                dateSelect.appendChild(opt);
            });
        }

        // Always add "Custom Date" option at the end
        const customOpt = document.createElement('option');
        customOpt.value       = '__custom__';
        customOpt.textContent = '✏️ إدخال تاريخ مخصص (حضور مسبق)';
        dateSelect.appendChild(customOpt);

    } catch (err) {
        dateSelect.innerHTML = '<option value="">⚠️ خطأ في تحميل الجلسات</option>';
        console.error('openCrossGroupModal: fetch error', err);
    }

    // Show/hide custom date input when "Custom" option is chosen
    dateSelect.onchange = () => {
        const isCustom = dateSelect.value === '__custom__';
        customWrapper.classList.toggle('hidden', !isCustom);
        if (isCustom) customInput.focus();
    };

    // Show modal
    modal.classList.remove('hidden');
    isScannerPaused = true;
}

/**
 * Closes the modal and resumes the scanner.
 */
window.closeCrossGroupModal = function () {
    const modal = document.getElementById('crossGroupAttendanceModal');
    if (modal) modal.classList.add('hidden');
    _cgModal_student = null;
    // Resume scanner
    setTimeout(() => {
        isScannerPaused = false;
        if (typeof tickScanner === 'function') requestAnimationFrame(tickScanner);
    }, 300);
};

/**
 * ─── Smart Group Switch ───────────────────────────────────────────────────────
 * Teacher clicked "Switch Session to [Group]".
 * 1. Close the modal immediately.
 * 2. Switch the active group to the student's group (flushes pending saves etc.).
 * 3. Wait 600ms for renderDailyList to complete.
 * 4. Re-process the student as a normal daily scan in the new group context.
 */
window.switchGroupAndScan = async function () {
    const student = _cgModal_student;
    if (!student) return;

    const switchBtn = document.getElementById('cgModal_switchBtn');
    if (switchBtn) { switchBtn.disabled = true; switchBtn.innerHTML = '<i class="ri-loader-4-line animate-spin text-lg"></i>'; }

    try {
        // Close modal first so UI isn't blocked
        const modal = document.getElementById('crossGroupAttendanceModal');
        if (modal) modal.classList.add('hidden');
        _cgModal_student = null;

        // Switch group — this calls flushPendingSaves, loadGroupData, etc.
        await window.handleGroupSelectionChange(student.groupId);

        // Wait for renderDailyList and tab switch to fully settle
        await new Promise(resolve => setTimeout(resolve, 600));

        // Switch to daily tab explicitly in case it wasn't active
        if (typeof switchTab === 'function') switchTab('daily');
        await new Promise(resolve => setTimeout(resolve, 150));

        // Now resume scanner and process attendance normally
        isScannerPaused = false;
        currentScannerMode = 'daily';

        // Find the student in the freshly loaded allStudents array
        const studentInGroup = allStudents.find(s => s.id === student.id);
        if (studentInGroup) {
            playBeep();
            showScanSuccessUI(studentInGroup, 'attendance');
            logScanRecord(student.id, 'success', null, student.name, 'attendance', 'hardware');
            checkGoldenTicket(student.name);
            await processDailyScan(studentInGroup, 'hardware');
        } else {
            // Fallback: student not found in allStudents after group switch (shouldn't happen)
            showToast(`⚠️ لم يتم إيجاد ${student.name} في المجموعة بعد التحويل`, 'error');
            console.warn('switchGroupAndScan: student not found in allStudents after switch', student);
        }

        logEvent('cross_group_smart_switch', { student_id: student.id, new_group: student.groupId });

    } catch (err) {
        console.error('switchGroupAndScan error:', err);
        showToast('❌ حدث خطأ أثناء تحويل المجموعة', 'error');
        isScannerPaused = false;
    }
};



/**
 * Called when the teacher clicks "Confirm".
 * Writes ONLY to the specific targeted date — never creates a "today" phantom record.
 */
window.confirmCrossGroupAttendance = async function () {
    const student = _cgModal_student;
    if (!student) return;

    const dateSelect  = document.getElementById('cgModal_dateSelect');
    const customInput = document.getElementById('cgModal_customDateInput');
    const hwSubmitted = document.getElementById('cgModal_hwCheckbox').checked;
    const confirmBtn  = document.getElementById('cgModal_confirmBtn');

    // Resolve the selected date
    let targetDate = dateSelect.value === '__custom__' ? customInput.value : dateSelect.value;

    if (!targetDate) {
        showToast('⚠️ اختر تاريخ الجلسة أولاً', 'error');
        return;
    }

    // Lock confirm button while writing
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.innerHTML = '<i class="ri-loader-4-line animate-spin"></i>'; }

    try {
        await processTargetedCrossGroupAttendance(student, targetDate, hwSubmitted);
        showScanSuccessUI(student, 'attendance');
        showToast(`✅ تم تسجيل حضور ${student.name} في جلسة ${targetDate}`, 'success');
        window.closeCrossGroupModal();
    } catch (err) {
        console.error('confirmCrossGroupAttendance error:', err);
        showToast('❌ حدث خطأ أثناء التسجيل', 'error');
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.innerHTML = '<i class="ri-check-double-line"></i> تأكيد التسجيل'; }
    }
};

/**
 * Core data-write logic — strict data integrity rules:
 * - If attendance doc for targetDate exists → update ONLY this student's record.
 * - If doc does NOT exist (advance scenario) → create a new doc with ONLY this student (no phantoms).
 * - Updates homework for the same date if hwSubmitted=true.
 * - All writes go through putToDB + addToSyncQueue for offline-first safety.
 *
 * @param {Object} student     - The cross-group student object
 * @param {string} targetDate  - The YYYY-MM-DD date selected by the teacher
 * @param {boolean} hwSubmitted - Whether to also mark homework as submitted
 */
async function processTargetedCrossGroupAttendance(student, targetDate, hwSubmitted) {
    const groupId = student.groupId;
    const attId   = `${groupId}_${targetDate}`;

    // ─── 1. Attendance ────────────────────────────────────────────────────────
    let attDoc = await getFromDB('attendance', attId);

    if (attDoc) {
        // Make-up scenario: doc exists → patch ONLY this student, leave everyone else intact
        if (!attDoc.records) attDoc.records = [];
        const existingRec = attDoc.records.find(r => r.studentId === student.id);
        if (existingRec) {
            existingRec.status = 'present';
            existingRec.time   = existingRec.time || new Date().toISOString();
        } else {
            attDoc.records.push({ studentId: student.id, status: 'present', time: new Date().toISOString() });
        }
    } else {
        // Advance attendance: doc doesn't exist → create with ONLY this student (no phantom absents)
        attDoc = {
            id:        attId,
            date:      targetDate,
            teacherId: TEACHER_ID,
            groupId:   groupId,
            records:   [{ studentId: student.id, status: 'present', time: new Date().toISOString() }]
        };
    }

    await putToDB('attendance', attDoc);
    await addToSyncQueue({
        type: 'set',
        path: `teachers/${TEACHER_ID}/groups/${groupId}/dailyAttendance/${targetDate}`,
        data: { date: targetDate, records: attDoc.records }
    });

    // ─── 2. Homework (only if submitted) ─────────────────────────────────────
    if (hwSubmitted) {
        const hwId  = `${groupId}_HW_${targetDate}`;
        let   hwDoc = await getFromDB('assignments', hwId);

        if (!hwDoc) {
            hwDoc = {
                id:        hwId,
                teacherId: TEACHER_ID,
                groupId:   groupId,
                name:      `واجب ${targetDate}`,
                date:      targetDate,
                scores:    {},
                type:      'homework'
            };
        }
        if (!hwDoc.scores) hwDoc.scores = {};
        hwDoc.scores[student.id] = { submitted: true };
        hwDoc.type = 'homework';

        await putToDB('assignments', hwDoc);
        await addToSyncQueue({
            type: 'set',
            path: `teachers/${TEACHER_ID}/groups/${groupId}/assignments/${hwId}`,
            data: hwDoc
        });
    }

    logEvent('cross_group_targeted_attendance', {
        student_id:    student.id,
        student_name:  student.name,
        target_group:  groupId,
        target_date:   targetDate,
        hw_submitted:  hwSubmitted
    });

    console.log(`✅ Targeted Cross-Group Attendance saved for ${student.name} → ${targetDate} (hw: ${hwSubmitted})`);
}

// --- دالة مساعدة للمؤثرات البصرية (عشان الكود يبقى نظيف) ---

function showScanSuccessUI(student, type = 'attendance') {
    const overlay = document.getElementById('scannerOverlay');
    const feedback = document.getElementById('scannedStudentName');
    const nameText = document.getElementById('feedbackNameText');

    if (type === 'attendance') {
        nameText.innerText = "✅ حضور: " + student.name;
        overlay.style.backgroundColor = "rgba(34, 197, 94, 0.4)"; // أخضر
    } else if (type === 'payments') {
        nameText.innerText = "💰 تحصيل: " + student.name;
        overlay.style.backgroundColor = "rgba(234, 179, 8, 0.4)"; // أصفر/ذهبي
    } else {
        nameText.innerText = "📚 واجب: " + student.name;
        overlay.style.backgroundColor = "rgba(59, 130, 246, 0.4)"; // أزرق
    }

    feedback.classList.remove('opacity-0', 'translate-y-10', 'scale-90');
    overlay.classList.add('success');

    setTimeout(() => {
        feedback.classList.add('opacity-0', 'translate-y-10', 'scale-90');
        overlay.classList.remove('success');
        overlay.style.backgroundColor = ""; // Reset
    }, 1500);
}

async function processDailyScan(student, scannerType = 'camera') {
    const studentId = student.id;

    // ✅ PHASE 2 & 3: Memory-first update. We do NOT force renderDailyList!
    if (!liveSessionData.attendance[studentId]) {
        liveSessionData.attendance[studentId] = { status: 'absent', time: null };
    }
    if (!liveSessionData.homework[studentId]) {
        liveSessionData.homework[studentId] = { submitted: false, score: null };
    }

    const attState = liveSessionData.attendance[studentId];
    const hwState = liveSessionData.homework[studentId];

    const isPresent = attState.status === 'present';
    const isHwSubmitted = hwState.submitted;

    // Find the row in DOM (if it exists)
    const row = document.querySelector(`#dailyStudentsList > div[data-sid="${studentId}"]`);
    const attSelect = row ? row.querySelector('.att-select') : null;
    const hwCheck = row ? row.querySelector('.hw-check') : null;

    if (!isPresent) {
        // --- 1st Scan: Attendance ---
        attState.status = 'present';
        attState.time = new Date().toISOString();

        if (row) {
            if (attSelect) attSelect.value = 'present';
            row.classList.replace('bg-white', 'bg-green-50');
            row.classList.replace('dark:bg-darkSurface', 'dark:bg-green-900/20');
            row.classList.add('border-green-500');
            row.classList.remove('border-transparent');
            // ─── Req #2: Unhide if search filter is hiding the row ────────────
            row.classList.remove('hidden');
            if (hwCheck) hwCheck.disabled = false;
            // ─── Req #3: Debounced scroll — no more per-scan smooth scrollIntoView ─
            _deferredScrollIntoView(row);
        }
        
        logEvent('scan_attendance', { student_id: studentId, student_name: student.name, group_id: SELECTED_GROUP_ID, scan_type: scannerType });
        showScanSuccessUI(student, 'attendance');
    } else {
        // --- 2nd Scan: Homework ---
        if (hasHomeworkToday) {
            if (!isHwSubmitted) {
                hwState.submitted = true;
                
                if (row) {
                    if (hwCheck) hwCheck.checked = true;
                    // ─── Req #3: Debounced scroll ─────────────────────────────
                    _deferredScrollIntoView(row);
                }
                
                logEvent('scan_homework', { student_id: studentId, student_name: student.name, group_id: SELECTED_GROUP_ID, scan_type: scannerType });
                showScanSuccessUI(student, 'homework');
            } else {
                showToast(`الطالب ${student.name} حضر وسلم الواجب مسبقاً`, 'info');
            }
        } else {
            showToast(`تم تسجيل حضور ${student.name} مسبقاً`, 'info');
        }
    }

    // ✅ PHASE 2: Trigger the throttled background save
    scheduleThrottledSave();

    // ✅ PHASE 2: Fix CPU Meltdown. Do not spin up camera loops for hardware scanners.
    setTimeout(() => { 
        isScannerPaused = false; 
        if (scannerType !== 'hardware') {
            requestAnimationFrame(tickScanner); 
        }
    }, 1200);
}

// خلينا الدالة async
async function processPaymentScan(student) {
    console.log("processPaymentScan called for:", student.name);

    const defaultAmountInput = document.getElementById('defaultAmountInput');
    const defaultVal = defaultAmountInput?.value;

    // ── 1. Validate default amount first ─────────────────────────────────────
    if (!defaultVal) {
        showToast(`⚠️ لا يمكن تحصيل المصاريف لـ "${student.name}"`, "error");
        setTimeout(() => showToast("يرجى تحديد المبلغ أولاً في الخانة العلوية", "error"), 1000);
        defaultAmountInput?.focus();
        return;
    }

    const amount = parseInt(defaultVal) || 0;

    // ── 2. Check if already paid (from memory) ────────────────────────────────
    const existing = livePaymentData.records[student.id];
    if (existing && existing.paid) {
        showToast(`تم دفع المصاريف مسبقاً للطالب: ${student.name}`);
        return;
    }

    // ── 3. State first — update memory immediately ────────────────────────────
    livePaymentData.records[student.id] = { amount, paid: true };
    recalculateGroupTotalFromMemory();

    // ── 4. DOM second — update visible row if it exists ───────────────────────
    let row = document.querySelector(`#paymentsList > div[data-sid="${student.id}"]`);
    if (row) {
        if (row.classList.contains('hidden')) row.classList.remove('hidden');
        const checkbox = row.querySelector('.payment-check');
        const input    = row.querySelector('.payment-input');
        if (checkbox) checkbox.checked = true;
        if (input)    input.value = defaultVal;
        row.classList.add('bg-green-50', 'border-green-500', 'dark:bg-green-900/20');
        if (input) { input.classList.add('text-green-600', 'font-bold'); input.classList.remove('text-gray-400'); }
        _deferredScrollIntoView(row);
        row.classList.add('ring-4', 'ring-green-300');
        setTimeout(() => row.classList.remove('ring-4', 'ring-green-300'), 1000);
    }
    // Row not in DOM (hidden by filter or not yet rendered) — state is already updated, save will persist it.

    // ── 5. Persist ────────────────────────────────────────────────────────────
    clearTimeout(savePaymentsTimeout);
    savePaymentsTimeout = setTimeout(silentSavePayments, 1000);
    logEvent('scan_payment', { student_id: student.id, student_name: student.name, amount: defaultVal, group_id: SELECTED_GROUP_ID });
}


// ==========================================
let hwScannerBuffer = "";
let hwScannerResetTimer = null;
let hwScannerLastKeyPerf = 0;

// ─── Req #1: Async Scan Queue ────────────────────────────────────────────────
// Capture codes instantly and process them one-by-one sequentially.
// The keydown listener ONLY pushes to this queue — zero async work in the listener.
const _scanQueue = [];             // codes waiting to be processed
let   _scanQueueRunning = false;   // prevents spawning multiple processor loops

// ─── Req #3: Debounced Scroll ────────────────────────────────────────────────
// We never scrollIntoView inside a hot scan path. Instead, we record the target
// row and scroll only after the user stops scanning for 300ms.
let _pendingScrollRow = null;
let _scrollDebounceTimer = null;

function _deferredScrollIntoView(row) {
    _pendingScrollRow = row;
    clearTimeout(_scrollDebounceTimer);
    _scrollDebounceTimer = setTimeout(() => {
        if (_pendingScrollRow) {
            _pendingScrollRow.scrollIntoView({ behavior: 'auto', block: 'center' });
            _pendingScrollRow = null;
        }
    }, 300);
}

// ─── Req #4: Cross-Group O(1) Lookup Map ─────────────────────────────────────
// Populated once at startup (and refreshed on group-change) so handleScan never
// hits IndexedDB for a cross-group student match.
let crossGroupLookupMap = new Map(); // key: cardId/phone/id → student object

async function buildCrossGroupLookupMap() {
    try {
        const allLocalStudents = await getAllFromDB('students');
        crossGroupLookupMap.clear();
        for (const s of allLocalStudents) {
            if (s.cardId) crossGroupLookupMap.set(String(s.cardId).toUpperCase().trim(), s);
            if (s.parentPhoneNumber) {
                const normalized = String(s.parentPhoneNumber).trim().replace(/^\+2/, '');
                crossGroupLookupMap.set(normalized, s);
            }
            if (s.id) crossGroupLookupMap.set(String(s.id).toUpperCase().trim(), s);
        }
        console.log(`🗺️ crossGroupLookupMap built: ${crossGroupLookupMap.size} entries`);
    } catch (e) {
        console.warn('crossGroupLookupMap build error:', e);
    }
}

document.addEventListener('keydown', async (e) => {
    if (!e.key || (e.key !== 'Enter' && e.key.length !== 1)) return;

    // ─── isInput guard: HARD STOP before any buffer logic ────────────────────
    const activeEl = document.activeElement;
    const activeTag = activeEl ? activeEl.tagName.toLowerCase() : '';
    const isInput = activeTag === 'input' || activeTag === 'textarea';

    if (isInput) {
        // Suppress ghost rapid-fire characters inside the same input element
        if (e.key !== 'Enter') {
            const now = performance.now();
            if (now - hwScannerLastKeyPerf < 30) e.preventDefault();
            hwScannerLastKeyPerf = performance.now();
        }
        return; // ⛔ Hard stop — the scanner buffer remains untouched
    }

    const arabicMap = {'ض':'q','ص':'w','ث':'e','ق':'r','ف':'t','غ':'y','ع':'u','ه':'i','خ':'o','ح':'p','ج':'[','د':']','ش':'a','س':'s','ي':'d','ب':'f','ل':'g','ا':'h','ت':'j','ن':'k','م':'l','ك':';','ط':'\'','ئ':'z','ء':'x','ؤ':'c','ر':'v','لا':'b','ى':'n','ة':'m','و':',','ز':'.','ظ':'/'};
    const mappedKey = arabicMap[e.key] || e.key;

    if (e.key === "Enter") {
        // ─── Req #1: Push complete code to queue; NEVER await anything here ─
        clearTimeout(hwScannerResetTimer);
        hwScannerResetTimer = null;

        const qrCode = hwScannerBuffer.trim();
        hwScannerBuffer = ""; // Reset BEFORE any async work

        if (qrCode.length >= 4) {
            // Determine scanner mode synchronously (zero I/O)
            const linkModal = document.getElementById('cardLinkModal');
            const scanMode = ((linkModal && !linkModal.classList.contains('hidden')) || currentScannerMode === 'link-card')
                ? 'link-card'
                : (document.querySelector('.tab-button.active')?.dataset.tab === 'payments' ? 'payments' : 'daily');

            // Push to queue — O(1), synchronous, guaranteed zero-drop
            _scanQueue.push({ qrCode, scanMode });
            _startScanQueueProcessor();

        } else if (qrCode.length > 0 && qrCode.length < 4) {
            logScanRecord(qrCode, 'failed', 'scanner_incomplete', null, currentScannerMode || 'unknown', 'hardware');
        }
        return;
    }

    // ─── STRICT 300ms expiry: discard stray human keystrokes ─────────────────
    clearTimeout(hwScannerResetTimer);
    hwScannerResetTimer = setTimeout(() => {
        if (hwScannerBuffer.length > 0) {
            console.log("⏱️ HW Scanner buffer expired (300ms), discarding stray input:", hwScannerBuffer);
            hwScannerBuffer = "";
        }
    }, 300);

    if (e.key.length === 1) {
        hwScannerBuffer += mappedKey.toUpperCase();
    }
});

/**
 * ─── Req #1: Async Scan Queue Processor ──────────────────────────────────────
 * A background worker loop that drains _scanQueue sequentially.
 * Only one instance runs at a time (guarded by _scanQueueRunning).
 * This guarantees zero race conditions even at 10 scans/second.
 */
function _startScanQueueProcessor() {
    if (_scanQueueRunning) return; // processor already running — new item will be picked up automatically
    _scanQueueRunning = true;
    _runScanQueue();
}

async function _runScanQueue() {
    while (_scanQueue.length > 0) {
        const { qrCode, scanMode } = _scanQueue.shift();
        try {
            // Switch tab if needed BEFORE processing (only for daily, only if not already there)
            if (scanMode === 'daily' && document.querySelector('.tab-button.active')?.dataset.tab !== 'daily') {
                currentScannerMode = 'daily';
                switchTab('daily');
                await new Promise(resolve => setTimeout(resolve, 300));
            } else {
                currentScannerMode = scanMode;
            }
            await handleScan(qrCode, 'hardware');
        } catch (err) {
            console.error('_runScanQueue: error processing scan:', qrCode, err);
        }
    }
    _scanQueueRunning = false; // processor goes idle, will be restarted on next push
}


// ✅ تحديث روابط الشعار والرئيسية للمستخدم المسجل دخوله
function updateHomeLinks() {
    const isTeacherLoggedIn = localStorage.getItem('learnaria-tid') || sessionStorage.getItem('learnaria-tid');
    document.querySelectorAll('[data-nav-home]').forEach(el => {
        if (isTeacherLoggedIn) {
            el.setAttribute('href', 'dashboard.html');
        } else {
            el.setAttribute('href', 'index.html');
        }
    });
}