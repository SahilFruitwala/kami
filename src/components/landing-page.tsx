import { Link } from "@tanstack/react-router";
import { ChevronDown, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ThemeToggle } from "@/components/theme-toggle.tsx";
import { KAMI_GLYPH } from "@/components/kami.tsx";
import { cn } from "@/lib/utils.ts";

// Keynote-style landing page. Every claim maps to a real capability in src/:
// capture (paste / link-only / manual paste / bookmarklet ?import=), ⌘K palette,
// reader (5 fonts, 7 sizes, 3 paper tones, TTS, scroll memory), three-ink
// highlights + vault CSV, journal (50k chars/day, micro-season label),
// shelves (movies/TV/books/wishlist, TMDB + Open Library), JSON/OPML/CSV export.
// Styles live under `.lp` in styles.css.

const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a), 0, 1);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const FILM_CAPTIONS = [
  { h: "A page, as the web serves it.", p: "Banners, pop-ups, a cookie prompt. Somewhere in there, an article." },
  { h: "Paste the link. KAMI does the rest.", p: "Ads and sidebars stay behind. Title, image, and reading time come along." },
  { h: "Set in type made for reading.", p: "Newsreader on Pale Washi, at a line length your eyes don't have to hunt." },
  { h: "Mark the line worth keeping.", p: "Highlight in Vermilion, Bamboo, or Sumi. Every slip goes to your vault." },
  { h: "Saved. Synced. Yours.", p: "It's in your library on every device, even if the original page disappears." },
] as const;

const MANIFESTO =
  "Tabs pile up. Links go stale. The good part gets buried under banners and pop-ups. KAMI keeps the words, remembers your place, and holds on to the *sentence* you'll want *later.*";

const READER_FACES = [
  { id: "newsreader", label: "Newsreader", family: '"Newsreader", Georgia, serif' },
  { id: "literata", label: "Literata", family: '"Literata", Georgia, serif' },
  { id: "source-serif", label: "Source Serif", family: '"Source Serif 4", Georgia, serif' },
  { id: "atkinson", label: "Atkinson", family: '"Atkinson Hyperlegible", system-ui, sans-serif' },
  { id: "figtree", label: "Figtree", family: '"Figtree", system-ui, sans-serif' },
] as const;
const READER_SIZES = [15, 17, 19, 21, 23, 26, 29] as const;
const PAPERS = [
  { id: "pale", label: "Pale Washi", swatch: "#f6f1e7" },
  { id: "aged", label: "Aged Rice Paper", swatch: "#ece2cf" },
  { id: "sumi", label: "Sumi Dark", swatch: "#1b1a19" },
] as const;

type Ink = "vermilion" | "bamboo" | "sumi";
const INKS: { id: Ink; label: string }[] = [
  { id: "vermilion", label: "Vermilion" },
  { id: "bamboo", label: "Bamboo" },
  { id: "sumi", label: "Sumi" },
];
const PASSAGE = [
  "Attention is the rarest and purest form of generosity.",
  "A good article needs very little from us.",
  "The trouble is everything around it.",
  "Read one thing all the way through, and you'll remember more than if you skimmed ten.",
  "Then write down the line that changed your mind.",
] as const;

const FAQS = [
  {
    q: "What can I save to KAMI?",
    a: "Public blog posts and X articles. Paste the URL for a clean copy with title, excerpt, hero image, word count, and reading time, or save link-only and fetch the copy later.",
  },
  {
    q: "What happens when a site blocks saving?",
    a: "Save link-only, paste the article text yourself, or use the bookmarklet. Your browser already has the page, so nothing is lost.",
  },
  {
    q: "Does it work offline?",
    a: "Saves land on your device first, so a dropped connection keeps working. Everything syncs to your account when you're back online.",
  },
  {
    q: "Can I get my data out?",
    a: "Anytime from Settings: library JSON, OPML for RSS readers, and vault CSV for highlights. JSON and OPML import back in too.",
  },
] as const;

// The 72 microseasons (kō), keyed by start date. Numbered from risshun (Feb 4).
const KO: [number, number, string, string][] = [
  [1, 5, "芹乃栄", "Parsley flourishes"], [1, 10, "水泉動", "Springs thaw"], [1, 15, "雉始雊", "Pheasants start to call"],
  [1, 20, "款冬華", "Butterburs bud"], [1, 25, "水沢腹堅", "Ice thickens on streams"], [1, 30, "鶏始乳", "Hens start laying eggs"],
  [2, 4, "東風解凍", "East wind melts the ice"], [2, 9, "黄鶯睍睆", "Bush warblers sing"], [2, 14, "魚上氷", "Fish emerge from the ice"],
  [2, 19, "土脉潤起", "Rain moistens the soil"], [2, 24, "霞始靆", "Mist starts to linger"], [3, 1, "草木萌動", "Grass sprouts, trees bud"],
  [3, 6, "蟄虫啓戸", "Hibernating insects surface"], [3, 11, "桃始笑", "First peach blossoms"], [3, 16, "菜虫化蝶", "Caterpillars become butterflies"],
  [3, 21, "雀始巣", "Sparrows start to nest"], [3, 26, "櫻始開", "First cherry blossoms"], [3, 31, "雷乃発声", "Distant thunder"],
  [4, 5, "玄鳥至", "Swallows return"], [4, 10, "鴻雁北", "Wild geese fly north"], [4, 15, "虹始見", "First rainbows"],
  [4, 20, "葭始生", "First reeds sprout"], [4, 25, "霜止出苗", "Last frost, rice seedlings grow"], [4, 30, "牡丹華", "Peonies bloom"],
  [5, 5, "蛙始鳴", "Frogs start singing"], [5, 10, "蚯蚓出", "Worms surface"], [5, 15, "竹笋生", "Bamboo shoots sprout"],
  [5, 21, "蚕起食桑", "Silkworms feast on mulberry"], [5, 26, "紅花栄", "Safflowers bloom"], [5, 31, "麦秋至", "Wheat ripens"],
  [6, 6, "螳螂生", "Praying mantises hatch"], [6, 11, "腐草為螢", "Fireflies fly"], [6, 16, "梅子黄", "Plums turn yellow"],
  [6, 21, "乃東枯", "Self-heal withers"], [6, 27, "菖蒲華", "Irises bloom"], [7, 2, "半夏生", "Crow-dipper sprouts"],
  [7, 7, "温風至", "Warm winds blow"], [7, 12, "蓮始開", "First lotus blossoms"], [7, 17, "鷹乃学習", "Hawks learn to fly"],
  [7, 23, "桐始結花", "Paulownia trees seed"], [7, 28, "土潤溽暑", "Earth is damp, air humid"], [8, 2, "大雨時行", "Great rains sometimes fall"],
  [8, 7, "涼風至", "Cool winds blow"], [8, 13, "寒蝉鳴", "Evening cicadas sing"], [8, 18, "蒙霧升降", "Thick fog descends"],
  [8, 23, "綿柎開", "Cotton flowers bloom"], [8, 28, "天地始粛", "Heat starts to die down"], [9, 2, "禾乃登", "Rice ripens"],
  [9, 8, "草露白", "Dew glistens white on grass"], [9, 13, "鶺鴒鳴", "Wagtails sing"], [9, 18, "玄鳥去", "Swallows leave"],
  [9, 23, "雷乃収声", "Thunder ceases"], [9, 28, "蟄虫坏戸", "Insects hole up underground"], [10, 3, "水始涸", "Farmers drain the fields"],
  [10, 8, "鴻雁来", "Wild geese return"], [10, 13, "菊花開", "Chrysanthemums bloom"], [10, 18, "蟋蟀在戸", "Crickets chirp around the door"],
  [10, 23, "霜始降", "First frost"], [10, 28, "霎時施", "Light rains sometimes fall"], [11, 2, "楓蔦黄", "Maple leaves and ivy turn yellow"],
  [11, 7, "山茶始開", "Camellias bloom"], [11, 12, "地始凍", "Land starts to freeze"], [11, 17, "金盞香", "Daffodils bloom"],
  [11, 22, "虹蔵不見", "Rainbows hide"], [11, 27, "朔風払葉", "North wind blows the leaves"], [12, 2, "橘始黄", "Tachibana citrus turns yellow"],
  [12, 7, "閉塞成冬", "Cold sets in, winter begins"], [12, 12, "熊蟄穴", "Bears start hibernating"], [12, 16, "鱖魚群", "Salmon swim upstream"],
  [12, 21, "乃東生", "Self-heal sprouts"], [12, 26, "麋角解", "Deer shed antlers"],
];

function microseason(d: Date) {
  const md = (d.getMonth() + 1) * 100 + d.getDate();
  let k = KO.length - 1;
  KO.forEach(([m, day], i) => {
    if (m * 100 + day <= md) k = i;
  });
  return { n: ((k + 66) % 72) + 1, jp: KO[k][2], en: KO[k][3] };
}

/** Fade-and-rise for elements that start below the fold. Above-the-fold content never hides. */
function useReveal() {
  useEffect(() => {
    if (reduceMotion()) return;
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.remove("lp-pending");
            io.unobserve(e.target);
          }
        }),
      { rootMargin: "0px 0px -8% 0px" },
    );
    document.querySelectorAll<HTMLElement>(".lp [data-reveal]").forEach((el) => {
      if (el.getBoundingClientRect().top > window.innerHeight) {
        el.classList.add("lp-pending");
        io.observe(el);
      }
    });
    return () => io.disconnect();
  }, []);
}

export function LandingPage() {
  useReveal();
  return (
    <div className="lp">
      <a href="#main" className="lp-skip">
        Skip to content
      </a>
      <ProductNav />
      <main id="main">
        <Hero />
        <DistillFilm />
        <Manifesto />
        <HighlightsRail />
        <ReaderStudio />
        <InkVault />
        <Bento />
        <Faq />
        <Finale />
      </main>
      <Footer />
    </div>
  );
}

function ProductNav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <header className={cn("lp-nav", open && "is-open")}>
      <div className="lp-wrap lp-nav-row">
        <Link to="/" className="lp-brand" aria-label="KAMI home">
          <span className="kami-hanko lp-seal-xs" lang="ja" aria-hidden="true">
            {KAMI_GLYPH}
          </span>
          <span translate="no">KAMI</span>
        </Link>
        <nav id="lp-links" aria-label="Sections" className="lp-links">
          <a href="#how" onClick={close}>How it works</a>
          <a href="#reader" onClick={close}>Reader</a>
          <a href="#inks" onClick={close}>Highlights</a>
          <a href="#more" onClick={close}>Shelves &amp; Journal</a>
          <Link to="/login/$" onClick={close}>Sign in</Link>
          <Link to="/sign-up/$" className="lp-pill lp-links-cta" onClick={close}>
            Get started
          </Link>
        </nav>
        <div className="lp-nav-tools">
          <ThemeToggle />
          <Link to="/sign-up/$" className="lp-pill lp-nav-cta">
            Get started
          </Link>
          <button
            type="button"
            className="lp-navtoggle"
            aria-expanded={open}
            aria-controls="lp-links"
            aria-label={open ? "Hide sections" : "Show sections"}
            onClick={() => setOpen((o) => !o)}
          >
            <ChevronDown className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="lp-hero lp-wrap" aria-labelledby="hero-heading">
      <p className="lp-eyebrow lp-rise">KAMI</p>
      <h1 id="hero-heading" className="lp-rise lp-d1">
        The reading list
        <br />
        you <span className="lp-sheen">finish.</span>
      </h1>
      <p className="lp-hero-sub lp-rise lp-d2">
        Save articles and X posts. Read them on a quiet page. Keep every line worth keeping.
      </p>
      <div className="lp-ctas lp-rise lp-d3">
        <Link to="/sign-up/$" className="lp-pill lp-pill-lg">
          Get started
        </Link>
        <a href="#how" className="lp-more">
          See how it reads
        </a>
      </div>
    </section>
  );
}

/** Signature moment: a cluttered page distills into the reader as you scroll. */
function DistillFilm() {
  const sectionRef = useRef<HTMLElement>(null);
  const winRef = useRef<HTMLDivElement>(null);
  const hlRef = useRef<HTMLElement>(null);
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const section = sectionRef.current;
    const win = winRef.current;
    const hl = hlRef.current;
    if (!section || !win || !hl) return;
    const noise = Array.from(win.querySelectorAll<HTMLElement>("[data-noise]"));
    let raf = 0;
    const tick = () => {
      raf = 0;
      const r = section.getBoundingClientRect();
      const total = section.offsetHeight - window.innerHeight;
      const p = total > 0 ? clamp(-r.top / total, 0, 1) : 1;
      noise.forEach((el) => {
        const k = Number(el.dataset.noise);
        el.style.setProperty("--t", String(easeInOut(seg(p, 0.1 + k * 0.06, 0.26 + k * 0.06))));
      });
      win.classList.toggle("is-clean", p >= 0.42);
      win.classList.toggle("is-saved", p >= 0.84);
      hl.style.setProperty("--hl", String(easeInOut(seg(p, 0.6, 0.74))));
      setStage(p < 0.12 ? 0 : p < 0.42 ? 1 : p < 0.6 ? 2 : p < 0.84 ? 3 : 4);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    tick();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      id="how"
      className="lp-film"
      aria-label="How KAMI turns a cluttered web page into a clean reading copy"
    >
      <div className="lp-film-stick">
        <div className="lp-captions" aria-live="polite">
          {FILM_CAPTIONS.map((c, i) => (
            <div key={c.h} className={cn("lp-cap", i === stage && "is-on")} aria-hidden={i !== stage}>
              <h2>{c.h}</h2>
              <p>{c.p}</p>
            </div>
          ))}
        </div>

        <div ref={winRef} className="lp-window" aria-hidden="true">
          <div className="lp-chrome">
            <b />
            <b />
            <b />
            <div className="lp-url">
              <span className="lp-url-orig">dailyscroll.example/longform/one-thing-all-the-way</span>
              <span className="lp-url-kami">
                <strong>KAMI</strong> · Reader
              </span>
            </div>
          </div>
          <div className="lp-page">
            <div className="lp-noise lp-n-hdr" data-noise="2">
              THE DAILY SCROLL <span>News</span>
              <span>Culture</span>
              <span>Tech</span>
              <em>Subscribe $1</em>
            </div>
            <div className="lp-noise lp-n-ad" data-noise="1">
              AD · 40% off mattresses this weekend only <small>Sponsored</small>
            </div>
            <article className="lp-art">
              <div className="lp-art-col">
                <div className="lp-kick">Essay</div>
                <h3>The case for reading one thing all the way through</h3>
                <div className="lp-meta">12 min read · 2,480 words</div>
                <p>
                  Most of what we save, we never open again. The link sits in a tab, then in a list,
                  then nowhere. The writing was fine. The page it lived on asked for everything
                  except attention.
                </p>
                <div className="lp-inline-ad">ADVERTISEMENT</div>
                <p>
                  A good article needs very little from us: a quiet column, a readable line, and
                  enough time to reach the end.{" "}
                  <mark ref={hlRef} className="lp-hl">
                    Everything else on the page is competing for your attention, and it usually
                    wins.
                  </mark>
                </p>
                <p>
                  So clear it away. Keep the words, keep your place, and keep the one sentence
                  you'll want next month.
                </p>
              </div>
              <div className="kami-hanko lp-film-seal" lang="ja">
                {KAMI_GLYPH}
              </div>
            </article>
            <aside className="lp-noise lp-n-side" data-noise="2">
              <h4>Trending now</h4>
              <div className="lp-n-row"><span />You won't believe what this kitchen gadget does</div>
              <div className="lp-n-row"><span />10 cities ranked by brunch</div>
              <div className="lp-n-row"><span />The quiz everyone is failing</div>
              <div className="lp-n-box">Advertisement</div>
            </aside>
          </div>
          <div className="lp-noise lp-n-scrim" data-noise="0" />
          <div className="lp-noise lp-n-modal" data-noise="0">
            <span className="lp-n-x">×</span>
            <strong>Don't miss a story</strong>
            Get the 6 a.m. newsletter, plus 3 partner offers.
            <div className="lp-n-field">you@email.com</div>
            <div className="lp-n-go">Sign me up</div>
          </div>
          <div className="lp-noise lp-n-cookie" data-noise="0">
            <p>We and our 847 partners use cookies to personalise ads and measure you.</p>
            <span>Accept all</span>
          </div>
          <div className="lp-film-toast">
            <i />
            Saved to Library
          </div>
        </div>

        <div className="lp-steps" aria-hidden="true">
          {FILM_CAPTIONS.map((c, i) => (
            <i key={c.h} className={cn(i === stage && "is-on")} />
          ))}
        </div>
      </div>
    </section>
  );
}

/** Words light up as the paragraph scrolls through the viewport. */
function Manifesto() {
  const ref = useRef<HTMLParagraphElement>(null);
  const words = MANIFESTO.split(" ");
  const [lit, setLit] = useState(words.length);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduceMotion()) return;
    let raf = 0;
    const tick = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const p = clamp((window.innerHeight * 0.85 - r.top) / (r.height + window.innerHeight * 0.35), 0, 1);
      setLit(Math.round(p * words.length));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    tick();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, [words.length]);

  return (
    <section className="lp-manifesto lp-wrap" aria-label="Why KAMI">
      <p ref={ref}>
        {words.map((w, i) => {
          const red = w.startsWith("*");
          return (
            <span key={i} className={cn("lp-w", red && "is-red", i < lit && "is-lit")}>
              {w.replace(/\*/g, "")}{" "}
            </span>
          );
        })}
      </p>
    </section>
  );
}

const LISTEN_LINE =
  "So clear it away. Keep the words, keep your place, and keep the one sentence you'll want next month.".split(" ");

function HighlightsRail() {
  const railRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [word, setWord] = useState(6);
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0]));
  const scrollTimer = useRef<number | undefined>(undefined);

  const CARD_COUNT = 6;

  const go = useCallback((i: number) => {
    const rail = railRef.current;
    const card = rail?.children[i] as HTMLElement | undefined;
    if (!rail || !card) return;
    rail.scrollTo({
      left: card.offsetLeft - (rail.clientWidth - card.offsetWidth) / 2,
      behavior: reduceMotion() ? "auto" : "smooth",
    });
    setIdx(i);
    setSeen((s) => new Set(s).add(i));
  }, []);

  useEffect(() => {
    if (reduceMotion()) setPaused(true);
    const rail = railRef.current;
    if (!rail) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.35 });
    io.observe(rail);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (paused || !visible) return;
    const t = window.setInterval(() => go((idx + 1) % CARD_COUNT), 5000);
    return () => window.clearInterval(t);
  }, [paused, visible, idx, go]);

  useEffect(() => {
    if (!visible || reduceMotion()) return;
    const t = window.setInterval(() => setWord((w) => (w + 1) % (LISTEN_LINE.length + 3)), 340);
    return () => window.clearInterval(t);
  }, [visible]);

  const onRailScroll = () => {
    window.clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(() => {
      const rail = railRef.current;
      if (!rail) return;
      const mid = rail.scrollLeft + rail.clientWidth / 2;
      let best = 0;
      let bd = Infinity;
      Array.from(rail.children).forEach((c, i) => {
        const el = c as HTMLElement;
        const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      setIdx(best);
      setSeen((s) => new Set(s).add(best));
    }, 90);
  };
  const stopAuto = () => setPaused(true);

  return (
    <section className="lp-highlights" aria-labelledby="hl-heading">
      <h2 id="hl-heading" className="lp-sec-h lp-wrap" data-reveal>
        Get the highlights.
      </h2>
      <div
        ref={railRef}
        className="lp-rail"
        tabIndex={0}
        aria-label="Feature highlights"
        onScroll={onRailScroll}
        onWheel={stopAuto}
        onTouchStart={stopAuto}
        onKeyDown={stopAuto}
      >
        <article className="lp-card">
          <p className="lp-card-t">
            Save from the page you're on.{" "}
            <span>The bookmarklet sends a clean copy, even where sites block servers.</span>
          </p>
          <div className="lp-card-v">
            <div className="lp-bm">
              <span>Docs</span>
              <span>Mail</span>
              <span>Maps</span>
              <span className="lp-bm-go">＋ Save to KAMI</span>
            </div>
            <div className="lp-mini-toast">
              <i />
              Saved · opening reader
            </div>
          </div>
        </article>
        <article className="lp-card">
          <p className="lp-card-t">
            Find anything with ⌘K. <span>Titles, excerpts, tags, and notes, searched as you type.</span>
          </p>
          <div className="lp-card-v">
            <div className="lp-palette">
              <div className="lp-palette-q">
                slow web<span className="lp-caret" />
                <kbd>esc</kbd>
              </div>
              <div className="lp-palette-r is-sel">
                The case for reading one thing… <small>Essay · 12 min</small>
              </div>
              <div className="lp-palette-r">
                Notes on the slow web <small>Tag · craft</small>
              </div>
              <div className="lp-palette-r">
                Folder: Long reads <small>34 saved</small>
              </div>
            </div>
          </div>
        </article>
        <article className="lp-card">
          <p className="lp-card-t">
            Three inks.{" "}
            <span>One for what you agree with, one to argue with, one to look up later. Your call.</span>
          </p>
          <div className="lp-card-v lp-inks">
            {INKS.map((ink) => (
              <div key={ink.id}>
                <b data-ink={ink.id} />
                {ink.label}
              </div>
            ))}
          </div>
        </article>
        <article className="lp-card">
          <p className="lp-card-t">
            Listen along. <span>System voices read aloud while each word lights up on the page.</span>
          </p>
          <div className="lp-card-v">
            <div className="lp-listen">
              {LISTEN_LINE.map((w, i) => (
                <span key={i}>
                  <span className={cn("lp-lw", i === word && "is-on")}>{w}</span>{" "}
                </span>
              ))}
            </div>
            <div className="lp-wave" aria-hidden="true">
              {Array.from({ length: 14 }, (_, i) => (
                <i key={i} />
              ))}
              <span>1.0× · System voice</span>
            </div>
          </div>
        </article>
        <article className={cn("lp-card", seen.has(4) && "is-seen")}>
          <p className="lp-card-t">
            Picks up where you left off.{" "}
            <span>Every article remembers your scroll position, on every device.</span>
          </p>
          <div className="lp-card-v lp-resume">
            <svg className="lp-ring" viewBox="0 0 100 100" aria-hidden="true">
              <circle className="lp-ring-bg" cx="50" cy="50" r="42" />
              <circle className="lp-ring-fg" cx="50" cy="50" r="42" />
            </svg>
            <div>
              <b>64%</b>
              <span>About 4 min left</span>
            </div>
          </div>
        </article>
        <article className="lp-card">
          <p className="lp-card-t">
            Shelves for everything else.{" "}
            <span>Films, series, and books, with TMDB and Open Library lookups.</span>
          </p>
          <div className="lp-card-v lp-spines">
            <div style={{ background: "#2f4a5c", height: "92%" }}>Perfect Days<small>Film</small></div>
            <div style={{ background: "#7a2d22", height: "100%" }}>Shōgun<small>Series</small></div>
            <div style={{ background: "#4c5a3f", height: "84%" }}>The Remains of the Day<small>Book</small></div>
            <div style={{ background: "#3a3836", height: "72%" }}>Kokoro<small>Book</small></div>
          </div>
        </article>
      </div>
      <div className={cn("lp-railbar", paused && "is-paused")}>
        <div className="lp-dots" role="group" aria-label="Choose a highlight">
          {Array.from({ length: CARD_COUNT }, (_, i) => (
            <button
              key={i}
              type="button"
              className={cn(i === idx && "is-on")}
              aria-label={`Highlight ${i + 1} of ${CARD_COUNT}`}
              aria-current={i === idx}
              onClick={() => go(i)}
            />
          ))}
        </div>
        <button
          type="button"
          className="lp-playbtn"
          aria-label={paused ? "Play the highlights" : "Pause the highlights"}
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? <Play className="size-3.5 fill-current" /> : <Pause className="size-3.5 fill-current" />}
        </button>
      </div>
    </section>
  );
}

function ReaderStudio() {
  const [face, setFace] = useState(0);
  const [size, setSize] = useState(2);
  const [paper, setPaper] = useState(0);
  const [swapKey, setSwapKey] = useState(0);

  return (
    <section className="lp-stage" id="reader" aria-labelledby="reader-heading">
      <div className="lp-wrap">
        <div className="lp-center" data-reveal>
          <p className="lp-eyebrow">Dokusho reader</p>
          <h2 id="reader-heading" className="lp-sec-h">
            Make the page yours.
            <br />
            Then forget it's there.
          </h2>
          <p className="lp-lede">
            <b>Five typefaces, seven sizes, three paper tones.</b> Each sheet keeps its own paper,
            independent of the app theme. Try it.
          </p>
        </div>
        <div className="lp-studio" data-reveal>
          <div
            className="lp-sheet"
            data-paper={PAPERS[paper].id}
            style={
              {
                "--rf": READER_FACES[face].family,
                "--rs": `${READER_SIZES[size]}px`,
              } as React.CSSProperties
            }
          >
            <div className="lp-sheet-kick">Essay · 12 min read</div>
            <div key={swapKey} className="lp-sheet-body">
              <h3>The case for reading one thing all the way through</h3>
              <p>
                A good article needs very little from us: a quiet column, a readable line, and
                enough time to reach the end.
              </p>
              <p>
                Everything else on the page is competing for your attention, and it usually wins.
                So clear it away. Keep the words, keep your place, and keep the one sentence you'll
                want next month.
              </p>
            </div>
          </div>
          <div className="lp-controls">
            <div>
              <span className="lp-ctl-lab" id="lp-lab-face">Typeface</span>
              <div className="lp-seg" role="group" aria-labelledby="lp-lab-face">
                {READER_FACES.map((f, i) => (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={i === face}
                    style={{ fontFamily: f.family }}
                    onClick={() => {
                      setFace(i);
                      setSwapKey((k) => k + 1);
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="lp-ctl-lab" id="lp-lab-size">Size</span>
              <div className="lp-stepper" role="group" aria-labelledby="lp-lab-size">
                <button type="button" aria-label="Smaller text" disabled={size === 0} onClick={() => setSize((s) => s - 1)}>
                  A
                </button>
                <div className="lp-ticks" aria-hidden="true">
                  {READER_SIZES.map((s, i) => (
                    <i key={s} className={cn(i === size && "is-on")} />
                  ))}
                </div>
                <button
                  type="button"
                  className="lp-big"
                  aria-label="Larger text"
                  disabled={size === READER_SIZES.length - 1}
                  onClick={() => setSize((s) => s + 1)}
                >
                  A
                </button>
              </div>
            </div>
            <div>
              <span className="lp-ctl-lab" id="lp-lab-paper">Paper</span>
              <div className="lp-swatches" role="group" aria-labelledby="lp-lab-paper">
                {PAPERS.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={i === paper}
                    aria-label={p.label}
                    style={{ background: p.swatch }}
                    onClick={() => setPaper(i)}
                  />
                ))}
              </div>
              <p className="lp-swname">{PAPERS[paper].label}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function InkVault() {
  const [ink, setInk] = useState<Ink>("vermilion");
  // sentence index → ink; order tracks most-recent first for the vault list
  const [marks, setMarks] = useState<{ i: number; ink: Ink }[]>([{ i: 1, ink: "vermilion" }]);

  const toggle = (i: number) =>
    setMarks((m) => (m.some((x) => x.i === i) ? m.filter((x) => x.i !== i) : [{ i, ink }, ...m]));
  const onKey = (e: KeyboardEvent<HTMLSpanElement>, i: number) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle(i);
    }
  };
  const inkOf = (i: number) => marks.find((x) => x.i === i)?.ink;

  return (
    <section className="lp-inksec lp-wrap" id="inks" aria-labelledby="ink-heading">
      <div className="lp-center" data-reveal>
        <h2 id="ink-heading" className="lp-sec-h">
          Three inks. One vault.
        </h2>
        <p className="lp-lede">
          Pick an ink, then tap a sentence. Every highlight lands in the vault with its source,
          ready to search or export as CSV.
        </p>
      </div>
      <div className="lp-inkgrid" data-reveal>
        <div className="lp-inkpad">
          <div className="lp-inkpick" role="group" aria-label="Ink">
            {INKS.map((x) => (
              <button key={x.id} type="button" aria-pressed={x.id === ink} onClick={() => setInk(x.id)}>
                <i data-ink={x.id} />
                {x.label}
              </button>
            ))}
          </div>
          <p className="lp-passage">
            {PASSAGE.map((s, i) => (
              <span key={s}>
                <span
                  role="button"
                  tabIndex={0}
                  aria-pressed={Boolean(inkOf(i))}
                  className="lp-s"
                  data-ink={inkOf(i)}
                  onClick={() => toggle(i)}
                  onKeyDown={(e) => onKey(e, i)}
                >
                  {s}
                </span>{" "}
              </span>
            ))}
          </p>
          <p className="lp-hint">Tap a highlighted sentence again to remove it.</p>
        </div>
        <div className="lp-vault">
          <h3>
            Vault <span>{marks.length} {marks.length === 1 ? "highlight" : "highlights"}</span>
          </h3>
          <ul>
            {marks.length === 0 ? (
              <li className="lp-empty">No highlights yet. Tap a sentence to add one.</li>
            ) : (
              marks.map((m) => (
                <li key={m.i} className="lp-slip" data-ink={m.ink}>
                  {PASSAGE[m.i]}
                  <small>
                    {INKS.find((x) => x.id === m.ink)?.label} · The case for reading one thing all the
                    way through
                  </small>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Bento() {
  const [today, setToday] = useState<{ date: string; n: number; jp: string; en: string } | null>(null);
  useEffect(() => {
    const d = new Date();
    setToday({
      date: d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }),
      ...microseason(d),
    });
  }, []);

  return (
    <section className="lp-bento lp-wrap" id="more" aria-labelledby="more-heading">
      <h2 id="more-heading" className="lp-sec-h lp-center" data-reveal>
        Beyond the reading list.
      </h2>
      <div className="lp-grid">
        <div className="lp-tile lp-tile-wide" data-reveal>
          <h3>Shelves for films, series, and books.</h3>
          <p>Track what you're watching down to the episode, what you've finished, and what you want next.</p>
          <div className="lp-shelfrow">
            <div className="lp-poster" style={{ background: "linear-gradient(160deg,#4f7186,#1f3340)" }}>
              <span>Watched</span>Perfect Days<small>Wenders · 2023</small>
            </div>
            <div className="lp-poster" style={{ background: "linear-gradient(160deg,#a5463a,#3d1612)" }}>
              <span>S1 · E6 of 10</span>Shōgun<small>FX · 2024</small>
            </div>
            <div className="lp-poster" style={{ background: "linear-gradient(160deg,#6c7a59,#2b3322)" }}>
              <span>Reading</span>The Remains of the Day<small>Ishiguro</small>
            </div>
            <div className="lp-poster" style={{ background: "linear-gradient(160deg,#5b5754,#1c1b1a)" }}>
              <span>Wishlist</span>Kokoro<small>Sōseki</small>
            </div>
          </div>
        </div>
        <div className="lp-tile" data-reveal>
          <h3>A page for every day.</h3>
          <p>A daily journal with room for 50,000 characters and the highlights that sparked them.</p>
          <div className="lp-jdate">{today?.date ?? "Today"}</div>
          <div className="lp-season">
            <b lang="ja">{today?.jp ?? "水始涸"}</b>
            <span>
              Microseason {today?.n ?? 48}
              <br />
              {today?.en ?? "Farmers drain the fields"}
            </span>
          </div>
        </div>
        <div className="lp-tile" data-reveal>
          <h3>Jump anywhere.</h3>
          <p>The command palette opens any article, folder, tag, or shelf from the keyboard.</p>
          <div className="lp-kbig" aria-hidden="true">⌘K</div>
        </div>
        <div className="lp-tile" data-reveal>
          <h3>Works on the train.</h3>
          <p>Saves land on your device first and sync when you're back online.</p>
          <div className="lp-train" aria-hidden="true">
            <span>Offline</span>
            <span className="lp-train-bar"><i /></span>
            <span>Synced</span>
          </div>
        </div>
        <div className="lp-tile" data-reveal>
          <h3>Take it all with you.</h3>
          <p>Export anytime. Import it back just as easily.</p>
          <div className="lp-exports">
            <span>library.json</span>
            <span>feeds.opml</span>
            <span>vault.csv</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section className="lp-faq lp-wrap" aria-labelledby="faq-heading">
      <h2 id="faq-heading" className="lp-sec-h lp-sec-h-sm" data-reveal>
        Questions, answered.
      </h2>
      <div className="lp-faq-list" data-reveal>
        {FAQS.map((f) => (
          <details key={f.q}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function Finale() {
  const sealRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const seal = sealRef.current;
    if (!seal || reduceMotion() || seal.getBoundingClientRect().top < window.innerHeight) return;
    seal.classList.add("is-waiting");
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          seal.classList.remove("is-waiting");
          seal.classList.add("is-stamped");
          io.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    io.observe(seal);
    return () => io.disconnect();
  }, []);

  return (
    <section className="lp-finale lp-wrap lp-center" aria-labelledby="fin-heading">
      <div ref={sealRef} className="kami-hanko lp-bigseal" lang="ja" aria-hidden="true">
        {KAMI_GLYPH}
      </div>
      <h2 id="fin-heading">Start your library.</h2>
      <p>Paste your first link and read it the way it was written.</p>
      <div className="lp-ctas">
        <Link to="/sign-up/$" className="lp-pill lp-pill-lg">
          Get started
        </Link>
        <Link to="/login/$" className="lp-more">
          I already have an account
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-wrap">
        <p>
          KAMI is a personal read-later library for articles, highlights, shelves, and a daily
          journal. 紙 (kami) means paper.
        </p>
        <p>Book, film, and series titles are shown as examples of shelf entries.</p>
        <nav aria-label="Footer">
          <span translate="no">KAMI</span>
          <a href="#how">How it works</a>
          <a href="#reader">Reader</a>
          <a href="#inks">Highlights</a>
          <a href="#more">Shelves &amp; Journal</a>
          <Link to="/login/$">Sign in</Link>
          <Link to="/sign-up/$">Get started</Link>
        </nav>
      </div>
    </footer>
  );
}
