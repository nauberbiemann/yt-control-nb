const fs = require('fs');
const f = 'components/ProjectWizardModal.tsx';
let c = fs.readFileSync(f, 'utf8');

// normalize line endings
const normalized = c.replace(/\r\n/g, '\n');

const anchor = `onChange={(e) => updateFormData({ editing_sop: { ...formData.editing_sop, text_styles: e.target.value } })}
                  />
                </div>`;

const visualIdentityBlock = `onChange={(e) => updateFormData({ editing_sop: { ...formData.editing_sop, text_styles: e.target.value } })}
                  />
                </div>

                <div className="flex flex-col gap-2 mt-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-amber-400">Identidade Visual do Canal (Geracao de Prompts)</label>
                  <span className="text-[8px] uppercase font-bold text-white/40 -mt-1 mb-1">Descreva o estilo visual, ambientes, tom e tipos de shot preferidos. A IA usa isso para gerar prompts de video e imagem alinhados ao canal.</span>
                  <textarea
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[11px] outline-none focus:border-amber-400/40 transition-all placeholder:text-white/20 min-h-[96px] resize-none"
                    placeholder="Ex: Home office escuro, iluminacao cinematografica seria. Para conceitos tecnicos, prefira animacoes 3D abstratas. Para momentos pessoais, use o personagem recorrente."
                    value={formData.editing_sop.visual_identity || ''}
                    onChange={(e) => updateFormData({ editing_sop: { ...formData.editing_sop, visual_identity: e.target.value } })}
                  />
                </div>`;

if (normalized.includes(anchor)) {
  const result = normalized.replace(anchor, visualIdentityBlock);
  fs.writeFileSync(f, result, 'utf8');
  console.log('SUCCESS - visual_identity field inserted');
} else {
  const idx = normalized.indexOf('text_styles: e.target.value');
  console.log('ANCHOR NOT FOUND. Sample:', JSON.stringify(normalized.substring(idx, idx + 150)));
}
