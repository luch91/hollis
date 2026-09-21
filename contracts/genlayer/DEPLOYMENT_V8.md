# V8 GenLayer deployment record

Status: required checklist; no V8 deployment is recorded by this file.

V8 is the first candidate that binds a Hollis runtime identity, recomputes the
`hollis.case-commitment.v1` value, and prohibits a second terminal result for
the same commitment. Deploy it only to Studio Next (chain ID `61997`) from the
exact reviewed source artifact.

Before activation, record:

- source SHA-256 and the complete V8 constructor arguments;
- Studio Next network, chain ID, contract address, deployment transaction, and
  authorized runtime address;
- the exact published policy binding and deployed source version;
- one valid finalization, an unauthorized caller rejection, a replay rejection,
  and an overwrite rejection, with transaction identifiers;
- the bounded HTTPS document used for the test and its canonical commitment;
- the outcome of the Studio schema/runtime validation and the reviewer who
  approved the evidence.

Do not store credentials, raw evidence, private case IDs, signed URLs, or
policy documents in this record. A V7 address or receipt remains historical and
must be labelled legacy in the UI and exports.
