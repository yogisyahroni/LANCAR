const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.ts')) {
      results.push(file);
    }
  });
  return results;
}

const targetDir = 'e:/antigraviti google/SUDAH DEPLOY/LANCAR/backend/admin-service/src/controllers';
const files = walk(targetDir);

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  if (content.includes('console.error(')) {
    // Check if securityLog is imported
    if (!content.includes('securityLog')) {
      content = content.replace(/import \{ Request, Response \} from 'express';/, 
        "import { Request, Response } from 'express';\nimport { securityLog } from '../security/logRedaction';");
    }
    
    // Check if import is present but maybe not added by previous step if express import was missing
    if (!content.includes('securityLog')) {
        content = "import { securityLog } from '../security/logRedaction';\n" + content;
    }

    content = content.replace(/console\.error\(/g, 'securityLog.error(');
    
    fs.writeFileSync(file, content);
    console.log('Replaced console.error in ' + file);
  }
}
