export const CRM_CATALOG_META = '__crm_catalog_meta__'

export const markCatalogSynced = (products) => ({
  [CRM_CATALOG_META]: { synced: true },
  ...products,
})

export const catalogEntries = (catalog) => Object.entries(catalog || {}).filter(([id]) => id !== CRM_CATALOG_META)

export const catalogWasSynced = (catalog) => catalog?.[CRM_CATALOG_META]?.synced === true || catalogEntries(catalog).length > 0
