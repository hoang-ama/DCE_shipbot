# Chatbot domain module

This folder contains channel-independent chatbot booking rules and data structures. The existing application entry points remain in `server.ts` (backend) and `src/` (frontend); they should call into this module rather than placing new booking logic in `server.ts` or frontend components.

## Structure

- `types.ts`: shared booking types and the `ride` / `rental` discriminator.
- `shared/`: reusable contact and address field definitions.
- `flows/ride/`: point-to-point ride booking fields and validation.
- `flows/rental/`: multi-day or itinerary rental fields and validation.

## Flow boundary

`ride` is a single trip with pickup, destination, and pickup time. `rental` is a time-bounded booking with a pickup point, itinerary, and either a return time or rental duration. Both flows collect customer name and phone. Keep each flow's required fields and completeness rules in its own module.
