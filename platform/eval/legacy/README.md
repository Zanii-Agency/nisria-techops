# Legacy walls (guard-swamp era, retired 2026-07-11)

These walls statically pinned the reactive action-claim regex guards removed when
compose-claims.mjs became the unconditional reply path (tag: sasa-guards-pre-removal).
Their INCIDENTS live on in eval/integration/sasa-composer-incidents-wall.test.mjs
(behavioral, via assembleReply) and eval/unit/compose-claims.test.mjs.
Not scanned by run-walls. Restore any file with: git mv eval/legacy/<f> eval/integration/
