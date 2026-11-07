# Local QA HTTP Adapter

`ConcreteHttpAdapter` is deliberately restricted to a local QA receiver. It is
not a general-purpose HTTP dispatcher and must not be repurposed for external
engagement, follower, or interaction endpoints.

## Local receiver contract

The adapter accepts only these loopback hostnames:

- `localhost`
- `127.0.0.1`
- `[::1]`

The path must be exactly `/__whiskay_qa__/batch`. HTTP is allowed only for this
loopback route. Query strings, fragments, embedded credentials, redirects, and
proxy environment settings are rejected or disabled.

Example target:

```text
http://127.0.0.1:43127/__whiskay_qa__/batch
```

The QA harness must start its own local receiver on the chosen port. The
adapter does not create or expose a public receiver.

## Development configuration

```bash
NODE_ENV=development
MAX_BATCH_SIZE=1000
```

`MAX_BATCH_SIZE` is honored only in development and accepts integers from 1 to
1000. If unset, the default is 100. Invalid values fail closed. The inherited
base dispatcher continues to enforce a 100-item default for all other adapters.

In development only, requests to the fixed loopback QA route receive a
synthetic `local-qa-runner` attestation so automated QA does not block on an
interactive prompt. This is not an owner approval and is not accepted for
production or external destinations. The application's
`instagram.targeting.requireOwnerApproval` setting remains `true`.

Production ignores `MAX_BATCH_SIZE` and requires real approval metadata from
the trusted owner-approval workflow.

## Example

```js
import { ConcreteHttpAdapter } from '../src/adapters/ConcreteHttpAdapter.js';

const adapter = new ConcreteHttpAdapter();
const result = await adapter.dispatchBatch(
  'http://127.0.0.1:43127/__whiskay_qa__/batch',
  [{ fixtureId: 'qa-001' }, { fixtureId: 'qa-002' }],
  { delayMs: 1_000 },
);

console.log({ submitted: result.submitted, succeeded: result.succeeded });
```

In production, pass the trusted approval record as `options.approval`; the
adapter does not manufacture production approval.

## Tests

```bash
node --test test/concrete-http-adapter.test.mjs
```
