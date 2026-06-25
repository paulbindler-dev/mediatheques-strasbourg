'use client'
import { useState, useEffect, useRef } from 'react'
import { Trash2, SlidersHorizontal, Eye, EyeOff, Bell } from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import CoverImg from '@/components/CoverImg'
import { ViewModeToggle, type ViewMode, TYPE_CONFIG, typeBadge } from '@/components/ViewModeToggle'
import type { CatalogueItem } from '@/app/api/catalogue/search/route'
import {
  loadStore, saveStore, addItem, removeItem, updateItem,
  addCustomList, removeList, libraryLabel,
  loadFromCloud, saveToCloud, mergeStores,
  DEFAULT_LISTS,
  type WishlistStore, type WishlistItem, type LibraryKey,
} from '@/lib/wishlists'

function titleMatches(resultTitle: string, searchTitle: string): boolean {
  const r = resultTitle.toLowerCase().trim()
  const s = searchTitle.toLowerCase().trim()
  if (r === s) return true
  const check = (longer: string, shorter: string) => {
    if (!longer.startsWith(shorter)) return false
    const rest = longer.slice(shorter.length).trimStart()
    return !rest || rest[0] === ':' || rest[0] === '-' || rest[0] === '('
  }
  return check(r, s) || check(s, r)
}

const LIBRARY_OPTIONS: { key: LibraryKey; label: string }[] = [
  { key: 'malraux_neudorf', label: 'Malraux + Neudorf' },
  { key: 'malraux',         label: 'André Malraux' },
  { key: 'neudorf',         label: 'Neudorf' },
  { key: 'all',             label: 'Tout le réseau' },
]

const LIBRARY_PARAM: Record<LibraryKey, string> = {
  malraux_neudorf: 'malraux_neudorf',
  malraux: 'Médiathèque André Malraux',
  neudorf: 'Médiathèque Neudorf',
  all: '',
}

const LIST_ICONS = ['🎮', '🕹️', '🎬', '🎥', '📚', '📖', '🎵', '🎭', '⭐', '❤️', '🔖', '🎯']

function migrateOldData(store: WishlistStore): WishlistStore {
  const OLD_KEY = 'mediatheques_wishlist_ps5'
  try {
    const raw = localStorage.getItem(OLD_KEY)
    if (!raw) return store
    const old = JSON.parse(raw) as { id: string; title: string; status: string; match: CatalogueItem | null; checkedAt: number | null }[]
    if (!old.length) return store

    const jeuxItems = store.items.filter(i => i.listId === 'jeux')
    if (jeuxItems.length > 0) { localStorage.removeItem(OLD_KEY); return store }

    const migrated: WishlistItem[] = old.map(o => ({
      id: o.id,
      listId: 'jeux',
      title: o.title,
      addedAt: parseInt(o.id) || Date.now(),
      status: (o.status as WishlistItem['status']) || 'idle',
      match: o.match,
      checkedAt: o.checkedAt,
      foundAt: null,
    }))

    localStorage.removeItem(OLD_KEY)
    const updated = { ...store, items: [...migrated, ...store.items] }
    saveStore(updated)
    return updated
  } catch {
    return store
  }
}

const DragHandle = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
    {[0, 1, 2].map(row => [0, 1].map(col => (
      <circle key={`${row}-${col}`} cx={4 + col * 8} cy={4 + row * 4} r={1.5} fill="currentColor" />
    )))}
  </svg>
)

type SortableListRowData = {
  id: string
  name: string
  icon: string
  hidden?: boolean
  itemCount: number
}

function SortableListRow({
  list, onToggleVisibility, onDelete,
}: {
  list: SortableListRowData
  onToggleVisibility: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: list.id })
  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 8px', borderRadius: 'var(--radius-sm)',
        opacity: isDragging ? 0.5 : list.hidden ? 0.4 : 1,
        transition: `opacity 0.15s, ${transition ?? ''}`,
        transform: CSS.Transform.toString(transform),
        zIndex: isDragging ? 1 : undefined,
        background: isDragging ? 'var(--bg)' : undefined,
      }}
    >
      <button
        onClick={onToggleVisibility}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', flexShrink: 0, color: list.hidden ? 'var(--text-2)' : 'var(--navy)', display: 'flex', alignItems: 'center' }}
      >
        {list.hidden ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
      </button>
      <span style={{ fontSize: '16px', flexShrink: 0 }}>{list.icon}</span>
      <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: 'var(--color-heading)' }}>
        {list.name}
        {list.itemCount > 0 && <span style={{ fontWeight: 400, color: 'var(--text-2)', marginLeft: '6px' }}>{list.itemCount}</span>}
      </span>
      <button
        {...attributes}
        {...listeners}
        style={{ background: 'none', border: 'none', cursor: 'grab', padding: '6px', color: 'var(--text-2)', display: 'flex', alignItems: 'center', flexShrink: 0, touchAction: 'none' }}
      >
        <DragHandle />
      </button>
      <button
        onClick={onDelete}
        style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'var(--error-bg)', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        title="Supprimer"
      >×</button>
    </div>
  )
}

export default function EnviesPage() {
  const [store, setStore] = useState<WishlistStore>(() => ({ lists: DEFAULT_LISTS, items: [], defaultLibrary: 'malraux_neudorf' }))
  const [activeList, setActiveListRaw] = useState<string>(() => {
    try { return localStorage.getItem('envies_active_list') ?? DEFAULT_LISTS[0].id } catch { return DEFAULT_LISTS[0].id }
  })
  function setActiveList(id: string) {
    setActiveListRaw(id)
    try { localStorage.setItem('envies_active_list', id) } catch {}
  }
  const [searchFilter, setSearchFilter] = useState('')
  const [globalChecking, setGlobalChecking] = useState(false)
  const [showNewListModal, setShowNewListModal] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [newListIcon, setNewListIcon] = useState('⭐')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [showManageModal, setShowManageModal] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('dots')
  const [watchedRscIds, setWatchedRscIds] = useState<Set<string>>(new Set())
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )
  const cloudSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cloudDirty = useRef(false)

  // Pull-to-refresh
  const contentRef = useRef<HTMLDivElement>(null)
  const pullStartYRef = useRef(0)
  const isPullingRef = useRef(false)
  const pullProgressRef = useRef(0)
  const [pullProgress, setPullProgress] = useState(0)
  const checkAllRef = useRef<() => void>(() => {})

  const VIEW_CYCLE: ViewMode[] = ['dots', 'list', 'grid2', 'grid3']

  useEffect(() => {
    const saved = localStorage.getItem('listes_view_mode')
    if (saved === 'icons' || saved === 'images') setViewMode('list')
    else if (['dots', 'list', 'grid2', 'grid3'].includes(saved ?? '')) setViewMode(saved as ViewMode)
  }, [])

  useEffect(() => {
    localStorage.setItem('listes_view_mode', viewMode)
  }, [viewMode])

  useEffect(() => {
    fetch('/api/watched-items')
      .then(r => r.ok ? r.json() : { rscIds: [] })
      .then((d: { rscIds?: string[] }) => {
        if (d.rscIds?.length) setWatchedRscIds(new Set(d.rscIds))
      })
      .catch(() => {})
  }, [])

  async function toggleWatch(rscId: string, title: string) {
    const isWatching = watchedRscIds.has(rscId)
    if (isWatching) {
      setWatchedRscIds(prev => { const s = new Set(prev); s.delete(rscId); return s })
      await fetch('/api/watched-items', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rscId }) }).catch(() => {})
    } else {
      setWatchedRscIds(prev => new Set(Array.from(prev).concat(rscId)))
      await fetch('/api/watched-items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rscId, title }) }).catch(() => {})
    }
  }

  useEffect(() => {
    const local = migrateOldData(loadStore())
    setStore(local)
    loadFromCloud().then(cloud => {
      if (!cloud) {
        if (local.items.length > 0 || local.lists.some(l => !l.builtIn)) {
          saveToCloud(local).catch(() => {})
        }
        return
      }
      setStore(prev => {
        const merged = mergeStores(prev, cloud)
        saveStore(merged)
        setActiveListRaw(cur => merged.lists.find(l => l.id === cur) ? cur : (merged.lists[0]?.id ?? cur))
        return merged
      })
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!cloudDirty.current) return
    cloudDirty.current = false
    if (cloudSaveTimer.current) clearTimeout(cloudSaveTimer.current)
    cloudSaveTimer.current = setTimeout(() => {
      saveToCloud(store).catch(() => {})
    }, 200)
    return () => {
      if (cloudSaveTimer.current) clearTimeout(cloudSaveTimer.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store])

  function mutate(updater: (s: WishlistStore) => WishlistStore) {
    setStore(prev => {
      const next = updater(prev)
      saveStore(next)
      cloudDirty.current = true
      return next
    })
  }

  function setLibrary(lib: LibraryKey) {
    mutate(s => ({ ...s, defaultLibrary: lib }))
  }

  const currentList = store.lists.find(l => l.id === activeList) ?? store.lists[0]

  const q = searchFilter.toLowerCase()
  const allItems = store.items
    .filter(i => i.listId === activeList)
    .filter(i => !q
      || i.title.toLowerCase().includes(q)
      || (i.match?.subject ?? '').toLowerCase().includes(q)
    )
  const found = allItems.filter(i => i.status === 'found')
  const notFound = allItems.filter(i => i.status === 'not_found')
  const pending = allItems.filter(i => ['idle', 'checking', 'error'].includes(i.status))

  async function checkItem(item: WishlistItem, library: LibraryKey) {
    mutate(s => updateItem(s, { ...item, status: 'checking' }))

    const list = store.lists.find(l => l.id === item.listId)
    const queryString = [item.title, list?.queryExtra].filter(Boolean).join(' ')

    function fetchWithTimeout(url: string, ms = 12000): Promise<Response> {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), ms)
      return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t))
    }

    try {
      let match: CatalogueItem | null = null
      let foundAt: string | null = null

      // Single search — no location filter. GetHoldings will tell us which library has it.
      // Exception: single-library mode still filters by library.
      const searchLoc = library === 'malraux_neudorf' ? '' : LIBRARY_PARAM[library]
      const params = new URLSearchParams({
        q: queryString,
        type: list?.docType ?? '',
        subject: list?.subject ?? '',
        location: searchLoc,
        size: '5',
      })
      const sRes = await fetchWithTimeout(`/api/catalogue/search?${params}`)
      const sData = await sRes.json() as { results?: CatalogueItem[]; error?: string }
      if (sData.error) throw new Error(sData.error)
      match = (sData.results ?? []).find(r => titleMatches(r.title, item.title)) ?? null

      if (match) {
        const hRes = await fetchWithTimeout(`/api/catalogue/holdings?rscId=${encodeURIComponent(match.rscId)}`)
        const h = await hRes.json() as {
          available?: boolean | null; dueDate?: string | null
          locations?: { site: string; available: boolean }[]
        }

        if (hRes.ok && h.available !== null && h.available !== undefined) {
          const locs = h.locations ?? []
          const mExists = locs.some(l => l.site.includes('Malraux'))
          const nExists = locs.some(l => l.site.includes('Neudorf'))
          const mAvail = locs.some(l => l.site.includes('Malraux') && l.available)
          const nAvail = locs.some(l => l.site.includes('Neudorf') && l.available)

          if (library === 'malraux_neudorf' && !mExists && !nExists) {
            // Item found in catalog but not at Malraux or Neudorf
            match = null
          } else {
            if (mAvail && nAvail) foundAt = 'both'
            else if (mAvail) foundAt = 'André Malraux'
            else if (nAvail) foundAt = 'Neudorf'
            else if (mExists) foundAt = 'André Malraux'
            else if (nExists) foundAt = 'Neudorf'
            else foundAt = libraryLabel(library)
            // Available = true only if a copy exists at the selected library
            const libAvailable = library === 'malraux' ? mAvail
              : library === 'neudorf' ? nAvail
              : library === 'malraux_neudorf' ? (mAvail || nAvail)
              : (h.available ?? false)
            match = { ...match, available: libAvailable, dueDate: h.dueDate ?? null }
          }
        } else {
          // Holdings unavailable — keep previous availability
          match = { ...match, available: item.match?.available, dueDate: item.match?.dueDate ?? null }
          foundAt = item.foundAt
        }
      }

      const status: WishlistItem['status'] = match ? 'found' : 'not_found'
      mutate(s => updateItem(s, { ...item, status, match, foundAt, checkedAt: Date.now() }))
    } catch {
      mutate(s => updateItem(s, { ...item, status: 'error', checkedAt: Date.now() }))
    }
  }

  async function checkAll() {
    if (globalChecking) return
    setGlobalChecking(true)
    const toCheck = allItems.filter(i => i.status !== 'checking')
    const BATCH = 6
    for (let i = 0; i < toCheck.length; i += BATCH) {
      await Promise.all(toCheck.slice(i, i + BATCH).map(item => checkItem(item, store.defaultLibrary)))
    }
    setGlobalChecking(false)
  }

  function handleAddFromSearch() {
    const title = searchFilter.trim()
    if (!title || !activeList) return
    mutate(s => addItem(s, activeList, title))
    setSearchFilter('')
  }

  function handleCreateList() {
    const name = newListName.trim()
    if (!name) return
    const id = `custom_${Date.now()}`
    mutate(s => addCustomList(s, { id, name, icon: newListIcon, docType: '', subject: '', queryExtra: '' }))
    setActiveList(id)
    setShowNewListModal(false)
    setNewListName('')
    setNewListIcon('⭐')
  }

  function toggleListVisibility(id: string) {
    mutate(s => ({
      ...s,
      lists: s.lists.map(l => l.id === id ? { ...l, hidden: !l.hidden } : l),
    }))
  }

  function reorderLists(activeId: string, overId: string) {
    mutate(s => {
      const lists = [...s.lists]
      const from = lists.findIndex(l => l.id === activeId)
      const to = lists.findIndex(l => l.id === overId)
      if (from === -1 || to === -1) return s
      return { ...s, lists: arrayMove(lists, from, to) }
    })
  }

  function handleDeleteList(id: string) {
    mutate(s => removeList(s, id))
    if (activeList === id) {
      const remaining = store.lists.filter(l => l.id !== id)
      setActiveList(remaining[0]?.id ?? '')
      setSearchFilter('')
    }
    setDeleteConfirmId(null)
  }

  // Keep checkAllRef pointing to the latest checkAll (so DOM listeners always call it fresh)
  useEffect(() => { checkAllRef.current = checkAll })

  // Pull-to-refresh via DOM listeners (passive: false on touchmove to block native iOS PTR)
  useEffect(() => {
    const el = contentRef.current as HTMLDivElement
    if (!el) return

    function onTouchStart(e: TouchEvent) {
      if (el.scrollTop === 0) {
        pullStartYRef.current = e.touches[0].clientY
        isPullingRef.current = true
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (!isPullingRef.current) return
      const dy = e.touches[0].clientY - pullStartYRef.current
      if (dy > 0 && el.scrollTop === 0) {
        e.preventDefault()
        const p = Math.min(dy / 60, 1)
        pullProgressRef.current = p
        setPullProgress(p)
      } else {
        isPullingRef.current = false
        pullProgressRef.current = 0
        setPullProgress(0)
      }
    }

    function onTouchEnd() {
      if (!isPullingRef.current) return
      const triggered = pullProgressRef.current >= 1
      isPullingRef.current = false
      pullProgressRef.current = 0
      setPullProgress(0)
      if (triggered) checkAllRef.current()
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Lightweight header: title + library selector */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 18px 14px',
        background: 'var(--surface)',
        borderBottom: '0.5px solid var(--border)',
        flexShrink: 0,
      }}>
        <div
          onClick={() => setViewMode(m => VIEW_CYCLE[(VIEW_CYCLE.indexOf(m) + 1) % VIEW_CYCLE.length])}
          style={{ fontSize: '22px', fontWeight: 800, color: 'var(--color-heading)', letterSpacing: '-0.5px', fontFamily: 'DM Sans, sans-serif', cursor: 'pointer', userSelect: 'none' }}
        >
          Mes listes
        </div>
        <select
          value={store.defaultLibrary}
          onChange={e => setLibrary(e.target.value as LibraryKey)}
          style={{
            fontSize: '11px', fontWeight: 600,
            padding: '5px 10px', borderRadius: '20px',
            border: '1.5px solid var(--border)',
            background: 'var(--tab-inactive-bg)', color: 'var(--text-2)',
            cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', outline: 'none',
          }}
        >
          {LIBRARY_OPTIONS.map(o => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Top zone: list pills + search */}
      <div style={{
        flexShrink: 0,
        background: 'var(--surface)',
        borderBottom: '0.5px solid var(--border)',
      }}>
        {/* List tabs */}
        <div
          data-hscroll
          style={{ display: 'flex', gap: '6px', overflowX: 'auto', padding: '10px 16px 0', scrollbarWidth: 'none' }}
        >
          <button
            onClick={() => setShowManageModal(true)}
            style={{
              fontSize: '10.5px', fontWeight: 600, flexShrink: 0,
              padding: '5px 10px', borderRadius: '20px',
              border: '1.5px solid var(--border)',
              background: 'transparent', color: 'var(--text-2)',
              cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
            }}
            title="Gérer les listes"
          >
            <SlidersHorizontal size={13} strokeWidth={2} />
          </button>
          {store.lists.filter(l => !l.hidden).map(list => (
            <button
              key={list.id}
              onClick={() => setActiveList(list.id)}
              style={{
                fontSize: '10.5px', fontWeight: 600, flexShrink: 0,
                padding: '5px 12px',
                borderRadius: '20px', border: 'none', cursor: 'pointer',
                whiteSpace: 'nowrap', fontFamily: 'DM Sans, sans-serif',
                background: activeList === list.id ? 'var(--navy)' : 'var(--tab-inactive-bg)',
                color: activeList === list.id ? 'white' : 'var(--text-2)',
                transition: 'background 0.12s, color 0.12s',
              }}
            >
              {list.name}
              {(() => {
                const cnt = store.items.filter(i => i.listId === list.id).length
                return cnt > 0 ? <span style={{ marginLeft: '5px', opacity: 0.65 }}>{cnt}</span> : null
              })()}
            </button>
          ))}
          <button
            onClick={() => setShowNewListModal(true)}
            style={{
              fontSize: '10.5px', fontWeight: 600, flexShrink: 0,
              padding: '5px 12px', borderRadius: '20px',
              border: '1.5px dashed var(--border)',
              background: 'transparent', color: 'var(--text-2)',
              cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'DM Sans, sans-serif',
            }}
          >
            + Nouvelle liste
          </button>
        </div>

        {/* Search input */}
        <div style={{ position: 'relative', padding: '8px 16px 12px' }}>
          <span style={{ position: 'absolute', left: '28px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', pointerEvents: 'none', opacity: 0.45 }}>
            🔍
          </span>
          <input
            type="search"
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
            placeholder={`Rechercher ou ajouter dans ${currentList?.name ?? 'la liste'}…`}
            style={{
              width: '100%', padding: '10px 44px 10px 36px',
              borderRadius: 'var(--radius-sm)',
              border: '1.5px solid var(--border)',
              fontSize: '14px',
              background: 'var(--bg)', color: 'var(--text)',
              fontFamily: 'DM Sans, sans-serif', outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {searchFilter && (
            <button
              onClick={() => setSearchFilter('')}
              style={{
                position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-2)',
                width: '44px', height: '44px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '18px',
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Scrollable content with pull-to-refresh */}
      <div
        ref={contentRef}
        style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '0 16px 14px', background: 'var(--content-bg)', overscrollBehaviorY: 'contain' }}
      >
        {/* Pull-to-refresh indicator */}
        {pullProgress > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: `${pullProgress * 44}px`, overflow: 'hidden',
            color: 'var(--text-2)', fontSize: '11px', fontFamily: 'DM Mono, monospace',
            transition: 'none',
          }}>
            {pullProgress >= 1 ? '↑ Relâcher pour vérifier' : '↓ Tirer pour vérifier'}
          </div>
        )}

        <div style={{ paddingTop: '14px' }}>
          {store.items.filter(i => i.listId === activeList).length === 0 && (
            <div style={{ textAlign: 'center', paddingTop: '32px', color: 'var(--text-2)', fontSize: '13px' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>{currentList?.icon ?? '⭐'}</div>
              {searchFilter.trim() ? (
                <button
                  onClick={handleAddFromSearch}
                  style={{
                    marginTop: '8px', padding: '10px 20px',
                    background: 'var(--navy)', color: 'white',
                    border: 'none', borderRadius: 'var(--radius-sm)',
                    fontSize: '13px', fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  + Ajouter &laquo;{searchFilter.trim()}&raquo;
                </button>
              ) : (
                <span>Liste vide — tape un titre dans le champ ci-dessus ou ajoute depuis le Catalogue</span>
              )}
            </div>
          )}

          {store.items.filter(i => i.listId === activeList).length > 0 && allItems.length === 0 && (
            <div style={{ textAlign: 'center', paddingTop: '32px', color: 'var(--text-2)', fontSize: '13px' }}>
              <div style={{ marginBottom: '14px' }}>Pas dans la liste — pas encore au catalogue ?</div>
              <button
                onClick={handleAddFromSearch}
                style={{
                  padding: '10px 20px',
                  background: 'var(--navy)', color: 'white',
                  border: 'none', borderRadius: 'var(--radius-sm)',
                  fontSize: '13px', fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                }}
              >
                + Ajouter &laquo;{searchFilter.trim()}&raquo; à la liste
              </button>
            </div>
          )}

          {allItems.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-2)', fontFamily: 'DM Mono, monospace' }}>
                  {(() => {
                    const nAvail = found.filter(i => i.match?.available === true).length
                    const nLoaned = found.filter(i => i.match?.available === false).length
                    const parts = []
                    if (nAvail > 0) parts.push(`${nAvail} disponible${nAvail > 1 ? 's' : ''}`)
                    if (nLoaned > 0) parts.push(`${nLoaned} emprunté${nLoaned > 1 ? 's' : ''}`)
                    return (parts.length > 0 ? parts.join(' · ') : 'Aucun disponible') + ` · ${allItems.length} titre${allItems.length > 1 ? 's' : ''}`
                  })()}
                </div>
                <button
                  onClick={checkAll}
                  disabled={globalChecking}
                  style={{
                    padding: '5px 14px', background: 'var(--tab-inactive-bg)', border: 'none',
                    borderRadius: '20px', fontSize: '10.5px', fontWeight: 600,
                    color: 'var(--text-2)', cursor: globalChecking ? 'wait' : 'pointer',
                    fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  {globalChecking ? 'Vérification…' : '↻ Tout vérifier'}
                </button>
              </div>
              {(() => {
                const lastCheckedAt = allItems.reduce((max, i) => Math.max(max, i.checkedAt ?? 0), 0) || null
                return lastCheckedAt ? (
                  <div style={{ fontSize: '10px', color: 'var(--text-2)', fontFamily: 'DM Mono, monospace', marginBottom: '14px', opacity: 0.7 }}>
                    vérifié {formatCheckedAt(lastCheckedAt)}
                  </div>
                ) : <div style={{ marginBottom: '14px' }} />
              })()}

              {found.length > 0 && (() => {
                const available = found.filter(i => i.match?.available === true)
                const loaned = found.filter(i => i.match?.available === false)
                const unknown = found.filter(i => i.match?.available == null)
                return (
                  <>
                    {available.length > 0 && (
                      <Section label="Disponible" count={available.length} accent="var(--green)" viewMode={viewMode}>
                        {available.map(item => (
                          <ItemCard key={item.id} item={item} listDocType={currentList?.docType ?? ''}
                            onRemove={id => mutate(s => removeItem(s, id))} viewMode={viewMode}
            isWatched={watchedRscIds.has(item.match?.rscId ?? '')}
            onToggleWatch={item.match?.rscId ? () => toggleWatch(item.match!.rscId, item.title) : undefined} />
                        ))}
                      </Section>
                    )}
                    {loaned.length > 0 && (
                      <Section label="Emprunté" count={loaned.length} accent="var(--orange)" viewMode={viewMode}>
                        {loaned.map(item => (
                          <ItemCard key={item.id} item={item} listDocType={currentList?.docType ?? ''}
                            onRemove={id => mutate(s => removeItem(s, id))} viewMode={viewMode}
            isWatched={watchedRscIds.has(item.match?.rscId ?? '')}
            onToggleWatch={item.match?.rscId ? () => toggleWatch(item.match!.rscId, item.title) : undefined} />
                        ))}
                      </Section>
                    )}
                    {unknown.length > 0 && (
                      <Section label="Au catalogue" count={unknown.length} accent="var(--text-2)" viewMode={viewMode}>
                        {unknown.map(item => (
                          <ItemCard key={item.id} item={item} listDocType={currentList?.docType ?? ''}
                            onRemove={id => mutate(s => removeItem(s, id))} viewMode={viewMode}
            isWatched={watchedRscIds.has(item.match?.rscId ?? '')}
            onToggleWatch={item.match?.rscId ? () => toggleWatch(item.match!.rscId, item.title) : undefined} />
                        ))}
                      </Section>
                    )}
                  </>
                )
              })()}

              {notFound.length > 0 && (
                <Section label="Pas trouvé" count={notFound.length} accent="var(--text-2)" viewMode={viewMode}>
                  {notFound.map(item => (
                    <ItemCard key={item.id} item={item} listDocType={currentList?.docType ?? ''}
                      onRemove={id => mutate(s => removeItem(s, id))} viewMode={viewMode}
            isWatched={watchedRscIds.has(item.match?.rscId ?? '')}
            onToggleWatch={item.match?.rscId ? () => toggleWatch(item.match!.rscId, item.title) : undefined} />
                  ))}
                </Section>
              )}

              {pending.length > 0 && (
                <Section label="En attente" count={pending.length} accent="var(--text-2)" viewMode={viewMode}>
                  {pending.map(item => (
                    <ItemCard key={item.id} item={item} listDocType={currentList?.docType ?? ''}
                      onRemove={id => mutate(s => removeItem(s, id))} viewMode={viewMode}
            isWatched={watchedRscIds.has(item.match?.rscId ?? '')}
            onToggleWatch={item.match?.rscId ? () => toggleWatch(item.match!.rscId, item.title) : undefined} />
                  ))}
                </Section>
              )}
            </>
          )}
        </div>
      </div>

      {/* Manage lists modal */}
      {showManageModal && (
        <div className="overlay-enter" style={{
          position: 'fixed', inset: 0, background: 'var(--overlay)',
          display: 'flex', alignItems: 'flex-end', zIndex: 200,
        }} onClick={() => setShowManageModal(false)}>
          <div
            className="sheet-enter"
            style={{ background: 'var(--surface)', width: '100%', borderRadius: '16px 16px 0 0', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 12px' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-heading)' }}>Gérer les listes</div>
              <button onClick={() => setShowManageModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', color: 'var(--text-2)', cursor: 'pointer', lineHeight: 1 }}>
                ×
              </button>
            </div>
            <div style={{ padding: '0 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)' }}>Vue des items</span>
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
            </div>
            <div style={{ overflowY: 'auto', padding: '0 12px 24px' }}>
              <DndContext
                sensors={dndSensors}
                collisionDetection={closestCenter}
                onDragEnd={(e: DragEndEvent) => {
                  const { active, over } = e
                  if (over && active.id !== over.id) reorderLists(String(active.id), String(over.id))
                }}
              >
                <SortableContext items={store.lists.map(l => l.id)} strategy={verticalListSortingStrategy}>
                  {store.lists.map(list => (
                    <SortableListRow
                      key={list.id}
                      list={{ ...list, itemCount: store.items.filter(i => i.listId === list.id).length }}
                      onToggleVisibility={() => toggleListVisibility(list.id)}
                      onDelete={() => { setShowManageModal(false); setDeleteConfirmId(list.id) }}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          </div>
        </div>
      )}

      {/* Delete list confirmation */}
      {deleteConfirmId && (() => {
        const list = store.lists.find(l => l.id === deleteConfirmId)
        if (!list) return null
        const itemCount = store.items.filter(i => i.listId === deleteConfirmId).length
        return (
          <div className="overlay-enter" style={{
            position: 'fixed', inset: 0, background: 'var(--overlay)',
            display: 'flex', alignItems: 'flex-end', zIndex: 200,
          }} onClick={() => setDeleteConfirmId(null)}>
            <div
              className="sheet-enter"
              style={{ background: 'var(--surface)', width: '100%', padding: '24px', borderRadius: '16px 16px 0 0' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ fontSize: '20px', marginBottom: '8px', textAlign: 'center' }}>{list.icon}</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-heading)', textAlign: 'center', marginBottom: '6px' }}>
                Supprimer « {list.name} » ?
              </div>
              {itemCount > 0 && (
                <div style={{ fontSize: '12px', color: 'var(--text-2)', textAlign: 'center', marginBottom: '20px' }}>
                  {itemCount} titre{itemCount > 1 ? 's' : ''} sera{itemCount > 1 ? 'ont' : ''} supprimé{itemCount > 1 ? 's' : ''} définitivement.
                </div>
              )}
              {itemCount === 0 && <div style={{ marginBottom: '20px' }} />}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  style={{
                    flex: 1, padding: '13px', background: 'var(--bg)',
                    border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)',
                    fontSize: '14px', fontWeight: 600, color: 'var(--text-2)',
                    cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  Annuler
                </button>
                <button
                  onClick={() => handleDeleteList(deleteConfirmId)}
                  style={{
                    flex: 1, padding: '13px', background: 'var(--red)', color: 'white',
                    border: 'none', borderRadius: 'var(--radius-sm)',
                    fontSize: '14px', fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* New list modal */}
      {showNewListModal && (
        <div className="overlay-enter" style={{
          position: 'fixed', inset: 0, background: 'var(--overlay)',
          display: 'flex', alignItems: 'flex-end', zIndex: 200,
        }} onClick={() => setShowNewListModal(false)}>
          <div
            className="sheet-enter"
            style={{ background: 'var(--surface)', width: '100%', padding: '24px', borderRadius: '16px 16px 0 0' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-heading)', marginBottom: '16px' }}>
              Nouvelle liste
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
              {LIST_ICONS.map(icon => (
                <button
                  key={icon}
                  onClick={() => setNewListIcon(icon)}
                  style={{
                    width: '38px', height: '38px', fontSize: '18px',
                    borderRadius: '10px', border: '2px solid',
                    borderColor: newListIcon === icon ? 'var(--navy)' : 'var(--border)',
                    background: newListIcon === icon ? 'rgba(0,0,128,0.07)' : 'var(--bg)',
                    cursor: 'pointer',
                  }}
                >
                  {icon}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={newListName}
              onChange={e => setNewListName(e.target.value)}
              placeholder="Nom de la liste…"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleCreateList()}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                border: '1.5px solid var(--border)', fontSize: '14px',
                background: 'var(--bg)', color: 'var(--text)',
                fontFamily: 'DM Sans, sans-serif', outline: 'none', marginBottom: '12px',
              }}
            />
            <button
              onClick={handleCreateList}
              disabled={!newListName.trim()}
              style={{
                width: '100%', padding: '12px', background: 'var(--navy)', color: 'white',
                border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '14px',
                fontWeight: 700, cursor: !newListName.trim() ? 'not-allowed' : 'pointer',
                opacity: !newListName.trim() ? 0.45 : 1, fontFamily: 'DM Sans, sans-serif',
              }}
            >
              Créer la liste
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function formatCheckedAt(ts: number | null): string | null {
  if (!ts) return null
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'à l\'instant'
  if (mins < 60) return `il y a ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `il y a ${hours}h`
  return `il y a ${Math.floor(hours / 24)}j`
}

function Section({ label, count, accent, viewMode, children }: {
  label: string; count: number; accent: string; viewMode: ViewMode; children: React.ReactNode
}) {
  const isGrid = viewMode === 'grid2' || viewMode === 'grid3'
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{
        fontSize: '11px', fontWeight: 700, color: 'var(--text-2)',
        marginBottom: '6px', fontFamily: 'DM Sans, sans-serif', paddingLeft: '2px',
      }}>
        {label} <span style={{ color: accent }}>· {count}</span>
      </div>
      {isGrid ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: viewMode === 'grid3' ? '1fr 1fr 1fr' : '1fr 1fr',
          gap: viewMode === 'grid3' ? '8px' : '10px',
        }}>
          {children}
        </div>
      ) : (
        <div className="group-items" style={{ background: 'var(--surface)', borderRadius: '12px', overflow: 'hidden' }}>
          {children}
        </div>
      )}
    </div>
  )
}

const TYPE_ICON: Record<string, string> = {
  'Jeu vidéo': '🎮', 'Vidéo': '🎬', 'Livre': '📖',
  'BD ou manga': '📚', 'Musique': '🎵',
}

function shortLoc(loc: string | undefined | null): string {
  const l = (loc ?? '').toLowerCase()
  if (l.includes('neudorf')) return 'Neudorf'
  if (l.includes('malraux')) return 'Malraux'
  return loc ?? ''
}

function ItemCard({
  item,
  listDocType,
  onRemove,
  viewMode,
  isWatched,
  onToggleWatch,
}: {
  item: WishlistItem
  listDocType: string
  onRemove: (id: string) => void
  viewMode: ViewMode
  isWatched?: boolean
  onToggleWatch?: () => void
}) {
  const [swipeX, setSwipeX] = useState(0)
  const [animating, setAnimating] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const startSwipeXRef = useRef(0)
  const dirRef = useRef<'h' | 'v' | null>(null)

  const OPEN = -84
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const isFound = item.status === 'found'
  const isChecking = item.status === 'checking'
  const isError = item.status === 'error'
  const isLoaned = isFound && item.match?.available === false
  const isAvailable = isFound && item.match?.available === true

  const dotColor = isAvailable ? 'var(--green)'
    : isLoaned ? 'var(--orange)'
    : isError ? 'var(--red)'
    : isChecking ? 'var(--orange)'
    : 'var(--border)'

  const docType = item.match?.type || listDocType
  const typeConf = TYPE_CONFIG[docType]
  const typeIcon = typeConf?.emoji ?? TYPE_ICON[docType] ?? '📄'
  const typeLabel = typeBadge(docType, item.match?.subject ?? '')
  const isBoth = item.foundAt === 'both'
  const locLabel = isBoth ? null : shortLoc(item.foundAt)
  const isNeudorf = locLabel === 'Neudorf'

  let subtitleNode: React.ReactNode = null
  if (isChecking) {
    subtitleNode = <span style={{ fontFamily: 'DM Mono, monospace' }}>Vérification…</span>
  } else if (isError) {
    subtitleNode = <span style={{ color: 'var(--red)' }}>Erreur</span>
  } else if (isFound && item.match) {
    subtitleNode = (
      <>
        {typeLabel}
        {isBoth ? (
          <> · <span>Malraux</span> · <span style={{ color: 'var(--neudorf)', fontWeight: 700 }}>Neudorf</span></>
        ) : locLabel ? (
          <> · <span style={{ color: isNeudorf ? 'var(--neudorf)' : 'var(--text-2)', fontWeight: isNeudorf ? 700 : 400 }}>{locLabel}</span></>
        ) : null}
        {isLoaned && item.match.dueDate && (
          <span style={{ color: 'var(--text-2)' }}> · {item.match.dueDate}</span>
        )}
      </>
    )
  } else if (item.status === 'not_found') {
    subtitleNode = <span style={{ color: 'var(--text-2)' }}>Pas trouvé</span>
  }

  const url = item.match?.url ?? null

  function handleDelete() {
    navigator.vibrate?.(8)
    onRemove(item.id)
  }

  if (viewMode === 'grid2' || viewMode === 'grid3') {
    return (
      <div
        onClick={() => url && window.open(url, '_blank', 'noopener,noreferrer')}
        style={{ cursor: url ? 'pointer' : 'default' }}
      >
        <div style={{ position: 'relative', aspectRatio: '2/3', borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: typeConf?.bg ?? 'var(--tab-inactive-bg)' }}>
          {item.match?.thumbnail && !imgFailed ? (
            <img
              src={item.match.thumbnail}
              onError={() => setImgFailed(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              alt=""
            />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: viewMode === 'grid3' ? '24px' : '32px' }}>{typeIcon}</span>
            </div>
          )}
          <div style={{ position: 'absolute', top: '5px', left: '5px', width: '7px', height: '7px', borderRadius: '50%', background: dotColor }} />
        </div>
        <div style={{ padding: '5px 2px 0' }}>
          <div style={{
            fontSize: viewMode === 'grid3' ? '10.5px' : '12px', fontWeight: 600,
            color: 'var(--color-heading)', lineHeight: 1.3,
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
          }}>
            {item.title}
          </div>
        </div>
      </div>
    )
  }

  function snapTo(x: number) {
    setAnimating(true)
    setSwipeX(x)
  }

  function handleTouchStart(e: React.TouchEvent) {
    startXRef.current = e.touches[0].clientX
    startYRef.current = e.touches[0].clientY
    startSwipeXRef.current = swipeX
    dirRef.current = null
    setAnimating(false)
  }

  function handleTouchMove(e: React.TouchEvent) {
    const dx = e.touches[0].clientX - startXRef.current
    const dy = Math.abs(e.touches[0].clientY - startYRef.current)
    if (dirRef.current === null) {
      if (startSwipeXRef.current < 0 && Math.abs(dx) > 3) {
        dirRef.current = 'h'
        e.stopPropagation()
      } else if (Math.abs(dx) > 6 || dy > 6) {
        dirRef.current = Math.abs(dx) > dy ? 'h' : 'v'
      }
      return
    }
    if (dirRef.current !== 'h') return
    const newX = Math.min(0, Math.max(OPEN, startSwipeXRef.current + dx))
    e.stopPropagation()
    setSwipeX(newX)
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (dirRef.current !== 'h') return
    e.nativeEvent.stopPropagation()
    if (swipeX < OPEN / 2) {
      snapTo(OPEN)
    } else {
      snapTo(0)
    }
  }

  function handleClick() {
    if (swipeX < 0) { snapTo(0); return }
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  const panelOpen = swipeX < 0

  return (
    <div
      data-swipeable
      data-panel-open={panelOpen ? 'true' : 'false'}
      style={{ position: 'relative', overflow: 'hidden' }}
    >
      <div
        role="button"
        aria-label="Supprimer"
        style={{
          position: 'absolute', right: 0, top: 0, bottom: 0,
          width: '84px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          paddingRight: '10px',
          cursor: 'pointer',
        }}
        onClick={handleDelete}
      >
        <div style={{
          width: '40px', height: '40px',
          background: 'var(--red)',
          borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Trash2 size={18} color="white" strokeWidth={2} />
        </div>
      </div>

      <div
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          padding: '9px 14px',
          display: 'flex', alignItems: 'center', gap: '10px',
          cursor: url ? 'pointer' : 'default',
          background: 'var(--surface)',
          transform: `translateX(${swipeX}px)`,
          transition: animating && !reducedMotion ? 'transform 0.2s cubic-bezier(0.25, 0, 0, 1)' : 'none',
          willChange: swipeX !== 0 || animating ? 'transform' : 'auto',
        }}
      >
        <div style={{
          width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
          background: dotColor,
          animation: isChecking ? 'pulse 1s infinite' : 'none',
        }} />

        {viewMode === 'list' && (
          <CoverImg thumbnail={item.match?.thumbnail} width={44} height={63} typeIcon={typeIcon} subject={item.match?.subject ?? ''} typeBg={typeConf?.bg} />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.2px' }}>
            {item.title}
          </div>
          {subtitleNode && (
            <div style={{ fontSize: '11.5px', color: 'var(--text-2)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {subtitleNode}
            </div>
          )}
        </div>

        {onToggleWatch && (
          <button
            onClick={e => { e.stopPropagation(); onToggleWatch() }}
            style={{
              width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
              background: isWatched ? 'var(--orange)' : 'var(--tab-inactive-bg)',
              border: 'none', cursor: 'pointer',
              color: isWatched ? 'white' : 'var(--navy)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            title={isWatched ? 'Désactiver la notification' : 'Notifier quand disponible'}
          >
            <Bell size={13} strokeWidth={1.5} fill={isWatched ? 'currentColor' : 'none'} />
          </button>
        )}
        <button
          className="desktop-trash-btn"
          onClick={e => { e.stopPropagation(); handleDelete() }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
            color: 'var(--red)', opacity: hovered ? 0.55 : 0,
            transition: 'opacity 0.15s', flexShrink: 0,
          }}
          tabIndex={-1}
        >
          <Trash2 size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
