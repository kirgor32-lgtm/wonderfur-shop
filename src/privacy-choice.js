export const CONSENT_EDITION = 'wf-e7fc67812b5d74ff'
export const COOKIE_EDITION = 2

export function cookieChoice(storage = localStorage) {
  try {
    const choice = JSON.parse(storage.getItem('wf-cookies'))
    return choice?.edition === COOKIE_EDITION && ['all', 'necessary'].includes(choice.v) ? choice.v : null
  } catch { return null }
}
