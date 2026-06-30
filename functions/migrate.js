const admin = require("firebase-admin");

admin.initializeApp({
    projectId: "learnaria-483e7"
});

const db = admin.firestore();
const auth = admin.auth();

async function migrate() {
    console.log("Starting migration...");
    const snapshot = await db.collection("teachers").get();
    
    let count = 0;
    for (const doc of snapshot.docs) {
        const teacherId = doc.id; // e.g. +20123456789
        const data = doc.data();
        const password = data.password && data.password.toString().trim() !== "" ? data.password.toString().trim() : "Spot123456";
        const email = `${teacherId.substring(1)}@spot.com`;

        try {
            // Check if user already exists
            await auth.getUser(teacherId);
            console.log(`User ${teacherId} already exists in Auth.`);
        } catch (e) {
            if (e.code === "auth/user-not-found") {
                // Create user
                try {
                    await auth.createUser({
                        uid: teacherId,
                        email: email,
                        password: password,
                        displayName: data.name || "Teacher"
                    });
                    console.log(`Successfully migrated: ${teacherId}`);
                    count++;
                } catch (createErr) {
                    console.error(`Error creating auth for ${teacherId}:`, createErr.message);
                }
            } else {
                console.error(`Error fetching auth for ${teacherId}:`, e.message);
            }
        }
    }
    console.log(`Migration complete. Migrated ${count} teachers.`);
}

migrate();
