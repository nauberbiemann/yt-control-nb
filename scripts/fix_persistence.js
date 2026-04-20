const fs = require('fs');

// ── FIX 1: page.tsx — add visual_identity and text_styles to normalizeEditingSop ──
const pageFile = 'app/page.tsx';
let page = fs.readFileSync(pageFile, 'utf8').replace(/\r\n/g, '\n');

const oldNormalize = `          asset_types: Array.isArray(source.asset_types) ? source.asset_types : [],
          measurement_focus: source.measurement_focus || '',
        };
      };`;

const newNormalize = `          asset_types: Array.isArray(source.asset_types) ? source.asset_types : [],
          measurement_focus: source.measurement_focus || '',
          text_styles: source.text_styles || '',
          visual_identity: source.visual_identity || '',
        };
      };`;

if (page.includes(oldNormalize)) {
  page = page.replace(oldNormalize, newNormalize);
  fs.writeFileSync(pageFile, page, 'utf8');
  console.log('page.tsx OK - visual_identity added to normalizeEditingSop');
} else {
  console.log('page.tsx NOT FOUND - trying alternate...');
  const i = page.indexOf('measurement_focus: source.measurement_focus');
  console.log('Context:', JSON.stringify(page.substring(i - 10, i + 100)));
}

// ── FIX 2: ProjectWizardModal.tsx — remove duplicate field (lines 672-681) ──
const wizardFile = 'components/ProjectWizardModal.tsx';
let wizard = fs.readFileSync(wizardFile, 'utf8').replace(/\r\n/g, '\n');

// The duplicate block — the one outside the container that was added by the failed PowerShell patch
const duplicate = `\n                <div className="flex flex-col gap-2 mt-2">\n                  <label className="text-[9px] font-black uppercase tracking-widest text-amber-400">Identidade Visual do Canal (Geração de Prompts)</label>\n                  <span className="text-[8px] uppercase font-bold text-white/40 -mt-1 mb-1">Descreva o estilo visual, ambientes, tom e tipos de shot preferidos. A IA usa isso para gerar prompts de vídeo e imagem alinhados ao canal.</span>\n                  <textarea\n                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[11px] outline-none focus:border-amber-400/40 transition-all placeholder:text-white/20 min-h-[96px] resize-none"\n                    placeholder="Ex: Home office escuro, iluminação cinematográfica séria. Para conceitos técnicos, prefira animações 3D abstratas. Para momentos pessoais, use o personagem recorrente. Evite ambientes genéricos de escritório."\n                    value={formData.editing_sop.visual_identity || ''}\n                    onChange={(e) => updateFormData({ editing_sop: { ...formData.editing_sop, visual_identity: e.target.value } })}\n                  />\n                </div>`;

if (wizard.includes(duplicate)) {
  wizard = wizard.replace(duplicate, '');
  fs.writeFileSync(wizardFile, wizard, 'utf8');
  console.log('wizard OK - duplicate removed');
} else {
  const i = wizard.indexOf('Evite ambientes genéricos de escritório');
  if (i > -1) {
    console.log('Duplicate found at:', i, JSON.stringify(wizard.substring(i - 200, i + 100)));
  } else {
    console.log('wizard: checking with simplified match...');
    const count = (wizard.match(/visual_identity/g) || []).length;
    console.log('visual_identity occurrences:', count);
    // Show the second block context
    const firstIdx = wizard.indexOf('visual_identity');
    const secondIdx = wizard.indexOf('visual_identity', firstIdx + 1);
    console.log('Second occurrence context:', JSON.stringify(wizard.substring(secondIdx - 200, secondIdx + 100)));
  }
}
