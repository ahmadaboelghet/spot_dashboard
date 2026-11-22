/* eslint-disable max-len */
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const {
  admin,
  db,
  FieldValue,
  PARENT_APP_BASE_URL,
  verifyTeacherOrAdmin,
  getTeacherSubject,
  formatTime12Hour,
} = require("./config");

/**
 * Send notification to parent (supports multiple teachers, fallback paths, and token cleanup).
 * @param {object} studentData
 * @param {object} payload
 * @param {string} context
 * @param {string} studentId
 * @param {string} teacherId
 * @param {string} groupId
 * @return {Promise<{ sent: boolean, successCount: number }>}
 */
async function sendNotificationToParent(studentData, payload, context, studentId, teacherId = null, groupId = null) {
  const tokensToSend = [];

  function collectToken(data) {
    if (!data) return;
    if (typeof data === "string" && data.trim() !== "") {
      tokensToSend.push(data.trim());
    } else if (Array.isArray(data)) {
      data.forEach((t) => {
        if (typeof t === "string" && t.trim() !== "") {
          tokensToSend.push(t.trim());
        }
      });
    }
  }

  // 1. Direct student profile tokens
  collectToken(studentData.parentFcmToken);
  collectToken(studentData.parentFcmTokens);

  // 2. Global parents collection by phone
  if (studentData.parentPhoneNumber) {
    try {
      const cleanPhone = studentData.parentPhoneNumber.replace(/\s+/g, "").trim();
      let phoneWithPlus = cleanPhone;
      let phoneWithZero = cleanPhone;
      if (cleanPhone.startsWith("+20")) {
        phoneWithZero = "0" + cleanPhone.substring(3);
      } else if (cleanPhone.startsWith("0")) {
        phoneWithPlus = "+20" + cleanPhone.substring(1);
      } else {
        phoneWithPlus = "+20" + cleanPhone;
        phoneWithZero = "0" + cleanPhone;
      }

      const parentDoc1 = await db.collection("parents").doc(phoneWithZero).get();
      if (parentDoc1.exists) {
        collectToken(parentDoc1.data().fcmToken);
        collectToken(parentDoc1.data().fcmTokens);
      }

      if (phoneWithPlus !== phoneWithZero) {
        const parentDoc2 = await db.collection("parents").doc(phoneWithPlus).get();
        if (parentDoc2.exists) {
          collectToken(parentDoc2.data().fcmToken);
          collectToken(parentDoc2.data().fcmTokens);
        }
      }
    } catch (e) {
      console.error(`${context}: Error fetching global parent token:`, e);
    }
  }

  // 3. Mobile app users collection
  const parentUserId = studentData.parentUserId;
  const parentPhoneNumber = studentData.parentPhoneNumber;
  let parentUserDoc;

  if (parentUserId) {
    try {
      const doc = await db.collection("users").doc(parentUserId).get();
      if (doc.exists) parentUserDoc = doc;
    } catch (error) {
      console.error(`${context}: Error fetching parent by ID:`, error);
    }
  }

  if (!parentUserDoc && parentPhoneNumber) {
    try {
      const cleanPhone = parentPhoneNumber.replace(/\s+/g, "").trim();
      let phoneWithPlus = cleanPhone;
      let phoneWithZero = cleanPhone;
      if (cleanPhone.startsWith("+20")) {
        phoneWithZero = "0" + cleanPhone.substring(3);
      } else if (cleanPhone.startsWith("0")) {
        phoneWithPlus = "+20" + cleanPhone.substring(1);
      } else {
        phoneWithPlus = "+20" + cleanPhone;
        phoneWithZero = "0" + cleanPhone;
      }

      const q = await db.collection("users")
        .where("phoneNumber", "in", [phoneWithZero, phoneWithPlus]).limit(1).get();
      if (!q.empty) parentUserDoc = q.docs[0];
    } catch (error) {
      console.error(`${context}: Error querying parent by phone:`, error);
    }
  }

  if (parentUserDoc) {
    collectToken(parentUserDoc.data().fcmToken);
    collectToken(parentUserDoc.data().fcmTokens);
  }

  const uniqueTokens = [...new Set(tokensToSend)].filter((t) => typeof t === "string" && t.trim() !== "");

  const notificationRecord = {
    title: payload.notification.title,
    body: payload.notification.body,
    data: payload.data || {},
    sentAt: FieldValue.serverTimestamp(),
    context: context,
    status: "failed",
  };

  if (uniqueTokens.length > 0) {
    const cleanPhone = studentData.parentPhoneNumber ? studentData.parentPhoneNumber.replace(/\s+/g, "").trim() : "";
    const parentAppLink = `${PARENT_APP_BASE_URL}?p=${cleanPhone}`;

    const stringData = {};
    if (payload.data) {
      Object.keys(payload.data).forEach((key) => {
        stringData[key] = String(payload.data[key]);
      });
    }

    const message = {
      notification: {
        title: payload.notification.title,
        body: payload.notification.body,
      },
      data: stringData,
      webpush: {
        fcmOptions: {
          link: parentAppLink,
        },
      },
      tokens: uniqueTokens,
    };

    try {
      const response = await admin.messaging().sendEachForMulticast(message);
      console.log(`${context}: ✅ Sent multicast to ${uniqueTokens.length} tokens. Success: ${response.successCount}, Fail: ${response.failureCount}`);

      notificationRecord.status = response.successCount > 0 ? "success" : "failed";
      notificationRecord.tokensSummary = {
        total: uniqueTokens.length,
        success: response.successCount,
        failure: response.failureCount,
      };

      // Clean up failed/unregistered tokens
      await Promise.all(response.responses.map(async (res, idx) => {
        if (!res.success) {
          const error = res.error;
          const badToken = uniqueTokens[idx];
          console.error(`${context}: ❌ Token at index ${idx} failed:`, error);

          if (error && (error.code === "messaging/registration-token-not-registered" ||
              error.message?.includes("not-registered"))) {
            console.log(`${context}: 🧹 Cleaning up invalid token...`);

            if (studentData.parentPhoneNumber) {
              const pClean = studentData.parentPhoneNumber.replace(/\s+/g, "").trim();
              let phoneWithPlus = pClean;
              let phoneWithZero = pClean;
              if (pClean.startsWith("+20")) {
                phoneWithZero = "0" + pClean.substring(3);
              } else if (pClean.startsWith("0")) {
                phoneWithPlus = "+20" + pClean.substring(1);
              } else if (pClean) {
                phoneWithPlus = "+20" + pClean;
                phoneWithZero = "0" + pClean;
              }

              const phoneDocs = [phoneWithZero];
              if (phoneWithPlus !== phoneWithZero) phoneDocs.push(phoneWithPlus);

              await Promise.all(phoneDocs.map((pDoc) =>
                db.collection("parents").doc(pDoc).update({
                  fcmTokens: FieldValue.arrayRemove(badToken),
                  fcmToken: FieldValue.delete(),
                  lastTokenError: "not-registered",
                  updatedAt: FieldValue.serverTimestamp(),
                }).catch(() => { })
              ));
            }

            if (teacherId && groupId && studentId) {
              await db
                .doc(`teachers/${teacherId}/groups/${groupId}/students/${studentId}`)
                .update({
                  parentFcmToken: FieldValue.delete(),
                  parentFcmTokens: FieldValue.arrayRemove(badToken),
                }).catch(() => { });
            }
          }
        }
      }));
    } catch (error) {
      console.error(`${context}: ❌ Failed to send multicast notification:`, error);
      notificationRecord.status = "error";
      notificationRecord.error = error.message;
    }
  } else {
    notificationRecord.status = "no_tokens";
  }

  if (studentId && teacherId && groupId) {
    try {
      await db
        .doc(`teachers/${teacherId}/groups/${groupId}/students/${studentId}`)
        .collection("notificationHistory")
        .add(notificationRecord);
    } catch (dbError) {
      console.error(`${context}: Error saving notification history:`, dbError);
    }
  }

  const isSent = (notificationRecord.tokensSummary?.success || 0) > 0;
  const sCount = notificationRecord.tokensSummary?.success || 0;
  return { sent: isSent, successCount: sCount };
}

// 1. إرسال تنبيهات الغياب اليدوية
const sendAbsenceNotifications = onCall({ cors: true }, async (request) => {
  const { groupId, date, teacherId } = request.data || {};

  if (!teacherId) {
    throw new HttpsError("invalid-argument", "Teacher ID is required");
  }

  await verifyTeacherOrAdmin(request, teacherId);

  try {
    const subjectName = await getTeacherSubject(teacherId);

    const attendanceDoc = await db
      .doc(`teachers/${teacherId}/groups/${groupId}/dailyAttendance/${date}`)
      .get();

    const attendanceData = attendanceDoc.exists ? attendanceDoc.data() : { records: [] };

    const presentStudentIds = new Set(
      attendanceData.records
        .filter((r) => r.status === "present")
        .map((r) => r.studentId),
    );

    const studentsSnapshot = await db
      .collection("teachers")
      .doc(teacherId)
      .collection("groups")
      .doc(groupId)
      .collection("students")
      .get();

    if (studentsSnapshot.empty) {
      return { success: true, message: "لا يوجد طلاب في هذه المجموعة" };
    }

    const promises = [];
    let sentCount = 0;

    studentsSnapshot.docs.forEach((doc) => {
      if (!presentStudentIds.has(doc.id)) {
        const student = doc.data();
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
            .then((res) => {
              if (res && res.sent === true) {
                sentCount++;
              }
            }),
        );
      }
    });

    await Promise.all(promises);

    const metaRef = db.doc(`teachers/${teacherId}/groups/${groupId}/attendanceMeta/${date}`);
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

// 2. إشعار عند رصد درجات جديدة
const notifyOnNewGrades = onDocumentWritten(
  "teachers/{teacherId}/groups/{groupId}/assignments/{assignmentId}",
  async (event) => {
    const teacherId = event.params.teacherId;
    const groupId = event.params.groupId;
    const assignmentId = event.params.assignmentId;

    const snapAfter = event.data.after;
    if (!snapAfter || !snapAfter.exists) return;

    const snapBefore = event.data.before;
    const beforeData = (snapBefore && snapBefore.exists) ? snapBefore.data() : {};
    const scoresBefore = beforeData.scores || {};

    const afterData = snapAfter.data();

    if (afterData._noNotify === true) {
      console.log("🤫 Silent update detected. Skipping notifications.");
      await snapAfter.ref.update({ _noNotify: FieldValue.delete() });
      return null;
    }

    const isExam = afterData.type === "exam" || (!afterData.type && afterData.totalMark !== undefined && !(afterData.name || "").includes("واجب"));
    const isHomework = afterData.type === "homework" || afterData.type === "daily" || ((afterData.name || "").includes("واجب"));

    const assignmentName = afterData.name || (isExam ? "امتحان" : "واجب");
    const scoresAfter = afterData.scores || {};
    const subjectName = await getTeacherSubject(teacherId);

    const sendPromises = [];

    for (const studentId in scoresAfter) {
      if (Object.prototype.hasOwnProperty.call(scoresAfter, studentId)) {
        const scoreData = scoresAfter[studentId];

        if (scoreData) {
          const processStudent = async () => {
            const scoreBefore = scoresBefore[studentId] ? scoresBefore[studentId].score : null;
            const submittedBefore = scoresBefore[studentId] ? !!scoresBefore[studentId].submitted : false;
            const submittedAfter = !!scoreData.submitted;

            const hasScore = scoreData.score !== "" && scoreData.score != null;
            const isScoreChanged = isExam && hasScore && (scoreData.score != scoreBefore);
            const isSubmittedChanged = isHomework && (submittedAfter !== submittedBefore);

            if (isScoreChanged || isSubmittedChanged) {
              const sDoc = await db.doc(`teachers/${teacherId}/groups/${groupId}/students/${studentId}`).get();

              if (sDoc.exists) {
                const sData = sDoc.data();
                let title = isExam ? "تحديث درجات الامتحان 📝" : "تحديث الواجب 📚";
                let body = `تم تحديث بيانات "${assignmentName}" للطالب ${sData.name}.`;
                const targetScreen = isHomework ? "homework" : "grades";

                if (isScoreChanged) {
                  title = "تم رصد درجة الامتحان 📝";
                  body = `حصل الطالب ${sData.name} على ${scoreData.score} من ${afterData.totalMark || 30} في "${assignmentName}" لمادة ${subjectName}.`;
                } else if (isSubmittedChanged) {
                  if (scoreData.submitted) {
                    title = "تأكيد تسليم الواجب ✅";
                    body = `تم استلام "${assignmentName}" من الطالب ${sData.name} في مادة ${subjectName}.`;
                  } else {
                    title = "إلغاء تسليم الواجب ❌";
                    body = `تم إلغاء تسليم "${assignmentName}" للطالب ${sData.name} في مادة ${subjectName}.`;
                  }
                }

                const payload = {
                  notification: { title, body },
                  data: { "screen": targetScreen, "assignmentId": assignmentId },
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
  }
);

// 3. إشعار تعديل أو إلغاء حصة
const notifyOnScheduleException = onDocumentWritten(
  "teachers/{teacherId}/groups/{groupId}/exceptions/{exceptionId}",
  async (event) => {
    const teacherId = event.params.teacherId;
    const groupId = event.params.groupId;

    const snapAfter = event.data.after;
    if (!snapAfter || !snapAfter.exists) return;

    const data = snapAfter.data();
    const type = data.type;
    const date = data.date;
    const newTime = data.newTime;

    const subjectName = await getTeacherSubject(teacherId);

    const studentsSnapshot = await db
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
  }
);

// 4. إشعار عند سداد المصروفات
const notifyOnPayment = onDocumentWritten(
  "teachers/{teacherId}/groups/{groupId}/payments/{month}",
  async (event) => {
    const teacherId = event.params.teacherId;
    const groupId = event.params.groupId;
    const month = event.params.month;

    const snapAfter = event.data.after;
    const snapBefore = event.data.before;

    if (!snapAfter || !snapAfter.exists) return;

    const afterData = snapAfter.data();

    if (afterData._noNotify === true) {
      console.log("🤫 Silent update detected. Skipping notifications.");
      await snapAfter.ref.update({ _noNotify: FieldValue.delete() });
      return null;
    }

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
      const teacherDoc = await db.collection("teachers").doc(teacherId).get();
      if (teacherDoc.exists) {
        const tData = teacherDoc.data();
        teacherName = tData.name || "المستر";
        subjectName = tData.subject || "المادة";
      }
    } catch (e) {
      console.error("Error fetching teacher info:", e);
    }

    for (const record of afterRecords) {
      const isNowPaid = record.paid === true && (record.amount || 0) > 0;
      const wasPaid = beforeStatusMap[record.studentId] === true;
      const amountPaid = record.amount || 0;

      if (isNowPaid && !wasPaid) {
        const studentId = record.studentId;
        const sDoc = await db.doc(`teachers/${teacherId}/groups/${groupId}/students/${studentId}`).get();

        if (sDoc.exists) {
          const sData = sDoc.data();
          const payload = {
            notification: {
              title: "تأكيد سداد المصروفات",
              body: `تم استلام مبلغ ${amountPaid} جنيه مصاريف شهر ${month} لمادة ${subjectName} مع ${teacherName} للطالب ${sData.name}. شكراً لكم.`,
            },
            data: { "screen": "payments", "month": month },
          };

          await sendNotificationToParent(sData, payload, "notifyOnPayment", studentId, teacherId, groupId);
        }
      }
    }
  }
);

// 5. إرسال رسالة مخصصة لولي الأمر
const sendCustomMessage = onCall({ cors: true }, async (request) => {
  const { teacherId, groupId, studentId, messageBody } = request.data || {};

  if (!teacherId) {
    throw new HttpsError("invalid-argument", "Teacher ID is required");
  }

  await verifyTeacherOrAdmin(request, teacherId);

  try {
    const studentDoc = await db.doc(`teachers/${teacherId}/groups/${groupId}/students/${studentId}`).get();

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

// 6. إشعار الحضور الفوري
const notifyOnPresence = onDocumentWritten(
  "teachers/{teacherId}/groups/{groupId}/dailyAttendance/{date}",
  async (event) => {
    const snapAfter = event.data.after;
    const snapBefore = event.data.before;

    if (!snapAfter.exists) return;

    const afterData = snapAfter.data();

    if (afterData._noNotify === true) {
      console.log("🤫 Silent update detected. Skipping notifications.");
      await snapAfter.ref.update({ _noNotify: FieldValue.delete() });
      return null;
    }

    const beforeData = snapBefore.exists ? snapBefore.data() : { records: [] };
    const afterRecords = afterData.records || [];
    const beforeRecords = beforeData.records || [];

    const newlyPresentStudents = afterRecords.filter((rAfter) => {
      const isPresentNow = rAfter.status === "present";
      const wasPresent = beforeRecords.some((rBefore) =>
        rBefore.studentId === rAfter.studentId && rBefore.status === "present",
      );
      return isPresentNow && !wasPresent;
    });

    const newlyAbsentStudents = beforeRecords.filter((rBefore) => {
      if (rBefore.status !== "present") return false;
      const rAfter = afterRecords.find((r) => r.studentId === rBefore.studentId);
      return !rAfter || rAfter.status !== "present";
    });

    if (newlyPresentStudents.length === 0 && afterRecords.length > 0) {
      if (!afterData.firstScanAt && afterRecords.some((r) => r.status === "present")) {
        await snapAfter.ref.update({ firstScanAt: FieldValue.serverTimestamp() });
      }
    } else if (newlyPresentStudents.length > 0 && !afterData.firstScanAt) {
      await snapAfter.ref.update({ firstScanAt: FieldValue.serverTimestamp() });
    }

    const teacherId = event.params.teacherId;
    const groupId = event.params.groupId;
    const date = event.params.date;

    const subjectName = await getTeacherSubject(teacherId);
    const allNotifications = [];

    newlyPresentStudents.forEach((record) => {
      const studentId = record.studentId;
      const processPresent = async () => {
        const sDoc = await db.doc(`teachers/${teacherId}/groups/${groupId}/students/${studentId}`).get();
        if (!sDoc.exists) return;
        const sData = sDoc.data();

        const title = "تم تسجيل الحضور ✅";
        let timeStr = "";
        if (record.time) {
          try {
            const dateObj = new Date(record.time);
            const tOpts = { timeZone: "Africa/Cairo", hour: "numeric", minute: "2-digit", hour12: true };
            timeStr = "\n\n⏰ حضر في تمام الساعة: " + new Intl.DateTimeFormat("ar-EG", tOpts).format(dateObj);
          } catch (e) { }
        }

        const body = `تم تسجيل حضور الطالب ${sData.name} اليوم في حصة ${subjectName}.${timeStr}`;
        const payload = {
          notification: { title, body },
          data: { "screen": "attendance", "date": date, "studentId": studentId },
        };

        return sendNotificationToParent(sData, payload, "notifyOnPresence", studentId, teacherId, groupId);
      };
      allNotifications.push(processPresent());
    });

    newlyAbsentStudents.forEach((record) => {
      const studentId = record.studentId;
      const processAbsent = async () => {
        const sDoc = await db.doc(`teachers/${teacherId}/groups/${groupId}/students/${studentId}`).get();
        if (!sDoc.exists) return;
        const sData = sDoc.data();

        const payload = {
          notification: {
            title: "تعديل: تسجيل غياب ❌",
            body: `تم تعديل الحالة إلى غياب للطالب ${sData.name} في حصة ${subjectName} اليوم.`,
          },
          data: { "screen": "attendance", "date": date, "studentId": studentId },
        };

        return sendNotificationToParent(sData, payload, "notifyOnAbsenceUpdate", studentId, teacherId, groupId);
      };
      allNotifications.push(processAbsent());
    });

    await Promise.all(allNotifications);
  }
);

// 7. إزالة توكن ولي الأمر عند تسجيل الخروج
const removeParentTokenOnLogout = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً");
  }

  const callerUid = request.auth.uid;
  const token = request.auth.token || {};
  const isAdmin = token.email === "admin@elnazer-edu.com" || token.admin === true;

  const data = request.data || {};
  const phoneFormats = data.phoneFormats;
  const fcmToken = data.fcmToken;

  if (!phoneFormats || !Array.isArray(phoneFormats) || !fcmToken) {
    throw new HttpsError("invalid-argument", "Missing phoneFormats array or fcmToken");
  }

  if (!isAdmin && !phoneFormats.includes(callerUid)) {
    throw new HttpsError("permission-denied", "لا يمكنك تسجيل الخروج لحساب آخر");
  }

  try {
    for (const phoneDocId of phoneFormats) {
      await db.collection("parents").doc(phoneDocId).update({
        fcmToken: FieldValue.delete(),
        fcmTokens: FieldValue.arrayRemove(fcmToken),
      }).catch(() => {});
    }

    for (const phoneDocId of phoneFormats) {
      const studentsSnapshot = await db
        .collectionGroup("students")
        .where("parentPhoneNumber", "==", phoneDocId)
        .get();

      if (!studentsSnapshot.empty) {
        const batch = db.batch();
        studentsSnapshot.forEach((doc) => {
          batch.update(doc.ref, {
            parentFcmToken: FieldValue.delete(),
          });
        });
        await batch.commit();
      }
    }

    return { success: true };
  } catch (error) {
    console.error("Error in removeParentTokenOnLogout:", error);
    throw new HttpsError("internal", error.message);
  }
});

module.exports = {
  sendNotificationToParent,
  sendAbsenceNotifications,
  notifyOnNewGrades,
  notifyOnScheduleException,
  notifyOnPayment,
  sendCustomMessage,
  notifyOnPresence,
  removeParentTokenOnLogout,
};
