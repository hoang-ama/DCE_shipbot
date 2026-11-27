# Chatbot domain module

This folder contains channel-independent chatbot booking rules and data structures. The existing application entry points remain in `server.ts` (backend) and `src/` (frontend); they should call into this module rather than placing new booking logic in `server.ts` or frontend components.

## Structure

- `types.ts`: shared booking types and the `ride` / `rental` discriminator.
- `shared/`: reusable contact and address field definitions.
- `flows/ride/`: point-to-point ride booking fields and validation.
- `flows/rental/`: multi-day or itinerary rental fields and validation.

## Flow boundary

`ride` is a single trip with pickup, destination, and pickup time. `rental` is a time-bounded booking with a pickup point, itinerary, and either a return time or rental duration. Both flows collect customer name and phone. Keep each flow's required fields and completeness rules in its own module.

## Experimental matching and handover

- `partners/ride/` and `partners/rental/` contain fictional partner profiles, one JSON file per partner.
- `partnerMatcher.ts` reads those profiles and returns the first eligible partner as a mock retrieval result.
- `agent.ts` is the experimental passenger bot controller. It invokes matching when a Ride or Rental booking is complete and hands off explicit Ops requests.
- `ops/ops-01.json` contains the fictional Ops profile.

The experimental UI calls the app's local `POST /api/passenger-transport/agent-turn` route. The bot controller calls `matchPassengerPartner()` as a normal in-process function; that function reads the JSON corpus from this directory and chooses the first eligible profile. No external partner API or deployed vector database is called, and no booking request is sent to a real partner. Ops replies are simulated in the experiment UI, and Reset clears the handover.
