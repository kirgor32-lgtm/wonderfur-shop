import assert from 'node:assert/strict'
import { pickupPointLabel, pickupPointDelivery, pickupPointsUrl } from '../src/pickup.js'

const fp = { source: '5post', name: 'Постамат 5Post', address: 'Ленинградская область, Всеволожск, Колтушское шоссе, 5', type: 'POSTAMAT' }
assert.equal(pickupPointLabel(fp), 'Постамат 5Post, Ленинградская область, Всеволожск, Колтушское шоссе, 5')
assert.equal(pickupPointDelivery(fp), 'Постамат 5Post, Ленинградская область, Всеволожск, Колтушское шоссе, 5')
assert.equal(pickupPointsUrl('https://crm.example/', 'pk_test'), 'https://crm.example/api/public/pickup-points?key=pk_test')
assert.equal(pickupPointsUrl('', 'pk_test'), '')
assert.equal(pickupPointLabel({ b: 'p', a: 'Невский проспект, 1' }), 'Пятёрочка, Невский проспект, 1')
console.log('Pickup helpers tests passed')
