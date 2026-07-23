const fs = require('fs');
const path = require('path');

const backupPath = path.join(__dirname, '../meu_diagnostico_metabolismo.json');
try {
  const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  const execKey = 'ws_script_execution_5c24efcd-098c-41f1-88b2-b3173fbeb5eb';
  let execVal = data[execKey];
  if (typeof execVal === 'string') {
    execVal = JSON.parse(execVal);
  }
  
  if (execVal) {
    console.log(`Execution key ${execKey} found:`);
    console.log(`- approvedTheme: "${execVal.approvedTheme}"`);
    console.log(`- has externalSrtPipeline: ${!!execVal.externalSrtPipeline}`);
    if (execVal.externalSrtPipeline) {
      console.log(`  - externalSrtPipeline keys:`, Object.keys(execVal.externalSrtPipeline));
      console.log(`  - rows length:`, execVal.externalSrtPipeline.rows?.length);
    }
  } else {
    console.log(`Execution key ${execKey} not found in backup.`);
  }
  
  // Let's also check for other projects just in case
  const keys = Object.keys(data).filter(k => k.startsWith('ws_script_execution_'));
  keys.forEach(k => {
    let val = data[k];
    if (typeof val === 'string') {
      try { val = JSON.parse(val); } catch (e) {}
    }
    console.log(`Key: ${k}`);
    console.log(`  - approvedTheme: "${val?.approvedTheme}"`);
    console.log(`  - has externalSrtPipeline: ${!!val?.externalSrtPipeline}`);
  });
} catch (e) {
  console.error(e);
}
