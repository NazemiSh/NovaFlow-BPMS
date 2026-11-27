<div align="center">

  <img src="BPMS_Platform/bpms-client/public/branding/Logo-Type-fr-en.png" alt="NovaFlow BPMS Logo" width="380" />
  <br />
  <img src="BPMS_Platform/bpms-client/public/branding/Logo.png" alt="NovaFlow Icon" width="72" />

  <h1>سامانه جامع نوافلو (NovaFlow BPMS)</h1>
  <p><strong>پلتفرم سازمانی فرمساز پویا، موتور قوانین کسب‌وکار (BRMS)، گردش‌کار هوشمند و اپلیکیشن موبایل White-Label PWA</strong></p>

  <p>
    <img src="https://img.shields.io/badge/.NET-8.0-512BD4?style=for-the-badge&logo=dotnet&logoColor=white" alt=".NET 8" />
    <img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 18" />
    <img src="https://img.shields.io/badge/SQL%20Server-2016--2025-CC2927?style=for-the-badge&logo=microsoftsqlserver&logoColor=white" alt="SQL Server" />
    <img src="https://img.shields.io/badge/PWA-Ready-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white" alt="PWA Ready" />
  </p>

  <p>
    <a href="#معرفی-پلتفرم-نوافلو">معرفی</a> •
    <a href="#ماژولهای-کلیدی-سامانه">ماژول‌ها</a> •
    <a href="#پشته-فناوری">پشته فناوری</a> •
    <a href="#ساختار-پوشههای-پروژه">ساختار پروژه</a> •
    <a href="#راهنمای-نصب-سریع">نصب سریع</a> •
    <a href="#توسعهدهنده-و-ارتباط-با-ما">توسعه‌دهنده</a>
  </p>

</div>

---

## معرفی پلتفرم نوافلو

**نوافلو (NovaFlow BPMS)** یک پلتفرم یکپارچه، بومی و در کلاس سازمانی (Enterprise) برای مکانیزاسیون فرآیندهای کسب‌وکار، طراحی بدون کدنویسی (No-Code/Low-Code) فرم‌های پویا، پیاده‌سازی قوانین محاسباتی و شرطی (BRMS)، مدیریت ماتریس تاییدات و صدور اسناد رسمی است. این سامانه به‌گونه‌ای طراحی شده است که هم در شبکه‌های ایزوله و اینترانت سازمانی (**Air-Gapped / On-Premise**) و هم در بستر اینترنت با **HTTPS / Wildcard SSL** و پشت **Reverse Proxy / WAF** بدون هیچ‌گونه وابستگی خارجی اجرا شود.

---

## ماژول‌های کلیدی سامانه

### ۱. فرمساز پویا (Dynamic Form Builder)
- **طراحی بصری چندبخشی (Multi-Section):** چیدمان Drag & Drop فیلدها، سکشن‌بندی فرم‌های پیچیده و پیش‌نمایش زنده.
- **جداول اقلام پویا (`Repeater Grid`):** پشتیبانی از چندین جدول مجزا در هر فرم، سطر جمع کل (`showSummaryRow`)، ورود سریع با کیبورد (`Keyboard-First UX`) و ثبت پیوسته (`Submit & New`).
- **تنوع فیلدها و اعتبارسنجی پیشرفته:** بیش از ۱۰ نوع فیلد (متنی، عددی با واحد سنجش، لیست انتخابی، چک‌باکس، تاریخ بومی شمسی، انتخاب از مرجع `master_lookup` و پیوست فایل) همراه با اعتبارسنجی هم‌زمان در کلاینت و سرور.

### ۲. موتور قوانین و فرمول‌های محاسباتی (BRMS & Formula Engine)
- **محاسبات بلادرنگ سطری و تجمیعی:** تعریف ستون‌های محاسباتی در جداول اقلام و باکس‌های خلاصه با پارسر امن بدون `eval` (`SafeMathParser`) و توابع `SUM`, `AVG`, `COUNT`, `MIN`, `MAX`, `ROUND`.
- **قواعد شرطی و کنترل خطا پیش از ثبت (`Formula Validation Rules`):** ارزیابی زنده قوانین مقایسه‌ای و فرمولی پیش از ارسال فرم و جلوگیری از ثبت درخواست‌های مغایر با آیین‌نامه با نمایش هشدار فارسی.
- **مسیریابی و پرش شرطی مراحل:** ورود یا عبور خودکار (`Skipped`) از مراحل گردش‌کار بر اساس مقادیر فرم و آستانه‌های مالی/سازمانی.

### ۳. ماتریس گردش‌کار هوشمند (Intelligent Workflow Engine)
- **تایید ترتیبی و موازی (`ANY` / `ALL`):** ارجاع پرونده به یک نفر، گروهی از تاییدکنندگان (اقدام اولین نفر در `ANY` یا اجماع هم‌زمان در `ALL`).
- **رونوشت (`CC`) و تفویض اختیار:** ارسال نسخه اطلاع‌رسانی بدون توقف فرآیند، انتقال کارتابل و فرم‌ها هنگام خروج یا غیرفعال‌سازی کاربر (`User Offboarding`) و اشتراک‌گذاری کنترل‌شده فرم‌ها.
- **نظارت کلان بر کارتابل‌ها:** کارتابل یکپارچه `Inbox` / `Outbox` / `CC`، استپر گرافیکی زنده، ثبت هامش، رد یا عودت به مرحله قبل و دید سراسری مدیر سیستم (`Admin Global Visibility`).

### ۴. طراح قالب چاپ و خروجی سازمانی (Print Designer & Official Exports)
- **طراحی برگه‌های رسمی `A4` / `A5`:** تنظیم سربرگ، حاشیه‌ها، فونت، باکس‌های محاسباتی و جدول استاندارد تاییدات و امضاهای الکترونیک.
- **کد رهگیری یکتا و QR Code اصالت‌سنجی:** تولید کد رهگیری منحصربه‌فرد، QR Code استعلام اصالت سند و QR Code مجزای پوشه پیوست‌ها.
- **خروجی PDF و Excel استاندارد:** تولید PDF رسمی و خروجی Excel/CSV سطر به سطر (`Denormalized`) با حفظ صفر ابتدای کدها و لینک مستقیم به کاوشگر وب فایل‌های پیوست (`Web File Explorer`).

### ۵. اپلیکیشن موبایل (White-Label PWA) و اسکنر هوشمند
- **نصب مستقل روی Android و iOS:** مانیفست استاندارد PWA و سرویس‌ورکر **Network-First** (`sw.js`) برای نصب مستقیم بدون نیاز به اپ‌استور و بدون گیر افتادن در کش قدیمی.
- **تطبیق خودکار نام و آیکن با برند سازمان (White-Label):** تغییر پویای لوگو، عنوان، رنگ و هویت بصری پنل و PWA متناسب با برند هر سازمان.
- **اسکنر بارکد و QR با مسیریابی هوشمند:** پشتیبانی از `BarcodeDetector` و رمزگشای آفلاین (`offlineBarcodeDecoder.js`) با قابلیت عکس‌برداری دوربین در محیط‌های HTTP، تشخیص خودکار کد رهگیری (`TRK-...`) و باز کردن مستقیم پرونده یا درج در فیلد فرم.

### ۶. استودیوی هوش مصنوعی و اتصال به Power BI
- **تولید خودکار کوئری و View تحلیلی:** تبدیل پرس‌وجوهای زبان طبیعی فارسی به دستورات امن و فقط-خواندنی `T-SQL` (شامل پشتیبانی از `OPENJSON` برای جداول اقلام) و تولید اسکریپت `SQL View` آماده اتصال به Microsoft Power BI.
- **اتصال چندگانه به سرویس‌های LLM:** پیکربندی و سوئیچ میان ارائه‌دهندگان مختلف هوش مصنوعی از پنل مدیریت.

### ۷. بانک دادههای مرجع (Master Data Hub)
- **مدیریت جداول پایه و ایمپورت اکسل:** ساخت دستی جداول پایه یا ایمپورت تعاملی فایل‌های `.xlsx`، `.xls` و `.csv` با انتخاب شیت، تشخیص خودکار ستون‌ها، اعتبارسنجی کلید یکتا و به‌روزرسانی گزینشی ستون‌ها (`Partial Column Upsert`).
- **اتصال به جداول SQL Server:** اتصال رمزنگاری‌شده (`AES-256`) با SQL Auth یا Windows/AD Impersonation، فیلتر پیش از همگام‌سازی، زمان‌بند پیشرفته PBI-Style منطبق بر تقویم شمسی (`UTC +03:30`) و کش محلی دولایه (`MasterDataRecords` + `VersionHash`).

---

## پشته فناوری

| لایه | فناوری‌ها و ابزارها | توضیحات |
| :--- | :--- | :--- |
| **Backend** | `ASP.NET Core (.NET 8.0)`, `C# 12`, `EF Core` | معماری API-First، میزبانی InProcess روی IIS، احراز هویت `JWT` و `PBKDF2` |
| **Frontend** | `React 18`, `Vite`, `Tailwind CSS`, `Axios` | رابط راست‌چین (`RTL`)، تم تاریک/روشن، آیکن‌های مدرن و `jalaali-js` |
| **Database** | `Microsoft SQL Server (2016–2025)` | مدل ترکیبی Relational + Native JSON با کالکشن `Persian_100_CI_AI` |
| **Mobile / PWA** | `PWA Manifest`, `Service Worker (Network-First)` | قابل نصب روی Android و iOS، اسکنر آفلاین بارکد و QR Code |
| **Security & Auth** | `Active Directory / LDAP`, `AES-256`, `HTTPS / HSTS` | سیاست گذرواژه پویا، قفل ضد Brute-Force و پشتیبانی از Reverse Proxy |
| **Deployment** | `IIS 10+`, `URL Rewrite 2.1`, `PowerShell` | استقرار خودکار و آفلاین با `Deploy-BPMS.ps1` و حذف ایمن با `Uninstall-BPMS.ps1` |

---

## ساختار پوشه‌های پروژه

```text
NovaFlow-BPMS/
├── BPMS_Platform/
│   ├── BPMS.Server/                     # هسته بک‌اند (.NET 8 Web API)
│   │   ├── Controllers/                 # کنترلرهای RESTful API
│   │   ├── Data/                        # DbContext و مقداردهی اولیه
│   │   ├── DTOs/ & Models/              # مدل‌های داده و سیاست‌های امنیتی
│   │   ├── Services/                    # موتور گردش‌کار، Master Data، LDAP، Backup، Email
│   │   └── appsettings.Example.json     # فایل نمونه تنظیمات بدون اطلاعات حساس
│   ├── bpms-client/                     # فرانت‌اند (React 18 + Vite + Tailwind + PWA)
│   │   ├── public/branding/             # لوگوها و دارایی‌های برندینگ نوافلو
│   │   ├── public/manifest.json & sw.js # مانیفست PWA و سرویس‌ورکر Network-First
│   │   └── src/                         # کامپوننت‌های فرمساز، کارتابل، پرینت، اسکنر و ادمین
│   └── BPMS.sln                         # فایل Solution دات‌نت
├── Deploy-BPMS.ps1                      # اسکریپت استقرار خودکار تحت IIS
├── Uninstall-BPMS.ps1                   # اسکریپت حذف ایمن با تاییدیه بکاپ
├── BPMS_DB_Schema.sql                   # اسکریپت ساخت پایگاه‌داده SQL Server
├── version.json                         # مشخصات نسخه منتشرشده
├── API.md                               # مرجع کامل REST API
├── INSTALL.md                           # راهنمای جامع نصب، SSL و نگهداری
├── CHANGELOG.md                         # تاریخچه تغییرات نسخه‌ها
├── SECURITY.md                          # معماری و سیاست‌های امنیتی سامانه
└── README.md                            # معرفی پلتفرم نوافلو
```

---

## راهنمای نصب سریع

برای استقرار پکیج آماده انتشار (`NovaFlow-BPMS-v1.0.0.zip` از بخش [Releases](https://github.com/NazemiSh/NovaFlow-BPMS/releases)) روی سرور ویندوز و IIS:

1. پیش‌نیازهای **IIS**، ماژول **IIS URL Rewrite 2.1** و **.NET 8.0 Hosting Bundle** را نصب کنید.
2. پکیج `NovaFlow-BPMS-v1.0.0.zip` را استخراج کرده و PowerShell را با دسترسی **Administrator** در پوشه پکیج باز نمایید.
3. اسکریپت استقرار خودکار را اجرا کنید:
   ```powershell
   Set-ExecutionPolicy Bypass -Scope Process -Force
   .\Deploy-BPMS.ps1
   ```
4. پس از استقرار، با نام کاربری پیش‌فرض `local_admin` و رمز عبور `Admin@123456` وارد شده و بلافاصله گذرواژه را تغییر دهید.

برای مطالعه راهنمای کامل پیکربندی HTTPS/Wildcard SSL، ارتقای بدون از دست رفتن داده‌ها و حذف ایمن، فایل [INSTALL.md](INSTALL.md) را ببینید.

---

## توسعه‌دهنده و ارتباط با ما

* **توسعه‌دهنده و معمار سامانه:** شهاب ناظمی (Shahab Nazemi)
* **ایمیل:** `shahab.nazemi@gmail.com`
* **مخزن گیت‌هاب:** [https://github.com/NazemiSh/NovaFlow-BPMS](https://github.com/NazemiSh/NovaFlow-BPMS)
* **ارتباط مستقیم در واتساپ:** [https://wa.me/qr/X7NJ6BHTONWWF1](https://wa.me/qr/X7NJ6BHTONWWF1)
