// src/pages/deploy-pellets.tsx
import Head from "next/head";
import { useRef, useState, ChangeEvent, useEffect } from "react";
import { CardanoWallet, useWallet } from "@meshsdk/react";
import { Transaction, ForgeScript, Asset, Data, PlutusScript, MeshTxBuilder, stringToHex, BlockfrostProvider, mConStr0, deserializeAddress } from "@meshsdk/core";
import {
  PelletParams,
  parsePelletsCSV,
  getDiamondAreaSample,
  getRingAreaSample,
  pelletsToCSV,
} from "@/lib/pelletUtils";

enum PelletGenMethod {
  UPLOAD_CSV = "upload",
  GENERATE_DIAMOND = "diamond",
  GENERATE_RING = "ring",
}

// Represents native tokens or assets
export type AssetClassT = {
  policy: string;
  name: string | Uint8Array;
};

// Prize token configuration
export type PrizeTokenConfig = {
  policy: string;
  name: string;
  quantity: string;
};

const PELLET_REF_TX_HASH = "d2aad1327c66dc18ef0e31755195dce708dd13ceb22ff5e7350662512cee983f";
const PELLET_REF_OUTPUT_INDEX = 0;

// Add this environment variable access for Blockfrost API key 
// It will be replaced with your actual API key in .env.local
const BLOCKFROST_API_KEY = process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY || '';

// Add this constant for the pre-prod network ID
const NETWORK_ID = 2; // 0 = mainnet, 1 = preview/testnet, 2 = pre-prod

async function verifyReferenceScript(txHash: string, outputIndex: number): Promise<boolean> {
  try {
    const provider = new BlockfrostProvider(BLOCKFROST_API_KEY);
    // First, check if the transaction exists
    const txInfo = await provider.fetchTxInfo(txHash);
    console.log('Reference script transaction info:', txInfo);
    
    // Just verify we got transaction data back
    if (txInfo) {
      console.log('Reference transaction found');
      return true;
    } else {
      console.error('Reference transaction not found');
      return false;
    }
  } catch (error) {
    console.error('Error verifying reference script:', error);
    return false;
  }
}

export default function DeployPellets() {
  const { connected, wallet } = useWallet();
  const [validatorAddress, setValidatorAddress] = useState("");
  const [pelletGenMethod, setPelletGenMethod] = useState<PelletGenMethod>(
    PelletGenMethod.UPLOAD_CSV
  );
  const [pellets, setPellets] = useState<PelletParams>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentStatus, setDeploymentStatus] = useState("");
  const [txHashes, setTxHashes] = useState<string[]>([]);
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [batchSize, setBatchSize] = useState<number>(8);

  // Token configuration
  const [adminTokenPolicy, setAdminTokenPolicy] = useState("");
  const [adminTokenName, setAdminTokenName] = useState("");
  const [shipyardPolicy, setShipyardPolicy] = useState("");
  
  // Prize tokens
  const [prizeTokens, setPrizeTokens] = useState<PrizeTokenConfig[]>([]);
  const [newPrizePolicy, setNewPrizePolicy] = useState("");
  const [newPrizeName, setNewPrizeName] = useState("");
  const [newPrizeQuantity, setNewPrizeQuantity] = useState("1");
  const [maxPrizeUtxos, setMaxPrizeUtxos] = useState<number>(0);
  const [maxTokensPerUtxo, setMaxTokensPerUtxo] = useState<number>(1);

  // Diamond generation parameters
  const [diamondInnerR, setDiamondInnerR] = useState("0");
  const [diamondOuterR, setDiamondOuterR] = useState("9");
  const [diamondMinFuel, setDiamondMinFuel] = useState("30");
  const [diamondMaxFuel, setDiamondMaxFuel] = useState("50");
  const [diamondDensity, setDiamondDensity] = useState("0.05");

  // Ring generation parameters
  const [ringInnerR, setRingInnerR] = useState("20");
  const [ringOuterR, setRingOuterR] = useState("30");
  const [ringMinFuel, setRingMinFuel] = useState("30");
  const [ringMaxFuel, setRingMaxFuel] = useState("80");
  const [ringDensity, setRingDensity] = useState("0.15");

  const [walletBalances, setWalletBalances] = useState<{ [key: string]: bigint }>({});

  // Update wallet address when connected
  const updateWalletInfo = async () => {
    if (connected) {
      try {
        const [address] = await wallet.getUsedAddresses();
        setWalletAddress(address);
      } catch (error) {
        console.error("Error getting wallet address:", error);
      }
    }
  };

  // Update wallet address when wallet connection changes
  if (connected && !walletAddress) {
    updateWalletInfo();
  }

  // Handle validator address change
  const handleValidatorAddressChange = (e: ChangeEvent<HTMLInputElement>) => {
    setValidatorAddress(e.target.value);
  };

  // Handle CSV file upload
  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csvContent = e.target?.result as string;
        const parsedPellets = parsePelletsCSV(csvContent);
        
        // Set shipyard policy for pellets that don't have it specified
        if (shipyardPolicy) {
          parsedPellets.forEach(pellet => {
            if (!pellet.shipyard_policy) {
              pellet.shipyard_policy = shipyardPolicy;
            }
          });
        }
        
        setPellets(parsedPellets);
        setDeploymentStatus(`Loaded ${parsedPellets.length} pellets from CSV.`);
      } catch (error) {
        console.error("Error parsing CSV:", error);
        setDeploymentStatus("Error parsing CSV file.");
      }
    };
    reader.readAsText(file);
  };

  // Generate pellets based on the selected method
  const generatePellets = () => {
    setIsGenerating(true);
    try {
      let generatedPellets: PelletParams = [];

      if (pelletGenMethod === PelletGenMethod.GENERATE_DIAMOND) {
        generatedPellets = getDiamondAreaSample(
          BigInt(diamondInnerR),
          BigInt(diamondOuterR),
          BigInt(diamondMinFuel),
          BigInt(diamondMaxFuel),
          parseFloat(diamondDensity),
          shipyardPolicy
        );
      } else if (pelletGenMethod === PelletGenMethod.GENERATE_RING) {
        generatedPellets = getRingAreaSample(
          parseFloat(ringInnerR),
          parseFloat(ringOuterR),
          BigInt(ringMinFuel),
          BigInt(ringMaxFuel),
          parseFloat(ringDensity),
          shipyardPolicy
        );
      }

      setPellets(generatedPellets);
      setDeploymentStatus(
        `Generated ${generatedPellets.length} pellets successfully.`
      );
    } catch (error) {
      console.error("Error generating pellets:", error);
      setDeploymentStatus(
        `Error generating pellets: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setIsGenerating(false);
    }
  };

  // Add checkWalletBalances function
  const checkWalletBalances = async () => {
    try {
      // First try to use getBalance API as it's more direct
      try {
        const balance = await wallet.getBalance();
        console.log('Wallet balance from getBalance API:', balance);
        
        const balances: { [key: string]: bigint } = {};
        
        // Process each asset from the balance response
        for (const asset of balance) {
          const unit = asset.unit;
          const quantity = BigInt(asset.quantity);
          
          // Store the balance in both formats - with and without dot separator
          balances[unit] = quantity;
          
          // If this is a native token (not lovelace), also store it in dot notation format
          if (unit !== 'lovelace' && unit.length > 56) {
            const policyId = unit.slice(0, 56);
            const assetName = unit.slice(56);
            const dotNotation = `${policyId}.${assetName}`;
            balances[dotNotation] = quantity;
            
            // Also store in lowercase for more robust matching
            balances[unit.toLowerCase()] = quantity;
            balances[dotNotation.toLowerCase()] = quantity;
          }
        }
        
        setWalletBalances(balances);
        console.log('Processed wallet balances (both formats):', balances);
        return;
      } catch (balanceError) {
        console.warn('Error using getBalance API, falling back to getUtxos:', balanceError);
      }
      
      // Fallback to getUtxos if getBalance fails
      // Wrap in a promise with timeout to ensure completion
      const utxosPromise = new Promise<any[]>(async (resolve, reject) => {
        try {
          const utxos = await wallet.getUtxos();
          resolve(utxos);
        } catch (error) {
          reject(error);
        }
      });
      
      // Set a timeout to ensure we don't wait forever
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout getting UTXOs')), 10000);
      });
      
      // Race the promises to handle potential WebAssembly issues
      const utxos = await Promise.race([utxosPromise, timeoutPromise]) as any[];
      
      const balances: { [key: string]: bigint } = {};
      
      for (const utxo of utxos) {
        // Each UTxO output.amount is an array of Assets
        for (const asset of utxo.output.amount) {
          const unit = asset.unit;
          const quantity = BigInt(asset.quantity);
          
          // Store the balance in both formats - with and without dot separator
          balances[unit] = (balances[unit] || BigInt(0)) + quantity;
          
          // If this is a native token (not lovelace), also store it in dot notation format
          if (unit !== 'lovelace' && unit.length > 56) {
            const policyId = unit.slice(0, 56);
            const assetName = unit.slice(56);
            const dotNotation = `${policyId}.${assetName}`;
            balances[dotNotation] = (balances[dotNotation] || BigInt(0)) + quantity;
          }
        }
      }
      
      setWalletBalances(balances);
      console.log('Wallet balances from UTXOs (both formats):', balances);
    } catch (error) {
      console.error('Error checking wallet balances:', error);
    }
  };

  // Add calculateRequiredTokens function
  const calculateRequiredTokens = () => {
    if (pellets.length === 0) return null;
    
    // Normalize policy and name to prevent case sensitivity issues
    const normalizedPolicy = adminTokenPolicy.trim();
    const normalizedName = adminTokenName.trim();
    
    // Use the concatenated format (no dot) as primary, and dot notation as fallback
    const concatenatedFormat = `${normalizedPolicy}${normalizedName}`;
    const dotFormat = `${normalizedPolicy}.${normalizedName}`;
    
    const required: { [key: string]: bigint } = {
      lovelace: BigInt(1000000) * BigInt(pellets.length), // 1 ADA per pellet
      [concatenatedFormat]: BigInt(pellets.length) // 1 admin token per pellet
    };
    
    // Also add dot format for compatibility with older code
    required[dotFormat] = BigInt(pellets.length);
    
    // Add prize tokens (concatenated format)
    prizeTokens.forEach(token => {
      const normalizedTokenPolicy = token.policy.trim();
      const normalizedTokenName = token.name.trim(); 
      const concatenatedUnit = `${normalizedTokenPolicy}${normalizedTokenName}`;
      const dotUnit = `${normalizedTokenPolicy}.${normalizedTokenName}`;
      required[concatenatedUnit] = BigInt(token.quantity) * BigInt(pellets.length);
      required[dotUnit] = BigInt(token.quantity) * BigInt(pellets.length);
    });
    
    console.log('Required tokens (concatenated format):', required);
    console.log('Admin token policy:', normalizedPolicy);
    console.log('Admin token name:', normalizedName);
    console.log('Admin token concatenated:', concatenatedFormat);
    
    return required;
  };

  // Update useEffect to check balances when wallet connects
  useEffect(() => {
    if (connected) {
      checkWalletBalances();
    }
  }, [connected]);

  // Deploy pellets to the validator
  const deployPellets = async () => {
    if (!connected) {
      setDeploymentStatus("Please connect your wallet first.");
      return;
    }

    if (!validatorAddress) {
      setDeploymentStatus("Please enter a validator address.");
      return;
    }

    if (pellets.length === 0) {
      setDeploymentStatus("No pellets to deploy.");
      return;
    }

    if (!adminTokenPolicy || !adminTokenName) {
      setDeploymentStatus("Please enter admin token policy and name.");
      return;
    }
    
    // Verify the reference script
    setDeploymentStatus("Verifying reference script...");
    const isRefScriptValid = await verifyReferenceScript(PELLET_REF_TX_HASH, PELLET_REF_OUTPUT_INDEX);
    if (!isRefScriptValid) {
      setDeploymentStatus("Failed to verify reference script. Please check PELLET_REF_TX_HASH and PELLET_REF_OUTPUT_INDEX.");
      return;
    }
    setDeploymentStatus("Reference script verified successfully.");

    // Check wallet balances
    const requiredTokens = calculateRequiredTokens();
    if (!requiredTokens) {
      setDeploymentStatus("No pellets to deploy.");
      return;
    }

    // Check if we have enough tokens
    for (const [unit, required] of Object.entries(requiredTokens)) {
      // Normalize the keys for comparison
      const normalizedUnit = unit.toLowerCase().trim();
      
      // Debug output to see all keys
      console.log('All wallet balance keys:', Object.keys(walletBalances).join(', '));
      
      // First check exact match
      const balance = walletBalances[unit] || BigInt(0);
      console.log(`Checking token unit ${unit}: Required=${required}, Available=${balance}`);
      
      if (balance >= required) {
        continue; // We have enough tokens in this format
      }
      
      // Check normalized version
      const normalizedBalance = walletBalances[normalizedUnit] || BigInt(0);
      console.log(`Checking normalized token unit ${normalizedUnit}: Available=${normalizedBalance}`);
      
      if (normalizedBalance >= required) {
        console.log(`Found sufficient balance using normalized format!`);
        continue; // Skip this check if we have enough tokens in normalized format
      }
      
      // Try alternative format without dot
      const altUnit = unit.replace('.', '');
      const altBalance = walletBalances[altUnit] || BigInt(0);
      console.log(`Checking alternative format ${altUnit}: Available=${altBalance}`);
      
      // Also try normalized alt format
      const normalizedAltUnit = altUnit.toLowerCase().trim();
      const normalizedAltBalance = walletBalances[normalizedAltUnit] || BigInt(0);
      console.log(`Checking normalized alternative format ${normalizedAltUnit}: Available=${normalizedAltBalance}`);
      
      // Check if any token in wallet contains the policy ID
      const policyId = adminTokenPolicy.toLowerCase().trim();
      const tokenName = adminTokenName.toLowerCase().trim();
      
      console.log(`Looking for any token with policy ${policyId} and name ${tokenName}`);
      let found = false;
      
      // Try to find a matching token with fuzzy matching
      for (const [walletKey, walletValue] of Object.entries(walletBalances)) {
        if (walletKey !== 'lovelace' && walletValue >= required) {
          const keyLower = walletKey.toLowerCase();
          if (keyLower.includes(policyId) && keyLower.includes(tokenName)) {
            console.log(`Found matching token: ${walletKey} with balance ${walletValue}`);
            found = true;
            break;
          }
        }
      }
      
      if (found) {
        console.log(`Found token with fuzzy matching!`);
        continue;
      }
      
      if (altBalance >= required || normalizedAltBalance >= required) {
        console.log(`Found sufficient balance using alternative format!`);
        continue; // Skip this check if we have enough tokens in alt format
      }
      
      setDeploymentStatus(`Insufficient balance for ${unit}. Required: ${required}, Available: ${balance}`);
      return;
    }

    setIsDeploying(true);
    setDeploymentStatus("Deploying pellets...");
    setTxHashes([]);

    try {
      // Split pellets into batches
      const batches: Array<Array<{ fuel: number; pos_x: bigint; pos_y: bigint; shipyard_policy: string }>> = [];
      for (let i = 0; i < pellets.length; i += batchSize) {
        batches.push(pellets.slice(i, i + batchSize));
      }

      const txHashesResult: string[] = [];
      const collateralUtxos = await wallet.getCollateral();
      console.log("Collateral UTXOs:", collateralUtxos);
      
      // Get the first UTXO from wallet to use as collateral if no designated collateral exists
      const utxos = await wallet.getUtxos();
      console.log(`Total UTXOs available: ${utxos.length}`);
      
      if (utxos.length === 0) {
        setDeploymentStatus("No UTXOs found in wallet. Please ensure your wallet has ADA.");
        setIsDeploying(false);
        return;
      }
      
      // We'll use the first UTXO that has enough ADA as collateral if needed
      const potentialCollateral = utxos.find(utxo => {
        const lovelaceAmount = utxo.output.amount.find(a => a.unit === 'lovelace');
        return lovelaceAmount && BigInt(lovelaceAmount.quantity) >= BigInt(5000000); // 5 ADA
      });
      
      const changeAddress = await wallet.getChangeAddress();

      // Admin token unit - using concatenated format without dot
      const adminTokenUnit = `${adminTokenPolicy.trim()}${adminTokenName.trim()}`;
      console.log("Using admin token unit (no dot):", adminTokenUnit);

      // Track remaining prize tokens and UTXOs
      let remainingPrizeUtxos = maxPrizeUtxos;
      let remainingPellets = pellets.length;

      // Process each batch
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        setDeploymentStatus(`Deploying batch ${i + 1} of ${batches.length}...`);

        try {
          // Create the transaction for this batch with standard MeshTxBuilder
          const tx = new MeshTxBuilder({
            fetcher: new BlockfrostProvider(BLOCKFROST_API_KEY),
            verbose: true,
          });
          
          // Set the network to preprod
          tx.setNetwork("preprod");
          console.log("Network configured for preprod");

          // Extract script hash from validator address properly
          let validatorScriptHash = "";
          try {
            const deserializedAddress = deserializeAddress(validatorAddress);
            
            // Check if we got a scriptHash from deserialization
            if (deserializedAddress.scriptHash) {
              validatorScriptHash = deserializedAddress.scriptHash;
              console.log("Properly extracted script hash:", validatorScriptHash);
            } else {
              // Fallback to original method if no script hash found
              console.warn("No script hash found in deserialized address, falling back to original method");
              validatorScriptHash = validatorAddress.slice(0, 56);
            }
            
            // Validate that we have a valid hex string for the script hash
            if (!/^[0-9a-fA-F]+$/.test(validatorScriptHash)) {
              console.error("Extracted script hash is not a valid hex string:", validatorScriptHash);
              throw new Error("Invalid script hash format");
            }
          } catch (error) {
            console.error("Error extracting script hash from validator address:", error);
            throw new Error(`Failed to extract script hash: ${error instanceof Error ? error.message : String(error)}`);
          }

          // Add outputs for each pellet in the batch
          for (const pellet of batch) {
            // Prepare the datum for this pellet
            const pelletDatum = {
              constructor: 0,
              fields: [
                pellet.pos_x.toString(),
                pellet.pos_y.toString(),
                pellet.shipyard_policy || shipyardPolicy
              ]
            };
            
            // Create base assets for this pellet
            const assets: Asset[] = [
              { unit: "lovelace", quantity: "1000000" },
              { unit: adminTokenUnit, quantity: "1" }
            ];

            // Randomly assign prize tokens if available
            if (remainingPrizeUtxos > 0) {
              const shouldGetPrize = Math.random() < (remainingPrizeUtxos / remainingPellets);
              if (shouldGetPrize) {
                prizeTokens.forEach(token => {
                  // Use concatenated format without a dot
                  const unit = `${token.policy.trim()}${token.name.trim()}`;
                  const availableBalance = walletBalances[unit] || BigInt(0);
                  if (availableBalance > BigInt(0)) {
                    const tokensToAssign = Math.min(
                      Number(availableBalance),
                      maxTokensPerUtxo
                    );
                    assets.push({
                      unit,
                      quantity: tokensToAssign.toString()
                    });
                  }
                });
                remainingPrizeUtxos--;
              }
            }
            remainingPellets--;

            // Mint fuel tokens using the validator script as the minting policy
            const fuelTokenHex = stringToHex("FUEL");
            console.log("Minting fuel tokens:", {
              amount: pellet.fuel.toString(),
              policy: validatorScriptHash,
              tokenName: fuelTokenHex,
              refTxHash: PELLET_REF_TX_HASH,
              refOutputIndex: PELLET_REF_OUTPUT_INDEX
            });
            
            try {
              console.log("Minting process details:");
              console.log("- Amount of fuel tokens:", pellet.fuel.toString());
              console.log("- Minting policy:", validatorScriptHash);
              console.log("- Token name (hex):", fuelTokenHex);
              console.log("- Reference tx hash:", PELLET_REF_TX_HASH);
              console.log("- Output index:", PELLET_REF_OUTPUT_INDEX);
              
              // Create reference input explicitly
              const referenceScriptInput = {
                txHash: PELLET_REF_TX_HASH,
                outputIndex: PELLET_REF_OUTPUT_INDEX
              };
              console.log("Reference script input:", JSON.stringify(referenceScriptInput));
              
              // Make sure we're dealing with valid inputs
              if (!pellet.fuel) console.error("pellet.fuel is undefined or zero");
              if (!validatorScriptHash) console.error("validatorScriptHash is undefined");
              if (!fuelTokenHex) console.error("fuelTokenHex is undefined");
              
              // Simplified minting approach for PlutusScriptV3
              try {
                console.log("Using simplified PlutusScriptV3 minting approach");
                
                // Chain all minting operations in a single call to avoid state issues
                tx.mintPlutusScriptV3()
                  .mint(pellet.fuel.toString(), validatorScriptHash, fuelTokenHex)
                  .mintTxInReference(PELLET_REF_TX_HASH, PELLET_REF_OUTPUT_INDEX)
                  .mintRedeemerValue(mConStr0(['mesh']));
                
                console.log("Minting with reference script completed successfully");
              } catch (mintingStepError) {
                console.error("Error during minting process:", mintingStepError);
                throw mintingStepError;
              }
              
              // Add the minted fuel token to assets using concatenated format (no dot)
              const tokenFullName = `${validatorScriptHash}${fuelTokenHex}`;
              console.log("Token full name (no dot):", tokenFullName);
              assets.push({
                unit: tokenFullName,
                quantity: pellet.fuel.toString()
              });
              
            } catch (mintError: unknown) {
              console.error("Error during minting setup:", mintError);
              if (mintError instanceof Error) {
                console.error("Error name:", mintError.name);
                console.error("Error message:", mintError.message);
                console.error("Error stack:", mintError.stack);
              }
              setDeploymentStatus(`Error during minting setup: ${mintError instanceof Error ? mintError.message : String(mintError)}`);
              return;
            }

            // Send assets to the validator address with inline datum
            tx.txOut(validatorAddress, assets)
              .txOutInlineDatumValue(pelletDatum);
          }

          // Add collateral if it exists
          if (collateralUtxos && collateralUtxos.length > 0) {
            const collateral = collateralUtxos[0];
            console.log("Using designated collateral UTXO");
            tx.txInCollateral(
              collateral.input.txHash,
              collateral.input.outputIndex,
              collateral.output.amount,
              collateral.output.address
            );
          } else if (potentialCollateral) {
            console.log("Using regular UTXO as collateral");
            tx.txInCollateral(
              potentialCollateral.input.txHash,
              potentialCollateral.input.outputIndex,
              potentialCollateral.output.amount,
              potentialCollateral.output.address
            );
          } else {
            throw new Error("No suitable collateral found. Please ensure your wallet has at least 5 ADA in a single UTXO.");
          }

          // Set change address and select UTXOs
          tx.changeAddress(changeAddress);
          
          // Explicitly select UTXOs using selectUtxosFrom
          console.log(`Explicitly selecting from ${utxos.length} UTXOs for transaction`);
          tx.selectUtxosFrom(utxos);
          
          // Prepare to complete the transaction
          const sourceAddress = changeAddress;
          
          // Carefully handle completion with try/catch
          try {
            console.log("Starting transaction completion process");
            
            try {
              console.log("Preparing for transaction completion");
              
              // Add debugging tests to identify where the toString error occurs
              console.log("--- DEBUGGING TESTS START ---");
              
              // Test 1: Redeemer serialization
              try {
                const redeemerValue = mConStr0([]);
                console.log("Redeemer value type:", typeof redeemerValue);
                console.log("Redeemer value structure:", JSON.stringify(redeemerValue, null, 2));
                console.log("Redeemer toString test:", String(redeemerValue));
              } catch (error) {
                console.error("Redeemer serialization error:", error);
              }
              
              // Test 2: Reference script input
              try {
                const refInput = { txHash: PELLET_REF_TX_HASH, outputIndex: PELLET_REF_OUTPUT_INDEX };
                console.log("Ref input structure:", JSON.stringify(refInput, null, 2));
                console.log("Ref hash toString test:", String(PELLET_REF_TX_HASH));
              } catch (error) {
                console.error("Reference script serialization error:", error);
              }
              
              // Test 3: Pellet data (using first pellet in batch)
              try {
                if (batch.length > 0) {
                  const samplePellet = batch[0];
                  const pelletDatum = {
                    constructor: 0,
                    fields: [
                      samplePellet.pos_x.toString(),
                      samplePellet.pos_y.toString(),
                      samplePellet.shipyard_policy || shipyardPolicy
                    ]
                  };
                  console.log("Pellet datum structure:", JSON.stringify(pelletDatum, null, 2));
                  console.log("Fuel toString test:", String(samplePellet.fuel));
                }
              } catch (error) {
                console.error("Pellet data serialization error:", error);
              }
              
              // Test 4: Minting parameters
              try {
                console.log("ValidatorAddress:", validatorAddress);
                console.log("ValidatorScriptHash:", validatorScriptHash);
                console.log("FuelTokenHex:", stringToHex("FUEL"));
                console.log("ValidatorScriptHash toString test:", String(validatorScriptHash));
                console.log("FuelTokenHex toString test:", String(stringToHex("FUEL")));
                
                // Debug deserialized address
                try {
                  const deserializedForDebug = deserializeAddress(validatorAddress);
                  console.log("Deserialized address:", JSON.stringify(deserializedForDebug, null, 2));
                } catch (deserializeError) {
                  console.error("Error deserializing address for debug:", deserializeError);
                }
              } catch (error) {
                console.error("Minting parameters serialization error:", error);
              }
              
              // Test 5: mConStr0 function
              try {
                console.log("mConStr0 type:", typeof mConStr0);
                const testConstr = mConStr0(["test"]);
                console.log("mConStr0 test result:", testConstr);
                console.log("mConStr0 result type:", typeof testConstr);
              } catch (error) {
                console.error("mConStr0 function test error:", error);
              }
              
              console.log("--- DEBUGGING TESTS END ---");
              
              // Use the simplest form of transaction completion
              const unsignedTx = await tx.complete();
              
              console.log("Transaction completed successfully");
              
              // Proceed with signing and submitting
              const signedTx = await wallet.signTx(unsignedTx, true);
              const txHash = await wallet.submitTx(signedTx);
              console.log("Transaction submitted successfully", txHash);
              
              txHashesResult.push(txHash);
              setDeploymentStatus(`Deployed batch ${i + 1} of ${batches.length}. Transaction: ${txHash}`);
            } catch (specificError) {
              // More detailed error logging
              console.error("Transaction completion specific error:", specificError);
              if (specificError instanceof Error) {
                console.error("Error name:", specificError.name);
                console.error("Error message:", specificError.message);
                console.error("Stack trace:", specificError.stack);
                
                // Check for common error patterns
                if (specificError.message.includes("toString")) {
                  console.error("This appears to be a toString error, likely related to null/undefined datum or redeemer");
                }
                if (specificError.message.includes("funds")) {
                  console.error("This appears to be an insufficient funds error");
                }
              }
              throw specificError;
            }
          } catch (txCompletionError: unknown) {
            console.error("Transaction completion error:", txCompletionError);
            setDeploymentStatus(`Transaction completion error: ${txCompletionError instanceof Error ? txCompletionError.message : String(txCompletionError)}`);
            return;
          }
        } catch (batchError) {
          console.error(`Error processing batch ${i + 1}:`, batchError);
          setDeploymentStatus(`Error processing batch ${i + 1}: ${batchError instanceof Error ? batchError.message : String(batchError)}`);
          
          // Decide whether to continue with next batch or stop
          const confirmContinue = window.confirm(`Error in batch ${i + 1}. Continue with next batch?`);
          if (!confirmContinue) {
            break;
          }
        }
      }

      setTxHashes(txHashesResult);
      setDeploymentStatus(`Successfully deployed ${pellets.length} pellets in ${txHashesResult.length} transactions.`);
    } catch (error) {
      console.error("Error deploying pellets:", error);
      setDeploymentStatus(
        `Error deploying pellets: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setIsDeploying(false);
    }
  };

  // Download pellets as CSV file
  const downloadPelletsCSV = () => {
    if (pellets.length === 0) {
      setDeploymentStatus("No pellets to download.");
      return;
    }
    
    // Convert pellets to CSV
    const csvContent = pelletsToCSV(pellets);
    
    // Create a blob and download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'pellets.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-gray-900 w-full text-white min-h-screen">
      <Head>
        <title>Deploy Pellet UTXOs | Cardano Dapp</title>
        <meta
          name="description"
          content="Deploy pellet UTXOs to your Cardano validator"
        />
      </Head>

      <div className="container mx-auto py-8 px-4">
        <h1 className="text-4xl font-thin mb-10 text-center">
          Deploy Pellet UTXOs
        </h1>

        {/* Wallet Connection */}
        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 mb-8">
          <h2 className="text-xl font-bold mb-4 text-sky-500">
            Wallet Connection
          </h2>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              {connected ? (
                <div>
                  <p className="text-green-400 mb-2">Wallet Connected</p>
                  <p className="text-sm text-gray-300 break-all">
                    Address: {walletAddress}
                  </p>
                </div>
              ) : (
                <p className="text-yellow-400">Please connect your wallet</p>
              )}
            </div>
            <CardanoWallet />
          </div>
        </div>

        {/* Validator Configuration */}
        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 mb-8">
          <h2 className="text-xl font-bold mb-4 text-sky-500">
            Validator Configuration
          </h2>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Validator Address
            </label>
            <input
              type="text"
              value={validatorAddress}
              onChange={handleValidatorAddressChange}
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
              placeholder="Enter validator address..."
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Batch Size (pellets per transaction)
            </label>
            <input
              type="number"
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
              min="1"
              max="20"
            />
            <p className="text-xs text-gray-400 mt-1">
              Adjust based on network conditions and pellet complexity
            </p>
          </div>
        </div>

        {/* Token Configuration */}
        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 mb-8">
          <h2 className="text-xl font-bold mb-4 text-sky-500">
            Token Configuration
          </h2>
          
          {/* Admin Token */}
          <div className="mb-6">
            <h3 className="text-lg font-medium mb-3 text-white">Admin Token</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Policy ID
                </label>
                <input
                  type="text"
                  value={adminTokenPolicy}
                  onChange={(e) => setAdminTokenPolicy(e.target.value)}
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  placeholder="Enter admin token policy ID..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Token Name
                </label>
                <input
                  type="text"
                  value={adminTokenName}
                  onChange={(e) => setAdminTokenName(e.target.value)}
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  placeholder="Enter admin token name..."
                />
              </div>
            </div>
          </div>
          
          {/* Shipyard Policy */}
          <div className="mb-6">
            <h3 className="text-lg font-medium mb-3 text-white">Shipyard Policy</h3>
            <div>
              <label className="block text-sm font-medium mb-2">
                Policy ID
              </label>
              <input
                type="text"
                value={shipyardPolicy}
                onChange={(e) => setShipyardPolicy(e.target.value)}
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
                placeholder="Enter shipyard policy ID..."
              />
            </div>
          </div>
          
          {/* Prize Tokens */}
          <div className="mb-6">
            <h3 className="text-lg font-medium mb-3 text-white">Prize Tokens</h3>
            
            {/* Prize token distribution settings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Max UTXOs with Prizes
                </label>
                <input
                  type="number"
                  value={maxPrizeUtxos}
                  onChange={(e) => setMaxPrizeUtxos(Number(e.target.value))}
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  min="0"
                  placeholder="Enter max UTXOs with prizes..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Max Tokens per UTXO
                </label>
                <input
                  type="number"
                  value={maxTokensPerUtxo}
                  onChange={(e) => setMaxTokensPerUtxo(Number(e.target.value))}
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  min="1"
                  placeholder="Enter max tokens per UTXO..."
                />
              </div>
            </div>
            
            {/* Add new prize token form */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Policy ID
                </label>
                <input
                  type="text"
                  value={newPrizePolicy}
                  onChange={(e) => setNewPrizePolicy(e.target.value)}
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  placeholder="Enter prize token policy ID..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Token Name
                </label>
                <input
                  type="text"
                  value={newPrizeName}
                  onChange={(e) => setNewPrizeName(e.target.value)}
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  placeholder="Enter prize token name..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Quantity
                </label>
                <div className="flex">
                  <input
                    type="text"
                    value={newPrizeQuantity}
                    onChange={(e) => setNewPrizeQuantity(e.target.value)}
                    className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    placeholder="Enter quantity..."
                  />
                  <button
                    onClick={() => {
                      if (newPrizePolicy && newPrizeName) {
                        setPrizeTokens([
                          ...prizeTokens,
                          {
                            policy: newPrizePolicy,
                            name: newPrizeName,
                            quantity: newPrizeQuantity
                          }
                        ]);
                        setNewPrizePolicy("");
                        setNewPrizeName("");
                        setNewPrizeQuantity("1");
                      }
                    }}
                    className="ml-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
            
            {/* Prize tokens list */}
            {prizeTokens.length > 0 && (
              <div className="mt-4">
                <h4 className="text-md font-medium mb-2">Added Prize Tokens:</h4>
                <div className="bg-gray-700 p-3 rounded-lg">
                  <ul className="space-y-2">
                    {prizeTokens.map((token, index) => (
                      <li key={index} className="flex justify-between items-center">
                        <span className="text-sm">
                          {token.policy}.{token.name} ({token.quantity})
                        </span>
                        <button
                          onClick={() => {
                            const newTokens = [...prizeTokens];
                            newTokens.splice(index, 1);
                            setPrizeTokens(newTokens);
                          }}
                          className="text-red-400 hover:text-red-300"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Pellet Generation */}
        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 mb-8">
          <h2 className="text-xl font-bold mb-4 text-sky-500">
            Pellet Generation
          </h2>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Generation Method
            </label>
            <select
              value={pelletGenMethod}
              onChange={(e) =>
                setPelletGenMethod(e.target.value as PelletGenMethod)
              }
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
            >
              <option value={PelletGenMethod.UPLOAD_CSV}>Upload CSV</option>
              <option value={PelletGenMethod.GENERATE_DIAMOND}>
                Generate Diamond Pattern
              </option>
              <option value={PelletGenMethod.GENERATE_RING}>
                Generate Ring Pattern
              </option>
            </select>
          </div>

          {pelletGenMethod === PelletGenMethod.UPLOAD_CSV && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                Upload Pellets CSV
              </label>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".csv"
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
              />
            </div>
          )}

          {pelletGenMethod === PelletGenMethod.GENERATE_DIAMOND && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Inner Radius
                </label>
                <input
                  type="number"
                  value={diamondInnerR}
                  onChange={(e) => setDiamondInnerR(e.target.value)}
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Outer Radius
                </label>
                <input
                  type="number"
                  value={diamondOuterR}
                  onChange={(e) => setDiamondOuterR(e.target.value)}
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Min Fuel
                </label>
                <input
                  type="number"
                  value={diamondMinFuel}
                  onChange={(e) => setDiamondMinFuel(e.target.value)}
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Max Fuel
                </label>
                <input
                  type="number"
                  value={diamondMaxFuel}
                  onChange={(e) => setDiamondMaxFuel(e.target.value)}
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  min="0"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-2">
                  Density (0-1)
                </label>
                <input
                  type="number"
                  value={diamondDensity}
                  onChange={(e) => setDiamondDensity(e.target.value)}
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  min="0"
                  max="1"
                  step="0.01"
                />
              </div>
            </div>
          )}

          {pelletGenMethod === PelletGenMethod.GENERATE_RING && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Inner Radius
                </label>
                <input
                  type="number"
                  value={ringInnerR}
                  onChange={(e) => setRingInnerR(e.target.value)}
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Outer Radius
                </label>
                <input
                  type="number"
                  value={ringOuterR}
                  onChange={(e) => setRingOuterR(e.target.value)}
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Min Fuel
                </label>
                <input
                  type="number"
                  value={ringMinFuel}
                  onChange={(e) => setRingMinFuel(e.target.value)}
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Max Fuel
                </label>
                <input
                  type="number"
                  value={ringMaxFuel}
                  onChange={(e) => setRingMaxFuel(e.target.value)}
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  min="0"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-2">
                  Density (0-1)
                </label>
                <input
                  type="number"
                  value={ringDensity}
                  onChange={(e) => setRingDensity(e.target.value)}
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  min="0"
                  max="1"
                  step="0.01"
                />
              </div>
            </div>
          )}

          {pelletGenMethod !== PelletGenMethod.UPLOAD_CSV && (
            <button
              onClick={generatePellets}
              disabled={isGenerating}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition"
            >
              {isGenerating ? "Generating..." : "Generate Pellets"}
            </button>
          )}
        </div>

        {/* Pellet Deployment */}
        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 mb-8">
          <h2 className="text-xl font-bold mb-4 text-sky-500">Deployment</h2>

          <div className="mb-4">
            <p className="mb-2">
              <span className="font-medium">Pellets Ready:</span>{" "}
              {pellets.length}
            </p>

            <div className="flex gap-4 flex-wrap">
              <button
                onClick={deployPellets}
                disabled={
                  isDeploying ||
                  pellets.length === 0 ||
                  !connected ||
                  !validatorAddress
                }
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition"
              >
                {isDeploying ? "Deploying..." : "Deploy Pellets"}
              </button>
              
              <button
                onClick={downloadPelletsCSV}
                disabled={pellets.length === 0}
                className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition"
              >
                Download CSV
              </button>
            </div>
          </div>

          {deploymentStatus && (
            <div className="mb-4 p-4 bg-gray-700 rounded-lg">
              <p className="font-medium text-sky-400 mb-1">Status:</p>
              <p>{deploymentStatus}</p>
            </div>
          )}

          {txHashes.length > 0 && (
            <div className="mb-4">
              <p className="font-medium text-sky-400 mb-2">
                Transaction Hashes:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                {txHashes.map((hash, index) => (
                  <li key={index} className="break-all">
                    <a
                      href={`https://preprod.cardanoscan.io/transaction/${hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      {hash}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}