# Plan de Réalisation - Intégration ACP de claude-scionos avec Zed

## Objectifs

- Intégrer **claude-scionos** comme agent externe dans **Zed** via le protocole **ACP** (Agent Client Protocol)
- Communiquer via **stdio** (pas HTTP) comme Zed l'attend
- Conserver l'interface terminal existante de claude-scionos

---

## Architecture

```
Zed (client ACP)
       ↓ stdio (JSON-RPC 2.0)
claude-scionos --acp (mode ACP natif)
       ↓
claude-scionos → claude (Claude Code CLI)
```

### Pourquoi cette approche ?

- **Zed** attend un exécutable qui communique en **ACP via stdio**
- **claude-scionos** doit être lancé en mode `--acp` pour parler le protocole
- Le protocole ACP = JSON-RPC 2.0 sur stdin/stdout
- **IMPORTANT** : Appeler directement `claude` et non `claude-scionos` pour éviter les boucles infinies

---

## Prérequis

- **Zed** installé (version récente avec support ACP, v0.221.x+)
- **Node.js 22+** : `nvm use node` (v24.13.0 recommandé)
- **claude-scionos** installé localement (`npm install -g claude-scionos` ou lien symbolique)
- **Claude Code CLI** (`claude`) accessible dans le PATH

---

## Plan de Réalisation

### Tâche 1 : Ajouter le mode ACP à claude-scionos

**Objectif** : Ajouter le support du protocole ACP dans claude-scionos pour qu'il puisse communiquer avec Zed via stdio.

**Étapes** :
1. Créer le module `src/acp-server.js` qui implémente le protocole ACP
2. Gérer les messages JSON-RPC sur stdin/stdout avec buffer
3. Implémenter les méthodes ACP nécessaires :
   - `initialize` : Initialisation de la session
   - `tools/list` : Liste des outils disponibles
   - `tools/call` : Exécution d'un outil
   - `prompts/list` : Liste des prompts (optionnel)
   - `message/send` : Envoyer un message (principal)

**Code complet** (`src/acp-server.js`) :
```javascript
#!/usr/bin/env node

import { spawn } from 'child_process';
import { readFileSync, writeFileSync, writeSync } from 'fs';

let sessionId = null;
let buffer = '';

// Lire depuis stdin avec buffer
process.stdin.setEncoding('utf8');
process.stdin.on('data', (data) => {
  buffer += data;
  processBuffer();
});

function processBuffer() {
  const lines = buffer.split('\n');
  buffer = lines.pop() || ''; // Garder la ligne incomplète
  
  for (const line of lines) {
    if (line.trim()) {
      try {
        const request = JSON.parse(line);
        handleRequest(request);
      } catch (e) {
        console.error('Erreur de parsing JSON:', e.message);
      }
    }
  }
}

function sendResponse(id, result) {
  const response = JSON.stringify({
    jsonrpc: '2.0',
    id,
    result
  }) + '\n';
  
  writeSync(process.stdout.fd, response);
}

function sendError(id, code, message) {
  const response = JSON.stringify({
    jsonrpc: '2.0',
    id,
    error: { code, message, data: null }
  }) + '\n';
  
  writeSync(process.stdout.fd, response);
}

function handleRequest(request) {
  const { id, method, params } = request;
  
  switch (method) {
    case 'initialize':
      handleInitialize(id, params);
      break;
      
    case 'tools/list':
      handleToolsList(id);
      break;
      
    case 'tools/call':
      handleToolsCall(id, params);
      break;
      
    case 'prompts/list':
      handlePromptsList(id);
      break;
      
    case 'message/send':
      handleMessageSend(id, params);
      break;
      
    default:
      sendError(id, -32601, `Méthode non supportée: ${method}`);
  }
}

function handleInitialize(id, params) {
  sessionId = params.sessionId || generateSessionId();
  
  sendResponse(id, {
    protocolVersion: '1.0',
    capabilities: {
      tools: true,
      prompts: false,  // Activer si implémenté
      resources: false, // Activer si implémenté
      streaming: false  // Activer pour streaming
    },
    serverInfo: {
      name: 'claude-scionos',
      version: '4.1.1',
      description: 'Claude Code wrapper with ScioNos strategies'
    }
  });
}

function handleToolsList(id) {
  sendResponse(id, {
    tools: [
      {
        name: 'execute_command',
        description: 'Exécute une commande shell dans le répertoire de travail',
        inputSchema: {
          type: 'object',
          properties: {
            command: { 
              type: 'string',
              description: 'La commande à exécuter'
            }
          },
          required: ['command']
        }
      },
      {
        name: 'read_file',
        description: 'Lit le contenu d\'un fichier',
        inputSchema: {
          type: 'object',
          properties: {
            path: { 
              type: 'string',
              description: 'Chemin du fichier à lire'
            }
          },
          required: ['path']
        }
      },
      {
        name: 'write_file',
        description: 'Écrit du contenu dans un fichier',
        inputSchema: {
          type: 'object',
          properties: {
            path: { 
              type: 'string',
              description: 'Chemin du fichier à écrire'
            },
            content: {
              type: 'string',
              description: 'Contenu à écrire'
            }
          },
          required: ['path', 'content']
        }
      }
    ]
  });
}

async function handleToolsCall(id, params) {
  const { name, arguments: args } = params;
  
  try {
    let result;
    
    switch (name) {
      case 'execute_command':
        result = await executeCommand(args.command);
        break;
        
      case 'read_file':
        result = await readFile(args.path);
        break;
        
      case 'write_file':
        result = await writeFile(args.path, args.content);
        break;
        
      default:
        throw new Error(`Tool inconnu: ${name}`);
    }
    
    sendResponse(id, {
      content: [
        {
          type: 'text',
          text: result
        }
      ]
    });
  } catch (error) {
    sendError(id, -32000, `Erreur lors de l'exécution du tool: ${error.message}`);
  }
}

function handlePromptsList(id) {
  sendResponse(id, {
    prompts: []
  });
}

async function handleMessageSend(id, params) {
  const { messages } = params;
  const lastMessage = messages[messages.length - 1];
  
  try {
    // IMPORTANT: Appeler directement 'claude' et non 'claude-scionos'
    // pour éviter une boucle infinie
    const result = await spawnAsync('claude', ['--print', lastMessage.content]);
    
    sendResponse(id, {
      content: [
        {
          type: 'text',
          text: result
        }
      ],
      stopReason: 'end_turn'
    });
  } catch (error) {
    sendError(id, -32000, `Erreur: ${error.message}`);
  }
}

// Fonctions utilitaires

function generateSessionId() {
  return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function spawnAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
      ...options
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `Exit code: ${code}`));
    });
    
    child.on('error', (error) => {
      reject(error);
    });
  });
}

async function executeCommand(command) {
  return spawnAsync(command, [], { shell: true });
}

async function readFile(path) {
  return readFileSync(path, 'utf8');
}

async function writeFile(path, content) {
  writeFileSync(path, content, 'utf8');
  return `Fichier ${path} écrit avec succès`;
}

// Démarrer le serveur
export function startAcpServer() {
  console.error('Claude-Scionos ACP server started on stdio');
  
  // Garder le processus en vie
  process.stdin.resume();
}

// Si exécuté directement
if (import.meta.url === `file://${process.argv[1]}`) {
  startAcpServer();
}
```

**Test** :
```bash
# Vérifier que le module est syntaxiquement correct
node --check src/acp-server.js

# Tester manuellement en mode echo
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | node src/acp-server.js
```

---

### Tâche 2 : Intégration CLI

**Objectif** : Ajouter la commande `--acp` au CLI de claude-scionos.

**Étapes** :
1. Modifier `parseWrapperArgs()` dans `index.js` pour ajouter `acpMode: false` dans le parsing
2. Ajouter la détection de `--acp` dans la boucle de parsing
3. Modifier `main()` pour lancer le serveur ACP si `--acp` est présent

**Code à modifier dans `index.js`** :

```javascript
// Dans la fonction parseWrapperArgs (ligne ~166)
function parseWrapperArgs(argv) {
    const parsed = {
        authAction: 'status',
        claudeArgs: [],
        command: null,
        debug: false,
        help: false,
        listStrategies: false,
        noPrompt: false,
        service: normalizeServiceValue(process.env.SCIONOS_SERVICE),
        strategy: null,
        version: false,
        acpMode: false  // ← AJOUTER CECI
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];

        // ← AJOUTER CECI EN PREMIER (avant les autres vérifications)
        if (arg === '--acp') {
            parsed.acpMode = true;
            continue;
        }

        // ... reste du code existant ...
    }

    return parsed;
}
```

```javascript
// Dans la fonction main (ligne ~573)
async function main() {
    const parsed = parseWrapperArgs(process.argv.slice(2));
    
    // ← AJOUTER CECI AU DÉBUT (après le parsing)
    if (parsed.acpMode) {
        const { startAcpServer } = await import('./src/acp-server.js');
        return startAcpServer();
    }
    
    // ... reste du code existant ...
}
```

**Commandes** :
```bash
# Mode ACP
claude-scionos --acp

# ou via npx
npx claude-scionos --acp
```

**Test** :
```bash
# Vérifier que la commande est reconnue
npx claude-scionos --help | grep -i acp

# Ou tester directement
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | npx claude-scionos --acp
```

---

### Tâche 3 : Configuration de Zed

**Objectif** : Configurer Zed pour utiliser claude-scionos comme agent externe.

**Étapes** :
1. Éditer le fichier de settings Zed (`~/.config/zed/settings.json`)
2. Ajouter claude-scionos comme agent personnalisé
3. Spécifier la commande et les arguments

**Configuration Zed** (option 1 - avec npx) :
```json
{
  "agent_servers": {
    "claude-scionos": {
      "type": "custom",
      "command": "npx",
      "args": ["claude-scionos", "--acp"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**Configuration Zed** (option 2 - avec chemin absolu, recommandé) :
```json
{
  "agent_servers": {
    "claude-scionos": {
      "type": "custom",
      "command": "node",
      "args": ["/chemin/vers/claude-scionos/index.js", "--acp"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**Configuration Zed** (option 3 - si installé globalement) :
```json
{
  "agent_servers": {
    "claude-scionos": {
      "type": "custom",
      "command": "claude-scionos",
      "args": ["--acp"],
      "env": {}
    }
  }
}
```

**Test** :
```bash
# Vérifier la configuration
zed --version

# Vérifier que l'agent apparaît dans Zed
# Ouvrir Zed → Agent Panel (Cmd+?) → Cliquer sur + → Voir "claude-scionos"
```

---

### Tâche 4 : Tests d'Intégration

**Objectif** : Vérifier que la communication ACP fonctionne entre Zed et claude-scionos.

**Test manuel - initialize** :
```bash
# Test de la communication ACP (simuler Zed)
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | npx claude-scionos --acp

# Résultat attendu:
# {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"1.0","capabilities":{"tools":true,"prompts":false,"resources":false,"streaming":false},"serverInfo":{"name":"claude-scionos","version":"4.1.1","description":"Claude Code wrapper with ScioNos strategies"}}}
```

**Test manuel - tools/list** :
```bash
# Tester tools/list
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | npx claude-scionos --acp

# Résultat attendu: liste des outils au format JSON
```

**Test manuel - message/send** :
```bash
# Tester message/send
echo '{"jsonrpc":"2.0","id":3,"method":"message/send","params":{"messages":[{"role":"user","content":"Dis bonjour"}]}}' | npx claude-scionos --acp

# Résultat attendu: réponse de Claude
```

**Test manuel - tools/call** :
```bash
# Tester tools/call (read_file)
echo '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"read_file","arguments":{"path":"/etc/hosts"}}}' | npx claude-scionos --acp

# Résultat attendu: contenu du fichier /etc/hosts
```

**Test depuis Zed** :
1. Ouvrir Zed
2. Ouvrir le panel agent (`Cmd+?` ou `Ctrl+?`)
3. Cliquer sur `+` et sélectionner "claude-scionos"
4. Envoyer un message test : "Bonjour, peux-tu me dire quelle est ta version ?"
5. Vérifier les logs ACP : `Cmd Palette → "dev: open acp logs"`

---

### Tâche 5 : Gestion Avancée (Optionnel)

**Objectif** : Améliorer l'intégration avec des fonctionnalités avancées.

**Améliorations possibles** :

#### 1. Support du streaming
```javascript
// Dans handleInitialize
capabilities: {
  streaming: true  // Activer le streaming
}

// Dans handleMessageSend
async function handleMessageSend(id, params) {
  const { messages } = params;
  const lastMessage = messages[messages.length - 1];
  
  // Streamer la réponse
  const child = spawn('claude', ['--print', lastMessage.content], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  let fullResponse = '';
  
  child.stdout.on('data', (data) => {
    const chunk = data.toString();
    fullResponse += chunk;
    
    // Envoyer un événement de streaming
    sendNotification('message/stream', {
      id: id,
      chunk: chunk
    });
  });
  
  child.on('close', (code) => {
    if (code === 0) {
      sendResponse(id, {
        content: [{ type: 'text', text: fullResponse }],
        stopReason: 'end_turn'
      });
    }
  });
}

function sendNotification(method, params) {
  const notification = JSON.stringify({
    jsonrpc: '2.0',
    method,
    params
  }) + '\n';
  
  writeSync(process.stdout.fd, notification);
}
```

#### 2. Support des ressources
```javascript
case 'resources/list':
  sendResponse(id, {
    resources: [
      {
        uri: 'file://./',
        name: 'Workspace',
        description: 'Espace de travail actuel'
      }
    ]
  });
  break;

case 'resources/read':
  const { uri } = params;
  if (uri.startsWith('file://')) {
    const content = readFileSync(uri.slice(7), 'utf8');
    sendResponse(id, { contents: [{ uri, text: content }] });
  }
  break;
```

#### 3. Support des prompts
```javascript
case 'prompts/list':
  sendResponse(id, {
    prompts: [
      {
        name: 'review_code',
        description: 'Review le code sélectionné',
        arguments: [
          {
            name: 'code',
            description: 'Code à reviewer',
            required: true
          }
        ]
      }
    ]
  });
  break;

case 'prompts/get':
  const { name, arguments: args } = params;
  if (name === 'review_code') {
    sendResponse(id, {
      description: 'Review de code',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Peux-tu reviewer ce code et suggérer des améliorations?\n\n${args.code}`
          }
        }
      ]
    });
  }
  break;
```

#### 4. Gestion des sessions persistantes
```javascript
const sessions = new Map();

function handleInitialize(id, params) {
  sessionId = params.sessionId || generateSessionId();
  
  // Charger la session existante si disponible
  if (sessions.has(sessionId)) {
    console.error(`Session ${sessionId} reprise`);
  } else {
    sessions.set(sessionId, {
      createdAt: Date.now(),
      messages: []
    });
    console.error(`Nouvelle session ${sessionId} créée`);
  }
  
  // ... reste du code
}
```

---

## Résumé des Commandes

| Action | Commande |
|--------|----------|
| Démarrer en mode ACP | `npx claude-scionos --acp` |
| Test initialize | `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \| npx claude-scionos --acp` |
| Test tools/list | `echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \| npx claude-scionos --acp` |
| Test message/send | `echo '{"jsonrpc":"2.0","id":3,"method":"message/send","params":{"messages":[{"role":"user","content":"Test"}]}}' \| npx claude-scionos --acp` |
| Voir les logs ACP dans Zed | `Cmd Palette → "dev: open acp logs"` |
| Arrêter | `Ctrl+C` |

---

## Configuration Zed Complète

```json
{
  "agent_servers": {
    "claude-scionos": {
      "type": "custom",
      "command": "npx",
      "args": ["claude-scionos", "--acp"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  },
  "features": {
    "agent_panel": {
      "enabled": true,
      "default_width": 400
    }
  }
}
```

---

## Points d'Attention

- **Protocole ACP** : Communication via stdin/stdout en JSON-RPC 2.0
- **Buffer stdin** : Important de bufferiser les lignes pour gérer les messages partiels
- **Sessions** : Chaque session a un ID unique
- **Outils** : Implémenter les tools pour permettre à Zed d'exécuter des actions
- **Éviter la boucle infinie** : Toujours appeler `claude` directement, jamais `claude-scionos` dans le mode ACP
- **Streaming** : Optionnel, à ajouter ultérieurement si nécessaire
- **Logs** : Les erreurs sont envoyées sur stderr (pas de console.log sur stdout !)
- **Format JSON** : Chaque message DOIT se terminer par `\n`
- **Capabilities** : Déclarer uniquement ce qui est réellement implémenté

---

## Dépannage

### Zed ne trouve pas l'agent
```bash
# Vérifier que claude-scionos est accessible
which claude-scionos
npx claude-scionos --help

# Tester manuellement
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | npx claude-scionos --acp

# Vérifier la configuration Zed
cat ~/.config/zed/settings.json | grep -A 10 "agent_servers"
```

### Erreur de communication
```bash
# Activer les logs de debug
npx claude-scionos --acp 2>&1 | tee /tmp/acp-debug.log

# Vérifier les logs ACP dans Zed
# Cmd Palette → "dev: open acp logs"

# Tester avec un message simple
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | npx claude-scionos --acp 2>&1
```

### L'agent ne répond pas
- Vérifier que le JSON est bien formaté
- Vérifier que chaque ligne se termine par `\n`
- Vérifier les erreurs dans stderr
- Vérifier que `claude` (Claude Code CLI) est accessible dans le PATH
- Vérifier qu'il n'y a pas de boucle infinie (claude-scionos appelant claude-scionos)

### Boucle infinie détectée
```bash
# Vérifier que le code appelle bien 'claude' et non 'claude-scionos'
grep -n "claude-scionos" src/acp-server.js

# Si vous voyez 'claude-scionos' dans handleMessageSend, c'est une erreur !
# Remplacez par 'claude' uniquement
```

### Erreur "Tool inconnu"
```bash
# Vérifier que le tool est bien déclaré dans tools/list
# Le nom dans tools/call doit correspondre exactement au nom dans tools/list
```

### Port déjà utilisé
```bash
# Si vous utilisez un port HTTP (mauvaise approche), vérifiez les processus
lsof -i :3000
kill -9 <PID>

# Mais normalement avec stdio, pas de problème de port
```

---

## Checklist de Validation

- [ ] Module `src/acp-server.js` créé et fonctionnel
- [ ] Intégration CLI dans `index.js` (ajout de `acpMode`)
- [ ] Test `initialize` réussi
- [ ] Test `tools/list` réussi
- [ ] Test `message/send` réussi avec appel à `claude`
- [ ] Test `tools/call` réussi
- [ ] Configuration Zed ajoutée
- [ ] Agent visible dans Zed (panel agent)
- [ ] Message test envoyé depuis Zed avec succès
- [ ] Logs ACP consultés et propres
- [ ] Pas de boucle infinie (vérifié que `claude` est appelé, pas `claude-scionos`)
- [ ] Documentation mise à jour

---

## Ressources

- [Documentation Zed - External Agents](https://zed.dev/docs/ai/external-agents)
- [ACP Protocol Specification](https://github.com/zed-industries/agent-client-protocol)
- [Claude Code CLI Documentation](https://docs.anthropic.com/claude/docs/claude-code)