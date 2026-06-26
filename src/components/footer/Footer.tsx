import React, { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { Upload, Mic, Square, X, Check, Loader2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";

import ModelSelector from "../model-selector";
import UpdateChecker from "../update-checker";

interface FooterProps {
  onFilesSelected?: (files: string[]) => void;
}

const Footer: React.FC<FooterProps> = ({ onFilesSelected }) => {
  const { t } = useTranslation();
  const [version, setVersion] = useState("");
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const appVersion = await getVersion();
        setVersion(appVersion);
      } catch (error) {
        console.error("Failed to get app version:", error);
        setVersion("0.1.2");
      }
    };

    fetchVersion();
  }, []);

  // Fetch initial recording state and listen to start/stop events
  useEffect(() => {
    let unlistenShow: (() => void) | undefined;
    let unlistenHide: (() => void) | undefined;

    // Get initial state
    commands.isRecording().then((recording) => {
      setIsRecording(recording);
    });

    // Listen to global Tauri events
    listen("show-overlay", () => {
      setIsRecording(true);
    }).then((unlistenFn) => {
      unlistenShow = unlistenFn;
    });

    listen("hide-overlay", () => {
      setIsRecording(false);
    }).then((unlistenFn) => {
      unlistenHide = unlistenFn;
    });

    return () => {
      if (unlistenShow) unlistenShow();
      if (unlistenHide) unlistenHide();
    };
  }, []);

  const handleUploadAudio = async () => {
    try {
      const selected = await open({
        title: t("footer.uploadAudioDialogTitle"),
        multiple: true,
        filters: [
          {
            name: "Audio Files",
            extensions: ["wav", "mp3", "m4a", "aac", "flac", "ogg"],
          },
        ],
      });

      if (!selected) return;

      const filePaths = Array.isArray(selected) ? selected : [selected];
      if (filePaths.length === 0) return;

      if (onFilesSelected) {
        onFilesSelected(filePaths);
      }
    } catch (error) {
      toast.error(t("footer.uploadAudioError"), {
        description: String(error),
      });
    }
  };

  const handleRecordTrigger = async () => {
    try {
      await commands.triggerRecording();
    } catch (error) {
      console.error("Failed to trigger recording:", error);
      toast.error("Failed to control recorder");
    }
  };

  const handleCancelTrigger = async () => {
    try {
      await commands.cancelOperation();
      setIsRecording(false);
    } catch (error) {
      console.error("Failed to cancel recording:", error);
    }
  };

  return (
    <div className="w-full border-t border-mid-gray/20 pt-3">
      <div className="flex justify-between items-center text-xs px-4 pb-3 text-text/60">
        {/* Left Side: Model Selector */}
        <div className="flex items-center gap-4">
          <ModelSelector />
        </div>

        {/* Center: Built-in Recorder Control Panel */}
        <div className="flex items-center gap-3 bg-mid-gray/5 border border-mid-gray/10 rounded-full px-4 py-1.5 shadow-sm">
          {isRecording ? (
            <>
              {/* Flashing Recording Indicator */}
              <div className="flex items-center gap-1.5 mr-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                <span className="text-[11px] font-medium text-red-500 animate-pulse">
                  {t("footer.recording")}
                </span>
              </div>

              {/* Stop & Transcribe Button */}
              <button
                onClick={handleRecordTrigger}
                className="flex items-center gap-1 text-[11px] font-semibold text-emerald-500 hover:text-emerald-400 transition-colors cursor-pointer px-2 py-0.5 rounded-md hover:bg-emerald-500/10"
                title={t("footer.transcribe")}
              >
                <Check className="w-3.5 h-3.5" />
                <span>{t("footer.transcribe")}</span>
              </button>

              {/* Cancel Button */}
              <button
                onClick={handleCancelTrigger}
                className="flex items-center gap-1 text-[11px] font-semibold text-red-400 hover:text-red-300 transition-colors cursor-pointer px-2 py-0.5 rounded-md hover:bg-red-500/10"
                title={t("footer.cancel")}
              >
                <X className="w-3.5 h-3.5" />
                <span>{t("footer.cancel")}</span>
              </button>
            </>
          ) : (
            <>
              {/* Start Recording Button */}
              <button
                onClick={handleRecordTrigger}
                className="flex items-center gap-1.5 text-xs text-text/70 hover:text-logo-primary transition-colors cursor-pointer"
                title={t("footer.record")}
              >
                <Mic className="w-3.5 h-3.5 text-red-500" />
                <span>{t("footer.record")}</span>
              </button>

              <span className="text-mid-gray/30">|</span>

              {/* Manual File Transcription Button */}
              <button
                onClick={handleUploadAudio}
                className="flex items-center gap-1.5 text-xs text-text/70 hover:text-text/90 transition-colors cursor-pointer"
                title={t("footer.uploadAudioTitle")}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{t("footer.transcribeFile")}</span>
              </button>
            </>
          )}
        </div>

        {/* Right Side: Update Checker & Version */}
        <div className="flex items-center gap-1">
          <UpdateChecker />
          <span>•</span>
          {/* eslint-disable-next-line i18next/no-literal-string */}
          <span>v{version}</span>
        </div>
      </div>
    </div>
  );
};

export default Footer;
