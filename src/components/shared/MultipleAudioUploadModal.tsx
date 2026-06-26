import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  FileAudio,
  Loader2,
  X,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";

interface MultipleAudioUploadModalProps {
  isOpen: boolean;
  filePaths: string[];
  onClose: () => void;
  onProcess: (paths: string[], combine: boolean) => Promise<void>;
  isProcessing: boolean;
}

const MultipleAudioUploadModal: React.FC<MultipleAudioUploadModalProps> = ({
  isOpen,
  filePaths,
  onClose,
  onProcess,
  isProcessing,
}) => {
  const { t } = useTranslation();
  const [files, setFiles] = useState<string[]>([]);
  const [combine, setCombine] = useState(true);

  // Progress States
  const [progressStatus, setProgressStatus] = useState<string>("");
  const [progressFile, setProgressFile] = useState<string>("");
  const [progressIndex, setProgressIndex] = useState<number>(0);
  const [progressTotal, setProgressTotal] = useState<number>(0);

  const hasStartedRef = useRef(false);

  // Sync state when modal is opened with new files
  useEffect(() => {
    if (isOpen) {
      setFiles(filePaths);
      hasStartedRef.current = false;
    }
  }, [isOpen, filePaths]);

  // Event listener for backend progress
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listen<{
        status: string;
        current_file: string | null;
        index: number;
        total: number;
      }>("upload-progress", (event) => {
        const payload = event.payload;
        setProgressStatus(payload.status);
        setProgressFile(payload.current_file || "");
        setProgressIndex(payload.index);
        setProgressTotal(payload.total);
      });
    };

    if (isOpen) {
      setupListener();
      // Reset progress states
      setProgressStatus("");
      setProgressFile("");
      setProgressIndex(0);
      setProgressTotal(0);

      // Auto-start processing if it is a single file upload/drop
      if (filePaths.length === 1 && !hasStartedRef.current) {
        hasStartedRef.current = true;
        const timer = setTimeout(() => {
          onProcess(filePaths, true);
        }, 300);
        return () => clearTimeout(timer);
      }
    }

    return () => {
      if (unlisten) unlisten();
    };
  }, [isOpen, filePaths, onProcess]);

  if (!isOpen) return null;

  const getFileName = (pathStr: string) => {
    const parts = pathStr.split(/[/\\]/);
    return parts[parts.length - 1];
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newFiles = [...files];
    const temp = newFiles[index];
    newFiles[index] = newFiles[index - 1];
    newFiles[index - 1] = temp;
    setFiles(newFiles);
  };

  const handleMoveDown = (index: number) => {
    if (index === files.length - 1) return;
    const newFiles = [...files];
    const temp = newFiles[index];
    newFiles[index] = newFiles[index + 1];
    newFiles[index + 1] = temp;
    setFiles(newFiles);
  };

  const handleDelete = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);
  };

  const handleTranscribe = () => {
    if (files.length === 0) return;
    onProcess(files, combine);
  };

  const getProgressMessage = () => {
    if (!progressStatus) {
      return t("footer.processingRecordings");
    }

    switch (progressStatus) {
      case "loading_model":
        return "Loading transcription model...";
      case "reading":
        if (progressFile) {
          return `Reading audio file: ${progressFile} (${progressIndex} of ${progressTotal})...`;
        }
        return "Reading audio file...";
      case "saving":
        if (progressFile) {
          return `Saving ${progressFile} to history...`;
        }
        return "Saving to history...";
      case "transcribing":
        if (progressTotal > 1 && progressFile && !combine) {
          return `Transcribing ${progressFile} (${progressIndex} of ${progressTotal})...`;
        }
        return "Transcribing audio (Whisper inference)...";
      case "post_processing":
        if (progressTotal > 1 && progressFile && !combine) {
          return `Applying post-processing to ${progressFile}...`;
        }
        return "Applying post-processing templates...";
      case "done":
        return "Completed!";
      default:
        return t("footer.processingRecordings");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={() => {
        if (!isProcessing) onClose();
      }}
    >
      <div
        className="bg-bg border border-border rounded-xl shadow-2xl w-full max-w-xl flex flex-col p-6 max-h-[85vh] animate-in zoom-in-95 duration-200 overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start pb-4 border-b border-border">
          <div>
            <h2 className="text-lg font-bold text-text">
              {filePaths.length === 1
                ? "Transcribe Recording"
                : t("footer.multipleUploadTitle")}
            </h2>
            <p className="text-xs text-text/60 mt-1">
              {filePaths.length === 1
                ? "Processing your audio recording."
                : t("footer.multipleUploadDescription")}
            </p>
          </div>
          {!isProcessing && (
            <button
              onClick={onClose}
              className="text-text/40 hover:text-text/70 transition-colors p-1 rounded-md hover:bg-border/30 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Processing Overlay */}
        {isProcessing && (
          <div className="absolute inset-0 bg-background/95 z-40 flex flex-col items-center justify-center gap-4 p-6">
            <Loader2 className="w-12 h-12 animate-spin text-logo-primary" />
            <div className="text-center space-y-2">
              <span className="text-sm font-semibold text-text block">
                {getProgressMessage()}
              </span>
              {progressTotal > 1 && (
                <span className="text-xs text-text/50 block">
                  {t("footer.overallProgress", {
                    current: progressIndex > 0 ? progressIndex : 0,
                    total: progressTotal,
                  })}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-4 space-y-5 pr-1">
          {/* Mode Selector */}
          <div className="grid grid-cols-2 gap-4">
            {/* Combined Option */}
            <div
              onClick={() => !isProcessing && setCombine(true)}
              className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col ${
                combine
                  ? "border-logo-primary bg-logo-primary/5 text-text"
                  : "border-border bg-border/20 text-text/70 hover:border-text/30"
              } ${isProcessing ? "opacity-50 pointer-events-none" : ""}`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={combine}
                  readOnly
                  className="accent-logo-primary"
                />
                <span className="font-semibold text-sm">
                  {t("footer.combineAudio")}
                </span>
              </div>
              <span className="text-xs text-text/50 mt-1.5 leading-relaxed">
                {t("footer.combineAudioDesc")}
              </span>
            </div>

            {/* Individual Option */}
            <div
              onClick={() => !isProcessing && setCombine(false)}
              className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col ${
                !combine
                  ? "border-logo-primary bg-logo-primary/5 text-text"
                  : "border-border bg-border/20 text-text/70 hover:border-text/30"
              } ${isProcessing ? "opacity-50 pointer-events-none" : ""}`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={!combine}
                  readOnly
                  className="accent-logo-primary"
                />
                <span className="font-semibold text-sm">
                  {t("footer.processIndividually")}
                </span>
              </div>
              <span className="text-xs text-text/50 mt-1.5 leading-relaxed">
                {t("footer.processIndividuallyDesc")}
              </span>
            </div>
          </div>

          {/* Alignment & Order List */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-text/50 uppercase tracking-wider">
              {combine ? t("footer.orderLabel") : t("footer.filesToProcess")}
            </h3>

            {files.length === 0 ? (
              <div className="text-center py-6 text-sm text-text/40 bg-border/10 rounded-lg border border-dashed border-border">
                {t("footer.noFilesSelected")}
              </div>
            ) : (
              <div className="space-y-2 max-h-[30vh] overflow-y-auto pr-1">
                {files.map((path, index) => (
                  <div
                    key={path + "-" + index}
                    className="flex items-center justify-between p-3 rounded-lg border border-border bg-background/50 hover:bg-border/10 transition-colors"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      {combine && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-logo-primary/10 text-logo-primary select-none flex-shrink-0">
                          #{index + 1}
                        </span>
                      )}
                      <FileAudio className="w-4 h-4 text-logo-primary flex-shrink-0" />
                      <span
                        className="text-xs font-medium text-text truncate"
                        title={path}
                      >
                        {getFileName(path)}
                      </span>
                    </div>

                    {!isProcessing && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Reorder Buttons */}
                        <button
                          onClick={() => handleMoveUp(index)}
                          disabled={index === 0}
                          className="p-1 rounded text-text/40 hover:text-text/70 disabled:opacity-30 disabled:pointer-events-none hover:bg-border/30 cursor-pointer"
                          title="Move up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleMoveDown(index)}
                          disabled={index === files.length - 1}
                          className="p-1 rounded text-text/40 hover:text-text/70 disabled:opacity-30 disabled:pointer-events-none hover:bg-border/30 cursor-pointer"
                          title="Move down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>

                        <span className="w-[1px] h-3.5 bg-border mx-1"></span>

                        {/* Delete Button */}
                        <button
                          onClick={() => handleDelete(index)}
                          className="p-1 rounded text-red-400 hover:text-red-500 hover:bg-red-500/10 cursor-pointer"
                          title="Remove file"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-border text-text hover:bg-border/30 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleTranscribe}
            disabled={isProcessing || files.length === 0}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-logo-primary text-white hover:bg-logo-primary/80 transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
          >
            {isProcessing && <Loader2 className="w-3 h-3 animate-spin" />}
            <span>{t("footer.transcribeFilesButton")}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default MultipleAudioUploadModal;
