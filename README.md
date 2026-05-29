# 🔒 Tampermonkey Private Shield

سكربت Tampermonkey يخفي البيانات الحساسة تلقائياً على أي موقع — مثالي للبث المباشر ومشاركة الشاشة.

***

## ✨ المميزات

- 🔒 إخفاء **الإيميلات** — مثال: `user@gmail.com`
- 📱 إخفاء **أرقام الجوال السعودية** — مثال: `0512345678` أو `+966512345678`
- 🪪 إخفاء **أرقام الهوية الوطنية** — تبدأ بـ `1` أو `2` أو `3`
- ⚡ يعمل **فوراً** قبل ظهور البيانات في الصفحة
- 🌐 يعمل على **جميع المواقع** تلقائياً
- 👆 اضغط على أي بيانات محجوبة لإظهارها مؤقتاً
- 🔄 يدعم المواقع الديناميكية (React, Next.js, ...)
- 🏷️ شارة صغيرة أسفل اليمين تعرض عدد العناصر المخفية

***

## 📦 طريقة التثبيت


### ⚠️ خطوة مهمة قبل التثبيت

لازم تفعّل خيار **Allow User Scripts** في إعدادات Tampermonkey داخل المتصفح:

### Chrome / Edge
1. افتح المتصفح واذهب لـ `chrome://extensions`
2. ابحث عن **Tampermonkey** واضغط **Details**
3. فعّل خيار **Allow User Scripts**

### Firefox
1. افتح **Tampermonkey** من شريط الأدوات
2. اذهب لـ **Settings** ← تبويب **Security**
3. فعّل **Allow User Scripts**

> ⚠️ بدون تفعيل هذا الخيار السكربت **لن يعمل**



### 1. ثبّت إضافة Tampermonkey

| المتصفح | الرابط |
|---------|--------|
| Chrome | [Chrome Web Store](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) |
| Edge | [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd) |
| Firefox | [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/tampermonkey/) |

### 2. ثبّت السكربت

انقر على الرابط أدناه وسيفتح Tampermonkey تلقائياً ويطلب التثبيت:

> 📥 **[اضغط هنا لتثبيت السكربت](https://raw.githubusercontent.com/mooh971/tampermonkey-private-shield/main/private-shield.user.js)**

### 3. اضغط "Install" وخلاص ✅

***

## 🚀 طريقة الاستخدام

| الإجراء | النتيجة |
|---------|---------|
| تحميل أي صفحة | البيانات تُخفى تلقائياً |
| الضغط على بيانات محجوبة | تظهر مؤقتاً |
| الضغط مجدداً | تعود للإخفاء |
| الضغط على الشارة 🔒 | إظهار أو إخفاء الكل |
| hover على الشارة | تظهر الشارة مع العدد |

***

## 🛡️ ما الذي يُخفيه السكربت؟

| النوع | الأمثلة |
|-------|---------|
| إيميل | `user@gmail.com` ، `name@company.sa` |
| جوال سعودي | `0512345678` ، `+966512345678` ، `050 123 4567` |
| هوية وطنية | `1123456789` ، `2123456789` ، `3123456789` |

***

