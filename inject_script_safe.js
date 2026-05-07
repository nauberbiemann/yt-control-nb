const fs = require('fs');

const content = fs.readFileSync('app/page.tsx', 'utf8');

const replacement = `
      <button 
        onClick={async () => {
          try {
            alert('Aguarde. Fazendo o download do seu backup de segurança e injetando no navegador...');
            const res = await fetch('/safe_restore.json');
            const data = await res.json();
            
            // Restore all keys to localStorage
            for (const key of Object.keys(data)) {
              if (key === 'content_os_active_project') continue; // Don't override active project state arbitrarily
              const val = typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]);
              localStorage.setItem(key, val);
            }
            
            // Extract projects
            const projectsArray = JSON.parse(localStorage.getItem('writer_studio_projects') || '[]');
            const mTarget = projectsArray.find((p) => p.id === '5c24efcd-098c-41f1-88b2-b3173fbeb5eb');
            const dTarget = projectsArray.find((p) => p.id === '08124252-c007-48ee-81ba-d075e26a41ab');
            
            if (mTarget && dTarget) {
              alert('Backup carregado. Sincronizando com a nuvem...');
              
              // Force clean state
              mTarget.is_bootstrap_project = false;
              mTarget.is_recovered_project = false;
              dTarget.is_bootstrap_project = false;
              dTarget.is_recovered_project = false;
              
              // Push to Supabase immediately using the user's session!
              const { error } = await supabase.from('projects').upsert([mTarget, dTarget]);
              
              if (error) {
                console.error('Supabase error:', error);
                alert('Erro ao salvar na nuvem: ' + error.message);
              } else {
                alert('Tudo 100% restaurado na NUVEM e no NAVEGADOR! A página vai recarregar e estabilizar para sempre.');
                window.location.reload();
              }
            } else {
              alert('Projetos não encontrados no backup!');
            }
          } catch (e: any) {
            alert('Erro: ' + e.message);
          }
        }}
        style={{
          position: 'fixed', top: '10px', left: '50%', transform: 'translateX(-50%)', zIndex: 99999, 
          padding: '15px 40px', background: '#10b981', color: '#FFFFFF', 
          fontSize: '18px', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer', border: '2px solid white', boxShadow: '0 0 20px rgba(16,185,129,0.8)'
        }}
      >
        ✨ RESTAURAR TUDO DA NUVEM ✨
      </button>
    </main>
`;

const updated = content.replace('</main>', replacement);

fs.writeFileSync('app/page.tsx', updated);
console.log('DONE');
