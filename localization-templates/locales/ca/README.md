<div align="center">
<sub>

[English](../../README.md) • Català • [Deutsch](../../locales/de/README.md) • [Español](../../locales/es/README.md) • [Français](../../locales/fr/README.md) • [हिन्दी](../../locales/hi/README.md) • [Italiano](../../locales/it/README.md)

</sub>
<sub>

[日本語](../../locales/ja/README.md) • [한국어](../../locales/ko/README.md) • [Polski](../../locales/pl/README.md) • [Português (BR)](../../locales/pt-BR/README.md) • [Türkçe](../../locales/tr/README.md) • [Tiếng Việt](../../locales/vi/README.md) • [简体中文](../../locales/zh-CN/README.md) • [繁體中文](../../locales/zh-TW/README.md)

</sub>
</div>
<br>
<div align="center">
  <!-- Community Links Removed -->
</div>
<br>
<br>

<div align="center">
<h1>Thea Code</h1>

<!-- Marketplace/Feature/Review/Docs Badges Removed -->

</div>

**Thea Code** és un **agent de programació autònom** impulsat per IA que viu en el vostre editor. Pot:

- Comunicar-se en llenguatge natural
- Llegir i escriure fitxers directament en el vostre espai de treball
- Executar comandes de terminal
- Automatitzar accions del navegador
- Integrar-se amb qualsevol API/model compatible amb OpenAI o personalitzat
- Adaptar la seva "personalitat" i capacitats mitjançant **Modes Personalitzats**

Tant si busqueu un soci de programació flexible, un arquitecte de sistemes o rols especialitzats com un enginyer de control de qualitat o un gestor de producte, Thea Code us pot ajudar a construir programari de manera més eficient.

Consulteu el [CHANGELOG](../CHANGELOG.md) per a actualitzacions i correccions detallades.

---

## 🎉 Thea Code 0.0.3

Thea Code 0.0.3 és la versió inicial basada en Roo Code v3.10.5.

- Edicions ràpides - Les edicions ara s'apliquen molt més ràpid. Menys espera, més codificació.
- Saldos de claus d'API - Visualitza els teus saldos d'OpenRouter i Requesty a la configuració.
- Configuració MCP a nivell de projecte - Ara pots configurar-ho per projecte/espai de treball.
- Suport millorat per a Gemini - Reintents més intel·ligents, escapament corregit, afegit al proveïdor Vertex.
- Importació/Exportació de configuració - Fes còpies de seguretat o comparteix la teva configuració fàcilment entre diferents entorns.

---

## Què pot fer Thea Code?

- 🚀 **Generar codi** a partir de descripcions en llenguatge natural
- 🔧 **Refactoritzar i depurar** codi existent
- 📝 **Escriure i actualitzar** documentació
- 🤔 **Respondre preguntes** sobre el vostre codi
- 🔄 **Automatitzar** tasques repetitives
- 🏗️ **Crear** nous fitxers i projectes

## Inici ràpid

1. Instal·leu Thea Code (instruccions TBD o elimineu aquesta secció).
2. Connecteu el vostre proveïdor d'IA (instruccions TBD o elimineu aquesta secció).
3. Proveu la vostra primera tasca (instruccions TBD o elimineu aquesta secció).

## Característiques principals

### Múltiples modes

Thea Code s'adapta a les vostres necessitats amb modes especialitzats:

- **Mode Codi:** Per a tasques de programació de propòsit general
- **Mode Arquitecte:** Per a planificació i lideratge tècnic
- **Mode Pregunta:** Per a respondre preguntes i proporcionar informació
- **Mode Depuració:** Per a diagnòstic sistemàtic de problemes
- **Modes personalitzats:** Creeu personatges especialitzats il·limitats per a auditoria de seguretat, optimització de rendiment, documentació o qualsevol altra tasca

### Eines intel·ligents

Thea Code ve amb potents eines que poden:

- Llegir i escriure fitxers en el vostre projecte
- Executar comandes en el vostre terminal de VS Code
- Controlar un navegador web
- Utilitzar eines externes a través del MCP (Model Context Protocol)

MCP amplia les capacitats de Thea Code permetent-vos afegir eines personalitzades il·limitades. Integreu amb APIs externes, connecteu-vos a bases de dades o creeu eines de desenvolupament especialitzades - MCP proporciona el marc per expandir la funcionalitat de Thea Code per satisfer les vostres necessitats específiques.

### Personalització

Feu que Thea Code funcioni a la vostra manera amb:

- Instruccions personalitzades per a comportament personalitzat
- Modes personalitzats per a tasques especialitzades
- Models locals per a ús offline
- Configuració d'aprovació automàtica per a fluxos de treball més ràpids

## Recursos

<!-- Documentation Section Removed -->

### Comunitat

- **Discord:** [Uniu-vos al Discord del projecte](https://discord.gg/your-discord-invite-code) <!-- Replace with actual invite code -->
- **GitHub:** Informeu de problemes o suggeriu funcionalitats al [repositori del projecte](https://github.com/sydneyrenee/Thea-Code).

---

## Configuració i desenvolupament local

1. **Cloneu** el repositori:

```sh
git clone https://github.com/sydneyrenee/Thea-Code.git
```

2. **Instal·leu les dependències**:

```sh
npm run install:all
```

3. **Inicieu la vista web (aplicació Vite/React amb HMR)**:

```sh
npm run dev
```

4. **Depuració**:
   Premeu `F5` (o **Execució** → **Inicia la depuració**) a VSCode per obrir una nova sessió amb Thea Code carregat.

Els canvis a la vista web apareixeran immediatament. Els canvis a l'extensió principal requeriran reiniciar l'amfitrió de l'extensió.

Alternativament, podeu crear un .vsix i instal·lar-lo directament a VSCode:

```sh
npm run build
```

Apareixerà un fitxer `.vsix` al directori `bin/` que es pot instal·lar amb:

```sh
code --install-extension bin/thea-code-<version>.vsix
```

Utilitzem [changesets](https://github.com/changesets/changesets) per a la gestió de versions i publicació. Consulteu el nostre `CHANGELOG.md` per a notes de llançament.

---

## Avís legal

**Tingueu en compte** que Solace & Harmony, Inc. **no** fa cap representació ni garantia pel que fa a qualsevol codi, model o altres eines proporcionades o posades a disposició en relació amb Thea Code, qualsevol eina de tercers associada, o qualsevol resultat. Assumiu **tots els riscos** associats amb l'ús de tals eines o resultats; aquestes eines es proporcionen "TAL COM ESTAN" i "SEGONS DISPONIBILITAT". Aquests riscos poden incloure, sense limitació, infraccions de propietat intel·lectual, vulnerabilitats o atacs cibernètics, biaixos, inexactituds, errors, defectes, virus, temps d'inactivitat, pèrdua o dany de propietat i/o lesions personals. Sou únicament responsables del vostre ús de tals eines o resultats (incloent, sense limitació, la legalitat, idoneïtat i resultats d'aquests).

---

## Contribucions

Ens encanten les contribucions de la comunitat! Comenceu llegint el nostre [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Col·laboradors Originals

Reconeixement i agraïment als col·laboradors originals del projecte Roo Code, en el qual es basa Thea Code. Podeu trobar la llista original de col·laboradors [aquí](https://github.com/RooVetGit/Roo-Code#contributors).

## Llicència

[Llicència Apache 2.0](../LICENSE) © 2025 Solace & Harmony, Inc. i Col·laboradors

---

**Gaudiu de Thea Code!** Esperem que us sigui un company útil. Feliç programació!
