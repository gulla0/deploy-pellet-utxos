# Pellet UTXO Creation in Asteria

Based on the code you've shared, I can explain how pellet UTXOs are created and how fuel and prize tokens are assigned to them.

## Pellet UTXO Creation Process

Pellet UTXOs are created through the `createPellets` function in `offchain/transactions/admin/pellets/create-pellets.ts`. Here's how it works:

1. **Setup**: The function takes three parameters:
   - `prize_tokens`: Assets to be included in the pellet as rewards
   - `admin_token`: The admin token that parameterizes the validators
   - `params`: An array of objects specifying fuel amount and position for each pellet

2. **For each pellet**, the function:
   - Creates a pellet datum with position coordinates and shipyard policy
   - Mints the specified amount of fuel tokens
   - Pays to the pellet validator address with:
     - The pellet datum (inline)
     - The minted fuel tokens
     - One admin token
     - The prize tokens

## Key Code Sections

```typescript:offchain/transactions/admin/pellets/create-pellets.ts
// ... existing code ...

for (const pellet of params) {
  const pelletInfo = {
    pos_x: pellet.pos_x,
    pos_y: pellet.pos_y,
    shipyard_policy: shipyardPolicyId,
  };
  const pelletDatum = Data.to<PelletDatumT>(
    pelletInfo,
    PelletDatum as unknown as PelletDatumT
  );

  tx = tx
    .readFrom([pelletRef])
    .mintAssets(
      {
        [fuelTokenUnit]: pellet.fuel,
      },
      mintFuelRedeemer
    )
    .payToContract(
      pelletAddressBech32,
      { inline: pelletDatum },
      {
        [fuelTokenUnit]: pellet.fuel,
        [adminTokenUnit]: BigInt(1),
        ...prize_tokens,
      }
    );
}
// ... existing code ...
```

## Fuel Token Minting

The fuel tokens are minted using the pellet validator itself, which has a dual role:
1. As a validator for spending pellet UTXOs
2. As a minting policy for fuel tokens

The pellet validator's minting policy ID is extracted from the validator's payment credential, as shown in the onchain code:

```aiken
expect Script(fuel_policy) = pellet_input.output.address.payment_credential
```

## Prize Tokens

Prize tokens are passed as a parameter to the `createPellets` function and are included in the value of each pellet UTXO. These tokens can be collected by ships when they gather fuel from a pellet.

## Pellet Validator Behavior

According to the design document, the pellet validator allows:

1. **Providing fuel** to ships (via the `Provide` redeemer)
   - Requires a ship token in some input
   - Ensures the admin token remains in the output
   - Verifies the requested fuel amount is available
   - Updates the fuel token amount in the output

2. **Consuming the pellet** (via the `ConsumePellet` redeemer)
   - Requires the admin token in a wallet input
   - Returns all assets to the admin

## Summary

Pellet UTXOs are created by the admin, who mints fuel tokens and assigns them along with prize tokens and an admin token to each pellet UTXO. The pellet's position is stored in its datum. Ships can later interact with these pellets to gather fuel and collect prize tokens when they reach the pellet's position.
