// src/pages/deploy-pellets.tsx
import Head from "next/head";
import { useRef, useState, ChangeEvent, useEffect } from "react";
import { CardanoWallet, useWallet } from "@meshsdk/react";
import { Transaction, ForgeScript, Asset, Data, PlutusScript, MeshTxBuilder, stringToHex, BlockfrostProvider } from "@meshsdk/core";
import { CustomMeshTxBuilder } from "@/lib/CustomMeshTxBuilder";
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
    
    const required: { [key: string]: bigint } = {
      lovelace: BigInt(2000000) * BigInt(pellets.length), // 2 ADA per pellet
      [`${normalizedPolicy}.${normalizedName}`]: BigInt(pellets.length) // 1 admin token per pellet
    };
    
    // Add prize tokens
    prizeTokens.forEach(token => {
      const normalizedTokenPolicy = token.policy.trim();
      const normalizedTokenName = token.name.trim(); 
      const unit = `${normalizedTokenPolicy}.${normalizedTokenName}`;
      required[unit] = BigInt(token.quantity) * BigInt(pellets.length);
    });
    
    console.log('Required tokens with dot notation:', required);
    console.log('Admin token policy:', normalizedPolicy);
    console.log('Admin token name:', normalizedName);
    
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
      const collateral = (await wallet.getCollateral())[0];
      const changeAddress = await wallet.getChangeAddress();
      const utxos = await wallet.getUtxos();

      // Admin token unit
      const adminTokenUnit = `${adminTokenPolicy.trim()}.${adminTokenName.trim()}`;

      // Track remaining prize tokens and UTXOs
      let remainingPrizeUtxos = maxPrizeUtxos;
      let remainingPellets = pellets.length;

      // Process each batch
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        setDeploymentStatus(`Deploying batch ${i + 1} of ${batches.length}...`);

        try {
          // Create the transaction for this batch with our custom builder
          const tx = new CustomMeshTxBuilder({
            // No need to specify the Blockfrost provider here, our CustomMeshTxBuilder handles it
          });

          // Extract policy ID from validator address
          const validatorScriptHash = validatorAddress.slice(0, 56);

          // Add outputs for each pellet in the batch
          for (const pellet of batch) {
            // Prepare the datum for this pellet
            const pelletDatum = {
              alternative: 0,
              fields: [
                pellet.pos_x.toString(),
                pellet.pos_y.toString(),
                pellet.shipyard_policy || shipyardPolicy
              ]
            };
            
            // Create base assets for this pellet
            const assets: Asset[] = [
              { unit: "lovelace", quantity: "2000000" },
              { unit: adminTokenUnit, quantity: "1" }
            ];

            // Randomly assign prize tokens if available
            if (remainingPrizeUtxos > 0) {
              const shouldGetPrize = Math.random() < (remainingPrizeUtxos / remainingPellets);
              if (shouldGetPrize) {
                prizeTokens.forEach(token => {
                  const unit = `${token.policy}.${token.name}`;
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
            tx.mintPlutusScriptV2()
              .mint(pellet.fuel.toString(), validatorScriptHash, fuelTokenHex)
              .mintTxInReference(PELLET_REF_TX_HASH, PELLET_REF_OUTPUT_INDEX)
              .mintRedeemerValue({
                alternative: 0, // MintFuel constructor
                fields: []
              }, "JSON");

            // Add the minted fuel token to assets
            assets.push({
              unit: `${validatorScriptHash}.${fuelTokenHex}`,
              quantity: pellet.fuel.toString()
            });
            
            // Send assets to the validator address with inline datum
            tx.txOut(validatorAddress, assets)
              .txOutInlineDatumValue(pelletDatum);
          }

          // Add collateral
          tx.txInCollateral(
            collateral.input.txHash,
            collateral.input.outputIndex,
            collateral.output.amount,
            collateral.output.address
          );

          // Set change address and select UTXOs
          tx.changeAddress(changeAddress)
            .selectUtxosFrom(utxos);

          // Complete and submit the transaction
          const unsignedTx = await tx.complete();
          const signedTx = await wallet.signTx(unsignedTx, true); // true to sign with collateral
          const txHash = await wallet.submitTx(signedTx);

          txHashesResult.push(txHash);
          setDeploymentStatus(`Deployed batch ${i + 1} of ${batches.length}. Transaction: ${txHash}`);
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