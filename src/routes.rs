use axum::{Json, extract::{Path, State}, http::StatusCode, response::{IntoResponse, Response}};
use std::{collections::HashMap, sync::Arc};
use parking_lot::RwLock;
use uuid::Uuid;
use chrono::Utc;

use crate::{models::{GenerateRequest, Lifecycle, RegenerateRequest, StageImage}, gemini::GeminiClient, pdf::generate_pdf};

#[derive(Clone)]
pub struct AppState {
    pub store: Arc<RwLock<HashMap<Uuid, Lifecycle>>>,
    pub gemini: Arc<GeminiClient>,
}

pub fn default_stages() -> Vec<&'static str> {
    vec!["Raw Materials","Manufacturing","Distribution","Usage","End-of-Life / Recycling"]
}

pub async fn generate_lifecycle(State(state): State<AppState>, Json(body): Json<GenerateRequest>) -> Json<Lifecycle> {
    let id = Uuid::new_v4();
    let constraints = body.constraints.clone().unwrap_or_default();
    let stages_list: Vec<String> = body.stages.clone().map(|v| v).unwrap_or_else(|| default_stages().into_iter().map(|s| s.to_string()).collect());

    tracing::info!("🚀 Generating lifecycle for product: {}", body.product_description);
    
    let mut stages = Vec::new();
    for s in &stages_list {
        let img = state.gemini.gen_stage_image(&body.product_description, s, &constraints).await;
        stages.push(img);
    }

    // Log summary of generated lifecycle with truncated image data
    let stages_summary: Vec<_> = stages.iter().map(|stage| {
        let image_preview = match &stage.image_base64 {
            Some(img) if img.len() > 50 => format!("{}...[{} chars]", &img[..50], img.len()),
            Some(img) => img.clone(),
            None => "None".to_string(),
        };
        format!("{}: {}", stage.stage_name, image_preview)
    }).collect();
    
    tracing::info!("✅ Lifecycle generated with {} stages: {}", stages.len(), stages_summary.join(", "));

    let lifecycle = Lifecycle { id, product_description: body.product_description, stages, created_at: Utc::now(), updated_at: Utc::now(), constraints };
    
    state.store.write().insert(id, lifecycle.clone());
    Json(lifecycle)
}

pub async fn get_lifecycle(Path(id): Path<Uuid>, State(state): State<AppState>) -> Response {
    if let Some(l) = state.store.read().get(&id).cloned() { Json(l).into_response() } else { StatusCode::NOT_FOUND.into_response() }
}

#[axum::debug_handler]
pub async fn regenerate_stage(
    Path(id): Path<Uuid>, 
    State(state): State<AppState>, 
    Json(body): Json<RegenerateRequest>
) -> Result<Json<Lifecycle>, StatusCode> {
    // First, get the current prompt
    let current_prompt = {
        let guard = state.store.read();
        let lifecycle = guard.get(&id).ok_or(StatusCode::NOT_FOUND)?;
        if body.stage_index >= lifecycle.stages.len() { 
            return Err(StatusCode::NOT_FOUND); 
        }
        lifecycle.stages[body.stage_index].prompt.clone()
    };
    
    // Generate new image outside the lock
    let new_prompt = format!("{} Modify to: {}", current_prompt, body.edit_instruction);
    let new_img = state.gemini.generate_image(&new_prompt).await.ok();
    
    // Update the lifecycle with the new data
    let mut guard = state.store.write();
    if let Some(lifecycle) = guard.get_mut(&id) {
        let stage = &mut lifecycle.stages[body.stage_index];
        stage.prompt = new_prompt;
        stage.image_base64 = new_img;
        stage.last_updated = Utc::now();
        lifecycle.updated_at = Utc::now();
        return Ok(Json(lifecycle.clone()));
    }
    Err(StatusCode::NOT_FOUND)
}

// Create a new lifecycle with empty stages (no image generation yet)
pub async fn create_lifecycle_skeleton(State(state): State<AppState>, Json(body): Json<GenerateRequest>) -> Json<Lifecycle> {
    let id = Uuid::new_v4();
    let constraints = body.constraints.clone().unwrap_or_default();
    let stages_list: Vec<String> = body.stages.clone().map(|v| v).unwrap_or_else(|| default_stages().into_iter().map(|s| s.to_string()).collect());

    tracing::info!("🎯 Creating lifecycle skeleton for product: {}", body.product_description);
    
    let mut stages = Vec::new();
    for s in &stages_list {
        let stage = StageImage {
            stage_name: s.clone(),
            prompt: format!("High-quality infographic style depiction of the {} stage in the lifecycle of: {}. Show realistic materials, clean labeling, neutral background, vector style clarity, no text over image.", s, body.product_description),
            description: "Generating description...".to_string(), // Placeholder until generated
            image_base64: None, // No image generated yet
            last_updated: Utc::now(),
        };
        stages.push(stage);
    }

    let lifecycle = Lifecycle { 
        id, 
        product_description: body.product_description, 
        stages, 
        created_at: Utc::now(), 
        updated_at: Utc::now(), 
        constraints 
    };
    
    state.store.write().insert(id, lifecycle.clone());
    tracing::info!("✅ Created lifecycle skeleton with {} stages", lifecycle.stages.len());
    Json(lifecycle)
}

// Generate image for a specific stage
pub async fn generate_stage_image(
    Path((id, stage_index)): Path<(Uuid, usize)>, 
    State(state): State<AppState>
) -> Result<Json<StageImage>, StatusCode> {
    // Get the stage info
    let (stage_name, product_description, constraints) = {
        let guard = state.store.read();
        let lifecycle = guard.get(&id).ok_or(StatusCode::NOT_FOUND)?;
        if stage_index >= lifecycle.stages.len() { 
            return Err(StatusCode::BAD_REQUEST); 
        }
        let stage = &lifecycle.stages[stage_index];
        (stage.stage_name.clone(), lifecycle.product_description.clone(), lifecycle.constraints.clone())
    };
    
    tracing::info!("🎯 Generating image for stage: {} (index: {})", stage_name, stage_index);
    
    // Generate the image
    let generated_stage = state.gemini.gen_stage_image(&product_description, &stage_name, &constraints).await;
    
    // Update the lifecycle with the new image
    {
        let mut guard = state.store.write();
        if let Some(lifecycle) = guard.get_mut(&id) {
            if stage_index < lifecycle.stages.len() {
                lifecycle.stages[stage_index] = generated_stage.clone();
                lifecycle.updated_at = Utc::now();
            }
        }
    }
    
    tracing::info!("✅ Generated image for stage: {}", stage_name);
    Ok(Json(generated_stage))
}

pub async fn export_pdf(Path(id): Path<Uuid>, State(state): State<AppState>) -> Response {
    let store = state.store.read();
    if let Some(lifecycle) = store.get(&id) {
        let pdf_bytes = generate_pdf(lifecycle);
        let mut headers = axum::http::HeaderMap::new();
        headers.insert(axum::http::header::CONTENT_TYPE, "application/pdf".parse().unwrap());
        headers.insert(axum::http::header::CONTENT_DISPOSITION, format!("attachment; filename=\"lifecycle_{}.pdf\"", id).parse().unwrap());
        return (StatusCode::OK, headers, pdf_bytes).into_response();
    }
    StatusCode::NOT_FOUND.into_response()
}
