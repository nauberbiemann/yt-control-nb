const fs = require('fs');
const metab = JSON.parse(fs.readFileSync('metabolismo_project.json', 'utf8'));
const devzen = JSON.parse(fs.readFileSync('devzen_project.json', 'utf8'));
const file = fs.readFileSync('app/page.tsx', 'utf8');

const startIdx = file.indexOf('{/* RESTORE METABOLISMO DEFINITIVAMENTE */}');
if (startIdx === -1) {
  console.log('START NOT FOUND');
  process.exit(1);
}
const endIdx = file.indexOf('</main>', startIdx);

const before = file.substring(0, startIdx);
const after = file.substring(endIdx);

const replacement = `
      {/* RESTORE ALL PROJECTS */}
      <button 
        onClick={() => {
          const mTarget = ${JSON.stringify(metab)};
          mTarget.is_bootstrap_project = false;
          mTarget.is_recovered_project = false;
          mTarget.id = '5c24efcd-098c-41f1-88b2-b3173fbeb5eb';

          const dTarget = ${JSON.stringify(devzen)};
          dTarget.is_bootstrap_project = false;
          dTarget.is_recovered_project = false;
          dTarget.id = '08124252-c007-48ee-81ba-d075e26a41ab';
          
          const current = JSON.parse(localStorage.getItem('writer_studio_projects') || '[]');
          let filtered = current.filter((p) => p.id !== mTarget.id && p.id !== dTarget.id && p.id !== 'demo-devzen-project');
          
          filtered.push(mTarget);
          filtered.push(dTarget);
          
          localStorage.setItem('writer_studio_projects', JSON.stringify(filtered));
          alert('Metabolismo e DevZen 100% Restaurados! A página vai recarregar.');
          window.location.reload();
        }}
        style={{
          position: 'fixed', top: '10px', left: '50%', transform: 'translateX(-50%)', zIndex: 99999, 
          padding: '15px 40px', background: '#10b981', color: '#FFFFFF', 
          fontSize: '18px', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer', border: '2px solid white', boxShadow: '0 0 20px rgba(16,185,129,0.8)'
        }}
      >
        ✨ RESTAURAR METABOLISMO + DEVZEN ✨
      </button>
    `;

fs.writeFileSync('app/page.tsx', before + replacement + after);
console.log('DONE');
