import React, { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";
import {
  Check,
  Copy,
  FolderOpen,
  Pencil,
  RotateCcw,
  Send,
  Star,
  Trash2,
  Sparkles,
  X,
  Brain,
  Loader2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  commands,
  events,
  type HistoryEntry,
  type HistoryUpdatePayload,
} from "@/bindings";
import { useOsType } from "@/hooks/useOsType";
import { formatDateTime } from "@/utils/dateFormat";
import { AudioPlayer } from "../../ui/AudioPlayer";
import { Button } from "../../ui/Button";

const IconButton: React.FC<{
  onClick: () => void;
  title: string;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}> = ({ onClick, title, disabled, active, children }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`p-1.5 rounded-md flex items-center justify-center transition-colors cursor-pointer disabled:cursor-not-allowed disabled:text-text/20 ${
      active
        ? "text-logo-primary hover:text-logo-primary/80"
        : "text-text/50 hover:text-logo-primary"
    }`}
    title={title}
  >
    {children}
  </button>
);

const PAGE_SIZE = 30;

interface OpenRecordingsButtonProps {
  onClick: () => void;
  label: string;
}

const OpenRecordingsButton: React.FC<OpenRecordingsButtonProps> = ({
  onClick,
  label,
}) => (
  <Button
    onClick={onClick}
    variant="secondary"
    size="sm"
    className="flex items-center gap-2"
    title={label}
  >
    <FolderOpen className="w-4 h-4" />
    <span>{label}</span>
  </Button>
);

export const HistorySettings: React.FC = () => {
  const { t, i18n } = useTranslation();
  const osType = useOsType();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const entriesRef = useRef<HistoryEntry[]>([]);
  const loadingRef = useRef(false);

  // States for right-side AI Summary panel
  const [activeSummaryEntry, setActiveSummaryEntry] =
    useState<HistoryEntry | null>(null);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isLargeScreen, setIsLargeScreen] = useState(window.innerWidth >= 768);
  const [showCustomPromptModal, setShowCustomPromptModal] = useState(false);
  const [customPromptInput, setCustomPromptInput] = useState("");

  useEffect(() => {
    const handleResize = () => {
      setIsLargeScreen(window.innerWidth >= 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Keep ref in sync for use in IntersectionObserver callback
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const loadPage = useCallback(async (cursor?: number) => {
    const isFirstPage = cursor === undefined;
    if (!isFirstPage && loadingRef.current) return;
    loadingRef.current = true;

    if (isFirstPage) setLoading(true);

    try {
      const result = await commands.getHistoryEntries(
        cursor ?? null,
        PAGE_SIZE,
      );
      if (result.status === "ok") {
        const { entries: newEntries, has_more } = result.data;
        setEntries((prev) =>
          isFirstPage ? newEntries : [...prev, ...newEntries],
        );
        setHasMore(has_more);
      }
    } catch (error) {
      console.error("Failed to load history entries:", error);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadPage();
  }, [loadPage]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    if (loading) return;

    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (observerEntries) => {
        const first = observerEntries[0];
        if (first.isIntersecting) {
          const lastEntry = entriesRef.current[entriesRef.current.length - 1];
          if (lastEntry) {
            loadPage(lastEntry.id);
          }
        }
      },
      { threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading, hasMore, loadPage]);

  // Listen for new entries added from the transcription pipeline
  useEffect(() => {
    const unlisten = events.historyUpdatePayload.listen((event) => {
      const payload: HistoryUpdatePayload = event.payload;
      if (payload.action === "added") {
        setEntries((prev) => [payload.entry, ...prev]);
      } else if (payload.action === "updated") {
        setEntries((prev) =>
          prev.map((e) => (e.id === payload.entry.id ? payload.entry : e)),
        );
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const toggleSaved = async (id: number) => {
    // Optimistic update
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, saved: !e.saved } : e)),
    );
    try {
      const result = await commands.toggleHistoryEntrySaved(id);
      if (result.status !== "ok") {
        // Revert on failure
        setEntries((prev) =>
          prev.map((e) => (e.id === id ? { ...e, saved: !e.saved } : e)),
        );
      }
    } catch (error) {
      console.error("Failed to toggle saved status:", error);
      // Revert on failure
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, saved: !e.saved } : e)),
      );
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  };

  const getAudioUrl = useCallback(
    async (fileName: string) => {
      try {
        const result = await commands.getAudioFilePath(fileName);
        if (result.status === "ok") {
          if (osType === "linux") {
            const fileData = await readFile(result.data);
            const blob = new Blob([fileData], { type: "audio/wav" });
            return URL.createObjectURL(blob);
          }
          return convertFileSrc(result.data, "asset");
        }
        return null;
      } catch (error) {
        console.error("Failed to get audio file path:", error);
        return null;
      }
    },
    [osType],
  );

  const deleteAudioEntry = async (id: number) => {
    // Optimistically remove
    setEntries((prev) => prev.filter((e) => e.id !== id));
    if (activeSummaryEntry?.id === id) {
      setActiveSummaryEntry(null);
      setSummaryText(null);
    }
    try {
      const result = await commands.deleteHistoryEntry(id);
      if (result.status !== "ok") {
        // Reload on failure
        loadPage();
      }
    } catch (error) {
      console.error("Failed to delete entry:", error);
      loadPage();
    }
  };

  const retryHistoryEntry = async (id: number) => {
    const result = await commands.retryHistoryEntryTranscription(id);
    if (result.status !== "ok") {
      throw new Error(String(result.error));
    }
  };

  const openRecordingsFolder = async () => {
    try {
      const result = await commands.openRecordingsFolder();
      if (result.status !== "ok") {
        throw new Error(String(result.error));
      }
    } catch (error) {
      console.error("Failed to open recordings folder:", error);
    }
  };

  // Handler for showing/fetching summary
  const handleShowSummary = async (entry: HistoryEntry) => {
    if (activeSummaryEntry?.id === entry.id) {
      // Toggle off if clicking the same entry
      setActiveSummaryEntry(null);
      setSummaryText(null);
      return;
    }

    setActiveSummaryEntry(entry);

    // If summary is already saved in the database, use it directly
    if (entry.summary_text && entry.summary_text.trim()) {
      setSummaryText(entry.summary_text);
      setIsSummarizing(false);
      return;
    }

    setSummaryText(null);
    setIsSummarizing(true);

    try {
      const result = await commands.summarizeTranscription(
        entry.id,
        false,
        null,
      );
      if (result.status === "ok") {
        setSummaryText(result.data);
        // Update the summary text of the entry in our local list immediately
        setEntries((prev) =>
          prev.map((e) =>
            e.id === entry.id ? { ...e, summary_text: result.data } : e,
          ),
        );
      } else {
        toast.error(t("settings.history.summaryError"), {
          description: String(result.error),
        });
        setActiveSummaryEntry(null);
      }
    } catch (error: any) {
      console.error("Failed to summarize:", error);
      toast.error(t("settings.history.summaryError"), {
        description: error?.message || String(error),
      });
      setActiveSummaryEntry(null);
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleRegenerateSummary = async (entry: HistoryEntry) => {
    setActiveSummaryEntry(entry);
    setSummaryText(null);
    setIsSummarizing(true);

    try {
      const result = await commands.summarizeTranscription(
        entry.id,
        true,
        null,
      );
      if (result.status === "ok") {
        setSummaryText(result.data);
        // Update the summary text of the entry in our local list immediately
        setEntries((prev) =>
          prev.map((e) =>
            e.id === entry.id ? { ...e, summary_text: result.data } : e,
          ),
        );
      } else {
        toast.error(t("settings.history.summaryError"), {
          description: String(result.error),
        });
        setActiveSummaryEntry(null);
      }
    } catch (error: any) {
      console.error("Failed to regenerate summary:", error);
      toast.error(t("settings.history.summaryError"), {
        description: error?.message || String(error),
      });
      setActiveSummaryEntry(null);
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleRegenerateWithCustomPrompt = async (
    entry: HistoryEntry,
    prompt: string,
  ) => {
    setActiveSummaryEntry(entry);
    setSummaryText(null);
    setIsSummarizing(true);
    setShowCustomPromptModal(false);
    setCustomPromptInput("");

    try {
      const result = await commands.summarizeTranscription(
        entry.id,
        true,
        prompt,
      );
      if (result.status === "ok") {
        setSummaryText(result.data);
        setEntries((prev) =>
          prev.map((e) =>
            e.id === entry.id ? { ...e, summary_text: result.data } : e,
          ),
        );
      } else {
        toast.error(t("settings.history.summaryError"), {
          description: String(result.error),
        });
        setActiveSummaryEntry(null);
      }
    } catch (error: any) {
      console.error("Failed to regenerate summary with custom prompt:", error);
      toast.error(t("settings.history.summaryError"), {
        description: error?.message || String(error),
      });
      setActiveSummaryEntry(null);
    } finally {
      setIsSummarizing(false);
    }
  };

  let content: React.ReactNode;

  if (loading) {
    content = (
      <div className="px-4 py-3 text-center text-text/60">
        {t("settings.history.loading")}
      </div>
    );
  } else if (entries.length === 0) {
    content = (
      <div className="px-4 py-3 text-center text-text/60">
        {t("settings.history.empty")}
      </div>
    );
  } else {
    content = (
      <>
        <div className="divide-y divide-mid-gray/20">
          {entries.map((entry) => (
            <HistoryEntryComponent
              key={entry.id}
              entry={entry}
              onToggleSaved={() => toggleSaved(entry.id)}
              onCopyText={() => copyToClipboard(entry.transcription_text)}
              onShowSummary={() => handleShowSummary(entry)}
              onRegenerateSummary={() => handleRegenerateSummary(entry)}
              onRegenerateWithCustomPrompt={(prompt) =>
                handleRegenerateWithCustomPrompt(entry, prompt)
              }
              isSummaryActive={activeSummaryEntry?.id === entry.id}
              isSummarizingThis={
                isSummarizing && activeSummaryEntry?.id === entry.id
              }
              getAudioUrl={getAudioUrl}
              deleteAudio={deleteAudioEntry}
              retryTranscription={retryHistoryEntry}
              showInlineSummary={!isLargeScreen}
              summaryText={
                activeSummaryEntry?.id === entry.id ? summaryText : null
              }
            />
          ))}
        </div>
        {/* Sentinel for infinite scroll */}
        <div ref={sentinelRef} className="h-1" />
      </>
    );
  }

  return (
    <div
      className={`w-full flex flex-col md:flex-row gap-6 items-start transition-all duration-300 ${
        activeSummaryEntry && isLargeScreen ? "max-w-7xl" : "max-w-3xl"
      } mx-auto`}
    >
      {/* Left side: History list */}
      <div className="transition-all duration-300 max-w-3xl w-full flex-shrink-0 space-y-6">
        <div className="space-y-2">
          <div className="px-4 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-medium text-mid-gray uppercase tracking-wide">
                {t("settings.history.title")}
              </h2>
            </div>
            <OpenRecordingsButton
              onClick={openRecordingsFolder}
              label={t("settings.history.openFolder")}
            />
          </div>
          <div className="bg-background border border-mid-gray/20 rounded-lg overflow-visible">
            {content}
          </div>
        </div>
      </div>

      {/* Right side: AI Summary panel */}
      {activeSummaryEntry && isLargeScreen && (
        <div className="w-full md:w-80 lg:w-96 flex-shrink-0 max-h-[calc(100vh-120px)] bg-background border border-mid-gray/20 rounded-lg p-4 sticky top-4 flex flex-col gap-4 animate-in slide-in-from-right duration-300">
          <div className="flex justify-between items-center pb-2 border-b border-mid-gray/20">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-logo-primary" />
              <h3 className="text-sm font-semibold text-text">
                {t("settings.history.summaryTitle")}
              </h3>
            </div>
            <button
              onClick={() => {
                setActiveSummaryEntry(null);
                setSummaryText(null);
              }}
              className="text-text/50 hover:text-text cursor-pointer p-1 rounded hover:bg-mid-gray/10"
              title="Close panel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-medium text-logo-primary truncate">
              {activeSummaryEntry.title || activeSummaryEntry.file_name}
            </div>
            <div className="text-[10px] text-mid-gray">
              {formatDateTime(
                String(activeSummaryEntry.timestamp),
                i18n.language,
              )}
            </div>
          </div>

          <div className="flex-1 min-h-[180px] overflow-y-auto bg-mid-gray/5 border border-mid-gray/10 rounded-lg p-3 relative text-sm text-text/80 select-text cursor-text">
            {isSummarizing ? (
              <div className="flex flex-col items-center justify-center gap-3 text-text/40 py-8 h-full">
                <Loader2 className="w-6 h-6 text-logo-primary animate-spin" />
                <span className="text-xs">
                  {t("settings.history.summarizing")}
                </span>
              </div>
            ) : summaryText ? (
              <p className="whitespace-pre-wrap leading-relaxed">
                {summaryText}
              </p>
            ) : (
              <div className="text-center py-8 text-text/30 text-xs">
                {t("settings.history.noSummary")}
              </div>
            )}
          </div>

          {summaryText && (
            <div className="flex flex-col gap-2 w-full flex-shrink-0">
              <div className="flex gap-2 w-full">
                <Button
                  onClick={() => {
                    if (activeSummaryEntry) {
                      handleRegenerateSummary(activeSummaryEntry);
                    }
                  }}
                  disabled={isSummarizing}
                  variant="secondary"
                  size="sm"
                  className="flex-1 flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{t("settings.history.regenerateSummary")}</span>
                </Button>
                <Button
                  onClick={() => setShowCustomPromptModal((v) => !v)}
                  disabled={isSummarizing}
                  variant="secondary"
                  size="sm"
                  className="flex-1 flex items-center justify-center gap-1.5"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>{t("settings.history.regenerateWithPrompt")}</span>
                </Button>
                <Button
                  onClick={() => {
                    if (summaryText) {
                      navigator.clipboard.writeText(summaryText);
                      toast.success(t("settings.history.summaryCopied"));
                    }
                  }}
                  variant="secondary"
                  size="sm"
                  className="flex-1 flex items-center justify-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{t("settings.history.copySummary")}</span>
                </Button>
              </div>

              {showCustomPromptModal && (
                <div className="flex flex-col gap-2 p-3 bg-mid-gray/5 border border-mid-gray/15 rounded-lg animate-in fade-in slide-in-from-top-2 duration-200">
                  <label className="text-xs font-medium text-text/70">
                    {t("settings.history.customPromptTitle")}
                  </label>
                  <textarea
                    value={customPromptInput}
                    onChange={(e) => setCustomPromptInput(e.target.value)}
                    placeholder={t("settings.history.customPromptPlaceholder")}
                    className="w-full min-h-[72px] max-h-32 resize-y rounded-md border border-mid-gray/20 bg-background px-3 py-2 text-xs text-text placeholder:text-text/30 focus:outline-none focus:ring-1 focus:ring-logo-primary/40 focus:border-logo-primary/40"
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        customPromptInput.trim() &&
                        activeSummaryEntry
                      ) {
                        e.preventDefault();
                        handleRegenerateWithCustomPrompt(
                          activeSummaryEntry,
                          customPromptInput.trim(),
                        );
                      }
                    }}
                  />
                  <div className="flex gap-2 justify-end">
                    <Button
                      onClick={() => {
                        setShowCustomPromptModal(false);
                        setCustomPromptInput("");
                      }}
                      variant="secondary"
                      size="sm"
                      className="text-xs px-3"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                    <Button
                      onClick={() => {
                        if (activeSummaryEntry && customPromptInput.trim()) {
                          handleRegenerateWithCustomPrompt(
                            activeSummaryEntry,
                            customPromptInput.trim(),
                          );
                        }
                      }}
                      disabled={!customPromptInput.trim() || isSummarizing}
                      variant="secondary"
                      size="sm"
                      className="text-xs px-3 flex items-center gap-1.5"
                    >
                      <Send className="w-3 h-3" />
                      <span>{t("settings.history.customPromptSubmit")}</span>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface HistoryEntryProps {
  entry: HistoryEntry;
  onToggleSaved: () => void;
  onCopyText: () => void;
  onShowSummary: () => void;
  onRegenerateSummary: () => void;
  onRegenerateWithCustomPrompt: (prompt: string) => void;
  isSummaryActive: boolean;
  isSummarizingThis: boolean;
  getAudioUrl: (fileName: string) => Promise<string | null>;
  deleteAudio: (id: number) => Promise<void>;
  retryTranscription: (id: number) => Promise<void>;
  showInlineSummary: boolean;
  summaryText: string | null;
}

const HistoryEntryComponent: React.FC<HistoryEntryProps> = ({
  entry,
  onToggleSaved,
  onCopyText,
  onShowSummary,
  onRegenerateSummary,
  onRegenerateWithCustomPrompt,
  isSummaryActive,
  isSummarizingThis,
  getAudioUrl,
  deleteAudio,
  retryTranscription,
  showInlineSummary,
  summaryText,
}) => {
  const { t, i18n } = useTranslation();
  const [showCopied, setShowCopied] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const hasTranscription = entry.transcription_text.trim().length > 0;

  const handleLoadAudio = useCallback(
    () => getAudioUrl(entry.file_name),
    [getAudioUrl, entry.file_name],
  );

  const handleCopyText = () => {
    if (!hasTranscription) {
      return;
    }

    onCopyText();
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 2000);
  };

  const handleDeleteEntry = async () => {
    try {
      await deleteAudio(entry.id);
    } catch (error) {
      console.error("Failed to delete entry:", error);
      toast.error(t("settings.history.deleteError"));
    }
  };

  const handleRetranscribe = async () => {
    try {
      setRetrying(true);
      await retryTranscription(entry.id);
    } catch (error) {
      console.error("Failed to re-transcribe:", error);
      toast.error(t("settings.history.retranscribeError"));
    } finally {
      setRetrying(false);
    }
  };

  const formattedDate = formatDateTime(String(entry.timestamp), i18n.language);

  return (
    <div className="px-4 py-2 pb-5 flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <p className="text-sm font-medium">{formattedDate}</p>
        <div className="flex items-center">
          <IconButton
            onClick={handleCopyText}
            disabled={!hasTranscription || retrying}
            title={t("settings.history.copyToClipboard")}
          >
            {showCopied ? (
              <Check width={16} height={16} />
            ) : (
              <Copy width={16} height={16} />
            )}
          </IconButton>
          <IconButton
            onClick={onShowSummary}
            disabled={!hasTranscription || retrying}
            active={isSummaryActive}
            title={t("settings.history.summarize")}
          >
            <Sparkles
              width={16}
              height={16}
              className={
                isSummarizingThis ? "animate-spin text-logo-primary" : ""
              }
            />
          </IconButton>
          <IconButton
            onClick={onToggleSaved}
            disabled={retrying}
            active={entry.saved}
            title={
              entry.saved
                ? t("settings.history.unsave")
                : t("settings.history.save")
            }
          >
            <Star
              width={16}
              height={16}
              fill={entry.saved ? "currentColor" : "none"}
            />
          </IconButton>
          <IconButton
            onClick={handleRetranscribe}
            disabled={retrying}
            title={t("settings.history.retranscribe")}
          >
            <RotateCcw
              width={16}
              height={16}
              style={
                retrying
                  ? { animation: "spin 1s linear infinite reverse" }
                  : undefined
              }
            />
          </IconButton>
          <IconButton
            onClick={handleDeleteEntry}
            disabled={retrying}
            title={t("settings.history.delete")}
          >
            <Trash2 width={16} height={16} />
          </IconButton>
        </div>
      </div>

      <p
        className={`italic text-sm pb-2 ${
          retrying
            ? ""
            : hasTranscription
              ? "text-text/90 select-text cursor-text whitespace-pre-wrap break-words"
              : "text-text/40"
        }`}
        style={
          retrying
            ? { animation: "transcribe-pulse 3s ease-in-out infinite" }
            : undefined
        }
      >
        {retrying && (
          <style>{`
            @keyframes transcribe-pulse {
              0%, 100% { color: color-mix(in srgb, var(--color-text) 40%, transparent); }
              50% { color: color-mix(in srgb, var(--color-text) 90%, transparent); }
            }
          `}</style>
        )}
        {retrying
          ? t("settings.history.transcribing")
          : hasTranscription
            ? entry.transcription_text
            : t("settings.history.transcriptionFailed")}
      </p>

      <AudioPlayer onLoadRequest={handleLoadAudio} className="w-full" />

      {showInlineSummary && isSummaryActive && (
        <div className="mt-3 bg-mid-gray/5 border border-mid-gray/10 rounded-lg p-3 flex flex-col gap-3">
          <div className="flex justify-between items-center pb-1.5 border-b border-mid-gray/10">
            <div className="flex items-center gap-1.5">
              <Brain className="w-3.5 h-3.5 text-logo-primary" />
              <h4 className="text-xs font-semibold text-text">
                {t("settings.history.summaryTitle")}
              </h4>
            </div>
            <button
              onClick={onShowSummary}
              className="text-text/50 hover:text-text cursor-pointer p-0.5 rounded hover:bg-mid-gray/10"
              title="Close summary"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="text-xs text-text/80 select-text cursor-text leading-relaxed max-h-48 overflow-y-auto pr-1">
            {isSummarizingThis ? (
              <div className="flex flex-col items-center justify-center gap-2 text-text/40 py-4">
                <Loader2 className="w-4 h-4 text-logo-primary animate-spin" />
                <span className="text-[10px]">
                  {t("settings.history.summarizing")}
                </span>
              </div>
            ) : summaryText ? (
              <p className="whitespace-pre-wrap">{summaryText}</p>
            ) : (
              <div className="text-center py-4 text-text/30 text-[10px]">
                {t("settings.history.noSummary")}
              </div>
            )}
          </div>

          {summaryText && !isSummarizingThis && (
            <InlineSummaryActions
              summaryText={summaryText}
              onRegenerateSummary={onRegenerateSummary}
              onRegenerateWithCustomPrompt={onRegenerateWithCustomPrompt}
            />
          )}
        </div>
      )}
    </div>
  );
};

// Extracted sub-component for inline summary action buttons (small screen)
const InlineSummaryActions: React.FC<{
  summaryText: string;
  onRegenerateSummary: () => void;
  onRegenerateWithCustomPrompt: (prompt: string) => void;
}> = ({ summaryText, onRegenerateSummary, onRegenerateWithCustomPrompt }) => {
  const { t } = useTranslation();
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptInput, setPromptInput] = useState("");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end gap-2">
        <button
          onClick={onRegenerateSummary}
          className="flex items-center gap-1 text-[11px] font-medium text-text/60 hover:text-logo-primary transition-colors py-1 px-2 rounded border border-mid-gray/20 hover:border-logo-primary/30 cursor-pointer"
        >
          <RotateCcw className="w-3 h-3" />
          <span>{t("settings.history.regenerateSummary")}</span>
        </button>
        <button
          onClick={() => setShowPrompt((v) => !v)}
          className="flex items-center gap-1 text-[11px] font-medium text-text/60 hover:text-logo-primary transition-colors py-1 px-2 rounded border border-mid-gray/20 hover:border-logo-primary/30 cursor-pointer"
        >
          <Pencil className="w-3 h-3" />
          <span>{t("settings.history.regenerateWithPrompt")}</span>
        </button>
        <button
          onClick={() => {
            navigator.clipboard.writeText(summaryText);
            toast.success(t("settings.history.summaryCopied"));
          }}
          className="flex items-center gap-1 text-[11px] font-medium text-text/60 hover:text-logo-primary transition-colors py-1 px-2 rounded border border-mid-gray/20 hover:border-logo-primary/30 cursor-pointer"
        >
          <Copy className="w-3 h-3" />
          <span>{t("settings.history.copySummary")}</span>
        </button>
      </div>

      {showPrompt && (
        <div className="flex flex-col gap-1.5 p-2 bg-mid-gray/5 border border-mid-gray/15 rounded-lg animate-in fade-in slide-in-from-top-2 duration-200">
          <label className="text-[10px] font-medium text-text/70">
            {t("settings.history.customPromptTitle")}
          </label>
          <textarea
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            placeholder={t("settings.history.customPromptPlaceholder")}
            className="w-full min-h-[56px] max-h-24 resize-y rounded-md border border-mid-gray/20 bg-background px-2 py-1.5 text-[11px] text-text placeholder:text-text/30 focus:outline-none focus:ring-1 focus:ring-logo-primary/40 focus:border-logo-primary/40"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && promptInput.trim()) {
                e.preventDefault();
                onRegenerateWithCustomPrompt(promptInput.trim());
                setShowPrompt(false);
                setPromptInput("");
              }
            }}
          />
          <div className="flex gap-1.5 justify-end">
            <button
              onClick={() => {
                setShowPrompt(false);
                setPromptInput("");
              }}
              className="text-[10px] font-medium text-text/50 hover:text-text transition-colors py-0.5 px-2 rounded border border-mid-gray/20 hover:border-mid-gray/30 cursor-pointer"
            >
              <X className="w-2.5 h-2.5" />
            </button>
            <button
              onClick={() => {
                if (promptInput.trim()) {
                  onRegenerateWithCustomPrompt(promptInput.trim());
                  setShowPrompt(false);
                  setPromptInput("");
                }
              }}
              disabled={!promptInput.trim()}
              className="flex items-center gap-1 text-[10px] font-medium text-text/60 hover:text-logo-primary transition-colors py-0.5 px-2 rounded border border-mid-gray/20 hover:border-logo-primary/30 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="w-2.5 h-2.5" />
              <span>{t("settings.history.customPromptSubmit")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
