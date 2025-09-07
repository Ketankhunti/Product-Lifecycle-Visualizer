use crate::models::Lifecycle;
use printpdf::*;
use std::io::BufWriter;

/// Minimal PDF (text-only) to avoid image embedding complexity for MVP.
pub fn generate_pdf(lifecycle: &Lifecycle) -> Vec<u8> {
    let (doc, _page, layer) = PdfDocument::new(
        format!("Lifecycle: {}", truncate(&lifecycle.product_description, 48)),
        Mm(210.0),
        Mm(297.0),
        "Layer 1",
    );
    let font = doc.add_builtin_font(BuiltinFont::Helvetica).unwrap();
    let summary = doc.get_page(_page).get_layer(layer);
    summary.use_text("Product Lifecycle Storyboard", 20.0, Mm(15.0), Mm(275.0), &font);
    summary.use_text(truncate(&lifecycle.product_description, 140), 11.0, Mm(15.0), Mm(260.0), &font);
    if !lifecycle.constraints.is_empty() {
        summary.use_text(format!("Constraints: {}", lifecycle.constraints.join(", ")), 10.0, Mm(15.0), Mm(248.0), &font);
    }
    summary.use_text("(Images not embedded in PDF preview MVP)", 8.0, Mm(15.0), Mm(236.0), &font);

    for stage in &lifecycle.stages {
        let (page, layer) = doc.add_page(Mm(210.0), Mm(297.0), &stage.stage_name);
        let layer_ref = doc.get_page(page).get_layer(layer);
        layer_ref.use_text(&stage.stage_name, 16.0, Mm(15.0), Mm(275.0), &font);
        layer_ref.use_text(truncate(&stage.prompt, 180), 9.0, Mm(15.0), Mm(260.0), &font);
    }

    let mut buf: Vec<u8> = Vec::new();
    {
        let mut writer = BufWriter::new(&mut buf);
        doc.save(&mut writer).ok();
    }
    buf
}

fn truncate(s: &str, max: usize) -> String { if s.len() <= max { s.to_string() } else { format!("{}…", &s[..max]) } }
