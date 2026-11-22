/* eslint-disable max-len */
const admin = require("firebase-admin");
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineSecret } = require("firebase-functions/params");
const { HttpsError } = require("firebase-functions/v2/https");

// Set global function options
setGlobalOptions({ maxInstances: 20 });

// Secret definitions
// const TWILIO_ACCOUNT_SID = defineSecret("TWILIO_ACCOUNT_SID");
// const TWILIO_AUTH_TOKEN = defineSecret("TWILIO_AUTH_TOKEN");
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

// Parent App base URL
const PARENT_APP_BASE_URL = "https://www.elnazer-edu.com/parent.html";

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

/**
 * Verify caller is an admin or the requested teacher (or center owner of the teacher).
 * @param {object} request - Cloud function request
 * @param {string} requestedTeacherId - ID of teacher being accessed
 * @return {Promise<boolean>}
 */
async function verifyTeacherOrAdmin(request, requestedTeacherId) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً");
  }
  const token = request.auth.token || {};
  if (token.email === "admin@elnazer-edu.com" || token.admin === true) {
    return true;
  }
  const callerUid = request.auth.uid;
  if (requestedTeacherId && callerUid === requestedTeacherId) {
    return true;
  }
  if (requestedTeacherId) {
    const tDoc = await db.collection("teachers").doc(requestedTeacherId).get();
    if (tDoc.exists && tDoc.data() && tDoc.data().centerId === callerUid) {
      return true;
    }
  }
  throw new HttpsError("permission-denied", "ليس لديك صلاحية لتنفيذ هذا الإجراء");
}

/**
 * Get teacher subject name.
 * @param {string} teacherId - Teacher document ID
 * @return {Promise<string>}
 */
async function getTeacherSubject(teacherId) {
  try {
    const doc = await db.collection("teachers").doc(teacherId).get();
    if (doc.exists) {
      return doc.data()?.profile?.teacherSubject || doc.data()?.subject || "المادة";
    }
  } catch (e) {
    console.error("Error fetching teacher subject:", e);
  }
  return "المادة";
}

/**
 * Format Date as YYYY-MM-DD.
 * @param {Date} date
 * @return {string}
 */
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Get day of week (0 to 6).
 * @param {Date} date
 * @return {number}
 */
function getDayDart(date) {
  return date.getDay();
}

/**
 * Convert 24h time string HH:mm to 12h format.
 * @param {string} timeString
 * @return {string}
 */
function formatTime12Hour(timeString) {
  if (!timeString) return "";
  const [h, m] = timeString.split(":");
  const hour = parseInt(h, 10);
  const suffix = hour >= 12 ? "PM" : "AM";
  const formattedHour = ((hour + 11) % 12 + 1);
  return `${formattedHour}:${m} ${suffix}`;
}

module.exports = {
  admin,
  db,
  FieldValue,
  // TWILIO_ACCOUNT_SID,
  // TWILIO_AUTH_TOKEN,
  GEMINI_API_KEY,
  PARENT_APP_BASE_URL,
  verifyTeacherOrAdmin,
  getTeacherSubject,
  formatDate,
  getDayDart,
  formatTime12Hour,
};
