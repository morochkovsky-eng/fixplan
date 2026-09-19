# Homory: product foundation

Homory is an **AI assistant for homeowners**. Its key idea is **"a home's memory that helps people act"** (`память дома, которая помогает действовать`).

This document contains durable product principles. For the current release, known defects, and next steps, read [`CURRENT_STATE.md`](CURRENT_STATE.md).

## Audience and use case

The primary audience is an adult private homeowner who manages a home independently, including remotely and when the property is rented out. Homory combines two equal values:

- control of current household work;
- an accumulating, searchable history of the home.

Telegram is the primary interaction point. The web application is the structured interface for reviewing and managing apartments, assets, documents, utility information, work, and history.

## Core interaction loop

1. The user sends text, a voice message, a photo, or a document.
2. Homory identifies the apartment or asset, the intent, and related context.
3. Homory prepares a structured result: a record, document, reading, bill, task, or history event.
4. The owner reviews and confirms the change.
5. Confirmed information remains in the home's history and becomes available for later search and action.

The user does not need to describe the whole apartment in advance. Information should accumulate through normal household activity, one event at a time.

## Five user expectations

- **Remember:** save a document, purchase, repair, appliance, meter reading, or event.
- **Find:** retrieve when something was purchased or repaired, its cost, contractor, warranty, or related document.
- **Organize:** prepare a task, reminder, inspection, cleaning, or contractor job.
- **Calculate:** interpret utility documents and readings and prepare a calculation.
- **Control:** show unfinished work, maintenance, warranties, and work results.

## Decision rules

- Decisions and irreversible changes remain with the owner.
- Homory may prepare a draft, calculation, or action, but must request confirmation before committing an irreversible result.
- Facts must come from stored product data or supplied documents. Uncertainty must be visible; an assumption must not be presented as a found fact.
- In a tenant group scenario, relevant messages may be recognized in the group, but drafts and decisions are presented to the owner privately before delivery.

## Product boundaries

Homory does not currently promise to:

- act as a universal AI chat;
- pay bills autonomously;
- replace a contractor or professional inspection;
- provide legal guarantees;
- contact tenants or contractors without owner approval;
- make irreversible changes without confirmation.

## Separation from Notion Assistant

Homory is not connected to the Notion Assistant project. Notion Assistant was used only as a technical reference for Telegram processing indicators. Do not copy its prompts, user data, tokens, integrations, storage, or business logic into Homory.

## Related context

- Current snapshot and roadmap: [`CURRENT_STATE.md`](CURRENT_STATE.md)
- Technical architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Telegram behavior: [`TELEGRAM.md`](TELEGRAM.md)
