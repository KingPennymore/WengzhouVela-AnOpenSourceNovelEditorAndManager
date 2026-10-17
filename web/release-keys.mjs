// Public keys that sign release manifests (web/release-signing.mjs, docs/RELEASE-SIGNING.md). Add a new key before
// retiring an old one, so installed apps keep accepting releases while the publisher switches keys.
export const RELEASE_KEYS=Object.freeze([
  // Created 2026-10-17 with `node scripts/release-signing.mjs keygen`; the private key is kept by the publisher.
  Object.freeze({id:'vela-b042e2de130a329a',spki:'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEVvySz49xK2l7FToYIfg6n9kfPHoKaT8U05h4Qf8qDlwejJLyAKfW2l2bjkKnjK6xAD8VWeCTJ5w/NbV+HfRHow=='})
]);
