import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShowOverlay } from "../ShowOverlay";
import { ModelUnloadTimeoutSetting } from "../ModelUnloadTimeout";
import { CustomWords } from "../CustomWords";
import { SettingsGroup, SettingContainer, Textarea } from "../../ui";
import { Input } from "../../ui/Input";
import { StartHidden } from "../StartHidden";
import { AutostartToggle } from "../AutostartToggle";
import { ShowTrayIcon } from "../ShowTrayIcon";
import { PasteMethodSetting } from "../PasteMethod";
import { TypingToolSetting } from "../TypingTool";
import { ClipboardHandlingSetting } from "../ClipboardHandling";
import { AutoSubmit } from "../AutoSubmit";
import { PostProcessingToggle } from "../PostProcessingToggle";
import { AppendTrailingSpace } from "../AppendTrailingSpace";
import { ExperimentalToggle } from "../ExperimentalToggle";
import { useSettings } from "../../../hooks/useSettings";
import { KeyboardImplementationSelector } from "../debug/KeyboardImplementationSelector";
import { AccelerationSelector } from "../AccelerationSelector";
import { LazyStreamClose } from "../LazyStreamClose";

export const AdvancedSettings: React.FC = () => {
  const { t } = useTranslation();
  const { settings, updateSetting, getSetting } = useSettings();
  const experimentalEnabled = getSetting("experimental_enabled") || false;

  const [envVars, setEnvVars] = useState(settings?.custom_env_vars || "");

  useEffect(() => {
    if (settings?.custom_env_vars !== undefined) {
      setEnvVars(settings.custom_env_vars || "");
    }
  }, [settings?.custom_env_vars]);

  const handleSaveEnvVars = async () => {
    if (settings && envVars !== (settings.custom_env_vars || "")) {
      // @ts-ignore
      await updateSetting("custom_env_vars", envVars || null);
    }
  };

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup title={t("settings.advanced.groups.app")}>
        <StartHidden descriptionMode="tooltip" grouped={true} />
        <AutostartToggle descriptionMode="tooltip" grouped={true} />
        <ShowTrayIcon descriptionMode="tooltip" grouped={true} />
        <ShowOverlay descriptionMode="tooltip" grouped={true} />
        <ModelUnloadTimeoutSetting descriptionMode="tooltip" grouped={true} />
        <ExperimentalToggle descriptionMode="tooltip" grouped={true} />
      </SettingsGroup>

      <SettingsGroup title={t("settings.advanced.groups.output")}>
        <PasteMethodSetting descriptionMode="tooltip" grouped={true} />
        <TypingToolSetting descriptionMode="tooltip" grouped={true} />
        <ClipboardHandlingSetting descriptionMode="tooltip" grouped={true} />
        <AutoSubmit descriptionMode="tooltip" grouped={true} />
      </SettingsGroup>

      <SettingsGroup title={t("settings.advanced.groups.transcription")}>
        <CustomWords descriptionMode="tooltip" grouped />
        <AppendTrailingSpace descriptionMode="tooltip" grouped={true} />
      </SettingsGroup>

      <SettingsGroup title={t("settings.advanced.groups.env.title")}>
        <SettingContainer
          title={t("settings.advanced.env.title")}
          description={t("settings.advanced.env.description")}
          layout="stacked"
          grouped={true}
        >
          <Textarea
            value={envVars}
            onChange={(e) => setEnvVars(e.target.value)}
            onBlur={handleSaveEnvVars}
            placeholder={t("settings.advanced.env.placeholder")}
            className="w-full font-mono text-sm h-32 mt-2"
          />
        </SettingContainer>
      </SettingsGroup>

      {experimentalEnabled && (
        <SettingsGroup title={t("settings.advanced.groups.experimental")}>
          <PostProcessingToggle descriptionMode="tooltip" grouped={true} />
          <KeyboardImplementationSelector
            descriptionMode="tooltip"
            grouped={true}
          />
          <AccelerationSelector descriptionMode="tooltip" grouped={true} />
          <LazyStreamClose descriptionMode="tooltip" grouped={true} />
        </SettingsGroup>
      )}
    </div>
  );
};
