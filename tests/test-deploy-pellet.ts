import { MeshTxBuilder, BlockfrostProvider, Asset, stringToHex, deserializeAddress, mConStr0 } from "@meshsdk/core";
import { AppWallet, UTxO } from "@meshsdk/core";

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

// Get wallet seed from environment
const WALLET_SEED = process.env.WALLET_SEED || '';
if (!WALLET_SEED) {
  console.error("Error: WALLET_SEED environment variable is not set");
  process.exit(1);
}

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
    // Initialize wallet
    console.log("Initializing wallet...");
    const wallet = new AppWallet({
      networkId: 0, // 0 for testnet, 1 for mainnet
      fetcher: new BlockfrostProvider(BLOCKFROST_API_KEY),
      submitter: new BlockfrostProvider(BLOCKFROST_API_KEY),
      key: {
        type: "mnemonic",
        words: WALLET_SEED.split(' ')
      },
    });

    // Get wallet address
    const walletAddr = await wallet.getPaymentAddress();
    console.log(`Wallet address: ${walletAddr}`);

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
      .mintRedeemerValue(mConStr0(['FUEL']));
    
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
    
    // Set change address to wallet's address
    const changeAddress = await wallet.getPaymentAddress(); // Use getPaymentAddress instead of getChangeAddress
    tx.changeAddress(changeAddress);
    console.log(`Change address set to: ${changeAddress}`);
    
    // Get UTXOs from wallet
    console.log("Fetching wallet UTXOs...");
    // Custom function to get UTXOs since AppWallet doesn't have getUtxos directly
    const utxos = await getWalletUtxos(wallet);
    console.log(`Retrieved ${utxos.length} UTXOs from wallet`);
    
    if (utxos.length === 0) {
      throw new Error("No UTXOs found in wallet. Please ensure your wallet has ADA.");
    }
    
    // Select UTXOs for the transaction
    tx.selectUtxosFrom(utxos);
    console.log("UTXOs selected for transaction");
    
    // Add collateral
    console.log("Finding suitable collateral...");
    // Find a UTXO with enough ADA to use as collateral
    const potentialCollateral = utxos.find((utxo: UTxO) => {
      const lovelaceAmount = utxo.output.amount.find((a: Asset) => a.unit === 'lovelace');
      return lovelaceAmount && BigInt(lovelaceAmount.quantity) >= BigInt(5000000); // 5 ADA
    });
    
    if (potentialCollateral) {
      console.log("Using UTXO as collateral:", 
        potentialCollateral.input.txHash.slice(0, 10) + "...",
        potentialCollateral.input.outputIndex);
      tx.txInCollateral(
        potentialCollateral.input.txHash,
        potentialCollateral.input.outputIndex,
        potentialCollateral.output.amount,
        potentialCollateral.output.address
      );
    } else {
      throw new Error("No suitable collateral found. Please ensure your wallet has at least 5 ADA in a single UTXO.");
    }
    
    // Complete the transaction
    console.log("Building transaction...");
    let unsignedTx;
    try {
      unsignedTx = await tx.complete();
      console.log("Transaction built successfully");
    } catch (buildError) {
      console.error("Transaction build failed:", buildError);
      
      // More detailed error analysis
      if (buildError instanceof Error) {
        console.error("Error message:", buildError.message);
        console.error("Error stack:", buildError.stack);
        
        if (buildError.message.includes("INPUTS_EXHAUSTED")) {
          console.error("INPUTS_EXHAUSTED error: You don't have enough ADA or tokens to complete this transaction");
        } else if (buildError.message.includes("MAX_TX_SIZE")) {
          console.error("MAX_TX_SIZE error: Transaction is too large");
        } else if (buildError.message.includes("MIN_UTXO_VALUE")) {
          console.error("MIN_UTXO_VALUE error: Output amount is below minimum UTXO value");
        }
      }
      
      throw new Error(`Failed to build transaction: ${buildError instanceof Error ? buildError.message : String(buildError)}`);
    }
    
    // Sign the transaction
    console.log("Signing transaction...");
    let signedTx;
    try {
      signedTx = await wallet.signTx(unsignedTx);
      console.log("Transaction signed successfully");
    } catch (signError) {
      console.error("Transaction signing failed:", signError);
      throw new Error(`Failed to sign transaction: ${signError instanceof Error ? signError.message : String(signError)}`);
    }
    
    // Submit the transaction
    console.log("Submitting transaction...");
    let txHash;
    try {
      txHash = await wallet.submitTx(signedTx);
      console.log("Transaction submitted successfully");
      console.log("Transaction hash:", txHash);
    } catch (submitError) {
      console.error("Transaction submission failed:", submitError);
      
      // More detailed error analysis
      if (submitError instanceof Error) {
        console.error("Error message:", submitError.message);
        console.error("Error stack:", submitError.stack);
        
        if (submitError.message.includes("BadInputsUTxO")) {
          console.error("BadInputsUTxO error: One of the UTXOs has been spent already");
        } else if (submitError.message.includes("ScriptWitnessNotValidatingUTXOW")) {
          console.error("ScriptWitnessNotValidatingUTXOW error: Script validation failed");
        } else if (submitError.message.includes("OutsideValidityIntervalUTxO")) {
          console.error("OutsideValidityIntervalUTxO error: Transaction is outside validity interval");
        }
      }
      
      throw new Error(`Failed to submit transaction: ${submitError instanceof Error ? submitError.message : String(submitError)}`);
    }
    
    console.log("Test completed successfully with transaction hash:", txHash);
    return txHash;
    
  } catch (error) {
    console.error("====== TEST FAILED ======");
    console.error("Error details:", error);
    
    if (error instanceof Error) {
      console.error("Error name:", error.name);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    
    // Re-throw to ensure the process exits with an error code
    throw error;
  }
}

/**
 * Helper function to get UTXOs from wallet
 */
async function getWalletUtxos(wallet: AppWallet): Promise<UTxO[]> {
  // Get wallet address
  const address = await wallet.getPaymentAddress();
  
  // Create a new provider with the same API key
  const provider = new BlockfrostProvider(BLOCKFROST_API_KEY);
  
  // Fetch UTXOs for address
  return await provider.fetchAddressUTxOs(address);
}

// Run the test and handle any errors
testDeployPellet()
  .then(txHash => {
    console.log("");
    console.log("====== TEST SUCCEEDED ======");
    console.log("Transaction hash:", txHash);
    console.log("View on Cardanoscan (preprod):", `https://preprod.cardanoscan.io/transaction/${txHash}`);
    process.exit(0);
  })
  .catch(error => {
    console.error("");
    console.error("====== TEST FAILED ======");
    console.error("Error:", error);
    process.exit(1);
  });
  
  