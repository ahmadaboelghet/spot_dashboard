/* eslint-disable max-len */
/**
 * Spot Educational Platform - Backend Cloud Functions
 * Modularized Architecture (v3.0)
 */

const notifications = require("./modules/notifications");
const schedules = require("./modules/schedules");
const ai = require("./modules/ai");
const parent = require("./modules/parent");
const admin = require("./modules/admin");

module.exports = {
  // 1. Notifications & Alerts
  sendAbsenceNotifications: notifications.sendAbsenceNotifications,
  notifyOnNewGrades: notifications.notifyOnNewGrades,
  notifyOnScheduleException: notifications.notifyOnScheduleException,
  notifyOnPayment: notifications.notifyOnPayment,
  sendCustomMessage: notifications.sendCustomMessage,
  notifyOnPresence: notifications.notifyOnPresence,
  removeParentTokenOnLogout: notifications.removeParentTokenOnLogout,

  // 2. Scheduled Cron Jobs
  classReminder: schedules.classReminder,
  paymentReminder: schedules.paymentReminder,
  cleanupScanLogs: schedules.cleanupScanLogs,

  // 3. AI & Spot Bot
  processUploadedFile: ai.processUploadedFile,
  cleanupDeletedFile: ai.cleanupDeletedFile,
  whatsappWebhook: ai.whatsappWebhook,
  chatWithSpot: ai.chatWithSpot,

  // 4. Parent Portal
  getDashboardData: parent.getDashboardData,
  checkParentExists: parent.checkParentExists,
  activateParentAccount: parent.activateParentAccount,
  checkAuthUserExists: parent.checkAuthUserExists,
  getTeacherContactForParent: parent.getTeacherContactForParent,

  // 5. Admin & Center Management
  resetPassword: admin.resetPassword,
  migrateExistingCards: admin.migrateExistingCards,
  createCenter: admin.createCenter,
  createTeacher: admin.createTeacher,
  addTeacherToCenter: admin.addTeacherToCenter,
  removeTeacherFromCenter: admin.removeTeacherFromCenter,
  adminListUsers: admin.adminListUsers,
  adminDeleteUser: admin.adminDeleteUser,
  adminSendNotification: admin.adminSendNotification,
  adminMoveStudent: admin.adminMoveStudent,
};
