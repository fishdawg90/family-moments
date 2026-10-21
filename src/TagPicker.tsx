import { useId, useState } from 'react';
import { makeTag, rankTags } from './domain';
import type { Moment, Tag } from './types';
export function TagPicker({
  tags,
  moments,
  profile,
  selected,
  onChange,
  onCreate,
}: {
  tags: Tag[];
  moments: Moment[];
  profile: string;
  selected: string[];
  onChange: (ids: string[]) => void;
  onCreate: (label: string) => Promise<Tag>;
}) {
  const [search, setSearch] = useState(''),
    [active, setActive] = useState(-1),
    [error, setError] = useState(''),
    id = useId();
  const matches = rankTags(tags, moments, profile, search).slice(0, 6),
    clean = search.trim();
  const canCreate =
    !!clean && !!makeCanonical(clean) && !tags.some((t) => t.canonical === makeCanonical(clean));
  const toggle = (tag: Tag) => {
    onChange(
      selected.includes(tag.id) ? selected.filter((i) => i !== tag.id) : [...selected, tag.id],
    );
    setSearch('');
    setActive(-1);
  };
  const choose = async (index: number) => {
    try {
      if (matches[index]) toggle(matches[index]);
      else if (canCreate) toggle(await onCreate(clean));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section className="tags" aria-label="Tags">
      <input
        role="combobox"
        aria-label="Find or add a tag"
        aria-autocomplete="list"
        aria-expanded={!!clean}
        aria-controls={id}
        aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
        value={search}
        placeholder="Find or add a tag…"
        maxLength={80}
        autoComplete="off"
        enterKeyHint="done"
        onChange={(e) => {
          setSearch(e.target.value);
          setActive(-1);
        }}
        onBlur={() => {
          setSearch('');
          setActive(-1);
        }}
        onKeyDown={(e) => {
          const count = matches.length + (canCreate ? 1 : 0);
          if (e.key === 'Escape') {
            setSearch('');
            setActive(-1);
          }
          if (count && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            setActive((i) =>
              e.key === 'ArrowDown' ? (i + 1) % count : i <= 0 ? count - 1 : i - 1,
            );
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            if (active >= 0) void choose(active);
            else if (matches[0]?.canonical === makeCanonical(clean)) void choose(0);
          }
        }}
      />
      <div className="chips tag-row" role="group" aria-label="Selected and frequent tags">
        {selected.map((key) => (
          <button
            type="button"
            className="chip selected"
            aria-pressed="true"
            key={key}
            onClick={() => onChange(selected.filter((i) => i !== key))}
          >
            {tags.find((t) => t.id === key)?.label || key} <span aria-hidden>×</span>
          </button>
        ))}
        {!clean &&
          matches
            .filter((t) => !selected.includes(t.id))
            .map((t) => (
              <button
                type="button"
                className="chip"
                aria-pressed="false"
                key={t.id}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => toggle(t)}
              >
                {t.label}
              </button>
            ))}
      </div>
      <div
        id={id}
        className="suggestions"
        role="listbox"
        hidden={!clean}
        aria-label="Suggested tags"
      >
        {clean &&
          matches.map((t) => {
            const index = matches.indexOf(t);
            return (
              <button
                type="button"
                key={t.id}
                id={`${id}-${index}`}
                className="suggestion"
                role="option"
                aria-selected={selected.includes(t.id) || active === index}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => toggle(t)}
              >
                {t.label}
                {selected.includes(t.id) && ' ✓'}
              </button>
            );
          })}
        {canCreate && (
          <button
            type="button"
            role="option"
            aria-selected={active === matches.length}
            id={`${id}-${matches.length}`}
            className="suggestion create"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => void choose(matches.length)}
          >
            + Create “{clean}”
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
function makeCanonical(value: string) {
  try {
    return makeTag(value).canonical;
  } catch {
    return '';
  }
}
