'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { SlidersHorizontal, Eye, EyeOff, ChevronUp, ChevronDown } from 'lucide-react'
import type { CatalogueItem } from '@/app/api/catalogue/search/route'
import CoverImg from '@/components/CoverImg'
import { ViewModeToggle, type ViewMode, TYPE_CONFIG } from '@/components/ViewModeToggle'
import { loadStore, saveStore, addItem, addCustomList, libraryLabel, type LibraryKey } from '@/lib/wishlists'

const LIST_ICONS = ['🎮', '🕹️', '🎬', '🎥', '📚', '📖', '🎵', '🎭', '⭐', '❤️', '🔖', '🎯']

type FilterPreset = {
  id: string
  label: string
  icon: string
  type: string
  subject: string
  query: string
  custom?: boolean
  hidden?: boolean
}

type PresetsState = { hiddenIds: string[]; orderedIds: string[] }
const PRESETS_STATE_KEY = 'catalogue_presets_state'
function loadPresetsState(): PresetsState {
  try { return { hiddenIds: [], orderedIds: [], ...JSON.parse(localStorage.getItem(PRESETS_STATE_KEY) ?? '{}') } }
  catch { return { hiddenIds: [], orderedIds: [] } }
}
function savePresetsState(s: PresetsState): void {
  localStorage.setItem(PRESETS_STATE_KEY, JSON.stringify(s))
}

const BUILTIN_PRESETS: FilterPreset[] = [
  { id: 'all',      label: 'Tout',          icon: '🔍', type: '',          subject: '',    query: '' },
  { id: 'ps5',      label: 'Jeux PS5',      icon: '🎮', type: 'Jeu vidéo', subject: 'PS5', query: '' },
  { id: 'ps4',      label: 'Jeux PS4',      icon: '🕹️', type: 'Jeu vidéo', subject: 'PS4', query: '' },
  { id: 'switch',   label: 'Switch',        icon: '🎯', type: 'Jeu vidéo', subject: 'Nintendo Switch', query: '' },
  { id: 'bluray',   label: 'Films Blu-ray', icon: '🎬', type: 'Vidéo',     subject: '',    query: 'blu-ray' },
  { id: 'films',    label: 'Films',         icon: '🎥', type: 'Vidéo',     subject: '',    query: '' },
  { id: 'series',   label: 'Séries',        icon: '📺', type: 'Vidéo',     subject: '',    query: 'série' },
  { id: 'bd',       label: 'BD & Manga',    icon: '📚', type: 'BD ou manga', subject: '', query: '' },
  { id: 'livres',   label: 'Livres',        icon: '📖', type: 'Livre',     subject: '',    query: '' },
  { id: 'musique',  label: 'Musique',       icon: '🎵', type: 'Musique',   subject: '',    query: '' },
]

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

function relevanceScore(title: string, q: string): number {
  if (!q) return 0
  const t = title.toLowerCase()
  const s = q.toLowerCase().trim()
  if (t === s) return 3
  if (t.startsWith(s)) return 2
  if (t.includes(s)) return 1
  return 0
}

type CatalogueCloudPrefs = {
  presetsState: PresetsState
  customPresets: FilterPreset[]
  library: LibraryKey
}

const CUSTOM_PRESETS_KEY = 'catalogue_custom_presets'

function loadCustomPresets(): FilterPreset[] {
  try { return JSON.parse(localStorage.getItem(CUSTOM_PRESETS_KEY) ?? '[]') } catch { return [] }
}
function saveCustomPresets(p: FilterPreset[]): void {
  localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(p))
}

export default function CataloguePage() {
  const [preset, setPreset] = useState<string>('all')
  const [customPresets, setCustomPresets] = useState<FilterPreset[]>([])
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [library, setLibrary] = useState<LibraryKey>('malraux_neudorf')
  const [results, setResults] = useState<CatalogueItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [addToast, setAddToast] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState<CatalogueItem | null>(null)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [newPresetName, setNewPresetName] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [showManagePresets, setShowManagePresets] = useState(false)
  const [presetsState, setPresetsState] = useState<PresetsState>({ hiddenIds: [], orderedIds: [] })
  const [viewMode, setViewMode] = useState<ViewMode>('dots')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cloudSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cloudLoaded = useRef(false)
  const cataloguePrefsRef = useRef<CatalogueCloudPrefs>({ presetsState: { hiddenIds: [], orderedIds: [] }, customPresets: [], library: 'malraux_neudorf' })
  const PAGE_SIZE = 20

  const orderedPresets = useMemo(() => {
    const hiddenSet = new Set(presetsState.hiddenIds)
    const all: FilterPreset[] = [...BUILTIN_PRESETS, ...customPresets].map(p => ({ ...p, hidden: hiddenSet.has(p.id) }))
    if (presetsState.orderedIds.length > 0) {
      all.sort((a, b) => {
        const ai = presetsState.orderedIds.indexOf(a.id)
        const bi = presetsState.orderedIds.indexOf(b.id)
        if (ai === -1 && bi === -1) return 0
        if (ai === -1) return 1
        if (bi === -1) return -1
        return ai - bi
      })
    }
    return all
  }, [customPresets, presetsState])

  const currentPreset = orderedPresets.find(p => p.id === preset) ?? BUILTIN_PRESETS[0]

  function mutatePresetsState(updater: (s: PresetsState) => PresetsState) {
    setPresetsState(prev => { const next = updater(prev); savePresetsState(next); return next })
    scheduleCloudSave()
  }

  function togglePresetVisibility(id: string) {
    mutatePresetsState(s => ({
      ...s,
      hiddenIds: s.hiddenIds.includes(id) ? s.hiddenIds.filter(x => x !== id) : [...s.hiddenIds, id],
    }))
  }

  function movePreset(id: string, direction: 'up' | 'down') {
    mutatePresetsState(s => {
      const ids = s.orderedIds.length > 0 ? [...s.orderedIds] : orderedPresets.map(p => p.id)
      const idx = ids.indexOf(id)
      if (idx === -1) return s
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= ids.length) return s
      ;[ids[idx], ids[swapIdx]] = [ids[swapIdx], ids[idx]]
      return { ...s, orderedIds: ids }
    })
  }

  useEffect(() => {
    cataloguePrefsRef.current = { presetsState, customPresets, library }
  }, [presetsState, customPresets, library])

  function scheduleCloudSave() {
    if (!cloudLoaded.current) return
    if (cloudSaveTimer.current) clearTimeout(cloudSaveTimer.current)
    cloudSaveTimer.current = setTimeout(() => {
      fetch('/api/catalogue-prefs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefs: cataloguePrefsRef.current }),
      }).catch(() => {})
    }, 200)
  }

  useEffect(() => {
    const saved = localStorage.getItem('catalogue_view_mode') as ViewMode | null
    if (saved) setViewMode(saved)
  }, [])

  useEffect(() => {
    localStorage.setItem('catalogue_view_mode', viewMode)
  }, [viewMode])

  useEffect(() => {
    const localPresetsState = loadPresetsState()
    const localCustomPresets = loadCustomPresets()
    setPresetsState(localPresetsState)
    setCustomPresets(localCustomPresets)
    const store = loadStore()
    setLibrary(store.defaultLibrary)

    fetch('/api/catalogue-prefs')
      .then(r => r.json())
      .then((data: { prefs?: CatalogueCloudPrefs }) => {
        if (data.prefs) {
          const p = data.prefs
          if (p.presetsState) { setPresetsState(p.presetsState); savePresetsState(p.presetsState) }
          if (p.customPresets?.length) { setCustomPresets(p.customPresets); saveCustomPresets(p.customPresets) }
          if (p.library) setLibrary(p.library)
        }
      })
      .catch(() => {})
      .finally(() => { cloudLoaded.current = true })
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setQuery(input), 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [input])

  useEffect(() => { setPage(0); setResults([]) }, [preset, library])

  useEffect(() => {
    const hasFilter = currentPreset.type || currentPreset.subject || currentPreset.query
    if (!query && !hasFilter) { setResults([]); setTotal(0); return }

    setLoading(true)
    setError(null)

    const params = new URLSearchParams({
      q: query,
      type: currentPreset.type,
      subject: currentPreset.subject,
      query: currentPreset.query,
      location: LIBRARY_PARAM[library],
      page: String(page),
      size: String(PAGE_SIZE),
    })

    fetch(`/api/catalogue/search?${params}`)
      .then(r => r.json())
      .then((data: { error?: string; results?: CatalogueItem[]; total?: number }) => {
        if (data.error) { setError(data.error); setLoading(false); return }
        const raw = data.results ?? []
        const sorted = query
          ? [...raw].sort((a, b) => relevanceScore(b.title, query) - relevanceScore(a.title, query))
          : raw
        if (page === 0) setResults(sorted)
        else setResults(prev => [...prev, ...sorted])
        setTotal(data.total ?? 0)
        setLoading(false)
      })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [query, preset, library, page]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddToList = useCallback((item: CatalogueItem, listId: string) => {
    const store = loadStore()
    const updated = addItem(store, listId, item.title)
    saveStore(updated)
    setAddToast(`"${item.title}" ajouté`)
    setTimeout(() => setAddToast(null), 2500)
    setShowAddModal(null)
  }, [])

  function saveCurrentAsPreset() {
    const name = newPresetName.trim()
    if (!name) return
    const newP: FilterPreset = {
      id: `custom_${Date.now()}`,
      label: name,
      icon: '⭐',
      type: currentPreset.type,
      subject: currentPreset.subject,
      query: currentPreset.query,
      custom: true,
    }
    const updated = [...customPresets, newP]
    setCustomPresets(updated)
    saveCustomPresets(updated)
    setPreset(newP.id)
    setShowSaveModal(false)
    setNewPresetName('')
    scheduleCloudSave()
  }

  function deleteCustomPreset(id: string) {
    const updated = customPresets.filter(p => p.id !== id)
    setCustomPresets(updated)
    saveCustomPresets(updated)
    mutatePresetsState(s => ({
      hiddenIds: s.hiddenIds.filter(x => x !== id),
      orderedIds: s.orderedIds.filter(x => x !== id),
    }))
    if (preset === id) setPreset('all')
    setDeleteConfirmId(null)
  }

  const hasMore = results.length < total && results.length > 0

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
          onClick={() => setViewMode(m => ({ dots: 'icons', icons: 'images', images: 'dots' } as Record<ViewMode, ViewMode>)[m])}
          style={{ fontSize: '22px', fontWeight: 800, color: 'var(--color-heading)', letterSpacing: '-0.5px', fontFamily: 'DM Sans, sans-serif', cursor: 'pointer', userSelect: 'none' }}
        >
          Catalogue
        </div>
        <select
          value={library}
          onChange={e => { setLibrary(e.target.value as LibraryKey); scheduleCloudSave() }}
          style={{
            fontSize: '11px', fontWeight: 600,
            padding: '5px 10px',
            borderRadius: '20px',
            border: '1.5px solid var(--border)',
            background: 'var(--tab-inactive-bg)',
            color: 'var(--text-2)',
            cursor: 'pointer',
            fontFamily: 'DM Sans, sans-serif',
            outline: 'none',
          }}
        >
          {LIBRARY_OPTIONS.map(o => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Top zone: filter pills + search */}
      <div style={{
        flexShrink: 0,
        background: 'var(--surface)',
        borderBottom: '0.5px solid var(--border)',
      }}>
        {/* Filter pills */}
        <div
          data-hscroll
          style={{ display: 'flex', gap: '6px', overflowX: 'auto', padding: '10px 16px 0', scrollbarWidth: 'none' }}
        >
          {orderedPresets.filter(p => !p.hidden).map(p => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              style={{
                fontSize: '10.5px', fontWeight: 600, flexShrink: 0,
                padding: '5px 12px',
                borderRadius: '20px', border: 'none', cursor: 'pointer',
                whiteSpace: 'nowrap', fontFamily: 'DM Sans, sans-serif',
                background: preset === p.id ? 'var(--navy)' : 'var(--tab-inactive-bg)',
                color: preset === p.id ? 'white' : 'var(--text-2)',
                transition: 'background 0.12s, color 0.12s',
              }}
            >
              {p.label}
            </button>
          ))}
          {(currentPreset.type || currentPreset.subject || currentPreset.query) && !currentPreset.custom && (
            <button
              onClick={() => setShowSaveModal(true)}
              style={{
                fontSize: '10.5px', fontWeight: 600, flexShrink: 0,
                padding: '5px 12px', borderRadius: '20px',
                border: '1.5px dashed var(--border)',
                background: 'transparent', color: 'var(--text-2)',
                cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'DM Sans, sans-serif',
              }}
            >
              + Sauvegarder
            </button>
          )}
          <button
            onClick={() => setShowManagePresets(true)}
            style={{
              fontSize: '10.5px', fontWeight: 600, flexShrink: 0,
              padding: '5px 10px', borderRadius: '20px',
              border: '1.5px solid var(--border)',
              background: 'transparent', color: 'var(--text-2)',
              cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
            }}
            title="Gérer les filtres"
          >
            <SlidersHorizontal size={13} strokeWidth={2} />
          </button>
        </div>

        {/* Search input */}
        <div style={{ position: 'relative', padding: '8px 16px 12px' }}>
          <span style={{ position: 'absolute', left: '28px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', pointerEvents: 'none', opacity: 0.45 }}>
            🔍
          </span>
          <input
            type="search"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Titre, auteur, genre…"
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
          {input && (
            <button
              onClick={() => { setInput(''); setQuery('') }}
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

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '14px 16px' }}>
        {error && (
          <div style={{ fontSize: '12px', color: 'var(--text-2)', padding: '12px', background: 'var(--surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontFamily: 'DM Mono, monospace', marginBottom: '10px' }}>
            {error}
          </div>
        )}

        {!query && !currentPreset.type && !currentPreset.subject && !currentPreset.query && !loading && (
          <div style={{ textAlign: 'center', paddingTop: '48px', color: 'var(--text-2)', fontSize: '13px' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔍</div>
            Tape un titre ou sélectionne une catégorie
            <div style={{ fontSize: '11px', marginTop: '6px', color: 'var(--text-2)' }}>
              {libraryLabel(library)}
            </div>
          </div>
        )}

        {loading && results.length === 0 && (
          <div style={{ color: 'var(--text-2)', fontSize: '13px', textAlign: 'center', paddingTop: '48px', fontFamily: 'DM Mono, monospace' }}>
            Recherche…
          </div>
        )}

        {!loading && results.length === 0 && (query || currentPreset.type) && !error && (
          <div style={{ textAlign: 'center', paddingTop: '48px', color: 'var(--text-2)', fontSize: '13px' }}>
            Aucun résultat pour {libraryLabel(library)}
          </div>
        )}

        {results.length > 0 && (
          <>
            <div style={{ fontSize: '10px', color: 'var(--text-2)', fontFamily: 'DM Mono, monospace', marginBottom: '10px' }}>
              {total} résultat{total > 1 ? 's' : ''} · {libraryLabel(library)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {results.map(item => (
                <CatalogCard
                  key={item.rscId}
                  item={item}
                  onAddToList={() => setShowAddModal(item)}
                  viewMode={viewMode}
                />
              ))}
            </div>
            {hasMore && (
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={loading}
                style={{
                  width: '100%', marginTop: '14px', padding: '12px',
                  background: 'var(--surface)', border: '1.5px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', fontSize: '13px', fontWeight: 600,
                  color: 'var(--text-2)', cursor: loading ? 'wait' : 'pointer',
                  fontFamily: 'DM Sans, sans-serif',
                }}
              >
                {loading ? 'Chargement…' : `Voir plus (${total - results.length} restants)`}
              </button>
            )}
          </>
        )}
      </div>

      {/* Add to list modal */}
      {showAddModal && (
        <AddToListModal
          item={showAddModal}
          onAdd={handleAddToList}
          onClose={() => setShowAddModal(null)}
        />
      )}

      {/* Manage presets modal */}
      {showManagePresets && (
        <div style={{
          position: 'fixed', inset: 0, background: 'var(--overlay)',
          display: 'flex', alignItems: 'flex-end', zIndex: 200,
        }} onClick={() => setShowManagePresets(false)}>
          <div
            style={{ background: 'var(--surface)', width: '100%', borderRadius: '16px 16px 0 0', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 12px' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-heading)' }}>Gérer les filtres</div>
              <button onClick={() => setShowManagePresets(false)}
                style={{ background: 'none', border: 'none', fontSize: '20px', color: 'var(--text-2)', cursor: 'pointer', lineHeight: 1 }}>
                ×
              </button>
            </div>
            <div style={{ padding: '0 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-2)' }}>Vue des résultats</span>
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
            </div>
            <div style={{ overflowY: 'auto', padding: '0 12px 24px' }}>
              {orderedPresets.map((p, idx) => (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 8px', borderRadius: 'var(--radius-sm)',
                  opacity: p.hidden ? 0.4 : 1, transition: 'opacity 0.15s',
                }}>
                  <button
                    onClick={() => togglePresetVisibility(p.id)}
                    title={p.hidden ? 'Afficher' : 'Masquer'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', flexShrink: 0, color: p.hidden ? 'var(--text-2)' : 'var(--navy)', display: 'flex', alignItems: 'center' }}
                  >
                    {p.hidden ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
                  </button>
                  <span style={{ fontSize: '16px', flexShrink: 0 }}>{p.icon}</span>
                  <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: 'var(--color-heading)' }}>{p.label}</span>
                  <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                    <button onClick={() => movePreset(p.id, 'up')} disabled={idx === 0}
                      style={{ width: '28px', height: '28px', borderRadius: '6px', background: idx === 0 ? 'transparent' : 'var(--tab-inactive-bg)', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? 'transparent' : 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ChevronUp size={14} strokeWidth={2} /></button>
                    <button onClick={() => movePreset(p.id, 'down')} disabled={idx === orderedPresets.length - 1}
                      style={{ width: '28px', height: '28px', borderRadius: '6px', background: idx === orderedPresets.length - 1 ? 'transparent' : 'var(--tab-inactive-bg)', border: 'none', cursor: idx === orderedPresets.length - 1 ? 'default' : 'pointer', color: idx === orderedPresets.length - 1 ? 'transparent' : 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ChevronDown size={14} strokeWidth={2} /></button>
                  </div>
                  {p.custom ? (
                    <button
                      onClick={() => { setShowManagePresets(false); setDeleteConfirmId(p.id) }}
                      style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'var(--error-bg)', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Supprimer"
                    >×</button>
                  ) : (
                    <div style={{ width: '28px' }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Delete preset confirmation */}
      {deleteConfirmId && (() => {
        const p = customPresets.find(p => p.id === deleteConfirmId)
        if (!p) return null
        return (
          <div style={{
            position: 'fixed', inset: 0, background: 'var(--overlay)',
            display: 'flex', alignItems: 'flex-end', zIndex: 200,
          }} onClick={() => setDeleteConfirmId(null)}>
            <div
              style={{ background: 'var(--surface)', width: '100%', padding: '24px', borderRadius: '16px 16px 0 0' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ fontSize: '20px', marginBottom: '8px', textAlign: 'center' }}>{p.icon}</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-heading)', textAlign: 'center', marginBottom: '20px' }}>
                Supprimer le filtre « {p.label} » ?
              </div>
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
                  onClick={() => deleteCustomPreset(deleteConfirmId)}
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

      {/* Save preset modal */}
      {showSaveModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'var(--overlay)',
          display: 'flex', alignItems: 'flex-end', zIndex: 200,
        }} onClick={() => setShowSaveModal(false)}>
          <div
            style={{ background: 'var(--surface)', width: '100%', padding: '24px', borderRadius: '16px 16px 0 0' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-heading)', marginBottom: '12px' }}>
              Sauvegarder ce filtre
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-2)', marginBottom: '12px' }}>
              {[currentPreset.type, currentPreset.subject, currentPreset.query].filter(Boolean).join(' · ')}
            </div>
            <input
              type="text"
              value={newPresetName}
              onChange={e => setNewPresetName(e.target.value)}
              placeholder="Nom du filtre…"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && saveCurrentAsPreset()}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                border: '1.5px solid var(--border)', fontSize: '14px',
                background: 'var(--bg)', color: 'var(--text)',
                fontFamily: 'DM Sans, sans-serif', outline: 'none', marginBottom: '12px',
              }}
            />
            <button
              onClick={saveCurrentAsPreset}
              disabled={!newPresetName.trim()}
              style={{
                width: '100%', padding: '12px', background: 'var(--navy)', color: 'white',
                border: 'none', borderRadius: 'var(--radius-sm)', fontSize: '14px',
                fontWeight: 700, cursor: !newPresetName.trim() ? 'not-allowed' : 'pointer',
                opacity: !newPresetName.trim() ? 0.45 : 1, fontFamily: 'DM Sans, sans-serif',
              }}
            >
              Sauvegarder
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {addToast && (
        <div style={{
          position: 'fixed', bottom: 'calc(var(--nav-h) + 12px)', left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--navy)', color: 'white',
          padding: '8px 18px', borderRadius: '20px',
          fontSize: '12px', fontWeight: 600,
          fontFamily: 'DM Sans, sans-serif',
          zIndex: 300, whiteSpace: 'nowrap',
        }}>
          ✓ {addToast}
        </div>
      )}
    </div>
  )
}

function CatalogCard({ item, onAddToList, viewMode }: { item: CatalogueItem; onAddToList: () => void; viewMode: ViewMode }) {
  const TYPE_ICON: Record<string, string> = {
    'Jeu vidéo': '🎮', 'Vidéo': '🎬', 'Livre': '📖',
    'BD ou manga': '📚', 'Musique': '🎵',
  }
  const icon = TYPE_ICON[item.type] ?? '📄'

  const [avail, setAvail] = useState<boolean | null | 'checking'>('checking')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/catalogue/holdings?rscId=${encodeURIComponent(item.rscId)}`)
      .then(r => r.json())
      .then((data: { available?: boolean | null }) => {
        if (!cancelled) setAvail(data.available ?? null)
      })
      .catch(() => { if (!cancelled) setAvail(null) })
    return () => { cancelled = true }
  }, [item.rscId])

  const dotColor = avail === true ? 'var(--green)'
    : avail === false ? 'var(--orange)'
    : 'var(--border)'

  const typeConf = TYPE_CONFIG[item.type]

  return (
    <div
      onClick={() => item.url && window.open(item.url, '_blank', 'noopener,noreferrer')}
      style={{
        background: 'var(--surface)', borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center',
        cursor: item.url ? 'pointer' : 'default',
        overflow: 'hidden',
      }}
    >
      {/* Vignette — images or icons mode */}
      {viewMode === 'images' && (
        <CoverImg thumbnail={item.thumbnail} width={44} height={63} typeIcon={icon} subject={item.subject} borderRadius={0} />
      )}
      {viewMode === 'icons' && (
        <div style={{
          width: 44, height: 63, flexShrink: 0,
          background: typeConf?.bg ?? 'var(--tab-inactive-bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22,
        }}>
          {typeConf?.emoji ?? icon}
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
          <div style={{
            width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
            background: dotColor,
            animation: avail === 'checking' ? 'pulse 1s infinite' : 'none',
          }} />
          <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--color-heading)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
            {item.title}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '2px' }}>
          {item.type && viewMode !== 'dots' && (
            <span style={{
              fontSize: '9px', fontWeight: 700, padding: '2px 6px',
              borderRadius: '20px', background: 'var(--tab-inactive-bg)',
              color: 'var(--text-2)', whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              {item.type}
            </span>
          )}
          {item.publisher && <span style={{ fontSize: '11px', color: 'var(--text-2)' }}>{item.publisher}</span>}
          {item.year && <span style={{ fontSize: '11px', color: 'var(--text-2)' }}>{item.year}</span>}
        </div>
        {item.desc && (
          <div style={{ fontSize: '11px', color: 'var(--text-2)', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
            {item.desc}
          </div>
        )}
      </div>

      {/* + Liste button */}
      <div style={{ flexShrink: 0, padding: '0 12px', display: 'flex', alignItems: 'center' }}>
        <button
          onClick={e => { e.stopPropagation(); onAddToList() }}
          style={{
            background: 'var(--navy)', color: 'white',
            border: 'none', borderRadius: '20px',
            padding: '8px 14px', fontSize: '12px', fontWeight: 700,
            cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap',
            minHeight: '36px',
          }}
        >
          + Liste
        </button>
      </div>
    </div>
  )
}

function AddToListModal({ item, onAdd, onClose }: {
  item: CatalogueItem
  onAdd: (item: CatalogueItem, listId: string) => void
  onClose: () => void
}) {
  const [store, setStore] = useState(loadStore)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('⭐')

  function handleCreate() {
    const name = newName.trim()
    if (!name) return
    const id = `custom_${Date.now()}`
    const updated = addCustomList(store, { id, name, icon: newIcon, docType: '', subject: '', queryExtra: '' })
    const withItem = addItem(updated, id, item.title)
    saveStore(withItem)
    setStore(withItem)
    onAdd(item, id)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--overlay)',
      display: 'flex', alignItems: 'flex-end', zIndex: 200,
    }} onClick={onClose}>
      <div
        style={{ background: 'var(--surface)', width: '100%', padding: '20px', borderRadius: '16px 16px 0 0', maxHeight: '80vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '4px' }}>Ajouter à une liste</div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-heading)', marginBottom: '16px', lineHeight: 1.3 }}>
          {item.title}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
          {store.lists.map(list => (
            <button
              key={list.id}
              onClick={() => onAdd(item, list.id)}
              style={{
                padding: '12px 14px', background: 'var(--bg)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                textAlign: 'left', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                display: 'flex', alignItems: 'center', gap: '10px',
              }}
            >
              <span style={{ fontSize: '20px' }}>{list.icon}</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-heading)' }}>{list.name}</span>
            </button>
          ))}
        </div>

        {!creating ? (
          <button
            onClick={() => setCreating(true)}
            style={{
              width: '100%', padding: '11px', background: 'transparent',
              border: '1.5px dashed var(--border)', borderRadius: 'var(--radius-sm)',
              fontSize: '13px', fontWeight: 600, color: 'var(--text-2)',
              cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
            }}
          >
            + Nouvelle liste
          </button>
        ) : (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px', marginTop: '4px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-heading)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Nouvelle liste
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
              {LIST_ICONS.map(ic => (
                <button
                  key={ic}
                  onClick={() => setNewIcon(ic)}
                  style={{
                    width: '36px', height: '36px', borderRadius: '8px', fontSize: '18px',
                    border: newIcon === ic ? '2px solid var(--navy)' : '1.5px solid var(--border)',
                    background: newIcon === ic ? 'var(--tab-inactive-bg)' : 'transparent',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {ic}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Nom de la liste…"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              style={{
                width: '100%', padding: '10px 14px', marginBottom: '10px',
                borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--border)',
                fontSize: '14px', background: 'var(--bg)', color: 'var(--text)',
                fontFamily: 'DM Sans, sans-serif', outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => { setCreating(false); setNewName('') }}
                style={{
                  flex: 1, padding: '11px', background: 'var(--bg)',
                  border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)',
                  fontSize: '13px', fontWeight: 600, color: 'var(--text-2)',
                  cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim()}
                style={{
                  flex: 2, padding: '11px', background: 'var(--navy)', color: 'white',
                  border: 'none', borderRadius: 'var(--radius-sm)',
                  fontSize: '13px', fontWeight: 700,
                  cursor: !newName.trim() ? 'not-allowed' : 'pointer',
                  opacity: !newName.trim() ? 0.45 : 1,
                  fontFamily: 'DM Sans, sans-serif',
                }}
              >
                Créer et ajouter
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
