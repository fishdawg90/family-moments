import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AttachmentSource } from './navigation';
import { Camera, Images, Mic, Paperclip, Square, Video, X } from 'lucide-react';
import type { Attachment } from './types';
import { getMedia, rememberMedia } from './storage';
import { prepareFile, MB } from './media';
import { download } from './firebase';
import { downloadFile } from './backup';
export function MediaPreview({
  uid,
  a,
  compact = false,
}: {
  uid: string;
  a: Attachment;
  compact?: boolean;
}) {
  const [url, setUrl] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true,
      object = '';
    void getMedia(uid, a.hash)
      .then((m) => {
        if (m && active) {
          object = URL.createObjectURL(new Blob([m.blob], { type: a.mime }));
          setUrl(object);
        }
      })
      .catch((e) => {
        if (active) setError(`Could not read this phone’s file: ${(e as Error).message}`);
      });
    return () => {
      active = false;
      if (object) URL.revokeObjectURL(object);
    };
  }, [uid, a.hash, a.mime]);
  const remoteUrl = useRef('');
  useEffect(
    () => () => {
      if (remoteUrl.current) URL.revokeObjectURL(remoteUrl.current);
    },
    [],
  );
  const load = async () => {
    setLoading(true);
    try {
      const blob = await download(uid, a);
      await rememberMedia(uid, blob);
      remoteUrl.current = URL.createObjectURL(new Blob([blob], { type: a.mime }));
      setUrl(remoteUrl.current);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  if (compact && a.kind === 'image')
    return (
      <div className="media-preview capture-image-preview">
        {url ? (
          <img src={url} alt={a.name} loading="lazy" />
        ) : (
          <button
            type="button"
            className="thumbnail-load"
            aria-label={`Load photo ${a.name}`}
            disabled={!a.remote || loading}
            onClick={() => void load()}
          >
            <Images size={23} />
            <span>{loading ? 'Loading…' : a.remote ? 'Load photo' : 'Saved locally'}</span>
          </button>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  return (
    <div className="media-preview">
      {url && a.kind === 'image' && <img src={url} alt={a.name} loading="lazy" />}
      {url && a.kind === 'video' && <video controls preload="metadata" playsInline src={url} />}
      {url && a.kind === 'audio' && (
        <audio aria-label={`Voice clip: ${a.name}`} controls preload="metadata" src={url} />
      )}
      <div className="file-caption">
        <span>
          {a.kind === 'document' ? '▤ ' : ''}
          {a.name}
        </span>
        <small>
          {(a.size / MB).toFixed(a.size < MB ? 2 : 1)} MB ·{' '}
          {a.remote ? 'Cloud copy ready' : 'Saved on this phone'}
        </small>
      </div>
      {a.kind === 'document' && url && (
        <a className="button" href={url} download={a.name}>
          Open / download {a.name.split('.').pop()?.toUpperCase()}
        </a>
      )}
      {!url && (
        <button type="button" onClick={() => void load()} disabled={!a.remote || loading}>
          {loading
            ? 'Loading…'
            : a.remote
              ? 'Load private attachment'
              : 'Pending on the capturing phone'}
        </button>
      )}
      {url && a.kind !== 'document' && (
        <button
          className="text-button"
          onClick={async () => {
            const blob = await fetch(url).then((r) => r.blob());
            downloadFile(blob, a.name);
          }}
        >
          Download
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function AttachmentPicker({
  controlsHost,
  source,
  onSourceChange: setSource,
  uid,
  attachments,
  onChange,
  onBusy,
  onVoicePreview,
  onError,
}: {
  controlsHost: HTMLElement | null;
  source: AttachmentSource;
  onSourceChange: (source: AttachmentSource) => void;
  uid: string;
  attachments: Attachment[];
  onChange: (list: Attachment[]) => void;
  onBusy: (busy: boolean) => void;
  onVoicePreview: (pending: boolean) => void;
  onError: (s: string) => void;
}) {
  const image = useRef<HTMLInputElement>(null),
    video = useRef<HTMLInputElement>(null),
    gallery = useRef<HTMLInputElement>(null),
    files = useRef<HTMLInputElement>(null);
  const latest = useRef(attachments);
  latest.current = attachments;
  const changeSource = useRef(setSource);
  changeSource.current = setSource;
  const [working, setWorking] = useState(false),
    [requesting, setRequesting] = useState(false),
    [recording, setRecording] = useState(false),
    [seconds, setSeconds] = useState(0),
    [audio, setAudio] = useState<{ blob: Blob; url: string } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    mounted = useRef(true),
    starting = useRef(false),
    audioUrl = useRef('');
  useEffect(() => {
    onVoicePreview(!!audio);
    return () => onVoicePreview(false);
  }, [audio, onVoicePreview]);
  useEffect(() => {
    if (recording && source !== 'audio' && recorder.current?.state === 'recording')
      recorder.current.stop();
  }, [source, recording]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
      onBusy(false);
    };
  }, []);
  useEffect(() => {
    if (!recording) return;
    const start = Date.now(),
      timer = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 250);
    return () => clearInterval(timer);
  }, [recording]);
  const busy = (v: boolean) => {
    setWorking(v);
    onBusy(v);
  };
  const add = async (list: File[]) => {
    const prepared: Attachment[] = [];
    busy(true);
    try {
      for (const file of list) {
        if (latest.current.length + prepared.length >= 6)
          throw new Error('Attach up to 6 files per moment.');
        prepared.push(await prepareFile(uid, file));
      }
      return true;
    } catch (e) {
      onError((e as Error).message);
      return false;
    } finally {
      if (mounted.current) {
        if (prepared.length) onChange([...latest.current, ...prepared]);
        busy(false);
      }
    }
  };
  const input = (
    ref: React.RefObject<HTMLInputElement | null>,
    accept: string,
    label: string,
    capture?: 'environment',
  ) => (
    <input
      ref={ref}
      hidden
      type="file"
      accept={accept}
      aria-label={label}
      multiple={!capture}
      capture={capture}
      onChange={(e) => {
        const list = Array.from(e.target.files || []);
        e.target.value = '';
        if (list.length) {
          setSource(null);
          void add(list);
        }
      }}
    />
  );
  const record = async () => {
    if (starting.current) return;
    starting.current = true;
    setRequesting(true);
    onBusy(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error(
          'Recording is unavailable here. You can attach an existing audio file using Files.',
        );
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((m) =>
        MediaRecorder.isTypeSupported(m),
      );
      const r = new MediaRecorder(media, mime ? { mimeType: mime } : undefined),
        chunks: Blob[] = [];
      let size = 0;
      recorder.current = r;
      r.ondataavailable = (e) => {
        if (e.data.size) {
          chunks.push(e.data);
          size += e.data.size;
          if (size > 24 * MB && r.state === 'recording') r.stop();
        }
      };
      r.onstop = () => {
        media.getTracks().forEach((t) => t.stop());
        if (!mounted.current) return;
        setRecording(false);
        changeSource.current(null);
        onBusy(false);
        const blob = new Blob(chunks, { type: r.mimeType });
        const url = URL.createObjectURL(blob);
        audioUrl.current = url;
        setAudio({ blob, url });
      };
      r.onerror = () => {
        media.getTracks().forEach((t) => t.stop());
        setRecording(false);
        changeSource.current(null);
        onBusy(false);
        onError('Recording was interrupted. Please try again or choose an existing audio file.');
      };
      r.start(1000);
      changeSource.current('audio');
      setSeconds(0);
      setRecording(true);
      onBusy(true);
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      if (mounted.current) {
        onBusy(false);
        onError((e as Error).message);
      }
    } finally {
      starting.current = false;
      if (mounted.current) setRequesting(false);
    }
  };
  const controls = (
    <div className="attachment-tools">
      <button
        type="button"
        disabled={working || recording || requesting}
        onClick={() => image.current?.click()}
      >
        <Camera />
        <span>Photo</span>
      </button>
      <button
        type="button"
        disabled={working || recording || requesting}
        onClick={() => video.current?.click()}
      >
        <Video />
        <span>Video</span>
      </button>
      <button
        type="button"
        disabled={working || recording || requesting}
        onClick={() => gallery.current?.click()}
      >
        <Images />
        <span>Gallery</span>
      </button>
      <button
        type="button"
        disabled={working || !!audio || requesting}
        onClick={() => {
          if (recording) recorder.current?.stop();
          else void record();
        }}
      >
        {recording ? <Square /> : <Mic />}
        <span>
          {recording
            ? `Stop ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
            : requesting
              ? 'Microphone…'
              : 'Voice clip'}
        </span>
      </button>
      <button
        type="button"
        disabled={working || recording || requesting}
        onClick={() => {
          setSource(null);
          files.current?.click();
        }}
      >
        <Paperclip />
        <span>Files</span>
      </button>
    </div>
  );
  return (
    <section
      className={`attachment-picker ${source || working || recording || audio || attachments.length ? 'attachment-content' : ''}`}
      aria-label="Attachments"
    >
      {controlsHost && createPortal(controls, controlsHost)}
      {input(image, 'image/*', 'Take a new photo', 'environment')}
      {input(video, 'video/*', 'Record a new video', 'environment')}
      {input(gallery, 'image/*,video/*', 'Choose photos and videos from gallery')}
      {input(
        files,
        'image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,audio/*,.pdf,.docx,.txt',
        'Choose files',
      )}
      {working && (
        <p className="muted" role="status">
          Saving attachment on this phone…
        </p>
      )}
      {recording && (
        <p className="recording" role="status">
          ● Recording · {seconds}s · tap Stop to preview
        </p>
      )}
      {audio && (
        <div className="audio-review">
          <audio aria-label="Recorded voice clip preview" src={audio.url} controls />
          <button
            type="button"
            disabled={working}
            onClick={async () => {
              const attached = await add([
                new File(
                  [audio.blob],
                  `Recording-${new Date().toISOString().slice(0, 10)}.${audio.blob.type.includes('mp4') ? 'm4a' : audio.blob.type.includes('ogg') ? 'ogg' : 'webm'}`,
                  { type: audio.blob.type },
                ),
              ]);
              if (!attached) return;
              URL.revokeObjectURL(audio.url);
              audioUrl.current = '';
              setAudio(null);
            }}
          >
            Attach recording
          </button>
          <button
            type="button"
            onClick={() => {
              URL.revokeObjectURL(audio.url);
              audioUrl.current = '';
              setAudio(null);
            }}
          >
            Discard
          </button>
        </div>
      )}
      {!!attachments.length && (
        <div className="attachments">
          {attachments.map((a) => (
            <div
              className={`attachment-card ${a.kind === 'image' ? 'photo-tile' : 'file-tile'}`}
              key={a.id}
            >
              <MediaPreview uid={uid} a={a} compact />
              <button
                type="button"
                className="remove"
                aria-label={`Remove ${a.name}`}
                onClick={() => onChange(latest.current.filter((b) => b.id !== a.id))}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
