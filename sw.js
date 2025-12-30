const CACHE_NAME = 'ahlulbayt-quiz-offline-v1.3'; // قمنا بتحديث الإصدار لتجديد الكاش
const STATIC_ASSETS = [
    './',
    // مكتبة Tailwind CSS
    './tailwind-lib.js',
    
    // --- الصور المحلية ---
    './Icon.png', // الأيقونة
    './Css.png',  // الخلفية (التي أضفناها للتو)
    // الخطوط العربية
    'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Reem+Kufi:wght@400;500;700&display=swap',
    'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,1,0'
];

// 1. التثبيت: تحميل الملفات الأساسية فوراً
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('SW: Caching static assets...');
            return cache.addAll(STATIC_ASSETS);
        })
    );
});

// 2. التفعيل: تنظيف الكاش القديم
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

// 3. استراتيجية الجلب (Fetch Strategy)
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // أ. استثناء قاعدة البيانات فقط (Firestore)
    // نسمح بمرور fonts.googleapis.com و cdn.tailwindcss.com ليتم تخزينها
    if (url.hostname.includes('firestore.googleapis.com') || 
        url.hostname.includes('identitytoolkit.googleapis.com') ||
        url.href.includes('google-analytics')) {
        return; // نتركها للمتصفح (شبكة فقط)
    }

    // ب. ملف أسئلة الماراثون
    if (url.href.includes('dataNooR.json')) {
        event.respondWith(
            fetch(event.request).then((networkResponse) => {
                return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                });
            }).catch(() => caches.match(event.request))
        );
        return;
    }

    // ج. استراتيجية "الشبكة أولاً، ثم الكاش" للخطوط والصور الخارجية
    // هذا يضمن تحميل ملفات الخطوط .woff2 وتخزينها
    if (url.hostname.includes('fonts.gstatic.com') || 
        url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('cdn.tailwindcss.com')) {
        
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                // إذا وجدناه في الكاش نرجعه
                if (cachedResponse) return cachedResponse;
                
                // إذا لم نجد، نحمله من النت ونحفظه فوراً
                return fetch(event.request).then((networkResponse) => {
                    return caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                });
            })
        );
        return;
    }

    // د. باقي الملفات المحلية (Cache First)
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request);
        })
    );
});
