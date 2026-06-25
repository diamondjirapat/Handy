use crate::actions::process_transcription_output;
use crate::audio_toolkit::read_audio_file;
use crate::managers::history::HistoryManager;
use crate::managers::transcription::TranscriptionManager;
use serde::Serialize;
use specta::Type;
use std::sync::Arc;
use tauri::{AppHandle, State};
use tauri_plugin_clipboard_manager::ClipboardExt;

#[derive(Serialize, Type, Clone)]
pub struct UploadAudioResult {
    pub transcription: String,
}

#[tauri::command]
#[specta::specta]
pub async fn upload_audio_file(
    app: AppHandle,
    file_path: String,
    transcription_manager: State<'_, Arc<TranscriptionManager>>,
    history_manager: State<'_, Arc<HistoryManager>>,
) -> Result<UploadAudioResult, String> {
    // Read audio samples from any supported format
    let samples =
        read_audio_file(&file_path).map_err(|e| format!("Failed to read audio file: {}", e))?;

    if samples.is_empty() {
        return Err("Audio file contains no samples".to_string());
    }

    // Save WAV to recordings dir for history (do this first to avoid cloning samples)
    let file_name = format!("upload-{}.wav", chrono::Utc::now().timestamp_millis());
    let wav_path = history_manager.recordings_dir().join(&file_name);
    if let Err(e) = crate::audio_toolkit::save_wav_file(&wav_path, &samples) {
        log::warn!("Failed to save uploaded audio as WAV: {}", e);
    }

    // Load model in background (same pattern as shortcut transcription)
    transcription_manager.initiate_model_load();

    // Transcribe (blocking, same pattern as retry_history_entry_transcription)
    let transcription = tauri::async_runtime::spawn_blocking({
        let tm = Arc::clone(&transcription_manager);
        move || tm.transcribe(samples)
    })
    .await
    .map_err(|e| format!("Transcription task panicked: {}", e))?
    .map_err(|e| e.to_string())?;

    // Post-process if enabled in settings (always true for uploads)
    let processed = process_transcription_output(&app, &transcription, true).await;

    // Save to history
    history_manager
        .save_entry(
            file_name,
            processed.final_text.clone(),
            true,
            processed.post_processed_text.clone(),
            processed.post_process_prompt.clone(),
        )
        .map_err(|e| format!("Failed to save history entry: {}", e))?;

    // Copy transcription to system clipboard
    if let Err(e) = app.clipboard().write_text(processed.final_text.clone()) {
        log::warn!("Failed to copy to clipboard: {}", e);
    }

    Ok(UploadAudioResult {
        transcription: processed.final_text,
    })
}
