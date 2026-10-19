import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Cloud,
  Compass,
  Flower2,
  Heart,
  Leaf,
  Mic,
  Settings,
  Sun,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import {
  auth,
  authPersistence,
  download,
  fetchChanges,
  fetchPage,
  fetchTags,
  membership,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  transport,
} from './firebase';
import { BASE, profileFromPath, profiles, TEST_MODE } from './config';
import { createSyncRunner } from './sync-runner';
import { useAppNavigation } from './navigation';
import {
  formatDate,
  formatTime,
  fromLondonInput,
  londonInput,
  makeTag,
  starterTags,
} from './domain';
import {
  asDraft,
  changeDeleted,
  emptyDraft,
  getDraft,
  getMedia,
  ingest,
  listMoments,
  listTags,
  meta,
  putDraft,
  putTag,
  rememberMedia,
  resolveConflict,
  saveMoment,
  setMeta,
} from './storage';
import type { Draft, LocalMoment, Tag } from './types';
import { syncAccount } from './sync';
import { AttachmentPicker, MediaPreview } from './Attachments';
import { TagPicker } from './TagPicker';
import { Explore } from './Explore';
import {
  backupInfo,
  downloadFile,
  exportJson,
  exportSnapshot,
  exportZip,
  importZip,
  weeklyBackup,
} from './backup';

const profile = profileFromPath(location.pathname);
function SignIn({
  state,
  error,
  onError,
}: {
  state: string;
  error: string;
  onError: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      await authPersistence;
      await signInWithEmailAndPassword(
        auth,
        String(form.get('email')),
        String(form.get('password')),
      );
      onError('');
    } catch {
      onError('Could not sign in. Check your existing household email, password and connection.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="sign-in">
      <span className="brand-mark">
        <Heart />
      </span>
      <p className="eyebrow">FAMILY MOMENTS</p>
      <h1>
        A little moment.
        <br />
        Yours to keep.
      </h1>
      <p>Sign in with your existing household account.</p>
      {state === 'checking' ? (
        <p role="status">Restoring your private space…</p>
      ) : (
        <form onSubmit={submit}>
          <label>
            Email
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <small>
        Your memories stay private. Returning members can capture offline after their first sign-in.
      </small>
    </main>
  );
}
export default function App() {
  const [uid, setUid] = useState(TEST_MODE ? 'local-test' : ''),
    [email, setEmail] = useState(TEST_MODE ? 'Local browser test' : ''),
    [state, setState] = useState(TEST_MODE ? 'ready' : 'checking'),
    [error, setError] = useState('');
  useEffect(() => {
    if (TEST_MODE) return;
    let generation = 0;
    const unsub = onAuthStateChanged(auth, (user: User | null) => {
      const token = ++generation;
      setUid('');
      setEmail('');
      setError('');
      if (!user) {
        setState('signed-out');
        return;
      }
      setState('checking');
      void (async () => {
        const cached = await meta<boolean>(`member:${user.uid}`);
        if (token !== generation) return;
        if (cached) {
          setUid(user.uid);
          setEmail(user.email || 'Household member');
          setState('ready');
        }
        try {
          const allowed = await membership(user.uid);
          if (token !== generation) return;
          await setMeta(`member:${user.uid}`, allowed);
          if (!allowed) {
            setUid('');
            setState('denied');
            setError('This account is not a member of the existing household.');
          } else {
            setUid(user.uid);
            setEmail(user.email || 'Household member');
            setState('ready');
          }
        } catch {
          if (token === generation && !cached) {
            setState('error');
            setError('Connect to the internet to verify household membership on this phone.');
          }
        }
      })().catch((e) => {
        if (token === generation) {
          setState('error');
          setError((e as Error).message);
        }
      });
    });
    return () => {
      generation++;
      unsub();
    };
  }, []);
  return (
    <div
      className="app"
      style={{ '--accent': profile.accent, '--tint': profile.tint } as CSSProperties}
    >
      {uid && state === 'ready' ? (
        <Workspace key={`${uid}:${profile.id}`} uid={uid} email={email} />
      ) : (
        <SignIn state={state} error={error} onError={setError} />
      )}
    </div>
  );
}
function Workspace({ uid, email }: { uid: string; email: string }) {
  const navigation = useAppNavigation();
  const { view, moment: opened, delete: deleteId, source: attachmentSource } = navigation.screen;
  const [attachmentControls, setAttachmentControls] = useState<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft(uid, profile.id)),
    [loaded, setLoaded] = useState(false),
    [rows, setRows] = useState<LocalMoment[]>([]),
    [tags, setTags] = useState<Tag[]>(starterTags);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [sync, setSync] = useState('Checking cloud…'),
    [online, setOnline] = useState(navigator.onLine);
  const [saving, setSaving] = useState(false),
    [attaching, setAttaching] = useState(false),
    [undo, setUndo] = useState<{ id: string; deleted: boolean } | null>(null),
    [showDeleted, setShowDeleted] = useState(false),
    [more, setMore] = useState(true),
    [exporting, setExporting] = useState(false),
    [snapshots, setSnapshots] = useState<Array<{ id: string; at: string }>>([]),
    [backupError, setBackupError] = useState('');
  const [visibleCount, setVisibleCount] = useState(30);
  const shellRef = useRef<HTMLDivElement>(null);
  const captureScrollRef = useRef<HTMLDivElement>(null);
  const alive = useRef(true),
    writeChain = useRef(Promise.resolve()),
    current = useRef(draft),
    cursor = useRef<QueryDocumentSnapshot | undefined>(undefined),
    refreshing = useRef(false),
    saveGuard = useRef(false);
  const active = useCallback(
    () => alive.current && (TEST_MODE || auth.currentUser?.uid === uid),
    [uid],
  );
  const refreshLocal = useCallback(async () => {
    const [m, t] = await Promise.all([listMoments(uid), listTags(uid)]);
    if (!active()) return;
    setRows(m);
    setTags([
      ...new Map([...starterTags, ...t.map((t) => t.value)].map((t) => [t.id, t])).values(),
    ]);
  }, [uid, active]);
  const backup = useCallback(async () => {
    try {
      await weeklyBackup(uid);
      const info = await backupInfo(uid);
      if (active()) setSnapshots(info.snapshots.sort((a, b) => b.at.localeCompare(a.at)));
    } catch (e) {
      if (active()) setBackupError(`Local backup needs attention: ${(e as Error).message}`);
    }
  }, [uid, active]);
  const refreshCloud = useCallback(
    async (older = false) => {
      if (TEST_MODE || !navigator.onLine || !active() || refreshing.current) return false;
      refreshing.current = true;
      try {
        if (!older) {
          // Server commit timestamps, rather than event dates/device clocks, catch
          // corrections and deletions of old memories and late offline uploads.
          const since = (await meta<number>(`cloud-cursor:${uid}`)) || 0;
          let changeCursor: QueryDocumentSnapshot | undefined,
            changedMore = true,
            watermark = since;
          while (changedMore) {
            const changes = await fetchChanges(uid, since, changeCursor);
            if (!active()) return false;
            for (const m of changes.values) {
              await ingest(uid, m);
              watermark = Math.max(watermark, m.cloudUpdatedAt || 0);
            }
            changeCursor = changes.cursor;
            changedMore = changes.more;
          }
          await setMeta(`cloud-cursor:${uid}`, watermark);
        }
        const page = await fetchPage(uid, older ? cursor.current : undefined);
        if (!active()) return;
        for (const m of page.values) await ingest(uid, m);
        cursor.current = page.cursor;
        setMore(page.more);
        if (!older)
          for (const t of await fetchTags(uid)) {
            if (!active()) return;
            await putTag(uid, t, false);
          }
        if (active()) await refreshLocal();
        return true;
      } catch (e) {
        if (active())
          setError(
            `Cloud review unavailable: ${(e as Error).message}. Your local records remain available.`,
          );
        return false;
      } finally {
        refreshing.current = false;
      }
    },
    [uid, active, refreshLocal],
  );
  const syncPass = useCallback(async () => {
    if (TEST_MODE) {
      setSync('Local browser test · cloud disabled');
      return;
    }
    if (!navigator.onLine || !active()) return;
    try {
      setSync('Connecting…');
      await syncAccount(uid, transport, active, (s) => {
        if (active()) setSync(s);
      });
      if (!active()) return;
      await refreshLocal();
      const verified = await refreshCloud();
      const pending = (await listMoments(uid)).filter((r) => r.status !== 'synced');
      if (active())
        setSync(
          pending.some((r) => r.error || r.status === 'conflict')
            ? 'Needs attention · retry'
            : pending.length
              ? `${pending.length} saved locally`
              : verified
                ? 'Safely synced'
                : 'Cloud unavailable · saved copies retained',
        );
    } catch (e) {
      if (active()) {
        setSync('Needs attention · retry');
        setError((e as Error).message);
      }
    }
  }, [uid, active, refreshLocal, refreshCloud]);
  const retry = useMemo(
    () => createSyncRunner(syncPass, () => navigator.onLine && active()),
    [syncPass, active],
  );
  useEffect(() => {
    if (view !== 'capture') return;
    const shell = shellRef.current;
    const viewport = window.visualViewport;
    const resize = () => {
      shell?.classList.toggle('compact-viewport', (viewport?.height ?? window.innerHeight) <= 600);
      shell?.style.setProperty('--viewport-height', `${viewport?.height ?? window.innerHeight}px`);
      shell?.style.setProperty('--viewport-top', `${viewport?.offsetTop ?? 0}px`);
    };
    resize();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    window.addEventListener('resize', resize);
    return () => {
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
      window.removeEventListener('resize', resize);
      shell?.style.removeProperty('--viewport-height');
      shell?.style.removeProperty('--viewport-top');
      shell?.classList.remove('compact-viewport');
    };
  }, [view]);
  useEffect(() => {
    alive.current = true;
    void (async () => {
      const d = await getDraft(uid, profile.id);
      if (!active()) return;
      const next = d || emptyDraft(uid, profile.id);
      current.current = next;
      setDraft(next);
      const existing = await listTags(uid);
      for (const tag of starterTags)
        if (!existing.some((t) => t.id === tag.id)) await putTag(uid, tag);
      await refreshLocal();
      if (!active()) return;
      setLoaded(true);
      void retry();
      void backup();
      try {
        await navigator.storage?.persist?.();
        const estimate = await navigator.storage?.estimate?.();
        if (estimate?.quota && estimate.usage && estimate.usage / estimate.quota > 0.8 && active())
          setError('This phone is nearly full. Export a media backup and synchronise soon.');
      } catch {}
    })().catch((e) => {
      if (active()) setError(`Phone storage could not be opened: ${(e as Error).message}`);
    });
    const resume = () => {
      if (document.visibilityState === 'visible') {
        setOnline(navigator.onLine);
        void retry();
        void backup();
        void refreshLocal();
      }
    };
    const connection = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void retry();
    };
    const timer = setInterval(resume, 30000);
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    document.addEventListener('visibilitychange', resume);
    return () => {
      alive.current = false;
      clearInterval(timer);
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [uid, active, refreshLocal, retry, backup]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (attaching || saving) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [attaching, saving]);
  const update = (change: Partial<Draft>) => {
    const next = { ...current.current, ...change };
    current.current = next;
    setDraft(next);
    writeChain.current = writeChain.current.catch(() => {}).then(() => putDraft(next));
    void writeChain.current.catch((e) => {
      if (active())
        setError(
          `Draft could not be saved: ${(e as Error).message}. Keep this screen open and free some space.`,
        );
    });
  };
  const navigate = (next: typeof view) => {
    navigation.open({
      view: next,
      moment: '',
      delete: '',
      source: null,
      date: false,
      exploreMode: null,
    });
  };
  const submit = async () => {
    if (saveGuard.current || attaching || !loaded) return;
    saveGuard.current = true;
    setSaving(true);
    setError('');
    try {
      await writeChain.current;
      const sent = await saveMoment(current.current);
      if (!active()) return;
      const edited = current.current.editingId;
      const blank = emptyDraft(uid, profile.id);
      current.current = blank;
      setDraft(blank);
      setNotice('Saved on this phone');
      if (!TEST_MODE) setSync('Saved locally');
      setUndo(edited ? null : { id: sent.id, deleted: false });
      navigator.vibrate?.(18);
      await refreshLocal();
      captureScrollRef.current?.scrollTo({ top: 0 });
      void retry();
    } catch (e) {
      if (active())
        setError(`Could not save: ${(e as Error).message}. Your capture is still here.`);
    } finally {
      saveGuard.current = false;
      if (active()) setSaving(false);
      captureScrollRef.current?.scrollTo({ top: 0 });
    }
  };
  const edit = async (row: LocalMoment) => {
    const d = current.current;
    if (
      (d.text.trim() || d.attachments.length) &&
      !window.confirm('Replace your current capture with this saved moment?')
    )
      return;
    const next = asDraft(uid, row.value);
    update(next);
    navigation.replace({ view: 'capture', moment: '', delete: '', source: null, date: false });
    setNotice('Editing a saved moment');
  };
  const changeDelete = async (id: string, deleted: boolean) => {
    try {
      await changeDeleted(uid, id, deleted);
      if (deleteId) navigation.back();
      setUndo({ id, deleted });
      setNotice(deleted ? 'Moved to Recently deleted' : 'Moment restored');
      await refreshLocal();
      void retry();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const ensureAll = async () => {
    if (TEST_MODE || !navigator.onLine) return;
    let next: QueryDocumentSnapshot | undefined;
    let hasMore = true;
    while (hasMore) {
      if (!active()) throw new Error('Account changed. Export stopped.');
      const page = await fetchPage(uid, next, 100);
      for (const m of page.values) await ingest(uid, m);
      next = page.cursor;
      hasMore = page.more;
    }
    for (const t of await fetchTags(uid)) await putTag(uid, t, false);
    await refreshLocal();
  };
  const doExport = async (kind: 'json' | 'zip') => {
    setExporting(true);
    setError('');
    try {
      await writeChain.current;
      await ensureAll();
      const blob =
        kind === 'json'
          ? await exportJson(uid)
          : await exportZip(uid, (a) => download(uid, a), setNotice);
      if (active()) {
        downloadFile(blob, `family-moments-${new Date().toISOString().slice(0, 10)}.${kind}`);
        setNotice(
          kind === 'zip'
            ? 'Media backup downloaded'
            : 'Metadata export downloaded · media not included',
        );
      }
    } catch (e) {
      if (active()) setError((e as Error).message);
    } finally {
      if (active()) setExporting(false);
    }
  };
  const Icon = profile.icon === 'flower' ? Flower2 : profile.icon === 'sun' ? Sun : Leaf;
  const pending = rows.filter((r) => r.status !== 'synced'),
    visible = rows
      .filter((r) => r.value.profileId === profile.id && !!r.value.deletedAt === showDeleted)
      .sort((a, b) => b.value.eventAt.localeCompare(a.value.eventAt));
  const status = !online
    ? `Offline · ${pending.length} waiting`
    : pending.length && sync === 'Safely synced'
      ? `${pending.length} saved locally`
      : sync;
  const renderMoment = (row: LocalMoment, index: number) => {
    const m = row.value,
      voiceCount = m.attachments.filter((a) => a.kind === 'audio').length,
      full = opened === m.id,
      previous = visible[index - 1]?.value;
    return (
      <div key={m.id}>
        {(!previous || formatDate(previous.eventAt) !== formatDate(m.eventAt)) && (
          <h3 className="date-group">{formatDate(m.eventAt)}</h3>
        )}
        <article className="moment">
          <button
            type="button"
            className="moment-open"
            onClick={() => {
              if (full) navigation.back();
              else if (opened) navigation.replace({ moment: m.id, source: null });
              else navigation.open({ moment: m.id, source: null });
            }}
            aria-expanded={full}
          >
            <time dateTime={m.eventAt}>{formatTime(m.eventAt)}</time>
            <p>
              {m.text ||
                (m.attachments.length && m.attachments.every((a) => a.kind === 'audio')
                  ? 'A voice to remember'
                  : 'A moment in pictures and sound')}
            </p>
            {voiceCount > 0 && (
              <span className="voice-badge">
                <Mic size={14} aria-hidden="true" />
                {voiceCount} voice clip{voiceCount === 1 ? '' : 's'}
              </span>
            )}
            <div className="moment-meta">
              <span>
                {m.attachments.length
                  ? `${m.attachments.length} attachment${m.attachments.length === 1 ? '' : 's'} · `
                  : ''}
                {row.status === 'synced'
                  ? m.attachments.some((a) => !a.remote)
                    ? 'Media pending on another phone'
                    : 'Safely synced'
                  : row.status === 'conflict'
                    ? 'Review conflicting edits'
                    : row.error
                      ? 'Needs attention'
                      : 'Saved locally'}
              </span>
              <ChevronRight size={17} />
            </div>
            <div className="chips">
              {m.tagIds.map((id) => (
                <span className="chip small" key={id}>
                  {tags.find((t) => t.id === id)?.label || id}
                </span>
              ))}
            </div>
          </button>
          {full && (
            <div className="moment-detail">
              {m.attachments.map((a) => (
                <MediaPreview key={a.id} uid={uid} a={a} />
              ))}
              {row.error && (
                <p className="error" role="status">
                  {row.error}
                </p>
              )}
              {row.conflict ? (
                <div className="conflict">
                  <h3>Two versions of this moment</h3>
                  <p>
                    <strong>This phone:</strong> {m.text || '(attachment only)'}
                  </p>
                  <p>
                    {formatDate(m.eventAt)} {formatTime(m.eventAt)} · {m.attachments.length} files ·{' '}
                    {m.tagIds.map((t) => tags.find((x) => x.id === t)?.label || t).join(', ')}
                  </p>
                  <p>
                    <strong>Other parent:</strong> {row.conflict.text || '(attachment only)'}
                  </p>
                  <p>
                    {formatDate(row.conflict.eventAt)} {formatTime(row.conflict.eventAt)} ·{' '}
                    {row.conflict.deletedAt ? 'Deleted · ' : ''}
                    {row.conflict.attachments.length} files ·{' '}
                    {row.conflict.tagIds
                      .map((t) => tags.find((x) => x.id === t)?.label || t)
                      .join(', ')}
                  </p>
                  {(['remote', 'local', 'copy'] as const).map((choice) => (
                    <button
                      key={choice}
                      onClick={async () => {
                        try {
                          if (choice === 'copy')
                            for (const a of m.attachments)
                              if (!(await getMedia(uid, a.hash)))
                                await rememberMedia(uid, await download(uid, a));
                          await resolveConflict(uid, m.id, choice);
                          await refreshLocal();
                          void retry();
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      {choice === 'remote'
                        ? 'Use other parent’s version'
                        : choice === 'local'
                          ? 'Use this phone’s version'
                          : 'Keep both as separate moments'}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="row-actions">
                  <button onClick={() => void edit(row)}>Edit moment</button>
                  {m.deletedAt ? (
                    <button onClick={() => void changeDelete(m.id, false)}>Restore</button>
                  ) : (
                    <button
                      className="danger"
                      onClick={() => {
                        navigation.open({ delete: m.id });
                      }}
                    >
                      Delete
                    </button>
                  )}
                  {row.error && <button onClick={() => void retry()}>Retry upload</button>}
                </div>
              )}
            </div>
          )}
        </article>
      </div>
    );
  };
  const notifications = (
    <>
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError('')}>
            ×
          </button>
        </div>
      )}
      {notice && (
        <div className="save-feedback" role="status">
          <Check size={18} />
          <span>{notice}</span>
          {undo && (
            <button
              onClick={async () => {
                await changeDelete(undo.id, !undo.deleted);
                setUndo(null);
              }}
            >
              Undo
            </button>
          )}
          <button
            aria-label="Dismiss message"
            onClick={() => {
              setNotice('');
              setUndo(null);
            }}
          >
            ×
          </button>
        </div>
      )}
      {pending.length > 0 && (
        <p className="pending-note" role="status">
          {pending.length} moment{pending.length === 1 ? '' : 's'}{' '}
          {pending.some((r) => r.status === 'conflict')
            ? 'need review'
            : 'waiting for cloud confirmation'}
          . Keep this phone’s data until they sync or you export a media backup.
        </p>
      )}
      {TEST_MODE && <p className="test-banner">Local browser test · no cloud writes</p>}
    </>
  );
  return (
    <div className={`workspace-shell ${view === 'capture' ? 'capture-mode' : ''}`} ref={shellRef}>
      <header className="topbar">
        <a className="brand" href={`${BASE}${profile.id}/`} aria-label={profile.name}>
          <span className="brand-mark">
            <Icon size={25} />
          </span>
          <span>
            <small>FAMILY MOMENTS</small>
            <strong>{profile.name}</strong>
          </span>
        </a>
        <div className="header-actions">
          <button
            className="icon-button"
            aria-label="Explore moments"
            onClick={() => navigate('explore')}
          >
            <Compass size={22} />
          </button>
          <button
            className="icon-button"
            aria-label="Settings and backups"
            onClick={() => navigate('settings')}
          >
            <Settings size={21} />
          </button>
        </div>
      </header>
      <main className={`workspace ${view === 'capture' ? 'capture-workspace' : ''}`}>
        <div className="status-line">
          <span>{formatDate(new Date().toISOString())}</span>
          <button type="button" onClick={() => void retry()} aria-label={`Sync status: ${status}`}>
            <Cloud size={13} />
            {status}
          </button>
        </div>
        {view !== 'capture' && notifications}
        {view === 'capture' && (
          <>
            <div className="capture-heading">
              <p className="eyebrow">THE LITTLE THINGS ARE THE BIG THINGS</p>
              <h1>What happened today?</h1>
              <p>A first, a funny thing, or just a lovely ordinary day.</p>
            </div>
            <fieldset
              disabled={saving || !loaded}
              className="capture-fields"
              aria-label="Moment details"
            >
              <section className="capture-card" aria-label="Capture a moment">
                <label className="sr-only" htmlFor="thought">
                  What happened today?
                </label>
                <textarea
                  id="thought"
                  placeholder="A little moment worth keeping…"
                  value={draft.text}
                  disabled={!loaded || saving}
                  maxLength={20000}
                  onChange={(e) => update({ text: e.target.value })}
                />
                <div className="capture-attachment-controls" ref={setAttachmentControls} />
              </section>
              <div
                className="capture-scroll"
                ref={captureScrollRef}
                role="region"
                aria-label="Attachments, tags and recent moments"
                tabIndex={0}
              >
                {notifications}
                <AttachmentPicker
                  controlsHost={attachmentControls}
                  source={attachmentSource}
                  onSourceChange={(source) => {
                    if (source) {
                      if (attachmentSource) navigation.replace({ source });
                      else navigation.open({ source });
                      captureScrollRef.current?.scrollTo({ top: 0 });
                    } else if (attachmentSource) navigation.back();
                  }}
                  uid={uid}
                  attachments={draft.attachments}
                  onChange={(attachments) => update({ attachments })}
                  onBusy={setAttaching}
                  onError={setError}
                />
                <details className="event-date" open={navigation.screen.date}>
                  <summary
                    onClick={(e) => {
                      e.preventDefault();
                      if (navigation.screen.date) navigation.back();
                      else navigation.open({ date: true, source: null });
                    }}
                  >
                    {draft.editingId ? 'Event date' : 'Happened another day?'}{' '}
                    <span>
                      {formatDate(draft.eventAt)} · {formatTime(draft.eventAt)}
                    </span>
                  </summary>
                  <label>
                    When it happened (London time)
                    <input
                      aria-label="Event date and time"
                      type="datetime-local"
                      value={londonInput(draft.eventAt)}
                      onChange={(e) => {
                        try {
                          update({ eventAt: fromLondonInput(e.target.value) });
                          setError('');
                        } catch (error) {
                          setError((error as Error).message);
                        }
                      }}
                    />
                  </label>
                  <small>During autumn’s repeated hour, the earlier occurrence is used.</small>
                </details>
                <TagPicker
                  tags={tags}
                  moments={rows.map((r) => r.value)}
                  profile={profile.id}
                  selected={draft.tagIds}
                  onChange={(tagIds) => update({ tagIds })}
                  onCreate={async (label) => {
                    const tag = makeTag(label),
                      existing = tags.find((t) => t.id === tag.id);
                    if (existing) return existing;
                    await putTag(uid, tag);
                    await refreshLocal();
                    void retry();
                    return tag;
                  }}
                />
                {draft.editingId && (
                  <button
                    className="text-button"
                    onClick={() => {
                      if (confirm('Leave editing and clear this draft?'))
                        update(emptyDraft(uid, profile.id));
                    }}
                  >
                    Cancel editing
                  </button>
                )}
                <div className="recent-heading">
                  <h2>Just remembered</h2>
                  <button className="text-button" onClick={() => navigate('recent')}>
                    See recent <ChevronRight size={15} />
                  </button>
                </div>
                {visible.length ? (
                  visible.slice(0, 3).map(renderMoment)
                ) : (
                  <div className="empty-state">
                    <Icon size={28} />
                    <p>Your little moments will gather here.</p>
                  </div>
                )}
              </div>
            </fieldset>
            <div className="save-area">
              <button
                className="primary save-button"
                disabled={!loaded || saving || attaching}
                onClick={() => void submit()}
              >
                <Heart size={19} />
                {saving
                  ? 'Saving on this phone…'
                  : draft.editingId
                    ? 'Save changes'
                    : 'Save Moment'}
              </button>
              <small>Private to your family · saved on your phone first</small>
            </div>
          </>
        )}
        {view === 'explore' && (
          <Explore
            uid={uid}
            profileId={profile.id}
            profileName={profile.name}
            moments={rows.map((r) => r.value)}
            tags={tags}
            mode={navigation.screen.exploreMode}
            demo={navigation.screen.samples}
            selectedId={opened}
            onMode={(exploreMode) => {
              navigation.open({ exploreMode, moment: '' });
              window.scrollTo({ top: 0 });
            }}
            onDemo={(samples) => navigation.replace({ samples, moment: '' })}
            onSelect={(moment) => {
              navigation.open({ moment });
              window.scrollTo({ top: 0 });
            }}
            onBack={navigation.back}
            onEdit={(id) => {
              const row = rows.find((r) => r.id === id);
              if (row) void edit(row);
            }}
            more={more}
            onMore={async () => {
              await refreshCloud(true);
            }}
          />
        )}
        {view === 'recent' && (
          <>
            <button
              className="text-button back"
              onClick={() => {
                navigation.capture();
              }}
            >
              <ArrowLeft size={16} /> Back to capture
            </button>
            <h1>Recent moments</h1>
            <p className="muted">{profile.name}</p>
            <label className="toggle">
              <input
                type="checkbox"
                checked={showDeleted}
                onChange={(e) => {
                  setShowDeleted(e.target.checked);
                  if (opened) navigation.back();
                }}
              />{' '}
              Recently deleted
            </label>
            {visible.slice(0, visibleCount).map(renderMoment)}
            {!visible.length && (
              <p className="empty-state">
                No {showDeleted ? 'deleted ' : ''}moments on this phone yet.
              </p>
            )}
            {(visible.length > visibleCount || more) && (
              <button
                className="load-more"
                onClick={() => {
                  if (visible.length > visibleCount) setVisibleCount((n) => n + 30);
                  else void refreshCloud(true);
                }}
              >
                Load older moments
              </button>
            )}
          </>
        )}
        {view === 'settings' && (
          <section className="settings">
            <button className="text-button back" onClick={navigation.capture}>
              <ArrowLeft size={16} /> Back to capture
            </button>
            <h1>Your private space</h1>
            <p className="muted">{email}</p>
            <h2>Three little spaces</h2>
            <div className="profile-links">
              {profiles.map((p) => (
                <a className="button" key={p.id} href={`${BASE}${p.id}/`}>
                  {p.name}
                </a>
              ))}
            </div>
            <p>
              Open each profile and use Chrome’s menu → Add to Home screen. Each shortcut always
              opens its own profile.
            </p>
            <h2>Backups & recovery</h2>
            <p>
              Weekly snapshots run the next time this app is open. Unchanged records and media are
              stored once, identified by their content. These snapshots share this browser’s
              storage: export a ZIP for a separate copy.
            </p>
            {backupError && (
              <p className="error" role="alert">
                {backupError}
              </p>
            )}
            <p>
              {snapshots[0]
                ? `Last local snapshot: ${formatDate(snapshots[0].at)}`
                : 'No weekly snapshot yet.'}
            </p>
            <div className="settings-actions">
              <button disabled={exporting} onClick={() => void doExport('zip')}>
                Download media backup (.zip)
              </button>
              <button disabled={exporting} onClick={() => void doExport('json')}>
                Export metadata only (.json)
              </button>
              <button
                onClick={async () => {
                  try {
                    await writeChain.current;
                    await weeklyBackup(uid, true);
                    await backup();
                    setNotice('Local recovery snapshot created');
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Create local snapshot now
              </button>
            </div>
            <small>
              {online
                ? 'Exports first retrieve all cloud record pages, then include this phone’s pending records.'
                : 'Offline exports include only data already on this phone.'}{' '}
              ZIP requires every referenced file; it stops with an error if a file cannot be
              retrieved. Browser ZIP limit: 250 MB.
            </small>
            {snapshots.length > 0 && (
              <label>
                Download a local recovery snapshot
                <select
                  defaultValue=""
                  onChange={async (e) => {
                    const id = e.target.value;
                    e.target.value = '';
                    if (!id) return;
                    try {
                      downloadFile(
                        await exportSnapshot(uid, id),
                        `family-moments-local-snapshot-${id}.zip`,
                      );
                    } catch (error) {
                      setError((error as Error).message);
                    }
                  }}
                >
                  <option value="">Choose a snapshot…</option>
                  {snapshots.map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatDate(s.at)} · {formatTime(s.at)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p>
              Local snapshots include locally held media, and cloud paths for other files. A
              snapshot of this phone is not a complete household media backup.
            </p>
            <label className="button">
              Restore a backup ZIP
              <input
                type="file"
                accept=".zip"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  try {
                    await weeklyBackup(uid, true);
                    const count = await importZip(uid, file);
                    await refreshLocal();
                    setNotice(`Restored ${count} missing moments. Existing records were kept.`);
                    void retry();
                  } catch (error) {
                    setError((error as Error).message);
                  }
                }}
              />
            </label>
            <h2>On this phone</h2>
            <p>
              Local records and attachment files remain here after sign-out. They are partitioned by
              account. This app does not clear them automatically. A shared unlocked browser can
              still access its local storage.
            </p>
            <p>
              Uploads retry while the app is open. A closed PWA cannot guarantee background uploads
              or scheduled backups.
            </p>
            <button
              className="danger"
              onClick={async () => {
                try {
                  await writeChain.current;
                  if (
                    (pending.length ||
                      current.current.text ||
                      current.current.attachments.length) &&
                    !confirm(
                      'This phone has pending memories or a draft. They stay here, but uploads pause until this account signs in again. Sign out?',
                    )
                  )
                    return;
                  if (!TEST_MODE) await signOut(auth);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Sign out
            </button>
          </section>
        )}
      </main>
      {deleteId && (
        <div className="dialog-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            className="dialog"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                navigation.back();
              }
              if (e.key === 'Tab') {
                const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('button');
                const first = buttons[0],
                  last = buttons[buttons.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first.focus();
                }
              }
            }}
          >
            <h2 id="delete-title">Delete this moment?</h2>
            <p>
              You can restore the record from Recently deleted. Cloud files are eligible for removal
              after 7 days; this phone keeps its saved files.
            </p>
            <button autoFocus onClick={navigation.back}>
              Keep moment
            </button>
            <button className="danger" onClick={() => void changeDelete(deleteId, true)}>
              Delete moment
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
