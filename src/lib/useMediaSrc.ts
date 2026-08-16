import { useEffect, useState } from 'react';
import { downloadMedia } from './api';
import { supabase } from './supabase';

// URL untuk menampilkan media. Media besar di host Railway butuh token sesi
// (header), jadi tidak bisa langsung dipakai di <img>/<video> — diunduh lalu
// jadi object URL. Media di bucket Supabase (public, path UUID) langsung.
export function useMediaSrc(bucket: string, path: string | null | undefined) {
  const [src, setSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    let live = true;
    let url: string | null = null;
    if (!path) {
      setSrc(undefined);
      return;
    }
    if (path.startsWith('big/')) {
      downloadMedia(bucket, path)
        .then((blob) => {
          if (!live) return;
          url = URL.createObjectURL(blob);
          setSrc(url);
        })
        .catch(() => {
          if (live) setSrc(undefined);
        });
    } else {
      setSrc(supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl);
    }
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [bucket, path]);

  return src;
}
