# Whisper Hands · Meaning Layer v0.1

This document defines the data boundary for the onboarding demo. It does not contain a model prompt or private profile.

## Invariant

`raw source != AI candidate != user-confirmed meaning`

Raw text and media metadata may support private processing. They never enter the outward-facing Meaning Layer automatically.

## Flow

1. A user supplies a clue or past work.
2. The raw source and any follow-up answer are stored privately with provenance.
3. AI may later propose a small, editable Meaning Slice.
4. The user confirms, edits, rejects or defers it.
5. Only confirmed slices appear in `getWhisperHandsMeaningLayer()`.

## Meaning Slice dimensions

- `attention`: what the creator repeatedly notices;
- `aesthetic`: visual, material or sensory attraction;
- `making_process`: how the creator tends to work or decide;
- `meaning_association`: a personally meaningful connection or metaphor;
- `values`: an explicitly supported value or belief;
- `worldview_tension`: a contradiction that should remain open;
- `language_voice`: preferred language, rhythm or expressive form;
- `boundary`: what the system must not decide or expose.

## Candidate statuses

- `candidate`: proposed, not usable as identity knowledge;
- `confirmed`: accepted or rewritten by the user;
- `rejected`: explicitly not the user;
- `deferred`: unresolved and not usable for generation.

## Public integration surface

Call `window.getWhisperHandsMeaningLayer()` in the browser. The returned object contains:

- schema and profile identifiers;
- generation time;
- `rawMaterialIncluded: false`;
- confirmed Meaning Slices only;
- evidence references, not raw evidence;
- permitted downstream uses.

The current browser store is a hackathon persistence layer, not production identity or encrypted storage. Images remain session-only until a private media service is connected.
