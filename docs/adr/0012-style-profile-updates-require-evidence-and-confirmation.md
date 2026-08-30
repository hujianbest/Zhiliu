# Style Profile updates require linked evidence and the user's confirmation

The Style Profile is the second artifact in this product where an AI could quietly overwrite the user — not their words this time, but the description of how they write, which then shapes every future generation. A profile that drifted on its own would be undetectable: the user would see later drafts sounding subtly less like them, with nothing to point at. So every proposed change to the profile arrives as a proposal carrying the accepted edits it was inferred from, and nothing enters the profile until the user confirms it. The Agent may never write to the profile directly.

## Consequences

- Style learning is always one review step behind the user's edits, which is the same trade ADR-0003 makes for manuscripts and for the same reason.
- The profile is a readable, hand-editable, resettable artifact under Git tracking, so a bad confirmation is recoverable by reading the history rather than by re-teaching the system.
- A proposed update whose evidence has been deleted is no longer confirmable and must be withdrawn rather than silently applied.
