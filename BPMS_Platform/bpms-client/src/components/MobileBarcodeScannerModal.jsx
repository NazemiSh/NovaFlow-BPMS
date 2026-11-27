import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Camera,
  QrCode,
  ScanLine,
  Copy,
  Check,
  Search,
  FolderOpen,
  CornerDownLeft,
  AlertTriangle,
  RefreshCw,
  ShieldAlert,
  ExternalLink
} from 'lucide-react';
import {
  decodeBarcodeFromCanvas,
  decodeBarcodeFromImageFile,
  parseScannedBarcodePayload
} from '../utils/offlineBarcodeDecoder';

async function copyTextWithFallback(text) {
  if (!text) return false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback below
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function MobileBarcodeScannerModal({
  isOpen,
  onClose,
  hasActiveForm = false,
  onInsertToActiveForm,
  onSearchInCartable,
  onOpenSubmission,
  onOpenAttachments
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanTimerRef = useRef(null);
  const autoActionTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const scanningBusyRef = useRef(false);
  const hasActiveFormRef = useRef(hasActiveForm);
  hasActiveFormRef.current = hasActiveForm;

  const [cameraState, setCameraState] = useState('idle'); // 'idle' | 'starting' | 'active' | 'blocked_http' | 'error'
  const [cameraMessage, setCameraMessage] = useState('');
  const [decodingFile, setDecodingFile] = useState(false);
  const [fileError, setFileError] = useState('');
  const [scannedResult, setScannedResult] = useState(null); // { rawValue, format, engine, parsed, copied, mode }
  const [manualCopied, setManualCopied] = useState(false);

  const clearAutoActionTimer = useCallback(() => {
    if (autoActionTimerRef.current) {
      clearTimeout(autoActionTimerRef.current);
      autoActionTimerRef.current = null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
      } catch {
        // ignore
      }
    }
    scanningBusyRef.current = false;
  }, []);

  const triggerOpenAttachments = useCallback(
    (parsed) => {
      clearAutoActionTimer();
      if (onOpenAttachments) {
        onOpenAttachments(parsed);
      } else if (onOpenSubmission) {
        onOpenSubmission(parsed);
      }
    },
    [clearAutoActionTimer, onOpenAttachments, onOpenSubmission]
  );

  const triggerOpenSubmission = useCallback(
    (parsed) => {
      clearAutoActionTimer();
      if (onOpenSubmission) {
        onOpenSubmission(parsed);
      }
    },
    [clearAutoActionTimer, onOpenSubmission]
  );

  const handleDetectedResult = useCallback(
    async (res) => {
      if (!res?.rawValue) return;
      stopCamera();
      clearAutoActionTimer();

      const parsed = parseScannedBarcodePayload(res.rawValue);
      const copied = await copyTextWithFallback(parsed.rawValue);
      const isFormActive = Boolean(hasActiveFormRef.current);
      setFileError('');

      // ۱. لینک پیوست‌های پرونده (/attachments/TRK-... یا پارامتر attachments)
      if (parsed.isAttachmentLink) {
        setScannedResult({
          rawValue: parsed.rawValue,
          format: res.format || 'unknown',
          engine: res.engine || 'offline',
          parsed,
          copied,
          mode: 'attachment'
        });
        autoActionTimerRef.current = setTimeout(() => {
          triggerOpenAttachments(parsed);
        }, 500);
        return;
      }

      // ۲. QR استعلام پرونده (/verify/TRK-... یا کد رهگیری TRK-...)
      if (parsed.trackingCode || parsed.isVerifyLink || parsed.isNovaFlowSubmission) {
        if (!isFormActive) {
          setScannedResult({
            rawValue: parsed.rawValue,
            format: res.format || 'unknown',
            engine: res.engine || 'offline',
            parsed,
            copied,
            mode: 'submission_auto'
          });
          autoActionTimerRef.current = setTimeout(() => {
            triggerOpenSubmission(parsed);
          }, 500);
        } else {
          setScannedResult({
            rawValue: parsed.rawValue,
            format: res.format || 'unknown',
            engine: res.engine || 'offline',
            parsed,
            copied,
            mode: 'submission_form'
          });
        }
        return;
      }

      // ۳. بارکد کالا، رول و سریال (کدهای بدون لینک و بدون TRK-)
      if (isFormActive && onInsertToActiveForm) {
        onInsertToActiveForm(parsed.rawValue);
        return;
      }

      setScannedResult({
        rawValue: parsed.rawValue,
        format: res.format || 'unknown',
        engine: res.engine || 'offline',
        parsed,
        copied,
        mode: 'barcode_cartable'
      });
    },
    [stopCamera, clearAutoActionTimer, triggerOpenAttachments, triggerOpenSubmission, onInsertToActiveForm]
  );

  const startCamera = useCallback(async () => {
    stopCamera();
    setFileError('');

    const isLocalhost =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const isSecure = typeof window !== 'undefined' && (window.isSecureContext || isLocalhost);

    if (!isSecure || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraState('blocked_http');
      setCameraMessage(
        'به دلیل اتصال در بستر HTTP (پیش از فعال‌سازی گواهی SSL / HTTPS)، مرورگر دسترسی مستقیم به پخش زنده دوربین را مسدود کرده است. می‌توانید بلافاصله از دکمه «عکسبرداری از بارکد با دوربین گوشی» در زیر استفاده کنید.'
      );
      return;
    }

    setCameraState('starting');
    setCameraMessage('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraState('active');

      scanTimerRef.current = setInterval(async () => {
        if (scanningBusyRef.current) return;
        const video = videoRef.current;
        if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;

        scanningBusyRef.current = true;
        try {
          let canvas = canvasRef.current;
          if (!canvas) {
            canvas = document.createElement('canvas');
            canvasRef.current = canvas;
          }

          const maxEdge = 960;
          const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
          canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const detected = await decodeBarcodeFromCanvas(canvas);
            if (detected?.rawValue) {
              await handleDetectedResult(detected);
            }
          }
        } catch {
          // ignore single frame error
        } finally {
          scanningBusyRef.current = false;
        }
      }, 280);
    } catch (err) {
      const errName = err?.name || '';
      if (errName === 'SecurityError' || !window.isSecureContext) {
        setCameraState('blocked_http');
        setCameraMessage(
          'مرورگر دسترسی زنده به دوربین را به دلیل اتصال غیرایمن HTTP محدود کرده است. از دکمه «عکسبرداری از بارکد با دوربین گوشی» برای اسکن از طریق عکس استفاده نمایید.'
        );
      } else if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setCameraState('error');
        setCameraMessage(
          'مجوز دسترسی به دوربین داده نشد. لطفاً دسترسی دوربین را در تنظیمات مرورگر فعال کنید یا از دکمه «عکسبرداری از بارکد با دوربین گوشی» استفاده نمایید.'
        );
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setCameraState('error');
        setCameraMessage(
          'دوربین فعالی برای پخش زنده یافت نشد. می‌توانید از طریق دکمه «عکسبرداری از بارکد با دوربین گوشی» تصویر بارکد را انتخاب یا ثبت کنید.'
        );
      } else {
        setCameraState('error');
        setCameraMessage(
          'امکان راه‌اندازی پخش زنده دوربین وجود ندارد. از دکمه «عکسبرداری از بارکد با دوربین گوشی» برای خواندن تصویر بارکد استفاده کنید.'
        );
      }
    }
  }, [handleDetectedResult, stopCamera]);

  useEffect(() => {
    if (!isOpen) {
      clearAutoActionTimer();
      stopCamera();
      setScannedResult(null);
      setFileError('');
      setManualCopied(false);
      setCameraState('idle');
      return;
    }

    clearAutoActionTimer();
    setScannedResult(null);
    setFileError('');
    setManualCopied(false);
    startCamera();

    return () => {
      clearAutoActionTimer();
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera, clearAutoActionTimer]);

  const handleCloseModal = useCallback(() => {
    clearAutoActionTimer();
    stopCamera();
    if (onClose) onClose();
  }, [clearAutoActionTimer, stopCamera, onClose]);

  const handleCaptureImageChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setDecodingFile(true);
    setFileError('');
    try {
      const detected = await decodeBarcodeFromImageFile(file);
      if (detected?.rawValue) {
        await handleDetectedResult(detected);
      } else {
        setFileError('بارکد یا QR Code معتبری در تصویر انتخاب‌شده تشخیص داده نشد. لطفاً با نور مناسب و فوکوس واضح‌تر مجدداً عکس بگیرید.');
      }
    } catch (err) {
      setFileError(err?.message || 'خطا در پردازش تصویر بارکد.');
    } finally {
      setDecodingFile(false);
    }
  };

  if (!isOpen) return null;

  const triggerPhotoCapture = () => {
    fileInputRef.current?.click();
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in"
      onClick={handleCloseModal}
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-barcode-scanner-title"
    >
      <div
        className="w-full sm:max-w-md bg-white dark:bg-[#1e2030] rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-700/80 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-[#252736] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-sm shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 id="mobile-barcode-scanner-title" className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">
                اسکنر بارکد و QR موبایل
              </h3>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">
                اسکن کد رهگیری پرونده، لینک پیوست یا بارکد اقلام
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCloseModal}
            aria-label="بستن اسکنر"
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-3.5 sm:p-5 space-y-4 overflow-y-auto">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleCaptureImageChange}
          />

          {!scannedResult ? (
            <>
              {/* Live camera preview */}
              {(cameraState === 'starting' || cameraState === 'active') && (
                <div className="relative rounded-2xl overflow-hidden bg-slate-950 aspect-[4/3] border border-slate-300 dark:border-slate-700 shadow-inner">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    className="w-full h-full object-cover"
                  />
                  {/* Scanning viewfinder overlay */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-52 h-52 sm:w-56 sm:h-56 rounded-2xl border-2 border-sky-400/90 shadow-[0_0_0_9999px_rgba(15,23,42,0.42)] relative">
                      <span className="absolute -top-0.5 -right-0.5 w-5 h-5 border-t-4 border-r-4 border-sky-400 rounded-tr-lg" />
                      <span className="absolute -top-0.5 -left-0.5 w-5 h-5 border-t-4 border-l-4 border-sky-400 rounded-tl-lg" />
                      <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 border-b-4 border-r-4 border-sky-400 rounded-br-lg" />
                      <span className="absolute -bottom-0.5 -left-0.5 w-5 h-5 border-b-4 border-l-4 border-sky-400 rounded-bl-lg" />
                      <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 h-0.5 bg-sky-400/80 shadow-[0_0_8px_rgba(56,189,248,0.9)] animate-pulse" />
                    </div>
                  </div>
                  <div className="absolute bottom-2.5 inset-x-0 text-center pointer-events-none">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/80 text-white text-[11px] font-medium">
                      <ScanLine className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
                      <span>{cameraState === 'starting' ? 'در حال فعال‌سازی دوربین...' : 'بارکد یا QR را داخل کادر قرار دهید'}</span>
                    </span>
                  </div>
                </div>
              )}

              {/* HTTP / Blocked Camera Persian guidance */}
              {(cameraState === 'blocked_http' || cameraState === 'error') && (
                <div className={`rounded-2xl p-4 border space-y-3 ${
                  cameraState === 'blocked_http'
                    ? 'bg-amber-50 dark:bg-amber-950/35 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200'
                    : 'bg-rose-50 dark:bg-rose-950/35 border-rose-200 dark:border-rose-800/60 text-rose-900 dark:text-rose-200'
                }`}>
                  <div className="flex items-start gap-2.5 text-xs leading-relaxed">
                    {cameraState === 'blocked_http' ? (
                      <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <span className="font-bold block">
                        {cameraState === 'blocked_http'
                          ? 'پخش زنده دوربین در حالت HTTP غیرفعال است'
                          : 'عدم دسترسی به پخش زنده دوربین'}
                      </span>
                      <p className="opacity-90">{cameraMessage}</p>
                    </div>
                  </div>
                </div>
              )}

              {fileError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{fileError}</span>
                </div>
              )}

              {/* Photo capture fallback button (prominent in HTTP/error mode, available in live mode too) */}
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={decodingFile}
                  onClick={triggerPhotoCapture}
                  className={`w-full py-3 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-sm ${
                    cameraState === 'blocked_http' || cameraState === 'error'
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-slate-100 hover:bg-slate-200 dark:bg-[#252736] dark:hover:bg-[#333645] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {decodingFile ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>در حال رمزگشایی بارکد از تصویر...</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-4 h-4" />
                      <span>عکسبرداری از بارکد با دوربین گوشی</span>
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            /* Scanned Result Card & Smart Actions */
            <div className="space-y-4 animate-in fade-in">
              <div className="p-3.5 sm:p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-800/60 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>کد با موفقیت شناسایی شد</span>
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white dark:bg-[#1e2030] text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 whitespace-nowrap">
                    {scannedResult.copied || manualCopied ? 'کپی خودکار در حافظه ✓' : scannedResult.format}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-[#181926] border border-emerald-200/80 dark:border-slate-700 flex items-center justify-between gap-2">
                  <span dir="ltr" className="text-xs font-mono font-bold text-slate-800 dark:text-slate-100 break-all text-left flex-1">
                    {scannedResult.rawValue}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await copyTextWithFallback(scannedResult.rawValue);
                      if (ok) {
                        setManualCopied(true);
                        setTimeout(() => setManualCopied(false), 2000);
                      }
                    }}
                    title="کپی مجدد"
                    className="p-1.5 rounded-lg bg-slate-100 dark:bg-[#252736] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 shrink-0 cursor-pointer"
                  >
                    {manualCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                {scannedResult.parsed?.trackingCode && (
                  <div className="text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 flex-wrap">
                    <span>کد رهگیری تشخیص‌داده‌شده:</span>
                    <b dir="ltr" className="font-mono">{scannedResult.parsed.trackingCode}</b>
                  </div>
                )}
              </div>

              {/* ۱. حالت لینک پیوست‌های پرونده: پیام کوتاه + باز کردن خودکار + دکمه کوچک اطمینان */}
              {scannedResult.mode === 'attachment' && (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/35 border border-blue-200 dark:border-blue-800/60 text-blue-900 dark:text-blue-200 text-xs flex items-center gap-2.5">
                    <RefreshCw className="w-4 h-4 text-blue-600 dark:text-sky-400 animate-spin shrink-0" />
                    <span className="font-semibold">
                      {scannedResult.parsed?.trackingCode
                        ? `در حال باز کردن صفحه پیوست‌های پرونده ${scannedResult.parsed.trackingCode}...`
                        : 'در حال باز کردن صفحه پیوست‌های پرونده...'}
                    </span>
                  </div>
                  <div className="flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => triggerOpenAttachments(scannedResult.parsed)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#252736] dark:hover:bg-[#333645] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold transition cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-blue-600 dark:text-sky-400" />
                      <span>باز کردن مجدد پیوست‌ها</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ۲الف. حالت استعلام پرونده خارج از فرم: پیام کوتاه و باز شدن خودکار در کارتابل */}
              {scannedResult.mode === 'submission_auto' && (
                <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/35 border border-blue-200 dark:border-blue-800/60 text-blue-900 dark:text-blue-200 text-xs flex items-center gap-2.5">
                  <RefreshCw className="w-4 h-4 text-blue-600 dark:text-sky-400 animate-spin shrink-0" />
                  <span className="font-semibold">
                    {scannedResult.parsed?.trackingCode
                      ? `در حال باز کردن پرونده ${scannedResult.parsed.trackingCode}...`
                      : 'در حال باز کردن پرونده در کارتابل...'}
                  </span>
                </div>
              )}

              {/* ۲ب. حالت استعلام پرونده هنگام باز بودن فرم: فقط دو دکمه «درج در فیلد فعال فرم» و «مشاهده و باز کردن پرونده» */}
              {scannedResult.mode === 'submission_form' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (onInsertToActiveForm) onInsertToActiveForm(scannedResult.rawValue);
                    }}
                    className="py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
                  >
                    <CornerDownLeft className="w-4 h-4 shrink-0" />
                    <span>درج در فیلد فعال فرم</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerOpenSubmission(scannedResult.parsed)}
                    className="py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
                  >
                    <FolderOpen className="w-4 h-4 shrink-0" />
                    <span>مشاهده و باز کردن پرونده</span>
                  </button>
                </div>
              )}

              {/* ۳. حالت بارکد کالا/رول/سریال خارج از فرم: کپی در حافظه + دکمه «جستجو در کارتابل» */}
              {scannedResult.mode === 'barcode_cartable' && (
                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (onSearchInCartable) onSearchInCartable(scannedResult.rawValue);
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
                  >
                    <Search className="w-4 h-4 shrink-0" />
                    <span>جستجو در کارتابل</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      clearAutoActionTimer();
                      setScannedResult(null);
                      setManualCopied(false);
                      startCamera();
                    }}
                    className="w-full py-2 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#252736] hover:bg-slate-100 dark:hover:bg-[#333645] text-slate-600 dark:text-slate-300 font-medium text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>اسکن مجدد بارکد</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
