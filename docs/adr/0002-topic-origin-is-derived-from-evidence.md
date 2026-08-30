# Topic Origin is derived from evidence, never set by hand

The product's central trust promise is that opinions found in the library are never presented as the user's own beliefs, and the only mechanism enforcing it is Topic Origin, which gates whether a Topic may be written up automatically. A hand-settable flag would put that promise one misclick — or one well-meaning "let the user fix the classification" feature — away from auto-writing corpus material in the user's voice, so Origin is computed from whether at least three Thought Notes support the Topic and is never editable.

The classification is exhaustive and has no undefined middle: three or more Thought Notes makes a Topic a Thought Signal, and anything below that — including a Topic with one or two Thought Notes — is a Library Discovery. There is no third state and no "pending" value, because any such value would need its own rule about whether it may be written up automatically, and that rule is the thing this decision exists to keep singular.

## Consequences

- A user who disagrees with a Topic's classification cannot correct it directly; they change it by writing thoughts, which is the behaviour we want.
- Origin can move in both directions as evidence changes, so anything gated on it must tolerate a Topic losing that status.
- The user's route out of a Library Discovery Proposal is to write thoughts on it: at the third Thought Note the Topic's Origin flips and the ordinary Writing Readiness path opens. A Library Discovery Proposal is therefore not a dead end, and the Creation surface must make that route visible rather than offering a way to reclassify.
