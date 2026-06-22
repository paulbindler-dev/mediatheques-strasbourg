'use client'
import { useState, useEffect, useRef } from 'react'
import type { CatalogueItem } from '@/app/api/catalogue/search/route'
import {
  loadStore, saveStore, addItem, removeItem, updateItem,
  addCustomList, removeList, libraryLabel,
  loadFromCloud, saveToCloud, mergeStores,
  DEFAULT_LISTS,
  type WishlistStore, type WishlistItem, type LibraryKey,
} from '@/lib/wishlists'

// Strict title match: avoids false positives like "Death Stranding" → "Death Stranding 2"
// Only matches if one title is a prefix of the other, and the extra part is a subtitle (: or -)
function titleMatches(resultTitle: string, searchTitle: string): boolean {
  const r = resultTitle.toLowerCase().trim()
  const s = searchTitle.toLowerCase().trim()
  if (r === s) return true
  const check = (longer: string, shorter: string) => {
    if (!longer.startsWith(shorter)) return false
    const rest = longer.slice(shorter.length).trimStart()
    // Accept empty, subtitle separator, or opening paren — but NOT digits or extra words
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

// Migrate old single-list PS5 data to new store
function migrateOldData(store: WishlistStore): WishlistStore {
  const OLD_KEY = 'mediatheques_wishlist_ps5'
  try {
    const raw = localStorage.getItem(OLD_KEY)
    if (!raw) return store
    const old = JSON.parse(raw) as { id: string; title: string; status: string; match: CatalogueItem | null; checkedAt: number | null }[]
    if (!old.length) return store

    // Only migrate if ps5 list is currently empty
    const ps5Items = store.items.filter(i => i.listId === 'ps5')
    if (ps5Items.length > 0) { localStorage.removeItem(OLD_KEY); return store }

    const migrated: WishlistItem[] = old.map(o => ({
      id: o.id,
      listId: 'ps5',
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

export default function EnviesPage() {
  const [store, setStore] = useState<WishlistStore>(() => ({ lists: DEFAULT_LISTS, items: [], defaultLibrary: 'malraux_neudorf' }))
  const [activeList, setActiveList] = useState<string>('ps5')
  const [searchFilter, setSearchFilter] = useState('')
  const [globalChecking, setGlobalChecking] = useState(false)
  const [showNewListModal, setShowNewListModal] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [newListIcon, setNewListIcon] = useState('⭐')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [showManageModal, setShowManageModal] = useState(false)
  const cloudSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cloudDirty = useRef(false)

  useEffect(() => {
    // Load from localStorage immediately for instant render
    const local = migrateOldData(loadStore())
    setStore(local)

    // Then fetch cloud and merge — use functional updater so we merge with the CURRENT state
    // (not the initial snapshot), preserving any availability already set by "Tout vérifier"
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
        return merged
      })
    }).catch(() => {/* offline or not logged in */})
  }, [])

  // Debounced cloud save — prevents race conditions during batch checks
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
  const allItems = store.items
    .filter(i => i.listId === activeList)
    .filter(i => !searchFilter || i.title.toLowerCase().includes(searchFilter.toLowerCase()))
  const found = allItems.filter(i => i.status === 'found')
  const notFound = allItems.filter(i => i.status === 'not_found')
  const pending = allItems.filter(i => ['idle', 'checking', 'error'].includes(i.status))

  async function checkItem(item: WishlistItem, library: LibraryKey) {
    mutate(s => updateItem(s, { ...item, status: 'checking' }))

    const list = store.lists.find(l => l.id === item.listId)
    const queryString = [item.title, list?.queryExtra].filter(Boolean).join(' ')

    async function searchLib(loc: string): Promise<CatalogueItem | null> {
      const params = new URLSearchParams({
        q: queryString,
        type: list?.docType ?? '',
        subject: list?.subject ?? '',
        location: loc,
        size: '10',
      })
      const res = await fetch(`/api/catalogue/search?${params}`)
      const data = await res.json() as { results?: CatalogueItem[]; error?: string }
      if (data.error) throw new Error(data.error)
      return (data.results ?? []).find(r => titleMatches(r.title, item.title)) ?? null
    }

    try {
      let match: CatalogueItem | null = null
      let foundAt: string | null = null

      if (library === 'malraux_neudorf') {
        const [mResult, nResult] = await Promise.all([
          searchLib(LIBRARY_PARAM.malraux),
          searchLib(LIBRARY_PARAM.neudorf),
        ])
        if (mResult) { match = mResult; foundAt = 'André Malraux' }
        else if (nResult) { match = nResult; foundAt = 'Neudorf' }
      } else {
        match = await searchLib(LIBRARY_PARAM[library])
        if (match) foundAt = libraryLabel(library)
      }

      if (match) {
        let holdAvail: boolean | null | undefined = undefined
        let holdDue: string | null = null
        for (let attempt = 0; attempt < 2; attempt++) {
          if (attempt > 0) await new Promise(r => setTimeout(r, 700))
          try {
            const hRes = await fetch(`/api/catalogue/holdings?rscId=${encodeURIComponent(match.rscId)}`)
            const h = await hRes.json() as { available?: boolean | null; dueDate?: string | null }
            if (hRes.ok && h.available !== null && h.available !== undefined) {
              holdAvail = h.available; holdDue = h.dueDate ?? null; break
            }
          } catch { /* retry */ }
        }
        match = holdAvail !== undefined
          ? { ...match, available: holdAvail, dueDate: holdDue }
          : { ...match, available: item.match?.available, dueDate: item.match?.dueDate ?? null }
      }

      const status: WishlistItem['status'] = match ? 'found' : 'not_found'
      mutate(s => updateItem(s, { ...item, status, match, foundAt, checkedAt: Date.now() }))
    } catch {
      mutate(s => updateItem(s, { ...item, status: 'error', checkedAt: Date.now() }))
    }
  }

  async function checkAll() {
    setGlobalChecking(true)
    const toCheck = allItems.filter(i => i.status !== 'checking')
    const BATCH = 3
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

  function moveList(id: string, direction: 'up' | 'down') {
    mutate(s => {
      const lists = [...s.lists]
      const idx = lists.findIndex(l => l.id === id)
      if (idx === -1) return s
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= lists.length) return s
      ;[lists[idx], lists[swapIdx]] = [lists[swapIdx], lists[idx]]
      return { ...s, lists }
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ background: 'var(--surface)', padding: '20px 18px 0', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-heading)', letterSpacing: '-0.5px', fontFamily: 'DM Sans, sans-serif' }}>
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

        {/* Search — same position as Catalogue (inside header, above tabs) */}
        <div style={{ position: 'relative', marginBottom: '10px' }}>
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', pointerEvents: 'none', opacity: 0.5 }}>
            🔍
          </span>
          <input
            type="search"
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
            placeholder={`Rechercher ou ajouter dans ${currentList?.name ?? 'la liste'}…`}
            style={{
              width: '100%', padding: '10px 36px',
              borderRadius: 'var(--radius-sm)',
              border: '1.5px solid var(--border)',
              fontSize: '14px',
              background: 'var(--bg)', color: 'var(--text)',
              fontFamily: 'DM Sans, sans-serif', outline: 'none',
            }}
          />
          {searchFilter && (
            <button onClick={() => setSearchFilter('')}
              style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--text-2)' }}>
              ×
            </button>
          )}
        </div>

        {/* List tabs — only visible lists */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '14px', scrollbarWidth: 'none' }}>
          {store.lists.filter(l => !l.hidden).map(list => (
            <div key={list.id} style={{ position: 'relative', flexShrink: 0 }}>
              <button
                onClick={() => setActiveList(list.id)}
                style={{
                  fontSize: '10.5px', fontWeight: 600,
                  padding: '5px 12px',
                  borderRadius: '20px', border: 'none', cursor: 'pointer',
                  whiteSpace: 'nowrap', fontFamily: 'DM Sans, sans-serif',
                  background: activeList === list.id ? 'var(--navy)' : 'var(--tab-inactive-bg)',
                  color: activeList === list.id ? 'white' : 'var(--text-2)',
                  transition: 'background 0.12s, color 0.12s',
                }}
              >
                {list.icon} {list.name}
                {(() => {
                  const cnt = store.items.filter(i => i.listId === list.id).length
                  return cnt > 0 ? (
                    <span style={{ marginLeft: '5px', opacity: 0.65 }}>{cnt}</span>
                  ) : null
                })()}
              </button>
            </div>
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
            ⚙
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '14px 16px', flex: 1, background: '#E4E6EA' }}>

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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
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

            {found.length > 0 && (
              <>
                {(() => {
                  const available = found.filter(i => i.match?.available === true)
                  const loaned = found.filter(i => i.match?.available === false)
                  const unknown = found.filter(i => i.match?.available == null)
                  return (
                    <>
                      {available.length > 0 && (
                        <Section label="Disponible à emprunter" count={available.length} accent="var(--green)">
                          {available.map(item => (
                            <ItemCard key={item.id} item={item}
                              onRemove={id => mutate(s => removeItem(s, id))}
                              onRefresh={item => checkItem(item, store.defaultLibrary)} />
                          ))}
                        </Section>
                      )}
                      {loaned.length > 0 && (
                        <Section label="Actuellement emprunté" count={loaned.length} accent="var(--orange)">
                          {loaned.map(item => (
                            <ItemCard key={item.id} item={item}
                              onRemove={id => mutate(s => removeItem(s, id))}
                              onRefresh={item => checkItem(item, store.defaultLibrary)} />
                          ))}
                        </Section>
                      )}
                      {unknown.length > 0 && (
                        <Section label="Trouvé au catalogue" count={unknown.length} accent="var(--text-2)">
                          {unknown.map(item => (
                            <ItemCard key={item.id} item={item}
                              onRemove={id => mutate(s => removeItem(s, id))}
                              onRefresh={item => checkItem(item, store.defaultLibrary)} />
                          ))}
                        </Section>
                      )}
                    </>
                  )
                })()}
              </>
            )}

            {notFound.length > 0 && (
              <Section label="Non disponible" count={notFound.length} accent="var(--text-2)">
                {notFound.map(item => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    onRemove={id => mutate(s => removeItem(s, id))}
                    onRefresh={item => checkItem(item, store.defaultLibrary)}
                  />
                ))}
              </Section>
            )}

            {pending.length > 0 && (
              <Section label="En attente" count={pending.length} accent="var(--text-2)">
                {pending.map(item => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    onRemove={id => mutate(s => removeItem(s, id))}
                    onRefresh={item => checkItem(item, store.defaultLibrary)}
                  />
                ))}
              </Section>
            )}
          </>
        )}
      </div>

      {/* Manage lists modal */}
      {showManageModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'var(--overlay)',
          display: 'flex', alignItems: 'flex-end', zIndex: 200,
        }} onClick={() => setShowManageModal(false)}>
          <div
            style={{ background: 'var(--surface)', width: '100%', borderRadius: '16px 16px 0 0', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 12px' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-heading)' }}>Gérer les listes</div>
              <button onClick={() => setShowManageModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', color: 'var(--text-2)', cursor: 'pointer', lineHeight: 1 }}>
                ×
              </button>
            </div>

            {/* List */}
            <div style={{ overflowY: 'auto', padding: '0 12px 24px' }}>
              {store.lists.map((list, idx) => (
                <div key={list.id} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 8px', borderRadius: 'var(--radius-sm)',
                  opacity: list.hidden ? 0.4 : 1,
                  transition: 'opacity 0.15s',
                }}>
                  {/* Eye toggle */}
                  <button
                    onClick={() => toggleListVisibility(list.id)}
                    title={list.hidden ? 'Afficher' : 'Masquer'}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: '16px', padding: '2px', flexShrink: 0,
                      color: list.hidden ? 'var(--text-2)' : 'var(--navy)',
                    }}
                  >
                    {list.hidden ? '🚫' : '👁'}
                  </button>

                  {/* Icon + name */}
                  <span style={{ fontSize: '16px', flexShrink: 0 }}>{list.icon}</span>
                  <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: 'var(--color-heading)' }}>
                    {list.name}
                    {(() => {
                      const cnt = store.items.filter(i => i.listId === list.id).length
                      return cnt > 0 ? <span style={{ fontWeight: 400, color: 'var(--text-2)', marginLeft: '6px' }}>{cnt}</span> : null
                    })()}
                  </span>

                  {/* Order arrows */}
                  <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                    <button
                      onClick={() => moveList(list.id, 'up')}
                      disabled={idx === 0}
                      style={{
                        width: '28px', height: '28px', borderRadius: '6px',
                        background: idx === 0 ? 'transparent' : 'var(--tab-inactive-bg)',
                        border: 'none', cursor: idx === 0 ? 'default' : 'pointer',
                        color: idx === 0 ? 'transparent' : 'var(--text-2)',
                        fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >↑</button>
                    <button
                      onClick={() => moveList(list.id, 'down')}
                      disabled={idx === store.lists.length - 1}
                      style={{
                        width: '28px', height: '28px', borderRadius: '6px',
                        background: idx === store.lists.length - 1 ? 'transparent' : 'var(--tab-inactive-bg)',
                        border: 'none', cursor: idx === store.lists.length - 1 ? 'default' : 'pointer',
                        color: idx === store.lists.length - 1 ? 'transparent' : 'var(--text-2)',
                        fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >↓</button>
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => { setShowManageModal(false); setDeleteConfirmId(list.id) }}
                    style={{
                      width: '28px', height: '28px', borderRadius: '6px',
                      background: 'var(--error-bg)', border: 'none', cursor: 'pointer',
                      color: 'var(--red)', fontSize: '14px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    title="Supprimer"
                  >
                    ×
                  </button>
                </div>
              ))}
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
          <div style={{
            position: 'fixed', inset: 0, background: 'var(--overlay)',
            display: 'flex', alignItems: 'flex-end', zIndex: 200,
          }} onClick={() => setDeleteConfirmId(null)}>
            <div
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
        <div style={{
          position: 'fixed', inset: 0, background: 'var(--overlay)',
          display: 'flex', alignItems: 'flex-end', zIndex: 200,
        }} onClick={() => setShowNewListModal(false)}>
          <div
            style={{ background: 'var(--surface)', width: '100%', padding: '24px', borderRadius: '16px 16px 0 0' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-heading)', marginBottom: '16px' }}>
              Nouvelle liste
            </div>

            {/* Icon picker */}
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

function Section({ label, count, accent, children }: {
  label: string; count: number; accent: string; children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{
        fontSize: '10px', fontWeight: 700, color: 'var(--text-2)',
        textTransform: 'uppercase', letterSpacing: '0.1em',
        marginBottom: '6px', fontFamily: 'DM Mono, monospace', paddingLeft: '2px',
      }}>
        {label} <span style={{ color: accent }}>· {count}</span>
      </div>
      <div className="group-items" style={{
        background: 'var(--surface)', borderRadius: '12px', overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  )
}

function ItemCard({
  item,
  onRemove,
  onRefresh,
}: {
  item: WishlistItem
  onRemove: (id: string) => void
  onRefresh: (item: WishlistItem) => void
}) {
  const isFound = item.status === 'found'
  const isChecking = item.status === 'checking'
  const isError = item.status === 'error'
  const isLoaned = isFound && item.match?.available === false
  const isAvailable = isFound && item.match?.available === true
  const availabilityUnknown = isFound && item.match?.available === undefined
  const dotColor = isAvailable ? 'var(--green)'
    : isLoaned ? 'var(--orange)'
    : isError ? 'var(--red)'
    : isChecking ? 'var(--orange)'
    : availabilityUnknown ? 'var(--border)'
    : isFound ? 'var(--green)'
    : 'var(--border)'
  return (
    <div style={{
      padding: '11px 13px', display: 'flex', alignItems: 'flex-start', gap: '10px',
    }}>
      <div style={{
        width: '8px', height: '8px', borderRadius: '50%', marginTop: '4px', flexShrink: 0,
        background: dotColor,
        animation: isChecking ? 'pulse 1s infinite' : 'none',
      }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--color-heading)', marginBottom: '2px' }}>
          {item.title}
        </div>

        {isFound && item.match && (
          <div style={{ fontSize: '11px', color: 'var(--text-2)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {item.foundAt && (
              <span style={{ fontWeight: 600, color: isLoaned ? 'var(--orange)' : 'var(--green)' }}>→ {item.foundAt}</span>
            )}
            {isLoaned && (
              <span style={{ color: 'var(--orange)', fontWeight: 600 }}>
                {item.match.dueDate ?? 'Emprunté'}
              </span>
            )}
            {availabilityUnknown && (
              <span style={{ color: 'var(--text-2)', fontSize: '10.5px' }}>
                Trouvé au catalogue · disponibilité non vérifiée
              </span>
            )}
            {item.match.title.toLowerCase() !== item.title.toLowerCase() && (
              <span style={{ fontStyle: 'italic' }}>{item.match.title}</span>
            )}
            {(item.match.publisher || item.match.year) && (
              <span>{[item.match.publisher, item.match.year].filter(Boolean).join(' · ')}</span>
            )}
            {item.match.url && (
              <a href={item.match.url} target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--navy)', fontWeight: 600, textDecoration: 'none' }}>
                Voir au catalogue →
              </a>
            )}
          </div>
        )}

        {item.status === 'not_found' && (
          <div style={{ fontSize: '11px', color: 'var(--text-2)' }}>
            Pas trouvé dans cette médiathèque
          </div>
        )}

        {isChecking && (
          <div style={{ fontSize: '11px', color: 'var(--text-2)', fontFamily: 'DM Mono, monospace' }}>
            Vérification…
          </div>
        )}

        {isError && (
          <div style={{ fontSize: '11px', color: 'var(--red)' }}>Erreur — réessayer</div>
        )}

        {item.checkedAt && !isChecking && (
          <div style={{ fontSize: '11px', color: 'var(--text-2)', marginTop: '3px', fontFamily: 'DM Mono, monospace' }}>
            vérifié {formatCheckedAt(item.checkedAt)}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
        {item.status !== 'checking' && (
          <button
            onClick={() => onRefresh(item)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', fontSize: '14px', padding: '2px 4px' }}
            title="Revérifier"
          >
            ↻
          </button>
        )}
        <button
          onClick={() => onRemove(item.id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: '18px', padding: '2px 6px', lineHeight: 1, opacity: 0.7 }}
          title="Supprimer"
        >
          ×
        </button>
      </div>
    </div>
  )
}
