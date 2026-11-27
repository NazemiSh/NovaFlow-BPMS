import React, { useState, useEffect } from 'react';
import { Image as ImageIcon } from 'lucide-react';

export default function AuthImage({
  src,
  alt = '',
  className = '',
  style = {},
  fallback = null,
  onError = null,
  onLoad = null,
  ...props
}) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let createdUrl = null;

    if (!src) {
      setLoading(false);
      setHasError(true);
      return;
    }

    // اگر مسیر از قبل دیتا یا آبجکت بلاب یا مسیر استاتیک برندیگ باشد
    if (src.startsWith('data:') || src.startsWith('blob:')) {
      setBlobUrl(src);
      setLoading(false);
      return;
    }

    const token = localStorage.getItem('bpms_token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    fetch(src, { headers })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then(blob => {
        if (!cancelled) {
          createdUrl = URL.createObjectURL(blob);
          setBlobUrl(createdUrl);
          setLoading(false);
          setHasError(false);
          if (onLoad) onLoad();
        }
      })
      .catch(err => {
        if (!cancelled) {
          setLoading(false);
          setHasError(true);
          if (onError) onError(err);
        }
      });

    return () => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [src]);

  if (loading) {
    return (
      <div
        className={`animate-pulse bg-slate-200 dark:bg-slate-700/60 rounded flex items-center justify-center ${className}`}
        style={style}
      >
        <ImageIcon className="w-5 h-5 text-slate-400 opacity-50" />
      </div>
    );
  }

  if (hasError || !blobUrl) {
    if (fallback) return fallback;
    return (
      <div
        className={`bg-slate-100 dark:bg-slate-800 text-slate-400 rounded flex items-center justify-center ${className}`}
        style={style}
      >
        <ImageIcon className="w-5 h-5 opacity-40" />
      </div>
    );
  }

  return (
    <img
      src={blobUrl}
      alt={alt}
      className={className}
      style={style}
      {...props}
    />
  );
}
