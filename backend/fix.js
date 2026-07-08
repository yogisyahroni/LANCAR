const fs = require('fs');
const files = [
  'admin-service/src/controllers/finance.controller.ts',
  'admin-service/src/controllers/costIntelligence.controller.ts',
  'admin-service/src/controllers/vouchers.controller.ts',
  'admin-service/src/controllers/notifications.controller.ts',
  'admin-service/src/controllers/flags.controller.ts',
  'admin-service/src/controllers/orders.controller.ts',
  'admin-service/src/controllers/couriers.controller.ts',
  'admin-service/src/controllers/system.controller.ts',
  'admin-service/src/controllers/logistics.controller.ts',
  'admin-service/src/controllers/promos.controller.ts'
];
for (const file of files) {
  const fullPath = 'e:/antigraviti google/SUDAH DEPLOY/LANCAR/backend/' + file;
  if (!fs.existsSync(fullPath)) continue;
  let content = fs.readFileSync(fullPath, 'utf8');
  let original = content;

  // Add import if not exists
  if (!content.includes('getActorId')) {
    content = content.replace(/import \{ Request, Response \} from 'express';/, 
      "import { Request, Response } from 'express';\nimport { getActorId } from '../utils/authUtils';");
  }

  // Replace fallback UUIDs in assignments
  content = content.replace(/const changedBy = req\.user\?\.id \|\| '[^']+';/g, 'const changedBy = getActorId(req);');
  content = content.replace(/const userId = req\.user\?\.id \|\| '[^']+';/g, 'const userId = getActorId(req);');
  content = content.replace(/const adminId = req\.user\?\.id \|\| '[^']+';/g, 'const adminId = getActorId(req);');
  content = content.replace(/req\.user\?\.id \|\| null/g, 'getActorId(req)');
  content = content.replace(/req\.user\?\.id \|\| 'admin-preview'/g, 'getActorId(req)');
  content = content.replace(/const adminActorId = \(req: Request\) => req\.user\?\.id \|\| '[^']+';/g, 'const adminActorId = (req: Request) => getActorId(req);');

  if (content !== original) {
    fs.writeFileSync(fullPath, content);
    console.log('Updated ' + file);
  }
}
