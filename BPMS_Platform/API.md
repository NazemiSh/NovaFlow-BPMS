# 🌐 راهنمای جامع و مرجع توسعه‌دهندگان وب‌سرویس‌های سامانه نوافلو
## (NovaFlow Enterprise BPMS — RESTful API Reference & Integration Guide)

> **نسخه مستند:** ۱.۰.۰  
> **آدرس پایه وب‌سرویس (Base URL):** `https://bpms.example-org.ir/api`  
> **فرمت تبادل داده:** `JSON (UTF-8)`  
> **استاندارد احراز هویت:** `JWT Bearer Token (RFC 7519)`  
> **محیط هدف:** شبکه‌های اینترانت و ایزوله سازمانی (On-Premise / Air-Gapped)

---

## 📋 فهرست مطالب
1. [معماری ارتباطی و اصول یکپارچه‌سازی](#۱-معماری-ارتباطی-و-اصول-یکپارچه‌سازی)
2. [مکانیزم احراز هویت و مدیریت نشست (JWT Auth)](#۲-مکانیزم-احراز-هویت-و-مدیریت-نشست-jwt-auth)
3. [فهرست و مشخصات کامل Endpointهای سامانه](#۳-فهرست-و-مشخصات-کامل-endpointهای-سامانه)
   - [۳.۱. احراز هویت و حساب کاربری (Authentication)](#۳۱-احراز-هویت-و-حساب-کاربری-authentication)
   - [۳.۲. مدیریت کاربران و سطوح دسترسی (Users & Roles)](#۳۲-مدیریت-کاربران-و-سطوح-دسترسی-users--roles)
   - [۳.۳. گروه‌های سازمانی و نگاشت اکتیو دایرکتوری (Groups & AD)](#۳۳-گروه‌های-سازمانی-و-نگاشت-اکتیو-دایرکتوری-groups--ad)
   - [۳.۴. کاتالوگ فرم‌ها، طراحی و قالب‌های چاپ (Forms & Templates)](#۳۴-کاتالوگ-فرم‌ها-طراحی-و-قالب‌های-چاپ-forms--templates)
   - [۳.۵. موتور گردش‌کار، ثبت درخواست و کارتابل (Workflow & Tasks)](#۳۵-موتور-گردش‌کار-ثبت-درخواست-و-کارتابل-workflow--tasks)
   - [۳.۶. بانک داده‌های مرجع (Master Data Hub)](#۳۶-بانک-داده‌های-مرجع-master-data-hub)
   - [۳.۷. گزارش‌ها، آمار و دستیار هوش مصنوعی (Reports & AI Studio)](#۳۷-گزارش‌ها-آمار-و-دستیار-هوش-مصنوعی-reports--ai-studio)
   - [۳.۸. نظرسنجی‌های عمومی سازمانی (Public Surveys)](#۳۸-نظرسنجی‌های-عمومی-سازمانی-public-surveys)
   - [۳.۹. تنظیمات زیرساخت، سلامت سیستم و پشتیبان‌گیری (System & Backup)](#۳۹-تنظیمات-زیرساخت-سلامت-سیستم-و-پشتیبان‌گیری-system--backup)
   - [۳.۱۰. مدیریت اسناد و پیوست‌های پرونده (Submissions & File Explorer)](#۳۱۰-مدیریت-اسناد-و-پیوست‌های-پرونده-submissions--file-explorer)
4. [ساختارهای نمونه JSON برای سناریوهای کلیدی](#۴-ساختارهای-نمونه-json-برای-سناریوهای-کلیدی)
5. [نمونه کدهای عملی اتصال سامانه‌های بیرونی (PowerShell و cURL)](#۵-نمونه-کدهای-عملی-اتصال-سامانه‌های-بیرونی-powershell-و-curl)
6. [جدول کدهای وضعیت و مدیریت خطاهای HTTP](#۶-جدول-کدهای-وضعیت-و-مدیریت-خطاهای-http)
7. [الزامات امنیتی و بهترین الگوهای یکپارچه‌سازی](#۷-الزامات-امنیتی-و-بهترین-الگوهای-یکپارچه‌سازی)

---

## ۱. معماری ارتباطی و اصول یکپارچه‌سازی

سامانه نوافلو (NovaFlow) بر مبنای معماری مدرن **API-First** و پروتکل بدون وضعیت (Stateless REST) بر بستر پلتفرم `ASP.NET Core (.NET 8.0)` توسعه یافته است. کلیه قابلیت‌های عملیاتی سامانه که در رابط کاربری وب در دسترس پرسنل قرار دارند، از طریق وب‌سرویس‌های استاندارد با متدهای استاندارد HTTP (`GET`, `POST`, `PUT`, `DELETE`) و بدنه JSON قابل فراخوانی توسط سیستم‌های بیرونی (مانند ERP سازمانی، سیستم‌های مالی و انبارداری، پورتال پرسنلی، پیام‌رسان‌های بومی و اسکریپت‌های اتوماسیون) می‌باشند.

### ویژگی‌های کلیدی ارتباطی:
* **پروتکل ارتباطی امن:** تمامی ارتباطات از طریق HTTPS و رمزنگاری TLS 1.2 / 1.3 انجام می‌شود.
* **کدگذاری متون:** پشتیبانی کامل و استاندارد از کاراکترهای زبان فارسی در استاندارد انکودینگ `UTF-8`.
* **هدرهای پایه درخواست:**
  ```http
  Accept: application/json
  Content-Type: application/json; charset=utf-8
  Authorization: Bearer <YOUR_JWT_TOKEN>
  ```

---

## ۲. مکانیزم احراز هویت و مدیریت نشست (JWT Auth)

به استثنای Endpointهای نظرسنجی عمومی و بررسی سلامت سیستم، کلیه فراخوانی‌های وب‌سرویس در نوافلو نیازمند اعتبارسنجی با توکن معتبر JWT هستند.

### ۲.۱. فرآیند دریافت توکن (Token Issuance)
کلاینت درخواست خود را با متد `POST` به مسیر `/api/auth/login` ارسال می‌کند:
```json
{
  "username": "a.mohammadi",
  "password": "Password@12345"
}
```
هسته احراز هویت نوافلو درخواست را به صورت ترکیبی (Hybrid) بررسی می‌کند:
1. ابتدا کاربران محلی تعریف‌شده در پایگاه‌داده با الگوریتم رمزنگاری `PBKDF2` اعتبارسنجی می‌شوند.
2. در صورت فعال بودن سرویس اکتیو دایرکتوری، اعتبارسنجی بلادرنگ از طریق پروتکل LDAP روی کنترلر دامین سازمانی انجام گرفته و کاربر به صورت خودکار با اطلاعات دامین در سیستم ثبت و توکن صادر می‌شود.

### ۲.۲. قالب توکن ارسالی (Token Usage)
در کلیه درخواست‌های بعدی، توکن دریافت‌شده باید در هدر استاندارد `Authorization` قرار گیرد:
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### ۲.۳. ساختار Claimهای توکن
توکن حاوی فیلدهای استانداردی نظیر `nameid` (شناسه کاربر)، `unique_name` (نام کاربری)، `display_name` (نام و نام خانوادگی) و آرایه `role` (نقش‌های کاربر: `Admin`, `SuperUser`, `User`) می‌باشد.

---

## ۳. فهرست و مشخصات کامل Endpointهای سامانه

### ۳.۱. احراز هویت و حساب کاربری (Authentication)

| متد | مسیر URL | سطح دسترسی | پارامترها و بدنه | شرح عملکرد |
| :---: | :--- | :---: | :--- | :--- |
| `POST` | `/api/auth/login` | عمومی (AllowAnonymous) | `LoginRequestDto` (Body) | اعتبارسنجی نام کاربری و کلمه عبور و صدور توکن JWT |
| `POST` | `/api/auth/refresh` | کاربر لاگین‌شده | - | تمدید اعتبار نشست و دریافت توکن تازه |
| `GET` | `/api/auth/me` | کاربر لاگین‌شده | - | دریافت اطلاعات هویتی، نام کامل و نقش‌های کاربر فعال |

---

### ۳.۲. مدیریت کاربران و سطوح دسترسی (Users & Roles)

| متد | مسیر URL | سطح دسترسی | پارامترها و بدنه | شرح عملکرد |
| :---: | :--- | :---: | :--- | :--- |
| `GET` | `/api/users` | `Admin` | - | دریافت فهرست جامع کلیه کاربران به همراه وضعیت فعال/قفل |
| `GET` | `/api/users/directory` | `Admin, SuperUser` | - | دریافت دایرکتوری خلاصه نام و شناسه پرسنل جهت ارجاع کارتابل |
| `POST` | `/api/users/local` | `Admin` | `CreateLocalUserDto` (Body) | ایجاد حساب کاربری محلی جدید (نام، کلمه عبور، نام نمایشی) |
| `POST` | `/api/users/{userId}/reset-password` | `Admin` | `ResetPasswordDto` (Body) | بازنشانی کلمه عبور حساب کاربر محلی |
| `GET` | `/api/users/{id}/offboarding-summary` | `Admin` | - | **پیش‌بررسی غیرفعال‌سازی کاربر:** دریافت تعداد وظایف باز کارتابل (`pendingTasksCount`) و فرم‌های تحت مالکیت (`ownedFormsCount`) به همراه عناوین آن‌ها |
| `POST` | `/api/users/{userId}/toggle-active` | `Admin` | `DeactivateUserDto` (Body اختیاری) | **فعال/غیرفعال‌سازی کاربر:** فعال‌سازی مجدد یا غیرفعال‌سازی تراکنشی همراه با انتقال وظایف باز کارتابل (`transferTasksToUserId`) و واگذاری مالکیت فرم‌ها (`transferFormsToUserId`) |
| `POST` | `/api/users/{userId}/unlock` | `Admin` | - | باز کردن قفل حساب کاربری قفل‌شده بر اثر خطاهای پیاپی ورود |
| `DELETE` | `/api/users/{userId}` | `Admin` | - | حذف کاربر از سامانه |
| `POST` | `/api/users/{userId}/roles` | `Admin` | `List<string>` (Body) | انتساب نقش‌های سیستمی (`Admin`, `SuperUser`, `User`) |

---

### ۳.۳. گروه‌های سازمانی و نگاشت اکتیو دایرکتوری (Groups & AD)

| متد | مسیر URL | سطح دسترسی | پارامترها و بدنه | شرح عملکرد |
| :---: | :--- | :---: | :--- | :--- |
| `GET` | `/api/groups` | کاربر لاگین‌شده | - | دریافت فهرست گروه‌های کاری سازمانی و اعضای آن‌ها |
| `POST` | `/api/groups` | `Admin` | `CreateGroupDto` (Body) | ایجاد گروه کاری جدید در سامانه |
| `DELETE` | `/api/groups/{id}` | `Admin` | - | حذف گروه کاری |
| `POST` | `/api/groups/{id}/members` | `Admin` | `AddGroupMemberDto` (Body) | افزودن کاربر به عنوان عضو گروه کاری |
| `DELETE` | `/api/groups/{id}/members/{userId}` | `Admin` | - | حذف عضو از گروه کاری |
| `POST` | `/api/groups/ad-preview` | `Admin` | `AdGroupSyncRequestDto` | استعلام و پیش‌نمایش گروه‌های موجود در Active Directory |
| `POST` | `/api/groups/ad-import` | `Admin` | `List<AdGroupInfoDto>` | ایمپورت و همگام‌سازی دسته‌ای گروه‌ها از Active Directory |
| `GET` | `/api/groups/forms/{formId}/access` | `Admin, SuperUser` | - | دریافت لیست گروه‌های دارای مجوز دسترسی و ثبت فرم |
| `POST` | `/api/groups/forms/{formId}/access` | `Admin, SuperUser` | `FormAccessDto` (Body) | تعیین دسترسی گروه‌های سازمانی مجاز به فرم |

---

### ۳.۴. کاتالوگ فرم‌ها، طراحی و قالب‌های چاپ (Forms & Templates)

| متد | مسیر URL | سطح دسترسی | پارامترها و بدنه | شرح عملکرد |
| :---: | :--- | :---: | :--- | :--- |
| `GET` | `/api/forms` | کاربر لاگین‌شده | `status` (Query اختیاری) | دریافت کاتالوگ فرم‌های در دسترس کاربر بر مبنای مجوزها |
| `GET` | `/api/forms/{id}` | کاربر لاگین‌شده | - | دریافت جزییات کامل فرم، ساختار فیلدها و شروط BRMS |
| `POST` | `/api/forms` | `Admin, SuperUser` | `CreateFormDto` (Body) | طراحی و ایجاد فرم جدید با ساختار اسکیمای پویا |
| `PUT` | `/api/forms/{id}` | `Admin, SuperUser` | `UpdateFormDto` (Body) | ویرایش مشخصات فرم، تعاریف فیلدها و گام‌های تایید |
| `POST` | `/api/forms/{id}/publish` | `Admin, SuperUser` | - | انتشار و فعال‌سازی نهایی فرم جهت ثبت درخواست توسط پرسنل |
| `POST` | `/api/forms/{id}/request-approval` | `SuperUser` | - | ارسال فرم به مدیر سیستم جهت بررسی و تایید انتشار |
| `POST` | `/api/forms/{id}/admin-approve` | `Admin` | - | تایید رسمی انتشار فرم طراحی‌شده |
| `POST` | `/api/forms/{id}/admin-reject` | `Admin` | `payload` (Body) | رد درخواست انتشار فرم با ذکر دلیل |
| `POST` | `/api/forms/{id}/new-version` | `Admin, SuperUser` | `CreateFormDto` (Body) | ایجاد نگارش بازنگری جدید (Revision/Version) از فرم |
| `POST` | `/api/forms/{id}/toggle-status` | `Admin` | - | تغییر وضعیت فرم بین فعال و بایگانی‌شده |
| `DELETE` | `/api/forms/{id}` | `Admin` | - | حذف نرم فرم از سامانه |
| `GET` | `/api/forms/{id}/export` | `Admin, SuperUser` | - | دریافت خروجی ساختار استاندارد فرم در قالب فایل JSON |
| `POST` | `/api/forms/import` | `Admin, SuperUser` | `FormExportDto` (Body) | درون‌ریزی ساختار فرم از فایل JSON |
| `GET` | `/api/forms/{id}/print-templates` | کاربر لاگین‌شده | - | دریافت قالب‌های چاپی رسمی تعریف‌شده برای فرم |
| `PUT` | `/api/forms/{id}/print-templates` | `Admin, SuperUser` | `JsonElement` (Body) | ذخیره و به‌روزرسانی تنظیمات و چیدمان قالب چاپ PDF فرم |
| `GET` | `/api/forms/{id}/shares` | `Admin, SuperUser` | - | **فهرست اشتراک‌های فرم:** دریافت لیست کاربران ارشد مجاز و پرچم‌های دسترسی (`canEditDesign`, `canViewReports`) |
| `GET` | `/api/forms/{id}/share-candidates` | `Admin, SuperUser` | - | **کاربران واجد شرایط اشتراک:** استعلام کاربران ارشد فعال جهت اعطای دسترسی به فرم |
| `POST` | `/api/forms/{id}/shares` | `Admin, SuperUser` | `UpsertFormShareRequestDto` | **اشتراک‌گذاری فرم:** اعطا یا به‌روزرسانی مجوزهای طراحی یا گزارش‌گیری برای کاربر ارشد منتخب |
| `DELETE` | `/api/forms/{id}/shares/{targetUserId}` | `Admin, SuperUser` | - | **لغو اشتراک فرم:** سلب دسترسی کاربر ارشد از فرم به اشتراک گذاشته شده |
| `POST` | `/api/forms/{id}/transfer-ownership` | `Admin` | `TransferFormOwnershipRequestDto` | **انتقال قطعی مالکیت فرم:** واگذاری کامل اختیار و طراح اصلی فرم در کلیه نگارش‌ها به یک کاربر ارشد دیگر |

---

### ۳.۵. موتور گردش‌کار، ثبت درخواست و کارتابل (Workflow & Tasks)

| متد | مسیر URL | سطح دسترسی | پارامترها و بدنه | شرح عملکرد |
| :---: | :--- | :---: | :--- | :--- |
| `POST` | `/api/workflow/submit` | کاربر لاگین‌شده | `SubmitFormDto` (Body) | **ثبت درخواست جدید:** ارسال مقادیر فیلدها و جدول اقلام پویا |
| `GET` | `/api/workflow/inbox` | کاربر لاگین‌شده | - | **کارتابل ورودی:** لیست پرونده‌های نیازمند اقدام فوری کاربر |
| `GET` | `/api/workflow/outbox` | کاربر لاگین‌شده | - | **پیگیری پرونده‌ها:** لیست درخواست‌های ثبت‌شده توسط خود کاربر |
| `GET` | `/api/workflow/cc` | کاربر لاگین‌شده | - | **کارتابل رونوشت:** پرونده‌های ارجاع‌شده جهت اطلاع (CC) |
| `GET` | `/api/workflow/submissions/{id}` | کاربر مجاز | - | دریافت مشخصات پرونده، اطلاعات ثبت‌شده و استپر گرافیکی |
| `POST` | `/api/workflow/submissions/{id}/transition` | اقدام‌کننده گام | `TransitionTaskDto` (Body) | **اقدام روی کارتابل:** تایید (`Approve`)، رد (`Reject`) یا ارجاع (`Refer`) |
| `GET` | `/api/workflow/submissions/{id}/history` | کاربر مجاز | - | تاریخچه دقیق گام‌های طی‌شده، زمان‌ها و هامش‌های تاییدکنندگان |
| `POST` | `/api/workflow/delegate` | کاربر لاگین‌شده | `DelegationDto` (Body) | تفویض اختیارات کارتابل به کاربر جانشین در بازه زمانی معین |
| `GET` | `/api/workflow/delegate` | کاربر لاگین‌شده | - | استعلام وضعیت تفویض فعال کاربر جاری |
| `DELETE` | `/api/workflow/delegate` | کاربر لاگین‌شده | - | لغو تفویض کارتابل |
| `GET` | `/api/workflow/admin/all-tasks` | `Admin` | - | پایش کل وظایف معوق در جریان در سراسر سازمان |
| `POST` | `/api/workflow/admin/reassign` | `Admin` | `payload` (Body) | بازتخصیص یک وظیفه کارتابلی از فردی به فرد دیگر |
| `POST` | `/api/workflow/admin/bulk-reassign` | `Admin` | `payload` (Body) | انتقال دسته‌ای کلیه کارهای یک پرسنل به جانشین سازمانی |

---

### ۳.۶. بانک داده‌های مرجع (Master Data Hub)

| متد | مسیر URL | سطح دسترسی | پارامترها و بدنه | شرح عملکرد |
| :---: | :--- | :---: | :--- | :--- |
| `GET` | `/api/masterdata/connections` | `Admin` | - | دریافت لیست اتصالات دیتابیس‌های خارجی تعریف‌شده |
| `GET` | `/api/masterdata/connections/{id}` | `Admin` | - | جزییات یک اتصال خارجی مشخص |
| `POST` | `/api/masterdata/connections` | `Admin` | `ConnectionDto` (Body) | تعریف اتصال جدید به SQL Server خارجی (SQL Auth / Windows Auth) |
| `PUT` | `/api/masterdata/connections/{id}` | `Admin` | `ConnectionDto` (Body) | ویرایش تنظیمات و کلمه عبور اتصال خارجی |
| `DELETE` | `/api/masterdata/connections/{id}` | `Admin` | - | حذف اتصال خارجی |
| `POST` | `/api/masterdata/connections/test` | `Admin` | `ConnectionTestRequestDto` | تست زنده اتصال به سرور و پایگاه‌داده مقصد |
| `POST` | `/api/masterdata/connections/preview-full`| `Admin` | `PreviewSqlFullRequestDto` | استخراج و بازبینی کل داده‌های خروجی کوئری با صفحه‌بندی |
| `GET` | `/api/masterdata/tables` | کاربر لاگین‌شده | - | دریافت لیست جداول مرجع فعال، تعداد رکوردها و زمان آخرین سینک |
| `GET` | `/api/masterdata/tables/{id}` | کاربر لاگین‌شده | - | مشخصات ستون‌ها، کوئری و زمان‌بند PBI-Style جدول مرجع |
| `POST` | `/api/masterdata/tables` | `Admin, SuperUser` | `TableCreateUpdateDto` | ساخت جدول مرجع جدید (روش‌های Manual, Excel, SqlQuery) |
| `PUT` | `/api/masterdata/tables/{id}` | `Admin, SuperUser` | `TableCreateUpdateDto` | به‌روزرسانی تنظیمات، ستون‌ها، فیلترها و زمان‌بندی جدول مرجع |
| `DELETE` | `/api/masterdata/tables/{id}` | `Admin, SuperUser` | - | حذف جدول مرجع |
| `POST` | `/api/masterdata/tables/preview-sql` | `Admin, SuperUser` | `PreviewSqlRequestDto` | کشف خودکار اسکیما و ستون‌ها با اجرای آزمایشی امن `TOP 10` |
| `POST` | `/api/masterdata/tables/preview-full`| `Admin, SuperUser` | `PreviewSqlFullRequestDto`| بازبینی کامل داده‌ها پیش از فراخوانی همراه با ارزیابی فیلترها |
| `POST` | `/api/masterdata/tables/{id}/sync` | `Admin, SuperUser` | - | **همگام‌سازی فوری (Upsert Manual Trigger):** واکشی داده از مبدأ به کش محلی |
| `POST` | `/api/masterdata/tables/{id}/import` | `Admin, SuperUser` | `file` (Multipart Form) | بارگذاری فایل اکسل (`.xlsx`) یا متنی (`.csv`) جهت ورود دسته‌ای |
| `GET` | `/api/masterdata/tables/{id}/sample-template`| کاربر لاگین‌شده | - | دانلود فایل قالب اکسل/CSV منطبق با ستون‌های تعریف‌شده |
| `GET` | `/api/masterdata/tables/{id}/records` | کاربر لاگین‌شده | `version` (Query اختیاری) | **مصرف سریع کلاینت:** دریافت رکوردهای کش محلی با پشتیبانی از `versionHash` |
| `GET` | `/api/masterdata/tables/{id}/lookup` | کاربر لاگین‌شده | `query`, `limit` (Query) | جستجوی بلادرنگ در کد و عنوان رکوردها جهت دراپ‌داون فرم |
| `GET` | `/api/masterdata/tables/{id}/records/manage`| `Admin, SuperUser` | `page`, `pageSize`, `search` | صفحه‌بندی مدیریتی رکوردهای جدول مرجع با فیلتر |
| `POST` | `/api/masterdata/tables/{id}/records` | `Admin, SuperUser` | `RecordCreateUpdateDto` | درج دستی رکورد جدید در جدول مرجع |
| `PUT` | `/api/masterdata/tables/{id}/records/{recId}`| `Admin, SuperUser` | `RecordCreateUpdateDto` | ویرایش رکورد موجود در جدول مرجع |
| `DELETE`| `/api/masterdata/tables/{id}/records/{recId}`| `Admin, SuperUser` | - | تغییر وضعیت رکورد مرجع بین فعال و غیرفعال (Soft Delete) |

---

### ۳.۷. گزارش‌ها، آمار و دستیار هوش مصنوعی (Reports & AI Studio)

| متد | مسیر URL | سطح دسترسی | پارامترها و بدنه | شرح عملکرد |
| :---: | :--- | :---: | :--- | :--- |
| `GET` | `/api/forms/{id}/submissions-report` | کاربر مجاز | - | گزارش کامل درخواست‌های ثبت‌شده، جزییات فیلدها و جداول اقلام |
| `POST` | `/api/admin/ai/generate-multi-form-query` | `Admin` | `MultiFormQueryRequestDto` | **دستیار هوش مصنوعی:** تبدیل پرامپت فارسی به کوئری امن T-SQL با پشتیبانی از `OPENJSON` |
| `GET` | `/api/admin/ai/providers` | `Admin` | - | دریافت لیست ارائه‌دهندگان هوش مصنوعی پیکربندی‌شده (Ollama و...) |
| `POST` | `/api/admin/ai/providers` | `Admin` | `AiProviderItemDto` (Body) | تعریف یا ویرایش ارائه‌دهنده سرویس هوش مصنوعی |
| `POST` | `/api/admin/ai/providers/set-active/{id}` | `Admin` | - | فعال‌سازی ارائه‌دهنده هوش مصنوعی مدنظر |
| `DELETE` | `/api/admin/ai/providers/{id}` | `Admin` | - | حذف ارائه‌دهنده هوش مصنوعی |
| `POST` | `/api/admin/ai/fetch-models` | `Admin` | `FetchModelsRequestDto` | استعلام لیست مدل‌های نصب‌شده روی سرور محلی هوش مصنوعی |
| `GET` | `/api/admin/ai/config` | `Admin` | - | دریافت تنظیمات عمومی سرویس هوش مصنوعی |
| `POST` | `/api/admin/ai/config` | `Admin` | `AiConfiguration` (Body) | ذخیره تنظیمات و پرامپت سیستمی موتور هوش مصنوعی |

---

### ۳.۸. نظرسنجی‌های عمومی سازمانی (Public Surveys)

| متد | مسیر URL | سطح دسترسی | پارامترها و بدنه | شرح عملکرد |
| :---: | :--- | :---: | :--- | :--- |
| `GET` | `/api/forms/public/{token}` | عمومی (AllowAnonymous) | - | دریافت ساختار فرم نظرسنجی عمومی با توکن اختصاصی امن |
| `GET` | `/api/forms/public/captcha` | عمومی (AllowAnonymous) | - | تولید و دریافت کد امنیتی تصویری آفلاین (کپچا) و توکن هش |
| `POST` | `/api/workflow/submit-public` | عمومی (AllowAnonymous) | `SubmitFormDto` (Body) | ثبت پاسخ فرم عمومی با اعتبارسنجی کپچا و هانی‌پات ضد اسپم |

---

### ۳.۹. تنظیمات زیرساخت، سلامت سیستم و پشتیبان‌گیری (System & Backup)

| متد | مسیر URL | سطح دسترسی | پارامترها و بدنه | شرح عملکرد |
| :---: | :--- | :---: | :--- | :--- |
| `GET` | `/health` | عمومی (AllowAnonymous) | - | ارزیابی سلامت سیستم، سرویس دات‌نت و دسترسی به SQL Server |
| `GET` | `/api/settings/branding` | عمومی (AllowAnonymous) | - | دریافت مشخصات ظاهری، عنوان سامانه و نشانی لوگوی سازمان |
| `POST` | `/api/settings/upload-logo` | `Admin` | `file` (Multipart Form) | بارگذاری فایل لوگوی رسمی جدید سازمان |
| `GET` | `/api/settings/session` | `Admin` | - | دریافت تنظیمات مدت نشست کاری و سیاست‌های قفل حساب |
| `POST` | `/api/settings/session` | `Admin` | `JsonElement` (Body) | ذخیره تنظیمات مدت اعتبار توکن و تعداد خطاهای مجاز |
| `GET` | `/api/settings/ad` | `Admin` | - | دریافت پیکربندی اتصال به Active Directory |
| `POST` | `/api/settings/ad` | `Admin` | `JsonElement` (Body) | ذخیره تنظیمات سرور LDAP و حساب کاربری سرویس دامنه |
| `POST` | `/api/settings/ad/test` | `Admin` | `JsonElement` (Body) | آزمایش برخط ارتباط با سرور Active Directory |
| `GET` | `/api/settings/email` | `Admin` | - | دریافت تنظیمات سرور ایمیل سازمانی (SMTP) |
| `POST` | `/api/settings/email` | `Admin` | `JsonElement` (Body) | ذخیره مشخصات سرور SMTP، پورت و رمزنگاری TLS |
| `POST` | `/api/settings/email/test` | `Admin` | `JsonElement` (Body) | ارسال ایمیل آزمایشی جهت اعتبارسنجی درگاه SMTP |
| `GET` | `/api/admin/backup/status` | `Admin` | - | دریافت وضعیت زمان‌بندی و دایرکتوری پشتیبان‌گیری |
| `POST` | `/api/admin/backup/create` | `Admin` | `BackupRequestDto` (Body) | ایجاد نسخه پشتیبان فوری از دیتابیس و فایل‌های uploads |
| `GET` | `/api/admin/backup/list` | `Admin` | `storagePath` (Query) | دریافت لیست فایل‌های پشتیبان موجود در سرور |
| `GET` | `/api/admin/backup/download/{fileName}` | `Admin` | `storagePath` (Query) | دانلود فایل پشتیبان از سرور |
| `DELETE` | `/api/admin/backup/{fileName}` | `Admin` | `storagePath` (Query) | حذف فایل پشتیبان از سرور |
| `POST` | `/api/admin/backup/restore` | `Admin` | `Multipart Form` | بازیابی نسخه پشتیبان دیتابیس و فایل‌های پیوست |

### ۳.۱۰. مدیریت اسناد و پیوست‌های پرونده (Submissions & File Explorer)

کنترلر پیوست‌های پرونده امکان کاوش امن اسناد ضمیمه‌شده به هر درخواست، استخراج متادیتا، فشرده‌سازی درلحظه فایل‌های پرونده (ZIP) و دانلود فایل بدون نیاز به فعال‌سازی دایرکتوری بروسینگ ناامن وب‌سرور را فراهم می‌سازد:

| متد | مسیر فراخوانی (URL) | سطح دسترسی | پارامترها / ورودی | شرح عملکرد و خروجی |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/submissions/by-tracking/{trackingCode}/attachments` | احراز هویت / عمومی (بر اساس پرونده) | `trackingCode` (Path) | دریافت لیست متادیتای فایل‌های پیوست پرونده (`نام اصلی فایل`، `پسوند`، `حجم به KB/MB`، `تاریخ بارگذاری` و `مسیر دانلود امن`) |
| `GET` | `/api/submissions/by-tracking/{trackingCode}/attachments/zip` | احراز هویت / عمومی (بر اساس پرونده) | `trackingCode` (Path) | فشرده‌سازی درلحظه تمامی اسناد پیوست پرونده با فرمت ZIP و دانلود با نام `Attachments_{trackingCode}.zip` |
| `GET` | `/api/submissions/by-tracking/{trackingCode}/attachments/download` | احراز هویت / عمومی (بر اساس پرونده) | `trackingCode` (Path), `fileName` (Query) | دانلود مستقیم و امن فایل پیوست منفرد با اعتبارسنجی دسترسی پرونده و پیشگیری از حملات Path Traversal |
| `POST` | `/api/submissions/upload-attachment` | `Authenticated` / عمومی (فرم عمومی) | `file` (Multipart Form), `trackingCode` (Optional Form) | آپلود امن فایل ضمیمه جدید، اعتبارسنجی پسوندهای مجاز و ذخیره در مسیر ایزوله پرونده |

---

## ۴. ساختارهای نمونه JSON برای سناریوهای کلیدی

### سناریوی ۱: ورود و دریافت توکن احراز هویت (Login)
**درخواست:**
```http
POST /api/auth/login HTTP/1.1
Host: bpms.example-org.ir
Content-Type: application/json

{
  "username": "a.mohammadi",
  "password": "Password@12345"
}
```
**پاسخ موفق (HTTP 200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMDAiLCJuYW1laWQiOiIxMDAiLCJ1bmlxdWVfbmFtZSI6ImEubW9oYW1tYWRpIiwiZGlzcGxheV9uYW1lIjoi2LnZhNuMINmF2K3Zhdiv2YkiLCJyb2xlIjoiU3VwZXJVc2VyIn0...",
  "displayName": "علی محمدی",
  "username": "a.mohammadi",
  "userID": 100,
  "roles": [
    "SuperUser"
  ]
}
```

---

### سناریوی ۲: ثبت درخواست جدید همراه با جدول اقلام پویا (Submit with Repeater Grid)
**درخواست:**
```http
POST /api/workflow/submit HTTP/1.1
Host: bpms.example-org.ir
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "formId": 12,
  "comment": "درخواست خرید فوری تجهیزات اداری جهت تجهیز واحد جدید",
  "formDataJson": "{\"fld_cost_center\":\"102\",\"fld_delivery_date\":\"1403/09/15\",\"tbl_items\":[{\"col_code\":\"000039\",\"col_name\":\"کاغذ A4 هشتاد گرم ۵۰۰ عددی\",\"col_unit\":\"بسته\",\"col_qty\":50,\"col_price\":1800000,\"col_total\":90000000},{\"col_code\":\"000084\",\"col_name\":\"تونر کارتریج پرینتر لیزری\",\"col_unit\":\"عدد\",\"col_qty\":4,\"col_price\":12500000,\"col_total\":50000000}]}"
}
```
**پاسخ موفق (HTTP 200 OK):**
```json
{
  "submissionId": 2480,
  "formId": 12,
  "formTitle": "درخواست خرید تجهیزات اداری و کالا",
  "trackingCode": "NF-1403-2480",
  "workflowStatus": "در جریان",
  "currentStepName": "تایید سرپرست اداری و تدارکات",
  "currentStepIndex": 1,
  "totalSteps": 3,
  "submittedByUserName": "علی محمدی",
  "submittedAt": "2026-11-22T08:30:00Z"
}
```

---

### سناریوی ۳: اقدام تایید/رد مرحله در کارتابل (Workflow Transition)
**درخواست:**
```http
POST /api/workflow/submissions/2480/transition HTTP/1.1
Host: bpms.example-org.ir
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "action": "Approve",
  "comment": "مورد تایید است، لطفاً به واحد مالی ارجاع داده شود."
}
```
**پاسخ موفق (HTTP 200 OK):**
```json
{
  "submissionId": 2480,
  "trackingCode": "NF-1403-2480",
  "workflowStatus": "در جریان",
  "currentStepName": "تایید مدیریت امور مالی",
  "currentStepIndex": 2,
  "totalSteps": 3,
  "actionState": "Approved",
  "lastComment": "مورد تایید است، لطفاً به واحد مالی ارجاع داده شود."
}
```

---

### سناریوی ۴: دریافت رکوردهای جدول مرجع با اعتبارسنجی کش (Master Data Consumption)
**درخواست:**
```http
GET /api/masterdata/tables/4/records?version=a3f89c4d12e8b HTTP/1.1
Host: bpms.example-org.ir
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
**پاسخ در صورت عدم تغییر نسخه (Up-to-Date):**
```json
{
  "upToDate": true,
  "versionHash": "a3f89c4d12e8b",
  "columns": [],
  "records": []
}
```
**پاسخ در صورت به‌روزرسانی داده‌ها در سرور مبدأ:**
```json
{
  "upToDate": false,
  "versionHash": "b7d12f489c20a",
  "columns": [
    { "name": "ItemCode", "title": "کد کالا", "dataType": "string" },
    { "name": "ItemName", "title": "شرح کالا", "dataType": "string" },
    { "name": "Unit", "title": "واحد سنجش", "dataType": "string" },
    { "name": "BasePrice", "title": "قیمت پایه (ریال)", "dataType": "number" }
  ],
  "records": [
    {
      "id": 1042,
      "uniqueKeyValue": "000039",
      "data": {
        "ItemCode": "000039",
        "ItemName": "کاغذ A4 هشتاد گرم ۵۰۰ عددی",
        "Unit": "بسته",
        "BasePrice": 1800000
      }
    }
  ]
}
```

---

### سناریوی ۵: فراخوانی همگام‌سازی فوری جدول مرجع (Trigger Sync)
**درخواست:**
```http
POST /api/masterdata/tables/4/sync HTTP/1.1
Host: bpms.example-org.ir
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
**پاسخ موفق (HTTP 200 OK):**
```json
{
  "message": "✅ همگام‌سازی با موفقیت انجام شد. تعداد رکوردهای فعال: 1450",
  "table": {
    "id": 4,
    "code": "INV_ITEMS",
    "title": "فهرست کالاهای انبار مرکزی",
    "lastSyncAt": "2026-11-22T08:45:12Z",
    "lastSyncStatus": "Success",
    "recordCount": 1450,
    "versionHash": "b7d12f489c20a"
  }
}
```

### سناریوی ۶: دریافت متادیتای پیوست‌های پرونده و دانلود یکپارچه فایل ZIP
**درخواست دریافت لیست متادیتا:**
```http
GET /api/submissions/by-tracking/TRK-20261123-A1B2C3D4/attachments HTTP/1.1
Host: bpms.example-org.ir
Authorization: Bearer <JWT_TOKEN>
```

**پاسخ استاندارد (200 OK):**
```json
{
  "trackingCode": "TRK-20261123-A1B2C3D4",
  "submissionId": 1042,
  "formTitle": "درخواست خرید تجهیزات شبکه",
  "workflowStatus": "Approved",
  "submittedAt": "2026-11-23T08:30:00Z",
  "submittedBy": "کارشناس فناوری اطلاعات",
  "totalCount": 2,
  "totalSize": 1845200,
  "totalSizeFormatted": "1.76 MB",
  "zipDownloadUrl": "/api/submissions/by-tracking/TRK-20261123-A1B2C3D4/attachments/zip",
  "attachments": [
    {
      "fileName": "a1b2c3d4_Network_Switch_Specification.pdf",
      "originalFileName": "Network_Switch_Specification.pdf",
      "extension": "PDF",
      "size": 1245000,
      "sizeFormatted": "1.19 MB",
      "uploadedAt": "2026-11-23T08:30:00Z",
      "downloadUrl": "/api/submissions/by-tracking/TRK-20261123-A1B2C3D4/attachments/download?fileName=a1b2c3d4_Network_Switch_Specification.pdf",
      "isImage": false
    },
    {
      "fileName": "e5f6g7h8_Invoice_Quote.png",
      "originalFileName": "Invoice_Quote.png",
      "extension": "PNG",
      "size": 600200,
      "sizeFormatted": "586.1 KB",
      "uploadedAt": "2026-11-23T08:30:00Z",
      "downloadUrl": "/api/submissions/by-tracking/TRK-20261123-A1B2C3D4/attachments/download?fileName=e5f6g7h8_Invoice_Quote.png",
      "isImage": true
    }
  ]
}
```

**دانلود یکپارچه بسته فشرده ZIP تمام اسناد پرونده:**
```http
GET /api/submissions/by-tracking/TRK-20261123-A1B2C3D4/attachments/zip HTTP/1.1
Host: bpms.example-org.ir
Authorization: Bearer <JWT_TOKEN>
```
*پاسخ: فایل فشرده باینری (`application/zip`) با هدر `Content-Disposition: attachment; filename="Attachments_TRK-20261123-A1B2C3D4.zip"` به همراه تمامی فایل‌های پیوست پرونده.*

---

## ۵. نمونه کدهای عملی اتصال سامانه‌های بیرونی (PowerShell و cURL)

### ۵.۱. اسکریپت کامل اتوماسیون با PowerShell (`Invoke-RestMethod`)
این سناریو برای اتصال سیستم‌های ویندوزی، Task Scheduler و نرم‌افزارهای یکپارچه‌ساز درون‌سازمانی طراحی شده است:

```powershell
# ==============================================================================
# اسکریپت نمونه اتصال سیستم‌های بیرونی به سامانه مدیریت فرآیندهای نوافلو (NovaFlow)
# ==============================================================================
$ErrorActionPreference = "Stop"

$baseUrl = "https://bpms.example-org.ir/api"
$username = "a.mohammadi"
$password = "Password@12345"

# ۱. احراز هویت و دریافت توکن امنیتی JWT
Write-Host "در حال دریافت توکن احراز هویت از نوافلو..."
$loginBody = @{
    username = $username
    password = $password
} | ConvertTo-Json

$loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" `
    -Method Post `
    -Body $loginBody `
    -ContentType "application/json; charset=utf-8"

$token = $loginResponse.token
Write-Host "توکن با موفقیت دریافت شد: $token" -ForegroundColor Green

# تعریف هدرهای احراز هویت برای درخواست‌های بعدی
$headers = @{
    "Authorization" = "Bearer $token"
    "Accept"        = "application/json"
}

# ۲. فراخوانی همگام‌سازی فوری جدول کالاهای مرجع (Master Data Sync)
$tableId = 4
Write-Host "در حال ارسال فرمان همگام‌سازی جدول مرجع $tableId..."
$syncResponse = Invoke-RestMethod -Uri "$baseUrl/masterdata/tables/$tableId/sync" `
    -Method Post `
    -Headers $headers `
    -ContentType "application/json; charset=utf-8"

Write-Host $syncResponse.message -ForegroundColor Cyan

# ۳. ثبت خودکار یک درخواست خرید کالا همراه با جدول اقلام (Repeater Grid)
$formId = 12
$formData = @{
    fld_cost_center   = "102"
    fld_delivery_date = "1403/09/20"
    tbl_items         = @(
        @{
            col_code  = "000039"
            col_name  = "کاغذ A4 هشتاد گرم ۵۰۰ عددی"
            col_unit  = "بسته"
            col_qty   = 30
            col_price = 1800000
            col_total = 54000000
        },
        @{
            col_code  = "000084"
            col_name  = "تونر کارتریج پرینتر لیزری"
            col_unit  = "عدد"
            col_qty   = 2
            col_price = 12500000
            col_total = 25000000
        }
    )
}

$submitPayload = @{
    formId       = $formId
    comment      = "ثبت خودکار از طریق وب‌سرویس سیستم یکپارچه انبار"
    formDataJson = ($formData | ConvertTo-Json -Compress)
} | ConvertTo-Json

Write-Host "در حال ارسال فرم به گردش‌کار نوافلو..."
$submitResponse = Invoke-RestMethod -Uri "$baseUrl/workflow/submit" `
    -Method Post `
    -Headers $headers `
    -Body $submitPayload `
    -ContentType "application/json; charset=utf-8"

Write-Host "درخواست با موفقیت ثبت شد!" -ForegroundColor Green
Write-Host "کد رهگیری پرونده: $($submitResponse.trackingCode)" -ForegroundColor Yellow
Write-Host "وضعیت جاری: $($submitResponse.currentStepName)"
```

---

### ۵.۲. دستورات استاندارد خط فرمان با `cURL`

#### گام اول: لاگین و استخراج توکن:
```bash
curl -X POST "https://bpms.example-org.ir/api/auth/login" \
     -H "Content-Type: application/json; charset=utf-8" \
     -d '{"username":"a.mohammadi","password":"Password@12345"}'
```

#### گام دوم: دریافت کارتابل ورودی (Inbox):
```bash
curl -X GET "https://bpms.example-org.ir/api/workflow/inbox" \
     -H "Authorization: Bearer <TOKEN_HERE>" \
     -H "Accept: application/json"
```

#### گام سوم: اقدام تایید روی پرونده:
```bash
curl -X POST "https://bpms.example-org.ir/api/workflow/submissions/2480/transition" \
     -H "Authorization: Bearer <TOKEN_HERE>" \
     -H "Content-Type: application/json; charset=utf-8" \
     -d '{"action":"Approve","comment":"تایید شد از طریق خط فرمان"}'
```

#### گام چهارم: استعلام سلامت سرویس (بدون نیاز به توکن):
```bash
curl -X GET "https://bpms.example-org.ir/health"
```

---

## ۶. جدول کدهای وضعیت و مدیریت خطاهای HTTP

سامانه نوافلو از کدهای استاندارد وضعیت HTTP (RFC 9110) به همراه بدنه پیام خطای فارسی ساختاریافته بهره می‌برد:

| کد وضعیت | عنوان استاندارد | علت رخداد در سامانه نوافلو | راهکار رفع خطا |
| :---: | :--- | :--- | :--- |
| **200** | `OK` | عملیات با موفقیت کامل انجام شده است. | پردازش داده‌های بازگشتی در بدنه پاسخ. |
| **400** | `Bad Request` | خطای اعتبارسنجی ورودی‌ها، عدم تطابق اسکیمای JSON یا نقص شروط BRMS. | بررسی پیام `message` در بدنه پاسخ و اصلاح پارامترهای ارسالی. |
| **401** | `Unauthorized` | عدم ارسال هدر Authorization، نامعتبر بودن یا منقضی شدن توکن JWT. | فراخوانی مجدد اندپوینت `/api/auth/login` و دریافت توکن جدید. |
| **403** | `Forbidden` | عدم کفایت دسترسی یا عدم تطابق نقش کاربر (`Admin`, `SuperUser`) با الزامات اندپوینت. | بررسی نقش‌های کاربر لاگین‌شده یا ارتقای دسترسی توسط مدیر سیستم. |
| **404** | `Not Found` | شناسه فرم، پرونده کارتابل یا جدول مرجع در دیتابیس یافت نشد. | بررسی صحت شناسه عددی ارسالی در مسیر URL. |
| **423** | `Locked` | حساب کاربری به دلیل ۵ تلاش ناموفق پیاپی موقتاً قفل شده است (مکانیزم ضد Brute-Force). | صبر به مدت ۱۵ دقیقه یا بازگشایی توسط مدیر با اندپوینت `/api/users/{id}/unlock`. |
| **500** | `Internal Server Error` | خطای داخلی مدیریت‌نشده در سرور یا اجرای کوئری در پایگاه‌داده. | بررسی لاگ‌های سرور در دایرکتوری `logs/stdout` یا کنسول رخدادهای ویندوز. |
| **503** | `Service Unavailable` | عدم برقراری ارتباط با Active Directory سرور یا دیتابیس خارجی در Master Data Hub. | بررسی وضعیت شبکه، پورت‌های فایروال و صحت دسترسی سرویس اکانت. |

### قالب استاندارد پاسخ‌های خطا:
```json
{
  "message": "کد امنیتی (کپچا) واردشده نامعتبر یا منقضی شده است."
}
```

---

## ۷. الزامات امنیتی و بهترین الگوهای یکپارچه‌سازی

1. **مدیریت ایمن گذرواژه‌ها و توکن‌ها:** هرگز توکن‌ها و گذرواژه‌های وب‌سرویس را در کدهای کلاینت ذخیره نکرده و آن‌ها را در متغیرهای محیطی رمزنگاری‌شده (Environment Variables یا Secret Management) نگهداری فرمایید.
2. **استفاده از کش محلی دو‌لایه برای جداول مرجع:** هنگام واکشی رکوردهای حجیم از اندپوینت `/api/masterdata/tables/{id}/records`، همواره پارامتر `version` را ارسال کنید تا در صورت عدم تغییر داده‌ها، داده‌های تکراری در پهنای باند شبکه منتقل نگردند.
3. **پایش سوابق در Audit Logs:** تمامی عملیات لاگین، تغییر مراحل گردش‌کار، ویرایش فرم‌ها و همگام‌سازی جداول مرجع همراه با نشانی IP، زمان و شناسه اقدام‌کننده در جدول `AuditLogs` پایگاه‌داده نوافلو ثبت می‌شوند و قابل ممیزی رسمی می‌باشند.
4. **تضمین پایداری در شبکه‌های ایزوله (Air-Gapped):** تمامی وب‌سرویس‌های نوافلو کاملاً مستقل از اینترنت عمل می‌کنند و هیچ اتصالی به سرورهای خارجی برقرار نمی‌سازند.
