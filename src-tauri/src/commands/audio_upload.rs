use crate::actions::process_transcription_output;
use crate::audio_toolkit::read_audio_file;
use crate::managers::history::HistoryManager;
use crate::managers::transcription::TranscriptionManager;
use serde::Serialize;
use specta::Type;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_clipboard_manager::ClipboardExt;

#[derive(Serialize, Type, Clone)]
pub struct UploadAudioResult {
    pub transcription: String,
}

#[derive(Serialize, Clone)]
struct UploadProgressPayload {
    status: String,
    current_file: Option<String>,
    index: usize,
    total: usize,
}

fn get_filename(path_str: &str) -> String {
    std::path::Path::new(path_str)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(path_str)
        .to_string()
}

struct UnloadSuspender {
    tm: Arc<TranscriptionManager>,
}

impl UnloadSuspender {
    fn new(tm: Arc<TranscriptionManager>) -> Self {
        tm.suspend_unload();
        Self { tm }
    }
}

impl Drop for UnloadSuspender {
    fn drop(&mut self) {
        self.tm.resume_unload();
        self.tm.maybe_unload_immediately("multiple upload complete");
    }
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

#[derive(Serialize, Type, Clone)]
pub struct UploadMultipleAudioResult {
    pub transcriptions: Vec<String>,
}

#[tauri::command]
#[specta::specta]
pub async fn upload_multiple_audio_files(
    app: AppHandle,
    file_paths: Vec<String>,
    combine: bool,
    transcription_manager: State<'_, Arc<TranscriptionManager>>,
    history_manager: State<'_, Arc<HistoryManager>>,
) -> Result<UploadMultipleAudioResult, String> {
    if file_paths.is_empty() {
        return Err("No files provided".to_string());
    }

    // Suspend unloading during this process
    let _suspender = UnloadSuspender::new(Arc::clone(&transcription_manager));
    let total_files = file_paths.len();

    // Load model in background
    let _ = app.emit(
        "upload-progress",
        UploadProgressPayload {
            status: "loading_model".to_string(),
            current_file: None,
            index: 0,
            total: total_files,
        },
    );
    transcription_manager.initiate_model_load();

    if combine {
        // Read and concatenate all samples
        let mut all_samples = Vec::new();
        for (i, path) in file_paths.iter().enumerate() {
            let _ = app.emit(
                "upload-progress",
                UploadProgressPayload {
                    status: "reading".to_string(),
                    current_file: Some(get_filename(path)),
                    index: i + 1,
                    total: total_files,
                },
            );
            let samples = read_audio_file(path)
                .map_err(|e| format!("Failed to read audio file '{}': {}", path, e))?;
            all_samples.extend(samples);
        }

        if all_samples.is_empty() {
            return Err("Combined audio files contain no samples".to_string());
        }

        // Save combined WAV file to recordings dir
        let _ = app.emit(
            "upload-progress",
            UploadProgressPayload {
                status: "saving".to_string(),
                current_file: None,
                index: 0,
                total: total_files,
            },
        );
        let file_name = format!(
            "upload-combined-{}.wav",
            chrono::Utc::now().timestamp_millis()
        );
        let wav_path = history_manager.recordings_dir().join(&file_name);
        if let Err(e) = crate::audio_toolkit::save_wav_file(&wav_path, &all_samples) {
            log::warn!("Failed to save combined audio as WAV: {}", e);
        }

        // Transcribe (blocking)
        let _ = app.emit(
            "upload-progress",
            UploadProgressPayload {
                status: "transcribing".to_string(),
                current_file: None,
                index: 0,
                total: total_files,
            },
        );
        let transcription = tauri::async_runtime::spawn_blocking({
            let tm = Arc::clone(&transcription_manager);
            move || tm.transcribe(all_samples)
        })
        .await
        .map_err(|e| format!("Transcription task panicked: {}", e))?
        .map_err(|e| e.to_string())?;

        // Post-process if enabled
        let _ = app.emit(
            "upload-progress",
            UploadProgressPayload {
                status: "post_processing".to_string(),
                current_file: None,
                index: 0,
                total: total_files,
            },
        );
        let processed = process_transcription_output(&app, &transcription, true).await;

        // Save to history
        let _ = app.emit(
            "upload-progress",
            UploadProgressPayload {
                status: "saving".to_string(),
                current_file: None,
                index: 0,
                total: total_files,
            },
        );
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

        let _ = app.emit(
            "upload-progress",
            UploadProgressPayload {
                status: "done".to_string(),
                current_file: None,
                index: 0,
                total: total_files,
            },
        );

        Ok(UploadMultipleAudioResult {
            transcriptions: vec![processed.final_text],
        })
    } else {
        let mut transcriptions = Vec::new();
        for (i, path) in file_paths.iter().enumerate() {
            let _ = app.emit(
                "upload-progress",
                UploadProgressPayload {
                    status: "reading".to_string(),
                    current_file: Some(get_filename(path)),
                    index: i + 1,
                    total: total_files,
                },
            );
            let samples = read_audio_file(path)
                .map_err(|e| format!("Failed to read audio file '{}': {}", path, e))?;
            if samples.is_empty() {
                continue;
            }

            let _ = app.emit(
                "upload-progress",
                UploadProgressPayload {
                    status: "saving".to_string(),
                    current_file: Some(get_filename(path)),
                    index: i + 1,
                    total: total_files,
                },
            );
            let file_name = format!("upload-{}.wav", chrono::Utc::now().timestamp_millis());
            let wav_path = history_manager.recordings_dir().join(&file_name);
            if let Err(e) = crate::audio_toolkit::save_wav_file(&wav_path, &samples) {
                log::warn!("Failed to save uploaded audio as WAV: {}", e);
            }

            let _ = app.emit(
                "upload-progress",
                UploadProgressPayload {
                    status: "transcribing".to_string(),
                    current_file: Some(get_filename(path)),
                    index: i + 1,
                    total: total_files,
                },
            );
            let transcription = tauri::async_runtime::spawn_blocking({
                let tm = Arc::clone(&transcription_manager);
                let s = samples.clone();
                move || tm.transcribe(s)
            })
            .await
            .map_err(|e| format!("Transcription task panicked: {}", e))?
            .map_err(|e| e.to_string())?;

            let _ = app.emit(
                "upload-progress",
                UploadProgressPayload {
                    status: "post_processing".to_string(),
                    current_file: Some(get_filename(path)),
                    index: i + 1,
                    total: total_files,
                },
            );
            let processed = process_transcription_output(&app, &transcription, true).await;

            let _ = app.emit(
                "upload-progress",
                UploadProgressPayload {
                    status: "saving".to_string(),
                    current_file: Some(get_filename(path)),
                    index: i + 1,
                    total: total_files,
                },
            );
            history_manager
                .save_entry(
                    file_name,
                    processed.final_text.clone(),
                    true,
                    processed.post_processed_text.clone(),
                    processed.post_process_prompt.clone(),
                )
                .map_err(|e| format!("Failed to save history entry: {}", e))?;

            transcriptions.push(processed.final_text);
        }

        // Copy all transcriptions to clipboard (joined by two newlines)
        if !transcriptions.is_empty() {
            let combined_text = transcriptions.join("\n\n");
            if let Err(e) = app.clipboard().write_text(combined_text) {
                log::warn!("Failed to copy to clipboard: {}", e);
            }
        }

        let _ = app.emit(
            "upload-progress",
            UploadProgressPayload {
                status: "done".to_string(),
                current_file: None,
                index: 0,
                total: total_files,
            },
        );

        Ok(UploadMultipleAudioResult { transcriptions })
    }
}
