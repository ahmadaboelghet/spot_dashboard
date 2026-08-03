const admin = require('firebase-admin');

// Connect to local emulator
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8088';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9090';

admin.initializeApp({
  projectId: 'learnaria-483e7'
});

const db = admin.firestore();
const auth = admin.auth();

async function seed() {
  const teacherId = '+201000000000';
  const email = '201000000000@spot.com';
  const password = 'password123';

  console.log('Seeding test teacher...');

  // 1. Create Auth User
  try {
    await auth.createUser({
      uid: teacherId,
      email: email,
      password: password,
    });
    console.log('Auth user created.');
  } catch (e) {
    if (e.code !== 'auth/uid-already-exists' && e.code !== 'auth/email-already-exists') {
      console.error('Error creating auth user:', e);
    } else {
      console.log('Auth user already exists.');
    }
  }

  // 1.5 Create Admin User
  try {
    await auth.createUser({
      uid: 'admin',
      email: 'admin@elnazer-edu.com',
      password: 'adminpassword123',
    });
    console.log('Admin user created (admin@elnazer-edu.com / adminpassword123)');
  } catch (e) {
    if (e.code !== 'auth/uid-already-exists' && e.code !== 'auth/email-already-exists') {
      console.error('Error creating admin:', e);
    } else {
      console.log('Admin user already exists.');
    }
  }

  // 2. Create Firestore Document
  await db.collection('teachers').doc(teacherId).set({
    name: 'مدرس تجريبي',
    subject: 'تجربة',
    password: password
  });
  console.log('Teacher document created.');

  // 3. Create a test group
  const groupId = 'group_test_1';
  await db.collection(`teachers/${teacherId}/groups`).doc(groupId).set({
    name: 'مجموعة تجريبية',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log('Group document created.');

  console.log('✅ Seeding complete!');
  console.log(`\n👉 You can now login with:`);
  console.log(`Phone: 01000000000`);
  console.log(`Password: password123\n`);
  process.exit(0);
}

seed().catch(console.error);
