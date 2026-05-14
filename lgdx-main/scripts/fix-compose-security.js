const fs = require('fs');

const file = 'e:/LGDX/docker-compose.prod.secure.final.yml';
let content = fs.readFileSync(file, 'utf8');

// The list of services strictly meant for hardening
const targetServices = [
  'lgdx-server',
  'api-sync-service',
  'file-import-service',
  'analytics-service',
  'ftp-service',
  'legacy-ftp-poller',
  'market-price-calculator',
  'backup-service'
];

const lines = content.split('\n');
const newLines = [];

for (let i = 0; i < lines.length; i++) {
  newLines.push(lines[i]);
  
  // Look for our target services definition
  let match = lines[i].match(/^  ([a-zA-Z0-9_-]+):$/);
  if (match && targetServices.includes(match[1])) {
    let serviceName = match[1];
    
    // Check if security_opt is already present in this block
    let hasSecurityOpt = false;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].match(/^  [a-zA-Z0-9_-]+:$/)) break; // next service
      if (lines[j].includes('security_opt:')) {
        hasSecurityOpt = true;
        break;
      }
    }
    
    if (!hasSecurityOpt) {
      // Find the best place to insert it (e.g., right under image: or inside the block)
      // I'll just look for the image: line and insert it right after
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].match(/^  [a-zA-Z0-9_-]+:$/)) break;
        if (lines[j].startsWith('    image:')) {
          // insert it after this line
          const snippet = `    security_opt:
      - "no-new-privileges:true"
    cap_drop:
      - ALL`;
          // We will find this line in the normal flow and push snippet then.
          // Wait, since we are doing a single pass, we will set a flag to insert on next loop execution.
        }
      }
    }
  }
}

// Rewriting logic for a single pass:
let out = [];
let currentService = null;

for (let i = 0; i < lines.length; i++) {
  out.push(lines[i]);
  
  let match = lines[i].match(/^  ([a-zA-Z0-9_-]+):$/);
  if (match) {
    currentService = match[1];
  }
  
  if (currentService && targetServices.includes(currentService)) {
    if (lines[i].startsWith('    image:')) {
      // Look ahead to see if security_opt exists in this block
      let hasSecurity = false;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].match(/^  [a-zA-Z0-9_-]+:$/)) break;
        if (lines[j].includes('security_opt:')) hasSecurity = true;
      }
      
      if (!hasSecurity) {
        out.push('    security_opt:');
        // Quoted scalar: bare `no-new-privileges:true` breaks strict YAML 1.1 parsers (colon in flow).
        out.push('      - "no-new-privileges:true"');
        out.push('    cap_drop:');
        out.push('      - ALL');
      }
    }
  }
}

fs.writeFileSync(file, out.join('\n'));
console.log('Fixed security options globally!');
