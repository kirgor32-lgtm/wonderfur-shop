// Вход и регистрация покупателя — как у «Четырёх лап»:
// 1) телефон или почта → «Продолжить»;
// 2) номер уже зарегистрирован → вход по паролю («Забыли пароль?» — пришлём новый);
//    номер новый → код подтверждения → «Зарегистрироваться» → короткая анкета с паролем.
//
// Куда уходит код или новый пароль — по приоритету: Telegram → Max (на почту — для входа по почте).
// Нет мессенджера — номер подтверждается звонком: покупатель звонит на выданный номер («Плюсофон»,
// обратный Flash Call), CRM получает вебхук, и вход открывается сам — сайт опрашивает callStatus().
// Коды, пароли и учётные записи обслуживаются CRM; при её отсутствии вход закрыт.
// Важно: проверки в браузере — первый барьер, обойти их можно. Настоящие лимиты
// и проверка капчи обязательно должны дублироваться на сервере.

import { crmConfig, crmEnabled } from './crm'

/* ---- связь с CRM: если она доступна, коды шлёт она (бот Telegram/Max) или выдаёт номер для звонка ---- */
const AUTH = crmEnabled ? crmConfig.api.replace(/\/$/, '') + '/api/public/auth/' : ''
let live = null // null — ещё не проверяли; false — CRM недоступна
const unavailable = () => ({ error: 'Сервис входа временно недоступен. Попробуйте позже.' })
async function post(path, body) {
  const r = await fetch(AUTH + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: crmConfig.key, ...body }) })
  return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) }
}
export async function authLive() {
  if (!AUTH) return false
  // 400/401 означает, что CRM отвечает, но сессии ещё нет; 5xx и сеть — сервис недоступен.
  if (live !== true) live = await post('me', {}).then((r) => r.status < 500, () => false)
  return live
}
export const authLiveNow = () => live === true
export const getSession = () => read('wf-session', null)
let lastCheck = null // { phone, account } — ответ CRM после верного кода или пароля

export const authConfig = {
  smartCaptchaKey: '', // ключ клиента Яндекс SmartCaptcha; пусто — капча не загружается
  resendSeconds: 60, // пауза перед повторной отправкой кода
  maxSendsPerHour: 3, // сколько раз за час можно запросить код на один номер
  maxWrongCodes: 5, // после стольких неверных кодов или паролей вход блокируется
  lockMinutes: 15,
  minFillMs: 1500, // форму, заполненную быстрее, считаем заполненной ботом
  minPassword: 6,
}

export const channelNames = { telegram: 'Telegram', max: 'Max', call: 'звонок', email: 'почту' }

const digits = (phone) => String(phone || '').replace(/\D/g, '')
export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim())
// ключ учётной записи: номер цифрами или «e:почта»
const idOf = (login) => (isEmail(login) ? 'e:' + login.trim().toLowerCase() : digits(login))
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* пусто */ } }

// +7 (***) ***-42-35 и a***@mail.ru — как в письме «мы отправили код на…»
export function maskLogin(login) {
  if (isEmail(login)) {
    const [u, d] = login.trim().split('@')
    return `${u[0]}***@${d}`
  }
  const d = digits(login)
  return `+7 (***) ***-${d.slice(7, 9)}-${d.slice(9, 11)}`
}

/* ---- Яндекс SmartCaptcha: загружается только если указан ключ ---- */
let captchaReady
function loadCaptcha() {
  if (!authConfig.smartCaptchaKey) return Promise.resolve(null)
  captchaReady ||= new Promise((ok, fail) => {
    const s = document.createElement('script')
    s.src = 'https://smartcaptcha.yandexcloud.net/captcha.js?render=onload'
    s.async = true
    s.onload = () => ok(window.smartCaptcha)
    s.onerror = fail
    document.head.appendChild(s)
  })
  return captchaReady
}
async function captchaToken() {
  const sc = await loadCaptcha()
  if (!sc) return null
  const box = document.createElement('div')
  document.body.appendChild(box)
  return new Promise((ok) => {
    const id = sc.render(box, { sitekey: authConfig.smartCaptchaKey, invisible: true, hideShield: true, callback: (t) => { box.remove(); ok(t) } })
    sc.execute(id)
  })
}

const phoneOf = (login) => (isEmail(login) ? (lastCheck?.email === idOf(login).slice(2) ? lastCheck.phone : '') : digits(login))
export const phoneFor = phoneOf // номер аккаунта по номеру или почте

/* ---- шаг 1: есть ли такой покупатель ---- */
// { exists, password } — зарегистрирован ли номер/почта и задан ли пароль
export async function lookup(login, consent) {
  if (!(await authLive())) return unavailable()
  const em = isEmail(login) ? idOf(login).slice(2) : ''
  try {
    const r = await post('lookup', { ...(em ? { email: em } : { phone: digits(login) }), consent })
    if (r.ok && em && !r.body.email) return { error: 'Вход по почте пока не работает — войдите по номеру телефона' }
    return r.ok ? { exists: !!r.body.exists, password: !!r.body.password } : { error: r.body.error || 'Не получилось проверить номер' }
  } catch { live = false; return unavailable() }
}

/* ---- отправка кода или нового пароля ---- */
// trap — скрытое поле-ловушка (человек его не видит и не заполняет), startedAt — когда открыли форму
// via: 'call' — покупатель сам выбрал звонок
// Ответ со звонком: { channel: 'call', callId, callTo, expiresIn } — номер, на который надо позвонить
// kind: 'code' — 4 цифры для регистрации/смены номера, 'reset' — новый пароль из 6 цифр («Забыли пароль?»)
export async function sendCode(login, { trap = '', startedAt = 0, via = '', kind = 'code' } = {}) {
  if (trap) return { error: 'Не удалось отправить код. Попробуйте ещё раз.' }
  if (Date.now() - startedAt < authConfig.minFillMs) return { error: 'Слишком быстро. Проверьте данные и нажмите ещё раз.' }
  const email = isEmail(login)
  if (await authLive()) {
    // лимиты и выбор канала — на стороне CRM
    try {
      const captcha = await captchaToken()
      const r = await post('send-code', email ? { email: idOf(login).slice(2), captcha, kind } : { phone: digits(login), via, captcha, kind })
      return r.ok ? r.body : { error: r.body.error || 'Не удалось отправить код', resendIn: r.body.resendIn }
    } catch { live = false; return unavailable() }
  }
  return unavailable()
}

/* ---- подтверждение звонком: позвонил ли покупатель ---- */
// → { confirmed: false } пока ждём; { ok: true, confirmed: true } — вход открыт (как после верного кода);
// { error } — время вышло
export async function callStatus(login, callId, { move = false, demo = false } = {}) {
  if (await authLive()) {
    try {
      const r = await post('call-status', { phone: digits(login), id: callId, move, demo, token: getSession()?.token })
      if (!r.ok) return { error: r.body.error || 'Не получилось проверить звонок' }
      if (!r.body.confirmed) return { confirmed: false }
      write('wf-session', { token: r.body.token, phone: digits(login) })
      lastCheck = { phone: digits(login), account: r.body.account }
      return { ok: true, confirmed: true }
    } catch { return unavailable() }
  }
  return unavailable()
}

/* ---- проверка кода (или пароля из сообщения «Забыли пароль?») ---- */
// move — покупатель меняет номер в личных данных: CRM перенесёт аккаунт на новый номер
export async function checkCode(login, code, { move = false } = {}) {
  code = String(code || '').trim()
  if (await authLive()) {
    try {
      const em = isEmail(login) ? idOf(login).slice(2) : ''
      const r = await post('check-code', em ? { email: em, code } : { phone: digits(login), code, move, token: getSession()?.token })
      if (!r.ok) return { error: r.body.error || 'Неверный код' }
      const ph = em ? r.body.phone || '' : digits(login)
      write('wf-session', { token: r.body.token, phone: ph })
      lastCheck = { phone: ph, account: r.body.account, email: em || r.body.account?.email || '' }
      return { ok: true, phone: ph, account: r.body.account }
    } catch { return unavailable() }
  }
  return unavailable()
}

/* ---- вход по паролю ---- */
// → { ok, phone, account } — phone нужен, если входили по почте
export async function loginPassword(login, pass) {
  if (await authLive()) {
    try {
      const em = isEmail(login) ? idOf(login).slice(2) : ''
      const r = await post('login', em ? { email: em, password: pass } : { phone: digits(login), password: pass })
      if (!r.ok) return { error: r.body.error || 'Неверный пароль' }
      const ph = r.body.phone || digits(login)
      write('wf-session', { token: r.body.token, phone: ph })
      lastCheck = { phone: ph, account: r.body.account, email: em }
      return { ok: true, phone: ph, account: r.body.account }
    } catch { return unavailable() }
  }
  return unavailable()
}

// Новый пароль — после проверки кода (регистрация, «Забыли пароль?») или в личных данных
export async function setPassword(phone, pass) {
  if (await authLive()) {
    const r = await post('password', { token: getSession()?.token, password: pass }).catch(() => null)
    return r?.ok ? { ok: true } : { error: r?.body?.error || 'Не получилось сохранить пароль' }
  }
  return unavailable()
}

/* ---- учётные записи покупателей ---- */
// Есть ли аккаунт на этот номер (после проверки кода).
export async function findAccount(phone) {
  if (!(await authLive())) return null
  return lastCheck?.phone === digits(phone) ? lastCheck.account : null // занятость нового номера проверит CRM (move)
}
export async function saveAccount(phone, acc) {
  if (await authLive()) {
    if (!acc) return // старый номер CRM отвязала сама при смене
    // phone — для регистрации по почте: CRM создаст аккаунт на этот номер; acc.email — почта из личного кабинета (по желанию)
    const r = await post('account', { token: getSession()?.token, account: acc, phone: digits(phone) }).catch(() => null)
    if (!r?.ok) return { error: r?.body?.error || 'Не получилось сохранить данные' }
    if (r.body.phone) { write('wf-session', { token: getSession()?.token, phone: r.body.phone }); lastCheck = { phone: r.body.phone, account: r.body.account, email: r.body.account?.email || '' } }
    return { ok: true, account: r.body.account }
  }
  return unavailable()
}
// Какие боты подключены к номеру (по данным CRM). null — CRM недоступна или вход был в демо
export async function messengerInfo() {
  const s = getSession()
  if (!(await authLive()) || !s) return null
  const r = await post('me', { token: s.token }).catch(() => null)
  return r?.ok ? { linked: r.body.linked || [], bots: r.body.bots || [], email: r.body.account?.email || '' } : null
}
// Заказы покупателя из CRM (null — CRM недоступна или не вошли через неё)
export async function myOrders() {
  const s = getSession()
  if (!(await authLive()) || !s?.token) return null
  const r = await post('orders', { token: s.token }).catch(() => null)
  return r?.ok && Array.isArray(r.body) ? r.body : null
}
// Подтвердил ли покупатель этот номер в нашем боте (сайт спрашивает, пока человек в Telegram/Max)
export async function isLinked(login) {
  if (!(await authLive())) return false
  const r = await post('linked', { phone: digits(login) }).catch(() => null)
  return !!r?.ok && !!r.body.linked
}
export const botLink = (b) => (b.type === 'telegram' ? `https://t.me/${b.username}` : `https://max.ru/${b.username}`)
