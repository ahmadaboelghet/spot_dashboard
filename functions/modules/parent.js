/* eslint-disable max-len */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { admin, db, FieldValue, formatDate, getDayDart } = require("./config");

/**
 * 1. جلب بيانات لوحة تحكم ولي الأمر
 */
const getDashboardData = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }

  const parentUid = request.auth.uid;
  let studentNameForDashboard = "Student";
  const reportsMap = new Map();

  try {
    const parentUserDoc = await db.collection("users").doc(parentUid).get();
    if (!parentUserDoc.exists || !parentUserDoc.data().phoneNumber) {
      throw new HttpsError("not-found", "Parent user phone number not found.");
    }
    const parentPhoneNumber = parentUserDoc.data().phoneNumber;

    const studentsSnapshot = await db
      .collectionGroup("students")
      .where("parentPhoneNumber", "==", parentPhoneNumber)
      .get();

    if (studentsSnapshot.empty) {
      return { studentName: studentNameForDashboard, reportsByTeacher: [] };
    }

    studentNameForDashboard = studentsSnapshot.docs[0].data().name || studentNameForDashboard;

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
          const teacherDoc = await db.collection("teachers").doc(teacherId).get();
          const teacherData = teacherDoc.data() || {};
          reportsMap.set(teacherId, {
            teacherId: teacherId,
            teacherName: teacherData.name || "Unknown Teacher",
            subject: teacherData.subject || "General",
            attendance: [],
            grades: [],
            schedule: [],
            payments: [],
          });
        } catch (teacherError) {
          console.error(`Failed to fetch teacher ${teacherId}:`, teacherError);
        }
      }

      const teacherReport = reportsMap.get(teacherId);
      const groupRef = db.collection("teachers").doc(teacherId).collection("groups").doc(groupId);

      try {
        const schedulesSnap = await groupRef.collection("recurringSchedules").get();
        const exceptionsSnap = await groupRef.collection("exceptions").get();
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
          const data = doc.data() || {};
          if (data.date === todayString) {
            const isCancelled = data.type === "cancelled" || data.status === "cancelled";
            const isRescheduled = data.type === "modified" || data.status === "rescheduled";
            if (isCancelled) {
              finalSchedule.length = 0;
              break;
            } else if (isRescheduled && finalSchedule.length > 0 && data.newTime) {
              finalSchedule[0].time = data.newTime;
            }
          }
        }
        teacherReport.schedule.push(...finalSchedule);
      } catch (e) {
        console.error("Error fetching schedule:", e);
      }

      try {
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

      try {
        const paySnap = await groupRef.collection("payments").get();
        paySnap.forEach((doc) => {
          const data = doc.data();
          const studentPayment = (data.records || []).find((r) => r.studentId === studentId);
          if (studentPayment) {
            teacherReport.payments.push({
              studentName: studentName,
              month: data.month || doc.id.split("_PAY_")[1] || "N/A",
              amount: studentPayment.amount || 0,
              paid: studentPayment.paid || false,
            });
          }
        });
      } catch (e) {
        console.error("Error fetching payments:", e);
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

/**
 * 2. التحقق من وجود رقم ولي الأمر في بيانات الطلاب
 */
const checkParentExists = onCall({ cors: true }, async (request) => {
  const parentPhoneNumber = request.data.phoneNumber;
  if (!parentPhoneNumber) {
    throw new HttpsError("invalid-argument", "The function must be called with a 'phoneNumber' argument.");
  }

  try {
    const studentsSnapshot = await db
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

/**
 * 3. تفعيل حساب ولي الأمر أو إعادة تعيين كلمة المرور
 */
const activateParentAccount = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً.");
  }

  const callerUid = request.auth.uid;
  const token = request.auth.token || {};
  const isAdmin = token.email === "admin@elnazer-edu.com" || token.admin === true;

  if (!isAdmin) {
    const [teacherDoc, centerDoc] = await Promise.all([
      db.collection("teachers").doc(callerUid).get(),
      db.collection("centers").doc(callerUid).get(),
    ]);

    if (!teacherDoc.exists && !centerDoc.exists) {
      throw new HttpsError("permission-denied", "ليس لديك صلاحية لتفعيل أو إعادة تعيين حسابات أولياء الأمور.");
    }
  }

  const phone = request.data ? request.data.phone : null;
  if (!phone) {
    throw new HttpsError("invalid-argument", "يجب توفير رقم هاتف ولي الأمر.");
  }

  let cleanPhone = phone.replace(/\s+/g, "").trim();
  let phoneWithPlus = cleanPhone;

  if (cleanPhone.startsWith("01") && cleanPhone.length === 11) {
    phoneWithPlus = "+20" + cleanPhone.substring(1);
  } else if (!cleanPhone.startsWith("+")) {
    phoneWithPlus = "+2" + cleanPhone;
  }

  const email = `${phoneWithPlus}@learnaria.app`;
  const password = "elnazer@123456";

  try {
    await admin.auth().createUser({
      uid: phoneWithPlus,
      email: email,
      password: password,
      displayName: "Parent Account",
    });

    await db.collection("parents").doc(phoneWithPlus).set({
      createdAt: FieldValue.serverTimestamp(),
      activatedByAdmin: true,
    }, { merge: true });

    return { success: true, message: "تم إنشاء حساب الأب بنجاح. الباسورد الافتراضي هو: elnazer@123456" };
  } catch (error) {
    if (error.code === "auth/email-already-exists" || error.code === "auth/uid-already-exists") {
      const userRecord = await admin.auth().getUserByEmail(email);
      await admin.auth().updateUser(userRecord.uid, { password: password });
      return { success: true, message: "هذا الحساب كان مسجلاً بالفعل، وتم إعادة تعيين كلمة المرور بنجاح إلى: elnazer@123456" };
    }

    console.error("Error activating parent account:", error);
    throw new HttpsError("internal", error.message || "حدث خطأ غير متوقع.");
  }
});

/**
 * 4. التحقق من وجود الحساب في Firebase Auth
 */
const checkAuthUserExists = onCall({ cors: true }, async (request) => {
  const phone = request.data.phone;
  if (!phone) {
    throw new HttpsError("invalid-argument", "يجب توفير رقم هاتف ولي الأمر.");
  }

  let cleanPhone = phone.replace(/\s+/g, "").trim();
  let phoneWithPlus = cleanPhone;

  if (cleanPhone.startsWith("01") && cleanPhone.length === 11) {
    phoneWithPlus = "+20" + cleanPhone.substring(1);
  } else if (!cleanPhone.startsWith("+")) {
    phoneWithPlus = "+2" + cleanPhone;
  }

  const email = `${phoneWithPlus}@learnaria.app`;

  try {
    await admin.auth().getUserByEmail(email);
    return { exists: true };
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      return { exists: false };
    }
    console.error("Error checking auth user existence:", error);
    throw new HttpsError("internal", error.message || "حدث خطأ غير متوقع.");
  }
});

/**
 * 5. جلب معلومات تواصل المعلم الخاص بولي الأمر
 */
const getTeacherContactForParent = onCall({ cors: true }, async (request) => {
  const phone = request.data.phone;
  if (!phone) {
    throw new HttpsError("invalid-argument", "يجب توفير رقم هاتف ولي الأمر.");
  }

  let clean = phone.replace(/\s+/g, "").replace(/[^\d]/g, "").trim();
  if (clean.startsWith("20")) {
    clean = clean.substring(2);
  }
  if (clean.startsWith("0")) {
    clean = clean.substring(1);
  }
  const phoneFormats = ["0" + clean, "+20" + clean];

  try {
    const studentDocs = await db
      .collectionGroup("students")
      .where("parentPhoneNumber", "in", phoneFormats)
      .limit(1)
      .get();

    if (studentDocs.empty) {
      return { found: false };
    }

    const studentDoc = studentDocs.docs[0];
    const pathSegments = studentDoc.ref.path.split("/");
    const teacherId = pathSegments[1];
    const groupId = pathSegments[3];

    if (!teacherId) {
      return { found: false };
    }

    let groupName = "المجموعة";
    if (groupId) {
      try {
        const groupDoc = await db
          .collection("teachers")
          .doc(teacherId)
          .collection("groups")
          .doc(groupId)
          .get();
        if (groupDoc.exists) {
          groupName = groupDoc.data().name || "المجموعة";
        }
      } catch (err) {
        console.error("Error looking up group name:", err);
      }
    }

    const teacherDoc = await db.collection("teachers").doc(teacherId).get();
    if (teacherDoc.exists) {
      return {
        found: true,
        teacherPhone: teacherId,
        teacherName: teacherDoc.data().name || "المعلم",
        groupName: groupName,
      };
    }

    return {
      found: true,
      teacherPhone: teacherId,
      teacherName: "المعلم",
      groupName: groupName,
    };
  } catch (error) {
    console.error("Error looking up teacher contact:", error);
    throw new HttpsError("internal", error.message || "حدث خطأ أثناء جلب معلومات التواصل.");
  }
});

module.exports = {
  getDashboardData,
  checkParentExists,
  activateParentAccount,
  checkAuthUserExists,
  getTeacherContactForParent,
};
