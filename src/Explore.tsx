import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, FileText, Mic, Play, Shuffle, Video } from 'lucide-react';
import type { Moment, Tag } from './types';
import { formatDate, formatTime, starterTags } from './domain';
import { getMedia } from './storage';
import { MediaPreview } from './Attachments';
import {
  exploreModes,
  pickUnseen,
  sampleMoments,
  sampleSound,
  sharedTagLinks,
  type ExploreMode,
} from './explore-data';
import './explore.css';

const caption = (m: Moment) =>
  m.text ||
  (m.attachments.some((a) => a.kind === 'audio')
    ? 'A voice to remember'
    : 'A little moment worth keeping');
const voiceLabel = (m: Moment) => {
  const count = m.attachments.filter((a) => a.kind === 'audio').length;
  return `${count} voice clip${count === 1 ? '' : 's'}`;
};
const month = (at: string) =>
  new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/London',
  }).format(new Date(at));
function Illustration({ variant = 0 }: { variant?: number }) {
  return (
    <svg
      className={`sample-illustration scene-${variant % 3}`}
      viewBox="0 0 240 155"
      role="img"
      aria-label="Illustrative landscape, not a family photograph"
    >
      <rect width="240" height="155" fill="currentColor" />
      <circle cx="174" cy="43" r="22" fill="#ffe1a3" />
      <path d="M0 120 Q70 45 138 120 T280 104 V155 H0Z" fill="#648c7b" />
      <path d="M0 132 Q90 90 180 145 T280 120 V155 H0Z" fill="#346b65" />
      <path d="M90 155 Q150 128 119 106" fill="none" stroke="#eee1b7" strokeWidth="12" />
    </svg>
  );
}
function Thumbnail({ uid, m, demo }: { uid: string; m: Moment; demo: boolean }) {
  const photo = m.attachments.find((a) => a.kind === 'image');
  const [url, setUrl] = useState('');
  useEffect(() => {
    setUrl('');
    if (!photo || demo) return;
    let alive = true,
      object = '';
    void getMedia(uid, photo.hash)
      .then((media) => {
        if (alive && media) {
          object = URL.createObjectURL(media.blob);
          setUrl(object);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (object) URL.revokeObjectURL(object);
    };
  }, [uid, photo?.hash, demo]);
  if (demo && photo) return <Illustration variant={Number(m.id.split('-')[1])} />;
  if (url)
    return (
      <img
        className="explore-photo"
        src={url}
        alt={photo?.name || 'Saved photograph'}
        loading="lazy"
      />
    );
  if (photo)
    return (
      <span className="keepsake-placeholder">
        ▧<small>Photograph · open to load</small>
      </span>
    );
  const kind = m.attachments[0]?.kind;
  return kind ? (
    <span className={`keepsake-placeholder ${kind}`}>
      {kind === 'audio' ? (
        <Mic size={27} />
      ) : kind === 'video' ? (
        <Video size={27} />
      ) : (
        <FileText size={27} />
      )}
      <small>
        {kind === 'audio'
          ? 'A voice worth keeping'
          : kind === 'video'
            ? 'A little moving picture'
            : 'A saved keepsake'}
      </small>
    </span>
  ) : null;
}
function Tags({ m, tags }: { m: Moment; tags: Tag[] }) {
  return (
    <span className="explore-tags">
      {m.tagIds.map((id) => (
        <span key={id}>{tags.find((t) => t.id === id)?.label || id}</span>
      ))}
      {m.attachments.some((a) => a.kind === 'audio') && (
        <span className="explore-voice">
          <Mic size={12} aria-hidden="true" /> {voiceLabel(m)}
        </span>
      )}
    </span>
  );
}
function SampleMedia({ m }: { m: Moment }) {
  const sound = useMemo(sampleSound, []);
  return (
    <>
      {m.attachments.map((a) => (
        <div className="sample-media" key={a.id}>
          {a.kind === 'image' ? (
            <Illustration variant={Number(m.id.split('-')[1])} />
          ) : a.kind === 'audio' ? (
            <>
              <p>Generated sample chime · not a family recording</p>
              <audio aria-label="Generated sample sound" controls preload="none" src={sound} />
            </>
          ) : (
            <p>
              {a.kind === 'video' ? '▹ Example video card' : '▤ Example document card'} ·
              illustrative attachment only
            </p>
          )}
        </div>
      ))}
    </>
  );
}
type Props = {
  uid: string;
  profileId: string;
  profileName: string;
  moments: Moment[];
  tags: Tag[];
  mode: ExploreMode | null;
  demo: boolean;
  selectedId: string;
  onMode: (mode: ExploreMode) => void;
  onDemo: (demo: boolean) => void;
  onSelect: (id: string) => void;
  onBack: () => void;
  onEdit: (id: string) => void;
  more: boolean;
  onMore: () => Promise<void>;
};
export function Explore(props: Props) {
  const {
    uid,
    profileId,
    profileName,
    mode,
    demo,
    selectedId,
    tags,
    onMode,
    onDemo,
    onSelect,
    onBack,
    onEdit,
    more,
    onMore,
  } = props;
  const [limit, setLimit] = useState(60),
    [loading, setLoading] = useState(false);
  const detailReturnScroll = useRef(0),
    previous = useRef({ selectedId, mode, demo });
  const selectMemory = (id: string) => {
    detailReturnScroll.current = window.scrollY;
    onSelect(id);
  };
  useEffect(() => {
    let frame = 0;
    if (
      previous.current.selectedId &&
      !selectedId &&
      previous.current.mode === mode &&
      previous.current.demo === demo
    )
      frame = requestAnimationFrame(() => window.scrollTo({ top: detailReturnScroll.current }));
    previous.current = { selectedId, mode, demo };
    return () => cancelAnimationFrame(frame);
  }, [selectedId, mode, demo]);
  const examples = useMemo(() => sampleMoments(profileId), [profileId]);
  const all = useMemo(
    () =>
      [
        ...(demo
          ? examples
          : props.moments.filter((m) => m.profileId === profileId && !m.deletedAt)),
      ].sort((a, b) => b.eventAt.localeCompare(a.eventAt)),
    [demo, examples, props.moments, profileId],
  );
  const moments = all.slice(0, limit),
    selected = all.find((m) => m.id === selectedId);
  const catalogue = useMemo(
    () => [...new Map([...starterTags, ...tags].map((t) => [t.id, t])).values()],
    [tags],
  );
  const chosen = exploreModes.find((m) => m.id === mode);
  return (
    <section
      className={`explore-screen ${mode ? `explore-${mode}` : ''}`}
      aria-label="Explore moments"
    >
      <button className="text-button back" onClick={onBack}>
        <ArrowLeft size={16} />
        {selected ? 'Back to this view' : mode ? 'All five views' : 'Back to capture'}
      </button>
      <div className="explore-intro">
        <p className="eyebrow">{profileName} · A DIFFERENT WAY TO REMEMBER</p>
        <h1>{selected ? 'A moment, held close' : chosen?.name || 'Open your little world'}</h1>
        <p>
          {selected
            ? formatDate(selected.eventAt)
            : chosen?.intro ||
              'Five ways to wander through the same memories. Which one feels like you?'}
        </p>
      </div>
      <label className="sample-switch">
        <input type="checkbox" checked={demo} onChange={(e) => onDemo(e.target.checked)} />
        Try fictional sample memories
      </label>
      {demo && (
        <p className="sample-notice" role="status">
          Sample mode · fictional memories, illustration placeholders and a generated sample sound.
          Nothing here is saved to your family.
        </p>
      )}
      {!demo && (
        <p className="explore-count">
          {all.length} saved moment{all.length === 1 ? '' : 's'} available on this phone
          {more ? ' · older cloud memories can be loaded below' : ''}.
          {all.length > limit &&
            ` ${moments.length} currently included in these views; load older moments to include more.`}
        </p>
      )}
      {selected && (
        <article className="explore-detail" aria-label="Memory details">
          <time dateTime={selected.eventAt}>
            {formatDate(selected.eventAt)} · {formatTime(selected.eventAt)}
          </time>
          <h2>{caption(selected)}</h2>
          <Tags m={selected} tags={catalogue} />
          {demo ? (
            <SampleMedia m={selected} />
          ) : (
            selected.attachments.map((a) => <MediaPreview uid={uid} a={a} key={a.id} />)
          )}
          {!demo && <button onClick={() => onEdit(selected.id)}>Edit this moment</button>}
        </article>
      )}
      <div hidden={!!selected}>
        {!mode ? (
          <div className="explore-choices">
            {exploreModes.map((option, i) => (
              <button
                key={option.id}
                className={`explore-choice choice-${option.id}`}
                onClick={() => onMode(option.id)}
              >
                <span className="choice-preview" aria-hidden="true">
                  <span>{option.symbol}</span>
                  <i />
                  <i />
                  <i />
                </span>
                <span className="choice-copy">
                  <small>0{i + 1}</small>
                  <strong>{option.name}</strong>
                  <span>{option.description}</span>
                </span>
                <ArrowRight size={20} />
              </button>
            ))}
          </div>
        ) : !moments.length ? (
          <div className="explore-empty">
            <span aria-hidden="true">✧</span>
            <h2>Your world starts with one little moment.</h2>
            <p>
              Save a thought, photo or voice clip, or try the sample collection to explore every
              style now.
            </p>
            <button onClick={() => onDemo(true)}>Explore sample memories</button>
          </div>
        ) : (
          <ExploreCanvas
            key={`${mode}:${demo}`}
            {...{ uid, mode, demo, moments, tags: catalogue }}
            onSelect={selectMemory}
            active={!selected}
          />
        )}
      </div>
      {!demo && !selected && (all.length > limit || more) && (
        <button
          className="load-more"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            try {
              if (all.length > limit) setLimit((v) => v + 60);
              else {
                await onMore();
                setLimit((v) => v + 60);
              }
            } finally {
              setLoading(false);
            }
          }}
        >
          {loading ? 'Looking for older moments…' : 'Load older moments'}
        </button>
      )}
      {mode && !selected && (
        <p className="explore-footnote">
          Tap a memory to read the full entry and open its photos, voice clips and other keepsakes.
        </p>
      )}
    </section>
  );
}
function ExploreCanvas({
  uid,
  mode,
  demo,
  moments,
  tags,
  onSelect,
  active,
}: {
  uid: string;
  mode: ExploreMode;
  demo: boolean;
  moments: Moment[];
  tags: Tag[];
  onSelect: (id: string) => void;
  active: boolean;
}) {
  const [tag, setTag] = useState(''),
    [page, setPage] = useState(0),
    [seen, setSeen] = useState<string[]>([]),
    [drawn, setDrawn] = useState<Moment | null>(null),
    [unfolded, setUnfolded] = useState(false);
  const voices = moments.filter((m) => m.attachments.some((a) => a.kind === 'audio'));
  const [track, setTrack] = useState(voices[0]?.id || ''),
    [playing, setPlaying] = useState(false);
  const playerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) {
      playerRef.current?.querySelectorAll('audio').forEach((audio) => audio.pause());
      setPlaying(false);
    }
  }, [active]);
  const sound = useMemo(sampleSound, []);
  const current = voices.find((m) => m.id === track) || voices[0];
  const usedTags = tags
    .map((t) => ({ ...t, count: moments.filter((m) => m.tagIds.includes(t.id)).length }))
    .filter((t) => t.count)
    .sort((a, b) => b.count - a.count);
  const filteredStars = moments.filter((m) => !tag || m.tagIds.includes(tag));
  const stars = filteredStars.slice(page * 24, page * 24 + 24);
  const pager = (count: number) =>
    count > 24 && (
      <nav className="explore-pager" aria-label="Memory pages">
        <button disabled={page === 0} onClick={() => setPage((n) => n - 1)}>
          Previous page
        </button>
        <span>
          {page + 1} / {Math.ceil(count / 24)}
        </span>
        <button disabled={(page + 1) * 24 >= count} onClick={() => setPage((n) => n + 1)}>
          Next page
        </button>
      </nav>
    );
  const skyHeight = Math.max(300, Math.ceil(stars.length / 4) * 91);
  const point = (index: number) => ({
    x: 45 + (index % 4) * 88 + (index % 2 ? 4 : -4),
    y: 46 + Math.floor(index / 4) * 91 + (index % 3) * 7,
  });
  if (mode === 'scrapbook')
    return (
      <>
        <p className="view-instruction">Tap a scrap to open the whole memory.</p>
        <div className="scrapbook-board">
          {moments.slice(page * 24, page * 24 + 24).map((m, i) => (
            <button
              className={`memory-scrap scrap-${i % 4}`}
              key={m.id}
              onClick={() => onSelect(m.id)}
            >
              <span className="paper-tape" aria-hidden="true" />
              <Thumbnail {...{ uid, m, demo }} />
              <time>{formatDate(m.eventAt)}</time>
              <p>{caption(m)}</p>
              <Tags m={m} tags={tags} />
            </button>
          ))}
        </div>
        {pager(moments.length)}
      </>
    );
  if (mode === 'sky')
    return (
      <div className="night-sky">
        <div className="sky-heading">
          <span aria-hidden="true">✧</span>
          <h2>Little things. Invisible threads.</h2>
          <p>Lines connect memories with a shared tag. Tap a star to revisit it.</p>
        </div>
        <div className="sky-filters" aria-label="Constellation tags">
          <button
            aria-pressed={!tag}
            onClick={() => {
              setTag('');
              setPage(0);
            }}
          >
            All stars
          </button>
          {usedTags.map((t) => (
            <button
              aria-pressed={tag === t.id}
              onClick={() => {
                setTag(t.id);
                setPage(0);
              }}
              key={t.id}
            >
              {t.label} · {t.count}
            </button>
          ))}
        </div>
        <div className="constellation" style={{ height: skyHeight }}>
          <svg viewBox={`0 0 360 ${skyHeight}`} preserveAspectRatio="none" aria-hidden="true">
            {sharedTagLinks(stars)
              .slice(0, 120)
              .map(([a, b]) => (
                <line
                  key={`${a}:${b}`}
                  x1={point(a).x}
                  y1={point(a).y}
                  x2={point(b).x}
                  y2={point(b).y}
                />
              ))}
          </svg>
          {stars.map((m, i) => (
            <button
              className="memory-star"
              style={{ left: `${(point(i).x / 360) * 100}%`, top: point(i).y }}
              key={m.id}
              onClick={() => onSelect(m.id)}
              aria-label={`Open memory: ${caption(m)}`}
            >
              <span aria-hidden="true">✦</span>
              {m.attachments.some((a) => a.kind === 'audio') && (
                <Mic size={11} aria-label="Voice clip" />
              )}
              <small>{caption(m)}</small>
            </button>
          ))}
        </div>
        <p className="sky-note">
          {stars.length} stars shown{moments.length > 24 ? ' · up to 24 at a time' : ''}. Untagged
          memories shine on their own.
        </p>
        {pager(filteredStars.length)}
      </div>
    );
  if (mode === 'river') {
    const ordered = [...moments].reverse();
    return (
      <div className="story-river">
        <div className="river-source">
          <span>THE DAYS BECOME A STORY</span>
          <h2>
            Start upstream.
            <br />
            See how far you’ve come.
          </h2>
        </div>
        {ordered.map((m, i) => (
          <div className={`river-stop river-side-${i % 2}`} key={m.id}>
            {(i === 0 || month(ordered[i - 1].eventAt) !== month(m.eventAt)) && (
              <h3 className="river-month">{month(m.eventAt)}</h3>
            )}
            <button className="river-memory" onClick={() => onSelect(m.id)}>
              <time>{formatDate(m.eventAt)}</time>
              <p>{caption(m)}</p>
              <Tags m={m} tags={tags} />
              <span className="river-open">
                Stay here a moment <ArrowRight size={14} />
              </span>
            </button>
          </div>
        ))}
        <p className="river-end">And the story keeps going…</p>
      </div>
    );
  }
  if (mode === 'radio')
    return (
      <div className="listening-room">
        <p className="radio-kicker">THE SOUNDS OF YOUR LITTLE WORLD</p>
        <p className="radio-instruction">Choose a record below, then press Play. Take your time.</p>
        <div className={`record-sleeve ${playing ? 'is-playing' : ''}`}>
          <div className="vinyl" aria-hidden="true">
            <span>
              FM
              <br />
              <small>FAMILY MOMENTS</small>
            </span>
          </div>
          <span className="record-corner" aria-hidden="true">
            33⅓
          </span>
        </div>
        {current ? (
          <>
            <h2>{caption(current)}</h2>
            <p className="record-date">{formatDate(current.eventAt)}</p>
            <div
              className="radio-player"
              ref={playerRef}
              key={current.id}
              onPlayCapture={() => setPlaying(true)}
              onPauseCapture={() => setPlaying(false)}
              onEndedCapture={() => setPlaying(false)}
            >
              {demo ? (
                <>
                  <p>Generated sample chime · not a voice recording</p>
                  <audio
                    aria-label="Sample listening room player"
                    controls
                    src={sound}
                    preload="none"
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onEnded={() => setPlaying(false)}
                  />
                </>
              ) : (
                current.attachments
                  .filter((a) => a.kind === 'audio')
                  .map((a) => <MediaPreview uid={uid} a={a} key={a.id} />)
              )}
            </div>
            <button className="radio-open" onClick={() => onSelect(current.id)}>
              Open the whole memory <ArrowRight size={15} />
            </button>
            <ol className="record-list" aria-label="Voice memories">
              {voices.map((m, i) => (
                <li key={m.id}>
                  <button
                    aria-pressed={m.id === current.id}
                    aria-label={`Select voice memory: ${caption(m)}`}
                    onClick={() => {
                      setTrack(m.id);
                      setPlaying(false);
                    }}
                  >
                    <span>{String(i + 1).padStart(2, '0')}</span>
                    <span>
                      <strong>{caption(m)}</strong>
                      <small>
                        {formatDate(m.eventAt)} · {voiceLabel(m)}
                      </small>
                    </span>
                    <Play size={16} />
                  </button>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <div className="radio-empty">
            <h2>A place for their voices.</h2>
            <p>
              Your voice clips will become a little record collection here. Save one with the Voice
              clip button on the capture screen.
            </p>
            <button onClick={() => onSelect(moments[0].id)}>Read a quiet memory instead</button>
          </div>
        )}
      </div>
    );
  const draw = () => {
    const next = pickUnseen(moments, seen);
    setDrawn(next);
    setUnfolded(false);
    if (next) setSeen((s) => [...s, next.id]);
  };
  return (
    <div className="lucky-room">
      <div className="lucky-label">A SMALL SURPRISE FROM YOUR OWN LIFE</div>
      <h2>
        What will you
        <br />
        remember today?
      </h2>
      <div className="memory-jar" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <span>little things</span>
      </div>
      {drawn ? (
        <div className={`folded-memory ${unfolded ? 'unfolded' : ''}`}>
          <time>{formatDate(drawn.eventAt)}</time>
          {unfolded ? (
            <>
              <p>{caption(drawn)}</p>
              <Tags m={drawn} tags={tags} />
              <button onClick={() => onSelect(drawn.id)}>
                Open this memory <ArrowRight size={15} />
              </button>
            </>
          ) : (
            <>
              <span className="fold-symbol" aria-hidden="true">
                ✉
              </span>
              <p>A little day is waiting inside.</p>
              <button onClick={() => setUnfolded(true)}>Unfold this memory</button>
            </>
          )}
        </div>
      ) : (
        <p className="lucky-invitation">
          No scrolling. No searching.
          <br />
          Just one unexpected little moment.
        </p>
      )}
      {seen.length < moments.length ? (
        <button className="lucky-draw" onClick={draw}>
          <Shuffle size={17} />
          {drawn ? 'Pick another memory' : 'Pick a memory'}
        </button>
      ) : (
        <>
          <p>You’ve drawn all {moments.length} loaded memories. Every one, once.</p>
          <button
            className="lucky-draw"
            onClick={() => {
              setSeen([]);
              setDrawn(null);
              setUnfolded(false);
            }}
          >
            Mix the jar again
          </button>
        </>
      )}
      <small className="lucky-count">
        {seen.length} of {moments.length} drawn · no repeats until you mix again
      </small>
    </div>
  );
}
