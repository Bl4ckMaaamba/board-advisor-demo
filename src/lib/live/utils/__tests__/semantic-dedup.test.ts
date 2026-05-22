import assert from "node:assert/strict";
import {
  jaccardSimilarity,
  isDuplicate,
  recordPublication,
  resetSessionBuffer,
} from "../semantic-dedup";

const MEETING_ID = "meet-test";
const PIPELINE = "factcheck" as const;

function freshSession() {
  resetSessionBuffer(MEETING_ID);
}

// 1. Jaccard similarity sanity
{
  assert.equal(jaccardSimilarity("", ""), 0);
  assert.equal(jaccardSimilarity("the cat sat", "the cat sat"), 1);
  assert.ok(jaccardSimilarity("le chiffre d'affaires a augmenté de 30%", "le ca a grimpé de 30%") < 0.6);
  assert.ok(jaccardSimilarity("acquisition de TotalEnergies", "TotalEnergies a fait une acquisition") >= 0.6);
  console.log("✓ jaccardSimilarity");
}

// 2. Empty buffer → never duplicate
{
  freshSession();
  assert.equal(isDuplicate(MEETING_ID, PIPELINE, { tokens: "premier exemple" }), false);
  console.log("✓ empty buffer never duplicate");
}

// 3. After recording, near-identical candidate is duplicate
{
  freshSession();
  recordPublication(MEETING_ID, PIPELINE, { tokens: "Le chiffre d'affaires est passé de 100 à 130 millions d'euros" });
  const isDup = isDuplicate(MEETING_ID, PIPELINE, { tokens: "Le chiffre d'affaires est passé de 100 à 130M€" });
  assert.equal(isDup, true);
  console.log("✓ near-identical text deduped");
}

// 4. Different topic is not duplicate
{
  freshSession();
  recordPublication(MEETING_ID, PIPELINE, { tokens: "acquisition de TotalEnergies" });
  assert.equal(isDuplicate(MEETING_ID, PIPELINE, { tokens: "nouveau directeur juridique nommé hier" }), false);
  console.log("✓ different topic not deduped");
}

// 5. Per-pipeline isolation
{
  freshSession();
  recordPublication(MEETING_ID, "factcheck", { tokens: "claim text shared" });
  assert.equal(isDuplicate(MEETING_ID, "moderation", { tokens: "claim text shared" }), false);
  console.log("✓ pipelines are isolated");
}

// 6. Per-session isolation
{
  resetSessionBuffer("a");
  resetSessionBuffer("b");
  recordPublication("a", PIPELINE, { tokens: "shared content" });
  assert.equal(isDuplicate("b", PIPELINE, { tokens: "shared content" }), false);
  console.log("✓ sessions are isolated");
}

// 7. Moderation comparator: type + overlapping participants
{
  freshSession();
  recordPublication(MEETING_ID, "moderation", {
    type: "interruption_repetee",
    participants: ["alice", "bob"],
  });
  // Same type + overlapping participant → duplicate
  assert.equal(
    isDuplicate(MEETING_ID, "moderation", { type: "interruption_repetee", participants: ["bob", "carol"] }),
    true
  );
  // Same participants but different type → not duplicate
  assert.equal(
    isDuplicate(MEETING_ID, "moderation", { type: "monopolisation_persistante", participants: ["alice"] }),
    false
  );
  console.log("✓ moderation comparator works");
}

// 8. Entries older than 10 min expire
{
  freshSession();
  recordPublication(MEETING_ID, PIPELINE, { tokens: "old content", _testTimestamp: Date.now() - 11 * 60_000 });
  assert.equal(isDuplicate(MEETING_ID, PIPELINE, { tokens: "old content" }), false);
  console.log("✓ entries expire after 10 min");
}

console.log("\nAll semantic-dedup tests passed.");
