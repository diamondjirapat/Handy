import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { commands } from "@/bindings";
import { SettingsGroup, SettingContainer, Textarea } from "../../ui";
import { Input } from "../../ui/Input";
import { Button } from "../../ui/Button";
import { useSettings } from "../../../hooks/useSettings";

export const SummarySettings: React.FC = () => {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();

  const [sumName, setSumName] = useState(settings?.summary_provider_name || "");
  const [sumModel, setSumModel] = useState(settings?.summary_model || "");
  const [sumBaseUrl, setSumBaseUrl] = useState(
    settings?.summary_base_url || "",
  );
  const [sumApiKey, setSumApiKey] = useState(settings?.summary_api_key || "");
  const [sumPrompt, setSumPrompt] = useState(settings?.summary_prompt || "");
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    if (settings?.summary_provider_name !== undefined) {
      setSumName(settings.summary_provider_name || "");
    }
    if (settings?.summary_model !== undefined) {
      setSumModel(settings.summary_model || "");
    }
    if (settings?.summary_base_url !== undefined) {
      setSumBaseUrl(settings.summary_base_url || "");
    }
    if (settings?.summary_api_key !== undefined) {
      setSumApiKey(settings.summary_api_key || "");
    }
    if (settings?.summary_prompt !== undefined) {
      setSumPrompt(settings.summary_prompt || "");
    }
  }, [
    settings?.summary_provider_name,
    settings?.summary_model,
    settings?.summary_base_url,
    settings?.summary_api_key,
    settings?.summary_prompt,
  ]);

  const handleSaveSumName = async () => {
    if (settings && sumName !== (settings.summary_provider_name || "")) {
      // @ts-ignore
      await updateSetting("summary_provider_name", sumName);
    }
  };

  const handleSaveSumModel = async () => {
    if (settings && sumModel !== (settings.summary_model || "")) {
      // @ts-ignore
      await updateSetting("summary_model", sumModel);
    }
  };

  const handleSaveSumBaseUrl = async () => {
    if (settings && sumBaseUrl !== (settings.summary_base_url || "")) {
      // @ts-ignore
      await updateSetting("summary_base_url", sumBaseUrl);
    }
  };

  const handleSaveSumApiKey = async () => {
    if (settings && sumApiKey !== (settings.summary_api_key || "")) {
      // @ts-ignore
      await updateSetting("summary_api_key", sumApiKey);
    }
  };

  const handleSaveSumPrompt = async () => {
    if (settings && sumPrompt !== (settings.summary_prompt || "")) {
      // @ts-ignore
      await updateSetting("summary_prompt", sumPrompt);
    }
  };

  const handleTestConnection = async () => {
    if (!sumBaseUrl.trim()) {
      toast.error(t("settings.summaryApi.test.noBaseUrl"));
      return;
    }

    setIsTesting(true);
    const toastId = toast.loading(t("settings.summaryApi.test.loading"));

    try {
      const response = await commands.testSummaryConnection();
      if (response.status === "ok") {
        toast.success(
          t("settings.summaryApi.test.success", { response: response.data }),
          { id: toastId },
        );
      } else {
        toast.error(
          t("settings.summaryApi.test.error", { error: response.error }),
          { id: toastId },
        );
      }
    } catch (err: any) {
      toast.error(
        t("settings.summaryApi.test.error", {
          error: err?.message || String(err),
        }),
        { id: toastId },
      );
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <SettingsGroup title={t("settings.summaryApi.title")}>
        <SettingContainer
          title={t("settings.advanced.summaryApi.name.title")}
          description={t("settings.advanced.summaryApi.name.description")}
          layout="horizontal"
          grouped={true}
        >
          <Input
            value={sumName}
            onChange={(e) => setSumName(e.target.value)}
            onBlur={handleSaveSumName}
            placeholder={t("settings.advanced.summaryApi.name.placeholder")}
            className="min-w-[320px]"
          />
        </SettingContainer>

        <SettingContainer
          title={t("settings.advanced.summaryApi.baseUrl.title")}
          description={t("settings.advanced.summaryApi.baseUrl.description")}
          layout="horizontal"
          grouped={true}
        >
          <Input
            value={sumBaseUrl}
            onChange={(e) => setSumBaseUrl(e.target.value)}
            onBlur={handleSaveSumBaseUrl}
            placeholder={t("settings.advanced.summaryApi.baseUrl.placeholder")}
            className="min-w-[320px]"
          />
        </SettingContainer>

        <SettingContainer
          title={t("settings.advanced.summaryApi.apiKey.title")}
          description={t("settings.advanced.summaryApi.apiKey.description")}
          layout="horizontal"
          grouped={true}
        >
          <Input
            type="password"
            value={sumApiKey}
            onChange={(e) => setSumApiKey(e.target.value)}
            onBlur={handleSaveSumApiKey}
            placeholder={t("settings.advanced.summaryApi.apiKey.placeholder")}
            className="min-w-[320px]"
          />
        </SettingContainer>

        <SettingContainer
          title={t("settings.advanced.summaryApi.model.title")}
          description={t("settings.advanced.summaryApi.model.description")}
          layout="horizontal"
          grouped={true}
        >
          <Input
            value={sumModel}
            onChange={(e) => setSumModel(e.target.value)}
            onBlur={handleSaveSumModel}
            placeholder={t("settings.advanced.summaryApi.model.placeholder")}
            className="min-w-[320px]"
          />
        </SettingContainer>
      </SettingsGroup>

      <SettingsGroup title={t("settings.summaryApi.prompt.group")}>
        <SettingContainer
          title={t("settings.summaryApi.prompt.title")}
          description={t("settings.summaryApi.prompt.description")}
          layout="stacked"
          grouped={true}
        >
          <Textarea
            value={sumPrompt}
            onChange={(e) => setSumPrompt(e.target.value)}
            onBlur={handleSaveSumPrompt}
            placeholder={t("settings.summaryApi.prompt.placeholder")}
            className="w-full text-sm h-32 mt-2"
          />
        </SettingContainer>
      </SettingsGroup>

      <div className="flex justify-end pr-4">
        <Button
          onClick={handleTestConnection}
          disabled={isTesting}
          variant="secondary"
        >
          {isTesting
            ? t("settings.summaryApi.test.buttonTesting")
            : t("settings.summaryApi.test.button")}
        </Button>
      </div>
    </div>
  );
};
