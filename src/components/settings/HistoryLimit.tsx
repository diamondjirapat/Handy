import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettings } from "../../hooks/useSettings";
import { Input } from "../ui/Input";
import { Dropdown } from "../ui/Dropdown";
import { SettingContainer } from "../ui/SettingContainer";

interface HistoryLimitProps {
  descriptionMode?: "tooltip" | "inline";
  grouped?: boolean;
}

export const HistoryLimit: React.FC<HistoryLimitProps> = ({
  descriptionMode = "inline",
  grouped = false,
}) => {
  const { t } = useTranslation();
  const { getSetting, updateSetting, isUpdating } = useSettings();

  const recordingRetention =
    getSetting("recording_retention_period") || "never";
  const historyLimit = getSetting("history_limit") ?? 5;

  const [selectedValue, setSelectedValue] = useState<string>("5");
  const [localCustomValue, setLocalCustomValue] = useState<string>(
    String(historyLimit),
  );

  // Sync local states when settings change
  useEffect(() => {
    if (recordingRetention === "never") {
      setSelectedValue("never");
    } else if (recordingRetention === "preserve_limit") {
      if (historyLimit === 5) {
        setSelectedValue("5");
      } else if (historyLimit === 10) {
        setSelectedValue("10");
      } else {
        setSelectedValue("custom");
      }
    } else {
      // If time-based, count limit is not in effect
      setSelectedValue("never");
    }
    setLocalCustomValue(String(historyLimit));
  }, [recordingRetention, historyLimit]);

  const handleSelect = async (value: string) => {
    setSelectedValue(value);
    if (value === "never") {
      await updateSetting("recording_retention_period", "never");
    } else if (value === "5") {
      await updateSetting("recording_retention_period", "preserve_limit");
      await updateSetting("history_limit", 5);
    } else if (value === "10") {
      await updateSetting("recording_retention_period", "preserve_limit");
      await updateSetting("history_limit", 10);
    } else if (value === "custom") {
      await updateSetting("recording_retention_period", "preserve_limit");
      if (historyLimit === 5 || historyLimit === 10) {
        await updateSetting("history_limit", 25);
        setLocalCustomValue("25");
      }
    }
  };

  const handleCustomChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setLocalCustomValue(event.target.value);
  };

  const handleCustomBlur = () => {
    const value = parseInt(localCustomValue, 10);
    if (!isNaN(value) && value >= 1) {
      updateSetting("history_limit", value);
    } else {
      setLocalCustomValue(String(historyLimit));
    }
  };

  const handleCustomKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Enter") {
      handleCustomBlur();
      event.currentTarget.blur();
    }
  };

  const options = [
    { value: "5", label: `5 ${t("settings.debug.historyLimit.entries")}` },
    { value: "10", label: `10 ${t("settings.debug.historyLimit.entries")}` },
    { value: "never", label: t("settings.debug.historyLimit.noLimit") },
    { value: "custom", label: t("settings.debug.historyLimit.custom") },
  ];

  return (
    <SettingContainer
      title={t("settings.debug.historyLimit.title")}
      description={t("settings.debug.historyLimit.description")}
      descriptionMode={descriptionMode}
      grouped={grouped}
      layout="horizontal"
    >
      <div className="flex items-center gap-3">
        <Dropdown
          options={options}
          selectedValue={selectedValue}
          onSelect={handleSelect}
          disabled={
            isUpdating("history_limit") ||
            isUpdating("recording_retention_period")
          }
          className="min-w-[160px]"
        />
        {selectedValue === "custom" && (
          <div className="flex items-center space-x-2 animate-in fade-in slide-in-from-left-2 duration-200">
            <Input
              type="number"
              min="1"
              max="1000"
              value={localCustomValue}
              onChange={handleCustomChange}
              onBlur={handleCustomBlur}
              onKeyDown={handleCustomKeyDown}
              disabled={isUpdating("history_limit")}
              className="w-20"
            />
            <span className="text-sm text-text">
              {t("settings.debug.historyLimit.entries")}
            </span>
          </div>
        )}
      </div>
    </SettingContainer>
  );
};
