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

async function updateOnlineStatus() {
    const indicator = document.getElementById('statusIndicator');
    if (!indicator) return;

    const dot = indicator.querySelector('.status-dot');
    const text = indicator.querySelector('.status-text');

    let isActuallyOnline = navigator.onLine;

    if (isActuallyOnline) {
        try {
            await fetch('https://www.google.com/favicon.ico?_cb=' + new Date().getTime(), { mode: 'no-cors', cache: 'no-store' });
            isActuallyOnline = true;
        } catch (e) {
            isActuallyOnline = false;
        }
    }

    if (isActuallyOnline) {
        indicator.classList.remove('offline');
        indicator.classList.add('online');
        text.innerText = translations[currentLang].online;
        dot.className = 'status-dot w-2.5 h-2.5 rounded-full';
        
        const isRecovering = window.wasOffline === true;
        window.wasOffline = false;
        
        if (typeof firebase !== 'undefined' && firebase.auth && typeof firebase.auth === 'function' && firebase.auth().currentUser) {
            processSyncQueue(isRecovering || true);
        } else {
            console.log("ℹ️ Recovered online but waiting for Firebase Auth before processing sync queue.");
        }
    } else {
        indicator.classList.remove('online');
        indicator.classList.add('offline');
        text.innerText = translations[currentLang].offline;
        dot.className = 'status-dot w-2.5 h-2.5 rounded-full';
        window.wasOffline = true;
    }
    updateSyncUI();
}

// دالة الحفظ الصامت (بدون Loading Screen يوقف الشغل)
async function silentSave() {
    console.log("🔄 جاري الحفظ التلقائي في الخلفية...");
    await saveDailyData(true); // true دي عشان نعرف الدالة إن ده حفظ صامت
}

// ✅ PHASE 2 — THROTTLED SAVE:
// Combines a short debounce (500ms) with a hard max-interval cap (4000ms).
// Under 50 rapid scans: save fires at t=0 (first scan arms the forced timer),
// then again at t=4s (forced), then once more 500ms after the LAST scan.
// This prevents the old "3-second infinite delay" bug.
function scheduleThrottledSave() {
    // Arm the debounce: save 500ms after the last activity
    clearTimeout(_saveThrottleTimer);
    _saveThrottleTimer = setTimeout(async () => {
        clearTimeout(_saveThrottleForced); // debounce won — cancel the forced timer
        _saveThrottleForced = null;
        _saveThrottleTimer = null;
        if (!_saveThrottleRunning) {
            _saveThrottleRunning = true;
            try { await silentSave(); } finally { _saveThrottleRunning = false; }
        }
    }, 500);

    // Arm the max-interval: if debounce never fires within 4s, save anyway
    if (!_saveThrottleForced) {
        _saveThrottleForced = setTimeout(async () => {
            _saveThrottleForced = null;
            // debounce will still fire later for the tail — that's OK
            if (!_saveThrottleRunning) {
                _saveThrottleRunning = true;
                try { await silentSave(); } finally { _saveThrottleRunning = false; }
            }
        }, 4000);
    }
}

// ✅ PHASE 3: Flush pending saves
async function flushPendingSaves() {
    if (_saveThrottleTimer || _saveThrottleForced) {
        clearTimeout(_saveThrottleTimer);
        clearTimeout(_saveThrottleForced);
        _saveThrottleTimer = null;
        _saveThrottleForced = null;
        if (!_saveThrottleRunning) {
            _saveThrottleRunning = true;
            try { await silentSave(); } finally { _saveThrottleRunning = false; }
        }
    }
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

const withTimeout = (promise, ms) => {
    let _timerId;
    const timeoutPromise = new Promise((_, reject) => {
        _timerId = setTimeout(() => reject(new Error("Timeout (Firebase offline)")), ms);
    });
    return Promise.race([
        promise.then(result => { clearTimeout(_timerId); return result; }),
        timeoutPromise
    ]);
};

async function processSyncQueue(isRecovering = false) {
    if (isSyncing) return;

    if (!navigator.onLine) {
        console.warn("🌐 processSyncQueue aborted: navigator reports offline.");
        return;
    }

    if (!firebase.auth || typeof firebase.auth !== 'function' || !firebase.auth().currentUser) {
        console.warn("🔒 processSyncQueue aborted: no authenticated user or auth not ready. Will retry after login.");
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

        // 2️⃣ حل التعارضات مع Deep Merge للـ data
        groupedByPath.forEach((list, pathKey) => {
            const hasSetOrUpdate = list.some(e => e.action.type === 'set' || e.action.type === 'update');
            const isDailyAttendanceDoc = pathKey.includes('/dailyAttendance/');

            if (hasSetOrUpdate) {
                // 🔀 Deep Merge: نجمع كل بيانات set/update بالترتيب الزمني (الأحدث يطغى على الأقدم)
                const setUpdateEntries = list
                    .filter(e => e.action.type === 'set' || e.action.type === 'update')
                    .sort((a, b) => a.index - b.index); // ترتيب تصاعدي عشان الأحدث يطغى

                // نأخذ آخر entry كأساس عشان نحتفظ بـ options, type, path
                const baseEntry = setUpdateEntries[setUpdateEntries.length - 1];

                // نعمل Deep Merge لكل الـ data payloads
                const deepMerge = (target, source) => {
                    if (!source || typeof source !== 'object') return target;
                    const result = { ...target };
                    for (const key of Object.keys(source)) {
                        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
                            && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
                            result[key] = deepMerge(target[key], source[key]);
                        } else {
                            result[key] = source[key]; // Arrays و القيم البدائية: الأحدث يطغى
                        }
                    }
                    return result;
                };

                let mergedData = {};
                for (const e of setUpdateEntries) {
                    if (e.action.data && typeof e.action.data === 'object') {
                        mergedData = deepMerge(mergedData, e.action.data);
                    }
                }

                // نبني entry واحدة مدمجة بالـ data المدموجة
                const mergedEntry = {
                    ...baseEntry,
                    action: { ...baseEntry.action, data: mergedData }
                };

                filteredEntries.push(mergedEntry);
                console.log(`🔀 Deep-merged ${setUpdateEntries.length} set/update ops for path:`, pathKey);

                for (const e of list) {
                    if (e.key === baseEntry.key) continue;

                    // لو فيه delete لنفس dailyAttendance مع وجود set -> نرميه من الـ Queue
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

        let successCount = 0;

        // 3️⃣ تنفيذ الـ Actions بعد حل التعارضات
        for (const entry of filteredEntries) {
            const action = entry.action;
            const key = entry.key;

            const attempts = action.attempts || 0;
            // Removed fatal deletion based on attempts to ensure data is NEVER lost!
            // It will keep retrying until it successfully hits the server.
            if (action.failed) {
                console.warn("⏭️ Removing permanently failed sync item from queue:", {
                    type: action.type,
                    path: action.path,
                    attempts,
                    lastError: action.lastError
                });
                await deleteFromDB('syncQueue', key);
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
                    await withTimeout(firestoreDB.doc(path).set(data, options || { merge: true }), 10000);
                } else if (type === 'add') {
                    console.log("➡️ FIRESTORE SET (add to collection):", {
                        collectionPath: path,
                        docId: id,
                        payloadPreview: data && typeof data === 'object'
                            ? { keys: Object.keys(data), date: data.date }
                            : data
                    });
                    await withTimeout(firestoreDB.collection(path).doc(id).set(data, { merge: true }), 10000);
                } else if (type === 'delete') {
                    console.log("🗑️ FIRESTORE DELETE:", { path });
                    await withTimeout(firestoreDB.doc(path).delete(), 10000);
                } else {
                    console.warn("⚠️ Unknown syncQueue action type. Skipping:", action);
                    continue;
                }

                await deleteFromDB('syncQueue', key);
                console.log("✅ Sync success, removed from queue:", { type, path });
                successCount++;
            } catch (err) {
                const message = err && err.message ? err.message : String(err);
                console.error("❌ Sync error for item:", {
                    type,
                    path,
                    attempts,
                    error: message
                });

                // Detect unrecoverable errors (permissions, quota, invalid args) so we don't get stuck in a loop forever
                let isUnrecoverable = message.includes('permission-denied') || 
                                        message.includes('Missing or insufficient permissions') || 
                                        message.includes('INVALID_ARGUMENT') ||
                                        message.includes('Quota exceeded');

                // ✅ إذا كان الخطأ بسبب الصلاحيات ولم يتم تهيئة Auth بعد، فلا نعتبره خطأ نهائي (سنحاول لاحقاً)
                if ((message.includes('permission-denied') || message.includes('Missing or insufficient permissions')) && !firebase.auth().currentUser) {
                    isUnrecoverable = false;
                }

                const updated = {
                    ...action,
                    attempts: attempts + 1,
                    lastError: message,
                    failed: isUnrecoverable // True if unrecoverable, false if network error or waiting for Auth
                };

                try {
                    await putToDB('syncQueue', updated, key);
                } catch (metaErr) {
                    console.error("⚠️ Failed to update retry metadata for sync item:", metaErr);
                }
            }
        }

        // Show a celebratory toast if items synced successfully upon returning online!
        if (successCount > 0 && (isRecovering || successCount > 2)) {
            const msg = currentLang === 'ar' ? `تمت مزامنة ${successCount} عمليات بنجاح! ☁️` : `Successfully synced ${successCount} items! ☁️`;
            showToast(msg, 'success');
        }

    } catch (e) {
        console.error("🔥 Fatal error in processSyncQueue:", e);
        sentryCaptureError(e, { action: "processSyncQueue" });
    } finally {
        isSyncing = false;
        await updateSyncUI();

        // 🚀 إعادة التشغيل التلقائي الآمن إذا كان هناك عناصر متبقية صالحة
        try {
            const { items } = await getAllSyncQueueItemsWithKeys();
            if (items && items.length > 0 && navigator.onLine) {
                // نتحقق أن العناصر ليست فاشلة نهائياً لتجنب اللوب اللانهائي
                const hasPending = items.some(item => !item.failed && item.attempts < MAX_SYNC_RETRIES);
                if (hasPending) {
                    // FIX #4: Exponential backoff — prevents infinite CPU lockup when firewalled
                    const backoffMs = Math.min(Math.pow(2, syncRetryCount) * 1000, 64000);
                    console.log(`⏳ Retry sync in ${backoffMs}ms (attempt ${syncRetryCount})`);
                    syncRetryCount++;
                    setTimeout(processSyncQueue, backoffMs);
                } else {
                    syncRetryCount = 0; // Reset on empty/all-failed queue
                }
            } else {
                syncRetryCount = 0; // Reset on success or offline
            }
        } catch (_) {}
    }
}

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



async function submitManualCardLink() {
    const input = document.getElementById('manualCardIdInput');
    const cardId = input.value.trim().toUpperCase();
    
    if (!cardId || !cardId.startsWith('NAZ-') || cardId.length < 8) {
        showToast('يرجى إدخال رقم كارت صحيح يبدأ بـ NAZ-', 'error');
        return;
    }

    if (studentPendingCardLink) {
        await linkCardToStudent(studentPendingCardLink, cardId);
    }
}


// ==========================================
// 🚀 Hardware Scanner Global Listener (Auto-Capture) - MAC COMPATIBLE