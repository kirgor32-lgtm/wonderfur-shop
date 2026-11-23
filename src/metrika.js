import { cookieChoice } from './privacy-choice.js'

const COUNTER_ID = 114630739
const CONSENT_EVENT = 'wf-consent'
const COOKIE_KEY = 'wf-cookies'
let loaded = false
let lastUrl = ''

const allowed = () => cookieChoice() === 'all'
const isProduction = () => location.hostname === 'zoopolka.ru' || location.hostname === 'www.zoopolka.ru'

function load() {
  if (loaded || !allowed() || !isProduction()) return
  loaded = true
  window.dataLayer = window.dataLayer || []
  window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments) }
  window.ym.l = Date.now()

  if (!document.querySelector(`script[src*="mc.yandex.ru/metrika/tag.js?id=${COUNTER_ID}"]`)) {
    const script = document.createElement('script')
    script.async = true
    script.src = `https://mc.yandex.ru/metrika/tag.js?id=${COUNTER_ID}`
    document.head.appendChild(script)
  }

  lastUrl = location.href
  window.ym(COUNTER_ID, 'init', {
    ssr: true,
    webvisor: true,
    clickmap: true,
    ecommerce: 'dataLayer',
    referrer: document.referrer,
    url: location.href,
    accurateTrackBounce: true,
    trackLinks: true,
  })
}

function stop() {
  if (!loaded || allowed()) return
  window.ym?.(COUNTER_ID, 'destruct')
  loaded = false
  lastUrl = ''
}

function sync() {
  if (allowed()) load()
  else stop()
}

function hit() {
  if (!loaded || !allowed()) return
  const url = location.href
  if (url === lastUrl) return
  lastUrl = url
  window.ym?.(COUNTER_ID, 'hit', url, { title: document.title })
}

export function initMetrika() {
  if (typeof window === 'undefined') return
  window.addEventListener(CONSENT_EVENT, sync)
  window.addEventListener('storage', (event) => {
    if (event.key === COOKIE_KEY || event.key === null) sync()
  })
  window.addEventListener('wf-route', hit)
  sync()
}
