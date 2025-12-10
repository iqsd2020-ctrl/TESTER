importScripts('https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging-compat.js');

// 1. إعدادات Firebase (نفس الموجودة في main.js)
const firebaseConfig = {
  apiKey: "AIzaSyC6FoHbL8CDTPX1MNaNWyDIA-6xheX0t4s",
  authDomain: "ahl-albayet.firebaseapp.com",
  projectId: "ahl-albayet",
  storageBucket: "ahl-albayet.firebasestorage.app",
  messagingSenderId: "160722124006",
  appId: "1:160722124006:web:1c52066fe8dbbbb8f80f27",
  measurementId: "G-9XJ425S41C"
};

// 2. تهيئة Firebase داخل Service Worker
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// 3. معالج الإشعارات الخلفية (عندما يكون التطبيق مغلقاً أو في الخلفية)
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: payload.notification.icon || '/Icon.png', // استخدام أيقونة التطبيق الافتراضية
    badge: '/Icon.png', // أيقونة صغيرة في شريط الحالة (للأندرويد)
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// ==========================================
// منطق الكاش القديم (Offline Caching)
// ==========================================

const CACHE_NAME = 'ahlulbayt-quiz-v17'; // تم تحديث الإصدار لضمان تفعيل التغييرات

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

// 3. مرحلة جلب البيانات (Fetch): استراتيجية الكاش أولاً
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // --- استثناء هام جداً ---
    // لا تقم أبداً بتخزين اتصالات قاعدة البيانات أو المصادقة أو FCM
    if (url.hostname.includes('firestore.googleapis.com') || 
        url.hostname.includes('identitytoolkit.googleapis.com') ||
        url.hostname.includes('securetoken.googleapis.com') ||
        url.hostname.includes('fcm.googleapis.com')) {
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

                // ج. تخزين الملف الجديد في الكاش للمرة القادمة
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseToCache);
                });

                return networkResponse;
            }).catch(() => {
                // د. (اختياري) التعامل مع انقطاع الإنترنت
            });
        })
    );
});