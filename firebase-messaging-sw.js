importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyAbN4awHvNUZWC-uCgU_hR7iYiHk-3dpv8",
  authDomain: "learnaria-483e7.firebaseapp.com",
  projectId: "learnaria-483e7",
  storageBucket: "learnaria-483e7.firebasestorage.app",
  messagingSenderId: "573038013067",
  appId: "1:573038013067:web:db6a78e8370d33b07a828e"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

/**
 * ⚠️ تم تعديل هذا الجزء لحل مشكلة تكرار الإشعارات
 * السبب: السيرفر يرسل payload يحتوي على "notification"، مما يجعل المتصفح يعرض الإشعار تلقائياً.
 * الكود القديم هنا كان يقوم بإنشاء إشعار ثاني يدوياً.
 */

// تم إيقاف المعالجة اليدوية لمنع التكرار
// messaging.onBackgroundMessage((payload) => {
//   console.log('[firebase-messaging-sw.js] Received background message ', payload);
//   // const notificationTitle = payload.notification.title;
//   // const notificationOptions = {
//   //   body: payload.notification.body,
//   //   icon: '/assets/images/learnaria_logo.png'
//   // };
//   // self.registration.showNotification(notificationTitle, notificationOptions);
// });

// التعامل مع الضغط على الإشعار
self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  // الرابط المستهدف (من الداتا المرسلة من السيرفر)
  const urlToOpen = event.notification.data?.FCM_MSG?.notification?.click_action ||
    event.notification.data?.link ||
    'https://ahmadaboelghet.github.io/spot_dashboard/parent.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      // إذا كان التطبيق مفتوحاً بالفعل، قم بالتركيز عليه
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // إذا لم يكن مفتوحاً، افتحه في نافذة جديدة
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});