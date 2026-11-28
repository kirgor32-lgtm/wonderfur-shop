import { useEffect, useMemo, useRef, useState, Fragment, lazy, Suspense } from 'react'
const PickupPicker = lazy(() => import('./PickupPicker').catch((e) => {
  // сайт обновили, пока страница была открыта: старого файла карты уже нет — перезагружаемся один раз
  try { if (!sessionStorage.getItem('wf-chunk-reload')) { sessionStorage.setItem('wf-chunk-reload', '1'); location.reload(); return new Promise(() => {}) } } catch {}
  throw e
}))
import {
  Search, ShoppingBag, Heart, User, Menu, X, Minus, Plus, ChevronRight, ChevronDown, Phone, Clock, LogOut, Package, Gift, Pencil,
  Drumstick, Scale, HeartPulse, ShieldCheck, Factory, BadgeCheck, Check, Trash2, Loader2, Send, Truck, Sparkles, Sprout, Cookie,
  BadgePercent,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ConsentField } from './ConsentField'
import { COOKIE_EDITION, CONSENT_EDITION, cookieChoice } from './privacy-choice.js'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { legal } from './legal.js'
import { StoreProvider, useStore, rub, fmtPhone } from './store'
import { RouterProvider, useRoute, Link } from './router'
import { myOrders, sendCode, checkCode, channelNames, findAccount, saveAccount, authLiveNow, messengerInfo, botLink, setPassword, isEmail, phoneFor, authConfig } from './auth'
import AuthFlow, { PassInput, CallBox } from './AuthFlow'
import { track, sendLead, crmEnabled, fetchOrderStatus } from './crm'
import { pickupPointDelivery } from './pickup.js'
import {
  BASE, contacts, seller, products, kinds, segments, searchHints, benefits, stats, checks, posts, contactTopics, faq, pages,
  productPath, minPrice, img, declaration, manufacturer, minAll, lineupAll, recipes,
} from './data'

const icons = { Drumstick, Scale, HeartPulse, ShieldCheck, Factory, BadgeCheck }
const inkBtn = 'h-11 rounded-full bg-ink px-5 text-sm font-medium text-white hover:bg-ink-2'
const ALL = { kind: 'all', age: 'all', q: '' }
const byId = (id) => products.find((p) => p.id === id)
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1)
const kg = (w) => { const m = String(w).trim().match(/^(\d+(?:[,.]\d+)?)\s*(кг|г)$/i); const n = m ? Number(m[1].replace(',', '.')) : 0; return Number.isFinite(n) && n > 0 ? n / (m[2].toLowerCase() === 'кг' ? 1 : 1000) : null }
const perKg = (v) => { const mass = kg(v.w); return mass === null ? null : Math.round(v.price / mass) }
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c }
const THANKS_PATH = 'spasibo/'
const IMG = { width: 240, height: 528 } // размеры фото упаковок (против сдвига вёрстки)

export default function App({ path = '' }) {
  return (
    <RouterProvider initialPath={path}>
      <StoreProvider>
        <Shell />
      </StoreProvider>
    </RouterProvider>
  )
}

function Shell() {
  const { route, navigate } = useRoute()
  const [filter, setFilter] = useState(ALL)
  const [topic, setTopic] = useState('pick')
  const nav = useMemo(() => ({
    show: (f) => { setFilter({ ...ALL, ...f }); navigate('', { hash: 'catalog' }) },
    contact: (t) => { if (t) setTopic(t); navigate(pages.contacts.path, { hash: 'form' }) },
  }), [navigate])
  let page
  switch (route.type) {
    case 'home': page = <Home filter={filter} setFilter={setFilter} nav={nav} topic={topic} setTopic={setTopic} />; break
    case 'kind': page = <KindPage kind={route.kind} />; break
    case 'segment': page = <SegmentPage id={route.seg} />; break
    case 'product': page = <ProductPage p={byId(route.id)} />; break
    case 'blog': page = <BlogPage />; break
    case 'post': page = <PostPage post={posts.find((x) => x.slug === route.slug)} />; break
    case 'page': page = <TextPage id={route.page} topic={topic} setTopic={setTopic} />; break
    case 'thanks': page = <ThanksPage nav={nav} />; break
    default: page = <NotFound />
  }
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3">К содержимому</a>
      <Header filter={filter} nav={nav} />
      <main id="main">{page}</main>
      <Footer nav={nav} />
      <Panels nav={nav} />
      <Messengers />
      <CookieBanner />
    </>
  )
}

/* ---------------- значки мессенджеров ---------------- */
function TgIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect width="24" height="24" rx="7" fill="#27a6e5" />
      <path d="M5.4 11.7l11.1-4.3c.5-.2 1 .1.8.9l-1.9 8.9c-.1.6-.5.8-1 .5l-2.8-2.1-1.4 1.3c-.2.2-.3.3-.6.3l.2-2.9 5.2-4.7c.2-.2 0-.3-.3-.1L8.3 13.6l-2.8-.9c-.6-.2-.6-.6.1-.9z" fill="#fff" />
    </svg>
  )
}
function MaxIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect width="24" height="24" rx="7" fill="#6a5cf6" />
      <path d="M12 5.5a6.5 6.5 0 0 0-5.6 9.8L5.6 18.4l3.2-.8A6.5 6.5 0 1 0 12 5.5z" fill="#fff" />
    </svg>
  )
}
function MessengerButtons({ className, stack }) {
  // кнопки всегда одной ширины: на телефоне — во всю ширину одна под другой, на компьютере — две равные колонки
  const c = 'flex h-11 w-full items-center gap-2 rounded-lg bg-gray-2 px-4 text-sm font-semibold transition hover:bg-gray-3/50 whitespace-nowrap'
  return (
    <div className={cn('@container', className)}>
    <div className={cn('grid gap-2', !stack && '@min-[440px]:w-fit @min-[440px]:grid-cols-2')}>
      <a href={contacts.telegram} target="_blank" rel="noopener nofollow" className={c}><TgIcon className="size-5" /> Написать в Telegram</a>
      <a href={contacts.max} target="_blank" rel="noopener nofollow" className={c}><MaxIcon className="size-5" /> Написать в Max</a>
    </div>
    </div>
  )
}

/* ---------------- логотип: тот же значок, что и иконка вкладки ---------------- */
function Logo({ light, onClick }) {
  return (
    <Link to="" onClick={onClick} className="flex shrink-0 flex-col items-start leading-none" aria-label="Wonderfur — на главную">
      <span className={cn('text-[16px] font-black uppercase tracking-[0.04em] min-[360px]:text-[18px] min-[400px]:text-[22px] sm:text-[28px]', light && 'text-white')}>Wonderfur</span>
      <span className={cn('mt-1 hidden text-[10px] font-medium uppercase tracking-[0.32em] sm:block', light ? 'text-white/60' : 'text-txt-2')}>корма для кошек и собак</span>
    </Link>
  )
}

/* ---------------- шапка ---------------- */
// подборка без товаров (всё удалили или скрыли в CRM) — ссылку не показываем, страницы у неё тоже нет
const segLink = (id, label) => (segments[id].count ? [[label, segments[id].path]] : [])
const mainNav = [
  ['кошкам', kinds.cat.path],
  ['собакам', kinds.dog.path],
  ...segLink('sterile', 'стерилизованным'),
  ...segLink('young', 'котятам и щенкам'),
  ['доставка и оплата', pages.delivery.path],
  ['о бренде', pages.about.path],
  ['блог', pages.blog.path],
  ['вопросы', pages.faq.path],
  ['контакты', pages.contacts.path],
]

function Header({ filter, nav }) {
  const st = useStore()
  return (
    <header className="sticky top-0 z-40 bg-white">
      {/* верхняя строка, как у «Золотого Яблока»: город, доставка, телефон */}
      <div className="bg-ink text-[14px] text-white max-[383px]:text-[13px] max-[359px]:text-[11.5px] sm:text-[13px]">
        <div className="wrap flex h-10 items-center justify-between gap-3 sm:h-9 sm:gap-4">
          <span className="truncate"><span className="whitespace-nowrap min-[400px]:hidden sm:hidden">Доставка в 5Post — 0 ₽</span><span className="hidden min-[400px]:inline sm:hidden">Бесплатная доставка в 5Post</span><span className="hidden sm:inline">Бесплатная доставка до пунктов 5Post по Санкт-Петербургу</span></span>
          <a href={contacts.phoneHref} className="shrink-0 whitespace-nowrap text-[15px] font-bold tracking-wide max-[383px]:text-[14px] max-[383px]:tracking-normal max-[359px]:text-[12.5px] hover:underline sm:text-[13px] sm:font-semibold sm:tracking-normal">{contacts.phone}<span className="hidden sm:inline"> · {contacts.hours}</span></a>
        </div>
      </div>
      <div className="wrap flex h-[64px] items-center gap-3 lg:h-[84px] lg:gap-6">
        <button className="-ml-2 flex size-11 items-center justify-center lg:hidden" onClick={() => st.setPanel('menu')} aria-label="Открыть меню"><Menu /></button>
        <Logo />
        <div className="hidden flex-1 lg:block"><SearchBox filter={filter} nav={nav} /></div>
        <div className="ml-auto flex items-center gap-0.5 lg:ml-0 lg:gap-2">
          <IconBtn label="избранное" n={st.fav.length} onClick={() => st.setPanel('fav')}><Heart /></IconBtn>
          <IconBtn label={st.user ? 'профиль' : 'войти'} dot={!!st.user} onClick={() => st.setPanel('profile')}><User /></IconBtn>
          <IconBtn label="корзина" n={st.count} onClick={() => st.setPanel('cart')}><ShoppingBag /></IconBtn>
        </div>
      </div>
      <div className="wrap pb-3 lg:hidden"><SearchBox filter={filter} nav={nav} /></div>
      {/* меню разделов — только на компьютере */}
      <nav aria-label="Разделы" className="border-b border-gray-2">
        <div className="wrap no-scrollbar hidden h-12 items-center gap-7 overflow-x-auto text-[15px] lg:flex">
          {mainNav.map(([l, to, f]) => to
            ? <Link key={l} to={to} className="whitespace-nowrap hover:opacity-60">{l}</Link>
            : <button key={l} onClick={() => nav.show(f)} className={cn('whitespace-nowrap hover:opacity-60')}>{l}</button>)}
        </div>
      </nav>
    </header>
  )
}

const matches = (p, f) => {
  const q = (f.q || '').trim().toLowerCase()
  const hay = `${p.line} ${p.code ? p.code + ' ' : ''}${p.name} ${p.taste} ${p.ageLabel} ${p.weights.map((w) => w.w).join(' ')}`.toLowerCase()
  const age = !f.age || f.age === 'all' || (f.age === 'kitten' ? p.kind === 'cat' && p.age === 'young' : f.age === 'puppy' ? p.kind === 'dog' && p.age === 'young' : p.age === f.age)
  return (!f.kind || f.kind === 'all' || p.kind === f.kind) && age && (!q || q.split(/\s+/).every((w) => hay.includes(w)))
}

function SearchBox({ filter, nav }) {
  const { navigate } = useRoute()
  const [text, setText] = useState(filter.q)
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(-1)
  const box = useRef(null)
  useEffect(() => setText(filter.q), [filter.q])
  useEffect(() => {
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])
  const q = text.trim().toLowerCase()
  const found = q ? products.filter((p) => matches(p, { q })).slice(0, 5) : []
  const hints = searchHints.filter((h) => !q || (h.includes(q) && h !== q)).slice(0, q ? 4 : 8)
  const options = [...found.map((p) => ({ t: 'p', p })), ...hints.map((h) => ({ t: 'h', h }))]
  const run = (value) => { nav.show({ q: value }); setOpen(false); setHi(-1) }
  const pick = (o) => { setOpen(false); setHi(-1); o.t === 'p' ? navigate(productPath(o.p)) : run(o.h) }
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(options.length - 1, h + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(-1, h - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); hi >= 0 && options[hi] ? pick(options[hi]) : run(text) }
    else if (e.key === 'Escape') setOpen(false)
  }
  return (
    <div ref={box} role="search" className="relative">
      <label className="flex h-11 items-center gap-3 rounded-full bg-gray-1 px-5 ring-ink focus-within:ring-1 lg:h-12">
        <Search className="size-5 shrink-0 text-txt-2" />
        <input value={text} onChange={(e) => { setText(e.target.value); setOpen(true); setHi(-1) }} onFocus={() => setOpen(true)} onKeyDown={onKey}
          type="search" role="combobox" aria-expanded={open} aria-controls="search-list" aria-autocomplete="list" aria-label="Поиск корма"
          placeholder="котята, утка, мелкие породы…" className="w-full min-w-0 bg-transparent text-[16px] outline-none placeholder:text-txt-2 sm:text-[15px] [&::-webkit-search-cancel-button]:hidden" />
        {text && <button type="button" onClick={() => setText('')} aria-label="Очистить"><X className="size-4 text-txt-2" /></button>}
      </label>
      {open && (
        <div id="search-list" role="listbox" className="absolute inset-x-0 top-[56px] z-50 overflow-hidden rounded-lg bg-white py-2 shadow-[0_12px_40px_rgba(46,44,56,.18)]">
          {q && !found.length && <div className="px-4 py-3 text-sm text-txt-2">Ничего не нашли по «{text}»</div>}
          {found.map((p, i) => (
            <button key={p.id} role="option" aria-selected={hi === i} onMouseEnter={() => setHi(i)} onClick={() => pick(options[i])}
              className={cn('flex w-full items-center gap-3 px-4 py-2 text-left', hi === i && 'bg-gray-1')}>
              <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-lg', p.bg)}><img src={img(p.id)} alt="" className="h-10 w-auto" /></span>
              <span className="min-w-0 flex-1 text-sm leading-snug"><b>{p.line}</b> <Mark text={p.name} q={q} /></span>
              <span className="shrink-0 text-sm font-bold">от {rub(minPrice(p))}</span>
            </button>
          ))}
          {!!hints.length && (
            <div className="px-4 pb-2 pt-3">
              <div className="mb-2 text-xs text-txt-2">{q ? 'Уточнить запрос' : 'Часто ищут'}</div>
              <div className="flex flex-wrap gap-2">
                {hints.map((h, j) => {
                  const i = found.length + j
                  return (
                    <button key={h} role="option" aria-selected={hi === i} onMouseEnter={() => setHi(i)} onClick={() => run(h)}
                      className={cn('rounded-full px-3 py-1.5 text-sm', hi === i ? 'bg-ink text-white' : 'bg-gray-1')}>
                      <Search className="mr-1 inline size-3.5" />{h}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Mark({ text, q }) {
  const w = q.split(/\s+/)[0]
  const i = w ? text.toLowerCase().indexOf(w) : -1
  if (i < 0) return text
  return <>{text.slice(0, i)}<mark className="bg-violet-soft">{text.slice(i, i + w.length)}</mark>{text.slice(i + w.length)}</>
}

function IconBtn({ children, label, n, dot, onClick }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="relative flex size-11 flex-col items-center justify-center gap-1 hover:opacity-60 lg:h-14 lg:w-16 [&_svg]:size-6 [&_svg]:stroke-[1.5]">
      {children}
      <span className="hidden text-[12px] leading-none lg:block">{label}</span>
      {!!n && <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1 text-[11px] font-semibold text-white lg:right-3 lg:top-0">{n}</span>}
      {dot && <span className="absolute right-2 top-2 size-2.5 rounded-full border-2 border-white bg-[#22c55e] lg:right-4 lg:top-1" />}
    </button>
  )
}

/* ---------------- общие куски ---------------- */
function SectionTitle({ children, sub, as: H = 'h2' }) {
  return (
    <div>
      <H className="text-balance text-[26px] font-semibold leading-[1.1] tracking-[-0.02em] md:text-[36px]">{children}</H>
      {sub && <p className="mt-3 max-w-[680px] text-[16px] text-txt-2">{sub}</p>}
    </div>
  )
}

function Crumbs({ items }) {
  return (
    <nav aria-label="Навигационная цепочка" className="wrap pt-5 text-sm text-txt-2">
      <ol className="flex flex-wrap items-center gap-1">
        <li><Link to="" className="inline-block py-1 hover:text-ink">Главная</Link></li>
        {items.map(([l, to], i) => (
          <li key={l} className="flex items-center gap-1">
            <ChevronRight className="size-3.5" />
            {i === items.length - 1 ? <span aria-current="page" className="text-ink">{l}</span> : <Link to={to} className="inline-block py-1 hover:text-ink">{l}</Link>}
          </li>
        ))}
      </ol>
    </nav>
  )
}

/* ---------------- главная ---------------- */
function Home({ filter, setFilter, nav, topic, setTopic }) {
  return (
    <>
      <Hero nav={nav} />
      <Catalog filter={filter} setFilter={setFilter} title="Ассортимент" />
      <Benefits />
      <Mission />
      <Checks />
      <BlogStrip />
      <Contacts topic={topic} setTopic={setTopic} />
      <FaqList limit={4} />
      <SeoText />
    </>
  )
}

function Hero({ nav }) {
  const st = useStore()
  return (
    <section className="wrap pt-4 lg:pt-6">
      <div className="relative min-h-[410px] overflow-hidden rounded-2xl bg-gray-1 sm:min-h-[480px] xl:min-h-[540px]">
        <picture className="absolute inset-0">
          <source media="(max-width: 639px)" srcSet={`${BASE}hero-wonderfur-mobile.webp`} />
          <img
            src={`${BASE}hero-wonderfur-desktop.webp`}
            alt="Упаковки кормов Wonderfur для кошек и собак"
            loading="eager"
            fetchPriority="high"
            className="size-full object-cover object-center"
          />
        </picture>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/95 via-white/65 to-transparent sm:bg-gradient-to-r sm:from-white/95 sm:via-white/65 sm:to-transparent" />
        <div className="relative z-10 max-w-[620px] p-5 sm:p-10 xl:p-16">
          <span className="kicker hidden text-txt-2 sm:inline">суперпремиум · Санкт-Петербург</span>
          <h1 className="text-balance text-[24px] font-semibold leading-[1.1] tracking-[-0.02em] sm:mt-4 sm:text-[44px] sm:leading-[1.05] sm:tracking-[-0.03em] xl:text-[64px]">Корма Wonderfur для кошек и собак</h1>
          <p className="mt-2 text-[14px] leading-snug text-txt-2 sm:hidden">{recipes(products.length)} · от {minAll} ₽ · доставка бесплатно</p>
          <p className="mt-4 hidden max-w-[460px] text-lg leading-snug text-txt-2 sm:block">
            {recipes(products.length)} с мясом до 46%: {lineupAll()}. От {minAll} ₽, доставка по Петербургу бесплатно.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-8 sm:flex sm:flex-wrap">
            <Link to={kinds.cat.path} className="flex h-11 items-center justify-center rounded-full bg-ink px-7 text-[15px] font-medium text-white hover:bg-ink-2 sm:h-12">кошкам</Link>
            <Link to={kinds.dog.path} className="flex h-11 items-center justify-center rounded-full bg-white px-7 text-[15px] font-medium hover:bg-gray-2 sm:h-12">собакам</Link>
          </div>
        </div>
      </div>
      <div className="no-scrollbar mt-6 grid grid-flow-col gap-3 overflow-x-auto md:grid-flow-row md:grid-cols-2 lg:grid-cols-4">
        {[
          ['бесплатная доставка', 'до пунктов 5Post', Truck, pages.delivery.path],
          ['подбор корма', 'по возрасту и весу', Sparkles, null, 'pick'],
          ['5% бонусами', 'с каждого заказа · 1 бонус = 1 ₽', Gift, null, 'bonus'],
          ['напишите нам', 'в Telegram и Max', Send, pages.contacts.path],
        ].map(([a, b, I, to, t]) => {
          const inner = (
            <>
              <I className="size-6 shrink-0 stroke-[1.5]" />
              <span className="flex-1"><span className="block text-[15px] font-medium">{a}</span><span className="text-sm text-txt-2">{b}</span></span>
              <ChevronRight className="size-5 text-txt-2" />
            </>
          )
          const cls = 'flex min-w-[230px] md:min-w-0 items-center gap-3 rounded-xl border border-gray-2 px-4 py-4 text-left transition-colors hover:border-ink'
          return to ? <Link key={a} to={to} className={cls}>{inner}</Link> : <button key={a} onClick={() => (t === 'bonus' ? st.setPanel('profile') : nav.contact(t))} className={cls}>{inner}</button>
        })}
      </div>
    </section>
  )
}

function Benefits() {
  return (
    <section className="wrap py-14">
      <SectionTitle>Почему Wonderfur</SectionTitle>
      <div className="mt-8 grid gap-3 md:grid-cols-3">
        {benefits.map((b) => {
          const I = icons[b.icon]
          return (
            <div key={b.title} className="rounded-2xl bg-gray-1 p-6 sm:p-8">
              <I className="size-8 stroke-[1.5]" />
              <h3 className="mt-6 text-xl font-semibold tracking-tight">{b.title}</h3>
              <p className="mt-2 text-[15px] text-txt-2">{b.text}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Catalog({ filter, setFilter, title, fixedKind, as }) {
  const list = useMemo(() => products.filter((p) => matches(p, { ...filter, kind: fixedKind || filter.kind })), [filter, fixedKind])
  const kind = fixedKind || filter.kind
  // «котятам» и «щенкам» — отдельные кнопки; показываем только подходящие к выбранному виду
  const ages = [['adult', 'взрослым'], ...(kind !== 'dog' ? [['kitten', 'котятам']] : []), ...(kind !== 'cat' ? [['puppy', 'щенкам']] : [])]
  const [sort, setSort] = useState('pop')
  const sorted = useMemo(() => sort === 'pop' ? list : [...list].sort((a, b) => sort === 'asc' ? minPrice(a) - minPrice(b) : minPrice(b) - minPrice(a)), [list, sort])
  const setKind = (v) => setFilter((f) => ({ ...f, kind: v, age: v === 'all' || (v === 'cat' && f.age === 'puppy') || (v === 'dog' && f.age === 'kitten') ? 'all' : f.age }))
  return (
    <section id="catalog" className="scroll-mt-44 py-14">
      <div className="wrap">
        {title && <SectionTitle as={as}>{title}</SectionTitle>}
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          {!fixedKind && <Pills label="Для кого" value={filter.kind} onChange={setKind} items={[['all', 'все корма'], ['cat', 'кошкам'], ['dog', 'собакам']]} />}
          {/* «все корма» — без деления по возрасту; повторный клик по возрасту снимает фильтр */}
          {kind !== 'all' && <Pills label="Возраст" small value={filter.age} onChange={(v) => setFilter((f) => ({ ...f, age: f.age === v ? 'all' : v }))} items={ages} />}
          <div className="ml-auto flex items-center gap-2 text-sm text-txt-2">
            <span>{list.length} {plural(list.length, 'товар', 'товара', 'товаров')} ·</span>
            <SortMenu value={sort} onChange={setSort} items={[['pop', 'по популярности'], ['asc', 'сначала дешевле'], ['desc', 'сначала дороже']]} />
          </div>
        </div>
        {filter.q && (
          <p className="mt-4 text-[15px]">
            По запросу «{filter.q}»: найдено {list.length}{' '}
            <button className="text-violet-dark underline" onClick={() => setFilter((f) => ({ ...f, q: '' }))}>сбросить</button>
          </p>
        )}
        <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {sorted.map((p) => <ProductCard key={p.id} p={p} />)}
          {!list.length && (
            <div className="col-span-2 rounded-lg bg-white p-8 text-txt-2">
              Ничего не нашли. <button className="text-violet-dark underline" onClick={() => setFilter(ALL)}>показать все корма</button>
            </div>
          )}
        </div>
        <p className="mt-6 text-xs text-txt-2">Цены указаны в рублях, НДС не облагается. Доставка до пунктов выдачи 5Post в Санкт-Петербурге — бесплатно.</p>
      </div>
    </section>
  )
}

// Фильтры — простые кнопки-переключатели (вкладки здесь не нужны: под ними нет отдельных панелей)
function SortMenu({ value, onChange, items }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const off = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', off)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', off); document.removeEventListener('keydown', esc) }
  }, [open])
  const cur = items.find(([v]) => v === value)?.[1]
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={`Сортировка: ${cur}`} onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-1.5 rounded-full bg-gray-1 pl-4 pr-3 font-medium text-ink transition-colors hover:bg-gray-2">
        {cur}<ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul role="listbox" aria-label="Сортировка" className="absolute right-0 top-full z-30 mt-2 min-w-full overflow-hidden rounded-2xl bg-white p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
          {items.map(([v, l]) => (
            <li key={v} role="option" aria-selected={v === value}>
              <button type="button" onClick={() => { onChange(v); setOpen(false) }}
                className={cn('flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm transition-colors',
                  v === value ? 'font-semibold text-ink' : 'text-txt-2 hover:bg-gray-1 hover:text-ink')}>
                {l}{v === value && <Check className="size-4" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Pills({ label, items, value, onChange, small }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {items.map(([v, l]) => (
        <button key={v} aria-pressed={value === v} onClick={() => onChange(v)}
          className={cn('rounded-full transition-colors', small ? 'h-9 px-4 text-sm' : 'h-10 px-5 text-[15px]',
            value === v ? 'bg-ink text-white' : 'bg-gray-1 text-ink hover:bg-gray-2')}>{l}</button>
      ))}
    </div>
  )
}

function ProductCard({ p }) {
  const st = useStore()
  const [vi, setVi] = useState(p.weights.length > 2 ? 1 : 0)
  const v = p.weights[vi]
  const qty = st.qtyOf(p.id, v.w)
  const faved = st.fav.includes(p.id)
  const compared = st.compare.includes(p.id)
  return (
    <article className="group flex flex-col">
      {/* серая плитка с фото — как в каталоге «Золотого Яблока» */}
      <div className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-xl bg-gray-1">
        <Link to={productPath(p)} className="flex h-full w-full items-center justify-center p-6 sm:p-8" tabIndex={-1} aria-hidden>
          <img src={img(p.id)} {...IMG} loading="lazy" alt={`${p.line} — ${p.short}, ${p.taste}`} className="h-full w-full object-contain mix-blend-multiply transition duration-300 group-hover:scale-105" />
        </Link>
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1 sm:left-3 sm:top-3">

        </div>
        <FavBtn faved={faved} onClick={() => st.toggleFav(p.id)} />
        {p.composition && (
          <button type="button" onClick={() => st.toggleCompare(p.id)} aria-pressed={compared}
            className={cn('absolute bottom-2 left-2 rounded-full px-3 py-1.5 text-[12px] font-medium transition sm:bottom-3 sm:left-3', compared ? 'bg-ink text-white' : 'bg-white/90 text-ink opacity-100 hover:bg-white lg:opacity-0 lg:group-hover:opacity-100')}>
            {compared ? '✓ в сравнении' : 'сравнить состав'}
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2">
        <span className="text-[17px] font-semibold sm:text-[19px]">{rub(v.price)}</span>
        {perKg(v) !== null && <span className="text-xs text-txt-2">{rub(perKg(v))}/кг</span>}
      </div>
      <h3 className="mt-1 text-[14px] leading-snug sm:text-[15px]">
        <Link to={productPath(p)} className="break-words hover:opacity-60">{p.catalogTitle || <><span className="font-bold uppercase tracking-wide">{p.line}</span> <span className="text-txt-2">{p.short}</span></>}</Link>
      </h3>
      {p.catalogIntro && <p className="mt-1 line-clamp-2 break-words text-xs leading-snug text-txt-2">{p.catalogIntro}</p>}
      <div className="mt-auto flex gap-1.5 pt-3" role="group" aria-label="Фасовка">
        {p.weights.map((w, i) => (
          <button key={w.w} onClick={() => setVi(i)} aria-pressed={i === vi} className={cn('h-8 min-w-0 flex-1 whitespace-nowrap rounded-full border px-1 text-[13px] sm:flex-none sm:px-3', i === vi ? 'border-ink bg-ink text-white' : 'border-gray-3 hover:border-ink')}>{w.w}</button>
        ))}
      </div>
      <div className="pt-3"><Buy p={p} v={v} qty={qty} /></div>
    </article>
  )
}

function Buy({ p, v, qty, big }) {
  const st = useStore()
  return qty ? (
    <div className={cn('flex items-center justify-between rounded-full bg-gray-1', big ? 'h-[52px]' : 'h-11')}>
      <button className="flex size-11 items-center justify-center" onClick={() => st.setQty(`${p.id}|${v.w}`, qty - 1)} aria-label="Меньше"><Minus className="size-4" /></button>
      <span className="text-sm font-semibold tabular-nums">{qty}</span>
      <button className="flex size-11 items-center justify-center" onClick={() => st.setQty(`${p.id}|${v.w}`, qty + 1)} aria-label="Больше"><Plus className="size-4" /></button>
    </div>
  ) : (
    <Button onClick={() => st.add(p, v)} className={cn(inkBtn, 'w-full gap-2', big ? 'h-[52px] text-base' : 'h-11')}><ShoppingBag className="size-4" /> в корзину</Button>
  )
}

function FavBtn({ faved, onClick, className }) {
  return (
    <button onClick={onClick} aria-label={faved ? 'Убрать из избранного' : 'В избранное'} aria-pressed={faved}
      className={cn('absolute right-1 top-1 flex size-10 items-center justify-center rounded-full hover:bg-white/70 sm:right-2 sm:top-2', className)}>
      <Heart className={cn('size-5 stroke-[1.5]', faved && 'fill-ink')} />
    </button>
  )
}

function Mission() {
  return (
    <section className="wrap py-14">
      <div className="grid overflow-hidden rounded-2xl bg-ink text-white md:grid-cols-[1.2fr_1fr]">
        <div className="p-8 md:p-14">
          <span className="kicker text-white/60">о бренде</span>
          <h2 className="mt-4 text-[28px] font-semibold leading-[1.08] tracking-[-0.02em] md:text-[42px]">Флагманский бренд завода КРОКЕТ</h2>
          <p className="mt-6 max-w-[520px] text-lg text-white/70">
            Сухие корма суперпремиум-класса. Мы продаём их в Петербурге и бесплатно привозим в пункты 5Post.
          </p>
          <Link to={pages.about.path} className="mt-8 inline-flex h-12 items-center gap-1 whitespace-nowrap rounded-full bg-white px-5 text-[15px] font-medium text-ink hover:bg-gray-2 sm:px-6 sm:text-base">о бренде и производителе <ChevronRight className="size-4" /></Link>
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-white/15 bg-white/15 md:border-l md:border-t-0">
          {stats.map(([n, l]) => (
            <div key={l} className="flex flex-col justify-center bg-ink p-6 [container-type:inline-size] md:p-8">
              <div className="whitespace-nowrap text-[min(22cqw,52px)] font-semibold leading-none tracking-[-0.04em]">{n}</div>
              <div className="mt-2 text-sm text-white/60">{l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Checks() {
  return (
    <section className="py-16">
      <div className="wrap">
        <SectionTitle>Что внутри линейки</SectionTitle>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {checks.map((c) => (
            <div key={c.n} className="rounded-2xl border border-gray-2 p-6">
              <div className="contour text-[44px]">{c.n}</div>
              <h3 className="mt-4 text-lg font-bold">{c.title}</h3>
              <p className="mt-1 text-[15px] text-txt-2">{c.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function PostCard({ p, H = 'h3' }) {
  const CardLink = p.dzenUrl ? 'a' : Link
  const destination = p.dzenUrl
    ? { href: p.dzenUrl, target: '_blank', rel: 'noopener' }
    : { to: `blog/${p.slug}/` }
  return (
    <CardLink {...destination} className="group flex min-w-[260px] flex-col rounded-2xl bg-white text-left lg:min-w-0">
      <div className={cn('flex h-[200px] items-center justify-center overflow-hidden rounded-2xl', p.tone)}>
        <img src={img(p.img)} {...IMG} loading="lazy" alt="" className="h-[160px] w-auto mix-blend-multiply transition group-hover:scale-105" />
      </div>
      <div className="flex flex-1 flex-col pt-4">
        <span className="w-fit rounded-full bg-gray-1 px-2.5 py-0.5 text-xs lowercase">{p.tag}</span>
        <H className="mt-3 text-lg font-bold leading-snug">{p.title}</H>
        <p className="mt-2 text-sm text-txt-2">{p.text}</p>
        
      </div>
    </CardLink>
  )
}

// Кнопка «Все статьи»: пока ведёт на страницу блога, когда появится канал в Дзене — укажите contacts.dzen
function AllPosts({ className }) {
  const cls = cn('inline-flex h-11 shrink-0 items-center gap-1 rounded-lg bg-gray-1 px-5 text-sm font-semibold transition-colors hover:bg-gray-2', className)
  const inner = <>Все статьи <ChevronRight className="size-4" /></>
  return contacts.dzen ? <a href={contacts.dzen} target="_blank" rel="noopener" className={cls}>{inner}</a> : <Link to={pages.blog.path} className={cls}>{inner}</Link>
}

function BlogStrip() {
  return (
    <section className="wrap py-16">
      <div className="flex items-end justify-between gap-4">
        <SectionTitle>Блог о питании</SectionTitle>
        <AllPosts className="hidden sm:inline-flex" />
      </div>
      <div className="no-scrollbar mt-8 grid grid-flow-col gap-4 overflow-x-auto pb-2 lg:grid-flow-row lg:grid-cols-4">
        {posts.map((p) => <PostCard key={p.slug} p={p} />)}
      </div>
      <AllPosts className="mt-4 w-full justify-center sm:hidden" />
    </section>
  )
}

/* ---------------- формы ---------------- */
function LeadForm({ topic, compact, onSubmit, cta = 'Отправить', doneText }) {
  const st = useStore()
  const { navigate } = useRoute()
  // галочка согласия НЕ стоит заранее — согласие должно быть активным действием (152-ФЗ)
  const [f, setF] = useState({ name: st.user?.name || '', phone: st.user?.phone || '', msg: '', ok: false })
  const [err, setErr] = useState({})
  const [state, setState] = useState('form')
  const sending = useRef(false) // защита от двойного нажатия: второй заказ не уйдёт
  const submit = (e) => {
    e.preventDefault()
    if (sending.current) return
    const er = {}
    if (f.name.trim().length < 2) er.name = 'Введите имя'
    if (f.phone.replace(/\D/g, '').length !== 11) er.phone = 'Введите телефон полностью'
    if (!f.ok) er.ok = 'нужно согласие'
    setErr(er)
    if (Object.keys(er).length) return
    sending.current = true
    setState('send')
    setTimeout(() => {
      if (onSubmit) onSubmit({ name: f.name.trim(), phone: f.phone })
      else {
        sendLead({ name: f.name.trim(), phone: f.phone, topic, msg: f.msg.trim(), consent: CONSENT_EDITION }) // заявка → CRM
        try { sessionStorage.setItem(THANKS_KEY, JSON.stringify({ type: 'lead', name: f.name.trim(), text: doneText || '' })) } catch {}
        sending.current = false
        return navigate(THANKS_PATH)
      }
      setState('done')
    }, 700)
  }
  if (state === 'done')
    return (
      <div className="rounded-lg bg-white p-8 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-violet-dark text-white"><Check className="size-7" /></div>
        <h3 className="mt-4 text-2xl font-extrabold">Спасибо, {f.name.trim()}!</h3>
        <p className="mt-2 text-txt-2">{doneText || 'Спасибо, скоро ответим.'}</p>
      </div>
    )
  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field err={err.name} label="Имя"><Input autoComplete="name" placeholder="Имя" maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-invalid={!!err.name} className="h-12 rounded-lg bg-white text-[16px]" /></Field>
        <Field err={err.phone} label="Телефон"><Input type="tel" autoComplete="tel" placeholder="Телефон" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: fmtPhone(e.target.value) })} aria-invalid={!!err.phone} className="h-12 rounded-lg bg-white text-[16px]" /></Field>
      </div>
      {!compact && <Textarea aria-label="Сообщение" placeholder={topic === 'order' ? 'Номер заказа и что случилось' : 'Сообщение (необязательно)'} value={f.msg} onChange={(e) => setF({ ...f, msg: e.target.value })} className="min-h-24 rounded-lg bg-white text-[16px]" />}
      <ConsentField checked={f.ok} onChange={(ok) => setF({ ...f, ok })} error={err.ok && "Отметьте согласие, чтобы отправить обращение"} />
      <Button type="submit" disabled={state === 'send'} className={cn(inkBtn, 'h-12 w-full sm:w-auto sm:px-10')}>
        {state === 'send' ? <Loader2 className="animate-spin" /> : <><Send className="size-4" />{cta}</>}
      </Button>
    </form>
  )
}

function Field({ err, label, children }) {
  return <label className="block"><span className="sr-only">{label}</span>{children}{err && <span className="mt-1 block text-xs text-destructive">{err}</span>}</label>
}

function Contacts({ topic, setTopic, as = 'h2', title = 'Связаться с нами' }) {
  return (
    <section id="form" className="scroll-mt-44 py-16">
      <div className="wrap">
        <SectionTitle as={as}>{title}</SectionTitle>
        <Tabs value={topic} onValueChange={setTopic} className="mt-6 gap-6">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0 group-data-horizontal/tabs:h-auto">
            {contactTopics.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="h-10 flex-none rounded-full border-0 bg-white px-5 text-[15px] text-ink shadow-none data-[state=active]:bg-violet-dark data-[state=active]:text-white">{t.label}</TabsTrigger>
            ))}
          </TabsList>
          {/* все вкладки лежат друг на друге: блок всегда высотой с самую большую, при переключении ничего не прыгает */}
          <div className="grid">
          {contactTopics.map((t) => (
            <TabsContent key={t.id} value={t.id} forceMount inert={t.id !== topic} className={cn('[grid-area:1/1] mt-0', t.id !== topic && 'invisible')}>
              <div className="grid gap-8 md:grid-cols-[1fr_1.3fr] md:gap-10">
                <div>
                  {/* тексты всех вкладок в одной ячейке: высота = самый длинный, кнопки ниже не скачут */}
                  <div className="grid">
                    {contactTopics.map((o) => {
                      const on = o.id === t.id
                      const H = on ? 'h3' : 'div'
                      return (
                        <div key={o.id} aria-hidden={!on} className={cn('[grid-area:1/1]', !on && 'invisible')}>
                          <H className="text-2xl font-extrabold">{cap(o.label)}</H>
                          <p className="mt-3 text-[17px] leading-relaxed text-txt-2">{o.text}</p>
                        </div>
                      )
                    })}
                  </div>
                  <p className="mt-4 text-[15px]">Заполните форму или напишите нам — <b>ответим в течение дня</b>.</p>
                  <MessengerButtons className="mt-5" />
                  <div className="mt-6 space-y-2 text-[15px]">
                    <a href={contacts.phoneHref} className="flex items-center gap-2 font-semibold"><Phone className="size-4" />{contacts.phone}</a>
                    <div className="flex items-center gap-2 text-txt-2"><Clock className="size-4" />{contacts.hours}</div>
                  </div>
                </div>
                <LeadForm topic={t.id} doneText={t.done} />
              </div>
            </TabsContent>
          ))}
          </div>
        </Tabs>
      </div>
    </section>
  )
}

// Вопросы — нативный <details>: ответы есть в HTML, поисковик их видит
function FaqList({ limit, as = 'h2', title = 'Частые вопросы' }) {
  const list = limit ? faq.slice(0, limit) : faq
  return (
    <section className="wrap py-16">
      <SectionTitle as={as}>{title}</SectionTitle>
      <div className="mt-6 divide-y divide-gray-2 border-y border-gray-2">
        {list.map((f) => (
          <details key={f.q} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left text-[17px] font-semibold [&::-webkit-details-marker]:hidden">
              {f.q}<Plus className="size-5 shrink-0 transition group-open:rotate-45" />
            </summary>
            <p className="max-w-[720px] pb-5 text-[15px] leading-relaxed text-txt-2">{f.a}</p>
          </details>
        ))}
      </div>
      {limit && <Link to={pages.faq.path} className="mt-5 inline-flex items-center gap-1 font-semibold text-violet-dark">Все вопросы <ChevronRight className="size-4" /></Link>}
    </section>
  )
}

function SeoText() {
  return (
    <section className="wrap pb-16">
      <div className="max-w-[900px] text-[15px] leading-relaxed text-txt-2">
        <h2 className="mb-3 text-xl font-semibold text-ink">Купить корм Wonderfur в Санкт-Петербурге</h2>
        <p>
          В нашем магазине — сухие корма Wonderfur от российского завода КРОКЕТ: {kinds.cat.intro.split('. Бесплатная')[0]}. {kinds.dog.intro.split('. Бесплатная')[0]}.
          Доставка бесплатная: привезём заказ в пункт выдачи 5Post в Санкт-Петербурге — постамат или кассу «Пятёрочки» и «Перекрёстка».
        </p>
      </div>
    </section>
  )
}

/* ---------------- категория ---------------- */
/* Блок занимает высоту большего из двух текстов (кошки/собаки), чтобы при переключении страница не прыгала.
   Второй текст — только в CSS (::after, невидимый), его не читают ни поисковики, ни экранные дикторы. */
function Steady({ as: Tag = 'span', className, text, other }) {
  return <Tag className={cn('steady', className)} data-other={other}><span>{text}</span></Tag>
}

function KindPage({ kind }) {
  const k = kinds[kind]
  const other = kinds[kind === 'cat' ? 'dog' : 'cat'] || k
  const [filter, setFilter] = useState(ALL)
  useEffect(() => setFilter(ALL), [kind])
  return (
    <>
      <Crumbs items={[[k.menu, k.path]]} />
      <div className="wrap pb-8 pt-4">
        <Steady as="h1" className="text-[30px] font-extrabold leading-tight tracking-tight md:text-[44px]" text={k.h1} other={other.h1} />
        <Steady as="p" className="mt-3 max-w-[760px] text-[17px] text-txt-2" text={k.intro} other={other.intro} />
      </div>
      <Catalog filter={filter} setFilter={setFilter} fixedKind={kind} title={<Steady text={`Все рецепты ${k.h1.split(' ').pop()}`} other={`Все рецепты ${other.h1.split(' ').pop()}`} />} />
      <section className="wrap py-14">
        <h2 className="text-2xl font-extrabold">Другие корма</h2>
        <Link to={kinds[kind === 'cat' ? 'dog' : 'cat'].path} className="mt-3 inline-flex items-center gap-1 font-semibold text-violet-dark">
          {kinds[kind === 'cat' ? 'dog' : 'cat'].h1} <ChevronRight className="size-4" />
        </Link>
      </section>
    </>
  )
}

// Подборка внутри раздела: «стерилизованным», «котятам»… — своя страница для поисковиков
function SegmentPage({ id }) {
  const s = segments[id]
  const k = s.kind && kinds[s.kind]
  const list = products.filter(s.test)
  const near = Object.entries(segments).filter(([x, o]) => x !== id && o.count && (!s.kind || !o.kind || o.kind === s.kind) && o.kind)
  return (
    <>
      <Crumbs items={[...(k ? [[k.menu, k.path]] : []), [s.menu, s.path]]} />
      <div className="wrap pb-2 pt-4">
        <h1 className="text-[30px] font-extrabold leading-tight tracking-tight md:text-[44px]">{s.h1}</h1>
        <p className="mt-3 max-w-[760px] text-[17px] text-txt-2">{s.intro}</p>
      </div>
      <section className="wrap py-10">
        <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {list.map((p) => <ProductCard key={p.id} p={p} />)}
        </div>
        <p className="mt-6 text-xs text-txt-2">Цены указаны в рублях, НДС не облагается. Доставка до пунктов выдачи 5Post в Санкт-Петербурге — бесплатно.</p>
      </section>
      <section className="wrap pb-14">
        <h2 className="text-2xl font-extrabold">Ещё корма</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {(k ? [[k.h1, k.path]] : [[kinds.cat.h1, kinds.cat.path], [kinds.dog.h1, kinds.dog.path]]).concat(near.map(([, o]) => [o.h1, o.path])).map(([t, to]) => (
            <Link key={to} to={to} className="inline-flex items-center gap-1 rounded-[2px] border border-ink bg-white px-3 py-2 text-sm font-semibold hover:bg-gray-2">{t} <ChevronRight className="size-4" /></Link>
          ))}
        </div>
      </section>
    </>
  )
}

/* ---------------- карточка товара ---------------- */
function ProductPage({ p }) {
  const st = useStore()
  const k = kinds[p.kind]
  const [vi, setVi] = useState(p.weights.length > 2 ? 1 : 0)
  useEffect(() => setVi(p.weights.length > 2 ? 1 : 0), [p])
  useEffect(() => track('view_product', { id: p.id }), [p.id])
  const v = p.weights[vi]
  const gal = (p.images || []).map((f) => BASE + f)
  const [pi, setPi] = useState(0)
  const thumbs = useRef(null)
  const photoIndex = pi < gal.length ? pi : 0
  useEffect(() => setPi(0), [p])
  useEffect(() => {
    const strip = thumbs.current
    const active = strip?.children[photoIndex]
    if (!active) return
    const item = active.getBoundingClientRect(), viewport = strip.getBoundingClientRect()
    if (item.left < viewport.left) strip.scrollLeft += item.left - viewport.left - 2
    if (item.right > viewport.right) strip.scrollLeft += item.right - viewport.right + 2
  }, [p, photoIndex])
  const related = products.filter((x) => x.kind === p.kind && x.id !== p.id)
  const specs = [
    ['Вкус', p.taste],
    ['Для кого', p.ageLabel],
    ['Тип корма', p.foodType || 'сухой полнорационный'],
    ['Фасовки', p.weights.map((w) => w.w).join(', ')],

    ['Срок годности', p.shelfLife || '18 месяцев'],
    ['Производитель', manufacturer],
    ...(declaration ? [['Декларация', declaration]] : []),
    ['Маркировка', '«Честный знак»'],
  ]
  return (
    <>
      <Crumbs items={[[k.menu, k.path], [cap(p.short), productPath(p)]]} />
      <article className="wrap grid gap-8 pb-14 pt-5 md:grid-cols-[1fr_1.05fr] lg:gap-14">
        <div className="min-w-0">
        <div className={cn('relative flex h-[360px] items-center justify-center rounded-lg p-6 md:h-[520px]', p.bg)}>
          <img src={gal[photoIndex] || img(p.id)} {...IMG} fetchPriority="high" alt={`Упаковка ${p.line} — ${p.short}, ${p.taste}`} className="h-full w-auto object-contain" />
          <FavBtn faved={st.fav.includes(p.id)} onClick={() => st.toggleFav(p.id)} className="right-4 top-4 sm:right-4 sm:top-4" />
        </div>
          {gal.length > 1 && (
            <div className="mt-3 flex items-center gap-1.5" role="group" aria-label="Фото товара">
              <button type="button" aria-label="Предыдущее фото" onClick={() => setPi((i) => (i + gal.length - 1) % gal.length)} className="grid size-11 shrink-0 place-items-center rounded-full bg-gray-1 hover:bg-gray-2"><ChevronRight className="size-5 rotate-180" aria-hidden="true" /></button>
              <div ref={thumbs} className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto p-0.5">
                {gal.map((src, i) => (
                  <button key={`${i}-${src}`} type="button" onClick={() => setPi(i)} aria-label={`Фото ${i + 1} из ${gal.length}`} aria-pressed={i === photoIndex} className={cn('flex size-16 shrink-0 items-center justify-center rounded-lg p-1 focus-visible:outline focus-visible:-outline-offset-2', i === photoIndex ? 'bg-gray-2' : 'bg-white hover:bg-gray-1')}>
                    <img src={src} alt="" loading="lazy" className="max-h-full w-auto object-contain mix-blend-multiply" />
                  </button>
                ))}
              </div>
              <button type="button" aria-label="Следующее фото" onClick={() => setPi((i) => (i + 1) % gal.length)} className="grid size-11 shrink-0 place-items-center rounded-full bg-gray-1 hover:bg-gray-2"><ChevronRight className="size-5" aria-hidden="true" /></button>
            </div>
          )}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold text-violet-dark">{p.line}</span>
          <h1 className="mt-2 text-[28px] font-extrabold leading-[1.1] tracking-tight md:text-[36px]">{p.name}</h1>
          <p className="mt-4 text-[17px] leading-relaxed text-txt-2">{p.text}</p>
          <div className="mt-6 text-sm text-txt-2">Фасовка</div>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Фасовка">
            {p.weights.map((w, i) => (
              <button key={w.w} onClick={() => setVi(i)} aria-pressed={i === vi} className={cn('flex h-14 flex-col items-start justify-center rounded-lg border px-4 text-left', i === vi ? 'border-ink bg-ink text-white' : 'border-gray-3 hover:border-ink')}>
                <span className="text-[15px] font-semibold">{w.w}</span>
                <span className={cn('text-xs', i === vi ? 'text-white/75' : 'text-txt-2')}>{rub(w.price)}</span>
              </button>
            ))}
          </div>
          <div className="mt-6 flex items-baseline gap-3">
            <span className="text-[34px] font-extrabold leading-none">{rub(v.price)}</span>
            {perKg(v) !== null && <span className="text-sm text-txt-2">{rub(perKg(v))}/кг</span>}
          </div>
          <div className="mt-5 max-w-[420px]"><Buy p={p} v={v} qty={st.qtyOf(p.id, v.w)} big /></div>
          <div className="mt-5 flex items-start gap-3 rounded-lg bg-gray-1 p-4 text-sm">
            <Truck className="mt-0.5 size-5 shrink-0 text-violet-dark" />
            <div>Бесплатная доставка до пунктов выдачи 5Post в Санкт-Петербурге. <Link to={pages.delivery.path} className="text-violet-dark underline">Условия доставки</Link></div>
          </div>
          <h2 className="mt-8 text-xl font-extrabold">Характеристики</h2>
          <dl className="mt-3 grid grid-cols-[minmax(110px,auto)_1fr] gap-x-6 gap-y-2 text-[15px]">
            {specs.map(([a, b]) => <div key={a} className="contents"><dt className="text-txt-2">{a}</dt><dd>{b}</dd></div>)}
          </dl>
          <h2 className="mt-8 text-xl font-extrabold">Описание</h2>
          <p className="mt-3 text-[15px] leading-relaxed">{p.more}</p>
          {p.composition ? (
            <>
              <h2 className="mt-8 text-xl font-extrabold">Состав</h2>
              <p className="mt-3 text-[15px] leading-relaxed">{p.composition.full}</p>
              <h2 className="mt-8 text-xl font-extrabold">Гарантированный анализ, на 100 г</h2>
              <dl className="mt-3 grid grid-cols-[minmax(110px,auto)_1fr] gap-x-6 gap-y-2 text-[15px]">
                <div className="contents"><dt className="text-txt-2">Белки</dt><dd>{p.composition.analysis.protein}</dd></div>
                <div className="contents"><dt className="text-txt-2">Жиры</dt><dd>{p.composition.analysis.fat}</dd></div>
                <div className="contents"><dt className="text-txt-2">Клетчатка</dt><dd>{p.composition.analysis.fiber}</dd></div>
                <div className="contents"><dt className="text-txt-2">Зола</dt><dd>{p.composition.analysis.ash}</dd></div>
                <div className="contents"><dt className="text-txt-2">Кальций</dt><dd>{p.composition.analysis.calcium}</dd></div>
                <div className="contents"><dt className="text-txt-2">Фосфор</dt><dd>{p.composition.analysis.phosphorus}</dd></div>
                <div className="contents"><dt className="text-txt-2">Энергетическая ценность</dt><dd>{p.composition.analysis.kcal} ккал/100 г</dd></div>
              </dl>
              <p className="mt-3 text-sm text-txt-2">Таблица суточной нормы — на упаковке. Свежая вода должна быть в доступе всегда.</p>
            </>
          ) : (
            <p className="mt-3 text-sm text-txt-2">Состав, гарантированный анализ и таблица суточной нормы указаны на упаковке. Свежая вода должна быть в доступе всегда.</p>
          )}
        </div>
      </article>
      <section className="py-14">
        <div className="wrap">
          <h2 className="text-[26px] font-extrabold md:text-[32px]">Другие корма {p.line}</h2>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">{related.map((x) => <ProductCard key={x.id} p={x} />)}</div>
        </div>
      </section>
    </>
  )
}

/* ---------------- блог ---------------- */
function BlogPage() {
  return (
    <>
      <Crumbs items={[['Блог', pages.blog.path]]} />
      <section className="wrap pb-16 pt-4">
        <SectionTitle as="h1" sub={pages.blog.desc}>{pages.blog.h1}</SectionTitle>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{posts.map((p) => <PostCard key={p.slug} p={p} H="h2" />)}</div>
      </section>
    </>
  )
}

function PostPage({ post }) {
  const rel = post.rel.map(byId).filter(Boolean) // товар могли удалить в CRM
  return (
    <>
      <Crumbs items={[['Блог', pages.blog.path], [post.title, `blog/${post.slug}/`]]} />
      <article className="wrap max-w-[820px] pb-12 pt-4">
        <span className="rounded-full bg-gray-1 px-2.5 py-0.5 text-xs lowercase">{post.tag}</span>
        <h1 className="mt-4 text-[30px] font-extrabold leading-tight tracking-tight md:text-[42px]">{post.title}</h1>
        <p className="mt-4 text-lg text-txt-2">{post.text}</p>
        <div className="mt-6 space-y-4 text-[17px] leading-relaxed">{post.body.map((t) => <p key={t}>{t}</p>)}</div>
      </article>
      <section className="py-14">
        <div className="wrap">
          <h2 className="text-2xl font-extrabold">Корма по теме</h2>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">{rel.map((x) => <ProductCard key={x.id} p={x} />)}</div>
        </div>
      </section>
    </>
  )
}

/* ---------------- текстовые страницы ---------------- */
function TextPage({ id, topic, setTopic }) {
  const pg = pages[id]
  if (id === 'faq') return <><Crumbs items={[[pg.h1, pg.path]]} /><FaqList as="h1" title={pg.h1} /></>
  if (id === 'contacts')
    return (
      <>
        <Crumbs items={[[pg.h1, pg.path]]} />
        <section className="wrap pb-10 pt-4">
          <SectionTitle as="h1" sub="Интернет-магазин кормов Wonderfur в Санкт-Петербурге. Отвечаем на вопросы о корме, заказе и доставке.">{pg.h1}</SectionTitle>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-lg bg-gray-1 p-6">
              <div className="text-sm text-txt-2">Телефон</div>
              <a href={contacts.phoneHref} className="mt-1 block text-xl font-bold">{contacts.phone}</a>
              <div className="mt-1 text-sm text-txt-2">{contacts.hours}</div>
            </div>
            <div className="rounded-lg bg-gray-1 p-6">
              <div className="text-sm text-txt-2">Мессенджеры</div>
              <MessengerButtons className="mt-3" stack />
            </div>
            <div className="rounded-lg bg-gray-1 p-6">
              <div className="text-sm text-txt-2">Продавец</div>
              <div className="mt-1 text-[15px]">{seller.name}<br />ОГРНИП {seller.ogrn}<br />ИНН {seller.inn}<br />{seller.address}</div>
              <div className="mt-1 text-sm text-txt-2">{seller.reg}</div>
              <div className="mt-2 text-sm"><a href={`mailto:${contacts.email}`} className="underline">{contacts.email}</a></div>
            </div>
          </div>
        </section>
        <Contacts topic={topic} setTopic={setTopic} title="Написать нам" />
      </>
    )
  return (
    <>
      <Crumbs items={[[pg.h1, pg.path]]} />
      <section className="wrap max-w-[860px] pb-16 pt-4">
        <SectionTitle as="h1">{pg.h1}</SectionTitle>
        <div className="mt-8 space-y-6">
          {(legal[id] || pg.body).map(([h, t]) => (
            <div key={h}>
              <h2 className="text-xl font-bold">{h}</h2>
              <p className="mt-2 whitespace-pre-line break-words text-[16px] leading-relaxed text-txt-2">{t}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

/* ---------------- страница «Спасибо» (после заказа и заявки) ---------------- */
// данные о заказе/заявке передаём через sessionStorage: адрес /spasibo/ чистый, без личных данных в ссылке
const THANKS_KEY = 'thanks'
function ThanksPage({ nav }) {
  const st = useStore()
  const [t, setT] = useState(null)
  useEffect(() => {
    try { setT(JSON.parse(sessionStorage.getItem(THANKS_KEY) || 'null')) } catch { setT(null) }
  }, [])
  const order = t?.type === 'order'
  const name = t?.name ? `, ${t.name}` : ''
  const steps = order
    ? [['Заказ сохранён', 'Его состав и статус — в личном кабинете.'],
       ['Ждите смс', 'Когда заказ приедет в пункт выдачи 5Post, придёт смс с кодом для получения.'],
       ['Заберите корм', 'Покажите код в пункте выдачи. Доставка бесплатная.']]
    : null
  return (
    <section className="wrap py-14 sm:py-20">
      <div className="mx-auto max-w-[640px] text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-violet-dark text-white"><Check className="size-8" /></div>
        <h1 className="mt-5 text-[32px] font-extrabold leading-tight sm:text-[40px]">Спасибо{name}!</h1>
        <p className="mt-3 text-lg text-txt-2">
          {order ? `Заказ №${t.n} принят.` : t?.type === 'lead' ? (t.text ? cap(t.text.replace(/^Спасибо[,!.]?\s*/, '')) : 'Заявка отправлена, скоро ответим.') : 'Мы получили ваше обращение.'}
        </p>
      </div>
      {steps && (
        <ol className="mx-auto mt-10 grid max-w-[900px] gap-3 sm:grid-cols-3">
          {steps.map(([h, d], i) => (
            <li key={h} className="rounded-[2px] bg-gray-1 p-5">
              <div className="text-sm font-bold text-violet-dark">Шаг {i + 1}</div>
              <div className="mt-1 text-lg font-bold">{h}</div>
              <p className="mt-1 text-sm text-txt-2">{d}</p>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        {order && <button onClick={() => st.setPanel('profile')} className={cn(inkBtn, 'flex items-center')}>Мои заказы</button>}
        <button onClick={() => nav.show({})} className={cn(inkBtn, order && 'border border-ink bg-white text-ink hover:bg-gray-1', 'flex items-center')}>Вернуться в каталог</button>
      </div>
      <div className="mx-auto mt-12 max-w-[640px] text-center">
        <div className="font-bold">Остались вопросы?</div>
        <p className="mt-1 text-sm text-txt-2">{contacts.phone} · {contacts.hours}</p>
        <MessengerButtons className="mx-auto mt-4 max-w-[460px] sm:w-full" />
      </div>
    </section>
  )
}

function NotFound() {
  return (
    <section className="wrap py-24 text-center">
      <h1 className="text-[40px] font-extrabold">Страница не найдена</h1>
      <p className="mt-3 text-lg text-txt-2">Такой страницы нет. Возможно, адрес изменился.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to={kinds.cat.path} className={cn(inkBtn, 'flex items-center')}>Корм для кошек</Link>
        <Link to={kinds.dog.path} className={cn(inkBtn, 'flex items-center')}>Корм для собак</Link>
      </div>
    </section>
  )
}

/* ---------------- подвал ---------------- */
function Footer({ nav }) {
  const cols = [
    ['Покупателям', [['Доставка и оплата', pages.delivery.path], ['Возврат и обмен', pages.returns.path], ['Частые вопросы', pages.faq.path], ['Контакты', pages.contacts.path]]],
    ['О бренде', [['О бренде и заводе', pages.about.path], ['Блог о питании', pages.blog.path], ['Оптовым покупателям', null, 'sales']]],
    ['Каталог', [['Корм для кошек', kinds.cat.path], ['Корм для собак', kinds.dog.path], ...segLink('kitten', 'Корм для котят'), ...segLink('puppy', 'Корм для щенков'), ...segLink('sterile', 'Для стерилизованных')]],
  ]
  return (
    <footer className="mt-10 bg-ink pb-24 pt-14 text-white md:pb-10">
      <div className="wrap grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1fr_1.4fr]">
        <div className="col-span-2 lg:col-span-1">
          <Logo light />
          <p className="mt-4 text-sm text-white/70">Сухие корма Wonderfur для кошек и собак с бесплатной доставкой до пунктов 5Post в Санкт-Петербурге.</p>
        </div>
        {cols.map(([h, ls]) => (
          <div key={h}>
            <div className="mb-3 font-semibold">{h}</div>
            <ul className="space-y-1 text-sm text-white/70">
              {ls.map(([l, to, t]) => (
                <li key={l}>{to ? <Link to={to} className="inline-block py-1.5 hover:text-white">{l}</Link> : <button onClick={() => nav.contact(t)} className="py-1.5 text-left hover:text-white">{l}</button>}</li>
              ))}
            </ul>
          </div>
        ))}
        <div>
          <div className="mb-3 font-semibold">Поговорим про питомцев</div>
          <a href={contacts.phoneHref} className="whitespace-nowrap text-[15px] font-bold min-[380px]:text-lg sm:text-2xl">{contacts.phone}</a>
          <p className="mt-1 text-sm text-white/70">{contacts.hours}</p>
          <div className="mt-4 flex gap-3">
            <a href={contacts.telegram} target="_blank" rel="noopener nofollow" aria-label="Telegram" className="transition hover:scale-110 hover:opacity-90"><TgIcon className="size-11" /></a>
            <a href={contacts.max} target="_blank" rel="noopener nofollow" aria-label="Max" className="transition hover:scale-110 hover:opacity-90"><MaxIcon className="size-11" /></a>
          </div>
        </div>
      </div>
      <div className="wrap mt-10 space-y-2 border-t border-white/10 pt-6 text-xs text-white/55">
        <p>Продавец: {seller.name}, ОГРНИП {seller.ogrn}, ИНН {seller.inn}, {seller.address}. Производитель кормов — {manufacturer}.</p>
        <p>
          Цены указаны в рублях, НДС не облагается (продавец применяет УСН). Сайт носит информационный характер и не является публичной офертой.{' '}
          <Link to={pages.privacy.path} className="underline hover:text-white">Политика конфиденциальности</Link> ·{' '}
          <Link to={pages.consent.path} className="underline hover:text-white">Согласие на обработку данных</Link> ·{' '}
          <Link to={pages.terms.path} className="underline hover:text-white">Пользовательское соглашение</Link>
        </p>
        <p>© 2026 Wonderfur, Санкт-Петербург.{' '}<button onClick={() => window.dispatchEvent(new Event('wf-cookies'))} className="underline hover:text-white">Настройки cookie</button></p>
      </div>
    </footer>
  )
}

/* ---------------- плавающие мессенджеры ---------------- */
function Messengers() {
  const st = useStore()
  const lifted = !!st.compare.length && st.panel !== 'compare' // на телефоне внизу плашка «Сравнить состав» — встаём над ней
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  useEffect(() => {
    if (!open) return
    const out = (e) => { if (!box.current?.contains(e.target)) setOpen(false) }
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', out)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', out); document.removeEventListener('keydown', esc) }
  }, [open])
  const item = 'flex w-full items-center gap-2 rounded-full bg-white py-2 pl-2 pr-4 text-sm font-semibold hover:bg-gray-1'
  return (
    <div ref={box} className={cn('fixed bottom-5 right-5 z-30 flex flex-col items-end gap-2 transition-[bottom]', lifted && 'max-sm:bottom-[76px]')}>
      {open && (
        <div className="grid w-[156px] gap-2">
          <a href={contacts.telegram} target="_blank" rel="noopener nofollow" onClick={() => setOpen(false)} className={item}><TgIcon className="size-8" />Telegram</a>
          <a href={contacts.max} target="_blank" rel="noopener nofollow" onClick={() => setOpen(false)} className={item}><MaxIcon className="size-8" />Max</a>
        </div>
      )}
      <button onClick={() => setOpen(!open)} aria-label={open ? 'Закрыть' : 'Написать нам'} aria-expanded={open}
        className="flex size-12 items-center justify-center gap-2 rounded-full bg-violet-dark font-semibold text-white hover:bg-ink sm:h-14 sm:w-auto sm:px-5">
        {open ? <X className="size-5" /> : <Send className="size-5" />}<span className="hidden sm:inline">{open ? 'Закрыть' : 'Написать нам'}</span>
      </button>
    </div>
  )
}

/* ---------------- баннер cookie и персональных данных (152-ФЗ) ---------------- */
function CookieBanner() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!cookieChoice()) setShow(true)
    const reopen = () => setShow(true)
    window.addEventListener('wf-cookies', reopen)
    return () => window.removeEventListener('wf-cookies', reopen)
  }, [])
  const save = (v) => { try { localStorage.setItem('wf-cookies', JSON.stringify({ v, edition: COOKIE_EDITION, at: new Date().toISOString() })) } catch { /* пусто */ } setShow(false); window.dispatchEvent(new Event('wf-consent')) }
  if (!show) return null
  const policy = <Link to={pages.privacy.path} className="text-violet-dark underline">политике конфиденциальности</Link>
  return (
    <div role="region" aria-label="Cookie и персональные данные"
      className="fixed inset-x-2 bottom-2 z-50 rounded-lg bg-white p-3 shadow-[0_8px_30px_rgba(46,44,56,.22)] sm:inset-x-auto sm:bottom-5 sm:left-5 sm:max-w-[460px] sm:rounded-lg sm:p-5">
      <div className="flex gap-2 sm:gap-3">
        <Cookie className="mt-0.5 size-5 shrink-0 text-violet-dark" aria-hidden />
        <p className="text-xs leading-snug text-txt-2 sm:text-sm">Мы используем cookie, чтобы сайт работал удобно. Аналитику включим только с вашего согласия. Подробнее — в {policy}.</p>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-3">
        <Button onClick={() => save('necessary')} className="h-auto min-h-10 whitespace-normal rounded-lg border border-ink bg-white px-1.5 py-1.5 text-center text-[13px] leading-tight text-ink hover:bg-gray-1">Только обязательные</Button>
        <Button onClick={() => save('all')} className="h-auto min-h-10 whitespace-normal rounded-lg bg-ink px-1.5 py-1.5 text-center text-[13px] leading-tight text-white hover:bg-ink-2">Принять все</Button>
      </div>
    </div>
  )
}

/* ---------------- боковые панели ---------------- */
/* Сравнение: корма — столбцами, показатели — строками. Цифры видно сразу рядом, длинный состав — по кнопке. */
const compareRows = [['Белки', 'protein'], ['Жиры', 'fat'], ['Клетчатка', 'fiber'], ['Зола', 'ash'], ['Ккал/100г', 'kcal']]
function CompareTable({ ids, onRemove, onOpen }) {
  const [full, setFull] = useState(false)
  const items = ids.map(byId).filter(Boolean)
  const n = items.length
  // 1–2 корма помещаются на любом телефоне; 3–4 — листаются вбок
  const cols = { gridTemplateColumns: `repeat(${n}, minmax(${n > 2 ? 132 : 0}px, 1fr))` }
  const Label = ({ children }) => <div className="col-span-full mt-1.5 border-t border-gray-2 pt-1 text-[11px] leading-4 text-txt-2 sm:mt-2 sm:pt-1.5 sm:text-xs"><span className="sticky left-0">{children}</span></div>
  const val = (p, k) => p.composition?.analysis?.[k] || '—'
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5">
      <div className="grid gap-x-3 text-sm [overflow-wrap:anywhere]" style={cols}>
        {items.map((p) => (
          <div key={p.id} className="relative flex min-w-0 flex-col items-start gap-1 sm:gap-2 rounded-lg bg-gray-1 p-2 sm:p-3">
            <button onClick={() => onRemove(p.id)} aria-label="Убрать из сравнения" className="absolute right-2 top-2 text-txt-2 hover:text-ink"><X className="size-4" /></button>
            <div className={cn('flex size-8 flex-none sm:size-10 items-center justify-center rounded-lg p-1', p.bg)}><img src={img(p.id)} alt="" className="max-h-full w-auto" /></div>
            <Link to={productPath(p)} onClick={onOpen} className="min-w-0 text-[13px] leading-tight hover:text-violet-dark sm:text-sm sm:leading-snug"><b>{p.line}</b><br />{p.ageLabel}, {p.taste}</Link>
          </div>
        ))}
        <Label>Главное в составе</Label>
        {items.map((p) => <div key={p.id} className={cn('min-w-0 text-[13px] leading-snug sm:text-sm', !full && 'line-clamp-2 sm:line-clamp-none')}>{p.composition?.top || '—'}</div>)}
        {compareRows.map(([t, k]) => (
          <Fragment key={k}>
            <Label>{t}</Label>
            {items.map((p) => <div key={p.id} className="font-bold leading-5">{val(p, k)}</div>)}
          </Fragment>
        ))}
        <div className="col-span-full mt-1.5 border-t border-gray-2 pt-2 sm:mt-2">
          <button onClick={() => setFull(!full)} aria-expanded={full} className="sticky left-0 text-sm font-semibold underline hover:text-violet-dark">{full ? 'Скрыть полный состав' : 'Показать полный состав'}</button>
        </div>
        {full && items.map((p) => <p key={p.id} className="mt-2 min-w-0 text-xs leading-relaxed">{p.composition?.full || 'Полный состав запросили у производителя, скоро добавим.'}</p>)}
      </div>
    </div>
  )
}

function Panels({ nav }) {
  const st = useStore()
  const close = () => st.setPanel(null)
  const side = 'flex w-full flex-col gap-0 p-0 sm:max-w-[440px]'
  const head = (t, d) => (
    <SheetHeader className="border-b border-gray-2 p-5">
      <SheetTitle className="text-2xl font-extrabold">{t}</SheetTitle>
      <SheetDescription>{d}</SheetDescription>
    </SheetHeader>
  )
  const favs = products.filter((p) => st.fav.includes(p.id))
  // как на Озоне: минус на 1 и корзина не удаляют сразу — сначала спрашиваем, можно передумать
  const [askDel, setAskDel] = useState(null)
  const toCatalog = ['В каталог', () => { close(); nav.show({}) }]
  return (
    <>
      <Sheet open={st.panel === 'cart'} onOpenChange={(o) => !o && close()}>
        <SheetContent className={side}>
          {head('Корзина', st.count ? `${st.count} шт. на ${rub(st.total)}` : 'Здесь пока пусто')}
          <div className="flex-1 overflow-y-auto p-5">
            <div className="space-y-3">
            {!st.items.length && <Empty icon={ShoppingBag} text="Добавьте корм из каталога" action={toCatalog} />}
            {st.items.map((i) => (
              <div key={i.key} className="flex gap-3 rounded-lg bg-gray-1 p-3">
                <div className="flex size-20 shrink-0 items-center justify-center rounded-lg bg-white p-1"><img src={img(i.id)} alt="" className="max-h-full w-auto" /></div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="break-words text-sm leading-snug"><b>{i.line}</b> {i.name} · {i.w}</div>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pt-2">
                    <div className="flex shrink-0 items-center rounded-lg bg-white">
                      <button className="flex size-8 items-center justify-center" onClick={() => (i.qty > 1 ? st.setQty(i.key, i.qty - 1) : setAskDel(i.key))} aria-label="Меньше"><Minus className="size-3.5" /></button>
                      <span className="w-6 text-center text-sm font-semibold">{i.qty}</span>
                      <button className="flex size-8 items-center justify-center" onClick={() => st.setQty(i.key, i.qty + 1)} aria-label="Больше"><Plus className="size-3.5" /></button>
                    </div>
                    <span className="whitespace-nowrap font-bold">{rub(i.price * i.qty)}</span>
                  </div>
                </div>
                <button onClick={() => setAskDel(i.key)} aria-label="Удалить" className="-mr-1.5 -mt-1.5 flex size-8 shrink-0 items-center justify-center self-start text-txt-2 hover:text-ink"><Trash2 className="size-4" /></button>
              </div>
            ))}
            </div>
            {!!st.items.length && (
              <div className="mt-5 border-t border-gray-2 pt-5">
                <div className="mb-3 flex items-center gap-2 rounded-lg bg-violet-soft px-3 py-2 text-sm"><Truck className="size-4 text-violet-dark" />Бесплатная доставка до пункта 5Post</div>
                <LoyaltyBox />
                <PromoBox />
                <div className="space-y-1">
                  {(st.discount > 0 || st.bonusSpent > 0) && <div className="flex justify-between text-sm text-txt-2"><span>Товары</span><span>{rub(st.total)}</span></div>}
                  {st.clientDiscount > 0 && <div className="flex justify-between text-sm text-txt-2"><span>Скидка клиента {st.clientPct}%</span><span>−{rub(st.clientDiscount)}</span></div>}
                  {st.promoDiscount > 0 && <div className="flex justify-between text-sm text-txt-2"><span>Скидка по промокоду {st.promo.code}</span><span>−{rub(st.promoDiscount)}</span></div>}
                  {st.bonusSpent > 0 && <div className="flex justify-between text-sm text-txt-2"><span>Оплата бонусами</span><span>−{rub(st.bonusSpent)}</span></div>}
                </div>
              </div>
            )}
          </div>
          {askDel && st.items.some((i) => i.key === askDel) && (
            <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onPointerDown={(e) => { e.currentTarget.dataset.down = e.target === e.currentTarget ? '1' : '' }} onClick={(e) => { if (e.target === e.currentTarget && e.currentTarget.dataset.down === '1') setAskDel(null) }}>
              <div role="alertdialog" aria-label="Удалить товар?" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="text-lg font-bold">Удалить товар из корзины?</div>
                <div className="mt-1 text-sm text-txt-2">Его можно будет снова добавить из каталога</div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => setAskDel(null)} className="h-11 text-base">Оставить</Button>
                  <Button onClick={() => { st.setQty(askDel, 0); setAskDel(null) }} className={cn(inkBtn, 'h-11 text-base')}>Удалить</Button>
                </div>
              </div>
            </div>
          )}
          {!!st.items.length && (
            <div className="border-t border-gray-2 px-5 pb-5 pt-3">
              <div className="mb-3">
                <div className="flex justify-between text-lg"><span>Итого</span><b>{rub(st.totalWithDiscount)}</b></div>
                {st.bonusEarn > 0 && <div className="text-right text-[13px] text-txt-2">+{st.bonusEarn} {bonusWord(st.bonusEarn)} придёт, когда получите заказ</div>}
              </div>
              <Button onClick={() => { close(); track('checkout_start'); st.setCheckout(true) }} className={cn(inkBtn, 'h-12 w-full text-base')}>Перейти к оформлению</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={st.panel === 'fav'} onOpenChange={(o) => !o && close()}>
        <SheetContent className={side}>
          {head('Избранное', favs.length ? `${favs.length} шт.` : 'Пока пусто')}
          <div className="flex-1 space-y-3 overflow-y-auto p-5">
            {!favs.length && <Empty icon={Heart} text="Нажмите ♡ на карточке корма, и он появится здесь" action={toCatalog} />}
            {favs.map((p) => {
              const v = p.weights[p.weights.length > 2 ? 1 : 0]
              return (
                <div key={p.id} className="flex gap-3 rounded-lg bg-gray-1 p-3">
                  <div className={cn('flex size-20 shrink-0 items-center justify-center rounded-lg p-1', p.bg)}><img src={img(p.id)} alt="" className="max-h-full w-auto" /></div>
                  <div className="flex flex-1 flex-col">
                    <Link to={productPath(p)} onClick={close} className="text-sm leading-snug hover:text-violet-dark"><b>{p.line}</b> {p.name}</Link>
                    <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                      <span className="font-bold">{rub(v.price)} <span className="text-xs font-normal text-txt-2">· {v.w}</span></span>
                      <button onClick={() => st.add(p, v)} className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white">{st.qtyOf(p.id, v.w) ? `В корзине: ${st.qtyOf(p.id, v.w)}` : 'В корзину'}</button>
                    </div>
                  </div>
                  <button onClick={() => st.toggleFav(p.id)} aria-label="Убрать из избранного" className="self-start"><Heart className="size-4 fill-tang text-tang" /></button>
                </div>
              )
            })}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={st.panel === 'profile'} onOpenChange={(o) => !o && close()}>
        <SheetContent className={side}>
          {head('Личный кабинет', st.user ? st.user.phone : 'Вход и регистрация')}
          <div className="flex-1 overflow-y-auto p-5">{st.user ? <Profile nav={nav} /> : <Login />}</div>
        </SheetContent>
      </Sheet>

      {/* сравнение составов — выбрали на карточках в каталоге, смотрим рядом без переходов */}
      <Sheet open={st.panel === 'compare'} onOpenChange={(o) => !o && close()}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 data-[side=right]:w-full sm:max-w-[760px] data-[side=right]:sm:max-w-[760px]">
          {/* на телефоне — компактная шапка, «очистить» в ней же: таблица помещается в один экран без прокрутки */}
          <SheetHeader className="border-b border-gray-2 px-4 py-3 sm:p-5">
            <SheetTitle className="text-xl font-extrabold sm:text-2xl">Сравнение состава</SheetTitle>
            <SheetDescription>
              {st.compare.length} из 4 кормов
              {!!st.compare.length && <span className="sm:hidden"> · <button onClick={st.clearCompare} className="underline hover:text-ink">очистить</button></span>}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4 pb-3 sm:p-5">
            {!st.compare.length ? (
              <Empty icon={Scale} text="отметьте «сравнить состав» на карточках кормов в каталоге" action={toCatalog} />
            ) : (
              <CompareTable ids={st.compare} onRemove={st.toggleCompare} onOpen={close} />
            )}
          </div>
          {!!st.compare.length && (
            <div className="hidden border-t border-gray-2 p-5 sm:block">
              <button onClick={st.clearCompare} className="text-sm text-txt-2 underline hover:text-ink">Очистить сравнение</button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* плавающая плашка сравнения — видна, пока выбран хотя бы 1 корм, не мешает просмотру каталога */}
      {!!st.compare.length && st.panel !== 'compare' && (
        <button onClick={() => st.setPanel('compare')} className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-center gap-2 bg-ink px-5 py-4 text-sm font-semibold text-white shadow-[0_-4px_16px_rgba(0,0,0,0.15)] sm:bottom-5 sm:left-1/2 sm:inset-x-auto sm:w-auto sm:-translate-x-1/2 sm:rounded-full sm:px-6">
          <Scale className="size-4" /> Сравнить состав ({st.compare.length})
        </button>
      )}

      {/* мобильное меню (бургер) */}
      <Sheet open={st.panel === 'menu'} onOpenChange={(o) => !o && close()}>
        <SheetContent side="left" className="flex w-[320px] max-w-[86vw] flex-none touch-pan-y flex-col gap-0 overflow-x-hidden p-0">
          <SheetHeader className="border-b border-gray-2 px-5 py-3"><SheetTitle asChild><div><Logo onClick={close} /></div></SheetTitle><SheetDescription className="sr-only">Меню сайта</SheetDescription></SheetHeader>
          <nav aria-label="Меню" className="flex-1 touch-pan-y overflow-x-hidden overflow-y-auto px-5 py-3 [--mi:clamp(24px,calc((100dvh-250px)/13),44px)]">
            <div className="mb-1 text-[13px] font-bold uppercase tracking-wide text-txt-2">Каталог</div>
            <MenuLink to={kinds.cat.path} onClick={close}>Корм для кошек</MenuLink>
            <MenuLink to={kinds.dog.path} onClick={close}>Корм для собак</MenuLink>
            {[['kitten', 'Для котят'], ['puppy', 'Для щенков'], ['sterile', 'Для стерилизованных кошек'], ['small', 'Для мелких пород собак'], ['urinary', 'Для кошек при МКБ']]
              .filter(([id]) => segments[id].count).map(([id, t]) => <MenuLink key={id} to={segments[id].path} onClick={close}>{t}</MenuLink>)}
            <div className="mb-1 mt-3 text-[13px] font-bold uppercase tracking-wide text-txt-2">Информация</div>
            <MenuLink to={pages.delivery.path} onClick={close}>Доставка и оплата</MenuLink>
            <MenuLink to={pages.returns.path} onClick={close}>Возврат и обмен</MenuLink>
            <MenuLink to={pages.about.path} onClick={close}>О бренде</MenuLink>
            <MenuLink to={pages.blog.path} onClick={close}>Блог</MenuLink>
            <MenuLink to={pages.faq.path} onClick={close}>Частые вопросы</MenuLink>
            <MenuLink to={pages.contacts.path} onClick={close}>Контакты</MenuLink>
            <div className="mt-3"><a href={contacts.phoneHref} className="block whitespace-nowrap text-lg font-bold leading-6">{contacts.phone}</a><div className="text-xs leading-4 text-txt-2">{contacts.hours}</div></div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a href={contacts.telegram} target="_blank" rel="noopener nofollow" className="flex h-10 items-center justify-center gap-2 rounded-lg bg-gray-2 text-sm font-semibold"><TgIcon className="size-5" />Telegram</a>
              <a href={contacts.max} target="_blank" rel="noopener nofollow" className="flex h-10 items-center justify-center gap-2 rounded-lg bg-gray-2 text-sm font-semibold"><MaxIcon className="size-5" />Max</a>
            </div>
          </nav>
        </SheetContent>
      </Sheet>

      <Dialog open={st.checkout} onOpenChange={st.setCheckout}>
        <Checkout />
      </Dialog>
    </>
  )
}

const bonusWord = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'бонус' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'бонуса' : 'бонусов')

// Ручной ввод суммы бонусов: пока поле в фокусе, показываем введённое (с обрезкой до максимума), после — фактическое списание
function BonusAmount() {
  const st = useStore()
  const [txt, setTxt] = useState(null)
  return (
    <Input type="text" inputMode="numeric" pattern="[0-9]*" value={txt ?? String(st.bonusSpent)} aria-label="Сколько бонусов списать"
      onFocus={(e) => e.target.select()} onBlur={() => setTxt(null)}
      onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 7); const n = Math.min(Number(d || 0), st.bonusMax); setTxt(d === '' ? '' : String(n)); st.setBonusWant(n) }}
      className="h-9 w-[92px] rounded-lg bg-white px-2 text-right text-[16px] font-bold text-ink" />
  )
}

function LoyaltyBox() {
  const st = useStore()
  if (!st.loyalty) return null
  return (
    <div className="mb-3 space-y-2">
      {st.clientPct > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-violet-soft px-3 py-2 text-[14px]">
          <BadgePercent className="size-4 shrink-0 text-violet-dark" />
          <span className="min-w-0">Применена скидка клиента <b>{st.clientPct}%</b>{st.promoDiscount > 0 ? ' · промокод считается после неё' : ''}</span>
        </div>
      )}
      {st.bonusBalance > 0 && (
        <div className="rounded-lg border border-gray-2 px-3 py-2.5 text-[14px]">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span className="min-w-0"><b>Применить бонусы</b><span className="block text-[13px] text-txt-2">На счёте {st.bonusBalance} {bonusWord(st.bonusBalance)} · 1 бонус = 1 ₽</span><span className="block text-[13px] text-txt-2">Бонусами можно оплатить весь заказ, кроме {st.loyalty.minPay ?? 1} ₽</span></span>
            <button type="button" role="switch" aria-checked={st.bonusOn} aria-label="Применить бонусы" onClick={() => st.setBonusOn(!st.bonusOn)} disabled={st.bonusMax <= 0}
              className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40', st.bonusOn ? 'bg-violet-dark' : 'bg-gray-300')}>
              <span className={cn('absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform', st.bonusOn && 'translate-x-5')} />
            </button>
          </label>
          {st.bonusOn && st.bonusMax > 0 && (
            <div className="mt-2">
              <input type="range" min="0" max={st.bonusMax} step="1" value={st.bonusSpent} onChange={(e) => st.setBonusWant(Number(e.target.value))} aria-label="Сколько бонусов списать (ползунок)" className="w-full accent-violet-600" />
              <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[13px] text-txt-2">
                <label className="flex items-center gap-2">Списать <BonusAmount /></label>
                <span className="whitespace-nowrap">можно до {st.bonusMax}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PromoBox() {
  const st = useStore()
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState(null) // { ok, text }
  const [busy, setBusy] = useState(false)
  if (!st.firstOrderEligible && !crmEnabled) return null
  if (st.promo) {
    return (
      <div className="mb-4 flex items-center justify-between gap-2 rounded-lg bg-violet-soft px-4 py-3 text-[14px] font-semibold text-violet-dark">
        <span>Промокод {st.promo.code} применён — скидка {st.promo.kind === 'fixed' ? rub(st.promo.value) : st.promo.value + '%'}</span>
        <button type="button" onClick={st.clearPromo} className="shrink-0 text-txt-2 underline">Убрать</button>
      </div>
    )
  }
  return (
    <div className="mb-4">
      <div className="flex gap-2">
        <Input value={code} onChange={(e) => { setCode(e.target.value); setMsg(null) }} placeholder="Промокод" aria-label="Промокод" className="h-11 rounded-lg bg-white text-[16px]" />
        <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { const r = await st.applyPromo(code); setMsg(r.ok ? { ok: true, text: 'Скидка применена!' } : { ok: false, text: r.msg }) } finally { setBusy(false) } }}
          className="h-11 shrink-0 rounded-lg bg-ink px-4 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Проверяю…' : 'Применить'}</button>
      </div>
      {msg && <p className={cn('mt-1.5 text-[13px]', msg.ok ? 'text-emerald-600' : 'text-red-600')}>{msg.text}</p>}
    </div>
  )
}

function MenuLink({ to, onClick, children }) {
  return <Link to={to} onClick={onClick} className="flex h-[var(--mi,40px)] w-full items-center justify-between text-left text-[15px] leading-5">{children}<ChevronRight className="size-4 text-txt-2" /></Link>
}

function Empty({ icon: I, text, action }) {
  return (
    <div className="py-14 text-center text-txt-2">
      <I className="mx-auto mb-3 size-12 text-gray-3" />
      <p>{text}</p>
      {action && <button onClick={action[1]} className={cn(inkBtn, 'mt-5')}>{action[0]}</button>}
    </div>
  )
}

// Оформление как у крупных зоомагазинов: вход по коду → (новый покупатель — короткая анкета) → пункт выдачи
function Checkout() {
  const st = useStore()
  const { navigate } = useRoute()
  const [done, setDone] = useState(null) // оформленный заказ
  const [point, setPoint] = useState('') // адрес текстом, если не нашли пункт на карте
  const [pt, setPt] = useState(null) // пункт, выбранный на карте
  const [manual, setManual] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const sending = useRef(false) // защита от двойного нажатия
  const step = done ? 'done' : !st.user ? 'auth' : 'point'
  const fullName = st.user ? [st.user.name, st.user.surname].filter(Boolean).join(' ') : ''
  const submit = async (e) => {
    e.preventDefault()
    if (sending.current) return
    const where = manual ? point.trim() : pt ? pickupPointDelivery(pt) : ''
    if (where.length < 5) return setErr(manual ? 'Укажите адрес пункта выдачи' : 'Выберите пункт на карте или в списке')
    setErr('')
    const n = String(Date.now()).slice(-6)
    const contact = { name: fullName, phone: st.user.phone, delivery: `5Post: ${where}` }
    setBusy(true)
    // Сначала резервируем заказ в CRM: даже если покупатель закроет банк или перезагрузит страницу,
    // оплаченный заказ уже не потеряется.
    try {
      await st.reserveOrder(contact, { n })
    } catch {
      setBusy(false)
      setErr('Не удалось создать заказ в CRM. Деньги не списаны — проверьте интернет и попробуйте ещё раз')
      return
    }
    // Окно оплаты Fable открывается само по себе (на телефоне — шторка снизу, на компьютере — окно по центру),
    // поэтому наше окно оформления на это время закрываем: иначе оно перехватывает клики
    openPay({ amount: st.totalWithDiscount, orderId: n })
      .then((PW) => {
        setBusy(false)
        st.setCheckout(false)
        let paid = false
        PW.open({
          orderId: n, amount: st.totalWithDiscount, currency: 'RUB', description: `Заказ №${n} в магазине Wonderfur`,
          customerId: payCustomer(), backendUrl: PAY_API,
          onSuccess: () => { paid = true; finish(where, n) },
          onClose: () => { if (!paid) st.setCheckout(true) },
        })
      })
      .catch(() => { setBusy(false); setErr('Не загрузилось окно оплаты. Проверьте интернет и попробуйте ещё раз') })
  }
  // Оплачено в виджете (сейчас тестовый режим — без списаний) → заказ уходит как оплаченный
  const finish = (where, n) => {
    if (sending.current) return
    sending.current = true
    const o = st.placeOrder({ name: fullName, phone: st.user.phone, delivery: `5Post: ${where}` }, { paid: true, n })
    try { sessionStorage.setItem(THANKS_KEY, JSON.stringify({ type: 'order', n: o.n, name: st.user?.name || '' })) } catch {}
    sending.current = false
    track('order_done', { n: o.n })
    st.setCheckout(false)
    // окно Fable показывает «Оплачено» — даём его увидеть, потом страница «спасибо»
    setTimeout(() => { window.PayWidget?.close?.(); navigate(THANKS_PATH) }, 1800)
  }
  const box = (wide, kids) => <DialogContent className={cn('max-h-[94dvh] overflow-y-auto rounded-lg bg-gray-1', wide ? 'max-w-[960px] p-5 sm:max-w-[960px] sm:p-7' : 'max-w-[520px] p-7')}>{kids}</DialogContent>
  const sum = st.discount || st.bonusSpent ? `${rub(st.totalWithDiscount)} (${[st.discount && `скидка ${rub(st.discount)}`, st.bonusSpent && `бонусами ${rub(st.bonusSpent)}`].filter(Boolean).join(', ')})` : rub(st.total)
  if (step === 'done')
    return box(false,
      <>
        <DialogTitle className="sr-only">Заказ оформлен</DialogTitle>
        <DialogDescription className="sr-only">Заказ №{done.n} принят</DialogDescription>
        <div className="rounded-lg bg-white p-8 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-violet-dark text-white"><Check className="size-7" /></div>
          <h3 className="mt-4 text-2xl font-extrabold">Спасибо, {st.user?.name}!</h3>
          <p className="mt-2 text-txt-2">Заказ №{done.n} принят и сохранён в личном кабинете. Когда он приедет в пункт выдачи, придёт смс с кодом для получения.</p>
          <Button onClick={() => { st.setCheckout(false); setDone(null) }} className={cn(inkBtn, 'mt-5 h-11 px-8')}>Хорошо</Button>
        </div>
      </>
    )
  if (step === 'auth')
    return box(false,
      <>
        <DialogTitle className="sr-only">Вход или регистрация</DialogTitle>
        <DialogDescription className="sr-only">Сумма заказа {sum}</DialogDescription>
        <AuthFlow note={`Сумма заказа ${sum}. Войдите или зарегистрируйтесь, чтобы оформить заказ.`} />
      </>
    )
  return box(!!st.items.length,
    <>
      <DialogTitle className="text-2xl font-extrabold">Где заберёте заказ?</DialogTitle>
      <DialogDescription className="text-[15px] text-txt-2">{st.count} шт. на {sum}. Доставка до пункта 5Post бесплатная.<span className="block sm:hidden">Нажмите на пункт в списке или на карте, затем — «Перейти к оплате» внизу.</span></DialogDescription>
      {!st.items.length ? (
        <Empty icon={ShoppingBag} text="Корзина пуста" action={['В каталог', () => st.setCheckout(false)]} />
      ) : (
        <form onSubmit={submit} noValidate className="space-y-3">
          {manual ? (
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">Адрес пункта 5Post</span>
              <Input value={point} onChange={(e) => { setPoint(e.target.value); setErr('') }} placeholder="Улица, дом — «Пятёрочка», «Перекрёсток» или постамат" maxLength={200} className="h-12 rounded-lg bg-white text-[16px]" />
              <span className="mt-1.5 block text-xs text-txt-2">Не знаете точный адрес — напишите улицу или район, подберём ближайший пункт и перезвоним.</span>
            </label>
          ) : (
            <>
              <Suspense fallback={<div className="flex h-[260px] items-center justify-center"><Loader2 className="size-6 animate-spin text-txt-2" /></div>}>
                <PickupPicker value={pt} onChange={(p) => { setPt(p); setErr('') }} />
              </Suspense>
            </>
          )}
          <button type="button" onClick={() => { setManual(!manual); setErr('') }} className="text-sm text-violet-dark underline">{manual ? 'Выбрать на карте' : 'Нет нужного пункта? Напишите адрес'}</button>
          <div className="sticky -bottom-5 z-10 -mx-5 -mb-5 flex flex-col gap-2 border-t border-gray-2 bg-white px-5 py-3 shadow-[0_-6px_16px_rgba(0,0,0,0.06)] sm:static sm:mx-0 sm:mb-0 sm:flex-row sm:items-center sm:gap-3 sm:rounded-lg sm:border-0 sm:p-4 sm:shadow-none">
            <div className="min-w-0 flex-1 text-sm">
              {!manual && (pt ? <div className="flex items-start gap-1.5 font-semibold"><Check className="mt-0.5 size-4 shrink-0 text-violet-dark" /><span>{pickupPointDelivery(pt)}</span></div> : <div className="text-txt-2">Пункт ещё не выбран — нажмите на него в списке</div>)}
              <div className="hidden text-txt-2 sm:block"><span className="text-ink">{fullName}</span> · <span className="whitespace-nowrap">{st.user.phone}</span> · <button type="button" onClick={() => st.setUser(null)} className="underline hover:text-ink">Не вы?</button></div>
            </div>
            <Button type="submit" disabled={busy || (!manual && !pt)} className={cn(inkBtn, 'h-12 w-full shrink-0 px-8 text-base sm:w-auto')}>Перейти к оплате</Button>
          </div>
          {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
        </form>
      )}
    </>
  )
}

// Платёжный виджет (pay-widget от Fable): СБП + карта, сервер оплаты на VPS. Пока тестовый режим — деньги не списываются.
const PAY_API = import.meta.env.VITE_PAY_API || 'https://136.234.25.25/pay'
let payScript
const loadPay = () => payScript || (payScript = new Promise((ok, fail) => {
  if (window.PayWidget) return ok(window.PayWidget)
  const el = document.createElement('script')
  el.src = `${BASE}pay-widget.js`
  el.onload = () => ok(window.PayWidget)
  el.onerror = () => { payScript = null; fail(new Error('pay-widget')) }
  document.head.appendChild(el)
}))
const payCustomer = () => {
  try {
    let id = localStorage.getItem('wf-pay-cid')
    if (!id) { id = 'c' + crypto.getRandomValues(new Uint32Array(4)).join(''); localStorage.setItem('wf-pay-cid', id) }
    return id
  } catch { return undefined }
}
const openPay = () => loadPay()

function Login() {
  return <AuthFlow note="Войдите, чтобы видеть свои заказы, избранное и пользоваться личным кабинетом." />
}

// Привязка мессенджеров: покупатель открывает нашего бота и делится номером — коды для входа приходят туда, звонить не нужно
function LinkedMessengers() {
  const [info, setInfo] = useState(undefined) // undefined — проверяем, null — CRM недоступна
  useEffect(() => { messengerInfo().then(setInfo) }, [])
  const btn = 'flex h-11 min-w-0 items-center justify-center gap-2 px-2 rounded-lg text-sm font-semibold transition-colors'
  const mark = <span className="flex items-center gap-0.5 whitespace-nowrap text-xs font-medium"><Check className="size-3.5" />подключён</span>
  return (
    <div className="rounded-lg border border-gray-2 p-4 @container">
      <div className="font-semibold">Коды для входа</div>
      <p className="mt-1 text-sm text-txt-2">Откройте нашего бота и нажмите «Авторизоваться» — коды будут приходить туда, и звонить для входа не придётся.</p>
      {info === undefined ? <p className="mt-3 text-sm text-txt-2">Проверяем подключение…</p> : info === null ? <p className="mt-3 text-sm text-txt-2">Сервис входа временно недоступен. Попробуйте позже.</p> : <div className="mt-3 grid grid-cols-1 gap-2 @min-[270px]:grid-cols-2">
        {[['telegram', TgIcon], ['max', MaxIcon]].map(([c, I]) => {
          const bot = info.bots.find((b) => b.type === c)
          const on = info.linked.includes(c)
          if (!bot) return <div key={c} className={cn(btn, 'bg-gray-1 text-txt-2')}><I className="size-6 opacity-50" />{channelNames[c]} скоро</div>
          return <a key={c} href={botLink(bot)} target="_blank" rel="noreferrer" className={cn(btn, on ? 'bg-violet-soft text-violet-dark' : 'bg-gray-1 hover:bg-gray-2')}><I className="size-6" /><span className="flex min-w-0 flex-col items-start leading-tight"><span className="truncate">{channelNames[c]}</span>{on && mark}</span></a>
        })}
      </div>}
      {info && <button type="button" onClick={() => { setInfo(undefined); messengerInfo().then(setInfo) }} className="mt-2 text-xs text-txt-2 underline hover:text-ink">Я поделился номером — обновить</button>}
    </div>
  )
}

// Личные данные: имя, фамилия, дата рождения сохраняются сразу; новый номер — только после кода
function EditProfile({ onClose }) {
  const st = useStore()
  const u = st.user
  const [f, setF] = useState({ name: u.name || '', surname: u.surname || '', birth: u.birth || '', phone: u.phone, code: '', email: u.email || '', newPass: '' })
  const [step, setStep] = useState('form') // form | code
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(null)
  const started = useRef(Date.now() - 5000)
  const today = new Date().toISOString().slice(0, 10)
  const inp = 'h-12 rounded-lg bg-white text-[16px]'
  const same = f.phone.replace(/\D/g, '') === u.phone.replace(/\D/g, '')
  const finish = async (phone) => {
    const acc = { name: f.name.trim(), surname: f.surname.trim(), birth: f.birth }
    const live = authLiveNow()
    const sv = await saveAccount(phone, live ? { ...acc, email: f.email.trim().toLowerCase() } : acc)
    if (sv?.error) {
      // checkCode/callStatus уже сохранил новую CRM-сессию и lastCheck для перенесённого номера.
      // Синхронизируем профиль Store, чтобы повторить saveAccount с этой обычной новой сессией.
      if (live && phone !== u.phone) st.setUser({ ...u, phone })
      setStep('form'); setErr(sv.error); return false
    }
    acc.email = f.email.trim().toLowerCase()
    if (f.newPass) await setPassword(phone, f.newPass)
    st.setUser({ ...u, ...acc, phone })
    onClose(true)
  }
  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    if (step === 'code') {
      if (f.code.length !== 4) return setErr('Введите 4 цифры')
      setBusy(true)
      const r = await checkCode(f.phone, f.code, { move: true })
      if (r.error) { setBusy(false); return setErr(r.error) }
      await finish(f.phone)
      return setBusy(false)
    }
    if (f.name.trim().length < 2) return setErr('Введите имя')
    if (f.birth && (f.birth > today || f.birth < '1900-01-01')) return setErr('Проверьте дату рождения')
    if (f.phone.replace(/\D/g, '').length !== 11) return setErr('Введите телефон полностью')
    if (f.email.trim() && !isEmail(f.email)) return setErr('Проверьте адрес почты')
    if (f.newPass && f.newPass.length < authConfig.minPassword) return setErr(`Пароль — не короче ${authConfig.minPassword} символов`)
    if (f.email.trim() && phoneFor(f.email) && phoneFor(f.email) !== u.phone.replace(/\D/g, '')) return setErr('Эта почта уже привязана к другому аккаунту')
    setBusy(true)
    if (same) { await finish(u.phone); return setBusy(false) }
    if (await findAccount(f.phone)) { setBusy(false); return setErr('Этот номер уже привязан к другому аккаунту') }
    await requestCode('')
    setBusy(false)
  }
  // via: 'call' — подтвердить новый номер звонком вместо кода в мессенджере
  const requestCode = async (via) => {
    const r = await sendCode(f.phone, { startedAt: started.current, via })
    if (r.error) return setErr(r.error)
    setErr(''); setSent(r); setStep('code')
  }
  const byCall = step === 'code' && sent?.channel === 'call'
  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-lg bg-gray-1 p-4">
      <div className="flex items-center justify-between"><div className="font-bold">Личные данные</div><button type="button" onClick={() => onClose(false)} className="text-sm text-txt-2 underline hover:text-ink">Отмена</button></div>
      {step === 'form' ? (
        <>
          <label className="block"><span className="mb-1 block text-xs text-txt-2">Имя</span><Input autoComplete="given-name" maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inp} /></label>
          <label className="block"><span className="mb-1 block text-xs text-txt-2">Фамилия (необязательно)</span><Input autoComplete="family-name" maxLength={60} value={f.surname} onChange={(e) => setF({ ...f, surname: e.target.value })} className={inp} /></label>
          <label className="block"><span className="mb-1 block text-xs text-txt-2">Дата рождения</span><Input type="date" autoComplete="bday" min="1900-01-01" max={today} value={f.birth} onChange={(e) => setF({ ...f, birth: e.target.value })} className={inp} /></label>
          <label className="block"><span className="mb-1 block text-xs text-txt-2">Телефон — для входа и смс о заказах</span><Input type="tel" autoComplete="tel" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: fmtPhone(e.target.value) })} className={inp} /></label>
          <label className="block"><span className="mb-1 block text-xs text-txt-2">Электронная почта — необязательно. По ней можно входить и получать письма о заказах</span><Input type="email" autoComplete="email" inputMode="email" placeholder="name@mail.ru" maxLength={120} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={inp} /></label>
          <label className="block"><span className="mb-1 block text-xs text-txt-2">Новый пароль — если хотите сменить</span><PassInput value={f.newPass} onChange={(v) => setF({ ...f, newPass: v })} placeholder="Новый пароль" autoComplete="new-password" /></label>
          {!same && <p className="text-xs text-txt-2">Новый номер подтвердим кодом в Telegram или Max, а если их нет — звонком.</p>}
        </>
      ) : byCall ? (
        <CallBox login={f.phone} sent={sent} move onDone={async () => { setBusy(true); await finish(f.phone); setBusy(false) }}
          onRetry={() => requestCode('call')} onChangePhone={() => { setStep('form'); setErr('') }} />
      ) : (
        <>
          <p className="text-[15px]">Код отправлен {`в ${channelNames[sent?.channel]}`}. <button type="button" className="text-violet-dark underline" onClick={() => { setStep('form'); setErr('') }}>Изменить номер</button></p>
          <Input aria-label="Код" autoFocus placeholder="Код" inputMode="numeric" autoComplete="one-time-code" maxLength={4} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.replace(/\D/g, '') })} className="h-12 rounded-lg bg-white text-center text-xl tracking-[.5em]" />
          <button type="button" onClick={() => requestCode('call')} className="text-sm text-violet-dark underline">Нет кода? Подтвердить номер звонком</button>
        </>
      )}
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      {!byCall && <Button type="submit" disabled={busy} className={cn(inkBtn, 'h-12 w-full text-base')}>{busy ? <Loader2 className="size-5 animate-spin" /> : step === 'code' ? 'Подтвердить номер' : !same ? 'Подтвердить номер' : 'Сохранить'}</Button>}
    </form>
  )
}

const ORDER_STATUS_BADGE = {
  new: 'bg-violet-soft text-violet-dark',
  confirmed: 'bg-sky-100 text-sky-700',
  packed: 'bg-amber-100 text-amber-700',
  shipped: 'bg-sky-100 text-sky-700',
  delivered: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-rose-100 text-rose-700',
}

function Profile({ nav }) {
  const st = useStore()
  const [edit, setEdit] = useState(false)
  const [saved, setSaved] = useState(false)
  const [live, setLive] = useState({}) // { [orderNumber]: { status, status_label } }
  const bday = st.user.birth ? new Date(st.user.birth + 'T00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
  useEffect(() => {
    if (!crmEnabled) return
    let cancelled = false
    Promise.all(st.orders.map((o) => fetchOrderStatus(o.n, o.contact?.phone || st.user.phone).then((r) => [o.n, r]))).then((pairs) => {
      if (cancelled) return
      setLive((prev) => ({ ...prev, ...Object.fromEntries(pairs.filter(([, r]) => r)) }))
    })
    return () => { cancelled = true }
  }, [st.orders.length, st.user.phone])
  // заказы из CRM: история не теряется при очистке браузера и видна на любом устройстве
  useEffect(() => {
    let off = false
    myOrders().then((list) => {
      if (off || !list) return
      st.setOrders((cur) => {
        const known = new Map(list.map((o) => [String(o.n), o]))
        const localOnly = cur.filter((o) => !known.has(String(o.n)))
        // только что оформленные (ещё не дошли до CRM) — сверху, дальше история из CRM, новые первыми
        return [...localOnly, ...list.map((o) => ({ ...(cur.find((c) => String(c.n) === String(o.n)) || {}), ...o }))]
      })
    })
    return () => { off = true }
  }, [st.user.phone])
  // почта из CRM (могли добавить на другом устройстве или при регистрации по почте)
  useEffect(() => { messengerInfo().then((r) => { if (r && (r.email || '') !== (st.user.email || '')) st.setUser({ ...st.user, email: r.email || '' }) }) }, [st.user.phone])
  return (
    <div className="space-y-5">
      {edit ? <EditProfile onClose={(ok) => { setEdit(false); setSaved(ok === true) }} /> : (
        <div className="rounded-lg bg-gray-1 p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-violet-dark text-lg font-bold text-white">{st.user.name[0]?.toUpperCase()}</span>
            <div className="min-w-0 flex-1"><div className="font-bold">{[st.user.name, st.user.surname].filter(Boolean).join(' ')}</div><div className="whitespace-nowrap text-sm text-txt-2">{st.user.phone}</div>{st.user.email ? <div className="truncate text-sm text-txt-2">{st.user.email}</div> : <button type="button" onClick={() => { setEdit(true); setSaved(false) }} className="mt-1 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-red-200 bg-red-50 py-0.5 pl-2 pr-2.5 text-xs font-semibold leading-5 text-ink hover:bg-red-100"><span className="relative flex size-2" aria-hidden><span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-red-500" /></span>Добавить почту</button>}{bday && <div className="text-sm text-txt-2">{bday}</div>}</div>
            <button onClick={() => st.setUser(null)} className="flex items-center gap-1 self-start text-sm text-txt-2 hover:text-ink"><LogOut className="size-4" />Выйти</button>
          </div>
          <button onClick={() => { setEdit(true); setSaved(false) }} className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-violet-dark hover:underline"><Pencil className="size-3.5" />Изменить личные данные</button>
          {saved && <p className="mt-1 text-xs text-txt-2">Изменения сохранены</p>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => st.setPanel('fav')} className="rounded-lg border border-gray-2 p-4 text-left hover:bg-gray-1"><Heart className="mb-2 size-5" /><div className="font-semibold">Избранное</div><div className="text-sm text-txt-2">{st.fav.length} шт.</div></button>
        <button onClick={() => st.setPanel('cart')} className="rounded-lg border border-gray-2 p-4 text-left hover:bg-gray-1"><ShoppingBag className="mb-2 size-5" /><div className="font-semibold">Корзина</div><div className="text-sm text-txt-2">{st.count} шт.</div></button>
      </div>
      <LinkedMessengers />
      <div>
        <div className="mb-3 text-lg font-extrabold">Мои заказы</div>
        {!st.orders.length && <p className="text-sm text-txt-2">Заказов пока нет. <button className="text-violet-dark underline" onClick={() => { st.setPanel(null); nav.show({}) }}>Перейти в каталог</button></p>}
        <div className="space-y-2">
          {st.orders.map((o) => {
            const l = live[o.n]
            return (
            <div key={o.n} className="rounded-lg border border-gray-2 p-4">
              <div className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-2 whitespace-nowrap font-semibold"><Package className="size-4 shrink-0" />Заказ №{o.n}</span><span className={cn('shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium leading-none', ORDER_STATUS_BADGE[l?.status] || 'bg-violet-soft text-violet-dark')}>{l?.status_label || 'Принят'}</span></div>
              <div className="mt-1 text-sm text-txt-2">{o.date} · {o.items.reduce((s, i) => s + i.qty, 0)} шт. · {rub(o.total)}</div>
              <div className="mt-2 text-xs text-txt-2">{o.items.map((i) => `${i.line} ${i.w} ×${i.qty}`).join(', ')}</div>
              {o.contact?.delivery && <div className="mt-1 text-xs text-txt-2">{o.contact.delivery}</div>}
            </div>
          )})}
        </div>
      </div>
    </div>
  )
}
