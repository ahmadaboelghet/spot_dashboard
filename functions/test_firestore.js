const admin = require('firebase-admin');
const app = admin.initializeApp({ projectId: 'learnaria-483e7' });
console.log('Is FieldValue defined?', admin.firestore.FieldValue !== undefined);
console.log('Is FieldValue.serverTimestamp defined?', admin.firestore.FieldValue?.serverTimestamp !== undefined);
