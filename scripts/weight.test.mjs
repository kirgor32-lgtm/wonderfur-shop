import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const src = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const declarations = src.match(/^const (?:kg|perKg) = .+$/gm).join('\n')
const { kg, perKg } = new Function(`${declarations}\nreturn { kg, perKg }`)()
assert.equal(perKg({ w: '100 г', price: 111 }), 1110)
assert.equal(perKg({ w: '2 кг', price: 2760 }), 1380)
assert.equal(perKg({ w: '1,5 кг', price: 301 }), 201)
assert.equal(kg('400\u00a0г'), 0.4)
for (const w of ['100', '0 г', '3 шт', '100 г доп.', '']) assert.equal(perKg({ w, price: 111 }), null, w)
console.log('Вес и цена за килограмм: 9 проверок')
