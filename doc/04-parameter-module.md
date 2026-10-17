# ParamModule

Access as `sdk.param`. This module builds partner parameter creation transactions, queries account data, and derives account addresses.
Examples with `await` assume an async function and a configured `sdk`, `connection`, and funded `payer` Keypair.

| Method | Input | Return |
| --- | --- | --- |
| `createParams({ partner })` | `partner: PublicKey` | `{ transaction, signers: [], accounts: { partner, adminAccount, paramsAccount } }` |
| `getParams(partner)` | `partner: PublicKey` | `{ address, data }` when Anchor decoding is available; otherwise `{ address, accountInfo }` |
| `getAdmin()` | none | `{ address, data }` or `{ address, accountInfo }` |
| `getParamsAddress(partner)` | `partner: PublicKey` | `PublicKey` |
| `getAdminAddress()` | none | `PublicKey` |

```js
const partner = payer.publicKey;
const paramsAddress = sdk.param.getParamsAddress(partner);
const adminAddress = sdk.param.getAdminAddress();
const built = await sdk.param.createParams({ partner });

built.transaction.feePayer = partner;
built.transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
const signature = await connection.sendTransaction(built.transaction, [payer, ...built.signers]);
```

`createParams` does not send the transaction and requires the partner to sign. The SDK supplies no extra signers. `getParams` and `getAdmin` first check that the account exists and throw an error if it does not. For a configured program with Anchor account decoders, the `data` field contains the decoded account.

The mainnet IDL defines `Params` with `base_swap_fee`, `base_borrow_fee`, `base_borrow_duration`, `base_fee_recipient`, `fee_recipient`, `fee_split`, and `bump`. It defines `Admin` with `default_swap_fee`, `default_borrow_fee`, `default_borrow_duration`, `base_fee_recipient`, `default_fee_split`, `admin`, and `bump`. Anchor decodes these as camelCase JavaScript fields. Account data comes from the chain, so inspect the returned values instead of assuming preset fees.

## PDA derivation

The admin PDA uses seed `"admin"` and `sdk.programId`. The partner params PDA uses seeds `"params"` and `partner.toBuffer()`, also with `sdk.programId`. One params PDA is derived for each partner public key. The current module only creates and reads parameters; it has no update or delete method.

The `paramsAccount` supplied to the SDK constructor is a configured account address used by token creation. `createParams` derives an address for the specific partner passed to it. If creating a token with that partner's params account, configure the SDK with the derived address.

See [token creation](./03-token-module.md) and [SDK initialization](./02-sdk-overview.md).
