const CACHE_NAME = 'ahlulbayt-quiz-v16'; // غير هذا الاسم عند إطلاق تحديث جديد (مثلاً v2)

// قائمة الملفات الأساسية التي سيتم تحميلها فوراً وتخزينها
const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './js/main.js',
    './js/data.js',
    './manifest.json',
    './Icon.png', // أيقونة التطبيق
    // --- المكتبات الخارجية (CDNs) ---
    'https://cdn.tailwindcss.com',
    'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js',
    'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js',
    'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js',
    // --- الخطوط والأيقونات ---
    'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Reem+Kufi:wght@400;500;700&display=swap',
    'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,1,0'
];

// 1. مرحلة التثبيت (Install): تحميل الملفات الأساسية
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('SW: Pre-caching static assets');
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting(); // تفعيل الخدمة فوراً
});

// 2. مرحلة التفعيل (Activate): تنظيف الكاش القديم عند التحديث
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(keys
                .filter(key => key !== CACHE_NAME)
                .map(key => caches.delete(key))
            );
        })
    );
    return self.clients.claim();
});

// 3. مرحلة جلب البيانات (Fetch): قلب النظام
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // --- استثناء هام جداً ---
    // لا تقم أبداً بتخزين اتصالات قاعدة البيانات أو المصادقة
    if (url.hostname.includes('firestore.googleapis.com') || 
        url.hostname.includes('identitytoolkit.googleapis.com') ||
        url.hostname.includes('securetoken.googleapis.com')) {
        // اترك الطلب يذهب للشبكة مباشرة دون تدخل
        return;
    }

    // استراتيجية: الكاش أولاً، ثم الشبكة (Cache First, falling back to Network)
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            // أ. إذا وجدنا الملف في الكاش، نرجعه فوراً (سرعة قصوى)
            if (cachedResponse) {
                return cachedResponse;
            }

            // ب. إذا لم نجده، نجلبه من الإنترنت
            return fetch(event.request).then(networkResponse => {
                // التحقق من صحة الاستجابة
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' && networkResponse.type !== 'cors') {
                    return networkResponse;
                }

                // ج. تخزين الملف الجديد في الكاش للمرة القادمة (تخزين الصور الجديدة مثلاً)
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseToCache);
                });

                return networkResponse;
            }).catch(() => {
                // د. (اختياري) صفحة بديلة في حال انقطاع النت وعدم وجود الملف في الكاش
                // حالياً لن نرجع شيئاً أو يمكن إرجاع ملف offline.html لو أنشأته
            });
        })
    );
});
