use crate::models::StageImage;
use chrono::Utc;
use serde_json::json;
use thiserror::Error;
use serde::Deserialize;
use base64::Engine;
use reqwest::Client;
use tracing::{info, error};

#[derive(Debug, Error)]
pub enum GeminiError {
    #[error("HTTP error: {0}")] Http(String),
    #[error("Other: {0}")] Other(String),
}

// Helper function to truncate base64 data in JSON for cleaner logging
fn truncate_base64_in_json(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Object(map) => {
            for (key, val) in map.iter_mut() {
                if key == "data" {
                    if let serde_json::Value::String(s) = val {
                        if s.len() > 100 && s.chars().all(|c| c.is_alphanumeric() || c == '+' || c == '/' || c == '=') {
                            *val = serde_json::Value::String(format!("{}...[truncated {} chars]", &s[..50], s.len() - 50));
                        }
                    }
                } else {
                    truncate_base64_in_json(val);
                }
            }
        }
        serde_json::Value::Array(arr) => {
            for val in arr.iter_mut() {
                truncate_base64_in_json(val);
            }
        }
        _ => {}
    }
}

pub struct GeminiClient {
    client: Client,
    api_key: String,
    base_url: String,
}

#[derive(Debug, Clone)]
pub struct GeminiGenerationResult {
    pub image_data: Option<String>,
    pub texts: Vec<String>,
}

impl GeminiClient {
    pub fn new(api_key: String) -> Self { 
        let base_url = std::env::var("GEMINI_API_BASE").unwrap_or_else(|_| "https://generativelanguage.googleapis.com/v1beta".to_string());
        Self { 
            client: Client::new(), 
            api_key, 
            base_url 
        }
    }

    async fn perform_api_call(&self, prompt: &str) -> Result<String, GeminiError> {
        let url = format!(
            "{}/models/gemini-2.5-flash-image-preview:generateContent?key={}",
            self.base_url, self.api_key
        );

        info!("🔗 Making request to: {}", url.replace(&self.api_key, "***"));

        let request_body = json!({
            "contents": [{
                "parts": [{"text": prompt}]
            }],
            "generationConfig": {
                "responseModalities": ["TEXT", "IMAGE"],
                "temperature": 0.4,
                "topP": 0.95,
                "topK": 64,
                "candidateCount": 1
            }
        });

        info!("📤 Request body: {}", serde_json::to_string_pretty(&request_body).unwrap_or_default());

        let response = self.client
            .post(&url)
            .json(&request_body)
            .send()
            .await
            .map_err(|e| GeminiError::Http(e.to_string()))?;

        let status = response.status();
        info!("📥 Response status: {}", status);

        if !status.is_success() {
            let error_body = response.text().await.unwrap_or_default();
            error!("❌ API Error response: {}", error_body);
            return Err(GeminiError::Http(format!("status={} body={}", status, error_body)));
        }

        let response_text = response.text().await
            .map_err(|e| GeminiError::Other(e.to_string()))?;
        
        // Truncate base64 image data for cleaner logging
        let truncated_response = if response_text.len() > 1000 {
            if let Ok(mut json_value) = serde_json::from_str::<serde_json::Value>(&response_text) {
                truncate_base64_in_json(&mut json_value);
                serde_json::to_string_pretty(&json_value).unwrap_or(response_text[..1000].to_string() + "...")
            } else {
                response_text[..1000].to_string() + "..."
            }
        } else {
            response_text.clone()
        };
        
        info!("📥 Raw Gemini API response: {}", truncated_response);
        
        let parsed: GeminiResponse = serde_json::from_str(&response_text)
            .map_err(|e| GeminiError::Other(format!("parse error: {}: {}", e, response_text)))?;

        let image_result = extract_first_image_b64(&parsed);
        if let Some(ref image_data) = image_result {
            let preview = if image_data.len() > 50 {
                format!("{}...[{} chars total]", &image_data[..50], image_data.len())
            } else {
                image_data.clone()
            };
            let image_type = if image_data.starts_with("PHN2Zyg") {
                "SVG"
            } else if image_data.starts_with("iVBORw0KGgo") {
                "PNG"
            } else if image_data.starts_with("/9j/") {
                "JPEG"
            } else {
                "Unknown"
            };
            info!("🖼️ Extracted {} image from API response: {}", image_type, preview);
        } else {
            info!("⚠️ No image data found in API response");
        }

        image_result.ok_or_else(|| GeminiError::Other("no image data in response".into()))
    }

    pub async fn generate_image(&self, prompt: &str) -> Result<String, GeminiError> {
        if self.api_key == "DEMO_KEY" { 
            info!("Using demo mode - no real images generated");
            let placeholder = self.generate_placeholder_image(prompt);
            let preview = if placeholder.len() > 50 {
                format!("{}...[{} chars total]", &placeholder[..50], placeholder.len())
            } else {
                placeholder.clone()
            };
            info!("📦 Generated placeholder image: {}", preview);
            return Ok(placeholder);
        }
        
        info!("Generating image with Gemini API...");
        let result = self.perform_api_call(prompt).await;
        match &result {
            Ok(image_data) => {
                let preview = if image_data.len() > 50 {
                    format!("{}...[{} chars total]", &image_data[..50], image_data.len())
                } else {
                    image_data.clone()
                };
                info!("✅ Successfully generated image: {}", preview);
            }
            Err(e) => {
                error!("❌ Failed to generate image: {}", e);
                info!("🔄 Falling back to placeholder image");
                // Return a placeholder instead of failing
                let placeholder = self.generate_placeholder_image(prompt);
                let preview = if placeholder.len() > 50 {
                    format!("{}...[{} chars total]", &placeholder[..50], placeholder.len())
                } else {
                    placeholder.clone()
                };
                info!("📦 Generated fallback placeholder: {}", preview);
                return Ok(placeholder);
            }
        }
        result
    }

    fn generate_placeholder_image(&self, prompt: &str) -> String {
        // Generate a simple SVG placeholder that represents the stage
        let stage_colors = [
            "#3B82F6", // Blue for Raw Materials
            "#EF4444", // Red for Manufacturing  
            "#10B981", // Green for Distribution
            "#F59E0B", // Yellow for Usage
            "#8B5CF6", // Purple for End-of-Life
        ];
        
        let color = stage_colors[prompt.len() % stage_colors.len()];
        let title = if prompt.contains("Raw Materials") { "🌱 Raw Materials" }
                   else if prompt.contains("Manufacturing") { "🏭 Manufacturing" }
                   else if prompt.contains("Distribution") { "🚚 Distribution" }
                   else if prompt.contains("Usage") { "👤 Usage" }
                   else if prompt.contains("End-of-Life") { "♻️ Recycling" }
                   else { "📦 Lifecycle Stage" };

        let svg = format!(r#"<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:{};stop-opacity:1" />
                    <stop offset="100%" style="stop-color:{};stop-opacity:0.6" />
                </linearGradient>
            </defs>
            <rect width="400" height="300" fill="url(#grad)" />
            <text x="200" y="150" font-family="Arial, sans-serif" font-size="24" font-weight="bold" 
                  text-anchor="middle" fill="white" text-shadow="2px 2px 4px rgba(0,0,0,0.5)">
                {}
            </text>
            <text x="200" y="200" font-family="Arial, sans-serif" font-size="12" 
                  text-anchor="middle" fill="white" opacity="0.8">
                Sustainability Lifecycle Stage
            </text>
        </svg>"#, color, color, title);

        // Convert SVG to base64
        base64::engine::general_purpose::STANDARD.encode(svg.as_bytes())
    }

    pub fn build_stage_prompt(product: &str, stage: &str, constraints: &[String]) -> String {
        let sustainability = if constraints.is_empty() { 
            String::new() 
        } else { 
            format!("Sustainability focus: {}.", constraints.join(", ")) 
        };
        format!("High-quality infographic style depiction of the {stage} stage in the lifecycle of: {product}. {sustainability} Show realistic materials, clean labeling, neutral background, vector style clarity, no text over image.")
    }

    pub async fn generate_stage_description(&self, product: &str, stage: &str, constraints: &[String]) -> String {
        let sustainability = if constraints.is_empty() { 
            String::new() 
        } else { 
            format!(" with focus on {}", constraints.join(", ")) 
        };

        // Request a richer multi‑paragraph narrative (~150–200 words) for better detail in the expanded modal.
        let description_prompt = format!(
            "Write a rich, informative 3-paragraph description (approx 150-200 words total) of the {stage} stage in the lifecycle of {product}{sustainability}. \
            Paragraph 1: Operationally what happens and primary transformations. \
            Paragraph 2: Sustainability challenges, typical mitigation strategies, material/energy efficiency considerations. \
            Paragraph 3: Key environmental impact dimensions (energy use, emissions, waste, water, circularity opportunities) and practical improvement levers. \
            Use clear plain language, no marketing fluff, no bullet points, no headings, no list markers. Keep paragraphs separated by a single blank line."
        );

        info!("🎯 Generating description for stage '{}' (rich mode) with prompt (truncated): {}", stage, &description_prompt[..std::cmp::min(120, description_prompt.len())]);

        match self.generate_text(&description_prompt).await {
            Ok(description) => {
                info!("✅ Stage '{}' description generated ({} chars)", stage, description.len());
                description
            }
            Err(e) => {
                error!("❌ Stage '{}' description generation failed: {}", stage, e);
                // Expanded fallback text (3 short paragraphs) to preserve UX expectations
                let (p1, p2, p3) = match stage {
                    "Raw Materials" => (
                        format!("The raw materials stage for {product} involves identifying, sourcing and qualifying feedstocks with an emphasis on traceability and reduced extraction impact."),
                        "Efforts typically include selecting certified suppliers, minimizing transport distances, and preferring recycled or rapidly renewable inputs where feasible.",
                        "Environmental focus areas: land use, embodied carbon, biodiversity disturbance, and upstream energy intensity. Opportunities include supplier engagement, recycled content, and alternative low-impact materials."
                    ),
                    "Manufacturing" => (
                        format!("During manufacturing, {product} components are processed, assembled and finished using thermal, mechanical or chemical operations."),
                        "Sustainability strategies center on process optimization, lean principles, energy efficiency, renewable power sourcing, scrap reduction and safer chemistry.",
                        "Key impact drivers: electricity and heat demand, yield losses, VOCs, and water consumption. Improvement levers include closed-loop scrap reuse, heat recovery, and eco‑design simplification."
                    ),
                    "Distribution" => (
                        format!("Distribution for {product} spans packaging, consolidation, warehousing and multi‑modal transportation to downstream nodes."),
                        "Optimization targets include right‑sizing packaging, modal shifts to lower‑carbon freight, route efficiency and inventory pooling to reduce idle stock.",
                        "Impact dimensions: fuel consumption, packaging waste, and cold-chain (if applicable). Levers: electrified last‑mile, lightweight materials, and collaborative logistics platforms."
                    ),
                    "Usage" => (
                        format!("The usage phase covers how end users interact with {product}, its functional lifetime, maintenance needs and performance consistency."),
                        "Design-for-durability, intuitive care instructions, energy or resource efficiency in operation, and modular replaceable parts support sustainability goals.",
                        "Impacts relate to in‑use energy, consumables, and premature disposal. Improvement: user education, smart monitoring, and extending service life through refurbishment."
                    ),
                    "End-of-Life / Recycling" => (
                        format!("End‑of‑life for {product} evaluates pathways: reuse, repair, refurbishment, component harvesting, recycling or responsible disposal."),
                        "Strategies include material marking, mono‑material simplification, take‑back programs and partnerships with advanced recyclers.",
                        "Impact focus: landfill avoidance, recovery yields, residual toxicity and circular material loops. Levers: design for disassembly, secondary market enablement, and recycled content reintegration."
                    ),
                    _ => (
                        format!("This stage for {product} encompasses key operational processes with relevant sustainability considerations."),
                        "Typical improvements target efficiency, waste minimization, and transparency across actors.",
                        "Environmental levers include energy optimization, material circularity and emission reductions." 
                    )
                };
                format!("{}\n\n{}\n\n{}", p1, p2, p3)
            }
        }
    }

    pub async fn generate_text(&self, prompt: &str) -> Result<String, GeminiError> {
        if self.api_key == "DEMO_KEY" { 
            info!("Using demo mode - generating fallback text");
            return Ok("Demo description: This stage represents an important part of the product lifecycle with environmental considerations.".to_string());
        }
        
        info!("Generating text with Gemini API...");
        
        let payload = json!({
            "contents": [{
                "parts": [{"text": prompt}]
            }],
            "generationConfig": {
                "temperature": 0.7,
                "topK": 40,
                "topP": 0.95,
                "maxOutputTokens": 450
            }
        });

        let url = format!("{}/v1beta/models/gemini-1.5-flash:generateContent?key={}", self.base_url, self.api_key);
        
        let response = self.client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| GeminiError::Http(e.to_string()))?;

        let status = response.status();
        let response_text = response.text().await.map_err(|e| GeminiError::Http(e.to_string()))?;
        
        if !status.is_success() {
            error!("❌ Gemini API text generation failed with status {}: {}", status, response_text);
            return Err(GeminiError::Http(format!("HTTP {}: {}", status, response_text)));
        }

        let parsed: GeminiResponse = serde_json::from_str(&response_text)
            .map_err(|e| GeminiError::Other(format!("Failed to parse response: {}", e)))?;

        if let Some(candidate) = parsed.candidates.first() {
            for part in &candidate.content.parts {
                if let Part::Text { text } = part {
                    return Ok(text.trim().to_string());
                }
            }
        }
        
        Err(GeminiError::Other("No text content found in response".to_string()))
    }

    pub async fn gen_stage_image(&self, product: &str, stage: &str, constraints: &[String]) -> StageImage {
        let prompt = Self::build_stage_prompt(product, stage, constraints);
        info!("🎯 Generating stage '{}' with prompt: {}", stage, &prompt[..std::cmp::min(100, prompt.len())]);
        
        // Generate image and description concurrently
        let (img_result, description) = tokio::join!(
            self.generate_image(&prompt),
            self.generate_stage_description(product, stage, constraints)
        );
        
        let img = match img_result {
            Ok(image_data) => {
                let preview = if image_data.len() > 50 {
                    format!("{}...[{} chars total]", &image_data[..50], image_data.len())
                } else {
                    image_data.clone()
                };
                info!("✅ Stage '{}' image generated successfully: {}", stage, preview);
                Some(image_data)
            }
            Err(e) => {
                error!("❌ Stage '{}' image generation failed: {}", stage, e);
                None
            }
        };
        
        StageImage { 
            stage_name: stage.to_string(), 
            prompt, 
            description,
            image_base64: img, 
            last_updated: Utc::now() 
        }
    }
}

// --- Response Parsing Helpers ---

#[derive(Debug, Deserialize)]
struct GeminiResponse {
    #[serde(default)]
    candidates: Vec<Candidate>,
}

#[derive(Debug, Deserialize)]
struct Candidate { #[serde(default)] content: Content }

#[derive(Debug, Deserialize, Default)]
struct Content { #[serde(default)] parts: Vec<Part> }

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum Part { 
    Inline { 
        #[serde(rename = "inlineData")]
        inline_data: InlineData 
    },
    Text { text: String },
    Other(serde_json::Value) 
}

#[derive(Debug, Deserialize)]
struct InlineData { 
    data: String,
    #[serde(rename = "mimeType")]
    mime_type: String,
}

fn extract_first_image_b64(resp: &GeminiResponse) -> Option<String> {
    for c in &resp.candidates {
        for p in &c.content.parts {
            if let Part::Inline { inline_data } = p { 
                info!("🎯 Found image data with mime type: {}", inline_data.mime_type);
                return Some(inline_data.data.clone()); 
            }
        }
    }
    info!("⚠️ No inline image data found in response structure");
    None
}
