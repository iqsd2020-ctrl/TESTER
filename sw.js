const CACHE_NAME = 'ahlulbayt-quiz-v16';
const OFFLINE_CACHE = 'ahlulbayt-offline-page';

// قائمة الملفات الأساسية التي سيتم تحميلها فوراً وتخزينها
const STATIC_ASSETS = [
    './',
    './index.html',
    './offline.html', // صفحة لا اتصال بالإنترنت
    './style.css',
    './js/main.js',
    './js/data.js',
    './manifest.json',
    './Icon.png',
    // --- المكتبات الخارجية (CDNs) ---
    'https://cdn.tailwindcss.com',
    'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js',
    'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js',
    'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js',
    // --- الخطوط والأيقونات ---
    'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Reem+Kufi:wght@400;500;700&display=swap',
    'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,1,0'
];

// صفحة البديل عند عدم وجود اتصال
const OFFLINE_FALLBACK_PAGE = './offline.html';

// استدعاء Workbox لتحسين إدارة التخزين المؤقت
importScripts('https://storage.googleapis.com/workbox-cdn/releases/5.1.2/workbox-sw.js');

// تفعيل التحميل المسبق إذا كان مدعومًا
if (workbox.navigationPreload.isSupported()) {
    workbox.navigationPreload.enable();
}

// مرحلة التثبيت (Install): تحميل الملفات الأساسية
self.addEventListener('install', (event) => {
    event.waitUntil(
        Promise.all([
            // تخزين الأصول الثابتة
            caches.open(CACHE_NAME).then(cache => {
                console.log('SW: Pre-caching static assets');
                return cache.addAll(STATIC_ASSETS);
            }),
            // تخزين صفحة لا اتصال منفصلة
            caches.open(OFFLINE_CACHE).then(cache => {
                console.log('SW: Caching offline page');
                return cache.add(OFFLINE_FALLBACK_PAGE);
            })
        ])
    );
    self.skipWaiting();
});

// مرحلة التفعيل (Activate): تنظيف الكاش القديم
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME && key !== OFFLINE_CACHE)
                    .map(key => {
                        console.log('SW: Removing old cache', key);
                        return caches.delete(key);
                    })
            );
        })
    );
    return self.clients.claim();
});

// معالجة الرسائل (مثل تخطي الانتظار)
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// تسجيل مسارات التوجيه باستخدام Workbox
workbox.routing.registerRoute(
    new RegExp('.*\\.(?:js|css|json|png|jpg|jpeg|svg|gif|ico)$'),
    new workbox.strategies.StaleWhileRevalidate({
        cacheName: CACHE_NAME,
        plugins: [
            new workbox.expiration.ExpirationPlugin({
                maxEntries: 100,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 يوم
            }),
        ],
    })
);

// تسجيل مسارات لطلبات التنقل (الصفحات)
workbox.routing.registerRoute(
    new RegExp('.*\\.html$'),
    new workbox.strategies.NetworkFirst({
        cacheName: CACHE_NAME,
        plugins: [
            new workbox.expiration.ExpirationPlugin({
                maxEntries: 50,
                maxAgeSeconds: 7 * 24 * 60 * 60, // أسبوع
            }),
        ],
    })
);

// مرحلة جلب البيانات (Fetch): المعالجة المخصصة
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    const request = event.request;

    // استثناء Firebase وطلبات المصادقة
    if (url.hostname.includes('firestore.googleapis.com') ||
        url.hostname.includes('identitytoolkit.googleapis.com') ||
        url.hostname.includes('securetoken.googleapis.com') ||
        request.method !== 'GET') {
        return;
    }

    // معالجة طلبات التنقل (الصفحات)
    if (request.mode === 'navigate') {
        event.respondWith(
            (async () => {
                try {
                    // محاولة جلب الصفحة من الشبكة أولاً
                    const networkResponse = await fetch(request);
                    
                    // إذا نجح الطلب، تخزين في الكاش
                    if (networkResponse.ok) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(request, responseToCache);
                        });
                    }
                    
                    return networkResponse;
                } catch (error) {
                    // إذا فشل الاتصال، البحث في الكاش
                    const cachedResponse = await caches.match(request);
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    
                    // إذا لم توجد في الكاش، عرض صفحة لا اتصال
                    const offlineResponse = await caches.match(OFFLINE_FALLBACK_PAGE);
                    return offlineResponse;
                }
            })()
        );
        return;
    }

    // استراتيجية للصور والخطوط: الكاش أولاً
    if (request.url.match(/\.(png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$/)) {
        event.respondWith(
            caches.match(request).then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                return fetch(request).then((networkResponse) => {
                    if (networkResponse.ok) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(request, responseToCache);
                        });
                    }
                    return networkResponse;
                }).catch(() => {
                    // إرجاع أيقونة بديلة للصور إذا لزم الأمر
                    if (request.url.match(/\.(png|jpg|jpeg|gif|svg)$/)) {
                        return caches.match('./Icon.png');
                    }
                    return new Response('', { status: 404 });
                });
            })
        );
        return;
    }

    // استراتيجية عامة للطلبات الأخرى
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            
            return fetch(request).then((networkResponse) => {
                if (networkResponse.ok) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // للطلبات الأخرى، لا نرجع شيئاً إذا فشلت
                return new Response('', { status: 408 });
            });
        })
    );
});