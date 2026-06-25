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
pub async fn summarize_transcription(app: AppHandle, text: String) -> Result<String, String> {
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

    let prompt_template = settings
        .summary_prompt
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or("Please provide a concise summary of the following text:");

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
        Ok(Some(summary)) => Ok(summary),
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
