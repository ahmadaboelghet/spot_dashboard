/* eslint-disable max-len */
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { admin, db, formatTime12Hour } = require("./config");
const { sendNotificationToParent } = require("./notifications");

/**
 * 1. تذكير بموعد الحصة قبل 30 دقيقة (محسنة باستعلام مفهرس وكاش للمواد)
 */
const classReminder = onSchedule({
  schedule: "*/15 * * * *",
  timeZone: "Africa/Cairo",
}, async (event) => {
  const now = new Date();
  const cairoTimeStr = now.toLocaleString("en-US", { timeZone: "Africa/Cairo" });
  const cairoDate = new Date(cairoTimeStr);

  const targetDate = new Date(cairoDate.getTime() + 30 * 60000);
  const targetHour = targetDate.getHours();
  const targetMinute = targetDate.getMinutes();
  const dayIndex = targetDate.getDay();

  console.log(`Checking classes for Day: ${dayIndex}, Time around: ${targetHour}:${targetMinute}`);

  // Query only recurring schedules that repeat on today's dayIndex across all groups
  const schedulesSnap = await db.collectionGroup("recurringSchedules")
    .where("days", "array-contains", dayIndex)
    .get();

  if (schedulesSnap.empty) {
    console.log("No recurring schedules for today.");
    return;
  }

  const teacherSubjectCache = new Map();
  async function getCachedSubject(tId) {
    if (teacherSubjectCache.has(tId)) return teacherSubjectCache.get(tId);
    try {
      const tDoc = await db.collection("teachers").doc(tId).get();
      const subj = tDoc.data()?.profile?.teacherSubject || tDoc.data()?.subject || "المادة";
      teacherSubjectCache.set(tId, subj);
      return subj;
    } catch (e) {
      return "المادة";
    }
  }

  const matchPromises = [];

  for (const schedDoc of schedulesSnap.docs) {
    const sched = schedDoc.data();
    if (!sched.time) continue;

    const [hStr, mStr] = sched.time.split(":");
    const schedHour = parseInt(hStr, 10);
    const schedMinute = parseInt(mStr, 10);

    const isTimeMatch = (schedHour === targetHour) && (Math.abs(schedMinute - targetMinute) <= 7);
    if (!isTimeMatch) continue;

    // Parse path: teachers/{teacherId}/groups/{groupId}/recurringSchedules/{scheduleId}
    const pathParts = schedDoc.ref.path.split("/");
    if (pathParts.length < 4 || pathParts[0] !== "teachers") continue;
    const teacherId = pathParts[1];
    const groupId = pathParts[3];

    matchPromises.push((async () => {
      const subjectName = await getCachedSubject(teacherId);
      const studentsSnap = await db
        .collection("teachers")
        .doc(teacherId)
        .collection("groups")
        .doc(groupId)
        .collection("students")
        .get();

      if (studentsSnap.empty) return;

      const notifications = studentsSnap.docs.map(async (studentDoc) => {
        const studentData = studentDoc.data();
        const payload = {
          notification: {
            title: "اقتراب موعد الدرس",
            body: `تذكير: درس ${subjectName} للطالب ${studentData.name} يبدأ بعد 30 دقيقة (الساعة ${formatTime12Hour(sched.time)}).`,
          },
          data: { "screen": "schedule" },
        };
        return sendNotificationToParent(studentData, payload, "classReminder", studentDoc.id, teacherId, groupId);
      });
      await Promise.all(notifications);
    })());
  }

  await Promise.all(matchPromises);
});

/**
 * 2. تذكير المصروفات (النظام الملح - يعمل كل يومين الساعة 2 ظهراً بتزامن محكوم)
 */
const paymentReminder = onSchedule({
  schedule: "0 14 * * *",
  timeZone: "Africa/Cairo",
}, async (event) => {
  const now = new Date();
  const cairoTimeStr = now.toLocaleString("en-US", { timeZone: "Africa/Cairo" });
  const cairoDate = new Date(cairoTimeStr);

  const currentDay = cairoDate.getDate();

  if (currentDay % 2 === 0) {
    console.log("اليوم زوجي - راحة من التنبيهات.");
    return;
  }

  let targetDate = new Date(cairoDate);
  let isOverdue = false;

  if (currentDay >= 25) {
    isOverdue = false;
  } else {
    targetDate.setMonth(targetDate.getMonth() - 1);
    isOverdue = true;
  }

  const targetMonth = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}`;
  const targetMonthNum = parseInt(targetMonth.split("-")[1], 10);
  if (targetMonthNum === 6 || targetMonthNum === 7) {
    console.log(`Skipping payment reminders for summer vacation month: ${targetMonth}`);
    return;
  }
  console.log(`Checking Payments for: ${targetMonth} (Overdue: ${isOverdue})`);

  const teachersSnap = await db.collection("teachers").get();
  if (teachersSnap.empty) return;

  const groupTasks = [];

  for (const teacherDoc of teachersSnap.docs) {
    const tData = teacherDoc.data() || {};
    const subjectName = tData.profile?.teacherSubject || tData.subject || "المادة";
    const groupsSnap = await teacherDoc.ref.collection("groups").get();

    for (const groupDoc of groupsSnap.docs) {
      groupTasks.push({
        teacherId: teacherDoc.id,
        groupDoc,
        subjectName,
      });
    }
  }

  // معالجة المجموعات بدفعات متزامنة (Concurrency = 10) لتسريع التنفيذ دون إنهاك الموارد
  const BATCH_SIZE = 10;
  for (let i = 0; i < groupTasks.length; i += BATCH_SIZE) {
    const batch = groupTasks.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async ({ teacherId, groupDoc, subjectName }) => {
      const studentsSnap = await groupDoc.ref.collection("students").get();
      if (studentsSnap.empty) return;

      const paymentDoc = await groupDoc.ref.collection("payments").doc(targetMonth).get();
      let paidStudentIds = [];

      if (paymentDoc.exists) {
        const records = paymentDoc.data().records || [];
        paidStudentIds = records.filter((r) => r.paid === true).map((r) => r.studentId);
      }

      const notifications = studentsSnap.docs.map(async (studentDoc) => {
        if (!paidStudentIds.includes(studentDoc.id)) {
          const studentData = studentDoc.data();
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
          return sendNotificationToParent(studentData, payload, "paymentReminder", studentDoc.id, teacherId, groupDoc.id);
        }
      });
      await Promise.all(notifications);
    }));
  }
});

/**
 * 3. تنظيف سجلات السكان (حذف الأقدم من 7 أيام على دفعات تصل إلى 10,000 سجل)
 */
const cleanupScanLogs = onSchedule({
  schedule: "0 2 * * *",
  timeZone: "Africa/Cairo",
}, async (event) => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoffTimestamp = admin.firestore.Timestamp.fromDate(sevenDaysAgo);

  let totalDeleted = 0;
  const MAX_BATCHES = 20;
  const BATCH_LIMIT = 500;

  for (let b = 0; b < MAX_BATCHES; b++) {
    const snapshot = await db.collection("scanLogs")
      .where("timestamp", "<", cutoffTimestamp)
      .limit(BATCH_LIMIT)
      .get();

    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    totalDeleted += snapshot.docs.length;
    console.log(`cleanupScanLogs: Batch ${b + 1} deleted ${snapshot.docs.length} logs.`);

    if (snapshot.docs.length < BATCH_LIMIT) break;
  }

  console.log(`cleanupScanLogs: Successfully deleted ${totalDeleted} old scan logs.`);
});

module.exports = {
  classReminder,
  paymentReminder,
  cleanupScanLogs,
};
