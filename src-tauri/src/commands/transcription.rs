use crate::managers::history::HistoryManager;
use crate::managers::transcription::TranscriptionManager;
use crate::settings::{get_settings, write_settings, ModelUnloadTimeout};
use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, State};

#[derive(Serialize, Type)]
pub struct ModelLoadStatus {
    is_loaded: bool,
    current_model: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub fn set_model_unload_timeout(app: AppHandle, timeout: ModelUnloadTimeout) {
    let mut settings = get_settings(&app);
    settings.model_unload_timeout = timeout;
    write_settings(&app, settings);
}

#[tauri::command]
#[specta::specta]
pub fn get_model_load_status(
    transcription_manager: State<TranscriptionManager>,
) -> Result<ModelLoadStatus, String> {
    Ok(ModelLoadStatus {
        is_loaded: transcription_manager.is_model_loaded(),
        current_model: transcription_manager.get_current_model(),
    })
}

#[tauri::command]
#[specta::specta]
pub fn unload_model_manually(
    transcription_manager: State<TranscriptionManager>,
) -> Result<(), String> {
    transcription_manager
        .unload_model()
        .map_err(|e| format!("Failed to unload model: {}", e))
}

#[tauri::command]
#[specta::specta]
pub async fn summarize_transcription(
    app: AppHandle,
    history_manager: State<'_, std::sync::Arc<HistoryManager>>,
    id: i64,
    force: bool,
    custom_prompt: Option<String>,
) -> Result<String, String> {
    let entry = history_manager
        .get_entry_by_id(id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("History entry {} not found", id))?;

    // When using a custom prompt, always force regeneration
    let has_custom_prompt = custom_prompt
        .as_ref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    // Check if a saved summary already exists
    if !force && !has_custom_prompt {
        if let Some(existing_summary) = entry.summary_text {
            if !existing_summary.trim().is_empty() {
                return Ok(existing_summary);
            }
        }
    }

    let text = entry.transcription_text;
    if text.trim().is_empty() {
        return Err("Cannot summarize empty transcription".to_string());
    }

    let settings = get_settings(&app);

    let base_url = settings
        .summary_base_url
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            "Summary API Base URL is not configured. Please set it up in the Summary settings page."
                .to_string()
        })?;

    let api_key = settings.summary_api_key.clone().unwrap_or_default();
    let model = settings
        .summary_model
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "gpt-4o-mini".to_string());

    let provider = crate::settings::PostProcessProvider {
        id: "custom".to_string(),
        label: settings
            .summary_provider_name
            .clone()
            .unwrap_or_else(|| "Summary API".to_string()),
        base_url: base_url.to_string(),
        allow_base_url_edit: true,
        models_endpoint: None,
        supports_structured_output: false,
    };

    // Use the custom prompt if provided, otherwise fall back to settings
    let prompt_template: String = if has_custom_prompt {
        custom_prompt.unwrap()
    } else {
        settings
            .summary_prompt
            .as_ref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| {
                "Please provide a concise summary of the following text:".to_string()
            })
    };

    // Enforce that the LLM responds in the same language as the input text
    let prompt = format!(
        "{}\n\n[IMPORTANT: You MUST respond in the same language as the input text. For example, if the input text is in Spanish, reply in Spanish; if in Japanese, reply in Japanese, etc.]\n\n{}",
        prompt_template,
        text
    );

    // Disable reasoning / settings for custom/openrouter like in actions.rs
    let (reasoning_effort, reasoning) = match provider.id.as_str() {
        "custom" => (Some("none".to_string()), None),
        "openrouter" => (
            None,
            Some(crate::llm_client::ReasoningConfig {
                effort: Some("none".to_string()),
                exclude: Some(true),
            }),
        ),
        _ => (None, None),
    };

    match crate::llm_client::send_chat_completion(
        &provider,
        api_key,
        &model,
        prompt,
        reasoning_effort,
        reasoning,
    )
    .await
    {
        Ok(Some(summary)) => {
            // Save the summary to the database
            history_manager
                .update_summary(id, summary.clone())
                .map_err(|e| e.to_string())?;
            Ok(summary)
        }
        Ok(None) => Err("Received empty response from the LLM provider".to_string()),
        Err(e) => Err(format!("LLM summarization failed: {}", e)),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn test_summary_connection(app: AppHandle) -> Result<String, String> {
    let settings = get_settings(&app);

    let base_url = settings
        .summary_base_url
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            "Summary API Base URL is not configured. Please set it up in the Summary settings page."
                .to_string()
        })?;

    let api_key = settings.summary_api_key.clone().unwrap_or_default();
    let model = settings
        .summary_model
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "gpt-4o-mini".to_string());

    let provider = crate::settings::PostProcessProvider {
        id: "custom".to_string(),
        label: settings
            .summary_provider_name
            .clone()
            .unwrap_or_else(|| "Summary API".to_string()),
        base_url: base_url.to_string(),
        allow_base_url_edit: true,
        models_endpoint: None,
        supports_structured_output: false,
    };

    let prompt = "Please respond with exactly the word 'OK' and nothing else.".to_string();

    let (reasoning_effort, reasoning) = (Some("none".to_string()), None);

    match crate::llm_client::send_chat_completion(
        &provider,
        api_key,
        &model,
        prompt,
        reasoning_effort,
        reasoning,
    )
    .await
    {
        Ok(Some(response)) => Ok(response),
        Ok(None) => Err("Received empty response".to_string()),
        Err(e) => Err(e.to_string()),
    }
}
