import fs from "node:fs";
import { createHash } from "node:crypto";
const root = "test-results/resource-diagnostic-97C-2B3D2/";
const original = JSON.parse(fs.readFileSync(root + "audit-execution.json")).before;
for (const [file, hash] of Object.entries(original)) {
  if (createHash("sha256").update(fs.readFileSync(file)).digest("hex") !== hash) throw new Error(`Protected evidence changed: ${file}`);
}
const audit = JSON.parse(fs.readFileSync(root + "audit-all.json"));
const production = JSON.parse(fs.readFileSync(root + "audit-production.json"));
const tree = JSON.parse(fs.readFileSync(root + "npm-ls-all.json"));
const paths = new Map();
function walk(node, chain = []) {
  for (const [name, child] of Object.entries(node.dependencies ?? {})) {
    const next = [...chain, `${name}@${child.version ?? "deduplicated"}`];
    if (audit.vulnerabilities[name]) {
      if (!paths.has(name)) paths.set(name, new Set());
      paths.get(name).add(next.join(" → "));
    }
    walk(child, next);
  }
}
walk(tree);
const targets = {
  "@babel/core": ">7.29.0 via outils Babel/ESLint",
  "baseline-browser-mapping": ">=2.11.0 via Browserslist/Next",
  "brace-expansion": ">=1.1.21 et >=5.0.12 via minimatch/ESLint",
  browserslist: ">4.28.6 via parent",
  "js-yaml": ">=4.3.2 via ESLint",
  nanoid: ">=3.3.18 via PostCSS",
  next: "npm propose 16.4.3 ; aligner eslint-config-next et revalider",
  postcss: ">8.5.22 ; copie embarquée via Next 16.4.3 proposé",
  sharp: ">=0.35.5 via Next 16.4.3 proposé",
  "source-map-js": ">=1.2.2 via PostCSS",
  zod: ">=4.6.6 via eslint-config-next",
};
const impacts = {
  "@babel/core": "Lecture de fichiers lors du traitement de sourcemaps non fiables par les outils.",
  "baseline-browser-mapping": "Arrêt du processus sur entrée invalide ; atteignabilité runtime à établir.",
  "brace-expansion": "Consommation CPU/mémoire sur motifs hostiles dans les outils.",
  browserslist: "Déni de service/cache illimité et traitement de statistiques hostiles ; outils.",
  "js-yaml": "Déni de service lors du chargement YAML ; pas de chargement YAML métier identifié.",
  nanoid: "Boucles infinies sur tailles invalides ; aucun appel métier nanoid identifié.",
  next: "RCE, contournements de contrôle, SSRF et DoS selon fonction/configuration/OS ; priorité critique.",
  postcss: "Lecture de fichiers via sourcemaps et XSS de sortie CSS ; surtout chaîne de compilation.",
  sharp: "Traitement natif d’images hostiles : corruption mémoire selon codec et OS.",
  "source-map-js": "Blocage du processus sur sourcemaps hostiles ; outils/compilation.",
  zod: "Déni de service selon validation ; dépendance des outils ESLint, pas import métier identifié.",
};
const clean = text => String(text).replaceAll("|", "\\|").replaceAll("\n", " ");
let out = "\n## Audit des dépendances — inventaire reproductible\n\n";
out += "Sources : sorties brutes de `npm audit --json`, `npm audit --omit=dev --json` et `npm ls --all --json`, conservées dans `test-results/resource-diagnostic-97C-2B3D2/`. Les bornes hors plage ci-dessous sont des cibles à vérifier lors d’une future mise à jour contrôlée, pas des installations effectuées. La présence dans l’arbre production ne démontre pas une exposition HTTP.\n\n";
out += "| Paquet installé | Gravité max. | Nature / portée | Plage agrégée audit | Mise à jour possible | Impact potentiel |\n|---|---|---|---|---|---|\n";
for (const [name, v] of Object.entries(audit.vulnerabilities)) {
  const versions = [...new Set([...paths.get(name) ?? []].map(p => p.split(" → ").at(-1).slice(name.length + 1)))].join(", ");
  out += `| ${name} ${versions} | ${v.severity} | ${v.isDirect ? "Directe" : "Transitive"} / ${production.vulnerabilities[name] ? "production (éventuellement aussi outils)" : "développement"} | ${clean(v.range)} | ${targets[name]} | ${impacts[name]} |\n`;
}
out += "\n### Chaînes installées et avis détaillés\n\nChaque ligne d’avis donne son identifiant, sa gravité et sa propre plage affectée ; les références de type paquet sont des vulnérabilités héritées, pas un nouvel avis. Les liens pointent vers les avis de sécurité.\n";
for (const [name, v] of Object.entries(audit.vulnerabilities)) {
  out += `\n#### ${name}\n\n`;
  for (const p of paths.get(name) ?? []) out += "- " + p + "\n";
  out += "\n| Avis / vulnérabilité | Gravité | Versions concernées |\n|---|---|---|\n";
  for (const via of v.via) {
    if (typeof via === "string") out += `| Héritée de ${via} (voir sa section) | — | — |\n`;
    else out += `| [${via.url.split("/").at(-1)}](${via.url}) — ${clean(via.title)} | ${via.severity} | ${clean(via.range)} |\n`;
  }
}
fs.writeFileSync(root + "dependency-appendix.md", out);
console.log("Dependency appendix generated from preserved read-only evidence.");
