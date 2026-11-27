# 🚀 راهنمای جامع نصب، استقرار و نگهداری سامانه نوافلو (NovaFlow)
## (Deployment, Installation & Maintenance Guide — Windows Server / IIS)

> **نام سامانه:** نوافلو (NovaFlow) — سامانه جامع مدیریت فرآیندهای کسب‌وکار و فرم‌ساز سازمانی  
> **سازگار با:** ویندوز سرور 2019 / 2022 / 2025 و ویندوز 10 / 11 پرو (معماری 64-Bit)  
> **وب‌سرور هدف:** Internet Information Services (IIS 10.0+)  
> **محیط اجرا:** سازگار با شبکه‌های ایزوله و اینترانت سازمانی (100% Offline / Air-Gapped Ready)  

---

## 📋 فهرست مطالب
1. [پیش‌نیازهای زیرساخت و معرفی بسته‌های نصبی (Pre-Install App)](#۱-پیش‌نیازهای-زیرساخت-و-معرفی-بسته‌های-نصبی-pre-install-app)
2. [ترتیب استاندارد آماده‌سازی سرور خام](#۲-ترتیب-استاندارد-آماده‌سازی-سرور-خام)
3. [روش اول: استقرار خودکار و هوشمند با Deploy-BPMS.ps1 (توصیه‌شده)](#۳-روش-اول-استقرار-خودکار-و-هوشمند-با-deploy-bpmsps1-توصیه‌شده)
4. [روش دوم: استقرار دستی گام‌به‌گام (Manual Deployment)](#۴-روش-دوم-استقرار-دستی-گام‌به‌گام-manual-deployment)
5. [راه‌اندازی و مقداردهی اولیه پایگاه‌داده (BPMS_DB_Schema.sql)](#۵-راه‌اندازی-و-مقداردهی-اولیه-پایگاهداده-bpms_db_schemasql)
6. [فعال‌سازی HTTPS، گواهی Wildcard SSL، HSTS و انتشار روی اینترنت](#۶-فعالسازی-https-گواهی-wildcard-ssl-hsts-و-انتشار-روی-اینترنت)
7. [نحوه به‌روزرسانی سامانه (بدون حذف فایل‌های آپلودی و تنظیمات)](#۷-نحوه-بهروزرسانی-سامانه-بدون-حذف-فایلهای-آپلودی-و-تنظیمات)
8. [ورود اولیه به سامانه و اعتبارسنجی استقرار](#۸-ورود-اولیه-به-سامانه-و-اعتبارسنجی-استقرار)
9. [عیب‌یابی خطاهای رایج IIS و رفع اشکال (Troubleshooting)](#۹-عیبیابی-خطاهای-رایج-iis-و-رفع-اشکال-troubleshooting)
10. [پشتیبان‌گیری دوره‌ای و بازیابی اطلاعات (Backup & Disaster Recovery)](#۱۰-پشتیبانگیری-دورهای-و-بازیابی-اطلاعات-backup--disaster-recovery)
11. [راهنمای حذف کامل و ایمن سامانه با Uninstall-BPMS.ps1](#۱۱-راهنمای-حذف-کامل-و-ایمن-سامانه-با-uninstall-bpmsps1)

---

## ۱. پیش‌نیازهای زیرساخت و معرفی بسته‌های نصبی (Pre-Install App)

کلیه فایل‌های نصبی آفلاین مورد نیاز جهت آماده‌سازی سرور مقصد در پوشه `Pre-Install App` در دسترس قرار داده شده‌اند. جدول زیر کاربرد دقیق و محل نیاز هر بسته را مشخص می‌سازد:

| نام فایل نصبی | حجم تقریبی | نوع و عنوان بسته | کاربرد و الزامات محیطی |
| :--- | :---: | :--- | :--- |
| **`rewrite_amd64_en-US.msi`** | ~۶ مگابایت | **IIS URL Rewrite Module 2.1** | **الزامی روی سرور عملیاتی:** ماژول بازنویسی آدرس در IIS جهت پشتیبانی از مسیریابی برنامه‌های تک‌صفحه‌ای (SPA). بدون این ماژول، در صورت رفرش یا دسترسی مستقیم به صفحات داخلی خطای 404 یا 500.19 رخ خواهد داد. |
| **`dotnet-hosting-8.0.34-win.exe`** | ~۱۱۰ مگابایت | **.NET 8.0 Hosting Bundle** | **الزامی روی سرور عملیاتی:** شامل .NET CLR، کتابخانه‌های اشتراکی ASP.NET Core Runtime و از همه مهم‌تر ماژول `AspNetCoreModuleV2` برای IIS. **این بسته حتماً باید پس از فعال‌سازی نقش IIS نصب گردد.** |
| **`dotnet-sdk-8.0.428-win-x64.exe`** | ~۲۲۰ مگابایت | **.NET 8.0 SDK (توسعه)** | **صرفاً برای سیستم بیلد و توسعه‌دهنده:** این بسته حاوی کامپایلرها و ابزارهای ساخت C# است. **هیچ نیازی به نصب این فایل روی سرور عملیاتی و پکیج Release وجود ندارد.** |
| **Microsoft SQL Server** | - | **پایگاه‌داده سازمانی** | نسخه 2016 تا 2025 (Express, Standard یا Enterprise) با فعال بودن پروتکل TCP/IP و Collation استاندارد `Persian_100_CI_AI`. |

> [!IMPORTANT]
> **تفاوت اساسی Hosting Bundle و SDK:**  
> سرور عملیاتی که پکیج آماده انتشار (`App` یا `BPMS_Release`) را میزبانی می‌کند، **فقط و فقط** به بسته `dotnet-hosting-8.0.34-win.exe` نیاز دارد و نصب SDK یا محیط Node.js روی سرور تولیدی اکیداً غیرضروری بوده و توصیه نمی‌شود.

---

## ۲. ترتیب استاندارد آماده‌سازی سرور خام

برای جلوگیری از خطاهای ناشی از عدم شناسایی ماژول‌های دات‌نت توسط وب‌سرور، مراحل اولیه را دقیقاً به ترتیب زیر طی فرمایید:

### گام ۱: فعال‌سازی نقش Web Server (IIS)
در محیط PowerShell با دسترسی Administrator دستور زیر را اجرا کنید:
```powershell
Install-WindowsFeature -Name Web-Server, Web-WebServer, Web-Common-Http, Web-Static-Content, Web-Default-Doc, Web-Dir-Browsing, Web-Http-Errors, Web-Http-Redirect, Web-Http-Logging, Web-Stat-Compression, Web-Filtering, Web-Mgmt-Console -IncludeManagementTools
```

### گام ۲: نصب ماژول IIS URL Rewrite
فایل `rewrite_amd64_en-US.msi` را اجرا و نصب نمایید.

### گام ۳: نصب بسته میزبانی دات‌نت (.NET 8 Hosting Bundle)
فایل `dotnet-hosting-8.0.34-win.exe` را اجرا کنید تا ماژول `AspNetCoreModuleV2` به صورت خودکار در ساختار وب‌سرور IIS ثبت گردد.

> [!NOTE]
> چنانچه بسته هاستینگ دات‌نت را اشتباهاً پیش از فعال‌سازی IIS نصب کرده‌اید، فایل `dotnet-hosting-8.0.34-win.exe` را مجدداً اجرا کرده و گزینه **Repair** را انتخاب کنید، سپس دستور `iisreset` را در CMD اجرا نمایید.

---

## ۳. روش اول: استقرار خودکار و هوشمند با Deploy-BPMS.ps1 (توصیه‌شده)

سامانه نوافلو مجهز به اسکریپت استقرار صفر-کلیک `Deploy-BPMS.ps1` است. این اسکریپت کلیه مراحل بررسی پیش‌نیازها، آماده‌سازی فایل‌ها، ساخت دیتابیس، ایجاد وب‌سایت در IIS، پیکربندی Application Pool و اعمال مجوزهای امنیتی را به شکل خودکار انجام می‌دهد.

### نحوه اجرا:
۱. ترمینال **PowerShell** را در حالت **Run as Administrator** باز کنید.  
۲. به مسیر پکیج انتشار بروید:
```powershell
cd C:\BPMS_Release_Clean
```
۳. اسکریپت را اجرا نمایید:
```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
.\Deploy-BPMS.ps1
```

### پارامترهای پیشرفته اسکریپت:
در صورت تمایل به اجرای غیرتعاملی و اختصاصی (از جمله فعال‌سازی هم‌زمان HTTPS و SNI)، می‌توانید از پارامترهای زیر استفاده نمایید:
```powershell
.\Deploy-BPMS.ps1 `
    -SiteName "NovaFlow" `
    -Port 80 `
    -EnableHttps `
    -HostName "bpms.yourdomain.ir" `
    -CertThumbprint "AABBCCDD11223344556677889900AABBCCDD1122" `
    -PhysicalPath "C:\inetpub\wwwroot\NovaFlow" `
    -AppPoolName "NovaFlowAppPool" `
    -SqlConnectionString "Server=localhost;Database=BPMS_DB;Integrated Security=True;TrustServerCertificate=True;"
```

### عملیات هوشمندی که اسکریپت انجام می‌دهد:
* **تشخیص خودکار پکیج:** شناسایی حالت آفلاین (`App` از پیش کامپایل‌شده) و عدم نیاز به ابزارهای کامپایل.
* **بررسی پیش‌نیازها:** اعتبارسنجی نصب بودن دات‌نت ۸، وجود `AspNetCoreModuleV2` و `rewrite.dll` در سیستم.
* **آزادسازی قفل فایل‌ها:** متوقف کردن ایمن سایت و AppPool قبلی در صورت وجود، برای جلوگیری از خطای `File in use`.
* **پیکربندی دیتابیس:** ایجاد دیتابیس `BPMS_DB` با Collation فارسی و اجرای خودکار `BPMS_DB_Schema.sql`.
* **ساخت یا بازنشانی رمز کاربر اولیه (`local_admin`):** اجرای دستور `--init-db --seed` همراه با گزینه تعاملی حفظ رمز عبور فعلی (یا اعمال پیش‌فرض `Admin@123456` در نصب نو) و یا بازنشانی رمز جدید از طریق فلگ `--reset-admin-password` و متغیر محیطی `BPMS_RESET_ADMIN_PASSWORD` (همراه با آزادسازی قفل و ریست شمارنده تلاش ناموفق).
* **راه‌اندازی خودکار HTTPS، Wildcard SSL و ریدایرکت ۳۱۰:** اسکن گواهی‌های معتبر در `Cert:\LocalMachine\My` (از جمله گواهی‌های `*.domain`)، ایجاد Binding پورت `443` با `SNI` و اتصال گواهی بدون حذف Binding پورت `80`، باز کردن پورت TCP `443` در فایروال ویندوز، فعال‌سازی `EnableHttpsRedirect` و `EnableHsts` در `appsettings.json` و افزودن قانون ریدایرکت `301 Permanent` در `web.config` (در صورت نصب بودن ماژول URL Rewrite).
* **کانفیگ حرفه‌ای IIS:** ایجاد AppPool با تنظیمات `No Managed Code`، حالت `AlwaysRunning` و `IdleTimeout = 0` به همراه پورت مدنظر.
* **اعمال مجوزهای امنیتی NTFS:** اعطای دسترسی `Modify` و `FullControl` به کاربر سیستمی `IIS_IUSRS` بر روی دایرکتوری فیزیکی.

---

## ۴. روش دوم: استقرار دستی گام‌به‌گام (Manual Deployment)

در شرایطی که دسترسی مستقیم به اجرای PowerShell ندارید، استقرار را طبق گام‌های زیر انجام دهید:

### گام اول: کپی فایل‌های سامانه
محتویات پوشه انتشار (`App`) را در مسیر فیزیکی وب‌سرور قرار دهید:
```
C:\inetpub\wwwroot\NovaFlow\
```
مطمئن شوید که دایرکتوری `wwwroot\uploads` در مسیر برنامه وجود دارد:
```powershell
New-Item -ItemType Directory -Path "C:\inetpub\wwwroot\NovaFlow\wwwroot\uploads" -Force
```

### گام دوم: تنظیم کانکشن استرینگ
فایل `C:\inetpub\wwwroot\NovaFlow\appsettings.json` را باز کرده و بخش دیتابیس را متناسب با سرور خود تکمیل کنید:
```json
"ConnectionStrings": {
  "BPMS_DB": "Server=localhost;Database=BPMS_DB;User Id=bpms_app_user;Password=YourStrongPassword!;TrustServerCertificate=True;"
}
```

### گام سوم: پیکربندی وب‌سایت در IIS Manager
۱. کنسول **Internet Information Services (IIS) Manager** را باز کنید.  
۲. در بخش **Application Pools** روی **Add Application Pool** کلیک کنید:
   * **Name:** `NovaFlowAppPool`
   * **.NET CLR Version:** `No Managed Code`
   * **Managed Pipeline Mode:** `Integrated`
۳. روی `NovaFlowAppPool` راست‌کلیک کرده و **Advanced Settings** را بزنید:
   * مقدار **Start Mode** را برابر با `AlwaysRunning` قرار دهید.
   * مقدار **Idle Time-out (minutes)** را برابر با `0` تنظیم کنید.
۴. در بخش **Sites** روی **Add Website** کلیک کنید:
   * **Site Name:** `NovaFlow`
   * **Application Pool:** `NovaFlowAppPool`
   * **Physical Path:** `C:\inetpub\wwwroot\NovaFlow`
   * **Port:** `80` (یا پورت مدنظر شما)
۵. مجوز دسترسی دایرکتوری:
   * در ویندوز روی پوشه `C:\inetpub\wwwroot\NovaFlow` راست‌کلیک کرده و **Properties** را بزنید.
   * در زبانه **Security**، دکمه **Edit** را فشرده و کاربر `IIS_IUSRS` را با دسترسی **Modify** و **Read & execute** اضافه کنید.

---

## ۵. راه‌اندازی و مقداردهی اولیه پایگاه‌داده (BPMS_DB_Schema.sql)

اسکریپت `BPMS_DB_Schema.sql` ساختار کامل جداول، کلیدهای خارجی و ایندکس‌های سامانه را تعریف می‌کند:

۱. نرم‌افزار **SQL Server Management Studio (SSMS)** را اجرا کرده و به سرور متصل شوید.  
۲. فایل `BPMS_DB_Schema.sql` را باز کنید.  
۳. دکمه **Execute (F5)** را بزنید.  
۴. جداول کلیدی شامل `AppUsers`، `AppRoles`، `AppUserRoles`، `FormDefinitions`، `FormInstances`، `WorkflowSteps`، `WorkflowStepActions`، `PublicSurveys`، `SystemSettings` و `AuditLogs` ایجاد می‌گردند.

---

## ۶. فعال‌سازی HTTPS، گواهی Wildcard SSL، HSTS و انتشار روی اینترنت

سامانه نوافلو در حالت پیش‌فرض (`EnableHttpsRedirect: false`) روی شبکه داخلی **LAN** بدون نیاز به گواهی SSL راه‌اندازی می‌شود تا استقرار آزمایشی و درون‌سازمانی سریع باشد. برای بهره‌برداری عملیاتی با رمزنگاری TLS، استفاده از **گواهی Wildcard SSL (`*.yourdomain.ir`)** یا **انتشار سامانه روی اینترنت (پشت Reverse Proxy / WAF / CDN)** مطابق یکی از روش‌های زیر عمل کنید:

### الف) پیکربندی خودکار هنگام اجرا با `Deploy-BPMS.ps1`
۱. گواهی دیجیتال SSL (فایل `.pfx` دارای کلید خصوصی) را روی سرور ویندوزی در مسیر `Local Computer > Personal > Certificates` (`Cert:\LocalMachine\My`) ایمپورت نمایید.  
۲. اسکریپت `Deploy-BPMS.ps1` را با دسترسی Administrator اجرا کنید.  
۳. در گام تنظیم پورت، در پاسخ به پرسش فعال‌سازی HTTPS گزینه **`Y`** را وارد نمایید.  
۴. شماره ردیف گواهی مورد نظر (از جمله گواهی‌های `[WILDCARD]` مانند `*.yourdomain.ir`) یا `Thumbprint` آن و همچنین **Host Name** دامنه (مثلاً `bpms.yourdomain.ir`) را مشخص کنید.  
۵. اسکریپت به صورت خودکار:
   * Binding پورت **443 (HTTPS)** را همراه با **SNI (`SslFlags = 1`)** ایجاد و گواهی را متصل می‌نماید (ضمن حفظ Binding پورت **80** برای ریدایرکت).
   * پورت **TCP 443** را در فایروال ویندوز باز می‌کند (`New-NetFirewallRule`).
   * در فایل `appsettings.json` مقدار `"EnableHttpsRedirect": true` و `"EnableHsts": true` را ثبت می‌کند.
   * در صورت نصب بودن **IIS URL Rewrite**، قانون ریدایرکت **`301 Permanent`** از `http://` به `https://{HTTP_HOST}/{R:1}` را با در نظر گرفتن هدر `X-Forwarded-Proto` به `web.config` اضافه می‌کند.

### ب) تنظیمات `HttpsSettings` در `appsettings.json` (سرور و پشت Reverse Proxy)
در بخش ریشه فایل `appsettings.json` پارامترهای زیر قابل تنظیم هستند:
```json
"HttpsSettings": {
  "EnableHttpsRedirect": false,
  "EnableHsts": false,
  "TrustForwardedHeaders": true
}
```
* **`EnableHttpsRedirect`**: در حالت `true`، تمامی درخواست‌های ورودی `HTTP` توسط میدل‌ور `.NET 8` به صورت خودکار به `HTTPS` هدایت می‌شوند. (در استقرار داخلی بدون گواهی روی مقدار `false` بماند).
* **`EnableHsts`**: در حالت `true`، هدر امنیتی `Strict-Transport-Security` برای مرورگرها ارسال می‌شود تا همیشه اتصال امن برقرار کنند.
* **`TrustForwardedHeaders`**: در حالت `true`، میدل‌ور `UseForwardedHeaders` (`XForwardedFor | XForwardedProto`) در ابتدای پایپ‌لاین فعال است؛ بنابراین اگر **Nginx / Apache / HAProxy / Cloudflare / WAF** گواهی SSL را در لبه شبکه خاتمه دهد (SSL Termination) و ترافیک را با `http` به IIS بفرستد، بک‌اند پروتکل اصلی را `https` تشخیص داده و **دچار حلقه ریدایرکت بی‌نهایت (`ERR_TOO_MANY_REDIRECTS`) نمی‌شود.**

### ج) چک‌لیست انتشار امن روی اینترنت (Internet Publishing)
۱. ثبت رکورد DNS (`A` یا `CNAME`) دامنه مانند `bpms.yourdomain.ir` به IP عمومی سرور یا فایروال/WAF.  
۲. باز کردن صرفاً پورت `443` (و `80` صرفاً برای ریدایرکت به HTTPS) در فایروال مرزی شبکه و مسدود نگه داشتن پورت‌های SQL Server (`1433`) از بیرون.  
۳. اطمینان از فعال بودن `EnableHttpsRedirect: true` و `EnableHsts: true` در استقرار مستقیم IIS، یا قرار دادن `TrustForwardedHeaders: true` در سناریوی SSL Offloading روی Reverse Proxy/WAF.  
۴. تغییر فوری رمز عبور پیش‌فرض حساب `local_admin`، تعریف رمز قوی برای کاربران محلی و بررسی محدودیت حجم آپلود در `web.config`.

---

## ۷. نحوه به‌روزرسانی سامانه (بدون حذف فایل‌های آپلودی و تنظیمات)

برای اعمال نسخه جدید سامانه روی سرور عملیاتی موجود، بدون از دست رفتن تنظیمات دامین/ایمیل و فایل‌های پیوست کاربران:

۱. وب‌سایت و AppPool را متوقف کنید:
```powershell
Import-Module WebAdministration
Stop-WebSite -Name "NovaFlow"
Stop-WebAppPool -Name "NovaFlowAppPool"
```
۲. پوشه `uploads` و فایل `appsettings.json` را حفظ کنید:
```powershell
# بکاپ موقت از فایل تنظیمات و آپلودها
Copy-Item "C:\inetpub\wwwroot\NovaFlow\appsettings.json" "C:\inetpub\NovaFlow_appsettings_backup.json" -Force
```
۳. فایل‌های جدید نسخه انتشار (`App`) را روی دایرکتوری استقرار بازنویسی (`Overwrite`) کنید:
```powershell
Copy-Item -Path "C:\Path\To\NewRelease\App\*" -Destination "C:\inetpub\wwwroot\NovaFlow" -Recurse -Force
```
۴. فایل `appsettings.json` اصلی سرور را برگردانید:
```powershell
Copy-Item "C:\inetpub\NovaFlow_appsettings_backup.json" "C:\inetpub\wwwroot\NovaFlow\appsettings.json" -Force
```
۵. سایت و AppPool را مجدداً استارت نمایید:
```powershell
Start-WebAppPool -Name "NovaFlowAppPool"
Start-WebSite -Name "NovaFlow"
```

> [!TIP]
> با این متد، پایگاه‌داده SQL Server، تعاریف فرم‌ها، سوابق کارتابل، فایل‌های لوگو و پیوست‌های کاربران در `wwwroot\uploads` بدون کوچک‌ترین اختلالی حفظ می‌مانند.

---

## ۸. ورود اولیه به سامانه و اعتبارسنجی استقرار

پس از استقرار، مرورگر وب را باز کرده و آدرس پیکربندی‌شده را وارد کنید:
* **آدرس محلی یا امن سرور:** `http://localhost` (یا در حالت HTTPS: `https://bpms.yourdomain.ir`)
* **نام کاربری پیش‌فرض مدیریت:** `local_admin`
* **کلمه عبور پیش‌فرض:** `Admin@123456`

> [!CAUTION]
> بلافاصله پس از ورود اولیه، از منوی **«تنظیمات سیستم > مدیریت کاربران»** کلمه عبور حساب `local_admin` را تغییر داده و در صورت نیاز، اتصال به اکتیو دایرکتوری سازمان را پیکربندی نمایید.

---

## ۹. عیب‌یابی خطاهای رایج IIS و رفع اشکال (Troubleshooting)

| کد خطا در مرورگر | علت اصلی رخداد | راهکار فوری رفع مشکل |
| :---: | :--- | :--- |
| **HTTP Error 500.19** | عدم نصب یا خرابی ماژول URL Rewrite یا نقص تگ `aspNetCore` در `web.config` | ۱. نصب فایل `rewrite_amd64_en-US.msi`.<br>۲. نصب مجدد یا Repair فایل `dotnet-hosting-8.0.34-win.exe`. |
| **HTTP Error 500.30** | خطای In-Process Startup Failure (عدم موفقیت برنامه در اتصال به SQL یا خطای کانفیگ) | ۱. بررسی کانکشن استرینگ در `appsettings.json`.<br>۲. تست دسترسی کاربر دیتابیس به SQL Server.<br>۳. فعال‌سازی موقت لاگ با تغییر `stdoutLogEnabled="true"` در `web.config` و بررسی مسیر `logs\stdout`. |
| **HTTP Error 500.31 / 500.32** | عدم تطابق نسخه .NET Core Runtime با نسخه کامپایل‌شده پروژه | نصب بسته رسمی `dotnet-hosting-8.0.34-win.exe` (پشتیبانی از .NET 8). |
| **خطای 404 در رفرش صفحات SPA** | عدم بازنویسی درخواست‌های کلاینت به فایل `index.html` | اطمینان از وجود ماژول URL Rewrite و کنترل هندلرهای استاتیک در `web.config`. |
| **خطای Access Denied در آپلود لوگو یا فایل** | عدم کفایت مجوز دسترسی ویندوز برای کاربر وب‌سرور | اعطای دسترسی `Modify` و `Full Control` به گروه `IIS_IUSRS` و `IUSR` روی پوشه `wwwroot\uploads`. |
| **خطای پورت تکراری (Port Conflict)** | پورت 80 توسط `Default Web Site` یا سرویس دیگری در حال استفاده است | ۱. توقف سایت پیش‌فرض IIS: `Stop-WebSite -Name "Default Web Site"`.<br>۲. یا اختصاص پورت دیگری (مثلاً 8080) به سامانه نوافلو. |

---

## ۱۰. پشتیبان‌گیری دوره‌ای و بازیابی اطلاعات (Backup & Disaster Recovery)

جهت تضمین پایداری داده‌ها و رعایت الزامات تداوم کسب‌وکار (BCP):

### ۱. پشتیبان‌گیری خودکار از دیتابیس SQL Server
یک Job روزانه در SQL Server Agent ایجاد کنید:
```sql
BACKUP DATABASE [BPMS_DB] 
TO DISK = N'D:\Backups\NovaFlow_DB_Daily.bak' 
WITH FORMAT, MEDIANAME = 'NovaFlowBackups', NAME = 'Full Backup of NovaFlow Database';
GO
```

### ۲. پشتیبان‌گیری از فایل‌های پیوست و تنظیمات
مسیرهای زیر را در برنامه پشتیبان‌گیری فایل سرور (مانند Veeam Backup) قرار دهید:
* `C:\inetpub\wwwroot\NovaFlow\wwwroot\uploads\` (پیوست‌ها و لوگوها)
* `C:\inetpub\wwwroot\NovaFlow\appsettings.json` (پیکربندی سرور)

---

## ۱۱. راهنمای حذف کامل و ایمن سامانه با Uninstall-BPMS.ps1

در صورت نیاز به حذف سامانه یا انتقال به سرور دیگر، از اسکریپت حذف ایمن `Uninstall-BPMS.ps1` استفاده نمایید:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
.\Uninstall-BPMS.ps1
```

### مراحل اجرای اسکریپت حذف:
۱. بررسی سطح دسترسی Administrator و دریافت تاییدیه اولیه حذف.  
۲. **تاییدیه اجباری بکاپ کامل (`.bpmsbackup`):** پرسش صریح مبنی بر اینکه آیا پیش از حذف، فایل بکاپ کامل سامانه از تب **«پشتیبان‌گیری و بازیابی (Backup & Restore)»** پورتال دانلود شده است یا خیر (در صورت عدم تایید، عملیات حذف با پیام راهنما متوقف می‌شود).  
۳. توقف و حذف خودکار وب‌سایت `NovaFlow` و Application Pool مربوطه در IIS.  
۴. سوال از کاربر در خصوص **پشتیبان‌گیری خودکار از فایل‌های `uploads` و `appsettings.json` روی دسکتاپ** پیش از پاکسازی (لایه اطمینان اضافه).  
۵. حذف فایل‌های فیزیکی برنامه از مسیر `inetpub`.  
۶. پرسش مجدد با تاییدیه صریح جهت حذف اختیاری پایگاه‌داده `BPMS_DB` از SQL Server (برای جلوگیری از حذف ناخواسته داده‌های سازمانی).
