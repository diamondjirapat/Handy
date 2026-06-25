import React, { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Upload } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { commands } from "@/bindings";

import ModelSelector from "../model-selector";
import UpdateChecker from "../update-checker";

const Footer: React.FC = () => {
  const { t } = useTranslation();
  const [version, setVersion] = useState("");
  const [uploading, setUploading] = useState(false);

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

  const handleUploadAudio = async () => {
    try {
      const selected = await open({
        title: t("footer.uploadAudioDialogTitle"),
        filters: [
          {
            name: "Audio Files",
            extensions: ["wav", "mp3", "m4a", "aac", "flac", "ogg"],
          },
        ],
      });

      if (!selected) return;

      const filePath = Array.isArray(selected) ? selected[0] : selected;
      if (!filePath) return;

      setUploading(true);
      const result = await commands.uploadAudioFile(filePath);
      if (result.status === "ok") {
        toast.success(t("footer.uploadAudioSuccess"), {
          description: result.data.transcription.slice(0, 200),
        });
      } else {
        toast.error(t("footer.uploadAudioError"), {
          description: result.error,
        });
      }
    } catch (error) {
      toast.error(t("footer.uploadAudioError"), {
        description: String(error),
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="w-full border-t border-mid-gray/20 pt-3">
      <div className="flex justify-between items-center text-xs px-4 pb-3 text-text/60">
        <div className="flex items-center gap-4">
          <ModelSelector />
          {uploading ? (
            <span className="text-xs text-text/60">{t("footer.uploading")}</span>
          ) : (
            <button
              onClick={handleUploadAudio}
              className="flex items-center gap-1.5 text-xs text-text/60 hover:text-text/90 transition-colors cursor-pointer"
              title={t("footer.uploadAudioTitle")}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{t("footer.uploadAudio")}</span>
            </button>
          )}
        </div>

        {/* Update Status */}
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
