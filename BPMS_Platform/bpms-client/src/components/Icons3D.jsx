import React from 'react';
import {
  Inbox,
  Send,
  Share2,
  FileSpreadsheet,
  BarChart3,
  FilePlus2,
  ArrowLeftRight,
  Users,
  ShieldCheck,
  Sparkles,
  Settings,
  DatabaseBackup,
  Database,
  LogOut
} from 'lucide-react';

/**
 * کامپوننت پایه کاشی سه‌بعدی براق و برجسته (3D Glossy Beveled Tile)
 * دارای گرادیان عمیق، لبه پایینی تیره سه‌بعدی (Bevel)، هایلایت نوری شیشه‌ای و سایه نرم
 */
export function Icon3DTile({
  gradient = 'from-sky-400 to-blue-600',
  borderColor = 'border-blue-800/60',
  shadowColor = 'shadow-blue-500/30',
  icon: IconComponent,
  iconSize = 16,
  className = 'w-7 h-7',
  ringClass = '',
  active = false,
  title,
}) {
  let resolvedIconSize = iconSize;
  if (!resolvedIconSize) {
    if (className.includes('w-4') || className.includes('h-4')) resolvedIconSize = 12;
    else if (className.includes('w-5') || className.includes('h-5')) resolvedIconSize = 14;
    else if (className.includes('w-6') || className.includes('h-6')) resolvedIconSize = 15;
    else resolvedIconSize = 16;
  }

  return (
    <div
      title={title}
      className={`relative shrink-0 rounded-xl bg-gradient-to-b ${gradient} border-b-2 ${borderColor} shadow-md ${shadowColor} shadow-[inset_0_1px_1px_rgba(255,255,255,0.45)] flex items-center justify-center overflow-hidden transition-all select-none ${
        active ? 'ring-1 ring-white/40' : ''
      } ${ringClass} ${className}`}
    >
      {/* لایه بازتاب نور شیشه‌ای / براق در نیمه بالایی کاشی */}
      <div className="absolute inset-x-0 top-0 h-[45%] bg-gradient-to-b from-white/35 to-transparent rounded-t-xl pointer-events-none" />

      {/* آیکن مرکزی Lucide با سایز ۱۶، رنگ سفید درخشان و ضخامت ۲.۲ */}
      {IconComponent && (
        <IconComponent
          size={resolvedIconSize}
          strokeWidth={2.2}
          className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)] relative z-10"
        />
      )}
    </div>
  );
}

// ۱. کارتابل ورودی (آبی آسمانی به لاجوردی)
export function Icon3DInbox({ className = 'w-7 h-7', ringClass = '', active = false }) {
  return (
    <Icon3DTile
      gradient="from-sky-400 to-blue-600"
      borderColor="border-blue-800/60"
      shadowColor="shadow-blue-500/30"
      icon={Inbox}
      iconSize={16}
      className={className}
      ringClass={ringClass}
      active={active}
      title="کارتابل ورودی"
    />
  );
}

// ۲. پیگیری درخواست‌ها (فیروزه‌ای به آبی)
export function Icon3DOutbox({ className = 'w-7 h-7', ringClass = '', active = false }) {
  return (
    <Icon3DTile
      gradient="from-cyan-400 to-teal-600"
      borderColor="border-teal-800/60"
      shadowColor="shadow-teal-500/30"
      icon={Send}
      iconSize={16}
      className={className}
      ringClass={ringClass}
      active={active}
      title="پیگیری درخواست‌ها"
    />
  );
}

// ۳. رونوشت‌های من (سبز زمردی)
export function Icon3DCc({ className = 'w-7 h-7', ringClass = '', active = false }) {
  return (
    <Icon3DTile
      gradient="from-emerald-400 to-green-600"
      borderColor="border-green-800/60"
      shadowColor="shadow-emerald-500/30"
      icon={Share2}
      iconSize={16}
      className={className}
      ringClass={ringClass}
      active={active}
      title="رونوشت‌های من (CC)"
    />
  );
}

// ۴. کاتالوگ فرم‌ها (کهربایی به نارنجی)
export function Icon3DForms({ className = 'w-7 h-7', ringClass = '', active = false }) {
  return (
    <Icon3DTile
      gradient="from-amber-400 to-orange-600"
      borderColor="border-orange-800/60"
      shadowColor="shadow-orange-500/30"
      icon={FileSpreadsheet}
      iconSize={16}
      className={className}
      ringClass={ringClass}
      active={active}
      title="کاتالوگ فرم‌ها"
    />
  );
}

// ۵. گزارش‌ها و تحلیل‌ها (سرخابی به قرمز رز)
export function Icon3DReports({ className = 'w-7 h-7', ringClass = '', active = false }) {
  return (
    <Icon3DTile
      gradient="from-pink-500 to-rose-600"
      borderColor="border-rose-800/60"
      shadowColor="shadow-rose-500/30"
      icon={BarChart3}
      iconSize={16}
      className={className}
      ringClass={ringClass}
      active={active}
      title="گزارش‌ها و تحلیل‌ها"
    />
  );
}

// ۶. طراحی فرم جدید (بنفش به نیلی)
export function Icon3DBuilder({ className = 'w-7 h-7', ringClass = '', active = false }) {
  return (
    <Icon3DTile
      gradient="from-violet-500 to-indigo-600"
      borderColor="border-indigo-800/60"
      shadowColor="shadow-indigo-500/30"
      icon={FilePlus2}
      iconSize={16}
      className={className}
      ringClass={ringClass}
      active={active}
      title="طراحی فرم جدید"
    />
  );
}

// ۷. نظارت بر کارتابل‌ها (سبز دریایی به فیروزه‌ای)
export function Icon3DOversight({ className = 'w-7 h-7', ringClass = '', active = false }) {
  return (
    <Icon3DTile
      gradient="from-teal-400 to-cyan-600"
      borderColor="border-cyan-800/60"
      shadowColor="shadow-cyan-500/30"
      icon={ArrowLeftRight}
      iconSize={16}
      className={className}
      ringClass={ringClass}
      active={active}
      title="نظارت بر کارتابل‌ها"
    />
  );
}

// ۸. مدیریت کاربران و نقش‌ها (آبی کبالت به نیلی)
export function Icon3DUsers({ className = 'w-7 h-7', ringClass = '', active = false }) {
  return (
    <Icon3DTile
      gradient="from-blue-500 to-indigo-700"
      borderColor="border-indigo-950/60"
      shadowColor="shadow-blue-600/30"
      icon={Users}
      iconSize={16}
      className={className}
      ringClass={ringClass}
      active={active}
      title="مدیریت کاربران و نقش‌ها"
    />
  );
}

// ۹. گروه‌های سازمانی (طلایی به کهربایی)
export function Icon3DGroups({ className = 'w-7 h-7', ringClass = '', active = false }) {
  return (
    <Icon3DTile
      gradient="from-yellow-400 to-amber-600"
      borderColor="border-amber-800/60"
      shadowColor="shadow-amber-500/30"
      icon={ShieldCheck}
      iconSize={16}
      className={className}
      ringClass={ringClass}
      active={active}
      title="گروه‌های سازمانی"
    />
  );
}

// ۱۰. تنظیمات و استودیوی هوش مصنوعی (بنفش نئونی به سرخابی)
export function Icon3DAi({ className = 'w-7 h-7', ringClass = '', active = false }) {
  return (
    <Icon3DTile
      gradient="from-fuchsia-500 to-purple-700"
      borderColor="border-purple-900/60"
      shadowColor="shadow-fuchsia-500/30"
      icon={Sparkles}
      iconSize={16}
      className={className}
      ringClass={ringClass}
      active={active}
      title="تنظیمات و استودیوی هوش مصنوعی"
    />
  );
}

// ۱۱. تنظیمات سامانه (خاکستری سربی به نوک‌مدادی)
export function Icon3DSettings({ className = 'w-7 h-7', ringClass = '', active = false }) {
  return (
    <Icon3DTile
      gradient="from-slate-400 to-slate-600"
      borderColor="border-slate-800/60"
      shadowColor="shadow-slate-500/30"
      icon={Settings}
      iconSize={16}
      className={className}
      ringClass={ringClass}
      active={active}
      title="تنظیمات سامانه"
    />
  );
}

// ۱۲. پشتیبان‌گیری و بازیابی (سبز زمردی به فیروزه‌ای عمیق)
export function Icon3DBackupRestore({ className = 'w-7 h-7', ringClass = '', active = false }) {
  return (
    <Icon3DTile
      gradient="from-emerald-400 to-teal-700"
      borderColor="border-teal-900/60"
      shadowColor="shadow-emerald-500/30"
      icon={DatabaseBackup}
      iconSize={16}
      className={className}
      ringClass={ringClass}
      active={active}
      title="پشتیبان‌گیری و بازیابی"
    />
  );
}

// ۱۳. بانک داده‌های مرجع (بنفش نئونی به نیلی کریستالی)
export function Icon3DMasterData({ className = 'w-7 h-7', ringClass = '', active = false }) {
  return (
    <Icon3DTile
      gradient="from-indigo-400 to-purple-700"
      borderColor="border-purple-900/60"
      shadowColor="shadow-purple-500/30"
      icon={Database}
      iconSize={16}
      className={className}
      ringClass={ringClass}
      active={active}
      title="بانک داده‌های مرجع"
    />
  );
}

// ۱۳. دکمه خروج (سرخابی به قرمز)
export function Icon3DLogout({ className = 'w-7 h-7', ringClass = '', active = false }) {
  return (
    <Icon3DTile
      gradient="from-rose-500 to-red-600"
      borderColor="border-red-800/60"
      shadowColor="shadow-red-500/30"
      icon={LogOut}
      iconSize={16}
      className={className}
      ringClass={ringClass}
      active={active}
      title="خروج از سامانه"
    />
  );
}

// ۱۳. تصویر سه‌بعدی کشوی بازشده فایلینگ آبی متالیک (دقیقاً مطابق نمونه عکس ارسالی کاربر)
export function EmptyCartable3D({ message = 'موردی با مشخصات فیلترهای انتخابی در کارتابل یافت نشد.' }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center select-none animate-in fade-in duration-300">
      <div className="relative w-44 h-44 mb-3 flex items-center justify-center">
        <svg viewBox="0 0 200 170" className="w-full h-full drop-shadow-2xl" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            {/* هاله نور زیر کشو */}
            <radialGradient id="drawer_glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#00d2ff" stopOpacity="0.45" />
              <stop offset="60%" stopColor="#0072ff" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#0072ff" stopOpacity="0" />
            </radialGradient>
            {/* گرادیان وجه جلوی کشو */}
            <linearGradient id="dw_front" x1="40" y1="80" x2="105" y2="150" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#00d2ff" />
              <stop offset="35%" stopColor="#0080ff" />
              <stop offset="100%" stopColor="#003d99" />
            </linearGradient>
            {/* گرادیان وجه پهلوی راست کشو */}
            <linearGradient id="dw_side" x1="105" y1="110" x2="175" y2="140" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#005cd6" />
              <stop offset="100%" stopColor="#082b6e" />
            </linearGradient>
            {/* گرادیان درون تاریک و عمیق کشو */}
            <linearGradient id="dw_inner_floor" x1="55" y1="85" x2="160" y2="110" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#091530" />
              <stop offset="100%" stopColor="#040a18" />
            </linearGradient>
            {/* گرادیان دیواره داخلی چپ */}
            <linearGradient id="dw_inner_left" x1="50" y1="75" x2="105" y2="105" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#0a2a66" />
              <stop offset="100%" stopColor="#061638" />
            </linearGradient>
            {/* دستگیره کرومی سه‌بعدی */}
            <linearGradient id="dw_handle" x1="60" y1="105" x2="95" y2="125" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="50%" stopColor="#e2e8f0" />
              <stop offset="100%" stopColor="#94a3b8" />
            </linearGradient>
          </defs>

          {/* هاله نور درخشان آبی روی سطح زیرین */}
          <ellipse cx="108" cy="142" rx="72" ry="18" fill="url(#drawer_glow)" />

          {/* ۱. دیواره و کف درونی کشو (فضای باز و خالی داخل) */}
          {/* کف درونی کشو */}
          <polygon points="56,86 104,110 162,79 116,58" fill="url(#dw_inner_floor)" />
          {/* دیواره درونی چپ (پشت در اصلی) */}
          <polygon points="50,75 105,103 105,112 56,86" fill="url(#dw_inner_left)" />
          {/* دیواره درونی راست */}
          <polygon points="105,103 170,70 162,79 104,110" fill="#0e357d" />
          {/* دیواره درونی انتهایی */}
          <polygon points="116,58 170,70 170,68 116,56" fill="#081e47" />

          {/* ۲. بدنه بیرونی کشوی فلزی/شیشه‌ای فایلینگ */}
          {/* وجه پهلوی راست (سمت عمق) */}
          <polygon points="105,103 172,70 172,112 105,148" fill="url(#dw_side)" />
          {/* شیارهای روی دیواره بیرونی برای ایجاد حس فایلینگ صنعتی */}
          <line x1="118" y1="104" x2="118" y2="137" stroke="#0077ff" strokeWidth="1" opacity="0.6" />
          <line x1="135" y1="95" x2="135" y2="127" stroke="#0077ff" strokeWidth="1" opacity="0.6" />
          <line x1="152" y1="86" x2="152" y2="118" stroke="#0077ff" strokeWidth="1" opacity="0.6" />

          {/* وجه جلوی کشو (روبه‌روی کاربر) */}
          <polygon points="44,74 105,103 105,148 44,118" fill="url(#dw_front)" />
          {/* کادر فرورفته روی درب کشو */}
          <polygon points="49,80 100,104 100,141 49,116" stroke="#00d2ff" strokeWidth="1.5" fill="none" opacity="0.6" />

          {/* دستگیره کرومی سه‌بعدی روی درب جلو */}
          {/* سایه دستگیره */}
          <path d="M62 106L87 118L87 122L62 110Z" fill="#002b66" opacity="0.7" />
          {/* میله اصلی دستگیره */}
          <path
            d="M60 104C60 102.5 61.5 102 63 102.7L86 114C87.5 114.7 88 116 88 117.5C88 119 86.5 119.5 85 118.8L62 107.5C60.5 106.8 60 105.5 60 104Z"
            fill="url(#dw_handle)"
          />
          {/* انعکاس نور نقره‌ای روی دستگیره */}
          <line x1="64" y1="104" x2="84" y2="114" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />

          {/* ۳. خطوط نئونی و هایلایت‌های براق لبه‌های کشو */}
          {/* لبه فوقانی چپ */}
          <line x1="44" y1="74" x2="105" y2="103" stroke="#a5f3fc" strokeWidth="2.5" strokeLinecap="round" />
          {/* لبه فوقانی راست */}
          <line x1="105" y1="103" x2="172" y2="70" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
          {/* لبه عمودی جلویی (زاویه نزدیک به بیننده) */}
          <line x1="105" y1="103" x2="105" y2="148" stroke="#00f0ff" strokeWidth="2.5" />
          {/* لبه انتهایی بالا راست */}
          <line x1="116" y1="56" x2="172" y2="70" stroke="#00d2ff" strokeWidth="1.5" opacity="0.8" />
          <line x1="44" y1="74" x2="116" y2="56" stroke="#00d2ff" strokeWidth="1.5" opacity="0.8" />
          {/* لبه پایینی چپ */}
          <line x1="44" y1="118" x2="105" y2="148" stroke="#0052cc" strokeWidth="2" />
          {/* لبه پایینی راست */}
          <line x1="105" y1="148" x2="172" y2="112" stroke="#0044aa" strokeWidth="2" />

          {/* جرقه‌های شیک نوری در گوشه‌های کشو */}
          <circle cx="105" cy="103" r="2.5" fill="#ffffff" />
          <circle cx="44" cy="74" r="2" fill="#38bdf8" />
          <circle cx="172" cy="70" r="2" fill="#38bdf8" />
        </svg>
      </div>

      <p className="text-sm font-semibold text-slate-300 dark:text-[#b0b8c8] max-w-md leading-relaxed">
        {message}
      </p>
    </div>
  );
}
