/* eslint-disable max-len */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { admin, db, FieldValue } = require("./config");
const { sendNotificationToParent } = require("./notifications");

const adminCorsOptions = {
  invoker: "public",
  cors: ["https://elnazer-edu.com", "https://www.elnazer-edu.com", /localhost/, /127\.0\.0\.1/],
};

/**
 * 1. إعادة تعيين كلمة المرور للمستخدمين (Admin Only)
 */
const resetPassword = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً");
  }
  const token = request.auth.token || {};
  const isAdmin = token.email === "admin@elnazer-edu.com" || token.admin === true;
  if (!isAdmin) {
    throw new HttpsError("permission-denied", "صلاحية المدير مطلوبة لإعادة تعيين كلمة المرور");
  }

  const { phoneNumber, newPassword } = request.data || {};

  if (!phoneNumber || !newPassword) {
    throw new HttpsError(
      "invalid-argument",
      "The function must be called with phoneNumber and newPassword arguments."
    );
  }

  const normalizedPhone = phoneNumber.trim();
  const email = `${normalizedPhone}@learnaria.app`;

  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    const uid = userRecord.uid;

    await admin.auth().updateUser(uid, {
      password: newPassword,
    });

    return { status: "success", message: "Password updated successfully." };
  } catch (error) {
    console.error("Error updating user password:", error);

    if (error.code === "auth/user-not-found") {
      throw new HttpsError(
        "not-found",
        "User not found with this phone number."
      );
    }

    throw new HttpsError(
      "internal",
      error.message || "An error occurred while resetting the password."
    );
  }
});

/**
 * 2. ترحيل كروت الطلاب القديمة
 */
const migrateExistingCards = onCall({ cors: true }, async (request) => {
  if (!request.auth || request.auth.token.email !== "admin@elnazer-edu.com") {
    throw new HttpsError("permission-denied", "Only admin can migrate cards.");
  }

  const teachersSnap = await db.collection("teachers").get();
  let migratedCount = 0;

  for (const teacherDoc of teachersSnap.docs) {
    const teacherId = teacherDoc.id;
    const centerId = teacherDoc.data().centerId || teacherId;

    const groupsSnap = await teacherDoc.ref.collection("groups").get();
    for (const groupDoc of groupsSnap.docs) {
      const studentsSnap = await groupDoc.ref.collection("students").get();
      for (const studentDoc of studentsSnap.docs) {
        const student = studentDoc.data();
        if (student.cardId) {
          await db.collection("cards").doc(student.cardId).set({
            id: student.cardId,
            ownerId: centerId,
            createdAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          migratedCount++;
        }
      }
    }
  }

  return { success: true, migratedCount };
});

/**
 * 3. إنشاء مركز تعليمي جديد
 */
const createCenter = onCall({ cors: true }, async (request) => {
  if (!request.auth || request.auth.token.email !== "admin@elnazer-edu.com") {
    throw new HttpsError("permission-denied", "Only admin can create centers.");
  }

  const { centerPhone, centerName, password } = request.data;
  if (!centerPhone || !centerName || !password) {
    throw new HttpsError("invalid-argument", "Missing center phone, name, or password.");
  }

  const email = `${centerPhone.replace("+", "")}@spot.com`;
  try {
    await admin.auth().createUser({
      uid: centerPhone,
      email: email,
      password: password,
      displayName: centerName,
    });
  } catch (error) {
    if (error.code !== "auth/uid-already-exists" && error.code !== "auth/email-already-exists") {
      throw new HttpsError("internal", error.message);
    }
  }

  await db.collection("centers").doc(centerPhone).set({
    name: centerName,
    phone: centerPhone,
    createdAt: FieldValue.serverTimestamp(),
    teachers: [],
  });

  return { success: true };
});

/**
 * 4. إنشاء حساب مدرس جديد
 */
const createTeacher = onCall({ cors: true }, async (request) => {
  let isAuthorized = false;
  let isCenterCaller = false;
  let callerUid = null;

  if (request.auth) {
    if (request.auth.token.email === "admin@elnazer-edu.com") {
      isAuthorized = true;
    } else {
      callerUid = request.auth.uid;
      const centerDoc = await db.collection("centers").doc(callerUid).get();
      if (centerDoc.exists) {
        isAuthorized = true;
        isCenterCaller = true;
      }
    }
  }

  if (!isAuthorized) {
    throw new HttpsError("permission-denied", "Not authorized to create teachers.");
  }

  const { teacherPhone, teacherName, password, teacherSubject } = request.data;
  if (!teacherPhone || !teacherName || !password) {
    throw new HttpsError("invalid-argument", "Missing teacher phone, name, or password.");
  }

  const email = `${teacherPhone.replace("+", "")}@spot.com`;
  try {
    await admin.auth().createUser({
      uid: teacherPhone,
      email: email,
      password: password,
      displayName: teacherName,
    });
  } catch (error) {
    if (error.code !== "auth/uid-already-exists" && error.code !== "auth/email-already-exists") {
      throw new HttpsError("internal", error.message);
    }
  }

  const teacherData = {
    name: teacherName,
    profile: {
      teacherName: teacherName,
      teacherSubject: teacherSubject || "عام",
    },
    createdAt: FieldValue.serverTimestamp(),
  };

  if (isCenterCaller) {
    teacherData.centerId = callerUid;
  }

  await db.collection("teachers").doc(teacherPhone).set(teacherData, { merge: true });

  if (isCenterCaller) {
    await db.collection("centers").doc(callerUid).update({
      teachers: FieldValue.arrayUnion(teacherPhone),
    });
  }

  return { success: true };
});

/**
 * 5. ربط مدرس بمركز تعليمي
 */
const addTeacherToCenter = onCall({ cors: true }, async (request) => {
  if (!request.auth || request.auth.token.email !== "admin@elnazer-edu.com") {
    throw new HttpsError("permission-denied", "Only admin can manage centers.");
  }

  const { centerId, teacherId } = request.data;

  const teacherRef = db.collection("teachers").doc(teacherId);
  const teacherDoc = await teacherRef.get();
  if (!teacherDoc.exists) {
    throw new HttpsError("not-found", "Teacher not found.");
  }

  await db.collection("centers").doc(centerId).update({
    teachers: FieldValue.arrayUnion(teacherId),
  });

  await teacherRef.update({
    centerId: centerId,
  });

  return { success: true };
});

/**
 * 6. فك ارتباط مدرس بمركز تعليمي
 */
const removeTeacherFromCenter = onCall({ cors: true }, async (request) => {
  if (!request.auth || request.auth.token.email !== "admin@elnazer-edu.com") {
    throw new HttpsError("permission-denied", "Only admin can manage centers.");
  }

  const { centerId, teacherId } = request.data;

  await db.collection("centers").doc(centerId).update({
    teachers: FieldValue.arrayRemove(teacherId),
  });

  await db.collection("teachers").doc(teacherId).update({
    centerId: FieldValue.delete(),
  });

  return { success: true };
});

/**
 * 7. عرض قائمة مستخدمي النظام (Super Admin)
 */
const adminListUsers = onCall(adminCorsOptions, async (request) => {
  if (!request.auth || request.auth.token.email !== "admin@elnazer-edu.com") {
    throw new HttpsError("permission-denied", "Only admin can list users.");
  }

  const { pageToken } = request.data || {};
  try {
    const listUsersResult = await admin.auth().listUsers(100, pageToken || undefined);

    const users = listUsersResult.users.map((userRecord) => ({
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: userRecord.displayName,
      creationTime: userRecord.metadata.creationTime,
      lastSignInTime: userRecord.metadata.lastSignInTime,
      disabled: userRecord.disabled,
    }));

    return {
      users: users,
      nextPageToken: listUsersResult.pageToken,
    };
  } catch (error) {
    console.error("Error listing users:", error);
    throw new HttpsError("internal", error.message);
  }
});

/**
 * 8. حذف مستخدم من النظام (Super Admin)
 */
const adminDeleteUser = onCall(adminCorsOptions, async (request) => {
  if (!request.auth || request.auth.token.email !== "admin@elnazer-edu.com") {
    throw new HttpsError("permission-denied", "Only admin can delete users.");
  }

  const { uid } = request.data;
  if (!uid) {
    throw new HttpsError("invalid-argument", "Missing user UID.");
  }

  try {
    await admin.auth().deleteUser(uid);
    return { success: true, message: "User deleted successfully." };
  } catch (error) {
    console.error("Error deleting user:", error);
    throw new HttpsError("internal", error.message);
  }
});

/**
 * 9. إرسال إشعار يدوي من الإدارة (محسنة بدون Full DB Scan)
 */
const adminSendNotification = onCall(adminCorsOptions, async (request) => {
  if (!request.auth || request.auth.token.email !== "admin@elnazer-edu.com") {
    throw new HttpsError("permission-denied", "Only admin can send manual notifications.");
  }

  const { targetType, targetId, title, body } = request.data;
  if (!targetType || !title || !body) {
    throw new HttpsError("invalid-argument", "Missing target, title, or body.");
  }

  try {
    const payload = {
      notification: { title, body },
      data: { type: "admin_alert" },
    };

    let studentDocs = [];

    if (targetType === "teacher") {
      if (!targetId) throw new HttpsError("invalid-argument", "Missing teacherId");
      // استعلام موجه لمجموعات المعلم فقط بالتوازي بدلاً من مسح كامل قاعدة البيانات
      const groupsSnap = await db.collection("teachers").doc(targetId).collection("groups").get();
      const groupStudentSnaps = await Promise.all(
        groupsSnap.docs.map((gDoc) => gDoc.ref.collection("students").get())
      );
      groupStudentSnaps.forEach((gSnap) => {
        studentDocs.push(...gSnap.docs);
      });
    } else if (targetType === "group") {
      const { teacherId, groupId } = request.data;
      if (!teacherId || !groupId) throw new HttpsError("invalid-argument", "Missing teacherId or groupId");
      const snap = await db.collection("teachers").doc(teacherId).collection("groups").doc(groupId).collection("students").get();
      studentDocs = snap.docs;
    } else if (targetType === "student") {
      const { teacherId, groupId, studentId } = request.data;
      if (!teacherId || !groupId || !studentId) throw new HttpsError("invalid-argument", "Missing teacher, group, or student ID");
      const doc = await db.collection("teachers").doc(teacherId).collection("groups").doc(groupId).collection("students").doc(studentId).get();
      if (doc.exists) studentDocs.push(doc);
    }

    let sentCount = 0;
    const promises = studentDocs.map(async (doc) => {
      const studentData = doc.data();
      const studentId = doc.id;
      const pathSegments = doc.ref.path.split("/");
      const tId = pathSegments[1];
      const gId = pathSegments[3];

      try {
        await sendNotificationToParent(studentData, payload, "AdminManual", studentId, tId, gId);
        sentCount++;
      } catch (e) {
        console.error("Failed for student", studentId, e);
      }
    });

    await Promise.all(promises);
    return { success: true, sentCount };
  } catch (error) {
    console.error("Error sending admin notification:", error);
    throw new HttpsError("internal", error.message);
  }
});

/**
 * 10. نقل طالب بين المجموعات (Super Admin)
 */
const adminMoveStudent = onCall(adminCorsOptions, async (request) => {
  if (!request.auth || request.auth.token.email !== "admin@elnazer-edu.com") {
    throw new HttpsError("permission-denied", "Only admin can move students.");
  }

  const { fromTeacherId, fromGroupId, studentId, toTeacherId, toGroupId } = request.data;
  if (!fromTeacherId || !fromGroupId || !studentId || !toTeacherId || !toGroupId) {
    throw new HttpsError("invalid-argument", "Missing parameters.");
  }

  const oldStudentRef = db.doc(`teachers/${fromTeacherId}/groups/${fromGroupId}/students/${studentId}`);
  const newStudentRef = db.doc(`teachers/${toTeacherId}/groups/${toGroupId}/students/${studentId}`);

  const oldSnap = await oldStudentRef.get();
  if (!oldSnap.exists) {
    throw new HttpsError("not-found", "Student not found in the original group.");
  }

  const toGroupSnap = await db.doc(`teachers/${toTeacherId}/groups/${toGroupId}`).get();
  if (!toGroupSnap.exists) {
    throw new HttpsError("not-found", "Target group does not exist.");
  }

  const studentData = oldSnap.data();
  studentData.groupId = toGroupId;

  const batch = db.batch();
  batch.set(newStudentRef, studentData);
  batch.delete(oldStudentRef);
  await batch.commit();

  // ترحيل سجل الإشعارات
  const oldNotifsRef = oldStudentRef.collection("notificationHistory");
  const newNotifsRef = newStudentRef.collection("notificationHistory");

  const notifsSnap = await oldNotifsRef.get();
  if (!notifsSnap.empty) {
    const chunks = [];
    let currentChunk = db.batch();
    let count = 0;

    for (const doc of notifsSnap.docs) {
      currentChunk.set(newNotifsRef.doc(doc.id), doc.data());
      currentChunk.delete(doc.ref);
      count += 2;

      if (count >= 450) {
        chunks.push(currentChunk);
        currentChunk = db.batch();
        count = 0;
      }
    }
    if (count > 0) chunks.push(currentChunk);

    for (const chunk of chunks) {
      await chunk.commit();
    }
  }

  return { success: true, message: "Student moved successfully" };
});

module.exports = {
  resetPassword,
  migrateExistingCards,
  createCenter,
  createTeacher,
  addTeacherToCenter,
  removeTeacherFromCenter,
  adminListUsers,
  adminDeleteUser,
  adminSendNotification,
  adminMoveStudent,
};
