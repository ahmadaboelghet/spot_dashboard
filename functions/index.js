/* eslint-disable max-len */
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

// ===================================================================
// (الجزء الأول: دوال مساعدة)
// ===================================================================

/**
 * جلب اسم المادة للمدرس.
 * @param {string} teacherId - معرف المدرس
 * @return {Promise<string>} - اسم المادة
 */
async function getTeacherSubject(teacherId) {
  try {
    const doc = await admin.firestore().collection("teachers").doc(teacherId).get();
    if (doc.exists) {
      return doc.data().subject || "المادة";
    }
  } catch (e) {
    console.error("Error fetching teacher subject:", e);
  }
  return "المادة";
}

/**
 * تنسيق التاريخ YYYY-MM-DD.
 * @param {Date} date - كائن التاريخ
 * @return {string}
 */
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * جلب رقم اليوم من 0 إلى 6.
 * @param {Date} date - كائن التاريخ
 * @return {number}
 */
function getDayDart(date) {
  return date.getDay();
}

/**
 * تحويل الوقت إلى صيغة 12 ساعة.
 * @param {string} timeString - الوقت بصيغة HH:mm
 * @return {string}
 */
function formatTime12Hour(timeString) {
  if (!timeString) return "";
  const [h, m] = timeString.split(":");
  const hour = parseInt(h);
  const suffix = hour >= 12 ? "PM" : "AM";
  const formattedHour = ((hour + 11) % 12 + 1);
  return `${formattedHour}:${m} ${suffix}`;
}

/**
 * إرسال إشعار لولي الأمر (نسخة محسنة تدعم تعدد المدرسين).
 * @param {object} studentData - بيانات الطالب
 * @param {object} payload - محتوى الإشعار (Notification Payload)
 * @param {string} context - سياق الوظيفة (للتتبع في الكونسول)
 * @param {string} studentId - معرف الطالب
 * @return {Promise<void>} - وعد يكتمل عند انتهاء المحاولة
 */
async function sendNotificationToParent(studentData, payload, context, studentId, teacherId = null, groupId = null) {
  let tokenToSend = null;

  // 1. المحاولة الأولى: البحث عن التوكن داخل بيانات الطالب مباشرة (الأسرع)
  if (studentData.parentFcmToken) {
    tokenToSend = studentData.parentFcmToken;
  }

  // 2. المحاولة الثانية (الحل السحري): البحث في سجل الآباء العام برقم التليفون
  if (!tokenToSend && studentData.parentPhoneNumber) {
    try {
      const cleanPhone = studentData.parentPhoneNumber.replace(/\s+/g, "").trim();
      const parentDoc = await admin.firestore().collection("parents").doc(cleanPhone).get();

      if (parentDoc.exists && parentDoc.data().fcmToken) {
        tokenToSend = parentDoc.data().fcmToken;
        console.log(`${context}: 🔄 Found token in global 'parents' collection for ${cleanPhone}`);
      }
    } catch (e) {
      console.error(`${context}: Error fetching global parent token:`, e);
    }
  }

  // 3. المحاولة الثالثة: تطبيق الموبايل (users collection)
  if (!tokenToSend) {
    const parentUserId = studentData.parentUserId;
    const parentPhoneNumber = studentData.parentPhoneNumber;
    let parentUserDoc;

    if (parentUserId) {
      try {
        const doc = await admin.firestore().collection("users").doc(parentUserId).get();
        if (doc.exists) parentUserDoc = doc;
      } catch (error) {
        console.error(`${context}: Error fetching parent by ID:`, error);
      }
    }

    if (!parentUserDoc && parentPhoneNumber) {
      try {
        const q = await admin.firestore().collection("users")
          .where("phoneNumber", "==", parentPhoneNumber).limit(1).get();
        if (!q.empty) parentUserDoc = q.docs[0];
      } catch (error) {
        console.error(`${context}: Error querying parent by phone:`, error);
      }
    }

    if (parentUserDoc && parentUserDoc.data().fcmToken) {
      tokenToSend = parentUserDoc.data().fcmToken;
    }
  }

  // ---------------------------------------------------------
  // تنفيذ الإرسال النهائي + حفظ السجل
  // ---------------------------------------------------------
  const notificationRecord = {
    title: payload.notification.title,
    body: payload.notification.body,
    data: payload.data || {},
    sentAt: admin.firestore.FieldValue.serverTimestamp(),
    context: context,
    status: "failed", // القيمة الافتراضية
  };

  if (tokenToSend) {
    const cleanPhone = studentData.parentPhoneNumber ? studentData.parentPhoneNumber.replace(/\s+/g, "").trim() : "";
    const parentAppLink = `https://ahmadaboelghet.github.io/spot_dashboard/parent.html?p=${cleanPhone}`;

    // Ensure all data values are flat strings to satisfy FCM V1 requirements
    const stringData = {};
    if (payload.data) {
      Object.keys(payload.data).forEach(key => {
        stringData[key] = String(payload.data[key]);
      });
    }

    const message = {
      notification: payload.notification,
      data: stringData,
      token: tokenToSend,
      webpush: {
        fcm_options: {
          link: parentAppLink,
        },
      },
      android: {
        priority: "high",
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    };
    try {
      await admin.messaging().send(message);
      notificationRecord.status = "sent";
      console.log(`${context}: ✅ Notification sent successfully.`);
    } catch (error) {
      console.error(`${context}: ❌ Failed to send notification:`, error);
      notificationRecord.status = "error";
      notificationRecord.error = error.message;

      // 🔥 تنظيف التوكنات القديمة (Dead Tokens Cleanup)
      if (error.code === 'messaging/registration-token-not-registered' ||
        error.message?.includes('not-registered')) {
        console.log(`${context}: 🧹 Cleaning up invalid token...`);

        // 1. مسحه من سجل الآباء العام
        if (studentData.parentPhoneNumber) {
          const cleanPhone = studentData.parentPhoneNumber.replace(/\s+/g, "").trim();
          await admin.firestore().collection("parents").doc(cleanPhone).update({
            fcmToken: admin.firestore.FieldValue.delete(),
            lastTokenError: "not-registered",
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }).catch(() => { });
        }

        // 2. مسحه من بيانات الطالب (لو موجود هناك)
        if (studentId && teacherId && groupId) {
          await admin.firestore()
            .doc(`teachers/${teacherId}/groups/${groupId}/students/${studentId}`)
            .update({
              parentFcmToken: admin.firestore.FieldValue.delete()
            }).catch(() => { });
        }
      }
    }
  } else {
    console.log(`${context}: ⚠️ No token found for student ${studentId}`);
    notificationRecord.status = "no_token";
  }

  // حفظ في الداتابيز حتى لو متبعتش عشان نعرف تاريخ المحاولات
  if (studentId && teacherId && groupId) {
    try {
      await admin.firestore()
        .doc(`teachers/${teacherId}/groups/${groupId}/students/${studentId}`)
        .collection("notificationHistory")
        .add(notificationRecord);
    } catch (dbError) {
      console.error(`${context}: Error saving notification history:`, dbError);
    }
  }
}

// ===================================================================
// (الجزء الثاني: دوال الإشعارات التلقائية)
// ===================================================================

// 1. إشعار الغياب (محسن للسرعة)
// exports.notifyOnAbsence = onDocumentWritten(
//     "teachers/{teacherId}/groups/{groupId}/dailyAttendance/{date}",
//     async (event) => {
//       const teacherId = event.params.teacherId;
//       const groupId = event.params.groupId;
//       const snap = event.data.after;

//       if (!snap || !snap.exists) return;

//       const attendanceData = snap.data();
//       const records = attendanceData.records || [];
//       const subjectName = await getTeacherSubject(teacherId);

//       // تحسين السرعة: استخدام Promise.all لإرسال الإشعارات بالتوازي
//       const notifications = records
//           .filter((r) => r.status === "absent")
//           .map(async (record) => {
//             const studentId = record.studentId;
//             const sDoc = await admin.firestore().doc(`teachers/${teacherId}/groups/${groupId}/students/${studentId}`).get();

//             if (sDoc.exists) {
//               const sData = sDoc.data();
//               const payload = {
//                 notification: {
//                   title: "تنبيه غياب",
//                   body: `تم تسجيل غياب الطالب ${sData.name} اليوم في مادة ${subjectName}.`,
//                 },
//                 data: {"screen": "attendance", "studentId": studentId},
//               };
//               return sendNotificationToParent(sData, payload, "notifyOnAbsence", studentId);
//             }
//           });

//       await Promise.all(notifications);
//     });

// 3. دالة الغياب اليدوية (التصحيح: المسار الصحيح للطلاب)
exports.sendAbsenceNotifications = onCall({ cors: true }, async (request) => {
  // استقبال البيانات
  const { groupId, date, teacherId } = request.data;

  if (!teacherId) {
    throw new HttpsError("invalid-argument", "Teacher ID is required");
  }

  try {
    const subjectName = await getTeacherSubject(teacherId);

    // 1. جلب سجل الحضور (عشان نعرف مين حضر)
    const attendanceDoc = await admin.firestore()
      .doc(`teachers/${teacherId}/groups/${groupId}/dailyAttendance/${date}`)
      .get();

    const attendanceData = attendanceDoc.exists ? attendanceDoc.data() : { records: [] };

    // قايمة باللي حضروا
    const presentStudentIds = new Set(
      attendanceData.records
        .filter((r) => r.status === "present")
        .map((r) => r.studentId),
    );

    // 2. جلب الطلاب (🔥🔥 هنا كان الخطأ وصححناه 🔥🔥)
    // بنجيب الطلاب من جوه مجلد المدرس والمجموعة مش من بره
    const studentsSnapshot = await admin.firestore()
      .collection("teachers")
      .doc(teacherId)
      .collection("groups")
      .doc(groupId)
      .collection("students")
      .get();

    if (studentsSnapshot.empty) {
      console.log(`No students found in path: teachers/${teacherId}/groups/${groupId}/students`);
      return { success: true, message: "لا يوجد طلاب في هذه المجموعة" };
    }

    // 3. الفلترة والإرسال
    const promises = [];
    let sentCount = 0;

    studentsSnapshot.docs.forEach((doc) => {
      // لو الطالب مش في قايمة الحضور (يعني غايب)
      if (!presentStudentIds.has(doc.id)) {
        const student = doc.data();

        // نتأكد إن الطالب عنده ولي أمر وتوكن قبل ما نحاول نبعت
        // (اختياري: ممكن تشيل الشرط ده لو الدالة sendNotificationToParent بتهندله)
        const payload = {
          notification: {
            title: "تنبيه غياب ❌",
            body: `نحيطكم علماً بأن الطالب ${student.name} تغيب عن حصة اليوم (${date}) في مادة ${subjectName}.`,
          },
          data: {
            type: "absence_alert",
            studentId: doc.id,
            date: date,
          },
        };

        promises.push(
          sendNotificationToParent(student, payload, "ManualAbsence", doc.id, teacherId, groupId)
            .then(() => sentCount++),
        );
      }
    });

    await Promise.all(promises);
    // ✅✅ الإضافة الجديدة: توثيق الإرسال اليدوي لمنع التكرار التلقائي ✅✅
    const metaRef = admin.firestore().doc(`teachers/${teacherId}/groups/${groupId}/attendanceMeta/${date}`);
    await metaRef.set({ absenceSent: true, sentAt: new Date(), manual: true }, { merge: true });

    return {
      success: true,
      sentCount: sentCount,
      message: sentCount > 0 ? `تم إرسال تنبيه الغياب لـ ${sentCount} طالب بنجاح` : "لا يوجد غياب اليوم (الكل حاضر)",
    };

  } catch (error) {
    console.error("Absence Notification Error:", error);
    throw new HttpsError("internal", "حدث خطأ أثناء إرسال التنبيهات");
  }
});

// 2. إشعار الدرجات (معدلة: ترسل فقط عند رصد درجة لمنع التكرار مع الحضور)
exports.notifyOnNewGrades = onDocumentWritten(
  "teachers/{teacherId}/groups/{groupId}/assignments/{assignmentId}",
  async (event) => {
    const teacherId = event.params.teacherId;
    const groupId = event.params.groupId;
    const assignmentId = event.params.assignmentId;

    const snapAfter = event.data.after;
    if (!snapAfter || !snapAfter.exists) return;

    const afterData = snapAfter.data();
    const assignmentName = afterData.name || "واجب/امتحان";
    const scoresAfter = afterData.scores || {};
    const subjectName = await getTeacherSubject(teacherId);

    const sendPromises = [];

    for (const studentId in scoresAfter) {
      if (Object.prototype.hasOwnProperty.call(scoresAfter, studentId)) {
        const scoreData = scoresAfter[studentId];

        if (scoreData) {
          const processStudent = async () => {
            // ✅ الشرط الجديد: نرسل فقط إذا كان هناك "درجة" مرصودة
            const hasScore = scoreData.score !== "" && scoreData.score != null;

            if (hasScore) {
              const sDoc = await admin.firestore().doc(`teachers/${teacherId}/groups/${groupId}/students/${studentId}`).get();

              if (sDoc.exists) {
                const sData = sDoc.data();
                const payload = {
                  notification: {
                    title: "تم رصد درجة جديدة 📝",
                    body: `حصل الطالب ${sData.name} على ${scoreData.score} من ${afterData.totalMark || 30} في "${assignmentName}" لمادة ${subjectName}.`,
                  },
                  data: { "screen": "grades", "assignmentId": assignmentId },
                };
                await sendNotificationToParent(sData, payload, "notifyOnNewGrades", studentId, teacherId, groupId);
              }
            }
          };
          sendPromises.push(processStudent());
        }
      }
    }

    await Promise.all(sendPromises);
  });

// 4. إشعار تعديل أو إلغاء حصة (إجازة)
exports.notifyOnScheduleException = onDocumentWritten(
  "teachers/{teacherId}/groups/{groupId}/exceptions/{exceptionId}",
  async (event) => {
    const teacherId = event.params.teacherId;
    const groupId = event.params.groupId;

    const snapAfter = event.data.after;
    if (!snapAfter || !snapAfter.exists) return;

    const data = snapAfter.data();
    const type = data.type; // 'modified' or 'cancelled'
    const date = data.date;
    const newTime = data.newTime;

    const subjectName = await getTeacherSubject(teacherId);

    // جلب كل الطلاب في المجموعة
    const studentsSnapshot = await admin.firestore()
      .collection("teachers")
      .doc(teacherId)
      .collection("groups")
      .doc(groupId)
      .collection("students")
      .get();

    if (studentsSnapshot.empty) return;

    const sendPromises = studentsSnapshot.docs.map(async (doc) => {
      const studentData = doc.data();
      let title = "";
      let body = "";

      if (type === "cancelled") {
        title = "إلغاء حصة (إجازة) 🚫";
        body = `نحيطكم علماً بأنه تم إلغاء حصة مادة ${subjectName} يوم ${date} للطالب ${studentData.name}. (إجازة)`;
      } else if (type === "modified") {
        title = "تعديل موعد حصة 🕒";
        const formattedTime = formatTime12Hour(newTime);
        body = `نحيطكم علماً بأنه تم تغيير موعد حصة مادة ${subjectName} يوم ${date} للطالب ${studentData.name} لتصبح في تمام الساعة ${formattedTime}.`;
      }

      if (title && body) {
        const payload = {
          notification: { title, body },
          data: { "screen": "schedule" },
        };
        return sendNotificationToParent(studentData, payload, "notifyOnScheduleException", doc.id, teacherId, groupId);
      }
    });

    await Promise.all(sendPromises);
  });

// ===================================================================
// (الجزء الثالث: المهام المجدولة)
// ===================================================================

// 3. تذكير بمواعيد الدروس (قبل الميعاد بـ 30 دقيقة)
exports.classReminder = onSchedule({
  schedule: "*/15 * * * *", // يعمل كل 15 دقيقة لضمان دقة التوقيت
  timeZone: "Africa/Cairo",
}, async (event) => {
  const now = new Date();
  const cairoTimeStr = now.toLocaleString("en-US", { timeZone: "Africa/Cairo" });
  const cairoDate = new Date(cairoTimeStr);

  // نضيف 30 دقيقة على الوقت الحالي
  const targetDate = new Date(cairoDate.getTime() + 30 * 60000);

  const targetHour = targetDate.getHours();
  const targetMinute = targetDate.getMinutes();
  const dayIndex = targetDate.getDay();

  console.log(`Checking classes for Day: ${dayIndex}, Time around: ${targetHour}:${targetMinute}`);

  const teachersSnap = await admin.firestore().collection("teachers").get();

  for (const teacherDoc of teachersSnap.docs) {
    const groupsSnap = await teacherDoc.ref.collection("groups").get();

    for (const groupDoc of groupsSnap.docs) {
      const schedulesSnap = await groupDoc.ref.collection("recurringSchedules").get();

      for (const schedDoc of schedulesSnap.docs) {
        const sched = schedDoc.data();
        if (sched.days && sched.days.includes(dayIndex)) {
          const [hStr, mStr] = sched.time.split(":");
          const schedHour = parseInt(hStr, 10);
          const schedMinute = parseInt(mStr, 10);

          // سماحية 7 دقائق قبل أو بعد لضمان التقاط الموعد
          const isTimeMatch = (schedHour === targetHour) && (Math.abs(schedMinute - targetMinute) <= 7);

          if (isTimeMatch) {
            const subjectName = await getTeacherSubject(teacherDoc.id);
            const studentsSnap = await groupDoc.ref.collection("students").get();

            const notifications = studentsSnap.docs.map(async (studentDoc) => {
              const studentData = studentDoc.data();
              const payload = {
                notification: {
                  title: "اقتراب موعد الدرس",
                  body: `تذكير: درس ${subjectName} للطالب ${studentData.name} يبدأ بعد 30 دقيقة (الساعة ${formatTime12Hour(sched.time)}).`,
                },
                data: { "screen": "schedule" },
              };
              return sendNotificationToParent(studentData, payload, "classReminder", studentDoc.id, teacherDoc.id, groupDoc.id);
            });
            await Promise.all(notifications);
          }
        }
      }
    }
  }
});


// 4. تذكير المصروفات (النظام الملح - Persistent Reminder)
exports.paymentReminder = onSchedule({
  schedule: "0 14 * * *", // يعمل يومياً الساعة 2 ظهراً
  timeZone: "Africa/Cairo",
}, async (event) => {
  const now = new Date();
  const cairoTimeStr = now.toLocaleString("en-US", { timeZone: "Africa/Cairo" });
  const cairoDate = new Date(cairoTimeStr);

  const currentDay = cairoDate.getDate();

  // 1. الفلتر الزمني: نشتغل يوم ويوم عشان منعملش إزعاج (أيام فردية مثلاً)
  // يعني هيبعت يوم 1، 3، 5 ... 27، 29، 31
  if (currentDay % 2 === 0) {
    console.log("اليوم زوجي - راحة من التنبيهات.");
    return;
  }

  // 2. تحديد الشهر المستهدف (Target Month)
  let targetDate = new Date(cairoDate);
  let isOverdue = false; // عشان نغير نبرة الرسالة

  if (currentDay >= 25) {
    // لو إحنا في آخر الشهر (من يوم 25 وطالع) -> بنطالب بمصاريف الشهر "الحالي"
    // targetDate هو نفس الشهر الحالي
    isOverdue = false;
  } else {
    // لو إحنا في أول الشهر الجديد (من يوم 1 لحد 24) -> بنطالب بمصاريف الشهر "السابق"
    // نرجع التاريخ شهر لورا
    targetDate.setMonth(targetDate.getMonth() - 1);
    isOverdue = true;
  }

  const targetMonth = targetDate.toISOString().slice(0, 7); // Format: YYYY-MM
  console.log(`Checking Payments for: ${targetMonth} (Overdue: ${isOverdue})`);

  const teachersSnap = await admin.firestore().collection("teachers").get();

  for (const teacherDoc of teachersSnap.docs) {
    const subjectName = await getTeacherSubject(teacherDoc.id);
    const groupsSnap = await teacherDoc.ref.collection("groups").get();

    for (const groupDoc of groupsSnap.docs) {
      const studentsSnap = await groupDoc.ref.collection("students").get();
      if (studentsSnap.empty) continue;

      // نجيب سجل الدفع للشهر المستهدف
      const paymentDoc = await groupDoc.ref.collection("payments").doc(targetMonth).get();
      let paidStudentIds = [];

      if (paymentDoc.exists) {
        const records = paymentDoc.data().records || [];
        // بنجيب بس الناس اللي دفعت فعلاً
        paidStudentIds = records.filter((r) => r.paid === true).map((r) => r.studentId);
      }

      const notifications = studentsSnap.docs.map(async (studentDoc) => {
        // لو الطالب لسه مدفعش (مش موجود في قايمة paidStudentIds)
        if (!paidStudentIds.includes(studentDoc.id)) {
          const studentData = studentDoc.data();

          // تغيير صيغة الرسالة حسب التأخير
          let title = "تذكير بالمصروفات 📅";
          let body = `يرجى سداد مصروفات شهر ${targetMonth} لمادة ${subjectName}.`;

          if (isOverdue) {
            title = "تنبيه هام (مستحقات متأخرة) ⚠️";
            body = `تذكير: لم يتم سداد مصروفات شهر ${targetMonth} السابق لمادة ${subjectName} للطالب ${studentData.name} حتى الآن.`;
          }

          const payload = {
            notification: {
              title: title,
              body: body,
            },
            data: { "screen": "payments" },
          };
          return sendNotificationToParent(studentData, payload, "paymentReminder", studentDoc.id, teacherDoc.id, groupDoc.id);
        }
      });
      await Promise.all(notifications);
    }
  }
});

// ===================================================================
// (الجزء الرابع: دوال لوحة التحكم والتطبيق)
// ===================================================================

exports.getDashboardData = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }

  const parentUid = request.auth.uid;
  let studentNameForDashboard = "Student";
  const reportsMap = new Map();

  try {
    const parentUserDoc = await admin.firestore().collection("users").doc(parentUid).get();
    if (!parentUserDoc.exists || !parentUserDoc.data().phoneNumber) {
      throw new HttpsError("not-found", "Parent user phone number not found.");
    }
    const parentPhoneNumber = parentUserDoc.data().phoneNumber;

    const studentsSnapshot = await admin.firestore()
      .collectionGroup("students")
      .where("parentPhoneNumber", "==", parentPhoneNumber)
      .get();

    if (studentsSnapshot.empty) {
      return { studentName: studentNameForDashboard, reportsByTeacher: [] };
    }

    studentNameForDashboard = studentsSnapshot.docs[0].data().name || studentNameForDashboard;

    // eslint-disable-next-line no-restricted-syntax
    for (const studentDoc of studentsSnapshot.docs) {
      const path = (studentDoc && studentDoc.ref) ? studentDoc.ref.path : null;
      if (!path) continue;

      const pathSegments = path.split("/");
      if (pathSegments.length < 6 || pathSegments[4] !== "students") continue;

      const studentId = studentDoc.id;
      const studentData = studentDoc.data();
      if (!studentData) continue;

      const studentName = studentData.name || "N/A";

      if (studentData.parentUserId !== parentUid) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await studentDoc.ref.set({ parentUserId: parentUid }, { merge: true });
        } catch (linkError) {
          console.error(`Failed to link student ${studentId}:`, linkError);
        }
      }

      const teacherId = pathSegments[1];
      const groupId = pathSegments[3];
      if (!teacherId || !groupId) continue;

      if (!reportsMap.has(teacherId)) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const teacherDoc = await admin.firestore().collection("teachers").doc(teacherId).get();
          const teacherData = teacherDoc.data() || {};
          reportsMap.set(teacherId, {
            teacherId: teacherId,
            teacherName: teacherData.name || "Unknown Teacher",
            subject: teacherData.subject || "General",
            attendance: [],
            grades: [],
            schedule: [],
          });
        } catch (teacherError) {
          console.error(`Failed to fetch teacher ${teacherId}:`, teacherError);
        }
      }

      const teacherReport = reportsMap.get(teacherId);
      const groupRef = admin.firestore().collection("teachers").doc(teacherId).collection("groups").doc(groupId);

      try {
        // eslint-disable-next-line no-await-in-loop
        const schedulesSnap = await groupRef.collection("recurringSchedules").get();
        // eslint-disable-next-line no-await-in-loop
        const exceptionsSnap = await groupRef.collection("scheduleExceptions").get();
        const today = new Date();
        const todayString = formatDate(today);
        const currentDayDart = getDayDart(today);
        const finalSchedule = [];

        for (const doc of schedulesSnap.docs) {
          const data = doc.data();
          const days = data.days || [];
          if (days.length === 0) continue;

          let isClassToday = false;
          if (typeof days[0] === "number") {
            if (days.includes(currentDayDart)) isClassToday = true;
          }

          if (isClassToday && data.time) {
            finalSchedule.push({ ...data, date: todayString, id: doc.id });
          }
        }

        for (const doc of exceptionsSnap.docs) {
          const data = doc.data();
          if (data.date === todayString) {
            if (data.status === "cancelled") {
              finalSchedule.length = 0;
              break;
            } else if (data.status === "rescheduled" && finalSchedule.length > 0 && data.newTime) {
              finalSchedule[0].time = data.newTime;
            }
          }
        }
        teacherReport.schedule.push(...finalSchedule);
      } catch (e) {
        console.error("Error fetching schedule:", e);
      }

      try {
        // eslint-disable-next-line no-await-in-loop
        const attSnap = await groupRef.collection("dailyAttendance").get();
        attSnap.forEach((doc) => {
          const data = doc.data();
          const records = (data.records || []).filter((r) => r.studentId === studentId);
          records.forEach((record) => {
            teacherReport.attendance.push({
              studentName: studentName,
              date: data.date || "N/A",
              status: record.status || "unknown",
            });
          });
        });
      } catch (e) {
        console.error("Error fetching attendance:", e);
      }

      try {
        // eslint-disable-next-line no-await-in-loop
        const assSnap = await groupRef.collection("assignments").get();
        assSnap.forEach((doc) => {
          const data = doc.data();
          const scoreData = data.scores ? data.scores[studentId] : null;
          if (scoreData) {
            teacherReport.grades.push({
              studentName: studentName,
              assignmentName: data.name || "N/A",
              score: scoreData.score,
              date: data.date || "N/A",
              submitted: scoreData.submitted || false,
            });
          }
        });
      } catch (e) {
        console.error("Error fetching grades:", e);
      }
    }

    const finalReports = Array.from(reportsMap.values());
    return {
      studentName: studentNameForDashboard,
      reportsByTeacher: finalReports,
    };
  } catch (error) {
    console.error("Fatal Error in getDashboardData function:", error);
    throw new HttpsError("internal", "An internal error occurred.", error.message);
  }
});

exports.checkParentExists = onCall(async (request) => {
  const parentPhoneNumber = request.data.phoneNumber;
  if (!parentPhoneNumber) {
    throw new HttpsError("invalid-argument", "The function must be called with a 'phoneNumber' argument.");
  }

  try {
    const studentsSnapshot = await admin.firestore()
      .collectionGroup("students")
      .where("parentPhoneNumber", "==", parentPhoneNumber)
      .limit(1)
      .get();

    return { exists: !studentsSnapshot.empty };
  } catch (error) {
    console.error("Error in checkParentExists function:", error);
    throw new HttpsError("internal", "An internal error occurred.", error.message);
  }
});

// 5. إشعار عند دفع المصروفات
exports.notifyOnPayment = onDocumentWritten(
  "teachers/{teacherId}/groups/{groupId}/payments/{month}",
  async (event) => {
    const teacherId = event.params.teacherId;
    const groupId = event.params.groupId;
    const month = event.params.month;

    const snapAfter = event.data.after;
    const snapBefore = event.data.before;

    if (!snapAfter || !snapAfter.exists) return;

    const afterData = snapAfter.data();
    const beforeData = snapBefore.exists ? snapBefore.data() : { records: [] };

    const afterRecords = afterData.records || [];
    const beforeRecords = beforeData.records || [];

    const beforeStatusMap = {};
    beforeRecords.forEach((r) => {
      beforeStatusMap[r.studentId] = r.paid;
    });

    let teacherName = "المستر";
    let subjectName = "المادة";

    try {
      const teacherDoc = await admin.firestore().collection("teachers").doc(teacherId).get();
      if (teacherDoc.exists) {
        const tData = teacherDoc.data();
        teacherName = tData.name || "المستر";
        subjectName = tData.subject || "المادة";
      }
    } catch (e) {
      console.error("Error fetching teacher info:", e);
    }

    // eslint-disable-next-line no-restricted-syntax
    for (const record of afterRecords) {
      const isNowPaid = record.amount > 0;
      const wasPaid = beforeStatusMap[record.studentId] === true;
      const amountPaid = record.amount || 0;

      if (isNowPaid && !wasPaid) {
        const studentId = record.studentId;

        // eslint-disable-next-line no-await-in-loop
        const sDoc = await admin.firestore().doc(`teachers/${teacherId}/groups/${groupId}/students/${studentId}`).get();

        if (sDoc.exists) {
          const sData = sDoc.data();
          const payload = {
            notification: {
              title: "تأكيد سداد المصروفات",
              body: `تم استلام مبلغ ${amountPaid} جنيه مصاريف شهر ${month} لمادة ${subjectName} مع ${teacherName} للطالب ${sData.name}. شكراً لكم.`,
            },
            data: { "screen": "payments", "month": month },
          };

          // eslint-disable-next-line no-await-in-loop
          await sendNotificationToParent(sData, payload, "notifyOnPayment", studentId, teacherId, groupId);
        }
      }
    }
  });

exports.sendCustomMessage = onCall(async (request) => {
  const { teacherId, groupId, studentId, messageBody } = request.data;

  try {
    const studentDoc = await admin.firestore().doc(`teachers/${teacherId}/groups/${groupId}/students/${studentId}`).get();

    if (!studentDoc.exists) throw new HttpsError("not-found", "الطالب غير موجود");

    const studentData = studentDoc.data();
    const subjectName = await getTeacherSubject(teacherId);

    const payload = {
      notification: {
        title: `رسالة من مدرس ${subjectName}`,
        body: messageBody,
      },
      data: { screen: "profile", studentId: studentId },
    };

    await sendNotificationToParent(studentData, payload, "sendCustomMessage", studentId, teacherId, groupId);

    return { success: true };
  } catch (error) {
    console.error("Error sending custom message:", error);
    throw new HttpsError("internal", error.message);
  }
});

const { onRequest } = require("firebase-functions/v2/https");
const { onObjectFinalized } = require("firebase-functions/v2/storage");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const twilio = require("twilio");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const path = require("path");
const os = require("os");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const arabicReshaper = require("arabic-reshaper");
const bidiFactory = require("bidi-js");
const bidi = bidiFactory();
const axios = require("axios");
const SVGtoPDF = require("svg-to-pdfkit");

initializeApp();

// ==========================================
// ⚙️ إعدادات المفاتيح
// ==========================================
const accountSid = "ACff17306c0ec58f2075e96940ea289bea";
const authToken = "b530f2fbe1d6267edbeabf3a9be1ffca";
const geminiApiKey = process.env.GEMINI_API_KEY;
const client = twilio(accountSid, authToken);
const genAI = new GoogleGenerativeAI(geminiApiKey);
const fileManager = new GoogleAIFileManager(geminiApiKey);
const db = getFirestore();

// نستخدم موديل مستقر (1.5 Flash ممتاز للسرعة والملفات)
const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

/**
 * 1️⃣ الجزء الأول: الأوتوميشن (المراقب) - تم التعديل لحفظ نوع الملف ✅
 */
// const myBucket = "learnaria-483e7.firebasestorage.app";

exports.processUploadedFile = onObjectFinalized({ region: "us-central1", cpu: 1, memory: "1GiB", timeoutSeconds: 540 }, async (event) => {
  const fileBucket = event.data.bucket;
  const filePath = event.data.name;
  const contentType = event.data.contentType; // نوع الملف الأصلي (المضمون 100%)

  // أنواع الملفات المسموحة
  const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp", "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-m4a", "audio/mp4", "audio/aac", "audio/ogg"];

  if (!contentType || !allowedTypes.some((type) => contentType.startsWith(type))) {
    return console.log(`⚠️ تم تجاهل الملف: ${filePath} (النوع: ${contentType})`);
  }

  const pathParts = filePath.split("/");
  if (pathParts.length < 3 || pathParts[0] !== "teachers") {
    return console.log("⚠️ المسار غير صحيح.");
  }
  const teacherId = pathParts[1];
  const fileName = path.basename(filePath);

  console.log(`📥 معالجة ملف: ${fileName} (النوع: ${contentType})`);

  const bucket = getStorage().bucket(fileBucket);
  const tempFilePath = path.join(os.tmpdir(), fileName);

  await bucket.file(filePath).download({ destination: tempFilePath });

  try {
    console.log("⬆️ جاري الرفع لـ Gemini...");

    // رفع الملف
    const uploadResult = await fileManager.uploadFile(tempFilePath, {
      mimeType: contentType,
      displayName: fileName,
    });

    const fileUri = uploadResult.file.uri;
    console.log(`✅ تم الرفع: ${fileUri}`);

    // 🔥 التعديل الجوهري: حفظ الرابط + النوع في أوبجيكت
    const fileDataObj = {
      uri: fileUri,
      mimeType: contentType, // بنحفظ النوع عشان نستخدمه بعدين
      fileName: fileName,
    };

    // 5. حفظ البيانات في Firestore
    await db.collection("teachers").doc(teacherId).set({
      lastUpdate: new Date(),
      knowledgeBase: FieldValue.arrayUnion(fileDataObj),
    }, { merge: true });

    console.log("💾 تم تحديث الداتابيز (URI + Type) بنجاح!");
  } catch (error) {
    console.error("❌ خطأ أثناء المعالجة:", error);
  } finally {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
});

/**
 * 2️⃣ الجزء الثاني: شات بوت الواتساب (Twilio) - تم التعديل لقراءة النوع + التقسيم ✅
 */
exports.whatsappWebhook = onRequest(async (req, res) => {
  const incomingMsg = req.body.Body.trim();
  const senderNumber = req.body.From;

  console.log(`🔥 رسالة من ${senderNumber}: ${incomingMsg}`);

  try {
    const userDoc = await db.collection("bot_users").doc(senderNumber).get();

    // 🅰️ الطالب جديد
    if (!userDoc.exists) {
      const potentialTeacherDoc = await db.collection("teachers").doc(incomingMsg).get();

      if (potentialTeacherDoc.exists) {
        await db.collection("bot_users").doc(senderNumber).set({
          teacherId: incomingMsg,
          joinedAt: new Date(),
          studentName: "Unknown Student",
        });

        const teacherName = potentialTeacherDoc.data().name || "المدرس";
        await client.messages.create({
          body: `✅ تم تفعيل المساعد الذكي بنجاح مع مستر ${teacherName}!\n\nأنا جاهز الآن لمساعدتك في المذاكرة طوال الوقت. يمكنك سؤالي عن أي تفصيلة في المنهج، وسأجيبك فوراً من خلال الملازم، صور السبورة، أو الشرح الصوتي المتاح. 📚🎤\n\nيلا نبدأ.. إيه أول سؤال عندك؟ 🚀`,
          from: "whatsapp:+14155238886",
          to: senderNumber,
        });
      } else {
        await client.messages.create({
          body: `مرحباً بك في Spot AI! 🤖✨\n\nيسعدنا انضمامك لنخبة الطلاب الأذكياء. لكي نقوم بتفعيل مساعدك الشخصي وتجهيز المناهج الخاصة بك، يرجى إرسال *كود المعلم* (رقم هاتفه) الآن.\n\nمستعدون لبدء رحلة التفوق معك! 🚀`,
          mediaUrl: ["https://firebasestorage.googleapis.com/v0/b/learnaria-483e7.firebasestorage.app/o/public%2Flearnaria_logo.png?alt=media&token=6b2f9f1d-ebe9-4c2f-9866-65c85c1f26cc"],
          from: "whatsapp:+14155238886",
          to: senderNumber,
        });
      }
      return res.status(200).send("DONE");
    }

    // 🅱️ الطالب مسجل
    const teacherId = userDoc.data().teacherId;

    if (incomingMsg.toLowerCase() === "خروج" || incomingMsg.toLowerCase() === "exit") {
      await db.collection("bot_users").doc(senderNumber).delete();
      await client.messages.create({
        body: `تم تسجيل الخروج.`,
        from: "whatsapp:+14155238886",
        to: senderNumber,
      });
      return res.status(200).send("DONE");
    }

    const teacherDoc = await db.collection("teachers").doc(teacherId).get();
    let promptParts = [];

    if (teacherDoc.exists && teacherDoc.data().knowledgeBase) {
      const knowledgeItems = teacherDoc.data().knowledgeBase;
      console.log(`📚 المدرس (${teacherId}) عنده ${knowledgeItems.length} ملفات.`);

      promptParts = knowledgeItems.map((item) => {
        if (typeof item === "object" && item.uri) {
          return {
            fileData: {
              mimeType: item.mimeType || "application/pdf",
              fileUri: item.uri,
            },
          };
        }
        return {
          fileData: {
            mimeType: "application/pdf",
            fileUri: item,
          },
        };
      });
    }

    const textPrompt = `
    أنت مساعد ذكي للطلاب. جاوب بناءً *فقط* على الملفات المرفقة.
    حاول أن تكون إجابتك مركزة ومختصرة قدر الإمكان (أقل من 1000 حرف).
    سؤال الطالب: ${incomingMsg}
    `;
    promptParts.push({ text: textPrompt });

    if (promptParts.length === 1) {
      await client.messages.create({
        body: "المدرس لسه مارفعش ملازم للمراجعة. 🕒",
        from: "whatsapp:+14155238886",
        to: senderNumber,
      });
      return res.status(200).send("NO_FILES");
    }

    const result = await model.generateContent(promptParts);
    const responseText = result.response.text();

    // 🔥 تقسيم الرسائل الطويلة (Chunking)
    const maxChunkSize = 1500;
    if (responseText.length <= maxChunkSize) {
      await client.messages.create({
        body: responseText,
        from: "whatsapp:+14155238886",
        to: senderNumber,
      });
    } else {
      console.log(`⚠️ الرسالة طويلة (${responseText.length} حرف). جاري التقسيم...`);
      for (let i = 0; i < responseText.length; i += maxChunkSize) {
        const chunk = responseText.substring(i, i + maxChunkSize);
        await client.messages.create({
          body: chunk,
          from: "whatsapp:+14155238886",
          to: senderNumber,
        });
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    res.status(200).send("DONE");
  } catch (error) {
    console.error("❌ Error:", error);
    try {
      await client.messages.create({
        body: "معلش، حصل خطأ تقني بسيط. حاول تسأل تاني.",
        from: "whatsapp:+14155238886",
        to: senderNumber,
      });
    } catch (e) {
      console.error("Could not send error msg");
    }
    res.status(500).send(error.toString());
  }
});

/**
 * 🧠 دالة الشات الذكي (تدعم الامتحانات + الصور + الملفات)
 */
exports.chatWithSpot = onCall({
  cors: true,
  timeoutSeconds: 300,
  memory: "1GiB",
}, async (request) => {
  try {
    const { message, teacherId, role, image } = request.data;
    let modelInstance;
    let result;
    let promptParts = [];

    const safetySettings = [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
    ];

    // ── 1. Load teacher's knowledge base (uploaded files) ──────────────────
    if (teacherId) {
      const teacherDoc = await db.collection("teachers").doc(teacherId).get();
      if (teacherDoc.exists && teacherDoc.data().knowledgeBase) {
        promptParts = teacherDoc.data().knowledgeBase.map((item) => ({
          fileData: { mimeType: item.mimeType || "application/pdf", fileUri: item.uri || item },
        }));
      }
    }

    // ── 2. Attach image if provided (for grading) ──────────────────────────
    if (image) {
      promptParts.push({ inlineData: { mimeType: "image/jpeg", data: image } });
    }

    // ── 3. Detect intent: exam OR note OR chat ─────────────────────────────
    const msgLower = (message || "").toLowerCase();
    const isExamRequest =
      msgLower.includes("امتحان") || msgLower.includes("اختبار") ||
      msgLower.includes("أسئلة") || msgLower.includes("quiz") || msgLower.includes("exam");
    const isNoteRequest =
      msgLower.includes("مذكرة") || msgLower.includes("ملخص") ||
      msgLower.includes("شرح") || msgLower.includes("note") || msgLower.includes("summary");

    // ── 4. Build the system instruction based on intent ────────────────────
    let systemInstruction = "";

    if (role === "teacher" && isExamRequest) {
      systemInstruction = `
You are "Spot", a precision exam extraction engine. Your ONLY job is to copy and transfer content VERBATIM from the attached files — nothing else.

🚨 CRITICAL RULES (RED ALERT — non-negotiable):
1. It is STRICTLY FORBIDDEN to invent, compose, or infer any question or answer that does not exist word-for-word in the attached file.
2. When the teacher requests questions, search the attached file and extract sentences and problems EXACTLY as written — character for character.
3. Transfer all mathematical, geometric, and physics formulas with the exact same symbols and numbers. Do NOT simplify, rephrase, or modify them in any way.
4. All equations and formulas MUST be wrapped in LaTeX notation: $...$ for inline equations or $$...$$ for standalone ones. Use strict LaTeX syntax (e.g., \\sqrt, \\frac, \\times).

🌍 Language rules:
- If the source content is in Arabic: keep Arabic variable symbols (س، ص، ع) and Arabic numerals (١، ٢، ٣).
- If the source content is in English: use Latin symbols (x, y, z) and Western numerals (1, 2, 3).

📋 Output format (JSON ONLY — no extra text, no markdown fences):
{
  "isExam": true,
  "title": "Exam title extracted from the file",
  "subject": "Subject name",
  "grade": "Grade/Class",
  "difficulty": "easy / medium / hard",
  "totalMarks": 30,
  "duration": "45 minutes",
  "questions": [
    {
      "q": "The question text copied verbatim from the source material",
      "diagram": "SVG code for any diagram if present in source, otherwise leave empty string",
      "type": "mcq | tf | essay",
      "marks": 2,
      "options": ["A", "B", "C", "D"],
      "answer": "The model answer based strictly on the source file"
    }
  ]
}`;
    } else if (role === "teacher" && isNoteRequest) {
      systemInstruction = `
You are "Spot", an expert educational content specialist. Your task is to generate professional, comprehensive study notes and summaries from the attached material.

🎯 Your mission: Produce a well-structured, detailed study note based ONLY on the provided content.

📋 Formatting rules (follow strictly):
1. Start with a main title: # Note Title
2. Use ## for major sections and ### for subsections.
3. Use bullet points for explanations: - point
4. Write all equations in LaTeX wrapped in dollar signs: $equation$
5. Before every law or formula, write "**📌 Law:**" followed by the LaTeX expression.
6. Before every example, write "**💡 Example:**"
7. Before every important note or warning, write "**⚠️ Note:**"
8. Do NOT include any URLs or external links in your response.
9. Respond in Arabic for all explanations, but keep scientific symbols in their original form (Latin or Arabic as found in the source).
      `;
    } else if (role === "teacher") {
      systemInstruction = `
You are "Spot", a smart AI assistant for teachers. Communicate in a friendly yet professional tone.
- Answer the teacher's questions by referencing the attached files whenever they are available.
- Write all mathematical equations using LaTeX notation wrapped in dollar signs: $equation$
- Do NOT include any URLs or external links in your response.
- Keep responses concise, accurate, and directly useful to the teacher.
      `;
    } else {
      systemInstruction = `You are a smart, friendly private tutor. Help the student understand the material using the attached files whenever available. Explain concepts in a simple, engaging, and encouraging way. Use clear examples and break down complex ideas step by step. Write equations in LaTeX: $equation$`;
    }

    // The user message
    if (message) promptParts.push({ text: `Teacher's request: ${message}` });

    // ── Guard: exam requested but no files attached ─────────────────────────
    const hasFiles = promptParts.some((p) => p.fileData);
    if (role === "teacher" && isExamRequest && !hasFiles) {
      return {
        response: JSON.stringify({ isExam: true, error: true, message: "لا توجد ملفات مرفقة. يرجى رفع الملازم أولاً قبل طلب الامتحان." }),
        type: "exam",
        teacherName: "",
      };
    }

    // ── 5. Call Gemini (systemInstruction passed as dedicated field) ─────────
    try {
      modelInstance = genAI.getGenerativeModel({
        model: "gemini-2.5-pro",
        systemInstruction: systemInstruction,   // ✅ dedicated system instruction — not a chat message
        generationConfig: {
          temperature: 0.1,  // low temp = no hallucinations
        },
      });

      result = await modelInstance.generateContent({
        contents: [{ role: "user", parts: promptParts }],
        safetySettings,
      });
    } catch (e) {
      if (e.message && (e.message.includes("403") || e.message.includes("permission") || e.message.includes("not exist"))) {
        console.warn("⚠️ File API Error (stale URIs). Retrying text-only...");
        const textOnly = promptParts.filter((p) => p.text);
        result = await modelInstance.generateContent({
          contents: [{ role: "user", parts: textOnly }],
          safetySettings,
        });
      } else {
        throw e;
      }
    }

    // ── 6. Detect teacher name ─────────────────────────────────────────────
    let teacherName = "";
    if (teacherId) {
      try {
        const tDoc = await getFirestore().collection("teachers").doc(teacherId).get();
        if (tDoc.exists) {
          const tData = tDoc.data();
          teacherName = tData.name || tData.fullName || "";
        }
      } catch (e) { console.error("Error fetching teacher name:", e); }
    }

    // ── 7. Return raw response ──────────────────────────────────────────────
    const aiResponse = result.response.text();

    // Detect response type
    let responseType = "chat";
    if (aiResponse.includes('"isExam": true') || aiResponse.includes('"isExam":true')) {
      responseType = "exam";
    } else if (aiResponse.includes("## ") || aiResponse.includes("# ")) {
      responseType = "note";
    }

    return { response: aiResponse, type: responseType, teacherName: teacherName };

  } catch (error) {
    console.error("Chat Error:", error);
    return { response: "معلش، حصل خطأ بسيط في السيرفر. جرب تاني!", type: "chat" };
  }
});


/**
 * دالة مساعدة لتوليد PDF ورفعه لـ Storage (محتفظ بها كنسخة احتياطية)
 */




async function generateAndUploadPDF(content, teacherId) {
  // 0. جلب بيانات المدرس للاسم
  let teacherName = "Spot AI Assistant";
  try {
    const tDoc = await getFirestore().collection("teachers").doc(teacherId).get();
    if (tDoc.exists && tDoc.data().fullName) teacherName = tDoc.data().fullName;
  } catch (e) {
    console.error("Fetch teacher name error:", e);
  }

  // 1. إعداد الخط العربي (تحميله لو مش موجود)
  const fontPath = path.join(os.tmpdir(), "Almarai-Regular.ttf");
  if (!fs.existsSync(fontPath)) {
    try {
      console.log("📥 Downloading Arabic font...");
      const response = await axios.get("https://github.com/google/fonts/raw/main/ofl/almarai/Almarai-Regular.ttf", { responseType: "arraybuffer" });
      fs.writeFileSync(fontPath, Buffer.from(response.data));
    } catch (e) {
      console.error("Font Download Error:", e);
    }
  }

  // 1.5 دالة مساعدة لتنسيق العربي والرياضيات
  const fixMath = (text) => {
    if (!text) return "";
    let t = text;
    // تحويل الـ LaTeX الأساسي لرموز Unicode مفهومة
    t = t.replace(/\\\\sqrt\{([^}]+)\}/g, "√$1"); // جذر
    t = t.replace(/\\\\sqrt\[([^\]]+)\]\{([^}]+)\}/g, "($2)√$1"); // جذر تكعيبي مثلاً
    t = t.replace(/\^\{?([-0-9a-zA-Z]+)\}?/g, (match, p1) => {
      const supers = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻" };
      return p1.split("").map(c => supers[c] || "^" + c).join("");
    });
    t = t.replace(/\\\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1/$2)"); // كسر
    t = t.replace(/\\\\circ/g, "°"); // درجة
    t = t.replace(/\\\\times/g, "×"); // ضرب
    t = t.replace(/\\\\div/g, "÷"); // قسمة
    t = t.replace(/\\\\pm/g, "±"); // موجب أو سالب
    t = t.replace(/\$/g, ""); // حذف علامات الدولار
    return t;
  };

  const fixArabic = (text) => {
    if (!text) return "";
    const mathFixed = fixMath(text);
    const reshaped = arabicReshaper.reshape(mathFixed);
    return bidi.getReorderedText(reshaped);
  };

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const fileName = `generated_${Date.now()}.pdf`;
      const bucket = getStorage().bucket();
      const file = bucket.file(`teachers/${teacherId}/generated/${fileName}`);

      const stream = file.createWriteStream({
        metadata: { contentType: "application/pdf" },
      });

      doc.pipe(stream);

      // استخدام الخط لو اتحمل
      if (fs.existsSync(fontPath)) {
        doc.font(fontPath);
      }

      doc.fontSize(22).text(fixArabic("Spot AI - مستند مولد"), { align: "center" });
      doc.moveDown();

      if (content.includes("\"isExam\": true")) {
        try {
          const cleanJson = content.replace(/```json/g, "").replace(/```/g, "").trim();
          const exam = JSON.parse(cleanJson);
          doc.fontSize(18).text(fixArabic(exam.title || "امتحان"), { align: "right" });
          doc.moveDown();

          exam.questions.forEach((q, i) => {
            doc.fontSize(14).text(fixArabic(`${i + 1}. ${q.q}`), { align: "right" });

            // 🏷️ إضافة الرسم الهندسي لو موجود
            if (q.diagram) {
              try {
                SVGtoPDF(doc, q.diagram, 50, doc.y, { width: 150, preserveAspectRatio: "xMinYMin meet" });
                doc.moveDown(5); // مسافة بعد الرسمة
              } catch (svgErr) {
                console.error("SVG Rendering Error:", svgErr);
              }
            }

            if (q.options) {
              q.options.forEach((opt, j) => {
                doc.fontSize(12).text(fixArabic(`   [ ] ${opt}`), { align: "right" });
              });
            }
            doc.moveDown();
          });
        } catch (e) {
          doc.fontSize(12).text(fixArabic(content), { align: "right" });
        }
      } else {
        doc.fontSize(12).text(fixArabic(content), { align: "right" });
      }

      // 👣 إضافة الفوتر (اسم المدرس)
      doc.moveDown(2);
      doc.fontSize(10).fillColor("#777777");
      doc.text("--------------------------------------------------", { align: "center" });
      doc.text(fixArabic(`مقدم من: ${teacherName}`), { align: "center" });
      doc.text("Generated by Spot AI ✨ Enjoy 🤓", { align: "center" });

      doc.end();

      stream.on("finish", async () => {
        try {
          await file.makePublic();
          const publicUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;
          resolve(publicUrl);
        } catch (e) {
          console.error("Make Public Error:", e);
          resolve(`https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(file.name)}?alt=media`);
        }
      });

      stream.on("error", (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

// ============================================================
// 🌟 دالة إشعار الحضور (مع فحص الواجب تلقائياً)
// ============================================================
exports.notifyOnPresence = onDocumentWritten(
  "teachers/{teacherId}/groups/{groupId}/dailyAttendance/{date}",
  async (event) => {
    // 1. التحقق من صحة البيانات
    const snapAfter = event.data.after;
    const snapBefore = event.data.before;

    if (!snapAfter.exists) return; // تم الحذف، لا نفعل شيئاً

    const afterData = snapAfter.data();
    const beforeData = snapBefore.exists ? snapBefore.data() : { records: [] };

    const afterRecords = afterData.records || [];
    const beforeRecords = beforeData.records || [];

    // 2. استخراج الطلاب الذين تم تسجيل حضورهم *الآن* (الجدد فقط)
    // (عشان لو عدلت طالب تاني، منبعتش للي اتسجل قبل كده مرة تانية)
    const newlyPresentStudents = afterRecords.filter((rAfter) => {
      const isPresentNow = rAfter.status === "present";
      // نتأكد إنه ماكنش حاضر قبل التعديل ده
      const wasPresent = beforeRecords.some((rBefore) =>
        rBefore.studentId === rAfter.studentId && rBefore.status === "present",
      );
      return isPresentNow && !wasPresent;
    });

    if (newlyPresentStudents.length === 0) return;

    // ✅ حفظ وقت أول "سكان" لو مش موجود (عشان نحسب الساعة بالضبط من أول واحد)
    if (!afterData.firstScanAt) {
      await snapAfter.ref.update({ firstScanAt: admin.firestore.FieldValue.serverTimestamp() });
    }

    const teacherId = event.params.teacherId;
    const groupId = event.params.groupId;
    const date = event.params.date;

    // 3. جلب بيانات مساعدة (اسم المادة + ملف الواجب لهذا اليوم)
    const subjectName = await getTeacherSubject(teacherId);

    // بنحاول نجيب ملف الواجب بنفس الـ ID اللي بنعمله في الـ Frontend
    // ID Format: {groupId}_HW_{date}
    const hwId = `${groupId}_HW_${date}`;
    const hwDoc = await admin.firestore().doc(`teachers/${teacherId}/groups/${groupId}/assignments/${hwId}`).get();

    let hwScores = {};
    let hasHomeworkToday = false;
    let homeworkName = "الواجب";

    if (hwDoc.exists) {
      hasHomeworkToday = true;
      const hwData = hwDoc.data();
      hwScores = hwData.scores || {};
      homeworkName = hwData.name || "الواجب";
    }

    // 4. إرسال الإشعارات لكل طالب تم تسجيله
    const notifications = newlyPresentStudents.map(async (record) => {
      const studentId = record.studentId;

      // جلب بيانات الطالب (الاسم + التوكن)
      const sDoc = await admin.firestore().doc(`teachers/${teacherId}/groups/${groupId}/students/${studentId}`).get();
      if (!sDoc.exists) return;

      const sData = sDoc.data();

      // 5. تحديد نص الرسالة بناءً على الواجب
      let title = "تم تسجيل الحضور ✅";
      let body = `تم تسجيل حضور الطالب ${sData.name} اليوم في حصة ${subjectName}.`;

      if (hasHomeworkToday) {
        const studentHw = hwScores[studentId];
        // التحقق: هل سلم الواجب؟ (submitted = true)
        const isSubmitted = studentHw && studentHw.submitted === true;

        if (isSubmitted) {
          title = "حضور + تسليم واجب 🌟";
          body = `ممتاز! حضر الطالب ${sData.name} حصة ${subjectName} وقام بتسليم "${homeworkName}" بنجاح.`;
        } else {
          title = "تنبيه واجب ⚠️";
          body = `تم تسجيل حضور ${sData.name} في حصة ${subjectName}، ولكن لم يتم تسليم "${homeworkName}".`;
        }
      }

      const payload = {
        notification: {
          title: title,
          body: body,
        },
        data: {
          "screen": "attendance",
          "date": date,
          "studentId": studentId,
        },
      };

      // استخدام الدالة المساعدة الموجودة في ملفك لإرسال الإشعار
      return sendNotificationToParent(sData, payload, "notifyOnPresence", studentId, teacherId, groupId);
    });

    await Promise.all(notifications);
  },
);

// ===================================================================
// 6. الإرسال التلقائي للغياب (تحسين: بعد ساعة من البداية + ربع ساعة ركود)
// ===================================================================
exports.autoAbsenceReminder = onSchedule({
  schedule: "*/15 * * * *", // تشتغل كل 15 دقيقة
  timeZone: "Africa/Cairo",
}, async (event) => {
  const now = new Date();

  // 1. حساب تاريخ "النهاردة" و "امبارح" في القاهرة لضمان التقاط الحصص المتأخرة
  const dateOptions = { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" };
  const todayStr = new Intl.DateTimeFormat("en-CA", dateOptions).format(now);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = new Intl.DateTimeFormat("en-CA", dateOptions).format(yesterday);

  try {
    // 2. جلب ملفات الحضور النشطة (امبارح والنهاردة)
    const dailyAttSnap = await admin.firestore()
      .collectionGroup("dailyAttendance")
      .where("date", "in", [todayStr, yesterdayStr])
      .get();

    if (dailyAttSnap.empty) return;

    for (const attDoc of dailyAttSnap.docs) {
      const attendanceData = attDoc.data();

      // 3. تحديد "وقت البداية" (أول سكان أفضل، لو مش موجود نستخدم وقت الإنشاء)
      const createTime = attDoc.createTime.toDate();
      const firstScanAt = attendanceData.firstScanAt ? (attendanceData.firstScanAt.toDate ? attendanceData.firstScanAt.toDate() : new Date(attendanceData.firstScanAt)) : createTime;
      const updateTime = attDoc.updateTime.toDate();

      const minutesSinceStart = (now.getTime() - firstScanAt.getTime()) / (1000 * 60);
      const minutesSinceLastUpdate = (now.getTime() - updateTime.getTime()) / (1000 * 60);

      const presentStudentIds = new Set(
        (attendanceData.records || [])
          .filter((r) => r.status === "present")
          .map((r) => r.studentId),
      );

      // --- الشروط الرسمية (الإنتاج) ---
      // أ- عدى 60 دقيقة على الأقل من أول سكان
      // ب- المدرس ملمسش القائمة بقاله 20 دقيقة (خلص رصد)
      if (minutesSinceStart >= 60 && minutesSinceLastUpdate >= 20 && presentStudentIds.size > 0) {
        // استخراج المسار
        const pathSegments = attDoc.ref.path.split("/");
        if (pathSegments.length < 5) continue;

        const teacherId = pathSegments[1];
        const groupId = pathSegments[3];
        const groupRef = admin.firestore().doc(`teachers/${teacherId}/groups/${groupId}`);

        // 4. التأكد إن الغياب متبعتش (باستخدام تاريخ الملف نفسه مش "النهاردة")
        const docDate = attendanceData.date || pathSegments[5];
        const metaRef = groupRef.collection("attendanceMeta").doc(docDate);
        const metaDoc = await metaRef.get();

        if (metaDoc.exists && metaDoc.data().absenceSent === true) {
          continue;
        }

        const subjectName = await getTeacherSubject(teacherId);

        // 5. جلب كل الطلاب والبدء في الإرسال
        const studentsSnap = await groupRef.collection("students").get();
        const promises = [];
        let sentCount = 0;

        studentsSnap.docs.forEach((studentDoc) => {
          if (!presentStudentIds.has(studentDoc.id)) {
            const student = studentDoc.data();
            const payload = {
              notification: {
                title: "تنبيه غياب ❌",
                body: `نحيطكم علماً بأن الطالب ${student.name} تغيب عن حصة اليوم (${docDate}) في مادة ${subjectName}.`,
              },
              data: {
                type: "absence_alert",
                studentId: studentDoc.id,
                date: docDate,
              },
            };
            promises.push(
              sendNotificationToParent(student, payload, "AutoAbsence", studentDoc.id, teacherId, groupId),
            );
            sentCount++;
          }
        });

        await Promise.all(promises);

        // 6. توثيق الإرسال لمنع التكرار
        await metaRef.set({ absenceSent: true, sentAt: now, auto: true }, { merge: true });
        console.log(`✅ Auto Absence Sent for ${teacherId}/${groupId}, count: ${sentCount}, date: ${docDate}`);
      }
    }
  } catch (error) {
    console.error("Auto Absence Error:", error);
  }
});
