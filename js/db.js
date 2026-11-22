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

function openDB() {
    return new Promise((resolve, reject) => {
        if (localDB) {
            resolve(localDB);
            return;
        }

        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = e => {
            const db = e.target.result;
            const tx = e.target.transaction || req.transaction || e.currentTarget?.transaction;
            ['teachers', 'groups', 'students', 'assignments', 'attendance', 'payments', 'schedules', 'scheduleExceptions', 'syncQueue'].forEach(store => {
                try {
                    let s;
                    if (!db.objectStoreNames.contains(store)) {
                        const params = store === 'syncQueue' ? { autoIncrement: true } : { keyPath: 'id' };
                        s = db.createObjectStore(store, params);
                    } else if (tx) {
                        s = tx.objectStore(store);
                    }

                    if (s && ['groups', 'students', 'assignments', 'schedules', 'attendance', 'payments'].includes(store)) {
                        const indexKey = (store === 'groups') ? 'teacherId' : 'groupId';
                        if (!s.indexNames.contains(indexKey)) {
                            s.createIndex(indexKey, indexKey, { unique: false });
                        }
                    }
                } catch (err) {
                    console.warn(`⚠️ Error upgrading store "${store}":`, err);
                }
            });
        };

        req.onblocked = () => {
            console.warn("Database upgrade blocked by another tab. Reloading...");
            window.location.reload();
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

async function putToDB(store, data, key = undefined) {
    try {
        await openDB();
        const tx = localDB.transaction(store, 'readwrite');
        if (key !== undefined) { tx.objectStore(store).put(data, key); } else { tx.objectStore(store).put(data); }
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        if (e.name === 'InvalidStateError' || !localDB) {
            localDB = null;
            await openDB();
            const tx = localDB.transaction(store, 'readwrite');
            if (key !== undefined) { tx.objectStore(store).put(data, key); } else { tx.objectStore(store).put(data); }
            return new Promise((resolve, reject) => {
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        }
        throw e;
    }
}

async function putAllToDB(store, dataArray) {
    if (!dataArray || dataArray.length === 0) return;
    try {
        await openDB();
        const tx = localDB.transaction(store, 'readwrite');
        const objectStore = tx.objectStore(store);
        dataArray.forEach(item => objectStore.put(item));
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        if (e.name === 'InvalidStateError' || !localDB) {
            localDB = null;
            await openDB();
            const tx = localDB.transaction(store, 'readwrite');
            const objectStore = tx.objectStore(store);
            dataArray.forEach(item => objectStore.put(item));
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
            let req;
            try {
                req = idx ? s.index(idx).getAll(key) : s.getAll();
            } catch (indexErr) {
                console.warn(`⚠️ Index "${idx}" not found on store "${store}". Falling back to in-memory filtering.`, indexErr);
                const fallbackReq = s.getAll();
                fallbackReq.onsuccess = () => {
                    const all = fallbackReq.result || [];
                    const filtered = all.filter(item => item && item[idx] === key);
                    res(filtered);
                };
                fallbackReq.onerror = () => rej(fallbackReq.error);
                return;
            }
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });
    } catch (e) {
        if (e.name === 'InvalidStateError' || !localDB) {
            localDB = null;
            await openDB();
            return new Promise((res, rej) => {
                const s = localDB.transaction(store, 'readonly').objectStore(store);
                let req;
                try {
                    req = idx ? s.index(idx).getAll(key) : s.getAll();
                } catch (indexErr) {
                    console.warn(`⚠️ Index "${idx}" not found on store "${store}" during retry. Falling back to in-memory filtering.`, indexErr);
                    const fallbackReq = s.getAll();
                    fallbackReq.onsuccess = () => {
                        const all = fallbackReq.result || [];
                        const filtered = all.filter(item => item && item[idx] === key);
                        res(filtered);
                    };
                    fallbackReq.onerror = () => rej(fallbackReq.error);
                    return;
                }
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
