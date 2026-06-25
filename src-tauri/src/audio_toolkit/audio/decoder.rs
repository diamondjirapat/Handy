use anyhow::{anyhow, Result};
use log::debug;
use rubato::{FftFixedIn, Resampler};
use std::fs::File;
use std::path::Path;
use symphonia::core::audio::AudioBufferRef;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::{MediaSourceStream, MediaSourceStreamOptions};
use symphonia::core::meta::MetadataOptions;

const TARGET_SAMPLE_RATE: u32 = 16000;

pub fn read_audio_file<P: AsRef<Path>>(file_path: P) -> Result<Vec<f32>> {
    let file = File::open(file_path.as_ref())?;
    let mss = MediaSourceStream::new(Box::new(file), MediaSourceStreamOptions::default());

    // Register all default formats and decoders
    let mut hint = symphonia::core::probe::Hint::new();
    if let Some(ext) = file_path.as_ref().extension().and_then(|os| os.to_str()) {
        hint.with_extension(ext);
    }

    let probe_result = symphonia::default::get_probe().format(
        &hint,
        mss,
        &FormatOptions::default(),
        &MetadataOptions::default(),
    )?;

    let mut format = probe_result.format;
    let track = format
        .default_track()
        .ok_or_else(|| anyhow!("No default audio track found in the format"))?;

    // Copy track ID and clone codec params to release format borrow
    let track_id = track.id;
    let codec_params = track.codec_params.clone();

    // Prepare sample rate and channel count options (may be None for some formats until decoded)
    let mut src_sr = codec_params.sample_rate;
    let mut src_channels = codec_params.channels.map(|c| c.count() as u32);

    let mut decoder =
        symphonia::default::get_codecs().make(&codec_params, &DecoderOptions::default())?;

    let mut all_samples: Vec<f32> = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(symphonia::core::errors::Error::IoError(e))
                if e.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(symphonia::core::errors::Error::DecodeError(_)) => break,
            Err(symphonia::core::errors::Error::SeekError(_)) => break,
            Err(e) => {
                debug!("Symphonia error: {}", e);
                break;
            }
        };

        if packet.track_id() != track_id {
            continue;
        }

        let decoded = match decoder.decode(&packet) {
            Ok(decoded) => decoded,
            Err(symphonia::core::errors::Error::DecodeError(e)) => {
                debug!("Symphonia decode packet error: {}", e);
                continue;
            }
            Err(e) => return Err(e.into()),
        };

        // Dynamically get sample rate and channels from first decoded packet if missing in codec_params
        if src_sr.is_none() || src_channels.is_none() {
            let spec = decoded.spec();
            if src_sr.is_none() {
                src_sr = Some(spec.rate);
            }
            if src_channels.is_none() {
                src_channels = Some(spec.channels.count() as u32);
            }
        }

        match decoded {
            AudioBufferRef::F32(b) => {
                for ch in b.planes().planes() {
                    all_samples.extend_from_slice(ch);
                }
            }
            AudioBufferRef::S16(b) => {
                for ch in b.planes().planes() {
                    all_samples.extend(ch.iter().map(|&v| v as f32 / i16::MAX as f32));
                }
            }
            AudioBufferRef::U16(b) => {
                for ch in b.planes().planes() {
                    all_samples.extend(ch.iter().map(|&v| (v as f32 - 32768.0) / 32768.0));
                }
            }
            AudioBufferRef::S8(b) => {
                for ch in b.planes().planes() {
                    all_samples.extend(ch.iter().map(|&v| v as f32 / 128.0));
                }
            }
            AudioBufferRef::U8(b) => {
                for ch in b.planes().planes() {
                    all_samples.extend(ch.iter().map(|&v| (v as f32 - 128.0) / 128.0));
                }
            }
            _ => {
                debug!("Unsupported audio buffer reference type");
            }
        }
    }

    let src_sr = src_sr.ok_or_else(|| anyhow!("Sample rate not defined"))?;
    let src_channels = src_channels.ok_or_else(|| anyhow!("Channels not defined"))?;

    // De-interleave channels → mono (each channel's samples are stored contiguously)
    if src_channels > 1 && !all_samples.is_empty() {
        let samples_per_channel = all_samples.len() / src_channels as usize;
        let mut mono: Vec<f32> = Vec::with_capacity(samples_per_channel);
        for i in 0..samples_per_channel {
            let mut sum = 0.0f32;
            for c in 0..src_channels {
                sum += all_samples[i + c as usize * samples_per_channel];
            }
            mono.push(sum / src_channels as f32);
        }
        all_samples = mono;
    }

    // Resample to 16kHz if needed
    if src_sr != TARGET_SAMPLE_RATE {
        all_samples = resample_audio(&all_samples, src_sr as usize, TARGET_SAMPLE_RATE as usize)?;
    }

    Ok(all_samples)
}

fn resample_audio(input: &[f32], in_hz: usize, out_hz: usize) -> Result<Vec<f32>> {
    if in_hz == out_hz {
        return Ok(input.to_vec());
    }
    let chunk_size = 1024;
    let mut resampler = FftFixedIn::<f32>::new(in_hz, out_hz, chunk_size, 1, 1)
        .map_err(|e| anyhow!("Failed to create resampler: {}", e))?;

    let mut output = Vec::new();
    let mut buffer = Vec::with_capacity(chunk_size);

    for chunk in input.chunks(chunk_size) {
        if chunk.len() == chunk_size {
            let processed = resampler
                .process(&[chunk], None)
                .map_err(|e| anyhow!("Resampling failed: {}", e))?;
            output.extend_from_slice(&processed[0]);
        } else {
            buffer.clear();
            buffer.extend_from_slice(chunk);
            buffer.resize(chunk_size, 0.0);
            let processed = resampler
                .process(&[&buffer[..]], None)
                .map_err(|e| anyhow!("Resampling failed: {}", e))?;
            output.extend_from_slice(&processed[0]);
        }
    }

    let expected_len = (input.len() as f64 * out_hz as f64 / in_hz as f64).round() as usize;
    output.truncate(expected_len);

    Ok(output)
}
