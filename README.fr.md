# Claude Code (via ScioNos)

<div align="center">

[![npm version](https://img.shields.io/npm/v/claude-scionos.svg?style=flat-square)](https://www.npmjs.com/package/claude-scionos)
[![Licence: MIT](https://img.shields.io/badge/Licence-MIT-blue.svg?style=flat-square)](./LICENSE)
[![Version Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen?style=flat-square)](https://nodejs.org/)
[![PRs Bienvenues](https://img.shields.io/badge/PRs-bienvenues-brightgreen.svg?style=flat-square)](https://github.com/ScioNos/claude-scionos/pulls)

**Exécuteur éphémère et sécurisé pour la CLI Claude Code**

_[🇬🇧 Read in English](./README.md)_

</div>

---

### 📖 Table des matières

- [Présentation](#présentation)
- [Points clés](#points-clés)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Utilisation](#utilisation)
- [Fonctionnement](#fonctionnement)
- [Considérations de sécurité](#considérations-de-sécurité)
- [Dépannage](#dépannage)
- [Contribuer](#contribuer)
- [Licence](#licence)

---

### 🛡️ Présentation

**claude-scionos** est un exécuteur éphémère et sécurisé pour la CLI officielle [Claude Code](https://github.com/anthropics/claude-code). Il initialise toutes les variables d'environnement nécessaires **directement en mémoire**, garantissant qu'aucun fichier de configuration ni aucune donnée d'authentification n'est jamais écrit sur le disque.

L'objectif est d'offrir une couche d'exécution propre, isolée et professionnelle, entièrement compatible avec Claude Code, spécifiquement conçue pour **l'environnement ScioNos**.

---

### 📌 Points clés

- 🔒 **Isolation du jeton** — Le jeton d'authentification n'est jamais écrit sur le disque
- 💾 **Zéro persistance** — Aucun fichier temporaire ni configuration locale stockés
- 🧩 **Compatibilité totale** — Fonctionne parfaitement avec la CLI officielle Claude Code
- 🔐 **Stockage en mémoire uniquement** — Toutes les informations d'identification sont détruites à la fin du processus
- 🚀 **Démarrage rapide** — Exécution en une seule commande via `npx`
- 🧪 **Prêt pour CI/CD** — Adapté aux workflows automatisés et pipelines

---

### ⚙️ Prérequis

Avant d'utiliser `claude-scionos`, assurez-vous d'avoir :

- **Node.js** version 22 ou supérieure ([Télécharger](https://nodejs.org/))
- Un **ANTHROPIC_AUTH_TOKEN** valide depuis [https://routerlab.ch/keys](https://routerlab.ch/keys)

*(Note : Si la CLI **Claude Code** n'est pas installée, l'outil vous proposera de l'installer automatiquement.)*

---

### 📥 Installation

#### Option 1 : Exécution directe (Recommandé)

Aucune installation nécessaire ! Exécutez directement avec `npx` :

```bash
npx claude-scionos
```

#### Option 2 : Installation globale

Pour une utilisation fréquente, installez globalement :

```bash
npm install -g claude-scionos
```

Puis exécutez :

```bash
claude-scionos
```

---

### 🚀 Utilisation

#### Utilisation de base

Exécutez simplement la commande :

```bash
npx claude-scionos
```

**Ce qui se passe :**

1. L'outil vérifie si la CLI Claude Code est installée (si non, propose l'**installation automatique**)
2. Vous invite à saisir votre `ANTHROPIC_AUTH_TOKEN`
3. Lance Claude Code avec le jeton stocké **uniquement en mémoire**
4. Nettoie automatiquement les informations d'identification à la sortie

#### Débogage

Si vous rencontrez des problèmes, utilisez le flag de débogage pour voir les informations détaillées :

```bash
npx claude-scionos --scionos-debug
```

#### Exemple de session

```bash
$ npx claude-scionos

Claude Code (via ScioNos)
To retrieve your token, visit: https://routerlab.ch/keys
? Please enter your ANTHROPIC_AUTH_TOKEN: ********

# Claude Code démarre...
```

#### Options de ligne de commande

```bash
# Afficher la version
npx claude-scionos --version
npx claude-scionos -v
```

#### Compatibilité totale avec Claude Code

**`claude-scionos` est un wrapper transparent** — il accepte **tous les flags et commandes** supportés par la CLI officielle Claude Code.

Vous pouvez utiliser n'importe quel flag ou commande Claude Code, comme :
- `npx claude-scionos --model opus "expliquer ce code"`
- `npx claude-scionos --verbose --continue`
- `npx claude-scionos -p --output-format json "requête"`
- `npx claude-scionos --chrome --agents '{"reviewer":{...}}'`

Pour une liste complète des flags et commandes disponibles, consultez la [documentation officielle de la CLI Claude Code](https://code.claude.com/docs/cli-reference).

---

### 🔍 Fonctionnement

1. **Vérification** : Vérifie que la commande `claude` est disponible dans votre PATH
2. **Saisie du jeton** : Demande de manière sécurisée votre jeton d'authentification (entrée masquée)
3. **Configuration de l'environnement** : Crée des variables d'environnement isolées :
   - `ANTHROPIC_BASE_URL` → `https://routerlab.ch`
   - `ANTHROPIC_AUTH_TOKEN` → Votre jeton (mémoire uniquement)
4. **Exécution** : Lance le processus Claude Code avec l'environnement personnalisé
5. **Nettoyage** : Détruit automatiquement les informations d'identification à la sortie

**Aucun fichier créé. Aucune donnée persistée.**

---

### 🔐 Considérations de sécurité

Bien que `claude-scionos` assure une sécurité maximale en conservant les jetons uniquement en mémoire, veuillez noter :

⚠️ **Notes importantes :**

- Les jetons ne sont **jamais écrits sur le disque**
- Les dumps mémoire ou débogueurs pourraient potentiellement exposer le jeton pendant l'exécution du processus
- Les jetons sont automatiquement effacés à la fin du processus
- **Utiliser uniquement dans des environnements de confiance**

✅ **Bonnes pratiques :**

- Ne partagez jamais votre `ANTHROPIC_AUTH_TOKEN` avec d'autres personnes
- Récupérez un nouveau jeton pour chaque session depuis [https://routerlab.ch/keys](https://routerlab.ch/keys)
- Évitez d'exécuter sur des systèmes partagés/non fiables
- Utilisez pour le développement local ou des pipelines CI/CD sécurisés

---

### 🛠️ Dépannage

#### Erreur : 'claude' command not found

**Problème :** La CLI Claude Code n'est pas installée ou n'est pas dans le PATH.

**Solution :**
```bash
npm install -g @anthropic-ai/claude-code
```

Vérifiez l'installation :
```bash
claude --version
```

---

#### Windows : Git Bash introuvable

**Problème :** Sur Windows, Claude Code nécessite git-bash pour fonctionner. Si vous voyez une erreur après avoir saisi votre jeton, ou si `claude-scionos` se ferme avec un avertissement Git Bash, c'est le problème.

**Solution :**

1. **Installer Git pour Windows** (inclut Git Bash) :

   Télécharger depuis : [https://git-scm.com/downloads/win](https://git-scm.com/downloads/win)

2. **Alternative :** Si Git Bash est déjà installé mais non détecté, définissez la variable d'environnement :

   ```bash
   # Invite de commandes Windows
   set CLAUDE_CODE_GIT_BASH_PATH=C:\Program Files\Git\bin\bash.exe

   # PowerShell Windows
   $env:CLAUDE_CODE_GIT_BASH_PATH="C:\Program Files\Git\bin\bash.exe"
   ```

3. **Redémarrez votre terminal** et relancez :

   ```bash
   npx claude-scionos
   ```

**Note :** Git Bash est automatiquement inclus lors de l'installation de Git pour Windows. Après l'installation, `claude-scionos` le détectera automatiquement.

---

#### Échec de l'authentification du jeton

**Problème :** Jeton invalide ou expiré.

**Solution :**
1. Obtenez un nouveau jeton depuis [https://routerlab.ch/keys](https://routerlab.ch/keys)
2. Assurez-vous de copier le jeton complet (sans espaces supplémentaires)
3. Vérifiez votre connexion réseau à `routerlab.ch`

---

#### Erreur de version Node.js

**Problème :** La version de Node.js est inférieure à 22.

**Solution :**
```bash
# Vérifiez votre version de Node
node --version

# Mettez à jour Node.js vers la version 22 ou supérieure
# Visitez : https://nodejs.org/
```

---

### 🤝 Contribuer

Les contributions sont les bienvenues ! Voici comment vous pouvez aider :

1. **Signaler des bugs** — [Ouvrir une issue](https://github.com/ScioNos/claude-scionos/issues)
2. **Suggérer des fonctionnalités** — Partagez vos idées via les issues
3. **Soumettre des PRs** — Fork, créez une branche et soumettez une pull request

**Configuration de développement :**

```bash
# Cloner le dépôt
git clone https://github.com/ScioNos/claude-scionos.git
cd claude-scionos

# Installer les dépendances
npm install

# Tester localement
node index.js
```

---

### 📝 Licence

Licence MIT — © 2025 [ScioNos](https://scionos.ch)

Voir le fichier [LICENSE](./LICENSE) pour plus de détails.

---

### 🔗 Liens

- **Page d'accueil :** [https://scionos.ch](https://scionos.ch)
- **Package npm :** [https://www.npmjs.com/package/claude-scionos](https://www.npmjs.com/package/claude-scionos)
- **Issues :** [https://github.com/ScioNos/claude-scionos/issues](https://github.com/ScioNos/claude-scionos/issues)
- **Claude Code :** [https://github.com/anthropics/claude-code](https://github.com/anthropics/claude-code)

---

<div align="center">

**Fait avec ❤️ par ScioNos**

[⬆ Retour en haut](#claude-code-via-scionos)

</div>
