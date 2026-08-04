const admin = require('firebase-admin');
const app = admin.initializeApp({ projectId: 'learnaria-483e7' });
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8088';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9090';

async function test() {
    try {
        const db = admin.firestore();
        const doc = await db.collection('centers').doc('+201009856266').get();
        if(doc.exists) console.log('Center Data:', doc.data());
        else console.log('Center does not exist');
        
        const user = await admin.auth().getUserByPhoneNumber('+201009856266');
        console.log('Auth User:', user);
        
        // Also check getUserByUid
        const user2 = await admin.auth().getUser('+201009856266');
        console.log('Auth User by UID:', user2);
    } catch(e) {
        console.error(e);
    }
}
test();
