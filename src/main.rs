mod routes;
mod models;
mod gemini;
mod pdf;

use axum::{Router, routing::{post, get}};
use routes::{generate_lifecycle, get_lifecycle, regenerate_stage, export_pdf, create_lifecycle_skeleton, generate_stage_image, AppState};
use std::net::SocketAddr;
use tracing_subscriber::{fmt, EnvFilter};
use std::sync::Arc;
use tower_http::cors::{CorsLayer, Any};

use crate::gemini::GeminiClient;

#[tokio::main]
async fn main() {
    // Load environment variables from .env file
    dotenv::dotenv().ok();
    
    // Init tracing
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    fmt().with_env_filter(filter).init();

    let api_key = std::env::var("GEMINI_API_KEY").unwrap_or_else(|_| "DEMO_KEY".into());
    tracing::info!("Using API key: {}...", &api_key[..std::cmp::min(10, api_key.len())]);
    let state = AppState { 
        store: Arc::default(),
        gemini: Arc::new(GeminiClient::new(api_key)),
    };

    let app = Router::new()
        .route("/api/lifecycle", post(generate_lifecycle))
        .route("/api/lifecycle/create", post(create_lifecycle_skeleton))
        .route("/api/lifecycle/:id", get(get_lifecycle))
        .route("/api/lifecycle/:id/stage/:stage_index", post(generate_stage_image))
        .route("/api/lifecycle/:id/stage", post(regenerate_stage))
        .route("/api/lifecycle/:id/pdf", get(export_pdf))
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any)
        )
        .with_state(state);

    let port: u16 = std::env::var("PORT").ok().and_then(|v| v.parse().ok()).unwrap_or(8080);
    let addr = SocketAddr::from(([0,0,0,0], port));
    tracing::info!(%addr, "Starting server");
    axum::serve(tokio::net::TcpListener::bind(addr).await.unwrap(), app).await.unwrap();
}
