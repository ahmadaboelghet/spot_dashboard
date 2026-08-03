
        // ==========================================
        // 1. FIREBASE CONFIG
        // ==========================================
        const prodConfig = {
            apiKey: "AIzaSyAbN4awHvNUZWC-uCgU_hR7iYiHk-3dpv8",
            authDomain: "learnaria-483e7.firebaseapp.com",
            projectId: "learnaria-483e7",
            storageBucket: "learnaria-483e7.firebasestorage.app",
            messagingSenderId: "573038013067",
            appId: "1:573038013067:web:db6a78e8370d33b07a828e",
            measurementId: "G-T68CEZS4YC"
        };
        
        // Initialize Firebase
        const app = firebase.initializeApp(prodConfig);
        const auth = firebase.auth();
        const functions = firebase.functions();

        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            auth.useEmulator('http://127.0.0.1:9090');
            functions.useEmulator('127.0.0.1', 5011);
            console.log("🔌 Connected to Firebase Local Emulators");
        }
        
        const ADMIN_EMAIL = 'admin@elnazer-edu.com';

        // ==========================================
        // 2. AUTHENTICATION LOGIC
        // ==========================================
        const loginScreen = document.getElementById('loginScreen');
        const adminPanel = document.getElementById('adminPanel');
        const loginError = document.getElementById('loginError');

        function showError(msg) {
            loginError.innerText = msg;
            loginError.classList.remove('hidden');
        }

        // Listen for Auth State
        auth.onAuthStateChanged((user) => {
            if (user) {
                // FIREWALL CHECK
                if (user.email === ADMIN_EMAIL) {
                    // Allowed
                    loginScreen.classList.add('hidden');
                    adminPanel.classList.remove('hidden');
                } else {
                    // Blocked
                    auth.signOut();
                    showError('Access Denied. Your email is not authorized.');
                }
            } else {
                loginScreen.classList.remove('hidden');
                adminPanel.classList.add('hidden');
            }
        });

        // Login Action
        document.getElementById('loginBtn').addEventListener('click', async () => {
            const email = document.getElementById('adminEmail').value.trim();
            const password = document.getElementById('adminPassword').value;
            loginError.classList.add('hidden');
            
            if (!password) {
                showError('يرجى إدخال كلمة المرور');
                return;
            }
            if (email !== ADMIN_EMAIL) {
                showError('غير مصرح لك بالدخول');
                return;
            }
            
            const btn = document.getElementById('loginBtn');
            btn.innerHTML = '<i class="ri-loader-4-line animate-spin"></i> جاري التحقق...';
            btn.disabled = true;

            try {
                await auth.signInWithEmailAndPassword(email, password);
                // The onAuthStateChanged listener will handle the UI switch
            } catch (err) {
                console.error(err);
                showError('كلمة المرور غير صحيحة أو الحساب غير موجود.');
            } finally {
                btn.innerHTML = '<i class="ri-login-circle-line"></i> تسجيل الدخول';
                btn.disabled = false;
            }
        });

        // Logout Action
        document.getElementById('logoutBtn').addEventListener('click', () => {
            auth.signOut();
        });

        // ==========================================
        // 3. GENERATION & PRINTING LOGIC
        // ==========================================
        const motivationQuotes = [
            "أنت بطل قصتك", "لا تستسلم أبداً", "استمر في التقدم", 
            "النجاح يليق بك", "حلمك يستحق التعب", "إياك أن تيأس", 
            "العلم نور دروبك", "المستقبل بانتظارك", "تعب اليوم راحة الغد"
        ];

        function generateCardId() {
            // Generates something like NAZ-7F2B9D4A
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let id = 'NAZ-';
            for (let i = 0; i < 8; i++) {
                id += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return id;
        }

        function generateAndPrintGenericCards() {
            const countInput = document.getElementById('cardsCountInput');
            let count = parseInt(countInput.value) || 50;
            
            if (count > 1000) count = 1000;
            if (count < 1) count = 1;
            countInput.value = count;

            const container = document.getElementById('printCardsContainer');
            container.innerHTML = '';
            
            // Show it just for generating
            container.style.display = 'grid';

            for (let i = 0; i < count; i++) {
                const cardId = generateCardId();
                let randomQuote = motivationQuotes[Math.floor(Math.random() * motivationQuotes.length)];

                const card = document.createElement('div');
                card.className = 'generic-card';
                card.innerHTML = `
                    <div id="generic-qr-${cardId}"></div>
                    <div style="font-family: 'Courier New', Courier, monospace; font-size: 11px; font-weight: 900; margin-top: 6px; color: #000000; letter-spacing: 1px; text-align: center;">${cardId}</div>
                    <div style="font-size: 9px; font-weight: bold; margin-top: 3px; color: #666; text-align: center;">${randomQuote}</div>
                `;
                container.appendChild(card);

                // Generate QR code inside the card
                new QRCode(card.querySelector(`#generic-qr-${cardId}`), {
                    text: cardId,
                    width: 100,
                    height: 100,
                    colorDark: "#000000",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.H
                });
            }

            // Open print window
            setTimeout(() => {
                window.print();
                // Hide it back from DOM so it doesn't break normal flow if css fails
                container.style.display = 'none';
            }, 500);
        }
        async function createNewCenter() {
            const name = document.getElementById('centerNameInput').value.trim();
            const phone = document.getElementById('centerPhoneInput').value.trim();
            const password = document.getElementById('centerPasswordInput').value.trim();

            if (!name || !phone || !password) {
                alert('الرجاء إدخال جميع بيانات السنتر.');
                return;
            }

            try {
                const createCenterFn = functions.httpsCallable('createCenter');
                await createCenterFn({ centerName: name, centerPhone: phone, password: password });
                alert('✅ تم إنشاء السنتر بنجاح!');
                document.getElementById('centerNameInput').value = '';
                document.getElementById('centerPhoneInput').value = '';
            } catch (err) {
                console.error(err);
                alert('خطأ أثناء إنشاء السنتر: ' + err.message);
            }
        }

        async function linkTeacherToCenter() {
            const teacherPhone = document.getElementById('linkTeacherPhoneInput').value.trim();
            const centerPhone = document.getElementById('linkCenterPhoneInput').value.trim();

            if (!teacherPhone || !centerPhone) {
                alert('الرجاء إدخال رقم المدرس ورقم السنتر.');
                return;
            }

            try {
                const addTeacherToCenterFn = functions.httpsCallable('addTeacherToCenter');
                await addTeacherToCenterFn({ centerId: centerPhone, teacherId: teacherPhone });
                alert('✅ تم ربط المدرس بالسنتر بنجاح!');
                document.getElementById('linkTeacherPhoneInput').value = '';
            } catch (err) {
                console.error(err);
                alert('خطأ أثناء ربط المدرس: ' + err.message);
            }
        }
    