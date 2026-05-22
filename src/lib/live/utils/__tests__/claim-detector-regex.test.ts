import assert from "node:assert/strict";
import { preFilterClaim } from "../../pipelines/claim-detector";

// MUST match — genuinely fact-checkable
const MUST_MATCH = [
  "Le chiffre d'affaires a grimpé de 30% l'an dernier",
  "Total a annoncé une acquisition de 12 milliards d'euros",
  "Selon le rapport annuel, la marge EBITDA est de 18%",
  "La nouvelle directive européenne 2024/65 s'applique au 1er janvier",
  "Sanofi a fusionné avec Genzyme en 2011",
  "Le PDG actuel est Jean Dupont",
  "le DG municipal est arrivé", // known false positive — LLM downstream rejects
];

// MUST NOT match — banal phrasing or non-claim
const MUST_NOT_MATCH = [
  "c'est une bonne idée",
  "il est important de comprendre",
  "le sujet est intéressant",
  "selon moi on devrait reporter",
  "je pense que c'est premier",
  "elle est la personne qui m'a parlé",
  "passons au point 5",
  "il y a eu 3 votes pour et 2 contre",
  "article 7 de ce document n'est pas fini",
];

for (const text of MUST_MATCH) {
  assert.ok(preFilterClaim(text), `should match: "${text}"`);
}
console.log(`✓ ${MUST_MATCH.length} positive cases match`);

for (const text of MUST_NOT_MATCH) {
  assert.equal(preFilterClaim(text), false, `should NOT match: "${text}"`);
}
console.log(`✓ ${MUST_NOT_MATCH.length} negative cases correctly rejected`);

console.log("\nAll claim-detector regex tests passed.");
