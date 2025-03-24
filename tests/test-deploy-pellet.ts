import { MeshTxBuilder, BlockfrostProvider, Asset, stringToHex, deserializeAddress, mConStr0 } from "@meshsdk/core";

// Replace this with your actual API key or read from environment
const BLOCKFROST_API_KEY = process.env.BLOCKFROST_API_KEY || 'YOUR_BLOCKFROST_API_KEY_HERE';

// Configuration values
const VALIDATOR_ADDRESS = 'addr_test1wrw5ncshtpkh5phqwdxm3va7ejljlgc3n09a4sv7c4mpnxcg8rfkt';
const POLICY_ID = 'dd49e217586d7a06e0734db8b3beccbf2fa3119bcbdac19ec576199b';
const ADMIN_TOKEN_POLICY = 'dd3314723ac41eb2d91e4b695869ff5597f0f0acea9f063d4adb60d5';
const ADMIN_TOKEN_NAME = '617374657269612d61646d696e';
const SHIPYARD_POLICY = 'a6c2c9684eab662549c6417aea6724b238591e38cdddaabd43086ef3';
const PELLET_REF_TX_HASH = 'd2aad1327c66dc18ef0e31755195dce708dd13ceb22ff5e7350662512cee983f';
const PELLET_REF_OUTPUT_INDEX = 0;

// Dummy change address for testing
const DUMMY_CHANGE_ADDRESS = 'addr_test1qpkm28ylwmxrh73mv0g4kna0frsr7planet83uz8ht4rhqxrrkn9mwl0zqdl83s9s5aqpwpjlhj00ts3fqkt70zfk3nqjr03l2';

// Test pellet data
const testPellet = {
  fuel: 55,
  pos_x: BigInt(11),
  pos_y: BigInt(0),
  shipyard_policy: 'a6c2c9684eab662549c6417aea6724b238591e38cdddaabd43086ef3'
};

/**
 * Extract the script hash from a validator address
 */
function extractScriptHash(validatorAddress: string): string {
  try {
    const deserializedAddress = deserializeAddress(validatorAddress);
    
    if (deserializedAddress.scriptHash) {
      console.log("Properly extracted script hash:", deserializedAddress.scriptHash);
      return deserializedAddress.scriptHash;
    } else {
      console.warn("No script hash found in deserialized address, falling back to original method");
      return validatorAddress.slice(0, 56);
    }
  } catch (error) {
    console.error("Error extracting script hash:", error);
    throw new Error(`Failed to extract script hash: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Test deploying a single pellet
 */
async function testDeployPellet() {
  console.log("Starting pellet deployment test");
  
  try {
    // Create the transaction builder
    const tx = new MeshTxBuilder({
      fetcher: new BlockfrostProvider(BLOCKFROST_API_KEY),
      verbose: true,
    });
    
    // Set the network to preprod
    tx.setNetwork("preprod");
    console.log("Network configured for preprod");
    
    // Extract script hash from validator address
    const validatorScriptHash = extractScriptHash(VALIDATOR_ADDRESS);
    console.log("Using script hash:", validatorScriptHash);
    
    // Admin token unit - using concatenated format without dot
    const adminTokenUnit = `${ADMIN_TOKEN_POLICY}${ADMIN_TOKEN_NAME}`;
    console.log("Using admin token unit:", adminTokenUnit);
    
    // Prepare the datum for this pellet
    const pelletDatum = {
      constructor: 0,
      fields: [
        testPellet.pos_x.toString(),
        testPellet.pos_y.toString(),
        testPellet.shipyard_policy
      ]
    };
    console.log("Pellet datum:", JSON.stringify(pelletDatum, null, 2));
    
    // Create base assets for this pellet
    const assets: Asset[] = [
      { unit: "lovelace", quantity: "1000000" },
      { unit: adminTokenUnit, quantity: "1" }
    ];
    
    // Mint fuel tokens using the validator script as the minting policy
    const fuelTokenHex = stringToHex("FUEL");
    console.log("Minting fuel tokens:", {
      amount: testPellet.fuel.toString(),
      policy: validatorScriptHash,
      tokenName: fuelTokenHex,
      refTxHash: PELLET_REF_TX_HASH,
      refOutputIndex: PELLET_REF_OUTPUT_INDEX
    });
    
    // Simplified minting approach for PlutusScriptV3
    tx.mintPlutusScriptV3()
      .mint(testPellet.fuel.toString(), validatorScriptHash, fuelTokenHex)
      .mintTxInReference(PELLET_REF_TX_HASH, PELLET_REF_OUTPUT_INDEX)
      .mintRedeemerValue(mConStr0(['mesh']));
    
    console.log("Minting with reference script configured");
    
    // Add the minted fuel token to assets
    const tokenFullName = `${validatorScriptHash}${fuelTokenHex}`;
    console.log("Token full name:", tokenFullName);
    assets.push({
      unit: tokenFullName,
      quantity: testPellet.fuel.toString()
    });
    
    // Send assets to the validator address with inline datum
    tx.txOut(VALIDATOR_ADDRESS, assets)
      .txOutInlineDatumValue(pelletDatum);
    
    console.log("Output added to transaction");
    
    // Set change address
    tx.changeAddress(DUMMY_CHANGE_ADDRESS);
    console.log("Change address set");
    
    // NOTE: In a real test, you would need to:
    // 1. Add input UTXOs with tx.txIn() 
    // 2. Add collateral with tx.txInCollateral()
    // These require actual wallet UTXOs
    
    console.log("Transaction built and ready. To execute this for real, you would need:");
    console.log("1. Actual wallet UTXOs as inputs");
    console.log("2. Collateral UTXO");
    console.log("3. Actual wallet instance to sign and submit");
    
    // FOR ACTUAL EXECUTION:
    // const unsignedTx = await tx.complete();
    // const signedTx = await wallet.signTx(unsignedTx);
    // const txHash = await wallet.submitTx(signedTx);
    // console.log("Transaction submitted with hash:", txHash);
    
    console.log("Test completed successfully");
  } catch (error) {
    console.error("Test failed:", error);
  }
}

// Run the test
testDeployPellet();
  
  