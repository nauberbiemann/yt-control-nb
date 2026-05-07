const fs = require('fs');
const data = JSON.parse(fs.readFileSync('metabolismo_project.json', 'utf8'));
const file = fs.readFileSync('app/page.tsx', 'utf8');

const startIdx = file.indexOf('{/* DUMP BUTTON FOR DEBUGGING */}');
if (startIdx === -1) {
  console.log('START NOT FOUND');
  process.exit(1);
}
const endIdx = file.indexOf('</main>', startIdx);

const before = file.substring(0, startIdx);
const after = file.substring(endIdx);

const replacement = `
      {/* RESTORE METABOLISMO DEFINITIVAMENTE */}
      <button 
        onClick={() => {
          const target = ${JSON.stringify(data)};
          target.is_bootstrap_project = false;
          target.is_recovered_project = false;
          target.id = '5c24efcd-098c-41f1-88b2-b3173fbeb5eb';
          
          const current = JSON.parse(localStorage.getItem('writer_studio_projects') || '[]');
          const filtered = current.filter(p => p.id !== target.id);
          filtered.push(target);
          localStorage.setItem('writer_studio_projects', JSON.stringify(filtered));
          alert('Metabolismo 100% Restaurado! A página vai recarregar e ele estará lá com todos os temas intactos.');
          window.location.reload();
        }}
        style={{
          position: 'fixed', top: '10px', left: '50%', transform: 'translateX(-50%)', zIndex: 99999, 
          padding: '15px 40px', background: '#10b981', color: '#FFFFFF', 
          fontSize: '18px', fontWeight: 'bold', borderRadius: '8px', cursor: 'pointer', border: '2px solid white', boxShadow: '0 0 20px rgba(16,185,129,0.8)'
        }}
      >
        ✨ RESTAURAR METABOLISMO DEFINITIVAMENTE ✨
      </button>
    `;

fs.writeFileSync('app/page.tsx', before + replacement + after);
console.log('DONE');
