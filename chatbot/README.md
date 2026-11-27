# Chatbot service domains

This folder is the root for service-specific chatbot flows. Keep each business domain isolated here so its prompts, fields, validation, and booking rules can evolve independently.

## Domains

- `passenger-transport/`: point-to-point rides and vehicle rentals.
- `cargo-transport/`: future parcel and truck booking flows.
- `travel/`: future tour and hotel booking flows.

Shared code that is truly common across domains can live in `shared/` at this level. Domain-specific logic belongs inside its domain folder.
