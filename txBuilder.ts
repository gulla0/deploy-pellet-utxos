Initialization:
const tx = new MeshTxBuilder({
    fetcher: new BlockfrostProvider(BLOCKFROST_API_KEY),
    verbose: true,
  });

Our Mesbuilder object:
MeshTxBuilder
    .setNetwork(network: "preprod"),
    .mintPlutusScriptV3(),
    .mint(pellet.fuel.toString(), validatorScriptHash, fuelTokenHex),
    .mintTxInReference(PELLET_REF_TX_HASH, PELLET_REF_OUTPUT_INDEX),
    .mintRedeemerValue(mConStr0(['mesh'])),
    .txOut(validatorAddress, assets),
    .txOutInlineDatumValue(pelletDatum),
    .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address
    ),
    .changeAddress(changeAddress),
    .selectUtxosFrom(utxos),
    .complete();


Example Meshbuilder object:
txBuilder
    .txOut('addr_test1vpvx0sacufuypa2k4sngk7q40zc5c4npl337uusdh64kv0c7e4cxr', [{ unit: "lovelace", quantity: '1000000' }])
    .changeAddress(changeAddress)
    .selectUtxosFrom(utxos)
    .complete();
