import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { LibraryHome } from "@/components/library/library-home"
import { ReaderView } from "@/components/reader/reader-view"
import { DirectionalTransition } from "@/components/ui/directional-transition"
import { RedirectToSignIn, useCurrentUserState } from "@/lib/auth/gates"
import { buildBookmarklet, decodeImportPayload } from "@/lib/bookmarklet"
import { useLibraryFilters } from "@/lib/hooks/use-library-filters"
import { useLibraryNav } from "@/lib/hooks/use-library-nav"
import { usePasteImport } from "@/lib/hooks/use-paste-import"
import { useSaveArticle } from "@/lib/hooks/use-save-article"
import {
  bootstrapLibraryFromServer,
  clearLibraryLocal,
} from "@/lib/library-remote"
import { readDraftUrl } from "@/lib/session-article"
import { itemToArticle, useLibraryStore } from "@/lib/store"
import type { LibraryItem } from "@/lib/store"

export const Route = createFileRoute("/")({
  component: QuartoApp,
  validateSearch: (search: Record<string, unknown>) => ({
    import: typeof search.import === "string" ? search.import : undefined,
  }),
})

function QuartoApp() {
  const { user, isPending } = useCurrentUserState()
  const [libraryReady, setLibraryReady] = useState(false)
  const [libraryError, setLibraryError] = useState<string | null>(null)

  useEffect(() => {
    if (isPending) return
    if (!user) {
      clearLibraryLocal()
      setLibraryReady(false)
      setLibraryError(null)
      return
    }

    let cancelled = false
    setLibraryReady(false)
    setLibraryError(null)

    void bootstrapLibraryFromServer()
      .then(() => {
        if (!cancelled) setLibraryReady(true)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const message =
          error instanceof Error ? error.message : "Could not load your library."
        setLibraryError(message)
      })

    return () => {
      cancelled = true
    }
  }, [user, isPending])

  if (isPending) {
    return <AuthLoadingScreen label="Checking your session…" />
  }

  if (!user) {
    return <RedirectToSignIn />
  }

  if (libraryError) {
    return (
      <AuthLoadingScreen
        label={libraryError}
        actionLabel="Try again"
        onAction={() => {
          setLibraryError(null)
          setLibraryReady(false)
          void bootstrapLibraryFromServer()
            .then(() => setLibraryReady(true))
            .catch((error: unknown) => {
              const message =
                error instanceof Error
                  ? error.message
                  : "Could not load your library."
              setLibraryError(message)
            })
        }}
      />
    )
  }

  if (!libraryReady) {
    return <AuthLoadingScreen label="Loading your library…" />
  }

  return <LibraryApp />
}

function AuthLoadingScreen({
  label,
  actionLabel,
  onAction,
}: {
  label: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--paper)] px-6 text-[var(--ink)]">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <p className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
          Quarto
        </p>
        <p className="text-sm text-[var(--muted)]">{label}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="rounded-full bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-[var(--paper)] transition hover:opacity-90"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function LibraryApp() {
  const { import: importToken } = Route.useSearch()
  const navigate = Route.useNavigate()
  const items = useLibraryStore((s) => s.items)
  const archiveItem = useLibraryStore((s) => s.archiveItem)

  const { openId, goOpen } = useLibraryNav()
  const {
    url,
    setUrl,
    busy,
    error,
    setError,
    save,
    saveLinkOnly,
  } = useSaveArticle(goOpen)
  const {
    pasteOpen,
    setPasteOpen,
    pasteTitle,
    setPasteTitle,
    pasteBody,
    setPasteBody,
    pasteUrl,
    setPasteUrl,
    busy: pasteBusy,
    importPasted,
    seedPaste,
  } = usePasteImport(goOpen)
  const filters = useLibraryFilters(items)

  const [toolsOpen, setToolsOpen] = useState(false)
  const [bookmarklet, setBookmarklet] = useState("")
  const [savingWithoutOpen, setSavingWithoutOpen] = useState(false)

  const openItem = items.find((item) => item.id === openId) ?? null
  const openArticle = openItem ? itemToArticle(openItem) : null

  useEffect(() => {
    setBookmarklet(buildBookmarklet())
  }, [])

  useEffect(() => {
    const draft = readDraftUrl()
    if (draft) setUrl(draft)
  }, [setUrl])

  useEffect(() => {
    if (!importToken) return
    const payload = decodeImportPayload(importToken)
    void navigate({ search: {}, replace: true })
    if (!payload) {
      setError("That bookmarklet link was invalid. Try again.")
      return
    }
    if (payload.excerpt || payload.title) {
      seedPaste(payload)
      return
    }
    setUrl(payload.url)
    void save(payload.url)
  }, [importToken, navigate, save, seedPaste, setError, setUrl])

  async function handleSaveLinkOnly() {
    setSavingWithoutOpen(true)
    try {
      await saveLinkOnly()
    } finally {
      setSavingWithoutOpen(false)
    }
  }

  function handleOpenItem(item: LibraryItem) {
    if (item.status === "archived") archiveItem(item.id, false)
    goOpen(item.id)
  }

  return (
    <DirectionalTransition
      transitionKey={openArticle ? `reader-${openArticle.id}` : "library"}
      direction={openArticle ? "forward" : "back"}
    >
      {openArticle && openItem ? (
        <ReaderView
          article={openArticle}
          item={openItem}
          onBack={() => goOpen(null)}
        />
      ) : (
        <LibraryHome
          url={url}
          busy={busy}
          error={error}
          savingWithoutOpen={savingWithoutOpen}
          bookmarklet={bookmarklet}
          toolsOpen={toolsOpen}
          onToolsOpenChange={setToolsOpen}
          onUrlChange={(next) => {
            setUrl(next)
            if (error) setError(null)
          }}
          onClearError={() => setError(null)}
          onSave={() => void save()}
          onSaveLinkOnly={() => void handleSaveLinkOnly()}
          filters={{
            tab: filters.tab,
            folderId: filters.folderId,
            tag: filters.tag,
            query: filters.query,
            favoritesOnly: filters.favoritesOnly,
            folders: filters.folders,
            allTags: filters.allTags,
            filtered: filters.filtered,
            onTab: filters.setTab,
            onFolder: filters.setFolderId,
            onTag: filters.setTag,
            onQuery: filters.setQuery,
            onFavoritesOnly: filters.setFavoritesOnly,
          }}
          paste={{
            open: pasteOpen,
            title: pasteTitle,
            body: pasteBody,
            url: pasteUrl,
            busy: pasteBusy,
            onOpenPaste: () => setPasteOpen(true),
            onOpenChange: setPasteOpen,
            onTitle: setPasteTitle,
            onBody: setPasteBody,
            onUrl: setPasteUrl,
            onImport: () => void importPasted(),
          }}
          onOpenItem={handleOpenItem}
        />
      )}
    </DirectionalTransition>
  )
}
