'use client';

import { useRef, useState } from 'react';
import { getToken, uploadImage, updatePerson } from '@/lib/api';
import { t } from '@/lib/ui';

export default function ImageUploader({
  slug, initialImages = [], lang
}: {
  slug: string; initialImages?: string[]; lang: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<string[]>(initialImages);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg('');
    if (!getToken()) {
      setMsg(t(lang, 'upload.needLogin'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMsg(t(lang, 'upload.tooLarge'));
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { url } = await uploadImage(dataUrl);
      const next = [...images, url];
      await updatePerson(slug, { images: next });
      setImages(next);
      setMsg(t(lang, 'upload.success'));
    } catch (err: any) {
      setMsg(err.message || t(lang, 'upload.fail'));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="mt-4">
      <h3 className="font-semibold mb-2">{t(lang, 'upload.title')}</h3>
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-2">
          {images.map((u, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={u} alt="" className="w-full h-24 object-cover rounded border" />
          ))}
        </div>
      )}
      <label className="inline-block cursor-pointer text-sm px-3 py-1.5 rounded border text-slate-600 hover:bg-slate-50">
        {busy ? t(lang, 'upload.busy') : t(lang, 'upload.add')}
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onChange} />
      </label>
      {msg && <span className="ml-2 text-xs text-accent">{msg}</span>}
    </div>
  );
}
