document.addEventListener('DOMContentLoaded', () => {
    
    // --- 0. Element & State Declarations (Top of file to prevent hoisting ReferenceErrors) ---
    const themeToggleBtn = document.getElementById('themeToggle');
    const body = document.body;
    const langToggleBtn = document.getElementById('langToggle');
    const htmlElement = document.documentElement;

    const pricingSlider = document.getElementById('pricingSlider');
    const sliderStudentCount = document.getElementById('sliderStudentCount');
    const calcStudentPrice = document.getElementById('calcStudentPrice');
    const calcDiscountText = document.getElementById('calcDiscountText');
    const calcTotalPrice = document.getElementById('calcTotalPrice');

    // Live Feed elements
    const heroStudentFeed = document.getElementById('heroStudentFeed');
    const heroAttendanceCount = document.getElementById('heroAttendanceCount');
    const attendanceAlertWidget = document.getElementById('attendanceAlertWidget');
    const attendanceAlertText = document.getElementById('attendanceAlertText');

    // Feature Tabs elements
    const featureTabBtn1 = document.getElementById('featureTabBtn1');
    const featureTabBtn2 = document.getElementById('featureTabBtn2');
    const featureTabBtn3 = document.getElementById('featureTabBtn3');
    const featureInteractiveScreen = document.getElementById('featureInteractiveScreen');

    // Testimonials elements
    const reviewAuthorName = document.getElementById('reviewAuthorName');
    const reviewSubject = document.getElementById('reviewSubject');
    const reviewContentText = document.getElementById('reviewContentText');
    const submitReviewBtn = document.getElementById('submitReviewBtn');
    const testimonialsGrid = document.getElementById('testimonialsGrid');

    // Parent App elements
    const parentPhoneScreen = document.getElementById('parentPhoneScreen');

    // State
    let currentLang = localStorage.getItem('lang') || 'ar';
    let currentActiveTab = 1;
    let currentPhonePage = 1; // 1: Attendance, 2: Grades, 3: Schedule
    let billingCycle = 'semester'; // 'semester' or 'year'
    let simulatedCount = 124;
    let studentIndex = 0;

    const simulatedStudents = [
        { ar: "عبد الرحمن علي", en: "Abdulrahman Ali" },
        { ar: "يوسف أحمد", en: "Youssef Ahmed" },
        { ar: "كريم حسام", en: "Karim Hossam" },
        { ar: "زياد خالد", en: "Ziad Khaled" },
        { ar: "عمر محمد", en: "Omar Mohamed" },
        { ar: "ياسر مصطفى", en: "Yasser Moustafa" },
        { ar: "محمد أحمد", en: "Mohamed Ahmed" }
    ];

    // --- 1. Theme Toggle (Dark / Light) ---
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        body.classList.add('dark-mode');
    } else {
        body.classList.remove('dark-mode');
    }

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            body.classList.toggle('dark-mode');
            const isDark = body.classList.contains('dark-mode');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
        });
    }

    // --- 2. Language Dictionary & Toggle ---
    const i18n = {
        ar: {
            page_title: 'الناظر - المعلم الذكي',
            nav_about: 'عن المنصة',
            nav_features: 'المميزات',
            nav_pricing: 'الأسعار',
            nav_download: 'التطبيقات',
            nav_enroll: 'ابدأ الآن',
            nav_status: 'متصل',
            hero_badge: '✨ الإصدار الجديد 2.0',
            hero_live_teachers: '4,210 معلماً متصل الآن يباشرون أعمالهم',
            hero_title_1: 'منصة الناظر<span class="logo-dot">.</span> لإدارة التعليم',
            hero_title_2: 'وداعاً للأعباء الورقية واليدوية',
            hero_subtitle: 'المعلم المحترف يستحق نظاماً محترفاً. منصة الناظر تمنحك القوة والتحكم المطلق لإدارة مجموعاتك الدراسية وحصصك، وإعداد وتصحيح الامتحانات، ومتابعة درجات وغياب الطلاب تلقائياً، مع ربط أولياء الأمور فوريًا بكل التفاصيل لتتفرغ تماماً للتدريس والإبداع.',
            hero_btn_primary: 'ابدأ مجاناً الآن',
            hero_btn_secondary: 'شاهد المميزات',
            stat_students: 'طالب مسجل',
            stat_teachers: 'معلم محترف',
            stat_uptime: 'استقرار الخدمة',
            widget_attendance: 'تم تسجيل غياب (أحمد خالد) وإرسال إشعار فوري لولي أمره.',
            widget_grades: 'كشف الدرجات',
            widget_exam_avg: 'متوسط الامتحان:',
            mockup_dash_title: 'لوحة تحكم المعلم - الناظر',
            mockup_stat_1: 'حضور اليوم',
            mockup_stat_2: 'حالة الحصة',
            mockup_alert_title: 'تم رصد الدرجات',
            mockup_alert_desc: 'الصف الأول الثانوي',
            features_tag: 'المميزات الأساسية للمنصة',
            features_title_full: 'كل ما تحتاجه لإدارة حصصك <span class="text-[#F2CE5A]">بلمسة واحدة</span>',
            features_subtitle: 'بدلاً من الحديث النظري، تفاعل مع محاكي لوحة تحكم المعلم الفوري واكتشف سهولة وبساطة النظام.',
            feature_tab_1_title: 'منظومة الحضور والغياب (QR)',
            feature_tab_1_desc: 'اضغط لتجربة تسجيل غياب وحضور الطلاب يدوياً ومحاكاة إرسال الإشعار الفوري لولي الأمر.',
            feature_tab_2_title: 'الامتحانات والواجبات الرقمية',
            feature_tab_2_desc: 'أنشئ بنك أسئلة واختبارات لطلابك، وصحح الإجابات ورصد الدرجات في ثوانٍ معدودة.',
            feature_tab_3_title: 'تحليل الدرجات والنسب',
            feature_tab_3_desc: 'راقب مستوى مجموعاتك بنسب مئوية دقيقة ورسوم بيانية تنمو أمامك بشكل تفاعلي.',
            mockup_profile_title: 'ملف الطالب',
            mockup_student_name: 'عمر عبد الله',
            mockup_student_grade: 'الصف الثاني الثانوي',
            mockup_student_gpa: 'المعدل',
            mockup_student_att: 'الغياب',
            mockup_btn_msg: 'إرسال رسالة لولي الأمر',
            testimonials_tag: 'شركاء النجاح',
            testimonials_title: 'ماذا يقول <span class="text-[#F2CE5A]">المعلمون</span> عنا؟',
            testimonials_subtitle: 'انضم لأكثر من 2000 معلم محترف يعتمدون على الناظر يومياً لتسيير شؤونهم التعليمية.',
            testimonial_1_quote: '"منذ بدأت باستخدام الناظر، وفرت ما لا يقل عن 10 ساعات أسبوعياً كانت تضيع في رصد الغياب وتصحيح الواجبات وتجهيز كشوف الدرجات. الطلاب أصبحوا أكثر التزاماً بفضل تقارير أولياء الأمور الفورية."',
            testimonial_1_author: 'أ. محمد عادل',
            testimonial_1_sub: 'مدرس أول فيزياء',
            testimonial_2_quote: '"التطبيق ممتاز جداً، وتجربة تواصل ولي الأمر مباشرة عند دخول الطالب المجموعات منحتنا مصداقية ضخمة. الامتحانات الأسبوعية والتصحيح التلقائي هما ميزتا المفضلة بلا منازع."',
            testimonial_2_author: 'أ. سارة أحمد',
            testimonial_2_sub: 'مدرسة كيمياء',
            parent_app_tag: 'أولياء الأمور',
            parent_app_title: 'تطبيق خاص لـ <span class="text-[#F2CE5A]">أولياء الأمور</span>',
            parent_app_desc: 'لا مزيد من التقارير الورقية! وفرنا تطبيقاً مستقلاً يربط ولي الأمر بك لحظة بلحظة لمتابعة مسيرة ابنه التعليمية بشفافية تامة.',
            parent_app_li1_title: 'متابعة الحضور والانصراف',
            parent_app_li1_desc: 'إشعار فوري عند وصول الطالب للحصة.',
            parent_app_li2_title: 'تقارير الدرجات والامتحانات',
            parent_app_li2_desc: 'متابعة فورية لأداء الطالب في جميع الاختبارات الأسبوعية.',
            mockup_app_title: 'الناظر',
            mockup_app_subtitle: 'ولي الأمر',
            mockup_app_alert_title: 'تم تسجيل الحضور',
            mockup_app_alert_time: 'منذ دقيقتين',
            mockup_app_alert_desc: 'حضر الطالب أحمد حصة الرياضيات.',
            mockup_app_exam: 'نتيجة الفيزياء',
            mockup_app_schedule: 'جدول الغد',
            mockup_app_subj1: 'لغة عربية',
            mockup_app_subj2: 'كيمياء',
            faq_tag: 'الأسئلة الشائعة',
            faq_title: 'هل لديك أي <span class="text-[#F2CE5A]">استفسارات؟</span>',
            faq_subtitle: 'إليك إجابات لأكثر الأسئلة الشائعة التي يطرحها المعلمون حول كيفية عمل منصة الناظر.',
            faq_1_q: 'كيف يسجل الطلاب حضورهم؟',
            faq_1_a: 'يمكن للطلاب تسجيل حضورهم بسهولة بالغة وبأكثر من طريقة؛ إما عبر كود مخصص لكل طالب، أو مسح رمز استجابة سريع (QR) خاص بالمجموعة عند الدخول، أو تسجيله يدوياً وبسرعة شديدة بضغطة زر واحدة من لوحة تحكم المعلم.',
            faq_2_q: 'هل تطبيق أولياء الأمور مجاني بالكامل؟',
            faq_2_a: 'نعم، تطبيق أولياء الأمور مجاني تماماً للتحميل والاستخدام على الهواتف الذكية (iOS و Android)، ويمكن لجميع أولياء الأمور تتبع حضور وغياب ودرجات أبنائهم فوراً وبدون أي أعباء أو رسوم إضافية.',
            calc_title: 'حاسبة الأسعار التفاعلية',
            calc_desc: 'قم بتحريك المؤشر لترى كيف يقل السعر الإجمالي للطالب مع زيادة عدد الطلاب.',
            calc_student_count: 'عدد الطلاب:',
            calc_student_unit: 'طالب',
            calc_unit_price: 'السعر للطالب',
            calc_savings: 'نسبة الخصم',
            calc_total_monthly: 'إجمالي الاشتراك الشهري',
            pricing_title: 'استثمار <span class="text-[#F2CE5A]">ذكي</span> لنجاحك',
            pricing_subtitle: 'نقدم لك باقات شفافة ومدروسة بدون أي تكاليف خفية لتناسب طموحاتك.',
            pricing_ribbon: 'عرض محدود',
            pricing_plan_name: 'الاشتراك الموحد',
            pricing_period: '/ للطالب',
            pricing_regular: 'بدلاً من',
            pricing_feature_1: 'وصول كامل للوحة تحكم المعلم',
            pricing_feature_2: 'تطبيقات أولياء الأمور (iOS & Android)',
            pricing_feature_3: 'عدد لا محدود من الامتحانات',
            pricing_btn: 'اغتنم العرض الآن',
            footer_desc: 'الناظر هو منصتك الشاملة لإدارة العملية التعليمية باحترافية، يربط المعلم بالطالب وولي الأمر في منظومة ذكية متكاملة.',
            footer_links_title: 'روابط سريعة',
            footer_login: 'تسجيل الدخول',
            footer_apps_title: 'التطبيقات للتنزيل',
            footer_copy: '© 2026 جميع الحقوق محفوظة لمنصة الناظر التعليمية.',
            footer_privacy: 'سياسة الخصوصية',
            footer_terms: 'شروط الاستخدام',
            hero_live_stream_label: 'بث الحضور المباشر (QR):',
            live_status_checkin: 'تم الحضور',
            testi_form_title: 'شاركنا رأيك بالمنصة'
        },
        en: {
            page_title: 'الناظر - Smart Teacher',
            nav_about: 'About',
            nav_features: 'Features',
            nav_pricing: 'Pricing',
            nav_download: 'Apps',
            nav_enroll: 'Get Started',
            nav_status: 'Online',
            hero_badge: '✨ New Version 2.0',
            hero_live_teachers: '4,210 teachers online right now managing their classes',
            hero_title_1: 'Elnazer<span class="logo-dot">.</span> Platform for Education',
            hero_title_2: 'Say Goodbye to Paper & Manual Tasks',
            hero_subtitle: 'Professional teachers deserve a professional system. الناظر platform grants you absolute control to manage your schedules, groups, create and grade exams, and automatically track student performance, while keeping parents updated in real-time so you can focus entirely on teaching.',
            hero_btn_primary: 'Start Free Now',
            hero_btn_secondary: 'See Features',
            stat_students: 'Students Registered',
            stat_teachers: 'Professional Teachers',
            stat_uptime: 'Service Uptime',
            widget_attendance: 'Attendance recorded for (Ahmed Khaled) and instant notification sent to parent.',
            widget_grades: 'Grade Register',
            widget_exam_avg: 'Exam Average:',
            mockup_dash_title: 'Teacher Dashboard - الناظر',
            mockup_stat_1: 'Today\'s Attendance',
            mockup_stat_2: 'Session Status',
            mockup_alert_title: 'Grades Submitted',
            mockup_alert_desc: 'Grade 10 Physics',
            features_tag: 'Core Features',
            features_title_full: 'Everything You Need to Manage Classes <span class="text-[#F2CE5A]">In One Touch</span>',
            features_subtitle: 'Instead of theory, interact with our live teacher dashboard preview directly to experience system elegance.',
            feature_tab_1_title: 'QR Attendance System',
            feature_tab_1_desc: 'Click to test student check-in simulation and trigger parent notification alerts.',
            feature_tab_2_title: 'Digital Exams & Homeworks',
            feature_tab_2_desc: 'Create question banks and tests for your students, grade answers and record scores in seconds.',
            feature_tab_3_title: 'Grades Performance Analytics',
            feature_tab_3_desc: 'Monitor group performance with live progress rates and dynamic charts.',
            mockup_profile_title: 'Student Profile',
            mockup_student_name: 'Omar Abdullah',
            mockup_student_grade: 'Grade 11',
            mockup_student_gpa: 'GPA',
            mockup_student_att: 'Absent',
            mockup_btn_msg: 'Message Parent',
            testimonials_tag: 'Partners in Success',
            testimonials_title: 'What do <span class="text-[#F2CE5A]">teachers</span> say about us?',
            testimonials_subtitle: 'Join over 2,000 professional teachers relying on الناظر daily to manage their educational work.',
            testimonial_1_quote: '"Since using الناظر, I save at least 10 hours a week previously wasted on recording attendance, correcting homework, and preparing grade sheets. Students are now more committed thanks to instant reports sent to parents."',
            testimonial_1_author: 'Mr. Mohamed Adel',
            testimonial_1_sub: 'Physics Teacher',
            testimonial_2_quote: '"The app is outstanding. The real-time notification sent to parents when students arrive gives us huge credibility. Weekly exams and auto-grading are definitely my favorite features."',
            testimonial_2_author: 'Ms. Sarah Ahmed',
            testimonial_2_sub: 'Chemistry Teacher',
            parent_app_tag: 'For Parents',
            parent_app_title: 'Dedicated <span class="text-[#F2CE5A]">Parents</span> App',
            parent_app_desc: 'No more paper reports! We provide a standalone app connecting parents to you instantly, ensuring total transparency.',
            parent_app_li1_title: 'Attendance Tracking',
            parent_app_li1_desc: 'Instant notification when the student arrives.',
            parent_app_li2_title: 'Grade Reports',
            parent_app_li2_desc: 'Live tracking of the student\'s exam performance.',
            mockup_app_title: 'الناظر',
            mockup_app_subtitle: 'Parent App',
            mockup_app_alert_title: 'Attendance Recorded',
            mockup_app_alert_time: '2 mins ago',
            mockup_app_alert_desc: 'Ahmed attended the Math session.',
            mockup_app_exam: 'Physics Result',
            mockup_app_schedule: 'Tomorrow\'s Schedule',
            mockup_app_subj1: 'Arabic',
            mockup_app_subj2: 'Chemistry',
            faq_tag: 'Frequently Asked Questions',
            faq_title: 'Do you have <span class="text-[#F2CE5A]">any questions?</span>',
            faq_subtitle: 'Here are answers to the most common questions teachers ask about how الناظر works.',
            faq_1_q: 'How do students check in?',
            faq_1_a: 'Students can check in easily in multiple ways: via a personalized student ID code, scanning a class QR code upon entry, or manually recorded instantly by the teacher via their dashboard.',
            faq_2_q: 'Is the parent app completely free?',
            faq_2_a: 'Yes, the parent app is 100% free to download and use on iOS and Android devices, allowing all parents to follow up on attendance, marks, and notifications at no cost.',
            calc_title: 'Interactive Price Calculator',
            calc_desc: 'Drag the slider to see how the price per student decreases as you add more students.',
            calc_student_count: 'Students:',
            calc_student_unit: 'students',
            calc_unit_price: 'Price/Student',
            calc_savings: 'Discount Rate',
            calc_total_monthly: 'Total Monthly Cost',
            pricing_title: '<span class="text-[#F2CE5A]">Smart</span> Investment',
            pricing_subtitle: 'We offer transparent, well-studied plans with no hidden costs to match your ambitions.',
            pricing_ribbon: 'Limited Offer',
            pricing_plan_name: 'Unified Plan',
            pricing_period: '/ student',
            pricing_regular: 'Instead of',
            pricing_feature_1: 'Full access to Teacher Dashboard',
            pricing_feature_2: 'Parents Apps (iOS & Android)',
            pricing_feature_3: 'Unlimited Exams & Sessions',
            pricing_btn: 'Claim Offer Now',
            footer_desc: 'الناظر is your comprehensive educational management platform, intelligently connecting teachers, students, and parents.',
            footer_links_title: 'Quick Links',
            footer_login: 'Login',
            footer_apps_title: 'Download Apps',
            footer_copy: '© 2026 الناظر Edu. All rights reserved.',
            footer_privacy: 'Privacy Policy',
            footer_terms: 'Terms of Use',
            hero_live_stream_label: 'Live Check-in Stream (QR):',
            live_status_checkin: 'Checked in',
            testi_form_title: 'Share your feedback'
        }
    };

    applyLanguage(currentLang);

    if (langToggleBtn) {
        langToggleBtn.addEventListener('click', () => {
            currentLang = currentLang === 'ar' ? 'en' : 'ar';
            localStorage.setItem('lang', currentLang);
            applyLanguage(currentLang);
        });
    }

    function applyLanguage(lang) {
        if (htmlElement) {
            htmlElement.setAttribute('lang', lang);
            htmlElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
        }
        if (langToggleBtn) {
            langToggleBtn.textContent = lang === 'ar' ? 'EN' : 'ع';
        }

        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (i18n[lang] && i18n[lang][key]) {
                el.innerHTML = i18n[lang][key];
            }
        });
        
        calculatePricing();
        switchFeatureTab(currentActiveTab);
        switchPhonePage(currentPhonePage);
    }

    // --- 3. Scroll Reveal Animations ---
    const revealElements = document.querySelectorAll('.reveal-up, .reveal-left, .reveal-right');

    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('in-view');
                observer.unobserve(entry.target);
            }
        });
    }, {
        root: null,
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });

    revealElements.forEach(el => {
        revealObserver.observe(el);
    });

    // --- 4. Smooth Scrolling for Anchor Links ---
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                const navElement = document.getElementById('navbar');
                const navHeight = navElement ? navElement.offsetHeight : 0;
                const elementPosition = targetElement.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - navHeight;
  
                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // --- 5. Interactive FAQ Accordion Logic ---
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        const trigger = item.querySelector('.faq-trigger');
        if (trigger) {
            trigger.addEventListener('click', () => {
                const isActive = item.classList.contains('active');
                faqItems.forEach(i => i.classList.remove('active'));
                if (!isActive) {
                    item.classList.add('active');
                }
            });
        }
    });

    // --- 6. Pricing Slider Calculator Logic ---
    function calculatePricing() {
        if (!pricingSlider || !sliderStudentCount || !calcStudentPrice || !calcDiscountText || !calcTotalPrice) return;
        const count = parseInt(pricingSlider.value);
        sliderStudentCount.textContent = count;

        let unitPrice = 1.0;
        let discount = "0%";

        if (count <= 100) {
            unitPrice = 1.0;
            discount = "0%";
        } else if (count <= 300) {
            unitPrice = 0.85;
            discount = "15%";
        } else if (count <= 600) {
            unitPrice = 0.70;
            discount = "30%";
        } else {
            unitPrice = 0.50;
            discount = "50%";
        }

        let total = count * unitPrice;
        
        // If Year is active, multiply by 2 semesters and apply 15% discount
        if (billingCycle === 'year') {
            total = total * 2 * 0.85;
            discount = `${discount} + 15%`;
        }

        calcStudentPrice.textContent = unitPrice.toFixed(2);
        calcDiscountText.textContent = discount;
        
        const roundedTotal = Math.round(total);
        calcTotalPrice.textContent = roundedTotal;
        
        const cardTotal = document.getElementById('pricingCardTotalPrice');
        if (cardTotal) {
            cardTotal.textContent = `$${roundedTotal}`;
        }
    }

    // Toggle event listeners (Unmatched dela3)
    const toggleSemSingle = document.getElementById('toggleSemesterSingle');
    const toggleSemFull = document.getElementById('toggleSemesterFull');
    const billingPeriodLabel = document.getElementById('billingPeriodLabel');

    if (toggleSemSingle && toggleSemFull) {
        toggleSemSingle.addEventListener('click', () => {
            toggleSemSingle.style.background = '#F2CE5A';
            toggleSemSingle.style.color = '#000';
            toggleSemFull.style.background = 'transparent';
            toggleSemFull.style.color = 'inherit';
            billingCycle = 'semester';
            if (billingPeriodLabel) {
                billingPeriodLabel.textContent = currentLang === 'ar' ? '/ للترم الواحد' : '/ per semester';
            }
            calculatePricing();
        });

        toggleSemFull.addEventListener('click', () => {
            toggleSemFull.style.background = '#F2CE5A';
            toggleSemFull.style.color = '#000';
            toggleSemSingle.style.background = 'transparent';
            toggleSemSingle.style.color = 'inherit';
            billingCycle = 'year';
            if (billingPeriodLabel) {
                billingPeriodLabel.textContent = currentLang === 'ar' ? '/ للعام الكامل (ترمين)' : '/ full academic year';
            }
            calculatePricing();
        });
    }

    if (pricingSlider) {
        pricingSlider.addEventListener('input', calculatePricing);
        calculatePricing();
    }

    // --- 7. Live Student Checkin Simulation (Hero section) ---
    function runSimulation() {
        if (!heroStudentFeed || !heroAttendanceCount) return;
        
        const currentStudent = simulatedStudents[studentIndex];
        const studentName = currentLang === 'ar' ? currentStudent.ar : currentStudent.en;
        const statusLabel = currentLang === 'ar' ? 'تم الحضور' : 'Checked in';

        simulatedCount++;
        heroAttendanceCount.textContent = simulatedCount;

        const newItem = document.createElement('div');
        newItem.className = 'live-stream-item mockup-card-theme';
        newItem.style.padding = '8px 12px';
        newItem.style.borderRadius = '8px';
        newItem.style.display = 'flex';
        newItem.style.justifyContent = 'space-between';
        newItem.style.alignItems = 'center';
        newItem.style.background = 'rgba(16, 185, 129, 0.05)';
        newItem.innerHTML = `
            <span class="mockup-text text-xs font-bold" style="font-family:'Cairo';">${studentName}</span>
            <span style="color:#10b981; font-size:10px; font-weight:bold;"><i class="fa-solid fa-circle-check"></i> ${statusLabel}</span>
        `;

        heroStudentFeed.insertBefore(newItem, heroStudentFeed.firstChild);
        if (heroStudentFeed.children.length > 3) {
            heroStudentFeed.removeChild(heroStudentFeed.lastChild);
        }

        if (attendanceAlertWidget && attendanceAlertText) {
            const msg = currentLang === 'ar' ? `حضر الطالب ${studentName} الآن.` : `${studentName} checked in just now.`;
            attendanceAlertText.textContent = msg;
            
            attendanceAlertWidget.classList.remove('opacity-0', 'scale-95');
            attendanceAlertWidget.classList.add('opacity-100', 'scale-100');
            
            setTimeout(() => {
                attendanceAlertWidget.classList.remove('opacity-100', 'scale-100');
                attendanceAlertWidget.classList.add('opacity-0', 'scale-95');
            }, 1800);
        }

        studentIndex = (studentIndex + 1) % simulatedStudents.length;
    }

    setInterval(runSimulation, 3500);

    // --- 8. Interactive Features Switcher Live Mockups ---
    function switchFeatureTab(tabIndex) {
        currentActiveTab = tabIndex;
        if (!featureInteractiveScreen) return;

        // Reset all borders & glow classes
        [featureTabBtn1, featureTabBtn2, featureTabBtn3].forEach(btn => {
            if (btn) {
                btn.classList.remove('active-feature-tab-gold', 'active-feature-tab-blue', 'active-feature-tab-purple');
            }
        });

        // Activate clicked button border & custom glowing class
        const activeBtn = document.getElementById(`featureTabBtn${tabIndex}`);
        if (activeBtn) {
            if (tabIndex === 1) activeBtn.classList.add('active-feature-tab-gold');
            if (tabIndex === 2) activeBtn.classList.add('active-feature-tab-blue');
            if (tabIndex === 3) activeBtn.classList.add('active-feature-tab-purple');
        }

        // Inject content
        if (tabIndex === 1) {
            // Tab 1: Attendance Sim (QR Smart Card Checkin Flow)
            featureInteractiveScreen.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <span class="mockup-text font-bold text-xs" style="color:#F2CE5A;"><i class="fa-solid fa-qrcode"></i> ${currentLang === 'ar' ? 'سجل الحضور الذكي بالـ QR' : 'QR Smart Attendance System'}</span>
                    <span style="font-size:9px; background:rgba(242,206,90,0.1); color:#F2CE5A; padding:2px 8px; border-radius:50px; font-weight:bold;">Active Scanner</span>
                </div>
                
                <!-- Scanner Simulated Screen Frame -->
                <div class="mockup-card-theme" style="flex:1; border-radius:12px; padding:12px; display:flex; flex-direction:column; justify-content:center; min-height:180px; position:relative; overflow:hidden;" id="attendanceScanScreen">
                    <div style="font-size:11px; text-align:center; font-family:'Cairo'; line-height:1.6;" class="mockup-text" id="attendanceScanText">
                        ${currentLang === 'ar' ? 'وجه هاتف الطالب ببطاقة الـ QR الكود للمسح التلقائي.' : 'Point student QR code card at the system screen to scan.'}
                    </div>
                </div>

                <!-- Simulate Scan Action Button -->
                <button id="triggerAttendanceScanBtn" style="width:100%; margin-top:12px; padding:10px; border-radius:10px; background:#F2CE5A; color:#000; font-weight:black; border:none; cursor:pointer; font-size:12px;">
                    ⚡ ${currentLang === 'ar' ? 'محاكاة مسح QR الطالب' : 'Simulate Scanning QR Code'}
                </button>
            `;

            if (!document.getElementById('laserScanStyles')) {
                const styleSheet = document.createElement("style");
                styleSheet.id = 'laserScanStyles';
                styleSheet.innerText = `
                    @keyframes laserScan {
                        0% { top: 0%; }
                        50% { top: 100%; }
                        100% { top: 0%; }
                    }
                    @keyframes redPenCorrect {
                        0% { transform: scale(0.5); opacity: 0; }
                        100% { transform: scale(1.1); opacity: 1; }
                    }
                `;
                document.head.appendChild(styleSheet);
            }

            const scanBtn = featureInteractiveScreen.querySelector('#triggerAttendanceScanBtn');
            const screen = featureInteractiveScreen.querySelector('#attendanceScanScreen');

            if (scanBtn) {
                scanBtn.addEventListener('click', () => {
                    scanBtn.disabled = true;
                    scanBtn.style.background = '#64748b';
                    scanBtn.textContent = currentLang === 'ar' ? 'جاري المسح...' : 'Scanning...';

                    if (screen) {
                        screen.innerHTML = `
                            <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; gap:8px; height:100%;">
                                <div style="width:100%; height:4px; background:rgba(242,206,90,0.1); border-radius:2px; overflow:hidden; position:relative;">
                                    <div style="position:absolute; width:40%; height:100%; background:#F2CE5A; animation: laserScan 1.5s infinite ease-in-out;"></div>
                                </div>
                                <span style="font-size:10px; color:#aaa;">${currentLang === 'ar' ? 'جاري فحص وتأكيد كود الـ QR...' : 'Verifying student QR security ID...'}</span>
                            </div>
                        `;
                    }

                    setTimeout(() => {
                        const studentName = currentLang === 'ar' ? 'أحمد خالد' : 'Ahmed Khaled';
                        const groupLabel = currentLang === 'ar' ? 'مجموعة الأحد - 6 مساءً' : 'Sunday Group - 6 PM';
                        if (screen) {
                            screen.innerHTML = `
                                <div style="display:flex; flex-direction:column; align-items:center; gap:8px; animation: slideInFade 0.4s forwards; text-align:center;">
                                    <div style="width:50px; height:50px; border-radius:50%; background:linear-gradient(135deg, #F2CE5A, #f59e0b); display:flex; align-items:center; justify-content:center; font-size:24px; color:#000; font-weight:bold; position:relative;">
                                        <i class="fa-solid fa-circle-user"></i>
                                        <div style="position:absolute; bottom:-3px; right:-3px; width:18px; height:18px; background:#10b981; border-radius:50%; border:2px solid #27272a; display:flex; align-items:center; justify-content:center; font-size:9px; color:#fff;">✔</div>
                                    </div>
                                    <div style="font-size:12px; font-weight:bold;" class="mockup-text">${studentName}</div>
                                    <div style="font-size:10px; color:#aaa;">${groupLabel}</div>
                                    <div style="font-size:10px; background:rgba(16,185,129,0.15); color:#10b981; padding:4px 10px; border-radius:50px; font-weight:bold; margin-top:5px;">
                                        📱 ${currentLang === 'ar' ? 'تم إرسال إشعار الحضور لولي الأمر' : 'WhatsApp sent to parent'}
                                    </div>
                                </div>
                            `;
                        }
                        scanBtn.disabled = false;
                        scanBtn.style.background = '#F2CE5A';
                        scanBtn.textContent = currentLang === 'ar' ? 'محاكاة مسح QR الطالب' : 'Simulate Scanning QR Code';
                    }, 1800);
                });
            }

        } else if (tabIndex === 2) {
            // Tab 2: Digital Exams & Correcting simulation
            featureInteractiveScreen.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <span class="mockup-text font-bold text-sm" style="color:#3b82f6;"><i class="fa-solid fa-file-signature"></i> ${currentLang === 'ar' ? 'كشف درجات الاختبار' : 'Exam Grading List'}</span>
                    <span style="font-size:12px; font-weight:black; color:#3b82f6;"><span id="sheetGrade">0</span>/3</span>
                </div>
                <div style="flex:1; display:flex; flex-direction:column; gap:8px;" id="sheetQuestionsList">
                    <div class="mockup-card-theme" style="padding:10px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; position:relative;">
                        <span class="mockup-text text-xs">${currentLang === 'ar' ? 'س1: عاصمة مصر؟ (القاهرة)' : 'Q1: Capital of Egypt? (Cairo)'}</span>
                        <div id="qCorrect1" style="font-size:16px; font-weight:bold; color:#10b981; display:none;"><i class="fa-solid fa-circle-check"></i></div>
                    </div>
                    <div class="mockup-card-theme" style="padding:10px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; position:relative;">
                        <span class="mockup-text text-xs">${currentLang === 'ar' ? 'س2: 5 + 5 = 10؟ (نعم)' : 'Q2: 5 + 5 = 10? (Yes)'}</span>
                        <div id="qCorrect2" style="font-size:16px; font-weight:bold; color:#10b981; display:none;"><i class="fa-solid fa-circle-check"></i></div>
                    </div>
                    <div class="mockup-card-theme" style="padding:10px; border-radius:8px; display:flex; justify-content:space-between; align-items:center; position:relative;">
                        <span class="mockup-text text-xs">${currentLang === 'ar' ? 'س3: الشمس كوكب؟ (لا)' : 'Q3: Sun is a planet? (No)'}</span>
                        <div id="qCorrect3" style="font-size:16px; font-weight:bold; color:#10b981; display:none;"><i class="fa-solid fa-circle-check"></i></div>
                    </div>
                </div>
                <button id="triggerCorrectionSimulationBtn" style="width:100%; margin-top:15px; padding:10px; border-radius:10px; background:#3b82f6; color:#fff; font-weight:black; border:none; cursor:pointer; font-size:12px;">
                    📝 ${currentLang === 'ar' ? 'ابدأ رصد درجات الطالب وتصحيحها' : 'Start Grading and Correcting'}
                </button>
            `;

            const startBtn = featureInteractiveScreen.querySelector('#triggerCorrectionSimulationBtn');
            const gradeEl = featureInteractiveScreen.querySelector('#sheetGrade');
            const q1 = featureInteractiveScreen.querySelector('#qCorrect1');
            const q2 = featureInteractiveScreen.querySelector('#qCorrect2');
            const q3 = featureInteractiveScreen.querySelector('#qCorrect3');

            if (startBtn) {
                startBtn.addEventListener('click', () => {
                    startBtn.disabled = true;
                    startBtn.style.background = '#64748b';
                    startBtn.textContent = currentLang === 'ar' ? 'جاري الرصد والتصحيح...' : 'Grading...';

                    setTimeout(() => {
                        if (q1) { q1.style.display = 'block'; q1.style.animation = 'redPenCorrect 0.4s forwards'; }
                        if (gradeEl) gradeEl.textContent = '1';
                    }, 500);

                    setTimeout(() => {
                        if (q2) { q2.style.display = 'block'; q2.style.animation = 'redPenCorrect 0.4s forwards'; }
                        if (gradeEl) gradeEl.textContent = '2';
                    }, 1000);

                    setTimeout(() => {
                        if (q3) { q3.style.display = 'block'; q3.style.animation = 'redPenCorrect 0.4s forwards'; }
                        if (gradeEl) gradeEl.textContent = '3';
                        startBtn.textContent = currentLang === 'ar' ? 'تم رصد الدرجات وإرسال الإشعار! 🟢' : 'Grades registered & notification sent! 🟢';
                        startBtn.style.background = '#10b981';
                    }, 1500);
                });
            }

        } else if (tabIndex === 3) {
            // Tab 3: Performance Charts
            featureInteractiveScreen.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <span class="mockup-text font-bold text-sm">${currentLang === 'ar' ? 'تقييم درجات الفصل' : 'Class Grade Distribution'}</span>
                    <div style="display:flex; gap:5px;">
                        <button class="chart-tab active" id="chartGroupA" style="font-size:9px; padding:3px 8px; border-radius:4px; border:none; cursor:pointer; background:#a855f7; color:#fff; font-weight:bold;">${currentLang === 'ar' ? 'أولى أ' : '10A'}</button>
                        <button class="chart-tab" id="chartGroupB" style="font-size:9px; padding:3px 8px; border-radius:4px; border:none; cursor:pointer; background:#27272a; color:#fff;">${currentLang === 'ar' ? 'أولى ب' : '10B'}</button>
                    </div>
                </div>
                
                <!-- Simple Dynamic CSS Chart Bars -->
                <div style="display:flex; align-items:flex-end; gap:15px; height:160px; margin-bottom:15px; padding-top:10px;">
                    <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:5px; height:100%; justify-content:flex-end;">
                        <div style="width:100%; background:#a855f7; border-radius:4px 4px 0 0; transition:height 0.5s ease; height: 0;" id="chartBarA"></div>
                        <span style="font-size:9px;" class="mockup-subtext">${currentLang === 'ar' ? 'ممتاز' : 'Excellent'}</span>
                    </div>
                    <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:5px; height:100%; justify-content:flex-end;">
                        <div style="width:100%; background:#3b82f6; border-radius:4px 4px 0 0; transition:height 0.5s ease; height: 0;" id="chartBarB"></div>
                        <span style="font-size:9px;" class="mockup-subtext">${currentLang === 'ar' ? 'جيد جداً' : 'Very Good'}</span>
                    </div>
                    <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:5px; height:100%; justify-content:flex-end;">
                        <div style="width:100%; background:#F2CE5A; border-radius:4px 4px 0 0; transition:height 0.5s ease; height: 0;" id="chartBarC"></div>
                        <span style="font-size:9px;" class="mockup-subtext">${currentLang === 'ar' ? 'مقبول' : 'Passed'}</span>
                    </div>
                </div>
                <div style="font-size:9px; color:#9ca3af; text-align:center;">
                    ${currentLang === 'ar' ? 'اضغط على التبويبات لتعديل نسب الدرجات لكل فصل.' : 'Toggle classroom tabs to change statistics.'}
                </div>
            `;

            const barA = featureInteractiveScreen.querySelector('#chartBarA');
            const barB = featureInteractiveScreen.querySelector('#chartBarB');
            const barC = featureInteractiveScreen.querySelector('#chartBarC');
            const btnA = featureInteractiveScreen.querySelector('#chartGroupA');
            const btnB = featureInteractiveScreen.querySelector('#chartGroupB');

            setTimeout(() => {
                if (barA) barA.style.height = '85%';
                if (barB) barB.style.height = '60%';
                if (barC) barC.style.height = '40%';
            }, 50);

            if (btnA && btnB) {
                btnA.addEventListener('click', () => {
                    btnA.style.background = '#a855f7'; btnA.style.color = '#fff';
                    btnB.style.background = '#27272a'; btnB.style.color = '#fff';
                    if (barA) barA.style.height = '85%';
                    if (barB) barB.style.height = '60%';
                    if (barC) barC.style.height = '40%';
                });
                btnB.addEventListener('click', () => {
                    btnB.style.background = '#a855f7'; btnB.style.color = '#fff';
                    btnA.style.background = '#27272a'; btnA.style.color = '#fff';
                    if (barA) barA.style.height = '65%';
                    if (barB) barB.style.height = '85%';
                    if (barC) barC.style.height = '20%';
                });
            }
        }
    }

    // Bind triggers
    if (featureTabBtn1) featureTabBtn1.addEventListener('click', () => switchFeatureTab(1));
    if (featureTabBtn2) featureTabBtn2.addEventListener('click', () => switchFeatureTab(2));
    if (featureTabBtn3) featureTabBtn3.addEventListener('click', () => switchFeatureTab(3));

    // Initialize first tab
    switchFeatureTab(1);

    // --- 9. Submit Testimonial Review Form simulation ---
    if (submitReviewBtn) {
        submitReviewBtn.addEventListener('click', () => {
            const author = reviewAuthorName.value.trim();
            const subject = reviewSubject.value.trim() || (currentLang === 'ar' ? "معلم" : "Teacher");
            const content = reviewContentText.value.trim();

            if (!author || !content) {
                alert(currentLang === 'ar' ? "من فضلك املأ حقل الاسم ومحتوى الرأي!" : "Please fill out the name and review fields!");
                return;
            }

            const initials = author.substring(0, 2);
            const newCard = document.createElement('div');
            newCard.className = 'glass-card p-6 feature-card-theme hover:-translate-y-2 transition-transform duration-300 live-stream-item';
            newCard.style.borderRadius = '20px';
            newCard.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                    <div style="display:flex; gap:3px; color:#F2CE5A;">
                        <i class="fa-solid fa-star text-xs"></i>
                        <i class="fa-solid fa-star text-xs"></i>
                        <i class="fa-solid fa-star text-xs"></i>
                        <i class="fa-solid fa-star text-xs"></i>
                        <i class="fa-solid fa-star text-xs"></i>
                    </div>
                    <span style="font-size:9px; background:rgba(242,206,90,0.15); color:#F2CE5A; padding:2px 8px; border-radius:50px; font-weight:bold;">${currentLang === 'ar' ? 'رأي جديد' : 'New Review'}</span>
                </div>
                <p class="sub-text text-xs leading-relaxed mb-6 font-semibold">"${content}"</p>
                <div style="display:flex; align-items:center; gap:12px;">
                    <div style="width:36px; height:36px; border-radius:50%; background:#F2CE5A; color:#000; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:12px;">${initials}</div>
                    <div>
                        <h4 class="heading-text font-bold text-xs">${author}</h4>
                        <p class="sub-text text-[10px]">${subject}</p>
                    </div>
                    <span style="margin-right:auto; font-size:9px; color:#10b981; font-weight:bold;"><i class="fa-solid fa-circle-check"></i> موثق</span>
                </div>
            `;

            if (testimonialsGrid) {
                testimonialsGrid.insertBefore(newCard, testimonialsGrid.firstChild);
            }
            reviewAuthorName.value = '';
            reviewSubject.value = '';
            reviewContentText.value = '';

            alert(currentLang === 'ar' ? "تم إرسال رأيك بنناح وظهر أول الكروت التقييمية! 🎉" : "Review submitted successfully and added to the top! 🎉");
        });
    }

    // --- 10. Interactive Phone Mockup Simulator for Parent App ---
    function switchPhonePage(pageIndex) {
        currentPhonePage = pageIndex;
        if (!parentPhoneScreen) return;

        // Render phone view based on page index
        if (pageIndex === 1) {
            // View 1: Attendance Timeline Log
            parentPhoneScreen.innerHTML = `
                <!-- Phone Top Bar -->
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; font-size:11px; font-weight:bold;" class="mockup-text">
                    <span>الناظر - ولي الأمر</span>
                    <span style="font-size:9px; background:rgba(16,185,129,0.15); color:#10b981; padding:2px 8px; border-radius:50px;">مباشر</span>
                </div>

                <!-- Page Content (Attendance Timeline) -->
                <div style="flex:1; display:flex; flex-direction:column; gap:10px; overflow-y:auto; padding-bottom:5px;">
                    <div style="font-size:10px; color:#aaa; font-weight:bold; margin-bottom:2px;">${currentLang === 'ar' ? 'سجل حضور غياب الطالب:' : 'Student Attendance Timeline:'}</div>
                    
                    <div class="mockup-card-theme" style="padding:10px; border-radius:10px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div class="mockup-text text-[11px] font-bold">${currentLang === 'ar' ? 'حصة الفيزياء (الأحد)' : 'Physics Class (Sun)'}</div>
                            <div style="font-size:9px; color:#aaa;">25 يوليو - 6:02 مساءً</div>
                        </div>
                        <span style="font-size:10px; color:#10b981; font-weight:bold;"><i class="fa-solid fa-circle-check"></i> ${currentLang === 'ar' ? 'حضور' : 'Present'}</span>
                    </div>

                    <div class="mockup-card-theme" style="padding:10px; border-radius:10px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div class="mockup-text text-[11px] font-bold">${currentLang === 'ar' ? 'حصة الكيمياء (الثلاثاء)' : 'Chemistry Class (Tue)'}</div>
                            <div style="font-size:9px; color:#aaa;">20 يوليو - 4:15 مساءً</div>
                        </div>
                        <span style="font-size:10px; color:#ef4444; font-weight:bold;"><i class="fa-solid fa-circle-xmark"></i> ${currentLang === 'ar' ? 'غياب' : 'Absent'}</span>
                    </div>

                    <div class="mockup-card-theme" style="padding:10px; border-radius:10px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div class="mockup-text text-[11px] font-bold">${currentLang === 'ar' ? 'حصة الفيزياء (الأحد)' : 'Physics Class (Sun)'}</div>
                            <div style="font-size:9px; color:#aaa;">18 يوليو - 6:00 مساءً</div>
                        </div>
                        <span style="font-size:10px; color:#10b981; font-weight:bold;"><i class="fa-solid fa-circle-check"></i> ${currentLang === 'ar' ? 'حضور' : 'Present'}</span>
                    </div>
                </div>

                <!-- Phone Fixed Bottom Bar navigation -->
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:5px; border-top:1px solid rgba(150,150,150,0.1); padding-top:8px; margin-top:8px;">
                    <button class="phone-nav-btn active" id="phoneBtn1" style="font-size:10px; padding:6px; border-radius:8px; background:rgba(242,206,90,0.15); color:#F2CE5A; border:none; cursor:pointer; font-weight:bold; display:flex; flex-direction:column; align-items:center; gap:2px;">
                        <i class="fa-solid fa-user-check"></i>
                        <span>${currentLang === 'ar' ? 'الحضور' : 'Attendance'}</span>
                    </button>
                    <button class="phone-nav-btn" id="phoneBtn2" style="font-size:10px; padding:6px; border-radius:8px; background:transparent; color:#888; border:none; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:2px;">
                        <i class="fa-solid fa-graduation-cap"></i>
                        <span>${currentLang === 'ar' ? 'الدرجات' : 'Grades'}</span>
                    </button>
                    <button class="phone-nav-btn" id="phoneBtn3" style="font-size:10px; padding:6px; border-radius:8px; background:transparent; color:#888; border:none; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:2px;">
                        <i class="fa-solid fa-calendar-days"></i>
                        <span>${currentLang === 'ar' ? 'المواعيد' : 'Schedule'}</span>
                    </button>
                </div>
            `;
        } else if (pageIndex === 2) {
            // View 2: Student Grades List
            parentPhoneScreen.innerHTML = `
                <!-- Phone Top Bar -->
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; font-size:11px; font-weight:bold;" class="mockup-text">
                    <span>كشف الدرجات الأسبوعي</span>
                    <span style="font-size:9px; background:rgba(59,130,246,0.15); color:#3b82f6; padding:2px 8px; border-radius:50px;">محدث</span>
                </div>

                <!-- Page Content (Grades Timeline) -->
                <div style="flex:1; display:flex; flex-direction:column; gap:10px; overflow-y:auto; padding-bottom:5px;">
                    <div style="font-size:10px; color:#aaa; font-weight:bold; margin-bottom:2px;">${currentLang === 'ar' ? 'درجات الطالب في الاختبارات:' : 'Student Grades & Marks:'}</div>
                    
                    <div class="mockup-card-theme" style="padding:10px; border-radius:10px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div class="mockup-text text-[11px] font-bold">${currentLang === 'ar' ? 'اختبار الفيزياء الأول' : 'Physics Exam 1'}</div>
                            <div style="font-size:9px; color:#aaa;">درجة كاملة</div>
                        </div>
                        <span style="font-size:12px; color:#10b981; font-weight:black;">20/20</span>
                    </div>

                    <div class="mockup-card-theme" style="padding:10px; border-radius:10px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div class="mockup-text text-[11px] font-bold">${currentLang === 'ar' ? 'اختبار الكيمياء الشهري' : 'Chemistry Monthly Exam'}</div>
                            <div style="font-size:9px; color:#aaa;">تقدير ممتاز</div>
                        </div>
                        <span style="font-size:12px; color:#F2CE5A; font-weight:black;">18/20</span>
                    </div>

                    <div class="mockup-card-theme" style="padding:10px; border-radius:10px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div class="mockup-text text-[11px] font-bold">${currentLang === 'ar' ? 'اختبار الفيزياء الأسبوعي' : 'Physics Weekly Quiz'}</div>
                            <div style="font-size:9px; color:#aaa;">درجة كاملة</div>
                        </div>
                        <span style="font-size:12px; color:#10b981; font-weight:black;">10/10</span>
                    </div>
                </div>

                <!-- Phone Fixed Bottom Bar navigation -->
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:5px; border-top:1px solid rgba(150,150,150,0.1); padding-top:8px; margin-top:8px;">
                    <button class="phone-nav-btn" id="phoneBtn1" style="font-size:10px; padding:6px; border-radius:8px; background:transparent; color:#888; border:none; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:2px;">
                        <i class="fa-solid fa-user-check"></i>
                        <span>${currentLang === 'ar' ? 'الحضور' : 'Attendance'}</span>
                    </button>
                    <button class="phone-nav-btn active" id="phoneBtn2" style="font-size:10px; padding:6px; border-radius:8px; background:rgba(242,206,90,0.15); color:#F2CE5A; border:none; cursor:pointer; font-weight:bold; display:flex; flex-direction:column; align-items:center; gap:2px;">
                        <i class="fa-solid fa-graduation-cap"></i>
                        <span>${currentLang === 'ar' ? 'الدرجات' : 'Grades'}</span>
                    </button>
                    <button class="phone-nav-btn" id="phoneBtn3" style="font-size:10px; padding:6px; border-radius:8px; background:transparent; color:#888; border:none; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:2px;">
                        <i class="fa-solid fa-calendar-days"></i>
                        <span>${currentLang === 'ar' ? 'المواعيد' : 'Schedule'}</span>
                    </button>
                </div>
            `;
        } else if (pageIndex === 3) {
            // View 3: Classroom Calendar / Schedule
            parentPhoneScreen.innerHTML = `
                <!-- Phone Top Bar -->
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; font-size:11px; font-weight:bold;" class="mockup-text">
                    <span>جدول الحصص القادمة</span>
                    <span style="font-size:9px; background:rgba(168,85,247,0.15); color:#a855f7; padding:2px 8px; border-radius:50px;">منظم</span>
                </div>

                <!-- Page Content (Calendar timeline) -->
                <div style="flex:1; display:flex; flex-direction:column; gap:10px; overflow-y:auto; padding-bottom:5px;">
                    <div style="font-size:10px; color:#aaa; font-weight:bold; margin-bottom:2px;">${currentLang === 'ar' ? 'مواعيد المجموعات الدراسية:' : 'Group Class Schedule:'}</div>
                    
                    <div class="mockup-card-theme" style="padding:10px; border-radius:10px; display:flex; justify-content:space-between; align-items:center; border-right:4px solid #F2CE5A;">
                        <div>
                            <div class="mockup-text text-[11px] font-bold">${currentLang === 'ar' ? 'مجموعة الأحد (فيزياء)' : 'Sunday Group (Physics)'}</div>
                            <div style="font-size:9px; color:#aaa;">غداً - الساعة 6:00 مساءً</div>
                        </div>
                        <i class="fa-solid fa-chevron-left text-xs text-gray-500"></i>
                    </div>

                    <div class="mockup-card-theme" style="padding:10px; border-radius:10px; display:flex; justify-content:space-between; align-items:center; border-right:4px solid #3b82f6;">
                        <div>
                            <div class="mockup-text text-[11px] font-bold">${currentLang === 'ar' ? 'مجموعة الثلاثاء (كيمياء)' : 'Tuesday Group (Chemistry)'}</div>
                            <div style="font-size:9px; color:#aaa;">الساعة 4:00 مساءً</div>
                        </div>
                        <i class="fa-solid fa-chevron-left text-xs text-gray-500"></i>
                    </div>
                </div>

                <!-- Phone Fixed Bottom Bar navigation -->
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:5px; border-top:1px solid rgba(150,150,150,0.1); padding-top:8px; margin-top:8px;">
                    <button class="phone-nav-btn" id="phoneBtn1" style="font-size:10px; padding:6px; border-radius:8px; background:transparent; color:#888; border:none; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:2px;">
                        <i class="fa-solid fa-user-check"></i>
                        <span>${currentLang === 'ar' ? 'الحضور' : 'Attendance'}</span>
                    </button>
                    <button class="phone-nav-btn" id="phoneBtn2" style="font-size:10px; padding:6px; border-radius:8px; background:transparent; color:#888; border:none; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:2px;">
                        <i class="fa-solid fa-graduation-cap"></i>
                        <span>${currentLang === 'ar' ? 'الدرجات' : 'Grades'}</span>
                    </button>
                    <button class="phone-nav-btn active" id="phoneBtn3" style="font-size:10px; padding:6px; border-radius:8px; background:rgba(242,206,90,0.15); color:#F2CE5A; border:none; cursor:pointer; font-weight:bold; display:flex; flex-direction:column; align-items:center; gap:2px;">
                        <i class="fa-solid fa-calendar-days"></i>
                        <span>${currentLang === 'ar' ? 'المواعيد' : 'Schedule'}</span>
                    </button>
                </div>
            `;
        }

        // Bind click events back to buttons since we recreated the HTML
        const pBtn1 = parentPhoneScreen.querySelector('#phoneBtn1');
        const pBtn2 = parentPhoneScreen.querySelector('#phoneBtn2');
        const pBtn3 = parentPhoneScreen.querySelector('#phoneBtn3');

        if (pBtn1) pBtn1.addEventListener('click', () => switchPhonePage(1));
        if (pBtn2) pBtn2.addEventListener('click', () => switchPhonePage(2));
        if (pBtn3) pBtn3.addEventListener('click', () => switchPhonePage(3));
    }

    // Initialize phone screen on load
    switchPhonePage(1);

    // --- 11. Cursor Spotlight Effect ---
    document.querySelectorAll('.glass-card, .faq-item, .feature-card-theme').forEach(card => {
        card.addEventListener('mousemove', e => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
        });
    });

    // --- 12. Mobile Menu Toggle Logic ---
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const mobileMenuPanel = document.getElementById('mobileMenuPanel');
    const menuToggleIcon = document.getElementById('menuToggleIcon');
    const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');

    if (mobileMenuToggle && mobileMenuPanel) {
        mobileMenuToggle.addEventListener('click', () => {
            mobileMenuPanel.classList.toggle('hidden');
            if (mobileMenuPanel.classList.contains('hidden')) {
                menuToggleIcon.className = 'ri-menu-3-line text-xl';
            } else {
                menuToggleIcon.className = 'ri-close-line text-xl';
            }
        });

        // Close menu panel when clicking a link
        mobileNavLinks.forEach(link => {
            link.addEventListener('click', () => {
                mobileMenuPanel.classList.add('hidden');
                menuToggleIcon.className = 'ri-menu-3-line text-xl';
            });
        });
    }
});
