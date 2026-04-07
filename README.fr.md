# Claude Code pour RouterLab

`claude-scionos` est un lanceur RouterLab pour le CLI officiel Claude Code. Il conserve l'usage normal de Claude Code, tout en ajoutant un onboarding guidé, le routage de stratégies, le stockage sécurisé du token et une commande `doctor` pour le support client.

_[🇬🇧 Read in English](./README.md)_

## Points clés

- lancement guidé pour les nouveaux utilisateurs
- `--strategy` pour choisir une stratégie sans menu
- `--service llm` pour l'accès RouterLab LLM sur invitation
- `--no-prompt` pour l'automatisation et la CI
- `--list-strategies` pour voir les routes disponibles
- `doctor` pour diagnostiquer rapidement un poste client
- `auth login|status|change|logout|test` pour gérer le token
- proxy local lancé uniquement si une stratégie mappée est choisie
- `--acp` pour les intégrations Zed/éditeur non interactives
- capabilities ACP conservatrices (`tools`, `prompts`, `resources`, `streaming` désactivés tant qu'ils ne sont pas implémentés)

## Prérequis

- Node.js 22 ou plus
- un token RouterLab depuis [routerlab.ch/keys](https://routerlab.ch/keys)
- ou un token d'invitation pour `--service llm`
- sous Windows, Git Bash doit être installé pour Claude Code

## Installation

Exécution directe avec `npx` :

```bash
npx claude-scionos
```

Ou installation globale :

```bash
npm install -g claude-scionos
claude-scionos
```

## Démarrage rapide

Mode guidé :

```bash
npx claude-scionos
```

Commandes utiles :

```bash
npx claude-scionos --list-strategies
npx claude-scionos doctor
npx claude-scionos auth login
npx claude-scionos auth login --service llm
npx claude-scionos auth test
npx claude-scionos --strategy aws
npx claude-scionos --service llm --strategy claude-glm-5
npx claude-scionos --strategy aws --no-prompt -p "Résume ce dépôt"
npx claude-scionos --acp --no-prompt
```

## Services

- le comportement par défaut utilise `https://routerlab.ch`
- `--service llm` bascule le lanceur vers `https://llm.routerlab.ch`
- `llm` est prévu pour un accès sur invitation
- les tokens enregistrés avec `auth login --service llm` sont stockés séparément du token RouterLab par défaut
- `llm` expose pour l'instant `claude-glm-5` et `claude-gpt-5.4`
- `routerlab` expose aussi `claude-gpt-5.4`

## Stratégies

- `default` : utilise Claude Code normalement sans proxy local
- `aws` : remappe les familles de modèles Claude vers les variantes Claude AWS de RouterLab
- `claude-glm-5` : force toutes les requêtes vers `claude-glm-5`
- `claude-minimax-m2.5` : force toutes les requêtes vers `claude-minimax-m2.5`
- `claude-gpt-5.4` : force toutes les requêtes vers `claude-gpt-5.4`

Utilise `--list-strategies` pour voir les stratégies disponibles pour le service choisi et leur disponibilité réelle quand un token est disponible.

## Gestion du token

Ordre de résolution du token :

1. `ANTHROPIC_AUTH_TOKEN`
2. stockage local sécurisé via `claude-scionos auth login`
3. stockage local sécurisé spécifique au service via `claude-scionos auth login --service llm`
4. saisie manuelle en mode guidé

Backends de stockage sécurisés :

- Windows : fichier local chiffré via DPAPI, lié à l'utilisateur courant
- macOS : Keychain
- Linux : Secret Service via `secret-tool`

Gestion du token :

```bash
claude-scionos auth login
claude-scionos auth status
claude-scionos auth change
claude-scionos auth logout
claude-scionos auth test
```

## Ce que veulent dire `--strategy`, `--no-prompt` et `--acp`

- `--strategy <value>` évite le menu interactif et choisit directement la route
- `--service <value>` change la cible RouterLab. `routerlab` reste le défaut et `llm` est réservé à l'accès sur invitation
- `--no-prompt` désactive toutes les questions interactives
- `--acp` démarre un pont stdio non interactif destiné à Zed ou à un autre éditeur compatible ACP

Quand `--no-prompt` est utilisé, le lanceur doit déjà avoir un token via `ANTHROPIC_AUTH_TOKEN` ou via le stockage sécurisé.

Quand `--acp` est utilisé, le wrapper force aussi un comportement non interactif et écrit ses diagnostics uniquement sur `stderr`.

## Intégration Zed

Utilise `claude-scionos --acp` comme commande d'agent personnalisé dans Zed. Exemple :

```json
{
  "agent_servers": {
    "claude-scionos": {
      "type": "custom",
      "command": "npx",
      "args": ["claude-scionos", "--acp", "--no-prompt"]
    }
  }
}
```

Le support ACP actuel reste volontairement minimal, mais inclut désormais le flux de session attendu par Zed :
- `initialize`
- `session/new`
- `session/get`
- `message/send`
- `tools/list` renvoie une liste vide
- `prompts/list` renvoie une liste vide
- `cancel` / `message/cancel`
- `shutdown`

Le wrapper n'annonce pas encore de support pour le streaming, les tools, les resources ou les prompts.

Le mode ACP réutilise la même logique de service, token et stratégie que le lanceur normal. Si tu veux une route mappée, passe les mêmes flags de stratégie qu'en terminal.

## Doctor

`claude-scionos doctor` vérifie l'installation locale et affiche un résumé exploitable par le support :

- plateforme et version Node.js
- installation de Claude Code
- Git Bash sous Windows
- backend de stockage sécurisé
- présence d'un token stocké ou d'environnement
- validation RouterLab si un token est disponible

## Compatibilité

Le wrapper transmet les arguments Claude Code habituels. Le proxy local n'est lancé que pour les stratégies mappées. `default` lance Claude Code sans couche proxy.

## Dépannage

`claude-scionos doctor` doit être la première commande à lancer quand un client signale un problème.

Cas courants :

- `Claude Code CLI not found` : installer `@anthropic-ai/claude-code`
- `Git Bash is required on Windows` : installer Git for Windows
- `ANTHROPIC_AUTH_TOKEN ... is required when using --no-prompt` : définir la variable d'environnement ou stocker le token au préalable
- `secret-tool not found` : installer un client Secret Service sous Linux ou utiliser la variable d'environnement

## Développement

```bash
npm install
npm test
npm run lint
node index.js
```

## Licence

MIT. Voir [LICENSE](./LICENSE).
