const fallbackBrands = { p: 'Пятёрочка', x: 'Перекрёсток' }

export const pickupPointsUrl = (api, key) => api && key
  ? `${api.replace(/\/$/, '')}/api/public/pickup-points?key=${encodeURIComponent(key)}`
  : ''

export const pickupPointLabel = (p) => p?.source === '5post'
  ? [p.name || '5Post', p.address].filter(Boolean).join(', ')
  : `${fallbackBrands[p?.b] || '5Post'}, ${p?.a || ''}`

export const pickupPointDelivery = (p) => pickupPointLabel(p)
