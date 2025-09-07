use serde::{Serialize, Deserialize};
use chrono::{DateTime, Utc};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GenerateRequest {
    pub product_description: String,
    #[serde(default)]
    pub constraints: Option<Vec<String>>, // e.g., low-carbon, recyclable
    #[serde(default)]
    pub stages: Option<Vec<String>>, // allow custom stage naming
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StageImage {
    pub stage_name: String,
    pub prompt: String,
    pub description: String,
    pub image_base64: Option<String>,
    pub last_updated: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Lifecycle {
    pub id: Uuid,
    pub product_description: String,
    pub stages: Vec<StageImage>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub constraints: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RegenerateRequest {
    pub stage_index: usize,
    pub edit_instruction: String,
    #[serde(default)]
    pub alternative_sustainability_focus: Option<String>,
}
