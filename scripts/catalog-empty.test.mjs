import assert from 'node:assert/strict'
import { catalogEntries, catalogWasSynced, markCatalogSynced } from '../src/crm-catalog.js'

const emptySynced = markCatalogSynced({})
assert.equal(catalogWasSynced(emptySynced), true, 'успешно загруженный пустой каталог должен считаться ответом CRM')
assert.deepEqual(catalogEntries(emptySynced), [], 'служебная метка не должна становиться товаром')
assert.equal(catalogWasSynced({}), false, 'старый пустой файл означает, что CRM ещё не ответила')
assert.equal(catalogWasSynced({ product: { weights: [] } }), true, 'старый непустой формат остаётся совместимым')

console.log('Проверка пустого каталога CRM пройдена')
