import type { CatalogueItem } from '@/app/api/catalogue/search/route'

export const LIBRARIES = {
  malraux: 'Médiathèque André Malraux',
  neudorf: 'Médiathèque Neudorf',
} as const

export type LibraryKey = keyof typeof LIBRARIES | 'all' | 'malraux_neudorf'

export type WishlistDef = {
  id: string
  name: string
  icon: string
  docType: string
  subject: string
  queryExtra: string
  builtIn: boolean
  hidden?: boolean
}

export type WishlistItem = {
  id: string
  listId: string
  title: string
  addedAt: number
  status: 'idle' | 'checking' | 'found' | 'not_found' | 'error'
  match: CatalogueItem | null
  checkedAt: number | null
  foundAt: string | null
}

export type WishlistStore = {
  lists: WishlistDef[]
  items: WishlistItem[]
  defaultLibrary: LibraryKey
}

const STORAGE_KEY = 'mediatheques_wishlists_v2'

export const DEFAULT_LISTS: WishlistDef[] = [
  { id: 'ps5',    name: 'Jeux PS5',       icon: '🎮', docType: 'Jeu vidéo',   subject: 'PS5', queryExtra: '',        builtIn: true },
  { id: 'ps4',    name: 'Jeux PS4',       icon: '🕹️', docType: 'Jeu vidéo',   subject: 'PS4', queryExtra: '',        builtIn: true },
  { id: 'bluray', name: 'Films Blu-ray',  icon: '🎬', docType: 'Vidéo',       subject: '',    queryExtra: 'blu-ray', builtIn: true },
  { id: 'films',  name: 'Films',          icon: '🎥', docType: 'Vidéo',       subject: '',    queryExtra: '',        builtIn: true },
  { id: 'bd',     name: 'BD & Manga',     icon: '📚', docType: 'BD ou manga', subject: '',    queryExtra: '',        builtIn: true },
  { id: 'livres', name: 'Livres',         icon: '📖', docType: 'Livre',       subject: '',    queryExtra: '',        builtIn: true },
]

type StoredPayload = {
  lists: WishlistDef[]           // custom lists only
  items: WishlistItem[]
  defaultLibrary: LibraryKey
  removedBuiltInIds?: string[]   // built-ins permanently deleted
  hiddenBuiltInIds?: string[]    // built-ins hidden (not deleted)
  allOrderedIds?: string[]       // full display order (built-in + custom interleaved)
}

function emptyStore(): WishlistStore {
  return { lists: DEFAULT_LISTS, items: [], defaultLibrary: 'malraux_neudorf' }
}

export function loadStore(): WishlistStore {
  if (typeof window === 'undefined') return emptyStore()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as StoredPayload
    const removedIds = new Set(parsed.removedBuiltInIds ?? [])
    const hiddenIds = new Set(parsed.hiddenBuiltInIds ?? [])
    const orderedIds = parsed.allOrderedIds ?? []

    const builtIns = DEFAULT_LISTS
      .filter(d => !removedIds.has(d.id))
      .map(d => ({ ...d, hidden: hiddenIds.has(d.id) }))

    const customLists = (parsed.lists ?? []).filter(l => !l.builtIn)

    const merged = [...builtIns, ...customLists]

    if (orderedIds.length > 0) {
      merged.sort((a, b) => {
        const ai = orderedIds.indexOf(a.id)
        const bi = orderedIds.indexOf(b.id)
        if (ai === -1 && bi === -1) return 0
        if (ai === -1) return 1
        if (bi === -1) return -1
        return ai - bi
      })
    }

    return {
      lists: merged,
      items: parsed.items ?? [],
      defaultLibrary: parsed.defaultLibrary ?? 'malraux_neudorf',
    }
  } catch {
    return emptyStore()
  }
}

export function saveStore(store: WishlistStore): void {
  const removedBuiltInIds = DEFAULT_LISTS
    .filter(d => !store.lists.some(l => l.id === d.id))
    .map(d => d.id)
  const hiddenBuiltInIds = store.lists
    .filter(l => l.builtIn && l.hidden)
    .map(l => l.id)
  const toSave: StoredPayload = {
    lists: store.lists.filter(l => !l.builtIn),
    items: store.items,
    defaultLibrary: store.defaultLibrary,
    removedBuiltInIds,
    hiddenBuiltInIds,
    allOrderedIds: store.lists.map(l => l.id),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
}

export function addItem(store: WishlistStore, listId: string, title: string): WishlistStore {
  const t = title.trim()
  if (!t) return store
  const alreadyExists = store.items.some(
    i => i.listId === listId && i.title.toLowerCase() === t.toLowerCase()
  )
  if (alreadyExists) return store
  const item: WishlistItem = {
    id: `${listId}_${Date.now()}`,
    listId,
    title: t,
    addedAt: Date.now(),
    status: 'idle',
    match: null,
    checkedAt: null,
    foundAt: null,
  }
  return { ...store, items: [item, ...store.items] }
}

export function removeItem(store: WishlistStore, itemId: string): WishlistStore {
  return { ...store, items: store.items.filter(i => i.id !== itemId) }
}

export function updateItem(store: WishlistStore, updated: WishlistItem): WishlistStore {
  return { ...store, items: store.items.map(i => i.id === updated.id ? updated : i) }
}

export function addCustomList(store: WishlistStore, def: Omit<WishlistDef, 'builtIn'>): WishlistStore {
  return { ...store, lists: [...store.lists, { ...def, builtIn: false }] }
}

export function removeList(store: WishlistStore, listId: string): WishlistStore {
  return {
    ...store,
    lists: store.lists.filter(l => l.id !== listId),
    items: store.items.filter(i => i.listId !== listId),
  }
}

export function removeCustomList(store: WishlistStore, listId: string): WishlistStore {
  return removeList(store, listId)
}

type CloudItem = { id: string; listId: string; title: string; addedAt: number }
type CloudPayload = {
  lists: WishlistDef[]
  items: CloudItem[]
  defaultLibrary: LibraryKey
  removedBuiltInIds?: string[]
  hiddenBuiltInIds?: string[]
  allOrderedIds?: string[]
}

export async function saveToCloud(store: WishlistStore): Promise<void> {
  const removedBuiltInIds = DEFAULT_LISTS
    .filter(d => !store.lists.some(l => l.id === d.id))
    .map(d => d.id)
  const hiddenBuiltInIds = store.lists
    .filter(l => l.builtIn && l.hidden)
    .map(l => l.id)
  const payload: CloudPayload = {
    lists: store.lists.filter(l => !l.builtIn),
    items: store.items.map(({ id, listId, title, addedAt }) => ({ id, listId, title, addedAt })),
    defaultLibrary: store.defaultLibrary,
    removedBuiltInIds,
    hiddenBuiltInIds,
    allOrderedIds: store.lists.map(l => l.id),
  }
  const res = await fetch('/api/wishlists', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wishlists: payload }),
  })
  if (!res.ok) throw new Error(`Cloud save failed: ${res.status}`)
}

export async function loadFromCloud(): Promise<WishlistStore | null> {
  try {
    const res = await fetch('/api/wishlists')
    if (!res.ok) return null
    const json = await res.json() as { wishlists?: CloudPayload }
    if (!json.wishlists) return null
    const p = json.wishlists
    const removedIds = new Set(p.removedBuiltInIds ?? [])
    const hiddenIds = new Set(p.hiddenBuiltInIds ?? [])
    const orderedIds = p.allOrderedIds ?? []

    const builtIns = DEFAULT_LISTS
      .filter(d => !removedIds.has(d.id))
      .map(d => ({ ...d, hidden: hiddenIds.has(d.id) }))

    const customLists = (p.lists ?? []).filter(l => !l.builtIn)
    const merged = [...builtIns, ...customLists]

    if (orderedIds.length > 0) {
      merged.sort((a, b) => {
        const ai = orderedIds.indexOf(a.id)
        const bi = orderedIds.indexOf(b.id)
        if (ai === -1 && bi === -1) return 0
        if (ai === -1) return 1
        if (bi === -1) return -1
        return ai - bi
      })
    }

    const items: WishlistItem[] = (p.items ?? []).map(ci => ({
      id: ci.id, listId: ci.listId, title: ci.title, addedAt: ci.addedAt,
      status: 'idle' as const, match: null, checkedAt: null, foundAt: null,
    }))
    return { lists: merged, items, defaultLibrary: p.defaultLibrary ?? 'malraux_neudorf' }
  } catch {
    return null
  }
}

export function mergeStores(local: WishlistStore, cloud: WishlistStore): WishlistStore {
  // Local wins for item status (availability data is ephemeral and device-fresh)
  const itemMap = new Map<string, WishlistItem>()
  for (const item of cloud.items) itemMap.set(item.id, item)
  for (const item of local.items) itemMap.set(item.id, item)

  // Cloud wins for custom list definitions (last save = intended state)
  const listMap = new Map<string, WishlistDef>()
  for (const l of local.lists.filter(l => !l.builtIn)) listMap.set(l.id, l)
  for (const l of cloud.lists.filter(l => !l.builtIn)) listMap.set(l.id, l)

  // Cloud wins for built-in order and visibility (syncs across devices)
  const cloudBuiltIns = cloud.lists.filter(l => l.builtIn)
  const builtIns = cloudBuiltIns.length > 0
    ? cloudBuiltIns
    : local.lists.filter(l => l.builtIn) // fallback to local if cloud has no built-in data yet

  return {
    lists: [...builtIns, ...Array.from(listMap.values())],
    items: Array.from(itemMap.values()),
    defaultLibrary: cloud.defaultLibrary ?? local.defaultLibrary,
  }
}

export function libraryLabel(key: LibraryKey): string {
  switch (key) {
    case 'all': return 'Tout le réseau'
    case 'malraux': return 'André Malraux'
    case 'neudorf': return 'Neudorf'
    case 'malraux_neudorf': return 'Malraux + Neudorf'
  }
}
