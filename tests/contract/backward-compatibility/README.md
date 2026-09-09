# Backward compatibility contract tests

The executable backward-compatibility tests are kept beside the owning
admin-service code so the server policy and its tests cannot drift:

- `backend/admin-service/src/services/clientCompatibility.test.ts`
- `backend/admin-service/src/controllers/featureFlagsPublic.controller.test.ts`

Run them with:

```text
cd backend/admin-service
npm test -- --runInBand src/services/clientCompatibility.test.ts src/controllers/featureFlagsPublic.controller.test.ts
```

The tests cover additive metadata, minimum build/schema handling, missing-header
legacy safety, and filtering dynamic flags by client capability.
