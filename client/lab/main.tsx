// Design lab — a dev-only page (served at <base>/lab/ by the Vite dev server,
// never built) that shows "manga café" redesign concepts against the real
// Library. Nothing here is wired into the app; it's for looking and deciding.
import React, { useEffect, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { getLibrary, peekChapter, type LibrarySeries } from '../src/api.js';
import { appUrl } from '../src/app-url.js';
import './lab.css';

const proxyUrl = (url: string) => `${appUrl('api/image')}?url=${encodeURIComponent(url)}`;

interface ShelfItem {
  key: string;
  title: string;
  cover?: string;
  done: number;
  total: number;
  resume: string;
  resumeShort: string;
  lastRead: Date;
}

const shortChapter = (title: string) => {
  const match = /chapter[\s-]*([\d.]+)/i.exec(title);
  return match ? `Ch. ${match[1]}` : title;
};

const toItem = (series: LibrarySeries, cover?: string): ShelfItem => {
  const resume = series.chapters.find((chapter) => chapter.url === series.resumeChapterUrl)?.title
    ?? shortChapter(series.resumeChapterUrl);
  return {
    key: series.key,
    title: series.title,
    cover,
    done: series.chapters.filter((chapter) => chapter.completed).length,
    total: series.chapters.length,
    resume,
    resumeShort: shortChapter(resume),
    lastRead: new Date(series.lastReadAt)
  };
};

const sampleShelf: ShelfItem[] = [
  { key: 'a', title: 'Witch Hat Atelier', done: 7, total: 8, resume: 'Chapter 98', resumeShort: 'Ch. 98', lastRead: new Date() },
  { key: 'b', title: 'Fuufu Ijou, Koibito Miman', done: 1, total: 2, resume: 'Chapter 2', resumeShort: 'Ch. 2', lastRead: new Date() },
  { key: 'c', title: 'Jujutsu Kaisen Modulo', done: 3, total: 4, resume: 'Chapter 4', resumeShort: 'Ch. 4', lastRead: new Date() }
];

type Source = 'loading' | 'live' | 'sample';

// Real Library + two real Pages from the most recent Series' Resume Chapter,
// falling back to sample data when the API isn't reachable.
function useLabData() {
  const [shelf, setShelf] = useState<ShelfItem[]>([]);
  const [pages, setPages] = useState<string[]>([]);
  const [source, setSource] = useState<Source>('loading');
  useEffect(() => {
    let current = true;
    let loaded = false;
    void (async () => {
      try {
        const library = await getLibrary();
        if (!library.series.length) throw new Error('empty');
        const series = [...library.series].sort((a, b) => b.lastReadAt.localeCompare(a.lastReadAt));
        if (!current) return;
        setShelf(series.map((entry) => toItem(entry, entry.coverPageUrl)));
        setSource('live');
        loaded = true;
        for (const entry of series) {
          if (entry.coverPageUrl) continue;
          void peekChapter(entry.chapters[0]?.url ?? entry.resumeChapterUrl).then((payload) => {
            const first = payload.chapter.pages[0]?.url;
            if (current && first) setShelf((items) => items.map((item) => item.key === entry.key ? { ...item, cover: first } : item));
          }).catch(() => undefined);
        }
        const payload = await peekChapter(series[0].resumeChapterUrl);
        const portrait = payload.chapter.pages.filter((page) => !page.width || !page.height || page.height > page.width);
        const pick = portrait.slice(2, 4).length === 2 ? portrait.slice(2, 4) : portrait.slice(0, 2);
        if (current) setPages(pick.map((page) => page.url));
      } catch {
        if (current && !loaded) { setShelf(sampleShelf); setSource('sample'); }
      }
    })();
    return () => { current = false; };
  }, []);
  return { shelf, pages, source };
}

const hashHue = (text: string) => {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
};

function Cover({ item, className = '' }: { item: ShelfItem; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!item.cover || broken) {
    const hue = hashHue(item.title);
    return <div className={`lab-cover lab-cover-fallback ${className}`} role="img" aria-label={item.title}
      style={{ '--hue': hue } as CSSProperties}><span>{item.title}</span></div>;
  }
  return <img className={`lab-cover ${className}`} src={proxyUrl(item.cover)} alt={item.title} onError={() => setBroken(true)} />;
}

// Right-to-left: the first Page sits on the right.
function Spread({ pages, fallback }: { pages: string[]; fallback: ShelfItem[] }) {
  if (pages.length === 2) {
    return <div className="lab-spread">
      <img src={proxyUrl(pages[1])} alt="Left page" />
      <img src={proxyUrl(pages[0])} alt="Right page" />
    </div>;
  }
  return <div className="lab-spread">
    {fallback.slice(0, 2).reverse().map((item) => <Cover key={item.key} item={item} />)}
  </div>;
}

function Filmstrip({ className, count = 11, current = 4 }: { className: string; count?: number; current?: number }) {
  return <div className={className} aria-hidden="true">
    {Array.from({ length: count }, (_, index) => <span key={index} className={index === current ? 'is-current' : index < current ? 'is-read' : ''} />)}
  </div>;
}

function Stamps({ item, className }: { item: ShelfItem; className: string }) {
  return <ol className={className} aria-label={`${item.done} of ${item.total} chapters read`}>
    {Array.from({ length: Math.max(item.total, 10) }, (_, index) =>
      <li key={index} className={index < item.done ? 'is-stamped' : ''} style={{ '--tilt': `${(hashHue(item.key + index) % 24) - 12}deg` } as CSSProperties} />)}
  </ol>;
}

/* ── Concept 1 · Night Kissaten ─────────────────────────────── */

function Kissaten({ shelf, pages }: { shelf: ShelfItem[]; pages: string[] }) {
  const [lamp, setLamp] = useState(60);
  const usual = shelf[0];
  const rows = [shelf.slice(0, 4), shelf.slice(4, 8)].filter((row) => row.length);
  return <div className="ks">
    <header className="ks-sign">
      <div className="ks-pendant" aria-hidden="true"><span /></div>
      <p className="ks-kana">喫茶 ねみる</p>
      <h1>Kissa Nemiru</h1>
      <p className="ks-hours">open late · refills on the house</p>
      <form className="ks-order" onSubmit={(event) => event.preventDefault()}>
        <input type="url" aria-label="Chapter URL" placeholder="Order a new chapter — paste its URL" />
        <button type="submit">Order</button>
      </form>
    </header>

    {usual && <section className="ks-usual" aria-label="Resume">
      <div className="ks-ticket">
        <p className="ks-ticket-head"><span>No. 0042</span><span>{usual.lastRead.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></p>
        <p className="ks-ticket-label">Your usual</p>
        <div className="ks-ticket-body">
          <Cover item={usual} className="ks-ticket-cover" />
          <div>
            <h2>{usual.title}</h2>
            <p className="ks-ticket-line"><span>1 × {usual.resumeShort}</span><span>served warm</span></p>
            <p className="ks-ticket-line"><span>{usual.done} chapters so far</span><span>¥0</span></p>
            <button type="button">Serve it ☕</button>
          </div>
        </div>
      </div>
      <div className="ks-stampcard">
        <p className="ks-stampcard-head">Stamp card <small>one cup per finished chapter</small></p>
        <Stamps item={usual} className="ks-stamps" />
        <p className="ks-stampcard-foot">{Math.max(10 - usual.done, 0) || 'Full card!'} {usual.done < 10 ? 'more for a free dessert' : '— a dessert on us 🍮'}</p>
      </div>
    </section>}

    <section className="ks-shelves" aria-label="Shelf">
      <h2 className="ks-section-title">On the shelf</h2>
      {rows.map((row, index) => <div key={index} className="ks-shelf-row">
        {row.map((item) => <button key={item.key} type="button" className="ks-book">
          <Cover item={item} />
          <span className="ks-tag">{item.resumeShort} next</span>
        </button>)}
        <div className="ks-plank" aria-hidden="true" />
      </div>)}
    </section>

    <section className="ks-room" aria-label="Reader">
      <h2 className="ks-section-title">The reading room</h2>
      <div className="ks-reader" style={{ '--lamp': lamp / 100 } as CSSProperties}>
        <div className="ks-rail">
          <span className="ks-rail-back">← Shelf</span>
          <span className="ks-rail-title">{usual?.title} · <em>{usual?.resumeShort}</em></span>
          <label className="ks-dimmer">
            <span aria-hidden="true">🕯</span>
            <input type="range" min={10} max={100} value={lamp} onChange={(event) => setLamp(Number(event.target.value))} aria-label="Lamp brightness" />
          </label>
        </div>
        <div className="ks-stage"><Spread pages={pages} fallback={shelf} /></div>
        <Filmstrip className="ks-coasters" />
      </div>
      <p className="lab-note">Try the lamp dimmer — it warms and dims the room around the pages, never the pages themselves.</p>
    </section>

    <section className="ks-end-wrap" aria-label="End of chapter">
      <div className="ks-end">
        <p className="ks-kana">おかわり？</p>
        <h2>That was {usual?.resumeShort}. Another cup?</h2>
        <p>The next chapter is already brewing — it'll be ready by the time you turn the page.</p>
        <div className="ks-end-actions">
          <button type="button">Refill — next chapter</button>
          <button type="button" className="ks-quiet">Back to the shelf</button>
        </div>
      </div>
    </section>
  </div>;
}

/* ── Concept 2 · Private Booth ──────────────────────────────── */

function Booth({ shelf, pages }: { shelf: ShelfItem[]; pages: string[] }) {
  const chaptersRead = shelf.reduce((sum, item) => sum + item.done, 0);
  const since = shelf.length ? new Date(Math.min(...shelf.map((item) => item.lastRead.getTime()))) : new Date();
  const first = shelf[0];
  return <div className="bt">
    <header className="bt-noren">
      <div className="bt-curtain" aria-hidden="true">
        {['漫', '画', '喫', '茶'].map((glyph) => <span key={glyph}>{glyph}</span>)}
      </div>
      <p className="bt-sub">Manga Kissa · 24h · quiet floor</p>
    </header>

    <section className="bt-reception" aria-label="Reception">
      <div className="bt-member">
        <p className="bt-member-brand">MEMBER'S CARD <span>会員証</span></p>
        <p className="bt-member-no">No. 0001</p>
        <dl>
          <div><dt>Booths</dt><dd>{shelf.length}</dd></div>
          <div><dt>Chapters read</dt><dd>{chaptersRead}</dd></div>
          <div><dt>Regular since</dt><dd>{since.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</dd></div>
        </dl>
        <div className="bt-member-strip" aria-hidden="true" />
      </div>
      <form className="bt-checkin" onSubmit={(event) => event.preventDefault()}>
        <p className="bt-checkin-head">Check in</p>
        <p className="bt-checkin-hint">Paste a chapter URL and we'll open a booth for it.</p>
        <input type="url" aria-label="Chapter URL" placeholder="https://…" />
        <button type="submit">Get a booth ticket</button>
      </form>
    </section>

    <section aria-label="Booths">
      <h2 className="bt-section-title">Your booths <span>個室</span></h2>
      <div className="bt-booths">
        {shelf.map((item, index) => {
          const finished = item.total > 0 && item.done === item.total;
          return <button key={item.key} type="button" className="bt-booth">
            <span className="bt-plate">{String(index + 1).padStart(2, '0')}</span>
            <span className={`bt-lamp ${finished ? 'is-free' : 'is-busy'}`}>{finished ? 'caught up' : 'reading'}</span>
            <div className="bt-door"><Cover item={item} /></div>
            <span className="bt-booth-title">{item.title}</span>
            <span className="bt-booth-meta">{item.resumeShort} · {item.done}/{item.total} read</span>
          </button>;
        })}
      </div>
    </section>

    <section aria-label="Reader">
      <h2 className="bt-section-title">Inside the booth <span>読書中</span></h2>
      <div className="bt-reader">
        <div className="bt-wall bt-wall-left" aria-hidden="true" />
        <div className="bt-wall bt-wall-right" aria-hidden="true" />
        <span className="bt-doortag">Booth 01 · reading · do not disturb</span>
        <div className="bt-stage"><Spread pages={pages} fallback={shelf} /></div>
        <div className="bt-desk" aria-hidden="true">
          <span className="bt-cup" />
          <Filmstrip className="bt-strip" />
          <span className="bt-clock">{first?.resumeShort} · 5 / 11</span>
        </div>
      </div>
      <p className="lab-note">Chrome lives on the desk edge; the side partitions frame the spread so the screen edge disappears.</p>
    </section>

    <section aria-label="End of chapter">
      <div className="bt-drinkbar">
        <p className="bt-drinkbar-head">Drink bar <span>ドリンクバー</span></p>
        <h2>Chapter finished. What'll it be?</h2>
        <div className="bt-drinks">
          <button type="button"><span className="bt-drink bt-drink-melon" />Refill<small>next chapter</small></button>
          <button type="button"><span className="bt-drink bt-drink-tea" />Another sip<small>reread this one</small></button>
          <button type="button"><span className="bt-drink bt-drink-cola" />Stretch legs<small>back to lobby</small></button>
        </div>
      </div>
    </section>
  </div>;
}

/* ── Concept 3 · Sunday Morning ─────────────────────────────── */

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 5) return ['Still up?', '夜更かし'];
  if (hour < 12) return ['Good morning.', 'おはよう'];
  if (hour < 18) return ['Slow afternoon.', 'こんにちは'];
  return ['Evening, reader.', 'こんばんは'];
};

function Morning({ shelf, pages }: { shelf: ShelfItem[]; pages: string[] }) {
  const [hello, kana] = greeting();
  const pick = shelf[0];
  return <div className="mn">
    <div className="mn-light" aria-hidden="true" />
    <header className="mn-head">
      <div>
        <p className="mn-kana">{kana}</p>
        <h1>{hello}</h1>
        <p className="mn-lede">Pull up a chair — your table is by the window.</p>
        <form className="mn-paste" onSubmit={(event) => event.preventDefault()}>
          <input type="url" aria-label="Chapter URL" placeholder="Leave a chapter URL on the counter…" />
          <button type="submit">Bring it over</button>
        </form>
      </div>
      {pick && <aside className="mn-board" aria-label="Today's pick">
        <p className="mn-board-kana">本日のおすすめ</p>
        <p className="mn-board-title">Today's pick</p>
        <p className="mn-board-name">{pick.title}</p>
        <p className="mn-board-line">{pick.resumeShort} ~ fresh, where you left off</p>
        <p className="mn-board-price">♡ on the house</p>
        <div className="mn-board-legs" aria-hidden="true"><span /><span /></div>
      </aside>}
    </header>

    <section className="mn-table" aria-label="Shelf">
      <h2 className="mn-section-title">On your table</h2>
      <div className="mn-books">
        {shelf.map((item, index) => <button key={item.key} type="button" className="mn-book"
          style={{ '--tilt': `${[-3, 2, -1.5, 3, -2.5][index % 5]}deg` } as CSSProperties}>
          {index === 0 && <span className="mn-tape" aria-hidden="true" />}
          <Cover item={item} />
          <span className="mn-book-title">{item.title}</span>
          <span className="mn-pencil" aria-hidden="true"><span style={{ width: `${item.total ? (item.done / item.total) * 100 : 0}%` }} /></span>
          <span className="mn-book-meta">{item.resumeShort} next · {item.done} read</span>
        </button>)}
      </div>
    </section>

    <section aria-label="Reader">
      <h2 className="mn-section-title">Reading by the window</h2>
      <div className="mn-reader">
        <div className="mn-reader-light" aria-hidden="true" />
        <div className="mn-pill"><span>← Table</span><strong>{pick?.title}</strong><span>{pick?.resumeShort} · 5 / 11</span></div>
        <div className="mn-stage"><Spread pages={pages} fallback={shelf} /></div>
        <Filmstrip className="mn-dots" />
      </div>
      <p className="lab-note">Sunlight drifts across the room (not the pages). Chrome is one floating pill that fades while you read.</p>
    </section>

    <section className="mn-end-wrap" aria-label="End of chapter">
      <div className="mn-note">
        <p className="mn-note-kana">おつかれさま ✿</p>
        <h2>{pick?.resumeShort} finished.</h2>
        <p>The next one is already on the table, face down. Flip it over whenever you like.</p>
        <div className="mn-note-actions">
          <button type="button">Flip it over →</button>
          <button type="button" className="mn-quiet">Maybe later</button>
        </div>
      </div>
    </section>
  </div>;
}

/* ── The menu of ideas ──────────────────────────────────────── */

const ideas: { name: string; kana: string; blurb: string; where: string }[] = [
  { name: 'The usual', kana: 'いつもの', blurb: 'Landing leads with the Series you read last, as an order ticket — one tap to resume.', where: 'Kissaten' },
  { name: 'Stamp card', kana: 'スタンプカード', blurb: 'Each finished Chapter stamps a cup. A full card is just a little celebration.', where: 'Kissaten' },
  { name: 'Lamp dimmer', kana: '照明', blurb: 'Dims and warms the room around the Spread for late-night reading; pages stay true.', where: 'Kissaten' },
  { name: 'Booths', kana: '個室', blurb: 'Each Series is a numbered booth with a status lamp — reading, or caught up.', where: 'Booth' },
  { name: "Member's card", kana: '会員証', blurb: 'Quiet stats — chapters read, regular since — instead of dashboards.', where: 'Booth' },
  { name: 'Drink bar', kana: 'ドリンクバー', blurb: 'End-of-chapter choices as drinks: refill (next), another sip (reread), stretch legs.', where: 'Booth' },
  { name: 'Time-aware greeting', kana: 'あいさつ', blurb: 'The header greets you for the hour — morning, afternoon, or "still up?".', where: 'Morning' },
  { name: "Today's pick", kana: '本日のおすすめ', blurb: 'A chalkboard easel with your resume point, handwritten.', where: 'Morning' },
  { name: 'Pencil progress', kana: '鉛筆', blurb: 'Progress bars drawn as pencil lines under each book on the table.', where: 'Morning' },
  { name: 'Gentle chrome', kana: '静か', blurb: 'Reader controls collapse to a pill or a desk edge; the pages get the room.', where: 'All' }
];

function Menu() {
  return <div className="menu">
    <div className="menu-board">
      <p className="menu-kana">お品書き</p>
      <h1>Menu of ideas</h1>
      <p className="menu-lede">Mix and match — every item works with any of the three rooms.</p>
      <ul>
        {ideas.map((idea) => <li key={idea.name}>
          <div className="menu-row"><strong>{idea.name}</strong><span className="menu-dots" /><em>{idea.where}</em></div>
          <p><span className="menu-item-kana">{idea.kana}</span> {idea.blurb}</p>
        </li>)}
      </ul>
    </div>
  </div>;
}

/* ── Lab chrome ─────────────────────────────────────────────── */

const concepts = [
  { id: 'kissaten', label: 'Night Kissaten', kana: '喫茶', mood: 'walnut · amber lamp · cream paper' },
  { id: 'booth', label: 'Private Booth', kana: '個室', mood: 'tatami · noren indigo · drink bar' },
  { id: 'morning', label: 'Sunday Morning', kana: '朝', mood: 'washi · window light · matcha' },
  { id: 'menu', label: 'Menu of ideas', kana: '品', mood: 'every feature, à la carte' }
] as const;
type ConceptId = typeof concepts[number]['id'];

const readHash = (): ConceptId => {
  const id = location.hash.slice(1);
  return concepts.some((concept) => concept.id === id) ? id as ConceptId : 'kissaten';
};

function Lab() {
  const { shelf, pages, source } = useLabData();
  const [concept, setConcept] = useState<ConceptId>(readHash);
  useEffect(() => {
    const onHash = () => setConcept(readHash());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  const active = concepts.find((entry) => entry.id === concept)!;
  return <div className={`lab lab-${concept}`}>
    <nav className="lab-nav" aria-label="Concepts">
      <div className="lab-brand"><strong>Manga Café</strong> <span>design lab</span></div>
      <div className="lab-tabs">
        {concepts.map((entry) => <a key={entry.id} href={`#${entry.id}`} aria-current={entry.id === concept ? 'page' : undefined}>
          <span className="lab-tab-kana">{entry.kana}</span>{entry.label}
        </a>)}
      </div>
      <div className="lab-meta">
        <span className={`lab-source lab-source-${source}`}>{source === 'live' ? 'your library' : source === 'sample' ? 'sample data' : 'loading…'}</span>
        <span className="lab-live">live:{' '}
          {concepts.filter((entry) => entry.id !== 'menu').map((entry) =>
            <a key={entry.id} href={appUrl(`${entry.id}/`)}>{entry.kana}</a>)}
        </span>
        <a href={appUrl('')}>current app ↗</a>
      </div>
    </nav>
    <p className="lab-mood">{active.mood}</p>
    <main>
      {concept === 'kissaten' && <Kissaten shelf={shelf} pages={pages} />}
      {concept === 'booth' && <Booth shelf={shelf} pages={pages} />}
      {concept === 'morning' && <Morning shelf={shelf} pages={pages} />}
      {concept === 'menu' && <Menu />}
    </main>
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><Lab /></React.StrictMode>);
